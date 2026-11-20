// 规则单元测试 + AI 自对局冒烟测试：node test/run.js [局数]
const MJ = require('../js/core.js');
require('../js/game.js');
require('../js/ai.js');
require('../js/store.js');
require('../js/i18n.js');
require('../js/paifu.js');
require('../js/records.js');
require('../js/mjai.js');
require('../js/explain.js');
require('../js/replay.js');
const assert = require('assert');

let pass = 0;
function win(desc, o, expect) {
  const used = {};
  const hand = MJ.parseIds(o.hand, used);
  const winTile = MJ.parseIds(o.win, used)[0];
  const melds = (o.melds || []).map((m) => ({ type: m[0], tiles: MJ.parseIds(m[1], used) }));
  const res = MJ.evaluateWin({
    hand: hand.concat(winTile), melds, winTile, tsumo: !!o.tsumo, riichi: o.riichi || 0, ippatsu: o.ippatsu,
    seatWind: o.seat || 0, roundWind: o.round || 0,
    doraInd: o.dora ? MJ.parseIds(o.dora) : [], uraInd: [],
    rinshan: o.rinshan, haitei: o.haitei, houtei: o.houtei, chankan: o.chankan,
    kuitan: o.kuitan, kazoe: o.kazoe, multiYakuman: o.multiYakuman,
  });
  try {
    if (expect === null) assert.strictEqual(res, null);
    else {
      assert.ok(res, 'expected a win');
      if (expect.han != null) assert.strictEqual(res.han, expect.han, 'han');
      if (expect.fu != null) assert.strictEqual(res.fu, expect.fu, 'fu');
      if (expect.yakuman != null) assert.strictEqual(res.yakuman, expect.yakuman, 'yakuman');
      if (expect.total != null) {
        const pay = MJ.calcPayments(res.base, (o.seat || 0) === 0, !!o.tsumo, 0);
        assert.strictEqual(pay.total, expect.total, 'total');
      }
      if (expect.has) for (const y of expect.has) assert.ok(res.yaku.some((x) => x.name === y), 'missing yaku ' + y + ' in ' + res.yaku.map((x) => x.name));
    }
    pass++;
  } catch (e) {
    console.error('FAIL:', desc, '\n ', e.message, '\n ', res && JSON.stringify({ yaku: res.yaku, han: res.han, fu: res.fu }));
    process.exitCode = 1;
  }
}

// ---- 向听数
const sh = (s) => MJ.shanten(MJ.counts(MJ.parseIds(s)), 0);
assert.strictEqual(sh('123m456p789s1122z'), 0);
assert.strictEqual(sh('123m456p789s11222z'), -1);
assert.strictEqual(sh('19m19p19s1234567z'), 0);
assert.strictEqual(sh('1133557799m1133p'), -1);
assert.strictEqual(sh('147m258p369s1234z'), 6); // 七对子形 6 向听
assert.strictEqual(MJ.shantenRegular(MJ.counts(MJ.parseIds('147m258p369s1234z')), 0), 8);
assert.strictEqual(sh('1122m3344p5566s7z'), 0);
assert.strictEqual(sh('123456789m1234p'), 0);
assert.strictEqual(sh('1112345678999m'), 0);
assert.strictEqual(MJ.waits(MJ.counts(MJ.parseIds('1112345678999m')), 0).length, 9);
assert.strictEqual(MJ.waits(MJ.counts(MJ.parseIds('2345678m234p234s')), 0).join(), '1,4,7');

