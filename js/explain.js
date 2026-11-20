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

  // 组名：[中文, English, 中文说明, English 说明]；说明会出现在面板底部的「词语说明」里
  const GROUPS = {
    hand: ['手牌', 'Hand', '你手里的牌本身（含赤宝牌）', 'The tiles in your hand (including red fives)'],
    dora: ['宝牌', 'Dora', '宝牌是哪张、各家手里/副露里有几张宝牌、还有几张宝牌没见到', 'Which tile is dora, how many dora each player shows or holds, how many are still unseen'],
    score: ['点数与顺位', 'Scores & rank', '四家点数和你现在的顺位（和四家平分相比）', 'All four scores and your placement (compared with an even game)'],
    round: ['局况', 'Round', '第几局、本场、供托、场风/自风、牌山还剩几张（和东一局开局相比）', 'Round, honba, riichi sticks, winds, tiles left (compared with the start of East 1)'],
    self: ['自己的牌河', 'Own discards', '你打过的牌（顺序、摸切还是手切）、你的副露和暗杠', 'Your discards (order, tsumogiri or not), your calls and closed kans'],
    p1: ['下家', 'Right', '下家打过的牌（顺序、手切/摸切、立直宣言牌）、副露、是否立直', "Right player's discards (order, tedashi, riichi tile), calls, riichi"],
    p2: ['对家', 'Across', '对家打过的牌、副露、是否立直', "Across player's discards, calls, riichi"],
    p3: ['上家', 'Left', '上家打过的牌、副露、是否立直', "Left player's discards, calls, riichi"],
    seen: ['已见牌', 'Visible tiles', '每种牌场上已经能看到几张（牌河、副露、宝牌指示牌、你的手牌），决定还剩几张能摸到', 'How many of each tile are visible (discards, calls, dora indicator, your hand), i.e. how many are left to draw'],
    status: ['向听与听牌', 'Shanten & waits', '你现在几向听、听哪些牌、是否振听、是否已经立直', 'Your shanten, waits, furiten, and whether you are in riichi'],
    actions: ['可选操作', 'Legal actions', '规则上此刻能做什么：能打哪些牌、能否立直/鸣牌/和牌、打哪张能保持向听。不是 Mortal 的偏好', 'What the rules allow right now: which tiles can be discarded, whether you can riichi / call / win, which discards keep shanten. Not a preference'],
    ukeire: ['牌效·进张', 'Solo: ukeire', 'libriichi 事先算好的单人牌效表：每种打法有几张有效进张。只看自己，不考虑他家', "libriichi's precomputed solo table: ukeire of each discard, ignoring opponents"],
    tenpai: ['牌效·听牌率', 'Solo: tenpai', '单人牌效表：每种打法在之后几巡内听牌的概率', 'Solo table: chance of reaching tenpai within the next turns for each discard'],
    win: ['牌效·和牌率', 'Solo: win', '单人牌效表：每种打法在之后几巡内和牌的概率', 'Solo table: chance of winning within the next turns for each discard'],
    ev: ['牌效·打点', 'Solo: value', '单人牌效表：每种打法的期望得点（算上宝牌和役）', 'Solo table: expected points of each discard (with dora and yaku)'],
  };
  // 这些组的「列」不是「这张牌」：牌效表和可选操作按「打哪张」排列，进张表按「需要哪张」排列，所以不显示小牌图
  const NO_TILES = new Set(['actions', 'ukeire', 'tenpai', 'win', 'ev']);
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
    const tilesOf = (g) => (NO_TILES.has(g.key) ? [] : g.tiles || [])
      .filter(([t, v]) => !skip.has(t) && Math.abs(v) >= tileCut)
      .slice(0, 2)
      .map(([t, v]) => {
        // 宝牌组里牌的位置是指示牌，换成真正的宝牌显示
        const shownT = g.key === 'dora' && MJ.doraFromIndicator ? MJ.doraFromIndicator(t) : t;
        return `<span class="xa-tt ${v >= 0 ? 'pos' : 'neg'}" title="${sign(v)}">${MJ.R.tileHTMLByType(shownT, false)}</span>`;
      }).join('');

    const rows = shown.map((g) => row(groupName(g.key, opts.seatNames), groupTip(g.key), g.v, tilesOf(g))).join('') +
      (rest.length ? row(L(`其他 ${rest.length} 组`, `${rest.length} others`), rest.map((g) => groupName(g.key, opts.seatNames)).join(' · '), restV, '') : '') +
      row(L('基线偏好', 'Baseline'), L('空白局面下 A 比 B 好多少：模型不看具体局面时的先验，不算任何一组的功劳', 'How much A beats B on an empty table: the model\'s prior, not credited to any group'), res.base, '', 'base');
    const gloss = Object.keys(GROUPS).map((k) => `<dt>${groupName(k, opts.seatNames)}</dt><dd>${groupTip(k)}</dd>`).join('') +
      `<dt>${L('基线偏好', 'Baseline')}</dt><dd>${L('空白局面（没有任何牌、四家各 25,000 点、东一局开局）下 A 比 B 好多少，是模型不看具体局面时的先验', 'How much A beats B on an empty table (no tiles, all at 25,000, start of East 1): the model\'s prior')}</dd>`;
    const compare = opts.compare && opts.compare.length
      ? `<div class="xa-vs"><span>${L('对比', 'vs')}</span>${opts.compare.map((c) => `<button class="xa-b${c.action === res.b ? ' on' : ''}" data-b="${c.action}">${c.html}</button>`).join('')}</div>`
      : '';
    return `<div class="xa">
      <div class="xa-q"><span>${L('为什么', 'Why')} ${A} ${L('而不是', 'over')} ${B}</span><small title="${L('Q(A) − Q(B)', 'Q(A) − Q(B)')}">${L('Q 差', 'Q gap')} ${res.delta.toFixed(2)}</small></div>
      ${compare}
      <div class="xa-axis"><span>← ${L('支持', 'favors')} ${B}</span><span>${L('支持', 'favors')} ${A} →</span></div>
      ${rows}
      <details class="xa-gloss"><summary>${L('怎么看 · 词语说明', 'How to read · what the rows mean')}</summary>
        <p>${L(
          `每一行是 Mortal 看到的一类信息。条往右（金色）= 这类信息让它更想选 A，往左（蓝色）= 更想选 B，数字是 Q 值，各行相加 ≈ Q 差。数值是和「空白局面」比出来的（积分梯度），只说明 Mortal 对哪些信息敏感，不是它的思考过程。小牌图是这一组里影响最大的牌，宝牌组显示宝牌本身。`,
          `Each row is one kind of information Mortal sees. A bar to the right (gold) means it pushes towards A, to the left (blue) towards B. Numbers are in Q units and add up to about the Q gap. Values are measured against an empty table (integrated gradients): they show what Mortal is sensitive to, not how it reasons. Small tiles are the most influential tiles in that row; the Dora row shows the dora itself.`)}</p>
        <dl>${gloss}</dl>
      </details>
    </div>`;
  }

  MJ.Explain = { GROUPS, groupName, actionTile, actionOf, items, label, request, render };
})(typeof window !== 'undefined' ? window : globalThis);
