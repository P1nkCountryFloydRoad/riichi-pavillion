/* 对局记录与个人数据：每场打完的对局保存在本机（经 MJ.Store），也可以导出 / 导入为 JSON 文件。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const KEY = 'mj-records-v1';
  const MAX = 500; // 浏览器里最多保留的场数；更早的可以导出成文件长期保存
  const ME = 0;
  const RW = ['东', '南', '西', '北'];
  const NUM = ['一', '二', '三', '四'];

  const kyokuName = (k, h) => `${RW[((k / 4) | 0) % 4]}${(k % 4) + 1}局${h ? ' ' + h + '本场' : ''}`;

  // ------------------------------------------------------------ 存储
  function list() {
    const v = MJ.Store.get(KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function write(arr) { MJ.Store.set(KEY, arr); }
  function add(rec) {
    const arr = list().slice();
    arr.unshift(rec);
    if (arr.length > MAX) arr.length = MAX;
    write(arr);
  }
  function remove(id) { write(list().filter((r) => r.id !== id)); }
  function clear() { write([]); }

  const valid = (r) => r && typeof r.id === 'string' && typeof r.date === 'number' && r.stats && Array.isArray(r.ranking) &&
    Array.isArray(r.scores) && Array.isArray(r.points) && r.rank >= 1 && r.rank <= 4 && Array.isArray(r.log);

  /** 导出为可保存的对象（含当前规则设置，方便换电脑时一起带走） */
  function exportData() {
    return { app: 'queting', kind: 'records', version: 1, exportedAt: new Date().toISOString(),
      rules: MJ.Settings ? MJ.Settings.rules : undefined, records: list() };
  }

  /** 合并导入：按 id 去重，按时间重新排序。返回 { added, skipped, bad } */
  function importData(data) {
    const recs = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
    if (!recs) throw new Error('不是雀庭导出的战绩文件');
    const cur = list();
    const seen = new Set(cur.map((r) => r.id));
    let added = 0, skipped = 0, bad = 0;
    const merged = cur.slice();
    for (const r of recs) {
      if (!valid(r)) bad++;
      else if (seen.has(r.id)) skipped++;
      else {
        seen.add(r.id);
        merged.push(r);
        added++;
      }
    }
    merged.sort((a, b) => b.date - a.date);
    const dropped = Math.max(0, merged.length - MAX);
    if (dropped) merged.length = MAX;
    write(merged);
    return { added, skipped, bad, dropped };
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
            wins.push({ seat: r.seat, from: r.tsumo ? r.seat : r.from, tsumo: r.tsumo, pts,
              han: res.han, fu: res.fu, ym: res.yakuman || 0, limit: res.limit || '',
              yaku: res.yaku.filter((y) => !y.dora).map((y) => y.name) });
            if (r.seat === ME) {
              s.win++;
              if (r.tsumo) s.tsumo++;
              s.winPts += pts;
              if (hand && hand.riichi) s.riichiWin++;
              if (hand && hand.open) s.openWin++;
              if (!s.best || pts > s.best.pts) {
                s.best = { pts, han: res.han, fu: res.fu, ym: res.yakuman || 0, limit: res.limit || '',
                  yaku: res.yaku.filter((y) => !y.dora).map((y) => y.name), date: rec.date };
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

  MJ.Records = { list, add, remove, clear, track, summarize, kyokuName, exportData, importData, KEY, MAX };
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ 界面
  const $ = (s, el) => (el || document).querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1);
  const ptCls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const SEAT = ['你', '下家', '对家', '上家'];
  const LEN = { east: '东风战', south: '半庄战' };
  const ABORT = { kyuushu: '九种九牌', suufon: '四风连打', suucha: '四家立直', suukaikan: '四杠散了', sanchahou: '三家和了' };
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
      return w ? `<div class="rk-seg r${i + 1}" style="flex:${c}" title="${NUM[i]}位 ${c} 场（${w.toFixed(1)}%）"></div>` : '';
    }).join('');
    const legend = sm.ranks.map((c, i) =>
      `<span><i class="r${i + 1}"></i>${NUM[i]}位 <b>${pct(c / n)}</b><small>${c} 场</small></span>`).join('');
    return `<div class="rk-bar">${segs}</div><div class="rk-legend">${legend}<span class="tobi">被飞 <b>${pct(sm.rate.tobi)}</b></span></div>`;
  }

  // 累计得点走势（按时间先后），带悬停提示
  function trend(recs) {
    const seq = recs.slice(0, 60).reverse();
    if (seq.length < 2) return '<div class="trend-empty">再打几场就能看到得点走势</div>';
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
      text: `${dateStr(r.date)} · ${LEN[r.length] || ''} · ${NUM[r.rank - 1]}位 ${signed(r.pt)}<br>累计 ${signed(ys[i + 1])}`,
    }));
    return `<div class="trend" data-tips='${JSON.stringify(tips).replace(/'/g, '&#39;')}'>` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="最近 ${seq.length} 场的累计得点走势">` +
      `${grid}<path class="area" d="${area}"/><path class="line" d="${path}"/>${dots}` +
      `<text x="${P.l}" y="${H - 5}">${seq.length} 场前</text><text x="${W - P.r}" y="${H - 5}" text-anchor="end">最近</text></svg>` +
      '<div class="trend-tip"></div></div>';
  }

  function logLine(e) {
    const head = `<span class="kk">${kyokuName(e.k, e.h)}</span>`;
    if (e.type === 'abort') return `<li>${head}<span class="wins muted">途中流局 · ${ABORT[e.kind] || e.kind}</span><span class="dm">±0</span></li>`;
    if (e.type === 'draw') {
      const who = e.nagashi.length ? e.nagashi.map((s) => SEAT[s]).join('、') + ' 流局满贯'
        : (e.tenpai.some(Boolean) ? '听牌：' + e.tenpai.map((t, s) => (t ? SEAT[s] : null)).filter(Boolean).join('、') : '全员未听');
      return `<li>${head}<span class="wins muted">流局 · ${who}</span>${deltaMe(e.deltas)}</li>`;
    }
    const w = e.wins.map((x) => {
      const how = x.tsumo ? '自摸' : `荣和 ${SEAT[x.from]}`;
      const val = x.ym ? x.limit : `${x.han}番${x.fu ? x.fu + '符' : ''}${x.limit ? ' ' + x.limit : ''}`;
      return `<span class="${x.seat === ME ? 'me' : ''}">${SEAT[x.seat]} ${how} ${fmt(x.pts)} <small>${val} · ${x.yaku.slice(0, 4).join('、')}</small></span>`;
    }).join('');
    return `<li>${head}<span class="wins">${w}</span>${deltaMe(e.deltas)}</li>`;
  }
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
    const mine = [`${s.hands} 局`, `和了 ${s.win}`, `放铳 ${s.dealin}`, `立直 ${s.riichi}`, `副露 ${s.open}`].join(' · ');
    return `<div class="rec-detail"><div class="pls">${players}</div>` +
      `<div class="rec-meta">${mine}<br>${r.rules || ''}</div>` +
      `<ol class="rec-log">${r.log.map(logLine).join('')}</ol>` +
      `<div class="btn-row"><button class="btn small" data-a="del" data-id="${r.id}">删除这条记录</button></div></div>`;
  }

  function umaLabel(k) {
    const u = MJ.UMA[k];
    return !u || !u[0] ? '无' : u.map((v) => (v > 0 ? '+' : '') + v).join('/');
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
      main = `<div class="rec-empty"><b>还没有${state.filter === 'all' ? '' : LEN[state.filter]}对局记录</b><span>打完一场东风战或半庄战后，成绩和数据会自动保存在这里（只存在本机浏览器）。</span></div>`;
    } else {
      const best = sm.best;
      const bestTxt = best ? `${fmt(best.pts)}` : '—';
      const bestSub = best ? (best.ym ? best.limit : `${best.han}番${best.fu ? best.fu + '符' : ''} ${best.limit}`) + ' · ' + best.yaku.slice(0, 3).join('、') : '';
      main = `
        <div class="hero-row">
          ${stat('对局数', sm.games, `共 ${sm.hands} 局`)}
          ${stat('平均顺位', sm.avgRank.toFixed(2), '越小越好')}
          ${stat('累计得点', `<span class="${ptCls(sm.pt)}">${signed(sm.pt)}</span>`, `场均 ${signed(sm.avgPt)}`, '每场得点 = (终局点数 − 返点) ÷ 1000 + 顺位马，一位另得返点差')}
          ${stat('平均终局点数', fmt(sm.avgScore), '')}
        </div>
        <h4>顺位分布</h4>${rankBar(sm)}
        <h4>累计得点走势</h4>${trend(recs)}
        <h4>和了与放铳</h4>
        <div class="st-grid">
          ${stat('和了率', pct(sm.rate.win), `${sm.raw.win} / ${sm.hands} 局`)}
          ${stat('放铳率', pct(sm.rate.dealin), `${sm.raw.dealin} 次`)}
          ${stat('自摸率', pct(sm.rate.tsumo), '和了中自摸的比例')}
          ${stat('被自摸率', pct(sm.rate.tsumoed), '别家自摸的局数比例')}
          ${stat('平均打点', sm.avgWin == null ? '—' : fmt(sm.avgWin), '每次和了的点数')}
          ${stat('平均铳点', sm.avgDealin == null ? '—' : fmt(sm.avgDealin), '每次放铳失去的点数')}
          ${stat('最高打点', bestTxt, bestSub)}
        </div>
        <h4>立直与副露</h4>
        <div class="st-grid">
          ${stat('立直率', pct(sm.rate.riichi), `${sm.raw.riichi} 次`)}
          ${stat('立直后和了率', pct(sm.rate.riichiWin), '立直的局里最终和了')}
          ${stat('副露率', pct(sm.rate.open), '吃、碰、明杠过的局（暗杠不算）')}
          ${stat('副露后和了率', pct(sm.rate.openWin), '')}
          ${stat('流局率', pct(sm.rate.draw), '荒牌流局的局数比例')}
          ${stat('流局听牌率', pct(sm.rate.drawTenpai), '流局时自己听牌')}
        </div>
        <h4>对局记录</h4>
        <div class="rec-list">${recs.map((r) => `
          <div class="rec${state.open === r.id ? ' open' : ''}">
            <button class="rec-row" data-id="${r.id}">
              <span class="rk r${r.rank}">${NUM[r.rank - 1]}位</span>
              <span class="when">${dateStr(r.date)}<small>${LEN[r.length] || ''} · ${r.ai}</small></span>
              <span class="sc">${fmt(r.score)}</span>
              <span class="pt ${ptCls(r.pt)}">${signed(r.pt)}</span>
            </button>
            ${state.open === r.id ? detail(r) : ''}
          </div>`).join('')}</div>`;
    }
    el.innerHTML = `<div class="overlay"><div class="card records">
      <div class="win-head"><h2>战绩与数据</h2><div class="seg rec-filter">${f('all', '全部')}${f('east', '东风战')}${f('south', '半庄战')}</div></div>
      <div class="records-body">${main}</div>
      <div class="btn-row rec-actions">
        <button class="btn" data-a="import" title="从之前导出的 .json 文件恢复记录（与现有记录合并，重复的会跳过）">导入文件</button>
        ${list().length ? `<button class="btn" data-a="export" title="把全部记录和规则设置保存成 .json 文件">导出到文件</button>` : ''}
        <span class="grow"></span>
        ${list().length ? `<button class="btn${state.confirmClear ? ' danger' : ''}" data-a="clear">${state.confirmClear ? '再点一次确认清空' : '清空记录'}</button>` : ''}
        <button class="btn primary" data-a="close">关闭</button></div>
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

  function download() {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    a.download = `雀庭战绩-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`已导出 ${data.records.length} 场记录`);
  }

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let msg;
      try {
        const r = importData(JSON.parse(rd.result));
        msg = `导入 ${r.added} 场` + (r.skipped ? `，${r.skipped} 场已存在` : '') + (r.bad ? `，${r.bad} 条无法识别` : '') +
          (r.dropped ? `；超过 ${MAX} 场上限，最早的 ${r.dropped} 场未保留` : '');
      } catch (err) {
        msg = '导入失败：' + (err instanceof SyntaxError ? '文件不是有效的 JSON' : err.message);
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