// ---- 役/符/点
win('平和荣和 30符1番=1000', { hand: '123m567m23p678s55s', win: '4p', seat: 1 }, { han: 1, fu: 30, total: 1000, has: ['平和'] });
win('平和自摸 20符2番', { hand: '234m567m23p678s55s', win: '1p', tsumo: true, seat: 1 }, { han: 2, fu: 20, total: 1500, has: ['平和', '门前清自摸和'] });
win('立直平和断幺 30符3番 子=3900', { hand: '234m567m23p678s55s', win: '4p', riichi: 1, seat: 1 }, { han: 3, fu: 30, total: 3900, has: ['断幺九'] });
win('无役门清荣和', { hand: '123m567m23p678s55s', win: '1p', seat: 1 }, { han: 1, fu: 30 });
win('无役（嵌张）', { hand: '123m567m24p678s55s', win: '3p', seat: 1 }, null);
win('嵌张自摸 30符', { hand: '123m567m24p678s55s', win: '3p', seat: 1, tsumo: true }, { han: 1, fu: 30, total: 1100 });
win('役牌中 明刻 副露', { hand: '123m567m24p55s', win: '3p', seat: 1, melds: [['pon', '777z']] }, { han: 1, fu: 30, total: 1000 });
win('暗刻幺九+单骑 门清荣和 50符', { hand: '111m999p234s678s5z', win: '5z', seat: 1, riichi: 1 }, { han: 1, fu: 50, total: 1600 });
win('七对子 25符2番 子=1600', { hand: '1133m5577p2266s4z', win: '4z', seat: 1 }, { han: 2, fu: 25, total: 1600, has: ['七对子'] });
win('七对子自摸立直 25符4番 子=6400', { hand: '1133m5577p2266s4z', win: '4z', seat: 1, tsumo: true, riichi: 1 }, { han: 4, fu: 25, total: 6400 });
win('亲 30符4番 = 11600', { hand: '234m567m23p678s55s', win: '4p', riichi: 1, ippatsu: true, seat: 0 }, { han: 4, fu: 30, total: 11600 });
win('子 40符4番 = 满贯? 否 7700→ 40符4番=8000', { hand: '222m567m23p678s55s', win: '4p', riichi: 1, ippatsu: true, seat: 1, dora: '4s' }, { han: 5, fu: 40, total: 8000 });
win('清一色门清 6番+', { hand: '123456789m2244m', win: '2m', seat: 1 }, { has: ['清一色'] });
win('混一色副露 2番 + 役牌', { hand: '123m567m9m', win: '9m', seat: 1, melds: [['pon', '555z'], ['chi', '234m']] }, { han: 3, has: ['混一色', '役牌 白'] });
win('对对和三暗刻 荣和双碰→仅对对', { hand: '111m333p55s77s', win: '7s', seat: 1, melds: [['pon', '999m']] }, { has: ['对对和'], han: 2 });
win('四暗刻单骑', { hand: '111m333p555s777s2z', win: '2z', seat: 1 }, { yakuman: 1 });
win('四暗刻自摸', { hand: '111m333p555s77s22z', win: '2z', seat: 1, tsumo: true }, { yakuman: 1 });
win('三暗刻（荣和双碰）', { hand: '111m333p555s77s22z', win: '2z', seat: 1 }, { has: ['三暗刻', '对对和', '自风 南'], han: 5 });
win('国士无双', { hand: '19m19p19s1234567z', win: '1m', seat: 1 }, { yakuman: 1 });
win('大三元', { hand: '555z666z777z12m55p', win: '3m', seat: 1 }, { yakuman: 1 });
win('九莲宝灯', { hand: '1112345678999m', win: '5m', seat: 1 }, { yakuman: 1 });
win('绿一色', { hand: '223344s666s888s6z', win: '6z', seat: 1 }, { yakuman: 1 });
win('字一色+大四喜', { hand: '111z222z333z444z5z', win: '5z', seat: 1 }, { yakuman: 3 });
win('一气通贯门清', { hand: '123456789m23p55s', win: '1p', seat: 1 }, { has: ['一气通贯', '平和'], han: 3 });
win('三色同顺副露', { hand: '234m234s99m55z', win: '5z', seat: 1, melds: [['chi', '234p']] }, { has: ['三色同顺', '役牌 白'], han: 2, fu: 30 });
win('纯全带幺九 门清', { hand: '123m789m123p99s78s', win: '9s', seat: 1 }, { has: ['纯全带幺九', '平和'], han: 4 });
win('混全带幺九 + 平和不成立(边张)', { hand: '123m789m123p11z89s', win: '7s', seat: 2 }, { has: ['混全带幺九'], han: 2, fu: 40 });
win('二杯口', { hand: '223344m556677p5s', win: '5s', seat: 1 }, { has: ['二杯口'], han: 4 });
win('一杯口', { hand: '223344m567p678s5s', win: '5s', seat: 1 }, { has: ['一杯口', '断幺九'], han: 2 });
win('小三元', { hand: '555z666z77z123m45p', win: '6p', seat: 1 }, { has: ['小三元'], han: 4 });
win('混老头对对', { hand: '111m999p11s11z', win: '1z', seat: 1, melds: [['pon', '999s']] }, { has: ['混老头', '对对和'] });
win('暗杠 幺九 32符 → 门清荣和 70符', { hand: '234m567p23s55z', win: '4s', seat: 1, riichi: 1, melds: [['ankan', '1111z']] }, { fu: 70, han: 2 });
win('岭上开花 副露', { hand: '234m567p23s55m', win: '4s', seat: 1, tsumo: true, rinshan: true, melds: [['minkan', '2222z']] }, { han: 2, has: ['岭上开花', '自风 南'] });
win('宝牌 赤', { hand: '234m067m23p678s55s', win: '4p', riichi: 1, seat: 1, dora: '4s' }, { han: 6 });
win('连风雀头 4符', { hand: '123m567m23p678s11z', win: '1p', seat: 0, round: 0, riichi: 1 }, { fu: 40, han: 1 });
win('副露平和形荣和 30符', { hand: '234m567m23p55s', win: '4p', seat: 1, melds: [['chi', '678s']] }, { han: 1, fu: 30, has: ['断幺九'] });
win('高点法：三连刻 vs 顺子', { hand: '111222333m78p55s', win: '6p', seat: 1, tsumo: true }, { has: ['三暗刻'], han: 3, fu: 40 });
win('河底', { hand: '123m567m24p678s55s', win: '3p', seat: 1, houtei: true }, { han: 1, has: ['河底捞鱼'] });

