/* Mortal 决策归因（浏览器部分）
 *
 * 向桥接程序的 /explain 发送某个座位视角下的 mjai 事件，拿回：
 *   - 该座位所有合法操作的 Q 值；
 *   - 「为什么选 A 而不是 B」：各组输入特征对 Q(A) − Q(B) 的贡献（积分梯度，见 tools/mortal_explain.py）。
 * 对局中的「策」面板和牌谱回放共用这里的请求与绘制。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const L = (zh, en) => (MJ.L ? MJ.L(zh, en) : zh);

  // 组名：[中文, English, 中文说明, English tip]
  const GROUPS = {
    hand: ['手牌', 'Hand', '自己的手牌（含赤宝牌）', 'Your own hand, including red fives'],
    dora: ['宝牌', 'Dora', '宝牌指示牌、各家持有的宝牌数、还没见到的宝牌数', 'Dora indicators, dora each player holds, dora not yet seen'],
    score: ['点数与顺位', 'Scores & rank', '四家点数和当前顺位', 'All four scores and the current placement'],
    round: ['局况', 'Round', '场次、本场、供托、场风/自风、余牌数', 'Round, honba, riichi sticks, winds, tiles left'],
    self: ['自己的牌河', 'Own discards', '自己的牌河、副露、暗杠', 'Your discards, calls and closed kans'],
    p1: ['下家', 'Right', '下家的牌河（手切/摸切、立直宣言牌）、副露、立直状态', "Right player's discards (tedashi, riichi tile), calls, riichi state"],
    p2: ['对家', 'Across', '对家的牌河、副露、立直状态', "Across player's discards, calls, riichi state"],
    p3: ['上家', 'Left', '上家的牌河、副露、立直状态', "Left player's discards, calls, riichi state"],
    seen: ['已见牌', 'Visible tiles', '每种牌场上已经见到几张', 'How many of each tile are already visible'],
    status: ['向听与听牌', 'Shanten & waits', '向听数、待牌、振听、自己是否已立直', 'Shanten, waits, furiten, own riichi'],
    actions: ['可选操作', 'Legal actions', '此刻能做哪些操作（能打哪些牌、能否鸣牌/立直/和牌）', 'Which actions are available right now'],
    ukeire: ['牌效·进张', 'Solo: ukeire', 'libriichi 预先算好的：每种打法的有效进张（只看自己，不考虑他家）', 'Precomputed by libriichi: ukeire of each discard, ignoring opponents'],
    tenpai: ['牌效·听牌率', 'Solo: tenpai', '每种打法在之后各巡的听牌率（单人计算）', 'Tenpai probability by turn for each discard (solo calc)'],
    win: ['牌效·和牌率', 'Solo: win', '每种打法在之后各巡的和牌率（单人计算）', 'Win probability by turn for each discard (solo calc)'],
    ev: ['牌效·打点', 'Solo: value', '每种打法的期望得点（单人计算，含宝牌与役）', 'Expected points of each discard (solo calc, with dora and yaku)'],
  };
  const groupName = (k, seatNames) => {
    if (seatNames && /^p[123]$/.test(k)) return seatNames[+k[1]];
    const g = GROUPS[k];
    return g ? L(g[0], g[1]) : k;
  };
  const groupTip = (k) => {
    const g = GROUPS[k];
    return g ? L(g[2], g[3]) : '';
  };

  // ------------------------------------------------------------ 动作编号
  /** 动作编号 → 打出的牌 { t, red }（不是打牌则为 null） */
  function actionTile(a) {
    if (a <= 33) return { t: a, red: false };
    if (a <= 36) return { t: (a - 34) * 9 + 4, red: true };
    return null;
  }

  /**
   * 牌谱里某个座位实际做的事 → 动作编号。
   * ev 为决策点之后的下一个事件（不是该座位的事件则视为跳过）；kind 为 'turn'（摸牌后）或 'call'（他家打牌后）。
   */
  function actionOf(ev, seat, kind) {
    if (!ev || ev.actor !== seat) {
      if (kind === 'turn' && ev && ev.type === 'ryukyoku') return 44; // 摸牌后直接流局 = 九种九牌
      return 45;
    }
    switch (ev.type) {
      case 'dahai': {
        const f = MJ.Mjai.fromMjai(ev.pai);
        if (!f) return null;
        return f.red ? 34 + Math.floor(f.t / 9) : f.t;
      }
      case 'reach': return 37;
      case 'chi': {
        const c = MJ.Mjai.fromMjai(ev.pai).t;
        const xs = ev.consumed.map((x) => MJ.Mjai.fromMjai(x).t).sort((a, b) => a - b);
        return c < xs[0] ? 38 : c < xs[1] ? 39 : 40;
      }
      case 'pon': return 41;
      case 'daiminkan': case 'ankan': case 'kakan': return 42;
      case 'hora': return 43;
    }
    return 45;
  }

  /** Q 值表 → 按倾向排序的选项（倾向 = 对合法操作的 Q 做 softmax，与「策」面板一致） */
  function items(res) {
    const keys = Object.keys(res.q || {});
    const qs = keys.map((k) => res.q[k]);
    const mx = Math.max(...qs);
    const ex = qs.map((q) => Math.exp(q - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    return keys.map((k, i) => ({ action: +k, q: qs[i], p: ex[i] / sum, tile: actionTile(+k) })).sort((a, b) => b.q - a.q);
  }

  /** 简单的动作标签（回放用；对局中「策」面板有自己的标签，吃的时候能画出具体的牌） */
  function label(a, opts) {
    if (a == null) return '';
    const tl = actionTile(a);
    if (tl) return `<span class="xa-tile">${MJ.R.tileHTMLByType(tl.t, tl.red)}</span>`;
    const kind = opts && opts.kind;
    const names = {
      37: L('立直', 'Riichi'), 38: L('吃（低）', 'Chi (low)'), 39: L('吃（中）', 'Chi (mid)'), 40: L('吃（高）', 'Chi (high)'),
      41: L('碰', 'Pon'), 42: L('杠', 'Kan'), 43: kind === 'call' ? L('荣和', 'Ron') : L('自摸', 'Tsumo'),
      44: L('九种九牌', 'Nine terminals'), 45: kind === 'call' ? L('跳过', 'Skip') : L('不操作', 'No action'),
    };
    return `<b class="xa-act">${names[a] || a}</b>`;
  }

  // ------------------------------------------------------------ 请求
  /** POST /explain；body: { events, player_id, a?, b? }。出错时抛异常 */
  async function request(url, body, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // 第一次请求要启动归因进程、加载模型，给足时间
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 150000) : null;
    try {
      const res = await fetch(url.replace(/\/+$/, '') + '/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // 避免 CORS 预检
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const r = await res.json();
      if (r.error && !r.q) throw new Error(r.error);
      return r;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(L('归因超时', 'attribution timed out'));
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------ 绘制
  const sign = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

  /**
   * 归因结果 → HTML。
   * opts: { labelA, labelB: 动作标签 HTML；compare: [{ action, html }] 可切换的比较对象；
   *         seatNames: 回放时把 p1/p2/p3 换成具体座位名；max: 最多显示几组 }
   */
  function render(res, opts) {
    opts = opts || {};
    if (!res || !res.groups) {
      const one = res && res.q && Object.keys(res.q).length < 2;
      return `<div class="xa-msg">${one ? L('只有一个可选操作，没有可比较的。', 'Only one legal action; nothing to compare.') : (res && res.error) || L('没有归因数据', 'No attribution data')}</div>`;
    }
    const A = opts.labelA || label(res.a), B = opts.labelB || label(res.b);
    const skip = new Set([res.a, res.b].map((a) => actionTile(a)).filter(Boolean).map((t) => t.t));
    const groups = res.groups.slice().sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
    const max = opts.max || 7;
    const shown = groups.slice(0, max).filter((g, i) => i < 3 || Math.abs(g.v) >= 0.02);
    const rest = groups.filter((g) => !shown.includes(g));
    const restV = rest.reduce((a, g) => a + g.v, 0);
    const scale = Math.max(...shown.map((g) => Math.abs(g.v)), Math.abs(restV), Math.abs(res.base), 1e-6);
    const tileCut = scale * 0.15;

    const row = (name, tip, v, tiles, cls) => {
      const w = (Math.abs(v) / scale) * 50;
      const bar = v >= 0 ? `left:50%;width:${w.toFixed(1)}%` : `left:${(50 - w).toFixed(1)}%;width:${w.toFixed(1)}%`;
      return `<div class="xa-row${cls ? ' ' + cls : ''}" title="${tip}"><span class="xa-lab">${name}</span>` +
        `<span class="xa-bar"><i class="${v >= 0 ? 'pos' : 'neg'}" style="${bar}"></i></span>` +
        `<span class="xa-v ${v >= 0 ? 'pos' : 'neg'}">${sign(v)}</span><span class="xa-ts">${tiles || ''}</span></div>`;
    };
    const tilesOf = (g) => (g.tiles || [])
      .filter(([t, v]) => !skip.has(t) && Math.abs(v) >= tileCut)
      .slice(0, 2)
      .map(([t, v]) => {
        // 宝牌组里牌的位置是指示牌，换成真正的宝牌显示
        const shownT = g.key === 'dora' && MJ.doraFromIndicator ? MJ.doraFromIndicator(t) : t;
        return `<span class="xa-tt ${v >= 0 ? 'pos' : 'neg'}" title="${sign(v)}">${MJ.R.tileHTMLByType(shownT, false)}</span>`;
      }).join('');

    const rows = shown.map((g) => row(groupName(g.key, opts.seatNames), groupTip(g.key), g.v, tilesOf(g))).join('') +
      (rest.length ? row(L(`其他 ${rest.length} 组`, `${rest.length} others`), rest.map((g) => groupName(g.key, opts.seatNames)).join(' · '), restV, '') : '') +
      row(L('基线偏好', 'Baseline'), L('空白局面（四家各 25,000 点、没有手牌和牌河）下 A 比 B 好多少：模型不看具体局面时的先验，不算任何一组的功劳', 'How much A beats B on an empty table (all at 25,000, no tiles): the model\'s prior, not credited to any group'), res.base, '', 'base');
    const compare = opts.compare && opts.compare.length
      ? `<div class="xa-vs"><span>${L('对比', 'vs')}</span>${opts.compare.map((c) => `<button class="xa-b${c.action === res.b ? ' on' : ''}" data-b="${c.action}">${c.html}</button>`).join('')}</div>`
      : '';
    return `<div class="xa">
      <div class="xa-q"><span>${L('为什么', 'Why')} ${A} ${L('而不是', 'over')} ${B}</span><small title="${L('Q(A) − Q(B)', 'Q(A) − Q(B)')}">${L('Q 差', 'Q gap')} ${res.delta.toFixed(2)}</small></div>
      ${compare}
      <div class="xa-axis"><span>← ${L('支持', 'favors')} ${B}</span><span>${L('支持', 'favors')} ${A} →</span></div>
      ${rows}
      <div class="xa-note">${L(
        `积分梯度：和空白局面（四家各 25,000 点）相比，每组输入让「A 比 B 好多少」变了多少；各行相加 ≈ Q 差。小牌图是该组里影响最大的牌，宝牌组显示的是宝牌本身。`,
        `Integrated gradients: compared with an empty table (all at 25,000), how much each input group changes "how much better A is than B"; the rows add up to about the Q gap. Small tiles are the most influential tiles in that group; for Dora it shows the dora itself.`)}</div>
    </div>`;
  }

  MJ.Explain = { GROUPS, groupName, actionTile, actionOf, items, label, request, render };
})(typeof window !== 'undefined' ? window : globalThis);
