/* 点数计算教程：讲解、速查表、计算器、例题与随机练习。
 * 所有例题与练习的答案都由规则引擎实时算出，保证与对局中的结算一致。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const R = MJ.R;
  const N = R.notationHTML;
  const fmt = R.fmt;
  const WIND = ['东', '南', '西', '北'];
  const $ = (s, root) => (root || document).querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);

  const CHAPTERS = [
    { id: 'overview', name: '总览', sub: '三步算出点数' },
    { id: 'han', name: '番', sub: '役种与宝牌' },
    { id: 'fu', name: '符', sub: '底符、面子、听牌' },
    { id: 'points', name: '点数', sub: '公式、速查表、计算器' },
    { id: 'cases', name: '例题', sub: '五手牌逐步拆解' },
    { id: 'quiz', name: '练习', sub: '随机出题，即时讲解' },
  ];

  const state = { chapter: 'overview', calc: { han: 3, fu: 30, dealer: false, tsumo: false }, quiz: null, score: { ok: 0, n: 0 } };

  // ------------------------------------------------------------ 工具
  /** 由记法描述构造和牌并计算 */
  function build(o) {
    const used = {};
    const hand = MJ.parseIds(o.hand.replace(/\s/g, ''), used);
    const winTile = MJ.parseIds(o.win, used)[0];
    const seat = o.seat || 0;
    const melds = (o.melds || []).map((m) => {
      const tiles = MJ.parseIds(m[1], used);
      return { type: m[0], tiles, called: tiles[0], from: (seat + 3) % 4 };
    });
    const doraInd = o.dora ? MJ.parseIds(o.dora, used) : [];
    const res = MJ.evaluateWin({
      hand: hand.concat(winTile), melds, winTile, tsumo: !!o.tsumo, riichi: o.riichi || 0, ippatsu: !!o.ippatsu,
      seatWind: seat, roundWind: o.round || 0, doraInd, uraInd: [],
    });
    return { o, hand, winTile, melds, doraInd, res, seat, round: o.round || 0, tsumo: !!o.tsumo, riichi: o.riichi || 0, ippatsu: !!o.ippatsu };
  }

  function handHTML(b) {
    let h = '<span class="tgroup">' + MJ.sortIds(b.hand).map((id) => R.tileHTML(id)).join('') + '</span>';
    h += `<div class="wt" data-lab="${b.tsumo ? '自摸' : '荣和'}">${R.tileHTML(b.winTile)}</div>`;
    if (b.melds.length) h += '<div class="melds">' + b.melds.map((m) => R.meldHTML(m, b.seat)).join('') + '</div>';
    return h;
  }

  function condHTML(b) {
    const tags = [];
    tags.push(`<span class="tag2${b.seat === 0 ? ' red' : ''}">${b.seat === 0 ? '亲家' : '子家'}</span>`);
    tags.push(`<span class="tag2">场风 ${WIND[b.round]}</span><span class="tag2">自风 ${WIND[b.seat]}</span>`);
    tags.push(`<span class="tag2">${b.tsumo ? '自摸' : '荣和'}</span>`);
    if (b.riichi) tags.push('<span class="tag2">立直</span>');
    if (b.ippatsu) tags.push('<span class="tag2">一发</span>');
    if (!b.melds.some((m) => m.type !== 'ankan')) tags.push('<span class="tag2">门清</span>');
    else tags.push('<span class="tag2">有副露</span>');
    let dora = '';
    if (b.doraInd.length) dora = `<span style="margin-left:8px;opacity:.7">宝牌指示牌</span><span class="tiles" style="--tw:22px">${b.doraInd.map((id) => R.tileHTML(id)).join('')}</span>`;
    return `<div class="cond">${tags.join('')}${dora}</div>`;
  }

  function payText(res, dealer, tsumo) {
    const p = MJ.calcPayments(res.base, dealer, tsumo, 0);
    if (!tsumo) return `${fmt(p.total)} 点`;
    if (dealer) return `${fmt(p.all)} 点 ALL（合计 ${fmt(p.total)}）`;
    return `${fmt(p.other)} / ${fmt(p.dealer)} 点（合计 ${fmt(p.total)}）`;
  }

  // ------------------------------------------------------------ 各章内容
  const pages = {};

  pages.overview = () => `
    <h2>点数是怎么算出来的</h2>
    <p class="lead">立直麻将的点数看起来复杂，其实只有三步：<em>数番</em>、<em>算符</em>、<em>查表（或套公式）</em>。这份教程会带你把每一步拆开。</p>
    <div class="steps">
      <div class="step"><i>STEP 1</i><b>数番</b>把手里所有<em>役</em>的番数加起来，再加上宝牌的张数。</div>
      <div class="step"><i>STEP 2</i><b>算符</b>底符 20，加上和牌方式、刻子杠子、雀头、听牌形，进位到十位。</div>
      <div class="step"><i>STEP 3</i><b>基本点</b>符 × 2<sup>番+2</sup>，超过 2000 就是满贯，之后只看番数。</div>
      <div class="step"><i>STEP 4</i><b>支付</b>子家荣和 ×4，亲家荣和 ×6；自摸则三家分摊。进位到百位。</div>
    </div>
    <div class="formula">基本点 = 符 × 2<sup>(番 + 2)</sup>
      <small>例：30 符 3 番 → 30 × 2⁵ = 960；子家荣和 960 × 4 = 3840 → 进位 3900 点</small></div>
    <h4>先记住这几件事</h4>
    <p>· 必须<em>至少有一个役</em>才能和牌。宝牌只加番，本身不算役。</p>
    <p>· <em>亲家</em>（庄家）和牌拿 1.5 倍，被自摸时也要付 2 倍——亲家的得失都更大。</p>
    <p>· <em>5 番以上不用算符</em>：满贯 / 跳满 / 倍满 / 三倍满 / 役满的点数是固定的。</p>
    <p>· 实战中绝大多数手牌是 <em>30 符</em>或 <em>40 符</em>。先把这两行背熟，就能应付八成的局面。</p>
    <div class="note">对局中每次和牌，结算窗口里都有「这手牌的点数是怎么算的」，会按这里的步骤把那一手牌逐项列出来。边打边看，是最快的学法。</div>
    <h4>一个完整的例子</h4>
    ${caseHTML(build({ hand: '234m 567m 23p 678s 55s', win: '4p', riichi: 1, seat: 1 }), '立直 · 平和 · 断幺九')}
  `;

  const YAKU = [
    { han: '1 番', list: [
      ['立直', '门清限定', '门清听牌时宣言并支付 1000 点供托，之后只能摸切。', ''],
      ['一发', '依附立直', '立直后一巡之内和牌，且期间无人鸣牌。', ''],
      ['门前清自摸和', '门清限定', '没有副露（暗杠除外）的状态下自摸和牌。', ''],
      ['断幺九', '', '手牌里没有 1、9 和字牌。', '234m 567m 345p 678s 66s'],
      ['平和', '门清限定', '四组顺子 + 非役牌的雀头，并且是两面听。', '234m 567p 345s 99m 67s'],
      ['一杯口', '门清限定', '同一花色里两组完全相同的顺子。', '223344m'],
      ['役牌', '', '白、发、中，或场风、自风的刻子 / 杠子。', '555z 666z 777z'],
      ['岭上开花', '', '杠之后摸到的岭上牌正好和牌。', ''],
      ['抢杠', '', '他家加杠时，荣和那张被加杠的牌。', ''],
      ['海底摸月 / 河底捞鱼', '', '牌山最后一张自摸 / 最后一张弃牌荣和。', ''],
    ] },
    { han: '2 番', list: [
      ['两立直', '门清限定', '第一巡、无人鸣牌时就宣言立直。', ''],
      ['七对子', '门清限定 · 固定 25 符', '七组不同的对子。', '1133m 5577p 2266s 44z'],
      ['三色同顺', '副露减 1 番', '万、筒、索三种花色里相同数字的顺子。', '234m 234p 234s'],
      ['一气通贯', '副露减 1 番', '同一花色的 123、456、789。', '123456789m'],
      ['混全带幺九', '副露减 1 番', '每组面子和雀头都带有幺九牌，且含字牌。', '123m 789p 111z 789s 99s'],
      ['对对和', '', '四组刻子（或杠子）加雀头。', '222m 555p 888s 444z 66m'],
      ['三暗刻', '', '三组暗刻（自己摸齐的刻子）。', '333m 666p 999s'],
      ['三色同刻', '', '三种花色里相同数字的刻子。', '333m 333p 333s'],
      ['三杠子', '', '一人开了三次杠。', ''],
      ['小三元', '实际 4 番起', '三元牌两组刻子 + 剩下一种做雀头。', '555z 666z 77z'],
      ['混老头', '', '整手牌只有 1、9 和字牌。', '111m 999p 111z 222z 99s'],
    ] },
    { han: '3 番', list: [
      ['混一色', '副露减 1 番', '只用一种花色的数牌，再加字牌。', '123m 456m 789m 111z 22z'],
      ['纯全带幺九', '副露减 1 番', '每组面子和雀头都带 1 或 9，没有字牌。', '123m 789m 123p 789s 99s'],
      ['二杯口', '门清限定', '两组一杯口。', '223344m 556677p 99s'],
    ] },
    { han: '6 番', list: [
      ['清一色', '副露减 1 番', '整手牌只有一种花色的数牌。', '1123456788999m'],
    ] },
    { han: '役满', list: [
      ['国士无双', '门清限定', '十三种幺九牌各一张，其中一种成对。', '19m 19p 19s 1234567z'],
      ['四暗刻', '门清限定', '四组暗刻。双碰听时必须自摸。', '111m 444p 777s 222z 55z'],
      ['大三元', '', '白、发、中三组刻子。', '555z 666z 777z'],
      ['小四喜 / 大四喜', '', '四种风牌：三刻一对 / 四组刻子。', '111z 222z 333z 44z'],
      ['字一色', '', '整手牌全是字牌。', '111z 333z 555z 666z 77z'],
      ['清老头', '', '整手牌全是 1 和 9。', '111m 999m 111p 999s 11s'],
      ['绿一色', '', '只用 2、3、4、6、8 索和发。', '223344s 666s 888s 66z'],
      ['九莲宝灯', '门清限定', '同一花色的 1112345678999 加任意一张。', '1112345678999m'],
      ['四杠子', '', '一人开了四次杠。', ''],
      ['天和 / 地和', '', '亲家配牌即和 / 子家第一巡自摸。', ''],
    ] },
  ];

  pages.han = () => `
    <h2>番：役种与宝牌</h2>
    <p class="lead">番数 = 所有成立的役的番数之和 + 宝牌张数。同一手牌可以同时成立多个役，全部累加。</p>
    <div class="note"><b>门清</b>指没有吃、碰、明杠（暗杠不算副露）。标注「门清限定」的役一旦副露就不成立；标注「副露减 1 番」的役副露后少算 1 番。</div>
    ${YAKU.map((grp) => `<h4>${grp.han}</h4><div class="yaku-grid">${grp.list.map(([nm, tag, ds, ex]) =>
      `<div class="yk"><div class="nm">${nm}<span>${tag}</span></div><div class="ds">${ds}</div>${ex ? N(ex) : ''}</div>`).join('')}</div>`).join('')}
    <h4>宝牌（不是役，但每张 +1 番）</h4>
    <p>· <em>宝牌</em>：指示牌的<em>下一张</em>。指示牌是 ${N('3m', 'inl')} 时宝牌是 ${N('4m', 'inl')}；9 的下一张回到 1。</p>
    <p>· 字牌的顺序：东 → 南 → 西 → 北 → 东，白 → 发 → 中 → 白。</p>
    <p>· <em>里宝牌</em>：只有立直和牌的人才能翻开，位于指示牌的正下方。</p>
    <p>· <em>赤宝牌</em>：红色的 ${N('0m 0p 0s', 'inl')}，每种一张，拿到就 +1 番。</p>
    <p>· 每开一次杠，就多翻开一张指示牌。</p>
  `;

  pages.fu = () => `
    <h2>符：把这些加起来</h2>
    <p class="lead">符衡量的是手牌的「难度」。从底符 20 开始，按下面四项累加，最后<em>向上进位到十位</em>（32 符 → 40 符）。</p>
    <h4>① 底符与和牌方式</h4>
    <table>
      <tr><th>项目</th><th class="n">符</th><th>说明</th></tr>
      <tr><td>底符</td><td class="n"><b>20</b></td><td>任何和牌都有</td></tr>
      <tr><td>门前清荣和</td><td class="n"><b>+10</b></td><td>没有副露的状态下荣和</td></tr>
      <tr><td>自摸</td><td class="n"><b>+2</b></td><td>平和自摸时不加</td></tr>
    </table>
    <h4>② 面子</h4>
    <p>顺子永远 0 符。刻子从 2 符起步，满足「幺九」「暗」「杠」每一项就翻一倍（杠是 ×4）。</p>
    <table>
      <tr><th>面子</th><th class="n">中张 2~8</th><th class="n">幺九 1 · 9 · 字</th><th>例</th></tr>
      <tr><td>明刻（碰）</td><td class="n"><b>2</b></td><td class="n"><b>4</b></td><td>${N('555p')}</td></tr>
      <tr><td>暗刻</td><td class="n"><b>4</b></td><td class="n"><b>8</b></td><td>${N('999s')}</td></tr>
      <tr><td>明杠</td><td class="n"><b>8</b></td><td class="n"><b>16</b></td><td>${N('3333m')}</td></tr>
      <tr><td>暗杠</td><td class="n"><b>16</b></td><td class="n"><b>32</b></td><td>${N('#11z#')}</td></tr>
    </table>
    <div class="note">荣和时用别人的牌凑成的刻子算<em>明刻</em>。例如 ${N('77s 22z', 'inl')} 双碰听，荣和 ${N('7s', 'inl')} 后 ${N('777s', 'inl')} 按明刻 2 符算；自摸则是暗刻 4 符。</div>
    <h4>③ 雀头</h4>
    <table>
      <tr><th>雀头</th><th class="n">符</th></tr>
      <tr><td>三元牌 ${N('55z', 'inl')} ${N('66z', 'inl')} ${N('77z', 'inl')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>场风牌 或 自风牌</td><td class="n"><b>+2</b></td></tr>
      <tr><td>既是场风又是自风（连风牌）</td><td class="n"><b>+4</b></td></tr>
      <tr><td>数牌、其他风牌</td><td class="n">0</td></tr>
    </table>
    <h4>④ 听牌形</h4>
    <p>只听一种牌的「难听」形状 +2 符，好形不加。</p>
    <table>
      <tr><th>听牌形</th><th>手里</th><th>和了牌</th><th class="n">符</th></tr>
      <tr><td>两面</td><td>${N('34p')}</td><td>${N('2p 5p')}</td><td class="n">0</td></tr>
      <tr><td>双碰</td><td>${N('77s 22z')}</td><td>${N('7s 2z')}</td><td class="n">0</td></tr>
      <tr><td>嵌张</td><td>${N('46m')}</td><td>${N('5m')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>边张</td><td>${N('12s')}</td><td>${N('3s')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>单骑</td><td>${N('5z')}</td><td>${N('5z')}</td><td class="n"><b>+2</b></td></tr>
    </table>
    <p>同一张牌能解释成多种听牌形时（如 ${N('3456m', 'inl')} 和 ${N('3m', 'inl')}，既是两面也是单骑），取<em>点数更高</em>的那种解释。</p>
    <h4>三个特例</h4>
    <p>· <em>平和自摸 = 20 符</em>：平和不计自摸的 2 符。平和荣和则是 20 + 10 = 30 符。</p>
    <p>· <em>七对子 = 25 符</em>：固定值，不进位。</p>
    <p>· <em>副露的平和形荣和 = 30 符</em>：吃过牌、全是顺子、两面听，本来只有 20 符，规定按 30 符算。</p>
    <div class="note">速记：门清荣和至少 30 符；有一组暗刻或幺九刻子，多半就上 40 符；出现杠子时再认真算。</div>
  `;

  function calcSteps(c) {
    const { han, fu, dealer, tsumo } = c;
    const raw = fu * Math.pow(2, han + 2);
    const base = MJ.basePoints(han, fu, 0);
    const limit = MJ.limitName(han, fu, 0);
    const pay = MJ.calcPayments(base, dealer, tsumo, 0);
    const up = (x) => (x % 100 === 0 ? fmt(x) : `${fmt(x)} → 进位 <b>${fmt(MJ.ceil100(x))}</b>`);
    const steps = [];
    if (han >= 5) steps.push(`${han} 番 → <b>${limit}</b>，基本点固定为 <b>${fmt(base)}</b>`);
    else if (raw >= 2000) steps.push(`基本点 = ${fu} × 2<sup>${han}+2</sup> = ${fmt(raw)}，达到 2000 → <b>满贯</b>，基本点封顶 <b>2000</b>`);
    else steps.push(`基本点 = ${fu} × 2<sup>${han}+2</sup> = ${fu} × ${Math.pow(2, han + 2)} = <b>${fmt(raw)}</b>`);
    if (!tsumo) steps.push(`${dealer ? '亲家' : '子家'}荣和：基本点 × ${dealer ? 6 : 4} = ${up(base * (dealer ? 6 : 4))}`);
    else if (dealer) steps.push(`亲家自摸：三家各付 基本点 × 2 = ${up(base * 2)}，合计 ${fmt(pay.total)}`);
    else {
      steps.push(`子家自摸：亲家付 基本点 × 2 = ${up(base * 2)}`);
      steps.push(`另外两家各付 基本点 × 1 = ${up(base)}，合计 ${fmt(pay.total)}`);
    }
    let big;
    if (!tsumo) big = `${fmt(pay.total)} 点`;
    else if (dealer) big = `${fmt(pay.all)} 点 ALL`;
    else big = `${fmt(pay.other)} / ${fmt(pay.dealer)} 点`;
    let warn = '';
    if ((fu === 20 && (!tsumo || han === 1)) || (fu === 25 && (han === 1 || (han === 2 && tsumo)))) {
      warn = '<p style="opacity:.7;font-size:13px;margin:6px 0 0">※ 这个组合在实战中不会出现（20 符只可能是平和自摸，七对子至少 2 番）。</p>';
    }
    return { steps, big, limit, warn };
  }

  const FUS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

  function scoreTable(c) {
    let h = '<table class="score-table"><tr><th style="text-align:left">符 ＼ 番</th>';
    for (let han = 1; han <= 4; han++) h += `<th class="${han === c.han ? 'hl' : ''}">${han} 番</th>`;
    h += '</tr>';
    for (const fu of FUS) {
      h += `<tr><th style="text-align:left" class="${fu === c.fu ? 'hl' : ''}">${fu} 符</th>`;
      for (let han = 1; han <= 4; han++) {
        const invalid = (fu === 20 && (!c.tsumo || han === 1)) || (fu === 25 && (han === 1 || (han === 2 && c.tsumo)));
        let cell;
        if (invalid) cell = '<span style="opacity:.3">—</span>';
        else {
          const base = MJ.basePoints(han, fu, 0);
          const p = MJ.calcPayments(base, c.dealer, c.tsumo, 0);
          cell = !c.tsumo ? fmt(p.total) : c.dealer ? fmt(p.all) + '<small>ALL</small>' : `${fmt(p.other)}<small>亲 ${fmt(p.dealer)}</small>`;
          if (base >= 2000) cell += '<small style="color:var(--verm);opacity:1">满贯</small>';
        }
        const cur = fu === c.fu && han === c.han;
        h += `<td data-han="${han}" data-fu="${fu}" class="${cur ? 'cur' : fu === c.fu || han === c.han ? 'hl' : ''}">${cell}</td>`;
      }
      h += '</tr>';
    }
    return h + '</table>';
  }

  pages.points = () => {
    const c = state.calc;
    const out = calcSteps(c);
    const seg = (key, vals, labels) => `<div class="seg" data-key="${key}">${vals.map((v, i) =>
      `<button data-v="${v}" class="${String(c[key]) === String(v) ? 'on' : ''}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
    return `
    <h2>点数：公式、速查表与计算器</h2>
    <div class="formula">基本点 = 符 × 2<sup>(番 + 2)</sup>　　<span style="opacity:.75">上限 2000（满贯）</span>
      <small>子家荣和 ×4　·　亲家荣和 ×6　·　自摸：亲家付 ×2、子家付 ×1（亲家自摸三家各 ×2）　·　每笔都向上进位到百位</small></div>
    <h4>满贯以上：只看番数</h4>
    <table>
      <tr><th>名称</th><th>条件</th><th class="n">基本点</th><th class="n">子家荣和</th><th class="n">亲家荣和</th></tr>
      <tr><td><b>满贯</b></td><td>5 番；或 4 番 40 符以上、3 番 70 符以上</td><td class="n">2,000</td><td class="n">8,000</td><td class="n">12,000</td></tr>
      <tr><td><b>跳满</b></td><td>6 ~ 7 番</td><td class="n">3,000</td><td class="n">12,000</td><td class="n">18,000</td></tr>
      <tr><td><b>倍满</b></td><td>8 ~ 10 番</td><td class="n">4,000</td><td class="n">16,000</td><td class="n">24,000</td></tr>
      <tr><td><b>三倍满</b></td><td>11 ~ 12 番</td><td class="n">6,000</td><td class="n">24,000</td><td class="n">36,000</td></tr>
      <tr><td><b>役满</b></td><td>役满役，或累计 13 番以上</td><td class="n">8,000</td><td class="n">32,000</td><td class="n">48,000</td></tr>
    </table>
    <h4>计算器</h4>
    <div class="calc">
      <span class="lab">番</span>${seg('han', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], null)}
      <span class="lab">符</span>${seg('fu', FUS, null)}
      <span class="lab">身份</span>${seg('dealer', [false, true], ['子家', '亲家'])}
      <span class="lab">和法</span>${seg('tsumo', [false, true], ['荣和', '自摸'])}
      <div class="calc-out"><span class="big">${out.big}</span> <span class="tag2 red" style="margin-left:8px;${out.limit ? '' : 'display:none'}">${out.limit}</span>
        <ol>${out.steps.map((s) => `<li>${s}</li>`).join('')}</ol>${out.warn}</div>
    </div>
    <h4>速查表（${c.dealer ? '亲家' : '子家'} · ${c.tsumo ? '自摸' : '荣和'}）</h4>
    <p style="opacity:.7;font-size:13px;margin-top:0">点击任意格子可以把它送进上面的计算器。5 番以上请看满贯表。</p>
    ${scoreTable(c)}
    <h4>本场与供托</h4>
    <p>· <em>本场</em>：每有一个本场棒，荣和 +300 点；自摸时每家多付 100 点。</p>
    <p>· <em>供托</em>：桌上的立直棒（每根 1000 点）归下一个和牌的人。</p>
    <p>· <em>流局</em>：未听牌的人合计支付 3000 点，由听牌的人平分。</p>
    `;
  };

  function caseHTML(b, title) {
    const dealer = b.seat === 0;
    const lines = R.explain(b.res, dealer, b.tsumo, 0);
    return `<div class="case">${title ? `<h5>${title}</h5>` : ''}
      <div class="quiz-hand">${handHTML(b)}</div>${condHTML(b)}
      <ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol>
      <div class="ans">${b.res.yakuman ? '' : b.res.fu + ' 符 ' + b.res.han + ' 番　'}${b.res.limit ? b.res.limit + '　' : ''}${payText(b.res, dealer, b.tsumo)}</div></div>`;
  }

  const CASES = [
    ['① 最常见的 30 符：立直 · 平和 · 断幺九', { hand: '234m 567m 23p 678s 55s', win: '4p', riichi: 1, seat: 1 },
      '平和荣和永远是 30 符（底符 20 + 门清荣和 10）。这是实战里出现最多的牌型。'],
    ['② 副露的小牌：役牌 中，嵌张自摸', { hand: '123m 567p 24s 99s', win: '3s', tsumo: true, seat: 2, melds: [['pon', '777z']] },
      '碰了中就有役了。符：自摸 2 + 幺九明刻 4 + 嵌张 2，合计 28 进位到 30。子家自摸时写作「300 / 500」——子家付 300，亲家付 500。'],
    ['③ 亲家的 40 符：暗刻 + 役牌雀头', { hand: '111m 456p 789s 23s 55z', win: '4s', tsumo: true, riichi: 1, seat: 0 },
      '幺九暗刻一组就有 8 符，再加役牌雀头，很容易越过 30 进到 40。亲家自摸写作「1300 ALL」。'],
    ['④ 4 番 40 符 = 满贯', { hand: '222m 567m 34p 678s 66s', win: '5p', riichi: 1, seat: 1, dora: '5s' },
      '40 × 2⁶ = 2560，超过 2000 封顶为满贯。对比：同样 4 番如果只有 30 符，30 × 64 = 1920，子家荣和是 7700 点——差一组暗刻，少 300 点。'],
    ['⑤ 七对子：固定 25 符', { hand: '1133m 5577p 2266s 4z', win: '4z', tsumo: true, riichi: 1, seat: 3 },
      '七对子不进位，直接用 25 符套公式：25 × 2⁶ = 1600。'],
  ];

  pages.cases = () => `
    <h2>例题：一步一步算</h2>
    <p class="lead">下面每一手牌的拆解都由对局里使用的同一套规则引擎算出，和实战结算完全一致。</p>
    ${CASES.map(([title, o, note]) => caseHTML(build(o), title) + `<p style="opacity:.8;font-size:14px;margin:-6px 4px 22px">${note}</p>`).join('')}
    <div class="note">看懂了就去「练习」试试：随机出题，答完立刻给出同样格式的拆解。</div>
  `;

  // ------------------------------------------------------------ 练习
  function randomProblem() {
    for (let tries = 0; tries < 3000; tries++) {
      const cnt = new Array(34).fill(0);
      const sets = [];
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        if (Math.random() < 0.66) {
          const t = rnd(3) * 9 + rnd(7);
          if (cnt[t] > 3 || cnt[t + 1] > 3 || cnt[t + 2] > 3) ok = false;
          else {
            cnt[t]++; cnt[t + 1]++; cnt[t + 2]++;
            sets.push({ k: 'seq', t });
          }
        } else {
          const t = rnd(34);
          if (cnt[t] > 1) ok = false;
          else {
            cnt[t] += 3;
            sets.push({ k: 'tri', t });
          }
        }
      }
      if (!ok) continue;
      const pair = rnd(34);
      if (cnt[pair] > 2) continue;
      cnt[pair] += 2;
      if (cnt.some((x) => x > 4)) continue;

      // 牌 id 分配（赤五偶尔出现）
      const free = [];
      for (let t = 0; t < 34; t++) {
        const five = t < 27 && t % 9 === 4;
        free.push(five ? (Math.random() < 0.18 ? [0, 1, 2, 3] : [1, 2, 3, 0]) : [0, 1, 2, 3]);
      }
      const take = (t) => t * 4 + free[t].shift();

      const seat = rnd(4), round = rnd(2);
      const melds = [];
      const closed = [];
      let nOpen = 0;
      for (const s of sets) {
        const r = Math.random();
        if (s.k === 'seq') {
          const tiles = [take(s.t), take(s.t + 1), take(s.t + 2)];
          if (r < 0.2 && nOpen < 2) {
            nOpen++;
            melds.push({ type: 'chi', tiles, called: tiles[rnd(3)], from: (seat + 3) % 4 });
          } else closed.push(tiles);
        } else {
          const tiles = [take(s.t), take(s.t), take(s.t)];
          if (r < 0.1 && cnt[s.t] === 3) {
            tiles.push(take(s.t));
            cnt[s.t]++;
            if (Math.random() < 0.5) melds.push({ type: 'ankan', tiles, from: seat });
            else {
              nOpen++;
              melds.push({ type: 'minkan', tiles, called: tiles[0], from: (seat + 1 + rnd(3)) % 4 });
            }
          } else if (r < 0.32 && nOpen < 2) {
            nOpen++;
            melds.push({ type: 'pon', tiles, called: tiles[0], from: (seat + 1 + rnd(3)) % 4 });
          } else closed.push(tiles);
        }
      }
      closed.push([take(pair), take(pair)]);
      const grp = closed[rnd(closed.length)];
      const winTile = grp[rnd(grp.length)];
      const hand = [].concat(...closed);
      const tsumo = Math.random() < 0.4;
      const menzen = nOpen === 0;
      const riichi = menzen && Math.random() < 0.6 ? 1 : 0;
      const ippatsu = riichi && Math.random() < 0.12;
      const dts = [];
      for (let t = 0; t < 34; t++) if (cnt[t] === 0) dts.push(t);
      const doraInd = [dts[rnd(dts.length)] * 4 + 3];
      const res = MJ.evaluateWin({
        hand, melds, winTile, tsumo, riichi, ippatsu: !!ippatsu,
        seatWind: seat, roundWind: round, doraInd, uraInd: [],
      });
      if (!res || res.yakuman) continue;
      if (res.han > 4 && Math.random() < 0.8) continue;
      if (res.han > 8) continue;
      return { hand: hand.filter((x) => x !== winTile), winTile, melds, doraInd, res, seat, round, tsumo, riichi, ippatsu: !!ippatsu };
    }
    return build({ hand: '234m 567m 23p 678s 55s', win: '4p', riichi: 1, seat: 1 });
  }

  function newQuiz() {
    const b = randomProblem();
    const dealer = b.seat === 0;
    const correct = MJ.calcPayments(b.res.base, dealer, b.tsumo, 0).total;
    const opts = new Set([correct]);
    const tryAdd = (han, fu, d) => {
      if (han < 1 || fu < 20) return;
      const v = MJ.calcPayments(MJ.basePoints(han, fu, 0), d, b.tsumo, 0).total;
      if (opts.size < 4) opts.add(v);
    };
    const { han, fu } = b.res;
    const cands = [[han, fu + 10, dealer], [han - 1, fu, dealer], [han + 1, fu, dealer], [han, fu, !dealer], [han, fu - 10, dealer], [han + 1, fu + 10, dealer], [han - 1, fu + 20, dealer], [han + 2, fu, dealer], [han, fu + 20, dealer]];
    cands.sort(() => Math.random() - 0.5);
    for (const [h, f, d] of cands) tryAdd(h, f, d);
    state.quiz = { b, correct, pts: [...opts].sort((x, y) => x - y), ans: { fu: null, han: null, pts: null }, done: false };
  }

  pages.quiz = () => {
    if (!state.quiz) newQuiz();
    const q = state.quiz;
    const b = q.b;
    const res = b.res;
    const hanOpts = [1, 2, 3, 4, 5, 6, 7, 8];
    const cls = (key, v, right) => {
      const a = q.ans[key];
      if (a == null && !q.done) return '';
      if (v === right && (q.done || a === right)) return 'right';
      if (a === v) return a === right ? 'right' : 'wrong';
      return '';
    };
    const seg = (key, vals, right, f) => `<div class="seg" data-q="${key}">${vals.map((v) =>
      `<button data-v="${v}" class="${cls(key, v, right)}">${f ? f(v) : v}</button>`).join('')}</div>`;
    const answered = q.ans.fu != null && q.ans.han != null && q.ans.pts != null;
    const show = q.done || answered;
    let explain = '';
    if (show) {
      const dealer = b.seat === 0;
      explain = `<div class="case" style="margin-top:16px"><h5>拆解</h5><ol>${R.explain(res, dealer, b.tsumo, 0).map((l) => `<li>${l}</li>`).join('')}</ol>
        <div class="ans">${res.fu} 符 ${res.han} 番　${res.limit ? res.limit + '　' : ''}${payText(res, dealer, b.tsumo)}</div></div>`;
    }
    return `
    <h2>练习 <span class="quiz-score">答对 ${state.score.ok} / ${state.score.n} 题</span></h2>
    <p class="lead">看牌，依次回答符、番和总点数。番数包含宝牌；点数是和牌者一共拿到的分数（不含本场与供托）。</p>
    <div class="quiz-hand">${handHTML(b)}</div>
    ${condHTML(b)}
    <div class="quiz-q">
      <span class="lab">符</span>${seg('fu', FUS, res.fu)}
      <span class="lab">番</span>${seg('han', hanOpts, res.han)}
      <span class="lab">点数</span>${seg('pts', q.pts, q.correct, fmt)}
    </div>
    ${explain}
    <div class="btn-row">${show ? '' : '<button class="btn" data-a="reveal">看答案</button>'}<button class="btn primary" data-a="nextq">${show ? '下一题' : '换一题'}</button></div>
    `;
  };

  // ------------------------------------------------------------ 外壳
  function render(keepScroll) {
    const root = $('#tutorial');
    const main = $('.tut main', root);
    const top = main ? main.scrollTop : 0;
    root.innerHTML = `<div class="overlay"><div class="card tut">
      <nav><h3>点数教程</h3>${CHAPTERS.map((c) =>
        `<button data-ch="${c.id}" class="${c.id === state.chapter ? 'on' : ''}">${c.name}<small>${c.sub}</small></button>`).join('')}
        <button class="close" data-a="close">关闭</button></nav>
      <main>${pages[state.chapter]()}</main></div></div>`;
    if (keepScroll) {
      const m = $('.tut main', root);
      m.style.scrollBehavior = 'auto';
      m.scrollTop = top;
      Array.from(m.children).forEach((el) => { el.style.animation = 'none'; });
    }
  }

  function onClick(e) {
    const t = e.target.closest('button, td');
    if (!t) {
      if (e.target.classList.contains('overlay')) close();
      return;
    }
    const S = MJ.Sound;
    if (t.dataset.ch) {
      state.chapter = t.dataset.ch;
      S.play('click');
      return render(false);
    }
    if (t.dataset.a === 'close') return close();
    const seg = t.closest('.seg');
    if (seg && seg.dataset.key) {
      const key = seg.dataset.key;
      const v = t.dataset.v;
      state.calc[key] = v === 'true' ? true : v === 'false' ? false : +v;
      S.play('click');
      return render(true);
    }
    if (t.tagName === 'TD' && t.dataset.han) {
      state.calc.han = +t.dataset.han;
      state.calc.fu = +t.dataset.fu;
      S.play('click');
      return render(true);
    }
    if (seg && seg.dataset.q) {
      const q = state.quiz;
      const key = seg.dataset.q;
      if (q.done || q.ans[key] != null) return;
      q.ans[key] = +t.dataset.v;
      const right = key === 'fu' ? q.b.res.fu : key === 'han' ? q.b.res.han : q.correct;
      S.play(q.ans[key] === right ? 'ok' : 'bad');
      if (q.ans.fu != null && q.ans.han != null && q.ans.pts != null) {
        q.done = true;
        state.score.n++;
        if (q.ans.fu === q.b.res.fu && q.ans.han === q.b.res.han && q.ans.pts === q.correct) state.score.ok++;
      }
      return render(true);
    }
    if (t.dataset.a === 'reveal') {
      state.quiz.done = true;
      state.score.n++;
      return render(true);
    }
    if (t.dataset.a === 'nextq') {
      newQuiz();
      S.play('click');
      return render(false);
    }
  }

  function open(chapter) {
    if (chapter) state.chapter = chapter;
    const root = $('#tutorial');
    root.classList.add('show');
    render(false);
  }

  function close() {
    const root = $('#tutorial');
    root.classList.remove('show');
    root.innerHTML = '';
  }

  function init() {
    $('#tutorial').addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#tutorial').classList.contains('show')) close();
    });
  }

  MJ.Tutorial = { open, close, init, randomProblem, build };
})();