// ---- 规则选项
win('无食断：副露断幺不成立', { hand: '234m567m23p55s', win: '4p', seat: 1, melds: [['chi', '678s']], kuitan: false }, null);
win('无食断：门清断幺照常', { hand: '234m567m23p678s55s', win: '4p', seat: 1, kuitan: false, riichi: 1 }, { has: ['断幺九'] });
win('累计役满', { hand: '1122335577889m', win: '9m', seat: 1, riichi: 1, dora: '4m' }, { total: 32000 });
win('无累计役满 → 三倍满', { hand: '1122335577889m', win: '9m', seat: 1, riichi: 1, dora: '4m', kazoe: false }, { total: 24000 });
win('役满复合关闭：字一色+大四喜 = 单倍', { hand: '111z222z333z444z5z', win: '5z', seat: 1, multiYakuman: false }, { yakuman: 1, total: 32000 });
MJ.setAka(0);
win('赤宝牌 0 枚：赤五不计番', { hand: '234m067m23p678s55s', win: '4p', riichi: 1, seat: 1 }, { han: 3 });
{
  // 流局满贯：直接构造牌局状态，检查判定与支付
  const g = new MJ.Game({ agents: [], rules: {} });
  g.setupHand();
  g.discards[2] = MJ.parseIds('19m1p9s1z7z').map((id) => ({ id, called: false }));
  g.discards[1] = MJ.parseIds('19m5p').map((id) => ({ id, called: false }));
  g.discards[3] = MJ.parseIds('19m').map((id) => ({ id, called: false }));
  g.discards[3][1].called = true;
  assert.ok(g.isNagashi(2) && !g.isNagashi(1) && !g.isNagashi(3) && !g.isNagashi(0));
  let got = null;
  g.listener = async (type, d) => { if (type === 'ryuukyoku') got = d; };
  g.exhaustiveDraw().then(() => {
    assert.deepStrictEqual(got.nagashi, [2]);
    const dealer = g.startDealer;
    const expect = [0, 1, 2, 3].map((s) => (s === 2 ? (dealer === 2 ? 12000 : 8000) : dealer === 2 ? -4000 : s === dealer ? -4000 : -2000));
    assert.deepStrictEqual(got.deltas, expect);
    console.log('nagashi mangan test passed');
  });
}
MJ.setAka(4);
assert.ok(MJ.isRed(53) && MJ.isRed(52));
MJ.setAka(3);
assert.ok(!MJ.isRed(53));

assert.deepStrictEqual(MJ.calcPayments(2000, false, true, 1), { dealer: 4100, other: 2100, total: 8300 });
assert.deepStrictEqual(MJ.calcPayments(2000, true, false, 2), { total: 12600 });
assert.strictEqual(MJ.basePoints(4, 30, 0), 1920);
assert.strictEqual(MJ.basePoints(4, 40, 0), 2000);
assert.strictEqual(MJ.basePoints(3, 70, 0), 2000);
console.log('unit tests passed:', pass);

// ---- 自对局
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ 终局精算
{
  const R = { startPoints: 25000, goalPoints: 30000, uma: '15-5' };
  // 45000 / 30000 / 20000 / 5000 → +50 / +5 / −15 / −40（一位含返点差 +20）
  assert.deepStrictEqual(MJ.calcFinal([45000, 30000, 20000, 5000], [0, 1, 2, 3], R), [50, 5, -15, -40]);
  // 带小数、负分，合计为 0
  const p = MJ.calcFinal([-1200, 32300, 41400, 27500], [2, 1, 3, 0], R);
  assert.deepStrictEqual(p, [-46.2, 7.3, 46.4, -7.5]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0)) < 1e-9);
  // 无马、起始点 = 返点：只看点差
  assert.deepStrictEqual(MJ.calcFinal([30000, 30000, 30000, 30000], [0, 1, 2, 3], { startPoints: 30000, goalPoints: 30000, uma: 'none' }), [0, 0, 0, 0]);
  // 10-30
  assert.deepStrictEqual(MJ.calcFinal([25000, 25000, 25000, 25000], [3, 2, 1, 0], { startPoints: 25000, goalPoints: 30000, uma: '10-30' }), [-35, -15, 5, 45]);
  pass += 4;
  console.log('final points: 4 cases ok');
}

