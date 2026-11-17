/* 对局引擎：牌山、摸打、鸣牌、立直、和牌与流局结算。
 * 通过 agents[seat].onTurn / onCall 取得决策，通过 listener(type, data) 异步通知界面。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const { typeOf, isRed, counts, shanten, waits, evaluateWin, calcPayments } = MJ;

  class Aborted extends Error {}

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.agents = opts.agents;
      this.listener = opts.listener || (async () => {});
      this.length = opts.length || 'south'; // 'east' 东风战 | 'south' 半庄战
      this.rng = opts.rng || Math.random;
      this.scores = [25000, 25000, 25000, 25000];
      this.kyoku = 0;
      this.honba = 0;
      this.sticks = 0;
      this.startDealer = opts.startDealer != null ? opts.startDealer : Math.floor(this.rng() * 4);
      this.over = false;
      this.aborted = false;
      this.handCount = 0;
    }

    get dealer() { return (this.startDealer + this.kyoku) % 4; }
    get roundWind() { return ((this.kyoku / 4) | 0) % 4; }
    seatWind(seat) { return (seat - this.dealer + 4) % 4; }
    get tilesLeft() { return this.live.length - this.livePos - this.kanCount; }
    isMenzen(seat) { return this.melds[seat].every((m) => m.type === 'ankan'); }

    abort() { this.aborted = true; }

    async emit(type, data) {
      if (this.aborted) throw new Aborted();
      await this.listener(type, data || {}, this);
      if (this.aborted) throw new Aborted();
    }

    async run() {
      try {
        await this.emit('gameStart');
        while (!this.over) await this.playHand();
        const order = [0, 1, 2, 3].sort((a, b) => this.scores[b] - this.scores[a] || this.seatDist(a) - this.seatDist(b));
        if (this.sticks) {
          this.scores[order[0]] += this.sticks * 1000;
          this.sticks = 0;
        }
        await this.emit('gameEnd', { ranking: order, scores: this.scores.slice() });
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
      }
    }

    seatDist(seat) { return (seat - this.startDealer + 4) % 4; }

    // ------------------------------------------------------------ 配牌
    setupHand() {
      const tiles = [];
      for (let i = 0; i < 136; i++) tiles.push(i);
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
      }
      this.initHandState(tiles);
    }

    initHandState(tiles) {
      this.handCount++;
      this.live = tiles.slice(0, 122);
      const dead = tiles.slice(122);
      this.rinshan = dead.slice(0, 4);
      this.doraAll = [dead[4], dead[6], dead[8], dead[10], dead[12]];
      this.uraAll = [dead[5], dead[7], dead[9], dead[11], dead[13]];
      this.doraInd = [this.doraAll[0]];
      this.hands = [[], [], [], []];
      this.livePos = 0;
      for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) this.hands[(this.dealer + s) % 4].push(this.live[this.livePos++]);
      this.melds = [[], [], [], []];
      this.discards = [[], [], [], []];
      this.riichi = [0, 0, 0, 0];
      this.ippatsu = [false, false, false, false];
      this.furitenTemp = [false, false, false, false];
      this.furitenRiichi = [false, false, false, false];
      this.safe = [new Set(), new Set(), new Set(), new Set()];
      this.drawn = [null, null, null, null];
      this.kanCount = 0;
      this.noCalls = true;
      this.turn = this.dealer;
      this.lastDiscard = null;
    }

    get uraInd() { return this.uraAll.slice(0, this.doraInd.length); }

    /** 某家视角下已经可见的各种牌张数 */
    visibleCounts(seat) {
      const c = new Array(34).fill(0);
      for (const id of this.hands[seat]) c[id >> 2]++;
      for (let s = 0; s < 4; s++) {
        for (const d of this.discards[s]) if (!d.called) c[d.id >> 2]++;
        for (const m of this.melds[s]) for (const id of m.tiles) c[id >> 2]++;
      }
      for (const id of this.doraInd) c[id >> 2]++;
      return c;
    }

    waitsOf(seat) {
      const h = this.drawn[seat] != null ? this.hands[seat].filter((x) => x !== this.drawn[seat]) : this.hands[seat];
      return waits(counts(h), this.melds[seat].length);
    }

    isFuriten(seat) {
      if (this.furitenTemp[seat] || this.furitenRiichi[seat]) return true;
      const w = waits(counts(this.hands[seat]), this.melds[seat].length);
      if (!w.length) return false;
      const ws = new Set(w);
      return this.discards[seat].some((d) => ws.has(d.id >> 2));
    }

    evalFor(seat, winTile, tsumo, extra) {
      extra = extra || {};
      const first = this.noCalls && this.discards[seat].length === 0;
      return evaluateWin({
        hand: tsumo ? this.hands[seat] : this.hands[seat].concat(winTile),
        melds: this.melds[seat],
        winTile, tsumo,
        riichi: this.riichi[seat],
        ippatsu: this.ippatsu[seat],
        rinshan: !!extra.rinshan,
        chankan: !!extra.chankan,
        haitei: tsumo && !extra.rinshan && this.tilesLeft === 0,
        houtei: !tsumo && !extra.chankan && this.tilesLeft === 0,
        tenhou: tsumo && first && !extra.rinshan && seat === this.dealer,
        chiihou: tsumo && first && !extra.rinshan && seat !== this.dealer,
        seatWind: this.seatWind(seat),
        roundWind: this.roundWind,
        doraInd: this.doraInd,
        uraInd: this.uraInd,
      });
    }

    // ------------------------------------------------------------ 可选操作
    turnOptions(seat, mode, drawn, kuikae) {
      const hand = this.hands[seat];
      const c = counts(hand);
      const nM = this.melds[seat].length;
      const opt = { drawn, tsumo: false, riichi: [], ankan: [], kakan: [], discards: [], mode };
      if (mode !== 'called') {
        if (shanten(c, nM) === -1 && this.evalFor(seat, drawn, true, { rinshan: mode === 'rinshan' })) opt.tsumo = true;
        if (this.tilesLeft > 0 && this.kanCount < 4) {
          for (let t = 0; t < 34; t++) {
            if (c[t] !== 4) continue;
            if (!this.riichi[seat]) opt.ankan.push(t);
            else if (t === typeOf(drawn) && this.riichiKanOK(seat, t)) opt.ankan.push(t);
          }
          if (!this.riichi[seat]) {
            for (const m of this.melds[seat]) if (m.type === 'pon' && c[typeOf(m.tiles[0])] >= 1) opt.kakan.push(typeOf(m.tiles[0]));
          }
        }
        if (this.isMenzen(seat) && !this.riichi[seat] && this.scores[seat] >= 1000 && this.tilesLeft >= 4) {
          for (let t = 0; t < 34; t++) {
            if (!c[t]) continue;
            c[t]--;
            if (shanten(c, nM) === 0) opt.riichi.push(t);
            c[t]++;
          }
        }
      }
      if (this.riichi[seat]) opt.discards = [drawn];
      else {
        const forbid = kuikae || [];
        opt.discards = hand.filter((id) => !forbid.includes(typeOf(id)));
        if (!opt.discards.length) opt.discards = hand.slice();
      }
      return opt;
    }

    riichiKanOK(seat, t) {
      const nM = this.melds[seat].length;
      const before = counts(this.hands[seat].filter((id) => id !== this.drawn[seat]));
      const after = counts(this.hands[seat].filter((id) => typeOf(id) !== t));
      const a = waits(before, nM).join(','), b = waits(after, nM + 1).join(',');
      return a === b && a.length > 0;
    }

    callOptions(s, d, id) {
      const t = typeOf(id);
      const hand = this.hands[s];
      const c = counts(hand);
      const nM = this.melds[s].length;
      const opt = { tile: id, from: d, ron: false, pon: false, kan: false, chi: [] };
      c[t]++;
      const complete = shanten(c, nM) === -1;
      c[t]--;
      if (complete) {
        if (!this.isFuriten(s) && this.evalFor(s, id, false)) opt.ron = true;
        else this.markMissed(s);
      }
      if (!this.riichi[s] && this.tilesLeft > 0) {
        if (c[t] >= 2) opt.pon = true;
        if (c[t] === 3 && this.kanCount < 4) opt.kan = true;
        if (s === (d + 1) % 4 && t < 27) {
          const n = t % 9;
          const pats = [];
          if (n >= 2) pats.push([t - 2, t - 1]);
          if (n >= 1 && n <= 7) pats.push([t - 1, t + 1]);
          if (n <= 6) pats.push([t + 1, t + 2]);
          for (const [a, b] of pats) {
            if (!c[a] || !c[b]) continue;
            const va = this.idVariants(hand, a), vb = this.idVariants(hand, b);
            for (const x of va) for (const y of vb) opt.chi.push([x, y]);
          }
        }
      }
      return opt.ron || opt.pon || opt.kan || opt.chi.length ? opt : null;
    }

    // 同种牌里区分赤/非赤的代表 id
    idVariants(hand, t) {
      const out = [];
      const normal = hand.find((id) => typeOf(id) === t && !isRed(id));
      const red = hand.find((id) => typeOf(id) === t && isRed(id));
      if (normal != null) out.push(normal);
      if (red != null) out.push(red);
      return out;
    }

    markMissed(s) {
      this.furitenTemp[s] = true;
      if (this.riichi[s]) this.furitenRiichi[s] = true;
    }

    // ------------------------------------------------------------ 一局
    async playHand() {
      this.setupHand();
      await this.emit('handStart');
      let seat = this.dealer;
      let mode = 'draw';
      let kuikae = null;

      for (;;) {
        let drawn = null;
        if (mode === 'draw') {
          if (this.tilesLeft <= 0) return this.exhaustiveDraw();
          drawn = this.live[this.livePos++];
        } else if (mode === 'rinshan') {
          drawn = this.rinshan[this.kanCount - 1];
        }
        this.turn = seat;
        if (drawn != null) {
          this.hands[seat].push(drawn);
          this.drawn[seat] = drawn;
          await this.emit('draw', { seat, tile: drawn, rinshan: mode === 'rinshan' });
        }
        const opt = this.turnOptions(seat, mode, drawn, kuikae);
        kuikae = null;
        let act = await this.agents[seat].onTurn(this, seat, opt);
        if (this.aborted) throw new Aborted();
        act = this.sanitizeTurn(seat, opt, act);

        if (act.type === 'tsumo') {
          return this.finishWin([{ seat, from: seat, tile: drawn, tsumo: true, extra: { rinshan: mode === 'rinshan' } }]);
        }

        if (act.type === 'ankan') {
          const t = act.t;
          const tiles = this.hands[seat].filter((id) => typeOf(id) === t);
          this.hands[seat] = this.hands[seat].filter((id) => typeOf(id) !== t);
          const meld = { type: 'ankan', tiles, from: seat };
          this.melds[seat].push(meld);
          this.drawn[seat] = null;
          this.afterKan();
          await this.emit('call', { seat, meld, from: seat, kind: 'ankan' });
          await this.emit('dora', { ind: this.doraInd.slice() });
          mode = 'rinshan';
          continue;
        }

        if (act.type === 'kakan') {
          const t = act.t;
          const meld = this.melds[seat].find((m) => m.type === 'pon' && typeOf(m.tiles[0]) === t);
          const id = this.hands[seat].find((x) => typeOf(x) === t);
          this.hands[seat].splice(this.hands[seat].indexOf(id), 1);
          meld.type = 'kakan';
          meld.tiles.push(id);
          meld.added = id;
          this.drawn[seat] = null;
          await this.emit('call', { seat, meld, from: seat, kind: 'kakan' });
          // 抢杠
          const robbers = [];
          for (let k = 1; k < 4; k++) {
            const s = (seat + k) % 4;
            const c = counts(this.hands[s]);
            c[t]++;
            if (shanten(c, this.melds[s].length) !== -1) continue;
            if (!this.isFuriten(s) && this.evalFor(s, id, false, { chankan: true })) robbers.push(s);
            else this.markMissed(s);
          }
          if (robbers.length) {
            const answers = await Promise.all(robbers.map((s) =>
              this.agents[s].onCall(this, s, { tile: id, from: seat, ron: true, pon: false, kan: false, chi: [], chankan: true })));
            if (this.aborted) throw new Aborted();
            const wins = [];
            robbers.forEach((s, i) => {
              if (answers[i] && answers[i].type === 'ron') wins.push({ seat: s, from: seat, tile: id, tsumo: false, extra: { chankan: true } });
              else this.markMissed(s);
            });
            if (wins.length) return this.finishWin(wins);
          }
          this.afterKan();
          await this.emit('dora', { ind: this.doraInd.slice() });
          mode = 'rinshan';
          continue;
        }

        // ---- 打牌
        const id = act.tile;
        const t = typeOf(id);
        const declare = !!act.riichi && opt.riichi.includes(t);
        const tsumogiri = id === drawn;
        const hi = this.hands[seat].indexOf(id);
        this.hands[seat].splice(hi, 1);
        this.drawn[seat] = null;
        if (declare) {
          this.riichi[seat] = this.noCalls && this.discards[seat].length === 0 ? 2 : 1;
          this.ippatsu[seat] = true;
        } else {
          this.ippatsu[seat] = false;
        }
        if (!this.furitenRiichi[seat]) this.furitenTemp[seat] = false;
        const rec = { id, riichi: declare, tsumogiri, called: false };
        this.discards[seat].push(rec);
        this.lastDiscard = { seat, id };
        for (let r = 0; r < 4; r++) if (r === seat || this.riichi[r]) this.safe[r].add(t);
        await this.emit('discard', { seat, tile: id, riichi: declare, tsumogiri });

        // ---- 他家应答
        const responders = [];
        for (let k = 1; k < 4; k++) {
          const s = (seat + k) % 4;
          const o = this.callOptions(s, seat, id);
          if (o) responders.push({ s, o });
        }
        let answers = [];
        if (responders.length) {
          answers = await Promise.all(responders.map((r) => this.agents[r.s].onCall(this, r.s, r.o)));
          if (this.aborted) throw new Aborted();
        }
        const wins = [];
        responders.forEach((r, i) => {
          const a = answers[i] || { type: 'pass' };
          if (r.o.ron) {
            if (a.type === 'ron') wins.push({ seat: r.s, from: seat, tile: id, tsumo: false, extra: {} });
            else this.markMissed(r.s);
          }
        });
        if (wins.length) return this.finishWin(wins);

        if (declare) {
          this.scores[seat] -= 1000;
          this.sticks++;
          await this.emit('riichiAccepted', { seat });
        }

        let call = null;
        responders.forEach((r, i) => {
          const a = answers[i] || { type: 'pass' };
          if ((a.type === 'pon' && r.o.pon) || (a.type === 'kan' && r.o.kan)) call = { s: r.s, a, o: r.o };
        });
        if (!call) {
          responders.forEach((r, i) => {
            const a = answers[i] || { type: 'pass' };
            if (a.type === 'chi' && r.o.chi.length) call = { s: r.s, a, o: r.o };
          });
        }

        if (!call) {
          seat = (seat + 1) % 4;
          mode = 'draw';
          continue;
        }

        // ---- 执行鸣牌
        const s = call.s;
        rec.called = true;
        this.ippatsu = [false, false, false, false];
        this.noCalls = false;
        let meld;
        if (call.a.type === 'chi') {
          let pair = call.o.chi.find((p) => call.a.tiles && p[0] === call.a.tiles[0] && p[1] === call.a.tiles[1]) || call.o.chi[0];
          for (const x of pair) this.hands[s].splice(this.hands[s].indexOf(x), 1);
          meld = { type: 'chi', tiles: [pair[0], pair[1], id].sort((a, b) => a - b), called: id, from: seat };
          const lo = typeOf(meld.tiles[0]);
          kuikae = [t];
          if (t === lo && lo % 9 <= 5) kuikae.push(lo + 3);
          if (t === lo + 2 && lo % 9 >= 1) kuikae.push(lo - 1);
        } else {
          const need = call.a.type === 'pon' ? 2 : 3;
          const own = this.hands[s].filter((x) => typeOf(x) === t).sort((a, b) => (isRed(a) ? 1 : 0) - (isRed(b) ? 1 : 0));
          // 碰时若有赤牌优先亮出（价值相同，手里留普通牌更灵活）
          const use = call.a.type === 'pon' && own.length === 3 ? own.slice(1) : own.slice(0, need);
          for (const x of use) this.hands[s].splice(this.hands[s].indexOf(x), 1);
          meld = { type: call.a.type === 'pon' ? 'pon' : 'minkan', tiles: use.concat(id), called: id, from: seat };
          kuikae = [t];
        }
        this.melds[s].push(meld);
        this.turn = s;
        const isKan = meld.type === 'minkan';
        if (isKan) this.afterKan();
        await this.emit('call', { seat: s, meld, from: seat, kind: meld.type });
        if (isKan) {
          await this.emit('dora', { ind: this.doraInd.slice() });
          kuikae = null;
        }
        seat = s;
        mode = isKan ? 'rinshan' : 'called';
      }
    }

    afterKan() {
      this.kanCount++;
      this.noCalls = false;
      this.ippatsu = [false, false, false, false];
      this.doraInd.push(this.doraAll[this.kanCount]);
    }

    sanitizeTurn(seat, opt, act) {
      act = act || {};
      if (act.type === 'tsumo' && opt.tsumo) return act;
      if (act.type === 'ankan' && opt.ankan.includes(act.t)) return act;
      if (act.type === 'kakan' && opt.kakan.includes(act.t)) return act;
      if (act.type === 'discard' && opt.discards.includes(act.tile)) return act;
      // 非法操作一律视为摸切
      return { type: 'discard', tile: opt.discards[opt.discards.length - 1] };
    }

    // ------------------------------------------------------------ 结算
    async finishWin(wins) {
      const dealer = this.dealer;
      const deltas = [0, 0, 0, 0];
      const results = [];
      wins.forEach((w, i) => {
        const res = this.evalFor(w.seat, w.tile, w.tsumo, w.extra);
        const honba = i === 0 ? this.honba : 0;
        const pay = calcPayments(res.base, w.seat === dealer, w.tsumo, honba);
        const d = [0, 0, 0, 0];
        if (w.tsumo) {
          for (let s = 0; s < 4; s++) {
            if (s === w.seat) continue;
            const p = w.seat === dealer ? pay.all : s === dealer ? pay.dealer : pay.other;
            d[s] -= p;
            d[w.seat] += p;
          }
        } else {
          d[w.from] -= pay.total;
          d[w.seat] += pay.total;
        }
        let sticks = 0;
        if (i === 0) {
          sticks = this.sticks;
          d[w.seat] += sticks * 1000;
        }
        for (let s = 0; s < 4; s++) deltas[s] += d[s];
        results.push({
          seat: w.seat, from: w.from, tsumo: w.tsumo, winTile: w.tile, res, pay, deltas: d,
          honba, sticks, isDealer: w.seat === dealer,
          hand: MJ.sortIds(this.hands[w.seat].filter((x) => !(w.tsumo && x === w.tile))),
          melds: this.melds[w.seat].map((m) => Object.assign({}, m, { tiles: m.tiles.slice() })),
          doraInd: this.doraInd.slice(),
          uraInd: this.riichi[w.seat] ? this.uraInd : [],
          seatWind: this.seatWind(w.seat), roundWind: this.roundWind,
        });
      });
      const before = this.scores.slice();
      for (let s = 0; s < 4; s++) this.scores[s] += deltas[s];
      this.sticks = 0;
      await this.emit('win', { results, deltas, before, after: this.scores.slice() });
      const renchan = wins.some((w) => w.seat === dealer);
      const played = this.kyoku;
      if (renchan) this.honba++;
      else {
        this.honba = 0;
        this.kyoku++;
      }
      this.checkEnd(played, renchan, dealer);
    }

    async exhaustiveDraw() {
      const dealer = this.dealer;
      const tenpai = [0, 1, 2, 3].map((s) => shanten(counts(this.hands[s]), this.melds[s].length) === 0);
      const n = tenpai.filter(Boolean).length;
      const deltas = [0, 0, 0, 0];
      if (n > 0 && n < 4) {
        for (let s = 0; s < 4; s++) deltas[s] = tenpai[s] ? 3000 / n : -3000 / (4 - n);
      }
      const before = this.scores.slice();
      for (let s = 0; s < 4; s++) this.scores[s] += deltas[s];
      await this.emit('ryuukyoku', { tenpai, deltas, before, after: this.scores.slice() });
      const renchan = tenpai[dealer];
      const played = this.kyoku;
      this.honba++;
      if (!renchan) this.kyoku++;
      this.checkEnd(played, renchan, dealer);
    }

    checkEnd(played, renchan, dealer) {
      if (this.scores.some((x) => x < 0)) {
        this.over = true;
        return;
      }
      const last = this.length === 'east' ? 3 : 7;
      if (played < last) return;
      const top = Math.max.apply(null, this.scores);
      const dealerTop = this.scores[dealer] === top && this.scores.filter((x) => x === top).length === 1;
      if (top >= 30000 && (!renchan || dealerTop || played > last)) this.over = true;
      else if (this.kyoku > last + 4) this.over = true;
    }
  }

  MJ.Game = Game;
  MJ.Aborted = Aborted;
})(typeof window !== 'undefined' ? window : globalThis);
