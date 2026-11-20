#!/usr/bin/env python3
"""Mortal 决策的梯度归因（Integrated Gradients）。

问题：「在这个局面下，Mortal 为什么选 A 而不是 B？」
做法：把局面编码成 Mortal v4 的输入（1012 × 34），对 Q(A) − Q(B) 求积分梯度，
     再把每个输入元素的贡献按含义归到十几个组里（手牌、宝牌、点数、各家牌河、单人期望值表……）。

  * Q(A) − Q(B) 只取决于优势头 A(s,a)，局面价值 V(s) 和均值项会抵消，所以这个差值本身就是「选 A 比选 B 好多少」。
  * 积分梯度的基线是「空白局面、四家各 25,000 点」；各组贡献之和 = Δ(当前局面) − Δ(基线)，误差由步数决定。
  * 只根据该座位能看到的信息：他家的配牌和摸牌在送进 libriichi 之前会被替换成 "?"。

作为子进程运行（由 tools/mortal_bridge.py 启动），每行读一个 JSON 请求、回一个 JSON 结果：
    {"events": [...mjai 事件...], "player_id": 0, "a": 动作编号或省略, "b": 动作编号或省略, "steps": 32}
也可以 import 后直接调用 Explainer.explain()。
"""
import argparse
import json
import os
import sys
import time
import warnings

V4_CHANNELS = 1012

# ------------------------------------------------------------------ 通道分组（对照 libriichi/src/state/obs_repr.rs，v4）
# 组名是英文键，界面上再翻译。p1 = 下家，p2 = 对家，p3 = 上家（相对座位）。
GROUP_KEYS = [
    'hand',     # 手牌（含赤五）
    'dora',     # 宝牌指示牌、各家持有的宝牌数、未见宝牌数
    'score',    # 四家点数、当前顺位
    'round',    # 场次、本场、供托、场风/自风、余牌
    'self',     # 自己的牌河、副露、暗杠
    'p1', 'p2', 'p3',  # 他家的牌河（含手切/立直宣言牌）、副露、暗杠、最后手切牌、立直状态
    'seen',     # 每种牌已经见到几张
    'status',   # 听牌待牌、振听、向听数、自己是否已立直
    'actions',  # 当前可选的操作（能吃/碰/杠/和、可打的牌、保持/前进向听的打法）
    'ukeire',   # 单人表：每种打法的有效进张
    'tenpai',   # 单人表：每种打法未来各巡的听牌率
    'win',      # 单人表：每种打法未来各巡的和牌率
    'ev',       # 单人表：每种打法的期望打点 + 最大期望打点
]


def v4_channel_groups():
    """返回长度 1012 的列表：每个通道属于哪个组。"""
    g = []

    def add(key, n):
        g.extend([key] * n)

    add('hand', 4 + 3)              # 手牌张数（4 层）+ 手里的赤五万/筒/索
    add('score', 4 * 2 + 4)         # 四家点数（两种缩放）+ 顺位 one-hot
    add('round', 4 + 1 + 1 + 2 + 1)  # 局 one-hot、本场、供托、场风/自风、场次进度
    add('dora', 7)                  # 宝牌指示牌
    add('self', 6 * 4 + 18 * 4 + 1)  # 自己的牌河：前 6 张 + 最近 18 张 + 时间衰减
    for p in ('p1', 'p2', 'p3'):
        add(p, 6 * 8 + 18 * 8 + 3)  # 他家牌河：前 6 张 + 最近 18 张 + 时间衰减（摸切/手切/立直）
    add('round', 1)                 # 余牌数
    add('dora', 4 + 1)              # 各家持有的宝牌数、未见宝牌数
    for p in ('self', 'p1', 'p2', 'p3'):
        add(p, 7)                   # 牌河总览
    for p in ('self', 'p1', 'p2', 'p3'):
        add(p, 4 * 5)               # 副露
    for p in ('self', 'p1', 'p2', 'p3'):
        add(p, 1)                   # 暗杠
    add('seen', 1)                  # 每种牌已见张数
    for p in ('p1', 'p2', 'p3'):
        add(p, 3)                   # 最后一张手切牌
    for p in ('p1', 'p2', 'p3'):
        add(p, 3)                   # 立直宣言牌
    for p in ('p1', 'p2', 'p3'):
        add(p, 1)                   # 已宣言立直
    for p in ('p1', 'p2', 'p3'):
        add(p, 1)                   # 立直已成立
    add('status', 1 + 1 + 7 + 1 + 1)  # 待牌、振听、向听 one-hot、自己已立直、选杠阶段
    add('actions', 3 + 5 + 10)      # 可鸣的那张牌、打牌相关、各操作是否可用
    add('ev', 2)                    # 最大期望打点
    add('ukeire', 2 * 34 + 2)       # 每种打法的进张（不退向听 / 退向听）+ 进张最多的打法
    add('tenpai', 17)
    add('win', 17)
    add('ev', 17)
    assert len(g) == V4_CHANNELS, len(g)
    return g