// ------------------------------------------------------------ 鸣牌裁定：结果确定后立即结束
async function callPriorityTests() {
  const never = () => new Promise(() => {});
  const o = (x) => Object.assign({ ron: false, pon: false, kan: false, chi: [] }, x);
  const mk = (agents) => new MJ.Game({ agents, rules: {} });
  // 1) 下家在考虑吃（永不回答），对家宣言碰 → 立即裁定为碰，并撤回下家的提示
  let cancelled = [];
  let g = mk([{}, { onCall: never, cancelCall: (gg, s) => cancelled.push(s) }, { onCall: async () => ({ type: 'pon' }) }, {}]);
  let ans = await g.collectCalls([{ s: 1, o: o({ chi: [[0, 4]] }) }, { s: 2, o: o({ pon: true }) }]);
  assert.strictEqual(ans[1].type, 'pon');
  assert.ok(ans[0].cancelled && ans[0].type === 'pass');
  assert.deepStrictEqual(cancelled, [1]);
  // 2) 有人能荣和还没回答时，碰必须等待
  let release;
  g = mk([{}, { onCall: () => new Promise((r) => { release = r; }) }, { onCall: async () => ({ type: 'pon' }) }, {}]);
  let done = false;
  const p = g.collectCalls([{ s: 1, o: o({ ron: true }) }, { s: 2, o: o({ pon: true }) }]).then((x) => { done = true; return x; });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(done, false, 'pon must wait for a pending ron');
  release({ type: 'ron' });
  ans = await p;
  assert.deepStrictEqual(ans.map((x) => x.type), ['ron', 'pon']);
  // 3) 吃已宣言，但能碰的人还没回答 → 等待；对方跳过后成立吃
  g = mk([{}, { onCall: async () => ({ type: 'chi', tiles: [0, 4] }) }, { onCall: async () => { await new Promise((r) => setTimeout(r, 15)); return { type: 'pass' }; } }, {}]);
  ans = await g.collectCalls([{ s: 1, o: o({ chi: [[0, 4]] }) }, { s: 2, o: o({ pon: true }) }]);
  assert.deepStrictEqual(ans.map((x) => x.type), ['chi', 'pass']);
  assert.ok(!ans[1].cancelled);
  // 4) 双响：两家都能荣和时都要等到
  g = mk([{}, { onCall: async () => ({ type: 'ron' }) }, { onCall: async () => { await new Promise((r) => setTimeout(r, 10)); return { type: 'ron' }; } }, {}]);
  ans = await g.collectCalls([{ s: 1, o: o({ ron: true }) }, { s: 2, o: o({ ron: true }) }]);
  assert.deepStrictEqual(ans.map((x) => x.type), ['ron', 'ron']);
  console.log('call priority: 4 cases ok');
}

/** 牌谱：从保存的 mjai 事件流逐局重建，局数、每局结束点数都要和对局一致 */
async function replayCheck(tr, start) {
  const rec = tr.record;
  assert.ok(rec.paifu, 'paifu flag');
  await tr.paifuSaved;
  const pf = await MJ.Paifu.get(rec.id);
  assert.ok(pf && pf.events.length > 10, 'paifu stored');
  const ev = pf.events;
  assert.strictEqual(ev[0].type, 'start_game');
  assert.strictEqual(ev[ev.length - 1].type, 'end_game');
  const ky = MJ.Replay.splitKyoku(ev);
  assert.strictEqual(ky.length, rec.log.length, 'kyoku count');
  for (let k = 0; k < ky.length; k++) {
    const st = MJ.Replay.stateAt(ev, ky[k], ky[k].end - ky[k].start);
    const e = rec.log[k];
    if (e.deltas) {
      const startSc = ev[ky[k].start].scores;
      // mjai 的 reach_accepted 当场扣 1000，战绩里的 deltas 不含立直棒
      const sticks = [0, 0, 0, 0];
      for (let i = ky[k].start; i <= ky[k].end; i++) if (ev[i].type === 'reach_accepted') sticks[ev[i].actor] += 1000;
      for (let s = 0; s < 4; s++) assert.strictEqual(st.scores[s] - startSc[s], e.deltas[s] - sticks[s], `kyoku ${k} delta seat ${s}`);
    }
    if (k + 1 < ky.length) assert.deepStrictEqual(st.scores, ev[ky[k + 1].start].scores, 'scores carry to next kyoku');
    // 手牌 + 副露 张数守恒
    for (let s = 0; s < 4; s++) {
      const n = st.hands[s].length + st.melds[s].reduce((a, m) => a + Math.min(3, m.consumed.length + (m.type === 'ankan' ? 0 : 1)), 0);
      assert.ok(n === 13 || n === 14, `replay tile count kyoku ${k} seat ${s} = ${n}`);
    }
  }
  const last = MJ.Replay.stateAt(ev, ky[ky.length - 1], 1e9);
  assert.strictEqual(last.scores.reduce((a, b) => a + b, 0) + last.kyotaku * 1000, start * 4);
  stats.replays++;
}
const stats = { replays: 0 };

