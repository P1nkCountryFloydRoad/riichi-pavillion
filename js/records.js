/* 对局记录与个人数据：每场打完的对局保存在本机（经 MJ.Store），也可以导出 / 导入为 JSON 文件。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const KEY = 'mj-records-v1';
  const MAX = 500; // 浏览器里最多保留的场数；更早的可以导出成文件长期保存
  const ME = 0;
  const RW = ['东', '南', '西', '北'];
  const NUM = ['一', '二', '三', '四'];

  const kyokuName = (k, h) => (MJ.roundName ? MJ.roundName(((k / 4) | 0) % 4, (k % 4) + 1, h)
    : `${RW[((k / 4) | 0) % 4]}${(k % 4) + 1}局${h ? ' ' + h + '本场' : ''}`);
  const L = (zh, en) => (MJ.L ? MJ.L(zh, en) : zh);
  const tr = (x) => (MJ.tr ? MJ.tr(x) : x);
  const rankName = (n) => (MJ.ord ? MJ.ord(n) : NUM[n - 1] + '位');

  // ------------------------------------------------------------ 存储
  function list() {
    const v = MJ.Store.get(KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function write(arr) { MJ.Store.set(KEY, arr); }
  const Paifu = () => MJ.Paifu;
  function add(rec) {
    const arr = list().slice();
    arr.unshift(rec);
    if (arr.length > MAX) for (const r of arr.splice(MAX)) if (Paifu()) Paifu().del(r.id);
    write(arr);
  }
  function remove(id) {
    write(list().filter((r) => r.id !== id));
    if (Paifu()) Paifu().del(id);
  }
  function clear() {
    write([]);
    if (Paifu()) Paifu().clear();
  }

  const valid = (r) => r && typeof r.id === 'string' && typeof r.date === 'number' && r.stats && Array.isArray(r.ranking) &&
    Array.isArray(r.scores) && Array.isArray(r.points) && r.rank >= 1 && r.rank <= 4 && Array.isArray(r.log);

  /** 导出为可保存的对象（含当前规则设置，方便换电脑时一起带走） */
  function exportData() {
    return { app: 'queting', kind: 'records', version: 1, exportedAt: new Date().toISOString(),
      rules: MJ.Settings ? MJ.Settings.rules : undefined, records: list() };
  }

  /** 连同牌谱一起导出：paifu 为 { 记录 id: { events } } */
  async function exportAll() {
    const data = exportData();
    data.version = 2;
    data.paifu = {};
    if (Paifu()) {
      for (const r of data.records) {
        if (!r.paifu) continue;
        const pf = await Paifu().get(r.id);
        if (pf) data.paifu[r.id] = pf;
      }
    }
    return data;
  }

  /** 导入战绩，并恢复文件里带的牌谱（只恢复这次新加入的记录） */
  async function importAll(data) {
    const res = importData(data);
    let paifu = 0;
    if (Paifu() && data && data.paifu && typeof data.paifu === 'object') {
      const keep = new Set(list().map((r) => r.id));
      for (const id of res.addedIds) {
        const pf = data.paifu[id];
        if (pf && Array.isArray(pf.events) && keep.has(id)) {
          await Paifu().put(id, pf);
          paifu++;
        }
      }
    }
    return Object.assign(res, { paifu });
  }

  /** 合并导入：按 id 去重，按时间重新排序。返回 { added, skipped, bad } */
  function importData(data) {
    const recs = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
    if (!recs) throw new Error(L('不是雀庭导出的战绩文件', 'This is not a records file exported from this game'));
    const cur = list();
    const seen = new Set(cur.map((r) => r.id));
    let added = 0, skipped = 0, bad = 0;
    const addedIds = [];
    const merged = cur.slice();
    for (const r of recs) {
      if (!valid(r)) bad++;
      else if (seen.has(r.id)) skipped++;
      else {
        seen.add(r.id);
        merged.push(r);
        addedIds.push(r.id);
        added++;
      }
    }
    merged.sort((a, b) => b.date - a.date);
    const dropped = Math.max(0, merged.length - MAX);
    if (dropped) for (const r of merged.splice(MAX)) if (Paifu()) Paifu().del(r.id);
    write(merged);
    return { added, skipped, bad, dropped, addedIds };
  }

  // ------------------------------------------------------------ 和牌牌型
  /**
   * 和牌时的完整牌型，用记法字符串保存（不依赖当时的赤宝牌设置）：
   *   hand 门内的牌，melds 副露（[...] 明副露，(...) 暗杠），win 和了牌，dora / ura 指示牌
   *   text 一行文字，例如 "1112345678999m 0m"、"234m55p [789s] (7777z) 3p"
   */
  function handShape(r) {
    const N = MJ.toNotation;
    const hand = N(r.hand);
    const melds = r.melds.map((m) => ({ type: m.type, tiles: N(m.tiles) }));
    const win = N([r.winTile]);
    const text = [hand].concat(melds.map((m) => (m.type === 'ankan' ? `(${m.tiles})` : `[${m.tiles}]`)), [win]).join(' ');
    return { hand, melds, win, text, dora: N(r.doraInd || []), ura: N(r.uraInd || []) };
  }

  // ------------------------------------------------------------ 统计采集
  function emptyStats() {
    return { hands: 0, win: 0, tsumo: 0, winPts: 0, dealin: 0, dealinPts: 0, riichi: 0, riichiWin: 0,
      open: 0, openWin: 0, draw: 0, drawTenpai: 0, tsumoed: 0, dealerHands: 0, best: null };
  }

  /**
   * 给对局挂上记录器。对局正常结束（gameEnd）时自动存档。
   * meta: { ai: '内置 AI' | 'Mortal', rules: 规则摘要 }
   * 返回的对象在终局后带有 record 字段。
   */
  function track(game, meta) {
    const s = emptyStats();
    const rec = {
      v: 1, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: Date.now(), length: game.length, ai: (meta && meta.ai) || '内置 AI', rules: (meta && meta.rules) || '',
      ruleSet: (meta && meta.ruleSet) || undefined,
      uma: game.rules.uma, start: game.rules.startPoints, goal: game.rules.goalPoints,
      log: [], stats: s,
    };
    const t = { record: null, rec };
    let hand = null;
    game.taps.push((type, d, g) => {
      switch (type) {
        case 'handStart':
          hand = { riichi: false, open: false };
          s.hands++;
          if (g.dealer === ME) s.dealerHands++;
          break;
        case 'discard':
          if (d.seat === ME && d.riichi && hand && !hand.riichi) {
            hand.riichi = true;
            s.riichi++;
          }
          break;
        case 'call':
          if (d.seat === ME && d.kind !== 'ankan' && hand && !hand.open) {
            hand.open = true;
            s.open++;
          }
          break;
        case 'win': {
          const wins = [];
          for (const r of d.results) {
            const pts = r.pay.total;
            const res = r.res;
            const shape = handShape(r);
            wins.push({ seat: r.seat, from: r.tsumo ? r.seat : r.from, tsumo: r.tsumo, pts,
              han: res.han, fu: res.fu, ym: res.yakuman || 0, limit: res.limit || '',
              yaku: res.yaku.filter((y) => !y.dora).map((y) => y.name),
              dora: res.yaku.filter((y) => y.dora).map((y) => y.name + ' ' + y.han), shape });
            if (r.seat === ME) {
              s.win++;
              if (r.tsumo) s.tsumo++;
              s.winPts += pts;
              if (hand && hand.riichi) s.riichiWin++;
              if (hand && hand.open) s.openWin++;
              if (!s.best || pts > s.best.pts) {
                s.best = { pts, han: res.han, fu: res.fu, ym: res.yakuman || 0, limit: res.limit || '',
                  yaku: res.yaku.filter((y) => !y.dora).map((y) => y.name), date: rec.date, shape, tsumo: r.tsumo };
              }
            } else if (r.tsumo) s.tsumoed++;
            else if (r.from === ME) {
              s.dealin++;
              s.dealinPts += pts;
            }
          }
          rec.log.push({ k: g.kyoku, h: g.honba, type: 'win', wins, deltas: d.deltas.slice() });
          break;
        }
        case 'ryuukyoku':
          s.draw++;
          if (d.tenpai[ME]) s.drawTenpai++;
          rec.log.push({ k: g.kyoku, h: g.honba, type: 'draw', tenpai: d.tenpai.slice(),
            nagashi: (d.nagashi || []).slice(), deltas: d.deltas.slice() });
          break;
        case 'abort':
          rec.log.push({ k: g.kyoku, h: g.honba, type: 'abort', kind: d.kind });
          break;
        case 'gameEnd':
          rec.scores = d.scores.slice();
          rec.ranking = d.ranking.slice();
          rec.points = d.points.slice();
          rec.rank = d.ranking.indexOf(ME) + 1;
          rec.pt = d.points[ME];
          rec.score = d.scores[ME];
          rec.tobi = d.scores[ME] < 0;
          // 完整牌谱（mjai 事件流）另存到 IndexedDB；此时 end_game 已经记录进去
          if (meta && meta.log && Paifu()) {
            rec.paifu = true;
            const events = JSON.parse(JSON.stringify(meta.log.events.map((e) => e.ev)));
            t.paifuSaved = Paifu().put(rec.id, { v: 1, format: 'mjai', events });
          }
          add(rec);
          t.record = rec;
          break;
      }
    });
    return t;
  }

  // ------------------------------------------------------------ 汇总
  function summarize(recs) {
    const t = emptyStats();
    const ranks = [0, 0, 0, 0];
    let pt = 0, score = 0, tobi = 0;
    for (const r of recs) {
      const s = r.stats;
      for (const k in t) if (typeof t[k] === 'number') t[k] += s[k] || 0;
      if (s.best && (!t.best || s.best.pts > t.best.pts)) t.best = s.best;
      ranks[r.rank - 1]++;
      pt += r.pt;
      score += r.score;
      if (r.tobi) tobi++;
    }
    const n = recs.length;
    const div = (a, b) => (b ? a / b : null);
    return {
      games: n, ranks, tobi, best: t.best,
      pt: Math.round(pt * 10) / 10,
      avgPt: div(pt, n),
      avgRank: div(ranks.reduce((a, c, i) => a + c * (i + 1), 0), n),
      avgScore: div(score, n),
      hands: t.hands,
      rate: {
        win: div(t.win, t.hands), tsumo: div(t.tsumo, t.win), dealin: div(t.dealin, t.hands),
        riichi: div(t.riichi, t.hands), riichiWin: div(t.riichiWin, t.riichi), open: div(t.open, t.hands),
        openWin: div(t.openWin, t.open),
        draw: div(t.draw, t.hands), drawTenpai: div(t.drawTenpai, t.draw), tsumoed: div(t.tsumoed, t.hands),
        tobi: div(tobi, n),
      },
      avgWin: div(t.winPts, t.win), avgDealin: div(t.dealinPts, t.dealin),
      raw: t,
    };
  }

  MJ.Records = { list, add, remove, clear, track, summarize, kyokuName, exportData, importData, exportAll, importAll, handShape, KEY, MAX };
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ 界面
  const $ = (s, el) => (el || document).querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1);
  const ptCls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const SEAT = ['你', '下家', '对家', '上家'].map(tr);
  const LEN = { east: tr('东风战'), south: tr('半庄战') };
  const ABORT = { kyuushu: '九种九牌', suufon: '四风连打', suucha: '四家立直', suukaikan: '四杠散了', sanchahou: '三家和了' };
  for (const k in ABORT) ABORT[k] = tr(ABORT[k]);
  const yakuList = (x) => x.yaku.map(tr).concat((x.dora || []).map(tr)).join(L('、', ', '));
  const hanFu = (x) => (x.ym ? tr(x.limit) : L(`${x.han}番${x.fu ? x.fu + '符' : ''}`, `${x.han} han${x.fu ? ' ' + x.fu + ' fu' : ''}`) + (x.limit ? ' ' + tr(x.limit) : ''));
  const state = { filter: 'all', open: null, confirmClear: false };

  function dateStr(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function filtered() {
    const all = list();
    return state.filter === 'all' ? all : all.filter((r) => r.length === state.filter);
  }

  function stat(label, value, sub, tip) {
    return `<div class="st-cell"${tip ? ` title="${tip}"` : ''}><span class="lab">${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }

  // 顺位分布：一条分段横条（同一色相，一位最深），每段都有文字标注
  function rankBar(sm) {
    const n = sm.games;
    const segs = sm.ranks.map((c, i) => {
      const w = (c / n) * 100;
      return w ? `<div class="rk-seg r${i + 1}" style="flex:${c}" title="${rankName(i + 1)} ${L(`${c} 场`, `${c} games`)} (${w.toFixed(1)}%)"></div>` : '';
    }).join('');
    const legend = sm.ranks.map((c, i) =>
      `<span><i class="r${i + 1}"></i>${rankName(i + 1)} <b>${pct(c / n)}</b><small>${L(`${c} 场`, `${c} games`)}</small></span>`).join('');
    return `<div class="rk-bar">${segs}</div><div class="rk-legend">${legend}<span class="tobi">${L('被飞', 'Busted')} <b>${pct(sm.rate.tobi)}</b></span></div>`;
  }

  // 累计得点走势（按时间先后），带悬停提示
  function trend(recs) {
    const seq = recs.slice(0, 60).reverse();
    if (seq.length < 2) return `<div class="trend-empty">${L('再打几场就能看到得点走势', 'Play a few more games to see your point trend')}</div>`;
    let acc = 0;
    const ys = [0].concat(seq.map((r) => (acc += r.pt)));
    const W = 640, H = 150, P = { l: 44, r: 14, t: 14, b: 22 };
    const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
    const span = hi - lo || 1;
    const x = (i) => P.l + (i / (ys.length - 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);
    const path = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${path}L${x(ys.length - 1).toFixed(1)},${y(lo).toFixed(1)}L${x(0).toFixed(1)},${y(lo).toFixed(1)}Z`;
    const ticks = [hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i);
    const grid = ticks.map((v) =>
      `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : 'grid'}"/>` +
      `<text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${Math.round(v)}</text>`).join('');
    const dots = seq.map((r, i) =>
      `<g class="pt-hit" data-i="${i}"><rect x="${x(i + 1) - 7}" y="${P.t}" width="14" height="${H - P.t - P.b}"/>` +
      `<circle cx="${x(i + 1)}" cy="${y(ys[i + 1])}" r="4"/></g>`).join('');
    const tips = seq.map((r, i) => ({
      x: x(i + 1) / W, y: y(ys[i + 1]) / H,
      text: `${dateStr(r.date)} · ${LEN[r.length] || ''} · ${rankName(r.rank)} ${signed(r.pt)}<br>${L('累计', 'Total')} ${signed(ys[i + 1])}`,
    }));
    return `<div class="trend" data-tips='${JSON.stringify(tips).replace(/'/g, '&#39;')}'>` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${L(`最近 ${seq.length} 场的累计得点走势`, `Cumulative points over the last ${seq.length} games`)}">` +
      `${grid}<path class="area" d="${area}"/><path class="line" d="${path}"/>${dots}` +
      `<text x="${P.l}" y="${H - 5}">${L(`${seq.length} 场前`, `${seq.length} games ago`)}</text><text x="${W - P.r}" y="${H - 5}" text-anchor="end">${L('最近', 'Latest')}</text></svg>` +
      '<div class="trend-tip"></div></div>';
  }

  function logLine(e) {
    const head = `<span class="kk">${kyokuName(e.k, e.h)}</span>`;
    const sep = L('、', ', ');
    if (e.type === 'abort') return `<li>${head}<span class="wins muted">${L('途中流局', 'Abortive draw')} · ${ABORT[e.kind] || e.kind}</span><span class="dm">±0</span></li>`;
    if (e.type === 'draw') {
      const who = e.nagashi.length ? e.nagashi.map((s) => SEAT[s]).join(sep) + L(' 流局满贯', ': Nagashi Mangan')
        : (e.tenpai.some(Boolean) ? L('听牌：', 'Tenpai: ') + e.tenpai.map((t, s) => (t ? SEAT[s] : null)).filter(Boolean).join(sep) : L('全员未听', 'Everyone noten'));
      return `<li>${head}<span class="wins muted">${L('流局', 'Draw')} · ${who}</span>${deltaMe(e.deltas)}</li>`;
    }
    const w = e.wins.map((x) => {
      const how = x.tsumo ? L('自摸', 'tsumo') : L(`荣和 ${SEAT[x.from]}`, `ron from ${SEAT[x.from]}`);
      return `<div class="win-entry${x.seat === ME ? ' me' : ''}"><span>${SEAT[x.seat]} ${how} ${fmt(x.pts)} <small>${hanFu(x)} · ${yakuList(x)}</small></span>` +
        shapeHTML(x.shape, x.tsumo) + '</div>';
    }).join('');
    return `<li>${head}<span class="wins">${w}</span>${deltaMe(e.deltas)}</li>`;
  }
  /** 和牌牌型：一排小牌 + 可复制的记法文字（旧记录没有牌型时不显示） */
  function shapeHTML(sh, tsumo) {
    if (!sh) return '';
    const R = MJ.R;
    const tiles = R ? `<div class="shape-tiles">${R.notationHTML(sh.hand)}` +
      sh.melds.map((m) => `<span class="sh-meld${m.type === 'ankan' ? ' an' : ''}" title="${tr(MELD[m.type] || '')}">${R.notationHTML(m.tiles)}</span>`).join('') +
      `<span class="sh-win" data-lab="${tsumo ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}">${R.notationHTML(sh.win)}</span></div>` : '';
    const dora = sh.dora ? `${L('宝牌指示', 'Dora indicator')} ${sh.dora}${sh.ura ? L(' · 里宝牌指示 ', ' · Ura indicator ') + sh.ura : ''}` : '';
    return `${tiles}<div class="shape-text"><code title="${L('牌型记法：[ ] 为明副露，( ) 为暗杠，最后一张是和了牌；0 表示赤五', 'Hand notation: [ ] open meld, ( ) closed kan, the last tile is the winning tile; 0 is a red five')}">${sh.text}</code>${dora ? `<small>${dora}</small>` : ''}</div>`;
  }
  const MELD = { chi: '吃', pon: '碰', minkan: '明杠', kan: '明杠', kakan: '加杠', ankan: '暗杠' };

  function deltaMe(d) {
    const v = d[ME];
    if (!v) return '<span class="dm">±0</span>';
    return `<span class="dm ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}</span>`;
  }

  function detail(r) {
    const players = r.ranking.map((s, i) =>
      `<div class="pl${s === ME ? ' me' : ''}"><span class="no">${i + 1}</span><span>${SEAT[s]}</span>` +
      `<span class="sc">${fmt(r.scores[s])}</span><span class="pt ${ptCls(r.points[s])}">${signed(r.points[s])}</span></div>`).join('');
    const s = r.stats;
    const mine = L([`${s.hands} 局`, `和了 ${s.win}`, `放铳 ${s.dealin}`, `立直 ${s.riichi}`, `副露 ${s.open}`],
      [`${s.hands} hands`, `${s.win} wins`, `${s.dealin} deal-ins`, `${s.riichi} riichi`, `${s.open} open`]).join(' · ');
    const rules = r.ruleSet && MJ.Settings ? MJ.Settings.summary(true, r.ruleSet) : r.rules || '';
    return `<div class="rec-detail"><div class="pls">${players}</div>` +
      `<div class="rec-meta">${mine}<br>${rules}</div>` +
      `<ol class="rec-log">${r.log.map(logLine).join('')}</ol>` +
      `<div class="btn-row">` +
      (r.paifu ? `<button class="btn small" data-a="replay" data-id="${r.id}">${L('回放牌谱', 'Replay')}</button><button class="btn small" data-a="dl" data-id="${r.id}" title="${L('标准 mjai 格式，每行一个事件', 'Standard mjai format, one event per line')}">${L('下载牌谱', 'Download log')}</button>` : `<span class="muted small-note">${L('这场对局没有保存牌谱', 'No game log saved for this game')}</span>`) +
      `<span class="grow"></span><button class="btn small" data-a="del" data-id="${r.id}">${L('删除这条记录', 'Delete this record')}</button></div></div>`;
  }

  function umaLabel(k) {
    const u = MJ.UMA[k];
    return !u || !u[0] ? L('无', 'none') : u.map((v) => (v > 0 ? '+' : '') + v).join('/');
  }

  function render() {
    const el = $('#records');
    const body = $('.records-body', el);
    const top = body ? body.scrollTop : 0;
    const recs = filtered();
    const sm = summarize(recs);
    const f = (k, label) => `<button data-f="${k}" class="${state.filter === k ? 'on' : ''}">${label}</button>`;
    let main;
    if (!recs.length) {
      main = `<div class="rec-empty"><b>${L(`还没有${state.filter === 'all' ? '' : LEN[state.filter]}对局记录`, `No ${state.filter === 'all' ? '' : LEN[state.filter] + ' '}games recorded yet`)}</b><span>${L('打完一场东风战或半庄战后，成绩和数据会自动保存在这里（只存在本机浏览器）。', 'Finish an East game or a hanchan and your results are saved here automatically (only in this browser).')}</span></div>`;
    } else {
      const best = sm.best;
      const bestTxt = best ? `${fmt(best.pts)}` : '—';
      const bestSub = best ? hanFu(best) + ' · ' + best.yaku.slice(0, 3).map(tr).join(L('、', ', ')) : '';
      main = `
        <div class="hero-row">
          ${stat(L('对局数', 'Games'), sm.games, L(`共 ${sm.hands} 局`, `${sm.hands} hands`))}
          ${stat(L('平均顺位', 'Average place'), sm.avgRank.toFixed(2), L('越小越好', 'Lower is better'))}
          ${stat(L('累计得点', 'Total points'), `<span class="${ptCls(sm.pt)}">${signed(sm.pt)}</span>`, L(`场均 ${signed(sm.avgPt)}`, `${signed(sm.avgPt)} per game`), L('每场得点 = (终局点数 − 返点) ÷ 1000 + 顺位马，一位另得返点差', 'Per game = (final score − return) ÷ 1000 + uma; 1st also gets the oka'))}
          ${stat(L('平均终局点数', 'Average final score'), fmt(sm.avgScore), '')}
        </div>
        <h4>${L('顺位分布', 'Placements')}</h4>${rankBar(sm)}
        <h4>${L('累计得点走势', 'Point trend')}</h4>${trend(recs)}
        <h4>${L('和了与放铳', 'Wins and deal-ins')}</h4>
        <div class="st-grid">
          ${stat(L('和了率', 'Win rate'), pct(sm.rate.win), L(`${sm.raw.win} / ${sm.hands} 局`, `${sm.raw.win} / ${sm.hands} hands`))}
          ${stat(L('放铳率', 'Deal-in rate'), pct(sm.rate.dealin), L(`${sm.raw.dealin} 次`, `${sm.raw.dealin} times`))}
          ${stat(L('自摸率', 'Tsumo rate'), pct(sm.rate.tsumo), L('和了中自摸的比例', 'Share of wins by tsumo'))}
          ${stat(L('被自摸率', 'Tsumo-ed rate'), pct(sm.rate.tsumoed), L('别家自摸的局数比例', 'Hands where someone else won by tsumo'))}
          ${stat(L('平均打点', 'Average win'), sm.avgWin == null ? '—' : fmt(sm.avgWin), L('每次和了的点数', 'Points per win'))}
          ${stat(L('平均铳点', 'Average deal-in'), sm.avgDealin == null ? '—' : fmt(sm.avgDealin), L('每次放铳失去的点数', 'Points lost per deal-in'))}
          <div class="st-cell best-cell"><span class="lab">${L('最高打点', 'Best win')}</span><b>${bestTxt}</b><small>${bestSub}</small>${best && best.shape ? shapeHTML(best.shape, best.tsumo) : ''}</div>
        </div>
        <h4>${L('立直与副露', 'Riichi and calls')}</h4>
        <div class="st-grid">
          ${stat(L('立直率', 'Riichi rate'), pct(sm.rate.riichi), L(`${sm.raw.riichi} 次`, `${sm.raw.riichi} times`))}
          ${stat(L('立直后和了率', 'Riichi win rate'), pct(sm.rate.riichiWin), L('立直的局里最终和了', 'Hands won after riichi'))}
          ${stat(L('副露率', 'Call rate'), pct(sm.rate.open), L('吃、碰、明杠过的局（暗杠不算）', 'Hands with a chi, pon or open kan (closed kans excluded)'))}
          ${stat(L('副露后和了率', 'Win rate after calling'), pct(sm.rate.openWin), '')}
          ${stat(L('流局率', 'Draw rate'), pct(sm.rate.draw), L('荒牌流局的局数比例', 'Hands ending in an exhaustive draw'))}
          ${stat(L('流局听牌率', 'Tenpai at draw'), pct(sm.rate.drawTenpai), L('流局时自己听牌', 'You were tenpai when the hand was drawn'))}
        </div>
        <h4>${L('对局记录', 'Games')}</h4>
        <div class="rec-list">${recs.map((r) => `
          <div class="rec${state.open === r.id ? ' open' : ''}">
            <button class="rec-row" data-id="${r.id}">
              <span class="rk r${r.rank}">${rankName(r.rank)}</span>
              <span class="when">${dateStr(r.date)}<small>${LEN[r.length] || ''} · ${tr(r.ai)}</small></span>
              <span class="sc">${fmt(r.score)}</span>
              <span class="pt ${ptCls(r.pt)}">${signed(r.pt)}</span>
            </button>
            ${state.open === r.id ? detail(r) : ''}
          </div>`).join('')}</div>`;
    }
    el.innerHTML = `<div class="overlay"><div class="card records">
      <div class="win-head"><h2>${L('战绩与数据', 'Records & stats')}</h2><div class="seg rec-filter">${f('all', L('全部', 'All'))}${f('east', LEN.east)}${f('south', LEN.south)}</div></div>
      <div class="records-body">${main}</div>
      <div class="btn-row rec-actions">
        <button class="btn" data-a="import" title="${L('从之前导出的 .json 文件恢复记录（与现有记录合并，重复的会跳过）', 'Restore records from an exported .json file (merged with existing records; duplicates are skipped)')}">${L('导入文件', 'Import')}</button>
        ${list().length ? `<button class="btn" data-a="export" title="${L('把全部记录、牌谱和规则设置保存成 .json 文件', 'Save all records, game logs and rule settings as a .json file')}">${L('导出到文件', 'Export')}</button>` : ''}
        <span class="grow"></span>
        ${list().length ? `<button class="btn${state.confirmClear ? ' danger' : ''}" data-a="clear">${state.confirmClear ? L('再点一次确认清空', 'Click again to confirm') : L('清空记录', 'Clear records')}</button>` : ''}
        <button class="btn primary" data-a="close">${L('关闭', 'Close')}</button></div>
      <input type="file" accept=".json,application/json" class="rec-file" hidden>
    </div></div>`;
    const b = $('.records-body', el);
    if (b) b.scrollTop = top;
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) {
      if (e.target.classList.contains('overlay')) close();
      return;
    }
    if (t.dataset.f) {
      state.filter = t.dataset.f;
      state.open = null;
    } else if (t.classList.contains('rec-row')) {
      state.open = state.open === t.dataset.id ? null : t.dataset.id;
    } else if (t.dataset.a === 'close') return close();
    else if (t.dataset.a === 'export') return download();
    else if (t.dataset.a === 'replay' || t.dataset.a === 'dl') {
      const rec = list().find((r) => r.id === t.dataset.id);
      if (!rec) return;
      const job = t.dataset.a === 'replay' ? MJ.Replay.open(rec) : MJ.Replay.download(rec);
      job.then((ok) => { if (!ok) toast(L('找不到这场的牌谱（可能是清除过浏览器数据）', 'Game log not found (browser data may have been cleared)')); });
      return;
    }
    else if (t.dataset.a === 'import') return void $('#records .rec-file').click();
    else if (t.dataset.a === 'del') {
      remove(t.dataset.id);
      state.open = null;
    } else if (t.dataset.a === 'clear') {
      if (!state.confirmClear) {
        state.confirmClear = true;
        render();
        return;
      }
      clear();
    }
    state.confirmClear = false;
    if (MJ.Sound) MJ.Sound.play('click');
    render();
  }

  async function download() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    a.download = `${L('雀庭战绩', 'riichi-pavilion-records')}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(L(`已导出 ${data.records.length} 场记录、${Object.keys(data.paifu).length} 份牌谱`, `Exported ${data.records.length} games and ${Object.keys(data.paifu).length} game logs`));
  }

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let msg;
      try {
        const r = await importAll(JSON.parse(rd.result));
        msg = L(`导入 ${r.added} 场` + (r.paifu ? `（含 ${r.paifu} 份牌谱）` : '') + (r.skipped ? `，${r.skipped} 场已存在` : '') + (r.bad ? `，${r.bad} 条无法识别` : '') +
          (r.dropped ? `；超过 ${MAX} 场上限，最早的 ${r.dropped} 场未保留` : ''),
          `Imported ${r.added} games` + (r.paifu ? ` (with ${r.paifu} game logs)` : '') + (r.skipped ? `, ${r.skipped} already existed` : '') + (r.bad ? `, ${r.bad} unreadable` : '') +
          (r.dropped ? `; over the ${MAX}-game limit, the oldest ${r.dropped} were dropped` : ''));
      } catch (err) {
        msg = L('导入失败：', 'Import failed: ') + (err instanceof SyntaxError ? L('文件不是有效的 JSON', 'the file is not valid JSON') : err.message);
      }
      state.open = null;
      render();
      toast(msg);
    };
    rd.readAsText(f);
  }

  function toast(m) { if (MJ.UI && MJ.UI.toast) MJ.UI.toast(m); }

  function onMove(e) {
    const tr = e.target.closest && e.target.closest('.trend');
    if (!tr) return;
    const tip = $('.trend-tip', tr);
    const g = e.target.closest('.pt-hit');
    tr.querySelectorAll('.pt-hit.on').forEach((x) => x !== g && x.classList.remove('on'));
    if (!g) {
      tip.classList.remove('show');
      return;
    }
    g.classList.add('on');
    const d = JSON.parse(tr.dataset.tips)[+g.dataset.i];
    tip.innerHTML = d.text;
    tip.style.left = d.x * 100 + '%';
    tip.style.top = d.y * 100 + '%';
    tip.classList.toggle('flip', d.x > 0.7);
    tip.classList.add('show');
  }

  function open() {
    state.open = null;
    state.confirmClear = false;
    $('#records').classList.add('show');
    render();
  }
  function close() {
    if (MJ.Sound) MJ.Sound.play('click');
    $('#records').classList.remove('show');
    $('#records').innerHTML = '';
    if (MJ.UI && MJ.UI.refreshMenu) MJ.UI.refreshMenu();
  }
  function isOpen() { return $('#records').classList.contains('show'); }

  function init() {
    const el = $('#records');
    el.addEventListener('click', onClick);
    el.addEventListener('change', (e) => { if (e.target.classList.contains('rec-file')) onFile(e); });
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', () => { const t = $('.trend-tip', el); if (t) t.classList.remove('show'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  }

  Object.assign(MJ.Records, { init, open, close, umaLabel, signed });
})(typeof window !== 'undefined' ? window : globalThis);