def baseline_obs():
    """积分梯度的基线：空白局面，但四家各 25,000 点、顺位不分先后。
    全零基线相当于「四家都是 0 分」，点数这一组的贡献会被严重夸大；
    用平分作基线后，点数组的含义就是「当前点差和四家平分相比」。"""
    import numpy as np
    x = np.zeros((V4_CHANNELS, 34), dtype=np.float32)
    for p in range(4):  # 通道 7 起：每家两种缩放（/100000、/30000）
        x[7 + 2 * p] = 25000 / 100000
        x[8 + 2 * p] = 25000 / 30000
    x[15:19] = 0.25     # 顺位 one-hot → 均匀
    return x


# ------------------------------------------------------------------ 事件处理
def seat_view(events, pid):
    """只保留最后一局（从最后一个 start_kyoku 起），并按座位隐藏他家配牌与摸牌。"""
    start = None
    for i, ev in enumerate(events):
        if ev.get('type') == 'start_kyoku':
            start = i
    if start is None:
        raise ValueError('事件里没有 start_kyoku')
    out = []
    for ev in events[start:]:
        t = ev.get('type')
        if t in ('start_game', 'end_game', 'end_kyoku', 'hora', 'ryukyoku'):
            continue
        ev = {k: v for k, v in ev.items() if k not in ('can_act', 'meta')}
        if t == 'start_kyoku':
            ev['tehais'] = [h if s == pid else ['?'] * len(h) for s, h in enumerate(ev['tehais'])]
        elif t == 'tsumo' and ev.get('actor') != pid:
            ev['pai'] = '?'
        out.append(ev)
    return out


