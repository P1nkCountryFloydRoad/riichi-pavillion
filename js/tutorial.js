/* 点数计算教程：讲解、速查表、计算器、例题与随机练习。
 * 所有例题与练习的答案都由规则引擎实时算出，保证与对局中的结算一致。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const R = MJ.R;
  const N = R.notationHTML;
  const fmt = R.fmt;
  const L = MJ.L;
  const tr = MJ.tr;
  const EN = MJ.lang === 'en';
  const WIND = EN ? ['East', 'South', 'West', 'North'] : ['东', '南', '西', '北'];
  const $ = (s, root) => (root || document).querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);

  const CHAPTERS = EN ? [
    { id: 'overview', name: 'Overview', sub: 'Scoring in a few steps' },
    { id: 'han', name: 'Han', sub: 'Yaku and dora' },
    { id: 'fu', name: 'Fu', sub: 'Base, melds, waits' },
    { id: 'points', name: 'Points', sub: 'Formula, tables, calculator' },
    { id: 'cases', name: 'Examples', sub: 'Five hands step by step' },
    { id: 'quiz', name: 'Practice', sub: 'Random hands, instant answers' },
  ] : [
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
    h += `<div class="wt" data-lab="${b.tsumo ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}">${R.tileHTML(b.winTile)}</div>`;
    if (b.melds.length) h += '<div class="melds">' + b.melds.map((m) => R.meldHTML(m, b.seat)).join('') + '</div>';
    return h;
  }

  function condHTML(b) {
    const tags = [];
    tags.push(`<span class="tag2${b.seat === 0 ? ' red' : ''}">${b.seat === 0 ? L('亲家', 'Dealer') : L('子家', 'Non-dealer')}</span>`);
    tags.push(`<span class="tag2">${L('场风', 'Round wind')} ${WIND[b.round]}</span><span class="tag2">${L('自风', 'Seat wind')} ${WIND[b.seat]}</span>`);
    tags.push(`<span class="tag2">${b.tsumo ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}</span>`);
    if (b.riichi) tags.push(`<span class="tag2">${L('立直', 'Riichi')}</span>`);
    if (b.ippatsu) tags.push(`<span class="tag2">${L('一发', 'Ippatsu')}</span>`);
    if (!b.melds.some((m) => m.type !== 'ankan')) tags.push(`<span class="tag2">${L('门清', 'Closed')}</span>`);
    else tags.push(`<span class="tag2">${L('有副露', 'Open')}</span>`);
    let dora = '';
    if (b.doraInd.length) dora = `<span style="margin-left:8px;opacity:.7">${L('宝牌指示牌', 'Dora indicator')}</span><span class="tiles" style="--tw:22px">${b.doraInd.map((id) => R.tileHTML(id)).join('')}</span>`;
    return `<div class="cond">${tags.join('')}${dora}</div>`;
  }

  function payText(res, dealer, tsumo) {
    const p = MJ.calcPayments(res.base, dealer, tsumo, 0);
    if (!tsumo) return L(`${fmt(p.total)} 点`, `${fmt(p.total)} pts`);
    if (dealer) return L(`${fmt(p.all)} 点 ALL（合计 ${fmt(p.total)}）`, `${fmt(p.all)} pts ALL (total ${fmt(p.total)})`);
    return L(`${fmt(p.other)} / ${fmt(p.dealer)} 点（合计 ${fmt(p.total)}）`, `${fmt(p.other)} / ${fmt(p.dealer)} pts (total ${fmt(p.total)})`);
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

  const pagesEn = {};
  pagesEn.overview = () => `
    <h2>How scoring works</h2>
    <p class="lead">Riichi scoring looks complicated, but it comes down to three steps: <em>count han</em>, <em>count fu</em>, then <em>look up the table (or use the formula)</em>. This tutorial walks through each one.</p>
    <div class="steps">
      <div class="step"><i>STEP 1</i><b>Han</b>Add up the han of every <em>yaku</em> in the hand, plus one per dora.</div>
      <div class="step"><i>STEP 2</i><b>Fu</b>Start from 20, add for how you won, triplets and kans, the pair and the wait, then round up to the next 10.</div>
      <div class="step"><i>STEP 3</i><b>Base points</b>fu × 2<sup>han+2</sup>. At 2000 or more it is a mangan, and from there only han matters.</div>
      <div class="step"><i>STEP 4</i><b>Payment</b>Non-dealer ron ×4, dealer ron ×6; a tsumo is split among the other three. Round up to the next 100.</div>
    </div>
    <div class="formula">base points = fu × 2<sup>(han + 2)</sup>
      <small>Example: 30 fu 3 han → 30 × 2⁵ = 960; non-dealer ron 960 × 4 = 3840 → rounded to 3900</small></div>
    <h4>Remember these first</h4>
    <p>· You need <em>at least one yaku</em> to win. Dora only add han; they are not yaku themselves.</p>
    <p>· The <em>dealer</em> earns 1.5× when winning and pays double when someone else tsumos: bigger swings both ways.</p>
    <p>· <em>From 5 han you don't need fu</em>: mangan, haneman, baiman, sanbaiman and yakuman have fixed values.</p>
    <p>· Most real hands are <em>30 fu</em> or <em>40 fu</em>. Learn those two rows and you can handle most situations.</p>
    <div class="note">Every time someone wins, the result window has a “How this hand was scored” section that lists the hand step by step, exactly as here. Reading it while you play is the fastest way to learn.</div>
    <h4>A complete example</h4>
    ${caseHTML(build({ hand: '234m 567m 23p 678s 55s', win: '4p', riichi: 1, seat: 1 }), 'Riichi · Pinfu · Tanyao')}
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

  // 役种表的英文：名称、标签、说明（与 YAKU 一一对应）
  const YAKU_EN = {
    '1 番': ['1 han', [
      ['Riichi', 'Closed only', 'Declare with a closed tenpai hand and put up 1,000 points; afterwards you must discard what you draw.'],
      ['Ippatsu', 'With riichi', 'Win within one go-around after riichi, with no calls in between.'],
      ['Menzen Tsumo', 'Closed only', 'Win by self-draw with no open melds (closed kans are fine).'],
      ['Tanyao', '', 'No 1s, 9s or honors in the hand.'],
      ['Pinfu', 'Closed only', 'Four sequences, a non-value pair, and a two-sided wait.'],
      ['Iipeikou', 'Closed only', 'Two identical sequences in the same suit.'],
      ['Yakuhai', '', 'A triplet or kan of White, Green, Red, the round wind or your seat wind.'],
      ['Rinshan Kaihou', '', 'Win on the replacement tile drawn after a kan.'],
      ['Chankan', '', 'Ron on the tile another player adds to a pon to make a kan.'],
      ['Haitei / Houtei', '', 'Win by tsumo on the last wall tile / by ron on the last discard.'],
    ]],
    '2 番': ['2 han', [
      ['Double Riichi', 'Closed only', 'Declare riichi on your very first discard, with no calls before it.'],
      ['Chiitoitsu', 'Closed only · fixed 25 fu', 'Seven different pairs.'],
      ['Sanshoku Doujun', '−1 han if open', 'The same sequence in all three suits.'],
      ['Ittsuu', '−1 han if open', '123, 456 and 789 in one suit.'],
      ['Chanta', '−1 han if open', 'Every meld and the pair contain a terminal or honor, with at least one honor.'],
      ['Toitoi', '', 'Four triplets (or kans) and a pair.'],
      ['Sanankou', '', 'Three concealed triplets (completed by your own draws).'],
      ['Sanshoku Doukou', '', 'Triplets of the same number in all three suits.'],
      ['Sankantsu', '', 'Three kans by one player.'],
      ['Shousangen', '4 han in practice', 'Triplets of two dragons with the third dragon as the pair.'],
      ['Honroutou', '', 'Only 1s, 9s and honors.'],
    ]],
    '3 番': ['3 han', [
      ['Honitsu', '−1 han if open', 'Number tiles from one suit only, plus honors.'],
      ['Junchan', '−1 han if open', 'Every meld and the pair contain a 1 or 9, and no honors.'],
      ['Ryanpeikou', 'Closed only', 'Two iipeikou.'],
    ]],
    '6 番': ['6 han', [
      ['Chinitsu', '−1 han if open', 'Number tiles from a single suit only.'],
    ]],
    '役满': ['Yakuman', [
      ['Kokushi Musou', 'Closed only', 'One of each of the 13 terminals and honors, one of them paired.'],
      ['Suuankou', 'Closed only', 'Four concealed triplets. With a shanpon wait it must be won by tsumo.'],
      ['Daisangen', '', 'Triplets of White, Green and Red.'],
      ['Shousuushii / Daisuushii', '', 'All four winds: three triplets and a pair / four triplets.'],
      ['Tsuuiisou', '', 'Honors only.'],
      ['Chinroutou', '', '1s and 9s only.'],
      ['Ryuuiisou', '', 'Only 2, 3, 4, 6, 8 of bamboo and Green dragon.'],
      ['Chuuren Poutou', 'Closed only', '1112345678999 in one suit plus any tile of that suit.'],
      ['Suukantsu', '', 'Four kans by one player.'],
      ['Tenhou / Chiihou', '', 'Dealer wins on the initial deal / non-dealer wins on their first draw.'],
    ]],
  };

  pages.han = () => `
    <h2>番：役种与宝牌</h2>
    <p class="lead">番数 = 所有成立的役的番数之和 + 宝牌张数。同一手牌可以同时成立多个役，全部累加。</p>
    <div class="note"><b>门清</b>指没有吃、碰、明杠（暗杠不算副露）。标注「门清限定」的役一旦副露就不成立；标注「副露减 1 番」的役副露后少算 1 番。</div>
    ${yakuGroups()}
    <h4>宝牌（不是役，但每张 +1 番）</h4>
    <p>· <em>宝牌</em>：指示牌的<em>下一张</em>。指示牌是 ${N('3m', 'inl')} 时宝牌是 ${N('4m', 'inl')}；9 的下一张回到 1。</p>
    <p>· 字牌的顺序：东 → 南 → 西 → 北 → 东，白 → 发 → 中 → 白。</p>
    <p>· <em>里宝牌</em>：只有立直和牌的人才能翻开，位于指示牌的正下方。</p>
    <p>· <em>赤宝牌</em>：红色的 ${N('0m 0p 0s', 'inl')}，每种一张，拿到就 +1 番。</p>
    <p>· 每开一次杠，就多翻开一张指示牌。</p>
  `;

  function yakuGroups() {
    return YAKU.map((grp) => {
      const en = EN ? YAKU_EN[grp.han] : null;
      return `<h4>${en ? en[0] : grp.han}</h4><div class="yaku-grid">${grp.list.map(([nm, tag, ds, ex], i) => {
        if (en) [nm, tag, ds] = en[1][i];
        return `<div class="yk"><div class="nm">${nm}<span>${tag}</span></div><div class="ds">${ds}</div>${ex ? N(ex) : ''}</div>`;
      }).join('')}</div>`;
    }).join('');
  }

  pagesEn.han = () => `
    <h2>Han: yaku and dora</h2>
    <p class="lead">Han = the han of every yaku in the hand + the number of dora. A hand can have several yaku at once; they all add up.</p>
    <div class="note"><b>Closed</b> means no chi, pon or open kan (a closed kan does not open the hand). Yaku marked “Closed only” are lost once you call; those marked “−1 han if open” are worth one han less.</div>
    ${yakuGroups()}
    <h4>Dora (not a yaku, but +1 han each)</h4>
    <p>· <em>Dora</em>: the tile <em>after</em> the indicator. If the indicator is ${N('3m', 'inl')}, the dora is ${N('4m', 'inl')}; after 9 it wraps to 1.</p>
    <p>· Honor order: East → South → West → North → East, and White → Green → Red → White.</p>
    <p>· <em>Ura dora</em>: revealed only for a player who wins with riichi; it sits under the indicator.</p>
    <p>· <em>Red fives</em>: the red ${N('0m 0p 0s', 'inl')}, worth +1 han each.</p>
    <p>· Every kan reveals one more indicator.</p>
  `;

  pagesEn.fu = () => `
    <h2>Fu: add these up</h2>
    <p class="lead">Fu measure how “hard” the hand is. Start from 20, add the four parts below, and finally <em>round up to the next 10</em> (32 fu → 40 fu).</p>
    <h4>① Base and how you won</h4>
    <table>
      <tr><th>Item</th><th class="n">Fu</th><th>Notes</th></tr>
      <tr><td>Base</td><td class="n"><b>20</b></td><td>Every winning hand</td></tr>
      <tr><td>Closed ron</td><td class="n"><b>+10</b></td><td>Ron with no open melds</td></tr>
      <tr><td>Tsumo</td><td class="n"><b>+2</b></td><td>Not added for pinfu tsumo</td></tr>
    </table>
    <h4>② Melds</h4>
    <p>Sequences are always 0. Triplets start at 2 fu and double for each of “terminal/honor”, “concealed” and “kan” (a kan is ×4).</p>
    <table>
      <tr><th>Meld</th><th class="n">Simples 2–8</th><th class="n">Terminals 1 · 9 · honors</th><th>Example</th></tr>
      <tr><td>Open triplet (pon)</td><td class="n"><b>2</b></td><td class="n"><b>4</b></td><td>${N('555p')}</td></tr>
      <tr><td>Concealed triplet</td><td class="n"><b>4</b></td><td class="n"><b>8</b></td><td>${N('999s')}</td></tr>
      <tr><td>Open kan</td><td class="n"><b>8</b></td><td class="n"><b>16</b></td><td>${N('3333m')}</td></tr>
      <tr><td>Closed kan</td><td class="n"><b>16</b></td><td class="n"><b>32</b></td><td>${N('#11z#')}</td></tr>
    </table>
    <div class="note">A triplet completed by someone else's discard on a ron counts as <em>open</em>. For example, with ${N('77s 22z', 'inl')} waiting on both, winning by ron on ${N('7s', 'inl')} makes ${N('777s', 'inl')} an open triplet worth 2 fu; by tsumo it is concealed, worth 4.</div>
    <h4>③ Pair</h4>
    <table>
      <tr><th>Pair</th><th class="n">Fu</th></tr>
      <tr><td>Dragons ${N('55z', 'inl')} ${N('66z', 'inl')} ${N('77z', 'inl')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>Round wind or seat wind</td><td class="n"><b>+2</b></td></tr>
      <tr><td>Both round and seat wind (double wind)</td><td class="n"><b>+4</b></td></tr>
      <tr><td>Number tiles, other winds</td><td class="n">0</td></tr>
    </table>
    <h4>④ Wait</h4>
    <p>Waits on a single tile get +2 fu; good shapes get nothing.</p>
    <table>
      <tr><th>Wait</th><th>In hand</th><th>Wins on</th><th class="n">Fu</th></tr>
      <tr><td>Ryanmen (two-sided)</td><td>${N('34p')}</td><td>${N('2p 5p')}</td><td class="n">0</td></tr>
      <tr><td>Shanpon (dual pair)</td><td>${N('77s 22z')}</td><td>${N('7s 2z')}</td><td class="n">0</td></tr>
      <tr><td>Kanchan (closed)</td><td>${N('46m')}</td><td>${N('5m')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>Penchan (edge)</td><td>${N('12s')}</td><td>${N('3s')}</td><td class="n"><b>+2</b></td></tr>
      <tr><td>Tanki (pair wait)</td><td>${N('5z')}</td><td>${N('5z')}</td><td class="n"><b>+2</b></td></tr>
    </table>
    <p>When the winning tile can be read as more than one wait (e.g. ${N('3456m', 'inl')} winning on ${N('3m', 'inl')} is both two-sided and a pair wait), use the reading that <em>scores higher</em>.</p>
    <h4>Three special cases</h4>
    <p>· <em>Pinfu tsumo = 20 fu</em>: pinfu does not get the 2 tsumo fu. Pinfu ron is 20 + 10 = 30 fu.</p>
    <p>· <em>Chiitoitsu = 25 fu</em>: a fixed value, not rounded.</p>
    <p>· <em>Open pinfu-shaped ron = 30 fu</em>: with calls, all sequences and a two-sided wait would be only 20 fu; the rule counts it as 30.</p>
    <div class="note">Rule of thumb: a closed ron is at least 30 fu; one concealed or terminal triplet usually takes you to 40; recount carefully when there is a kan.</div>
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
    const up = (x) => (x % 100 === 0 ? fmt(x) : `${fmt(x)} → ${L('进位', 'round up to')} <b>${fmt(MJ.ceil100(x))}</b>`);
    const steps = [];
    const lim = tr(limit);
    if (han >= 5) steps.push(L(`${han} 番 → <b>${limit}</b>，基本点固定为 <b>${fmt(base)}</b>`, `${han} han → <b>${lim}</b>, base points fixed at <b>${fmt(base)}</b>`));
    else if (raw >= 2000) steps.push(L(`基本点 = ${fu} × 2<sup>${han}+2</sup> = ${fmt(raw)}，达到 2000 → <b>满贯</b>，基本点封顶 <b>2000</b>`, `base = ${fu} × 2<sup>${han}+2</sup> = ${fmt(raw)}, reaches 2000 → <b>Mangan</b>, capped at <b>2000</b>`));
    else steps.push(`${L('基本点', 'base')} = ${fu} × 2<sup>${han}+2</sup> = ${fu} × ${Math.pow(2, han + 2)} = <b>${fmt(raw)}</b>`);
    if (!tsumo) steps.push(L(`${dealer ? '亲家' : '子家'}荣和：基本点 × ${dealer ? 6 : 4} = ${up(base * (dealer ? 6 : 4))}`, `${dealer ? 'Dealer' : 'Non-dealer'} ron: base × ${dealer ? 6 : 4} = ${up(base * (dealer ? 6 : 4))}`));
    else if (dealer) steps.push(L(`亲家自摸：三家各付 基本点 × 2 = ${up(base * 2)}，合计 ${fmt(pay.total)}`, `Dealer tsumo: each player pays base × 2 = ${up(base * 2)}, total ${fmt(pay.total)}`));
    else {
      steps.push(L(`子家自摸：亲家付 基本点 × 2 = ${up(base * 2)}`, `Non-dealer tsumo: the dealer pays base × 2 = ${up(base * 2)}`));
      steps.push(L(`另外两家各付 基本点 × 1 = ${up(base)}，合计 ${fmt(pay.total)}`, `the other two pay base × 1 = ${up(base)} each, total ${fmt(pay.total)}`));
    }
    let big;
    if (!tsumo) big = L(`${fmt(pay.total)} 点`, `${fmt(pay.total)} pts`);
    else if (dealer) big = L(`${fmt(pay.all)} 点 ALL`, `${fmt(pay.all)} pts ALL`);
    else big = L(`${fmt(pay.other)} / ${fmt(pay.dealer)} 点`, `${fmt(pay.other)} / ${fmt(pay.dealer)} pts`);
    let warn = '';
    if ((fu === 20 && (!tsumo || han === 1)) || (fu === 25 && (han === 1 || (han === 2 && tsumo)))) {
      warn = `<p style="opacity:.7;font-size:13px;margin:6px 0 0">${L('※ 这个组合在实战中不会出现（20 符只可能是平和自摸，七对子至少 2 番）。', '※ This combination never happens in play (20 fu only comes from pinfu tsumo, and chiitoitsu is at least 2 han).')}</p>`;
    }
    return { steps, big, limit: lim, warn };
  }

  const FUS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

  function scoreTable(c) {
    let h = `<table class="score-table"><tr><th style="text-align:left">${L('符 ＼ 番', 'fu ＼ han')}</th>`;
    for (let han = 1; han <= 4; han++) h += `<th class="${han === c.han ? 'hl' : ''}">${L(han + ' 番', han + ' han')}</th>`;
    h += '</tr>';
    for (const fu of FUS) {
      h += `<tr><th style="text-align:left" class="${fu === c.fu ? 'hl' : ''}">${L(fu + ' 符', fu + ' fu')}</th>`;
      for (let han = 1; han <= 4; han++) {
        const invalid = (fu === 20 && (!c.tsumo || han === 1)) || (fu === 25 && (han === 1 || (han === 2 && c.tsumo)));
        let cell;
        if (invalid) cell = '<span style="opacity:.3">—</span>';
        else {
          const base = MJ.basePoints(han, fu, 0);
          const p = MJ.calcPayments(base, c.dealer, c.tsumo, 0);
          cell = !c.tsumo ? fmt(p.total) : c.dealer ? fmt(p.all) + '<small>ALL</small>' : `${fmt(p.other)}<small>${L('亲', 'dealer')} ${fmt(p.dealer)}</small>`;
          if (base >= 2000) cell += `<small style="color:var(--verm);opacity:1">${L('满贯', 'mangan')}</small>`;
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
    if (EN) return pointsEn(c, out, seg);
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

  function pointsEn(c, out, seg) {
    return `
    <h2>Points: formula, tables and calculator</h2>
    <div class="formula">base points = fu × 2<sup>(han + 2)</sup>　　<span style="opacity:.75">capped at 2000 (mangan)</span>
      <small>Non-dealer ron ×4　·　dealer ron ×6　·　tsumo: dealer pays ×2, others ×1 (dealer tsumo: everyone pays ×2)　·　each payment rounds up to the next 100</small></div>
    <h4>Mangan and above: han only</h4>
    <table>
      <tr><th>Name</th><th>Condition</th><th class="n">Base</th><th class="n">Non-dealer ron</th><th class="n">Dealer ron</th></tr>
      <tr><td><b>Mangan</b></td><td>5 han; or 4 han 40+ fu, 3 han 70+ fu</td><td class="n">2,000</td><td class="n">8,000</td><td class="n">12,000</td></tr>
      <tr><td><b>Haneman</b></td><td>6–7 han</td><td class="n">3,000</td><td class="n">12,000</td><td class="n">18,000</td></tr>
      <tr><td><b>Baiman</b></td><td>8–10 han</td><td class="n">4,000</td><td class="n">16,000</td><td class="n">24,000</td></tr>
      <tr><td><b>Sanbaiman</b></td><td>11–12 han</td><td class="n">6,000</td><td class="n">24,000</td><td class="n">36,000</td></tr>
      <tr><td><b>Yakuman</b></td><td>A yakuman hand, or 13+ han</td><td class="n">8,000</td><td class="n">32,000</td><td class="n">48,000</td></tr>
    </table>
    <h4>Calculator</h4>
    <div class="calc">
      <span class="lab">Han</span>${seg('han', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], null)}
      <span class="lab">Fu</span>${seg('fu', FUS, null)}
      <span class="lab">Seat</span>${seg('dealer', [false, true], ['Non-dealer', 'Dealer'])}
      <span class="lab">Win</span>${seg('tsumo', [false, true], ['Ron', 'Tsumo'])}
      <div class="calc-out"><span class="big">${out.big}</span> <span class="tag2 red" style="margin-left:8px;${out.limit ? '' : 'display:none'}">${out.limit}</span>
        <ol>${out.steps.map((x) => `<li>${x}</li>`).join('')}</ol>${out.warn}</div>
    </div>
    <h4>Score table (${c.dealer ? 'dealer' : 'non-dealer'} · ${c.tsumo ? 'tsumo' : 'ron'})</h4>
    <p style="opacity:.7;font-size:13px;margin-top:0">Click any cell to load it into the calculator above. For 5 han and up, see the mangan table.</p>
    ${scoreTable(c)}
    <h4>Honba and riichi sticks</h4>
    <p>· <em>Honba</em>: each honba counter adds 300 to a ron; on a tsumo each player pays 100 more.</p>
    <p>· <em>Riichi sticks</em>: the 1,000-point sticks on the table go to the next player who wins.</p>
    <p>· <em>Exhaustive draw</em>: players who are not tenpai pay 3,000 in total, split among those who are.</p>
    `;
  }

  function caseHTML(b, title) {
    const dealer = b.seat === 0;
    const lines = R.explain(b.res, dealer, b.tsumo, 0);
    return `<div class="case">${title ? `<h5>${title}</h5>` : ''}
      <div class="quiz-hand">${handHTML(b)}</div>${condHTML(b)}
      <ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol>
      <div class="ans">${b.res.yakuman ? '' : L(b.res.fu + ' 符 ' + b.res.han + ' 番　', b.res.fu + ' fu ' + b.res.han + ' han　')}${b.res.limit ? tr(b.res.limit) + '　' : ''}${payText(b.res, dealer, b.tsumo)}</div></div>`;
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

  const CASES_EN = [
    ['① The most common 30 fu: Riichi · Pinfu · Tanyao', 'A pinfu ron is always 30 fu (base 20 + closed ron 10). This is the most common kind of hand in play.'],
    ['② A small open hand: Red dragon, kanchan tsumo', 'Pon of the red dragon gives the yaku. Fu: tsumo 2 + open honor triplet 4 + kanchan 2 = 28, rounded to 30. A non-dealer tsumo is written “300 / 500”: others pay 300, the dealer pays 500.'],
    ['③ Dealer 40 fu: concealed triplet + value pair', 'One concealed terminal triplet is already 8 fu; add a value pair and you easily pass 30 to 40. A dealer tsumo is written “1300 ALL”.'],
    ['④ 4 han 40 fu = mangan', '40 × 2⁶ = 2560, over 2000, so it is capped as a mangan. Compare: the same 4 han at 30 fu is 30 × 64 = 1920, a 7,700 non-dealer ron — one concealed triplet less costs 300 points.'],
    ['⑤ Chiitoitsu: fixed 25 fu', 'Chiitoitsu is not rounded; use 25 fu directly: 25 × 2⁶ = 1600.'],
  ];

  pagesEn.cases = () => `
    <h2>Examples, step by step</h2>
    <p class="lead">Every breakdown below is computed by the same rules engine used in games, so it matches the in-game results exactly.</p>
    ${CASES.map(([, o], i) => caseHTML(build(o), CASES_EN[i][0]) + `<p style="opacity:.8;font-size:14px;margin:-6px 4px 22px">${CASES_EN[i][1]}</p>`).join('')}
    <div class="note">Once this makes sense, try “Practice”: random hands, with the same breakdown right after you answer.</div>
  `;

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
      explain = `<div class="case" style="margin-top:16px"><h5>${L('拆解', 'Breakdown')}</h5><ol>${R.explain(res, dealer, b.tsumo, 0).map((l) => `<li>${l}</li>`).join('')}</ol>
        <div class="ans">${L(`${res.fu} 符 ${res.han} 番`, `${res.fu} fu ${res.han} han`)}　${res.limit ? tr(res.limit) + '　' : ''}${payText(res, dealer, b.tsumo)}</div></div>`;
    }
    return `
    <h2>${L('练习', 'Practice')} <span class="quiz-score">${L(`答对 ${state.score.ok} / ${state.score.n} 题`, `${state.score.ok} / ${state.score.n} correct`)}</span></h2>
    <p class="lead">${L('看牌，依次回答符、番和总点数。番数包含宝牌；点数是和牌者一共拿到的分数（不含本场与供托）。', 'Look at the hand and answer the fu, the han and the total points. Han include dora; points are what the winner receives in total (without honba or riichi sticks).')}</p>
    <div class="quiz-hand">${handHTML(b)}</div>
    ${condHTML(b)}
    <div class="quiz-q">
      <span class="lab">${L('符', 'Fu')}</span>${seg('fu', FUS, res.fu)}
      <span class="lab">${L('番', 'Han')}</span>${seg('han', hanOpts, res.han)}
      <span class="lab">${L('点数', 'Points')}</span>${seg('pts', q.pts, q.correct, fmt)}
    </div>
    ${explain}
    <div class="btn-row">${show ? '' : `<button class="btn" data-a="reveal">${L('看答案', 'Show answer')}</button>`}<button class="btn primary" data-a="nextq">${show ? L('下一题', 'Next hand') : L('换一题', 'Another hand')}</button></div>
    `;
  };

  // ------------------------------------------------------------ 外壳
  function render(keepScroll) {
    const root = $('#tutorial');
    const main = $('.tut main', root);
    const top = main ? main.scrollTop : 0;
    root.innerHTML = `<div class="overlay"><div class="card tut">
      <nav><h3>${L('点数教程', 'Scoring')}</h3>${CHAPTERS.map((c) =>
        `<button data-ch="${c.id}" class="${c.id === state.chapter ? 'on' : ''}">${c.name}<small>${c.sub}</small></button>`).join('')}
        <button class="close" data-a="close">${L('关闭', 'Close')}</button></nav>
      <main>${((EN && pagesEn[state.chapter]) || pages[state.chapter])()}</main></div></div>`;
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
