#!/usr/bin/env python3
"""用官方 Mortal 代码运行任意一个 Mortal 权重文件，作为 mjai 机器人（stdin 收事件，stdout 回反应）。

和 Mortal 自带的 mortal.py 相比：
  * 不需要 config.toml，权重路径直接用 --model 指定；
  * 兼容两种权重格式：完整训练检查点（含 config，例如 VoidShine 298k）
    和只含推理张量的精简格式（只有 mortal / current_dqn，例如 Mortal-S42）。

用法（一般由 tools/mortal_bridge.py 调用）：
    python mortal_runner.py --mortal-dir ~/Mortal/mortal --model /path/to/model.pth 0
"""
import argparse
import os
import sys
import warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mortal-dir', required=True, help='官方 Mortal 仓库的 mortal/ 目录（含 model.py、engine.py、libriichi.so）')
    ap.add_argument('--model', required=True, help='权重文件 .pth')
    ap.add_argument('--name', default=None, help='显示名称')
    ap.add_argument('seat', type=int, choices=range(4))
    a = ap.parse_args()

    mdir = os.path.abspath(os.path.expanduser(a.mortal_dir))
    sys.path.insert(0, mdir)
    warnings.simplefilter('ignore')
    import torch
    from model import Brain, DQN
    from engine import MortalEngine
    from libriichi.mjai import Bot

    # weights_only=True：只读取张量数据，不执行文件里的任何代码
    state = torch.load(os.path.expanduser(a.model), weights_only=True, map_location='cpu')
    if 'mortal' not in state or 'current_dqn' not in state:
        sys.exit('权重文件里缺少 mortal / current_dqn，不是 Mortal 的检查点：' + a.model)
    cfg = state.get('config') or {}
    version = cfg.get('control', {}).get('version', 4)
    resnet = cfg.get('resnet', {})
    blocks = resnet.get('num_blocks', 40)
    channels = resnet.get('conv_channels', 192)

    brain = Brain(version=version, num_blocks=blocks, conv_channels=channels).eval()
    dqn = DQN(version=version).eval()
    brain.load_state_dict(state['mortal'], strict=True)
    dqn.load_state_dict(state['current_dqn'], strict=True)
    name = a.name or os.path.splitext(os.path.basename(a.model))[0]
    engine = MortalEngine(
        brain, dqn, is_oracle=False, version=version, device=torch.device('cpu'),
        enable_amp=False, enable_quick_eval=True, enable_rule_based_agari_guard=True, name=name,
    )
    print('[runner] %s 已加载：Mortal v%d，%d 层 × %d 通道' % (name, version, blocks, channels), file=sys.stderr, flush=True)

    bot = Bot(engine, a.seat)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        reaction = bot.react(line)
        if reaction:
            print(reaction, flush=True)
        elif '"can_act":false' not in line.replace(' ', ''):
            # 被要求决策却没有可做的操作时明确回一个 none，桥接程序就不用干等到超时
            print('{"type":"none"}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
