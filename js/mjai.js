/* mjai 协议适配：把对局事件转成 mjai 事件，交给本地桥接程序里的 Mortal 决策。
 *
 * 浏览器 ── HTTP ──> tools/mortal_bridge.py ── stdin/stdout ──> mortal.py <seat>
 *
 * 协议要点（libriichi）：每行一个事件；带 "can_act": false 的事件不会得到回应，
 * 需要决策的最后一个事件不带该字段，Mortal 恰好回一行反应。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const L = (zh, en) => (MJ.L ? MJ.L(zh, en) : zh);
  const { typeOf, isRed } = MJ;

  const HONOR = ['E', 'S', 'W', 'N', 'P', 'F', 'C'];

  /** 牌 id → mjai 牌名（"5mr" 为赤五，字牌为 E S W N P F C） */
  function toMjai(id) {
    const t = typeOf(id);
    if (t >= 27) return HONOR[t - 27];
    return ((t % 9) + 1) + 'mps'[(t / 9) | 0] + (isRed(id) ? 'r' : '');
  }

  /** mjai 牌名 → { t, red } */
  function fromMjai(s) {
    const h = HONOR.indexOf(s);
    if (h >= 0) return { t: 27 + h, red: false };
    const n = +s[0];
    const suit = 'mps'.indexOf(s[1]);
    if (!(n >= 1 && n <= 9) || suit < 0) return null;
    return { t: suit * 9 + n - 1, red: s[2] === 'r' };
  }

  /** 在给定的 id 列表里找一张对应 mjai 牌名的牌；prefer 优先（如刚摸到的牌） */
  function pickId(ids, name, prefer, used) {
    const f = fromMjai(name);
    if (!f) return null;
    const ok = (id) => typeOf(id) === f.t && isRed(id) === f.red && !(used && used.includes(id));
    if (prefer != null && ids.includes(prefer) && ok(prefer)) return prefer;
    const hit = ids.find(ok);
    if (hit != null) return hit;
    // 赤/非赤不一致时退而求其次
    return ids.find((id) => typeOf(id) === f.t && !(used && used.includes(id)));
  }

  // ------------------------------------------------------------ 事件记录
  /** 完整信息的 mjai 事件流；每个事件带 hide 标记，按座位脱敏后发送 */
  class MjaiLog {
    constructor(game) {
      this.events = [];
      this.game = game;
      game.taps.push((type, d, g) => this.on(type, d, g));
    }

    push(ev, owner) {
      this.events.push({ ev, owner });
    }

    on(type, d, g) {
      switch (type) {
        case 'gameStart':
          this.push({ type: 'start_game', names: ['P0', 'P1', 'P2', 'P3'] });
          break;
        case 'handStart':
          this.push({
            type: 'start_kyoku',
            bakaze: HONOR[g.roundWind],
            dora_marker: toMjai(g.doraInd[0]),
            kyoku: (g.kyoku % 4) + 1,
            honba: Math.min(g.honba, 255),
            kyotaku: Math.min(g.sticks, 255),
            oya: g.dealer,
            scores: g.scores.slice(),
            tehais: g.hands.map((h) => MJ.sortIds(h).map(toMjai)),
          }, 'tehais');
          break;
        case 'draw':
          this.push({ type: 'tsumo', actor: d.seat, pai: toMjai(d.tile) }, d.seat);
          break;
        case 'discard':
          if (d.riichi) this.push({ type: 'reach', actor: d.seat });
          this.push({ type: 'dahai', actor: d.seat, pai: toMjai(d.tile), tsumogiri: !!d.tsumogiri });
          break;
        case 'riichiAccepted':
          this.push({ type: 'reach_accepted', actor: d.seat });
          break;
        case 'call': {
          const m = d.meld;
          if (d.kind === 'ankan') this.push({ type: 'ankan', actor: d.seat, consumed: m.tiles.map(toMjai) });
          else if (d.kind === 'kakan') {
            this.push({ type: 'kakan', actor: d.seat, pai: toMjai(m.added), consumed: m.tiles.filter((x) => x !== m.added).map(toMjai) });
          } else {
            this.push({
              type: d.kind === 'minkan' ? 'daiminkan' : d.kind,
              actor: d.seat, target: d.from, pai: toMjai(m.called),
              consumed: m.tiles.filter((x) => x !== m.called).map(toMjai),
            });
          }
          break;
        }
        case 'dora':
          this.push({ type: 'dora', dora_marker: toMjai(d.ind[d.ind.length - 1]) });
          break;
        case 'win':
          for (const r of d.results) {
            const ev = { type: 'hora', actor: r.seat, target: r.from, deltas: r.deltas };
            if (r.uraInd.length) ev.ura_markers = r.uraInd.map(toMjai);
            this.push(ev);
          }
          this.push({ type: 'end_kyoku' });
          break;
        case 'ryuukyoku':
        case 'abort':
          this.push({ type: 'ryukyoku', deltas: d.deltas.slice() });
          this.push({ type: 'end_kyoku' });
          break;
        case 'gameEnd':
          this.push({ type: 'end_game' });
          break;
      }
    }

    /** 某座位视角下的事件（隐藏他家手牌与摸牌） */
    view(i, seat) {
      const { ev, owner } = this.events[i];
      if (owner === 'tehais') {
        return Object.assign({}, ev, { tehais: ev.tehais.map((h, s) => (s === seat ? h : h.map(() => '?'))) });
      }
      if (typeof owner === 'number' && owner !== seat) return Object.assign({}, ev, { pai: '?' });
      return ev;
    }
  }

  // ------------------------------------------------------------ 桥接客户端
  async function post(url, body, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // 避免 CORS 预检
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 检查桥接程序是否在线：返回 { ok, engine, error } */
  async function ping(url) {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
      const res = await fetch(url.replace(/\/+$/, '') + '/health', { signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      const j = await res.json();
      return { ok: !!j.ok, engine: j.engine || 'mjai', error: j.error };
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? L('连接超时', 'connection timed out') : String(e && e.message || e) };
    }
  }

  // ------------------------------------------------------------ Agent
  /**
   * 用 mjai 机器人决策的玩家。出错（桥接断开、超时、给出非法操作）时退回到 fallback。
   * opts: { url, log: MjaiLog, fallback: agent, onError(msg), session }
   */
  class MjaiAgent {
    constructor(opts) {
      this.url = opts.url.replace(/\/+$/, '');
      this.log = opts.log;
      this.fallback = opts.fallback;
      this.onError = opts.onError || (() => {});
      this.session = opts.session;
      this.cursor = 0;
      this.skipReach = false;
      this.broken = false;
    }

    /** 把自上次以来的事件发给机器人；need 为 true 时最后一个事件等待回应 */
    async send(seat, extra, need) {
      const evs = [];
      const n = this.log.events.length;
      for (let i = this.cursor; i < n; i++) {
        const e = this.log.view(i, seat);
        // 自己宣言立直时已经提前发过 reach
        if (this.skipReach && e.type === 'reach' && e.actor === seat) {
          this.skipReach = false;
          continue;
        }
        evs.push(e);
      }
      this.cursor = n;
      for (const e of extra || []) evs.push(e);
      const lines = evs.map((e, i) => Object.assign({}, e, i === evs.length - 1 && need ? {} : { can_act: false }));
      const reset = lines.length > 0 && lines[0].type === 'start_game';
      const r = await post(this.url + '/react', { session: this.session, seat, reset, events: lines, need: !!need }, 90000);
      if (r.error) throw new Error(r.error);
      return r.reaction || null;
    }

    fail(err) {
      if (!this.broken) {
        this.broken = true;
        this.onError(String(err && err.message || err));
      }
    }

    /** 未出错时也同步事件，保证之后的决策有完整的上下文 */
    async onTurn(g, seat, opt) {
      if (this.broken) return this.fallback.onTurn(g, seat, opt);
      try {
        let r = await this.send(seat, null, true);
        if (r && r.type === 'reach') {
          if (!opt.riichi.length) throw new Error(L('机器人在不能立直时宣言了立直', 'the bot declared riichi when riichi was not allowed'));
          this.skipReach = true;
          r = await this.send(seat, [{ type: 'reach', actor: seat }], true);
          const a = this.mapTurn(g, seat, opt, r);
          if (a && a.type === 'discard' && opt.riichi.includes(typeOf(a.tile))) return Object.assign(a, { riichi: true });
          throw new Error(L('立直后的打牌不合法：', 'illegal discard after riichi: ') + JSON.stringify(r));
        }
        const a = this.mapTurn(g, seat, opt, r);
        if (a) return a;
        throw new Error(L('无法理解的回应：', 'unrecognized reply: ') + JSON.stringify(r));
      } catch (e) {
        this.fail(e);
        return this.fallback.onTurn(g, seat, opt);
      }
    }

    mapTurn(g, seat, opt, r) {
      if (!r) return null;
      const hand = g.hands[seat];
      switch (r.type) {
        case 'hora':
          return opt.tsumo ? { type: 'tsumo' } : null;
        case 'dahai': {
          const id = pickId(hand, r.pai, r.tsumogiri ? opt.drawn : null);
          return id != null && opt.discards.includes(id) ? { type: 'discard', tile: id } : null;
        }
        case 'ankan': {
          const f = fromMjai(r.consumed && r.consumed[0]);
          return f && opt.ankan.includes(f.t) ? { type: 'ankan', t: f.t } : null;
        }
        case 'kakan': {
          const f = fromMjai(r.pai);
          return f && opt.kakan.includes(f.t) ? { type: 'kakan', t: f.t } : null;
        }
        case 'ryukyoku':
          return opt.kyuushu ? { type: 'kyuushu' } : null;
        case 'none':
          return null;
      }
      return null;
    }

    async onCall(g, seat, o) {
      if (this.broken) return this.fallback.onCall(g, seat, o);
      try {
        const r = await this.send(seat, null, true);
        if (!r || r.type === 'none') return { type: 'pass' };
        if (r.type === 'hora' && o.ron) return { type: 'ron' };
        if (r.type === 'pon' && o.pon) return { type: 'pon' };
        if (r.type === 'daiminkan' && o.kan) return { type: 'kan' };
        if (r.type === 'chi' && o.chi.length) {
          const used = [];
          const a = pickId(g.hands[seat], r.consumed[0], null, used);
          used.push(a);
          const b = pickId(g.hands[seat], r.consumed[1], null, used);
          const pair = o.chi.find((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) ||
            o.chi.find((p) => typeOf(p[0]) === typeOf(a) && typeOf(p[1]) === typeOf(b));
          if (pair) return { type: 'chi', tiles: pair };
        }
        throw new Error(L('无法理解的回应：', 'unrecognized reply: ') + JSON.stringify(r));
      } catch (e) {
        this.fail(e);
        return this.fallback.onCall(g, seat, o);
      }
    }
  }

  // ------------------------------------------------------------ 提示（座位 0 的 Mortal 顾问）
  /**
   * 不替玩家行动，只在玩家点「策」时把当前局面发给座位 0 的 Mortal，拿回它对每个合法操作的评价。
   * 与对手共用同一份事件记录与会话；同一决策点重复询问时直接用缓存。
   */
  class MjaiAdvisor extends MjaiAgent {
    constructor(opts) {
      super(opts);
      this.cache = null;
      this.busy = null;
    }

    async advise(seat) {
      const n = this.log.events.length;
      if (this.cache && this.cache.n === n) return this.cache.r;
      if (this.busy && this.busy.n === n) return this.busy.p;
      const p = this.send(seat, null, true).then((r) => {
        this.cache = { n, r };
        return r;
      }).finally(() => { if (this.busy && this.busy.n === n) this.busy = null; });
      this.busy = { n, p };
      return p;
    }
  }

  /**
   * 把 Mortal 回应里的 meta（mask_bits + 压缩的 q_values）展开成选项列表，按倾向从高到低排序。
   * 倾向 = 对合法操作的 Q 值做 softmax，和 Mortal 牌谱复盘里的百分比是同一种算法。
   * 动作编号：0–33 打出普通牌，34–36 打出赤五万/筒/索，37 立直，38–40 吃（被吃的牌在低/中/高位），
   * 41 碰，42 杠，43 和了，44 九种九牌，45 跳过。
   */
  function parseMeta(reaction) {
    const m = reaction && reaction.meta;
    if (!m || !Array.isArray(m.q_values) || m.mask_bits == null) return null;
    const bits = BigInt(m.mask_bits);
    const idx = [];
    for (let i = 0; i < 46; i++) if ((bits >> BigInt(i)) & 1n) idx.push(i);
    if (idx.length !== m.q_values.length) return null;
    const qs = m.q_values;
    const mx = Math.max(...qs);
    const ex = qs.map((q) => Math.exp(q - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    const items = idx.map((a, k) => {
      const it = { action: a, q: qs[k], p: ex[k] / sum };
      if (a <= 33) it.tile = { t: a, red: false };
      else if (a <= 36) it.tile = { t: (a - 34) * 9 + 4, red: true };
      return it;
    });
    items.sort((x, y) => y.p - x.p);
    return { items, shanten: m.shanten, furiten: m.at_furiten, chosen: reaction.type };
  }

  MJ.Mjai = { toMjai, fromMjai, pickId, MjaiLog, MjaiAgent, MjaiAdvisor, parseMeta, ping };
})(typeof window !== 'undefined' ? window : globalThis);