function i18nTests() {
  assert.strictEqual(MJ.lang, 'zh', 'Node defaults to Chinese');
  assert.strictEqual(MJ.tr('立直'), '立直');
  MJ.lang = 'en';
  try {
    assert.strictEqual(MJ.tr('役牌 白'), 'Yakuhai Haku');
    assert.strictEqual(MJ.tr('场风 东'), 'Round Wind East');
    assert.strictEqual(MJ.tr('幺九暗刻'), 'Closed terminal triplet');
    assert.strictEqual(MJ.L('中', 'en'), 'en');
    assert.strictEqual(MJ.roundName(1, 3, 2), 'South 3 · 2 honba');
    // core.js 里出现的所有役名、满贯名、符的项目都有英文（扫源码里的字面量）
    const src = require('fs').readFileSync(require('path').join(__dirname, '../js/core.js'), 'utf8');
    const names = new Set();
    for (const re of [/name: '([^']+)'/g, /label: '([^']+)'/g, /ym\.push\('([^']+)'\)/g, /sitYakuman\.push\('([^']+)'\)/g, /return '([^']+)'/g])
      for (const m of src.matchAll(re)) names.add(m[1]);
    for (const m of src.matchAll(/\[('[^\]]*役满'[^\]]*)\]/g)) for (const x of m[1].matchAll(/'([^']+)'/g)) names.add(x[1]);
    for (const w of ['两面', '嵌张', '边张', '单骑', '双碰']) names.add(w + '听牌');
    for (const y of ['幺九', '中张']) for (const o of ['明', '暗']) for (const k of ['刻', '杠']) names.add(y + o + k);
    for (const w of ['东', '南', '西', '北']) { names.add('场风 ' + w); names.add('自风 ' + w); }
    assert.ok(names.size > 50, 'scanned ' + names.size + ' terms');
    const missing = [...names].filter((n) => /[\u4e00-\u9fa5]/.test(n) && /[\u4e00-\u9fa5]/.test(MJ.tr(n)));
    assert.deepStrictEqual(missing, [], 'untranslated terms');
  } finally { MJ.lang = 'zh'; }
  console.log('i18n: ok');
}

function parseMetaTests() {
  // 合法动作：打 1m(0)、打 5m 赤(34)、立直(37)、跳过不合法 → mask 位 0、34、37
  const mask = (1n << 0n) | (1n << 34n) | (1n << 37n);
  const r = MJ.Mjai.parseMeta({ type: 'reach', meta: { q_values: [1, 0, 2], mask_bits: mask.toString(), shanten: 0 } });
  assert.deepStrictEqual(r.items.map((x) => x.action), [37, 0, 34]);
  assert.ok(Math.abs(r.items.reduce((a, x) => a + x.p, 0) - 1) < 1e-9);
  assert.deepStrictEqual(r.items[2].tile, { t: 4, red: true });
  assert.strictEqual(r.chosen, 'reach');
  assert.strictEqual(MJ.Mjai.parseMeta({ type: 'none' }), null);
  assert.strictEqual(MJ.Mjai.parseMeta({ meta: { q_values: [1], mask_bits: '3' } }), null, 'length mismatch');
  console.log('parseMeta: ok');
}

