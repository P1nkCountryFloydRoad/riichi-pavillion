/* AI：基于向听数与有效牌（牌效）的进攻 + 现物/筋/字牌的防守判断。
 * 只使用该座位能合法看到的信息。接口与人类玩家相同，可整体替换为更强的模型。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const { typeOf, isRed, isYaochu, counts, shanten, shantenRegular, evaluateWin, doraFromIndicator } = MJ;

  function valueHonors(g, seat) {
    return [31, 32, 33, 27 + g.roundWind, 27 + g.seatWind(seat)];
  }

  function meldIsSimple(m) {
    return m.tiles.every((id) => !isYaochu(typeOf(id)));
  }

  /** 副露后的做牌方针：menzen 门清 / free 已有役 / tanyao 断幺 / none 无役 */
  function planOf(g, seat, c, melds) {
    if (melds.every((m) => m.type === 'ankan')) return 'menzen';
    const vh = valueHonors(g, seat);
    for (const m of melds) if (m.type !== 'chi' && vh.includes(typeOf(m.tiles[0]))) return 'free';
    for (const t of vh) if (c[t] >= 3) return 'free';
    if (g.rules.kuitan && melds.every(meldIsSimple)) return 'tanyao';
    return 'none';
  }

  function effShanten(c, nM, plan) {
    if (plan !== 'tanyao') return shanten(c, nM);
    const d = c.slice();
    for (const t of MJ.YAOCHU_LIST) d[t] = 0;
    return shantenRegular(d, nM);
  }

  function remaining(g, seat) {
    const v = g.visibleCounts(seat);
    return v.map((x) => Math.max(0, 4 - x));
  }

  /** 枚举每种可打的牌：打出后的向听数、有效牌张数 */
  function analyze(hand, nM, plan, rem, allowed) {
    const c = counts(hand);
    const out = [];
    for (let t = 0; t < 34; t++) {
      if (!c[t]) continue;
      if (allowed && !allowed.has(t)) continue;
      c[t]--;
      const s = effShanten(c, nM, plan);
      let uke = 0;
      const acc = [];
      for (let x = 0; x < 34; x++) {
        if (rem[x] <= 0 || c[x] >= 4) continue;
        if (plan === 'tanyao' && isYaochu(x)) continue;
        c[x]++;
        if (effShanten(c, nM, plan) < s) {
          uke += rem[x];
          acc.push(x);
        }
        c[x]--;
      }
      c[t]++;
      out.push({ t, s, uke, acc, value: 0, danger: 0 });
    }
    return out;
  }

  function doraTypes(g) {
    return g.doraInd.map((id) => doraFromIndicator(typeOf(id)));
  }

  // 越小越先打
  function keepScore(g, seat, t, hand) {
    let v;
    if (t >= 27) v = valueHonors(g, seat).includes(t) ? 2.4 : 1;
    else {
      const n = t % 9;
      v = n === 0 || n === 8 ? 2 : n === 1 || n === 7 ? 3 : 4;
    }
    const dora = doraTypes(g);
    for (const d of dora) {
      if (d === t) v += 5;
      else if (t < 27 && d < 27 && ((d / 9) | 0) === ((t / 9) | 0) && Math.abs(d - t) <= 2) v += 0.6;
    }
    if (hand.some((id) => typeOf(id) === t && isRed(id))) v += 4;
    return v;
  }

  /** 听牌时的期望打点：Σ 剩余张数 × 荣和点数 */
  function tenpaiValue(g, seat, hand, cand, rem, canRiichi) {
    const melds = g.melds[seat];
    const idx = hand.findIndex((id) => typeOf(id) === cand.t && !isRed(id));
    const rest = hand.slice();
    rest.splice(idx >= 0 ? idx : hand.findIndex((id) => typeOf(id) === cand.t), 1);
    let total = 0, n = 0;
    for (const x of cand.acc) {
      const fake = x * 4 + 3;
      const res = evaluateWin({
        hand: rest.concat(fake), melds, winTile: fake, tsumo: false,
        riichi: g.riichi[seat] || (canRiichi ? 1 : 0),
        seatWind: g.seatWind(seat), roundWind: g.roundWind,
        doraInd: g.doraInd, uraInd: [],
      });
      const pts = res ? MJ.calcPayments(res.base, seat === g.dealer, false, 0).total : melds.every((m) => m.type === 'ankan') ? 700 : 0;
      total += rem[x] * pts;
      n += rem[x];
    }
    cand.value = total;
    cand.waitCount = n;
  }

  // ------------------------------------------------------------ 防守
  function threats(g, seat) {
    const out = [];
    const junme = g.discards[seat].length;
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      if (g.riichi[s]) out.push({ s, w: 1 });
      else {
        const open = g.melds[s].filter((m) => m.type !== 'ankan').length;
        if (open >= 3) out.push({ s, w: 0.55 });
        else if (open === 2 && junme >= 10) out.push({ s, w: 0.3 });
      }
    }
    return out;
  }

  function dangerVs(g, seat, t, R, rem, dora) {
    const safe = g.safe[R];
    if (safe.has(t)) return 0;
    let d;
    if (t >= 27) {
      const r = rem[t];
      d = r === 0 ? 0.004 : r === 1 ? 0.02 : r === 2 ? 0.045 : 0.07;
    } else {
      const n = t % 9;
      const lo = n >= 3 && safe.has(t - 3);
      const hi = n <= 5 && safe.has(t + 3);
      if (n <= 2) d = hi ? [0.02, 0.035, 0.05][n] : [0.065, 0.09, 0.11][n];
      else if (n >= 6) d = lo ? [0.05, 0.035, 0.02][n - 6] : [0.11, 0.09, 0.065][n - 6];
      else d = lo && hi ? 0.03 : lo || hi ? 0.085 : 0.13;
    }
    if (dora.includes(t)) d *= 1.5;
    return d;
  }

  // ------------------------------------------------------------ 打牌选择
  function chooseDiscard(g, seat, opt) {
    const hand = g.hands[seat];
    const melds = g.melds[seat];
    const nM = melds.length;
    const c = counts(hand);
    const plan = planOf(g, seat, c, melds);
    const rem = remaining(g, seat);
    const allowed = new Set(opt.discards.map(typeOf));
    const cands = analyze(hand, nM, plan, rem, allowed);
    const dora = doraTypes(g);
    const th = threats(g, seat);
    const canRiichi = opt.riichi.length > 0;

    for (const cd of cands) {
      cd.keep = keepScore(g, seat, cd.t, hand);
      for (const x of th) cd.danger += x.w * dangerVs(g, seat, cd.t, x.s, rem, dora);
      if (cd.s === 0) tenpaiValue(g, seat, hand, cd, rem, canRiichi && opt.riichi.includes(cd.t));
    }
    const minS = Math.min.apply(null, cands.map((x) => x.s));
    const attackKey = (x) => (x.s === 0 ? 1e6 + x.value * 10 + x.uke : x.uke * 10) - x.keep;
    const pool = cands.filter((x) => x.s === minS).sort((a, b) => attackKey(b) - attackKey(a));
    let best = pool[0];

    if (th.length) {
      // 牌效接近的候选里挑更安全的
      const near = pool.filter((x) => (minS === 0 ? x.value >= best.value * 0.7 : x.uke >= best.uke * 0.75));
      near.sort((a, b) => a.danger - b.danger || attackKey(b) - attackKey(a));
      const pick = near[0];
      let push;
      if (minS === 0) push = pick.danger < 0.16 || pick.value >= 20000;
      else if (minS === 1) push = pick.uke >= 10 && g.tilesLeft >= 16 && pick.danger <= 0.1;
      else push = pick.danger <= 0.03;
      if (push) best = pick;
      else {
        const fold = cands.slice().sort((a, b) => a.danger - b.danger || a.s - b.s || b.uke - a.uke || a.keep - b.keep);
        best = fold[0];
        best.fold = true;
      }
    }

    // 具体打哪一张：同种牌优先留赤牌
    const ids = opt.discards.filter((id) => typeOf(id) === best.t);
    const id = ids.find((x) => !isRed(x)) != null ? ids.find((x) => !isRed(x)) : ids[0];
    const riichi = !best.fold && best.s === 0 && opt.riichi.includes(best.t) && (best.waitCount || 0) > 0;
    return { type: 'discard', tile: id, riichi, info: best, minS };
  }

  function decideTurn(g, seat, opt) {
    if (opt.tsumo) return { type: 'tsumo' };
    if (opt.kyuushu) {
      // 幺九牌种类不多时流局；十种以上去做国士无双
      const c = counts(g.hands[seat]);
      if (MJ.YAOCHU_LIST.filter((t) => c[t] > 0).length <= 9) return { type: 'kyuushu' };
    }
    if (g.riichi[seat]) {
      if (opt.ankan.length) return { type: 'ankan', t: opt.ankan[0] };
      return { type: 'discard', tile: opt.drawn };
    }
    const choice = chooseDiscard(g, seat, opt);
    const nM = g.melds[seat].length;
    if (!choice.info.fold && (opt.ankan.length || opt.kakan.length)) {
      const c = counts(g.hands[seat]);
      for (const t of opt.ankan) {
        const d = c.slice();
        d[t] = 0;
        if (shanten(d, nM + 1) <= choice.minS) return { type: 'ankan', t };
      }
      for (const t of opt.kakan) {
        const d = c.slice();
        d[t]--;
        if (shanten(d, nM) <= choice.minS && !threats(g, seat).length) return { type: 'kakan', t };
      }
    }
    return { type: 'discard', tile: choice.tile, riichi: choice.riichi };
  }

  // ------------------------------------------------------------ 鸣牌判断
  function decideCall(g, seat, o) {
    if (o.ron) return { type: 'ron' };
    const hand = g.hands[seat];
    const melds = g.melds[seat];
    const nM = melds.length;
    const c = counts(hand);
    const t = typeOf(o.tile);
    const menzen = melds.every((m) => m.type === 'ankan');
    const s0 = shanten(c, nM);
    const th = threats(g, seat);
    if (th.some((x) => x.w >= 1) && s0 >= 2) return { type: 'pass' };
    const vh = valueHonors(g, seat);
    const rem = remaining(g, seat);
    const junme = g.discards[seat].length;

    // 鸣牌后最好的向听数/有效牌
    const simulate = (use, meld) => {
      const rest = hand.slice();
      for (const id of use) rest.splice(rest.indexOf(id), 1);
      const newMelds = melds.concat([meld]);
      const plan = planOf(g, seat, counts(rest), newMelds);
      const list = analyze(rest, nM + 1, plan, rem, null);
      list.sort((a, b) => a.s - b.s || b.uke - a.uke);
      return { plan, s: list[0].s, uke: list[0].uke, rest };
    };

    if (o.pon) {
      const use = hand.filter((id) => typeOf(id) === t).slice(0, 2);
      const sim = simulate(use, { type: 'pon', tiles: use.concat(o.tile) });
      if (vh.includes(t)) {
        if (sim.s < s0 || (sim.s === s0 && s0 >= 2)) return { type: 'pon' };
      } else if (acceptOpen(sim, s0, menzen, junme)) return { type: 'pon' };
    }
    if (o.chi.length) {
      let bestOpt = null, bestSim = null;
      for (const pair of o.chi) {
        const sim = simulate(pair, { type: 'chi', tiles: pair.concat(o.tile) });
        if (!bestSim || sim.s < bestSim.s || (sim.s === bestSim.s && sim.uke > bestSim.uke)) {
          bestSim = sim;
          bestOpt = pair;
        }
      }
      if (acceptOpen(bestSim, s0, menzen, junme)) return { type: 'chi', tiles: bestOpt };
    }
    return { type: 'pass' };
  }

  function acceptOpen(sim, s0, menzen, junme) {
    if (sim.s >= s0) return false;
    // 门清且已接近听牌时保留立直的可能
    if (menzen && (s0 <= 1 || junme < 5)) return false;
    if (sim.plan === 'free') return true;
    if (sim.plan === 'tanyao') {
      // 断幺方针：手里的幺九牌不能太多
      let yao = 0;
      for (const id of sim.rest) if (isYaochu(typeOf(id))) yao++;
      return yao <= 2;
    }
    return false;
  }

  class AIAgent {
    constructor(opts) {
      this.delay = (opts && opts.delay) || null;
    }
    async onTurn(g, seat, opt) {
      if (this.delay) await this.delay('turn', g, seat, opt);
      return decideTurn(g, seat, opt);
    }
    async onCall(g, seat, o) {
      const a = decideCall(g, seat, o);
      if (this.delay && a.type !== 'pass') await this.delay('call', g, seat, o);
      return a;
    }
  }

  MJ.AI = { AIAgent, decideTurn, decideCall, chooseDiscard, analyze, remaining, planOf };
})(typeof window !== 'undefined' ? window : globalThis);
