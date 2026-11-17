// 规则单元测试 + AI 自对局冒烟测试：node test/run.js [局数]
const MJ = require('../js/core.js');
require('../js/game.js');
require('../js/ai.js');
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

(async () => {
  const N = +process.argv[2] || 200;
  const stat = { hands: 0, wins: 0, tsumo: 0, draws: 0, riichi: 0, open: 0, yaku: {}, han: 0, pts: 0, dealin: 0, games: 0, calls: 0 };
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const agents = [0, 1, 2, 3].map(() => new MJ.AI.AIAgent());
    const g = new MJ.Game({
      agents, rng: mulberry(i + 1), length: i % 2 ? 'south' : 'east',
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
          assert.strictEqual(d.deltas.reduce((a, b) => a + b, 0), 0);
        }
        if (type === 'gameEnd') {
          stat.games++;
          assert.strictEqual(d.scores.reduce((a, b) => a + b, 0), 100000);
        }
      },
    });
    await g.run();
  }
  const ms = Date.now() - t0;
  console.log(`self-play: ${stat.games} games, ${stat.hands} hands in ${ms}ms (${(ms / stat.hands).toFixed(1)}ms/hand)`);
  console.log(`  win rate/hand ${(stat.wins / stat.hands * 100).toFixed(1)}%  tsumo ${(stat.tsumo / stat.wins * 100).toFixed(1)}%  draw ${(stat.draws / stat.hands * 100).toFixed(1)}%`);
  console.log(`  riichi/hand ${(stat.riichi / stat.hands).toFixed(2)}  calls/hand ${(stat.calls / stat.hands).toFixed(2)}  open wins ${(stat.open / stat.wins * 100).toFixed(1)}%  avg han ${(stat.han / stat.wins).toFixed(2)}  avg pts ${(stat.pts / stat.wins).toFixed(0)}`);
  console.log('  yaku:', Object.entries(stat.yaku).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