function explainTests() {
  const X = MJ.Explain;
  // 实际动作 → Mortal 动作编号
  assert.strictEqual(X.actionOf({ type: 'dahai', actor: 0, pai: '2m' }, 0, 'turn'), 1);
  assert.strictEqual(X.actionOf({ type: 'dahai', actor: 0, pai: '5sr' }, 0, 'turn'), 36);
  assert.strictEqual(X.actionOf({ type: 'dahai', actor: 0, pai: 'C' }, 0, 'turn'), 33);
  assert.strictEqual(X.actionOf({ type: 'reach', actor: 2 }, 2, 'turn'), 37);
  assert.strictEqual(X.actionOf({ type: 'chi', actor: 1, target: 0, pai: '3p', consumed: ['4p', '5p'] }, 1, 'call'), 38);
  assert.strictEqual(X.actionOf({ type: 'chi', actor: 1, target: 0, pai: '4p', consumed: ['5p', '3p'] }, 1, 'call'), 39);
  assert.strictEqual(X.actionOf({ type: 'chi', actor: 1, target: 0, pai: '5pr', consumed: ['3p', '4p'] }, 1, 'call'), 40);
  assert.strictEqual(X.actionOf({ type: 'pon', actor: 3, target: 0, pai: 'E', consumed: ['E', 'E'] }, 3, 'call'), 41);
  assert.strictEqual(X.actionOf({ type: 'hora', actor: 0, target: 2 }, 0, 'call'), 43);
  assert.strictEqual(X.actionOf({ type: 'tsumo', actor: 1, pai: '?' }, 0, 'call'), 45, 'nobody called = pass');
  assert.strictEqual(X.actionOf({ type: 'ryukyoku', deltas: [0, 0, 0, 0] }, 0, 'turn'), 44, 'kyuushu');
  assert.strictEqual(X.actionOf({ type: 'ryukyoku', deltas: [0, 0, 0, 0] }, 0, 'call'), 45);
  assert.deepStrictEqual(X.actionTile(35), { t: 13, red: true });
  // Q 值 → 选项排序与 softmax
  const it = X.items({ q: { 1: 0.3, 7: -0.5, 9: 0.2 } });
  assert.deepStrictEqual(it.map((x) => x.action), [1, 9, 7]);
  assert.ok(Math.abs(it.reduce((a, x) => a + x.p, 0) - 1) < 1e-9);
  // 回放里的决策点
  const U = Array(13).fill('?');
  const ev = [
    { type: 'start_kyoku', bakaze: 'E', dora_marker: '5m', kyoku: 1, honba: 0, kyotaku: 0, oya: 0, scores: [25000, 25000, 25000, 25000], tehais: [U, U, U, U] },
    { type: 'tsumo', actor: 0, pai: '1m' }, { type: 'dahai', actor: 0, pai: '1m', tsumogiri: true },
    { type: 'pon', actor: 2, target: 0, pai: '1m', consumed: ['1m', '1m'] }, { type: 'dahai', actor: 2, pai: '9p', tsumogiri: false },
    { type: 'tsumo', actor: 3, pai: '2s' }, { type: 'reach', actor: 3 }, { type: 'dahai', actor: 3, pai: '2s', tsumogiri: true },
    { type: 'end_kyoku' },
  ];
  const ky = MJ.Replay.splitKyoku(ev)[0];
  const at = (pos) => MJ.Replay.decisionAt(ev, ky, pos);
  assert.strictEqual(at(0), null, 'deal');
  assert.deepStrictEqual(at(1), { seat: 0, kind: 'turn', actual: 0 });
  assert.deepStrictEqual(at(2), { seat: 2, kind: 'call', actual: 41 }, 'pon after own discard');
  assert.deepStrictEqual(at(3), { seat: 2, kind: 'turn', actual: 17 }, 'discard after pon');
  assert.deepStrictEqual(at(4), { seat: 0, kind: 'call', actual: 45 }, 'could seat 0 call?');
  assert.deepStrictEqual(at(5), { seat: 3, kind: 'turn', actual: 37 });
  assert.deepStrictEqual(at(6), { seat: 3, kind: 'turn', actual: 19 }, 'discard after reach');
  assert.strictEqual(at(8), null, 'end');
  console.log('explain: ok');
}

async function paifuStoreTests() {
  await MJ.Paifu.put('a', { events: [1] });
  assert.deepStrictEqual(await MJ.Paifu.get('a'), { events: [1] });
  assert.strictEqual(await MJ.Paifu.get('nope'), null);
  await MJ.Paifu.del('a');
  assert.strictEqual(await MJ.Paifu.get('a'), null);
  console.log('paifu store: ok');
}