def tile_name(t):
    if t < 27:
        return '%d%s' % (t % 9 + 1, 'mps'[t // 9])
    return 'ESWNPFC'[t - 27]


class Explainer:
    def __init__(self, mortal_dir, model_path, device='auto'):
        mdir = os.path.abspath(os.path.expanduser(mortal_dir))
        if mdir not in sys.path:
            sys.path.insert(0, mdir)
        warnings.simplefilter('ignore')
        import numpy as np
        import torch
        from model import Brain, DQN
        from libriichi.state import PlayerState
        self.np, self.torch, self.PlayerState = np, torch, PlayerState

        state = torch.load(os.path.expanduser(model_path), weights_only=True, map_location='cpu')
        if 'mortal' not in state or 'current_dqn' not in state:
            raise ValueError('权重文件里缺少 mortal / current_dqn：' + model_path)
        cfg = state.get('config') or {}
        self.version = cfg.get('control', {}).get('version', 4)
        if self.version != 4:
            raise ValueError('梯度归因目前只支持 Mortal v4 的权重（这个是 v%d）' % self.version)
        resnet = cfg.get('resnet', {})
        self.brain = Brain(version=4, num_blocks=resnet.get('num_blocks', 40),
                           conv_channels=resnet.get('conv_channels', 192)).eval()
        self.dqn = DQN(version=4).eval()
        self.brain.load_state_dict(state['mortal'], strict=True)
        self.dqn.load_state_dict(state['current_dqn'], strict=True)
        for p in list(self.brain.parameters()) + list(self.dqn.parameters()):
            p.requires_grad_(False)
        if device == 'auto':  # Apple 芯片用 GPU（MPS）快好几倍，结果和 CPU 一致
            device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        self.device = torch.device(device)
        self.brain.to(self.device)
        self.dqn.to(self.device)
        groups = v4_channel_groups()
        self.group_index = {k: [i for i, x in enumerate(groups) if x == k] for k in GROUP_KEYS}

    def warmup(self, steps=32):
        """第一次在 GPU 上反向传播要编译内核，启动时先空跑一次"""
        torch = self.torch
        x = torch.zeros((steps, V4_CHANNELS, 34), device=self.device, requires_grad=True)
        m = torch.ones((steps, 46), dtype=torch.bool, device=self.device)
        q = self.dqn(self.brain(x), m)
        (q[:, 0] - q[:, 1]).sum().backward()

    def encode(self, events, pid):
        st = self.PlayerState(pid)
        for ev in seat_view(events, pid):
            st.update(json.dumps(ev, separators=(',', ':')))
        obs, mask = st.encode_obs(4, False)
        if not mask.any():
            raise ValueError('这个时刻轮不到该座位做决定')
        return obs, mask, st

    def q_values(self, obs, mask):
        torch = self.torch
        with torch.no_grad():
            x = torch.as_tensor(obs, device=self.device)[None]
            m = torch.as_tensor(mask, device=self.device)[None]
            return self.dqn(self.brain(x), m)[0].cpu()

    def explain(self, events, pid=0, a=None, b=None, steps=32):
        torch, np = self.torch, self.np
        t0 = time.time()
        obs, mask, st = self.encode(events, pid)
        q = self.q_values(obs, mask)
        legal = [i for i in range(len(mask)) if mask[i]]
        order = sorted(legal, key=lambda i: -float(q[i]))
        a = order[0] if a is None else int(a)
        # 没指定 b，或 b 和 a 相同（例如回放里实际打法就是 Mortal 的首选）：和除 a 以外最好的选项比
        b = None if b is None else int(b)
        if b is None or b == a:
            b = next((i for i in order if i != a), None)
        res = {
            'player_id': pid,
            'shanten': st.shanten,
            'q': {str(i): round(float(q[i]), 4) for i in legal},
            'a': a, 'b': b,
        }
        if b is None or a == b or a not in legal or b not in legal:
            res['error'] = '需要两个不同的合法操作才能比较'
            return res

        # 积分梯度：沿 基线 → obs 的直线取 steps 个中点，平均梯度 × (obs − 基线)
        dev = self.device
        x = torch.as_tensor(obs, device=dev)
        x0 = torch.as_tensor(baseline_obs(), device=dev)
        mt = torch.as_tensor(mask, device=dev)[None]
        m = mt.expand(steps, -1)
        alphas = (torch.arange(steps, dtype=torch.float32, device=dev) + 0.5) / steps
        path = (x0[None] + alphas[:, None, None] * (x - x0)[None]).requires_grad_(True)
        qq = self.dqn(self.brain(path), m)
        (qq[:, a] - qq[:, b]).sum().backward()
        attr = (path.grad.mean(0) * (x - x0)).cpu().numpy()  # (1012, 34)

        with torch.no_grad():
            q0 = self.dqn(self.brain(x0[None]), mt)[0].cpu()
        delta = float(q[a] - q[b])
        base = float(q0[a] - q0[b])

        # 逐行判断：整行数值相同的是「标量特征」（点数、局数……），不分配到具体的牌
        per_tile_rows = np.array([not np.allclose(obs[r], obs[r][0]) for r in range(obs.shape[0])])
        groups = []
        for k in GROUP_KEYS:
            rows = self.group_index[k]
            sub = attr[rows]
            tiles = sub[per_tile_rows[rows]].sum(0) if per_tile_rows[rows].any() else np.zeros(34)
            top = [(int(t), round(float(tiles[t]), 4)) for t in np.argsort(-np.abs(tiles))[:4] if abs(tiles[t]) > 1e-4]
            groups.append({'key': k, 'v': round(float(sub.sum()), 4), 'tiles': top})
        hand_tiles = attr[self.group_index['hand'][:4]].sum(0)
        res.update({
            'delta': round(delta, 4),
            'base': round(base, 4),
            'sum': round(float(attr.sum()), 4),
            'groups': groups,
            'hand': [round(float(v), 4) for v in hand_tiles],
            'steps': steps,
            'ms': int((time.time() - t0) * 1000),
        })
        return res


def sample_events():
    """自检用局面：东1局 2本场，宝牌指示牌 5m，北家手牌 2m 55m 8m 22p 6p 88p 1s 2s 4s 赤5s 7s（刚摸 6p）。"""
    U = ['?'] * 13
    evs = [{'type': 'start_kyoku', 'bakaze': 'E', 'dora_marker': '5m', 'kyoku': 1, 'honba': 2, 'kyotaku': 0, 'oya': 0,
            'scores': [56300, 18900, 5900, 18900],
            'tehais': [U, U, U, ['2m', '5m', '5m', '2p', '2p', '8p', '8p', '1s', '2s', '4s', '5sr', '7s', 'N']]}]

    def turn(s, d, draw='?'):
        evs.extend([{'type': 'tsumo', 'actor': s, 'pai': draw}, {'type': 'dahai', 'actor': s, 'pai': d, 'tsumogiri': False}])
    turn(0, 'N'); turn(1, '1p'); turn(2, 'N'); turn(3, 'N', '8m')
    turn(0, '9m'); turn(1, '9p'); turn(2, 'S')
    evs.append({'type': 'tsumo', 'actor': 3, 'pai': '6p'})
    return evs


def self_check(ex):
    """核对通道分组和 libriichi 的实际编码是否一致，再跑一次归因（打 2m vs 打 8m）"""
    evs = sample_events()
    obs, mask, st = ex.encode(evs, 3)
    assert obs.shape == (V4_CHANNELS, 34), obs.shape
    assert obs[0:4].sum() == 14, '手牌 14 张'
    assert obs[6].min() == 1, '手里有赤 5s'
    assert obs[28][4] == 1, '宝牌指示牌 5m'
    assert abs(obs[717][0] - 62 / 69) < 1e-6, '余 62 张'
    assert abs(obs[835][8] - 0.25) < 1e-6 and abs(obs[835][4] - 0.75) < 1e-6, '已见：9m 1 张、5m 3 张'
    assert obs[862 + st.shanten].min() == 1, '向听 one-hot'
    assert obs[854:860].sum() == 0, '没人立直'
    r = ex.explain(evs, 3, 1, 7)
    gap = r['delta'] - r['base']
    print('通道核对通过；%d 向听，%d ms' % (st.shanten, r['ms']))
    print('Q(打2m) − Q(打8m) = %.3f；各组合计 %.3f（应接近 %.3f）' % (r['delta'], r['sum'], gap))
    for g in sorted(r['groups'], key=lambda g: -abs(g['v']))[:6]:
        print('  %-8s %+.3f' % (g['key'], g['v']))
    assert abs(r['sum'] - gap) < 0.1 * max(1, abs(gap)), '积分梯度误差过大，可以加大 steps'


def main():
    ap = argparse.ArgumentParser(description='Mortal 梯度归因（子进程：每行一个 JSON 请求）')
    ap.add_argument('--mortal-dir', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--device', default='auto', help='auto（默认，Apple 芯片用 mps）/ cpu / mps / cuda')
    ap.add_argument('--check', action='store_true', help='自检：核对通道分组并跑一个示例局面，然后退出')
    a = ap.parse_args()
    ex = Explainer(a.mortal_dir, a.model, a.device)
    if a.check:
        return self_check(ex)
    ex.warmup()
    print('[explain] 已加载 %s（%s）' % (os.path.basename(a.model), ex.device), file=sys.stderr, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            out = ex.explain(req.get('events') or [], int(req.get('player_id', 0)),
                             req.get('a'), req.get('b'), max(4, min(128, int(req.get('steps') or 32))))
        except Exception as e:  # 出错也要回一行，桥接程序才不会干等
            out = {'error': '%s: %s' % (type(e).__name__, e)}
        print(json.dumps(out, ensure_ascii=False, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