(async () => {
  await callPriorityTests();
  parseMetaTests();
  explainTests();
  i18nTests();
  await paifuStoreTests();
  const N = +process.argv[2] || 200;
  const VARIANTS = [
    {},
    { aka: 0, kuitan: false, tobi: false, westRound: false, multiRon: 'head', startPoints: 30000, goalPoints: 30000 },
    { aka: 4, ippatsu: false, uradora: false, kandora: false, kazoe: false, multiYakuman: false, startPoints: 35000, goalPoints: 40000 },
    { kyuushu: false, suufon: false, suucha: false, suukaikan: false, sanchahou: false, nagashi: false, startPoints: 20000 },
  ];
  const aborts = {};
  let nagashi = 0;
  const stat = { hands: 0, wins: 0, tsumo: 0, draws: 0, riichi: 0, open: 0, yaku: {}, han: 0, pts: 0, dealin: 0, games: 0, calls: 0 };
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const agents = [0, 1, 2, 3].map(() => new MJ.AI.AIAgent());
    const rules = VARIANTS[i % VARIANTS.length];
    const start = rules.startPoints || 25000;
    let endPts = null;
    const g = new MJ.Game({
      agents, rng: mulberry(i + 1), length: i % 2 ? 'south' : 'east', rules: Object.assign({ uma: ['15-5', '10-30', 'none', '5-10'][i % 4] }, rules),
      listener: async (type, d, g) => {
        if (type === 'handStart') {
          stat.hands++;
          const all = [].concat(...g.hands, g.live.slice(g.livePos), g.rinshan, g.doraAll, g.uraAll);
          assert.strictEqual(new Set(all).size, 136);
        }
        if (type === 'discard' || type === 'call') {
          // 牌数守恒
          for (let s = 0; s < 4; s++) {
            const n = g.hands[s].length + g.melds[s].length * 3;
            assert.ok(n === 13 || n === 14, 'tile count seat ' + s + ' = ' + n);
          }
        }
        if (type === 'call') stat.calls++;
        if (type === 'riichiAccepted') stat.riichi++;
        if (type === 'win') {
          for (const r of d.results) {
            stat.wins++;
            if (r.tsumo) stat.tsumo++; else stat.dealin++;
            if (!r.res.menzen) stat.open++;
            stat.han += r.res.han;
            stat.pts += r.deltas[r.seat];
            for (const y of r.res.yaku) stat.yaku[y.name] = (stat.yaku[y.name] || 0) + 1;
            assert.ok(r.res.han > 0 && r.res.fu >= 20);
            assert.strictEqual(MJ.shanten(MJ.counts(r.hand.concat(r.winTile)), r.melds.length), -1);
          }
          assert.strictEqual(d.deltas.reduce((a, b) => a + b, 0) - d.results.reduce((a, r) => a + r.sticks * 1000, 0), 0);
        }
        if (type === 'ryuukyoku') {
          stat.draws++;
          nagashi += d.nagashi.length;
          if (rules.nagashi === false) assert.strictEqual(d.nagashi.length, 0);
          assert.strictEqual(d.deltas.reduce((a, b) => a + b, 0), 0);
        }
        if (type === 'abort') {
          aborts[d.kind] = (aborts[d.kind] || 0) + 1;
          assert.notStrictEqual(rules[d.kind], false, 'abortive draw ' + d.kind + ' should be off');
          assert.deepStrictEqual(d.before, d.after);
        }
        if (type === 'win') {
          if (rules.multiRon === 'head') assert.strictEqual(d.results.length, 1);
          if (rules.kandora === false) assert.strictEqual(g.doraInd.length, 1);
        }
        if (type === 'gameEnd') {
          stat.games++;
          assert.strictEqual(d.scores.reduce((a, b) => a + b, 0), start * 4);
          assert.ok(Math.abs(d.points.reduce((a, b) => a + b, 0)) < 1e-9, 'final points sum to 0');
          for (let k = 1; k < 4; k++) assert.ok(d.points[d.ranking[k - 1]] >= d.points[d.ranking[k]], 'points follow ranking');
          endPts = d.points;
          if (rules.tobi !== false) assert.ok(d.scores.filter((x) => x < 0).length <= 1 || true);
        }
      },
    });
    const log = i % 3 === 0 ? new MJ.Mjai.MjaiLog(g) : null;
    const tr = MJ.Records.track(g, { ai: 'test', log });
    await g.run();
    if (log) await replayCheck(tr, start);
    // 记录器统计与对局一致
    const rec = tr.record;
    assert.ok(rec, "record saved at game end");
    assert.deepStrictEqual(rec.points, endPts);
    assert.strictEqual(rec.stats.hands, rec.log.length);
    assert.strictEqual(rec.rank, rec.ranking.indexOf(0) + 1);
    const me = rec.log.reduce((a, e) => a + (e.deltas ? e.deltas[0] : 0), 0);
    assert.ok(Math.abs(rec.score - start - me) <= 1000 * 8, 'seat 0 deltas roughly match final score (sticks)');
    assert.ok(rec.stats.win + rec.stats.dealin <= rec.stats.hands * 2);
    // 和牌牌型：张数正确，且能用记法还原成同样的牌
    for (const e of rec.log) {
      if (e.type !== 'win') continue;
      for (const w of e.wins) {
        const sh = w.shape;
        const n = MJ.parseTypes(sh.hand).length + MJ.parseTypes(sh.win).length +
          sh.melds.reduce((a, m) => a + Math.min(3, MJ.parseTypes(m.tiles).length), 0);
        assert.strictEqual(n, 14, 'shape tile count ' + sh.text);
        assert.ok(sh.text.startsWith(sh.hand) && sh.text.endsWith(sh.win));
        assert.strictEqual(MJ.parseTypes(sh.win).length, 1);
      }
    }
  }
  const all = MJ.Records.list();
  assert.strictEqual(all.length, Math.min(N, 300));
  // 牌谱随战绩导出 / 导入，删除记录时一起删
  const withPf = all.filter((r) => r.paifu);
  assert.ok(withPf.length > 0);
  const full = JSON.parse(JSON.stringify(await MJ.Records.exportAll()));
  assert.strictEqual(Object.keys(full.paifu).length, withPf.length, 'exported paifu');
  MJ.Records.clear();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual((await MJ.Paifu.keys()).length, 0, 'clear removes paifu');
  const ri = await MJ.Records.importAll(full);
  assert.strictEqual(ri.paifu, withPf.length, 'imported paifu');
  MJ.Records.remove(withPf[0].id);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(await MJ.Paifu.get(withPf[0].id), null, 'remove deletes paifu');
  MJ.Records.importData({ records: [withPf[0]] });
  console.log(`  paifu: ${stats.replays} games replayed, export/import ${withPf.length}`);
  // 导出 → 清空 → 导入（再导入一次应全部跳过），汇总不变
  const dump = JSON.parse(JSON.stringify(MJ.Records.exportData()));
  const before = JSON.stringify(MJ.Records.summarize(all));
  MJ.Records.clear();
  assert.strictEqual(MJ.Records.list().length, 0);
  let r1 = MJ.Records.importData(dump);
  assert.deepStrictEqual([r1.added, r1.skipped, r1.bad], [all.length, 0, 0]);
  r1 = MJ.Records.importData(dump.records.concat([{ id: 'x' }]));
  assert.deepStrictEqual([r1.added, r1.skipped, r1.bad], [0, all.length, 1]);
  assert.strictEqual(JSON.stringify(MJ.Records.summarize(MJ.Records.list())), before);
  assert.throws(() => MJ.Records.importData({ foo: 1 }));
  const sm = MJ.Records.summarize(all);
  assert.strictEqual(sm.ranks.reduce((a, b) => a + b, 0), all.length);
  console.log(`  records: seat0 avg rank ${sm.avgRank.toFixed(2)}, win ${(sm.rate.win * 100).toFixed(1)}%, deal-in ${(sm.rate.dealin * 100).toFixed(1)}%, riichi ${(sm.rate.riichi * 100).toFixed(1)}%, open ${(sm.rate.open * 100).toFixed(1)}%, avg win ${Math.round(sm.avgWin)}, total pt ${sm.pt}`);
  const ms = Date.now() - t0;
  console.log(`self-play: ${stat.games} games, ${stat.hands} hands in ${ms}ms (${(ms / stat.hands).toFixed(1)}ms/hand)`);
  console.log(`  win rate/hand ${(stat.wins / stat.hands * 100).toFixed(1)}%  tsumo ${(stat.tsumo / stat.wins * 100).toFixed(1)}%  draw ${(stat.draws / stat.hands * 100).toFixed(1)}%`);
  console.log(`  riichi/hand ${(stat.riichi / stat.hands).toFixed(2)}  calls/hand ${(stat.calls / stat.hands).toFixed(2)}  open wins ${(stat.open / stat.wins * 100).toFixed(1)}%  avg han ${(stat.han / stat.wins).toFixed(2)}  avg pts ${(stat.pts / stat.wins).toFixed(0)}`);
  console.log('  abortive draws:', JSON.stringify(aborts), ' nagashi mangan:', nagashi);
  console.log('  yaku:', Object.entries(stat.yaku).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
