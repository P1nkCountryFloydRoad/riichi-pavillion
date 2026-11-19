/* 牌谱回放：读取保存的 mjai 事件流，逐步重现四家的手牌、副露、牌河与点数。 */
(function (root) {
  'use strict';
  const MJ = root.MJ;
  const HONOR = ['E', 'S', 'W', 'N', 'P', 'F', 'C'];
  const L = (zh, en) => (MJ.L ? MJ.L(zh, en) : zh);
  const tr = (x) => (MJ.tr ? MJ.tr(x) : x);
  const WIND_I = { E: 0, S: 1, W: 2, N: 3 };
  const windName = (w) => (MJ.windName ? MJ.windName(WIND_I[w]) : '东南西北'[WIND_I[w]]);
  const roundName = (st) => (MJ.roundName ? MJ.roundName(WIND_I[st.bakaze], st.kyoku, st.honba) : `${windName(st.bakaze)}${st.kyoku}局`);
  const SEAT = ['你', '下家', '对家', '上家'].map(tr);
  const ABORT = { kyuushu: '九种九牌', suufon: '四风连打', suucha: '四家立直', suukaikan: '四杠散了', sanchahou: '三家和了' };
  for (const k in ABORT) ABORT[k] = tr(ABORT[k]);

  // ------------------------------------------------------------ 状态机（不依赖界面，可在 Node 中测试）
  const tileKey = (name) => {
    const f = MJ.Mjai.fromMjai(name);
    return f ? f.t * 2 + (f.red ? 1 : 0) : 999;
  };
  const sortTiles = (arr) => arr.slice().sort((a, b) => tileKey(a) - tileKey(b));

  function takeTile(hand, name) {
    let i = hand.indexOf(name);
    if (i < 0 && name.length === 3) i = hand.indexOf(name.slice(0, 2)); // 赤五记录不一致时兜底
    if (i < 0 && name.length === 2) i = hand.indexOf(name + 'r');
    if (i >= 0) hand.splice(i, 1);
    return i >= 0;
  }

  /** 把事件切成一局一局：[{ start, end }]，start 指向 start_kyoku，end 指向 end_kyoku（含） */
  function splitKyoku(events) {
    const out = [];
    let cur = null;
    events.forEach((e, i) => {
      if (e.type === 'start_kyoku') {
        if (cur) out.push(cur);
        cur = { start: i, end: i };
      } else if (cur) {
        cur.end = i;
        if (e.type === 'end_kyoku') {
          out.push(cur);
          cur = null;
        }
      }
    });
    if (cur) out.push(cur);
    return out;
  }

  function startState(ev) {
    return {
      bakaze: ev.bakaze, kyoku: ev.kyoku, honba: ev.honba, kyotaku: ev.kyotaku, oya: ev.oya,
      scores: ev.scores.slice(), dora: [ev.dora_marker], left: 70,
      hands: ev.tehais.map((h) => h.slice()), drawn: [null, null, null, null],
      melds: [[], [], [], []], rivers: [[], [], [], []],
      riichi: [false, false, false, false], pendingReach: [false, false, false, false],
      results: [], last: null,
    };
  }

  function apply(st, ev) {
    const a = ev.actor;
    st.last = ev;
    switch (ev.type) {
      case 'tsumo':
        st.hands[a].push(ev.pai);
        st.drawn[a] = ev.pai;
        st.left--;
        break;
      case 'dahai':
        takeTile(st.hands[a], ev.pai);
        st.rivers[a].push({ pai: ev.pai, tsumogiri: !!ev.tsumogiri, riichi: st.pendingReach[a], called: false });
        st.pendingReach[a] = false;
        st.drawn[a] = null;
        break;
      case 'reach':
        st.pendingReach[a] = true;
        st.riichi[a] = true;
        break;
      case 'reach_accepted':
        st.scores[a] -= 1000;
        st.kyotaku++;
        break;
      case 'chi':
      case 'pon':
      case 'daiminkan': {
        for (const c of ev.consumed) takeTile(st.hands[a], c);
        const river = st.rivers[ev.target];
        if (river.length) river[river.length - 1].called = true;
        st.melds[a].push({ type: ev.type, pai: ev.pai, consumed: ev.consumed.slice(), from: ev.target });
        st.drawn[a] = null;
        break;
      }
      case 'ankan':
        for (const c of ev.consumed) takeTile(st.hands[a], c);
        st.melds[a].push({ type: 'ankan', consumed: ev.consumed.slice() });
        st.drawn[a] = null;
        break;
      case 'kakan': {
        takeTile(st.hands[a], ev.pai);
        const t = tileKey(ev.pai) >> 1;
        const m = st.melds[a].find((x) => x.type === 'pon' && tileKey(x.pai) >> 1 === t);
        if (m) {
          m.type = 'kakan';
          m.added = ev.pai;
        }
        st.drawn[a] = null;
        break;
      }
      case 'dora':
        st.dora.push(ev.dora_marker);
        break;
      case 'hora':
        st.results.push({ type: 'hora', actor: a, target: ev.target, deltas: ev.deltas || null, ura: ev.ura_markers || [] });
        if (ev.deltas) for (let s = 0; s < 4; s++) st.scores[s] += ev.deltas[s];
        st.kyotaku = 0;
        break;
      case 'ryukyoku':
        st.results.push({ type: 'ryukyoku', deltas: ev.deltas || null });
        if (ev.deltas) for (let s = 0; s < 4; s++) st.scores[s] += ev.deltas[s];
        break;
    }
    return st;
  }

  /** 第 k 局走到第 pos 步（0 = 刚配牌）时的局面 */
  function stateAt(events, ky, pos) {
    const st = startState(events[ky.start]);
    for (let i = ky.start + 1; i <= Math.min(ky.end, ky.start + pos); i++) apply(st, events[i]);
    return st;
  }

  MJ.Replay = { splitKyoku, stateAt, apply, startState, sortTiles };
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ 界面
  const $ = (s, el) => (el || document).querySelector(s);
  const R = () => MJ.R;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const view = { rec: null, events: null, kyokus: [], k: 0, pos: 0, timer: null };

  const tile = (name, cls) => {
    const f = MJ.Mjai.fromMjai(name);
    return f ? R().tileHTMLByType(f.t, f.red, cls) : R().backHTML(cls);
  };

  function meldHTML(m, seat) {
    if (m.type === 'ankan') {
      const c = sortTiles(m.consumed);
      return `<span class="rp-meld">${R().backHTML()}${tile(c[1])}${tile(c[2])}${R().backHTML()}</span>`;
    }
    const own = sortTiles(m.consumed).map((x) => tile(x));
    const rel = (m.from - seat + 4) % 4; // 3 上家 2 对家 1 下家
    const called = m.type === 'kakan' ? `<span class="stack">${tile(m.pai, 'side')}${tile(m.added, 'side')}</span>` : tile(m.pai, 'side');
    const pos = m.type === 'chi' || rel === 3 ? 0 : rel === 2 ? 1 : own.length;
    own.splice(pos, 0, called);
    return `<span class="rp-meld">${own.join('')}</span>`;
  }

  function seatRow(st, s) {
    const wind = HONOR[(s - st.oya + 4) % 4];
    const isLast = st.last && st.last.actor === s;
    let hand = st.hands[s].slice();
    let drawn = '';
    if (st.drawn[s] && takeTile(hand, st.drawn[s])) drawn = `<span class="rp-drawn">${tile(st.drawn[s])}</span>`;
    hand = sortTiles(hand).map((x) => tile(x)).join('');
    const river = st.rivers[s].map((r, i) => {
      const last = isLast && st.last.type === 'dahai' && i === st.rivers[s].length - 1;
      const cls = [r.riichi ? 'side' : '', r.called ? 'called' : '', r.tsumogiri ? 'tg' : '', last ? 'last' : ''].filter(Boolean).join(' ');
      return tile(r.pai, cls);
    }).join('');
    const melds = st.melds[s].map((m) => meldHTML(m, s)).join('');
    return `<div class="rp-seat${s === 0 ? ' me' : ''}${isLast ? ' act' : ''}">
      <div class="rp-info"><span class="w${s === st.oya ? ' oya' : ''}">${windName(wind)}</span><span class="nm">${SEAT[s]}</span>
        <span class="sc">${fmt(st.scores[s])}</span>${st.riichi[s] ? `<span class="rb">${L('立直', 'Riichi')}</span>` : ''}</div>
      <div class="rp-hand"><span class="tiles-row">${hand}</span>${drawn}<span class="rp-melds">${melds}</span></div>
      <div class="rp-river">${river || '<span class="empty">—</span>'}</div>
    </div>`;
  }

  function actionText(st) {
    const e = st.last;
    if (!e) return L('配牌', 'Deal');
    const who = SEAT[e.actor];
    switch (e.type) {
      case 'tsumo': return L(`${who} 摸牌`, `${who} draws`);
      case 'dahai': return L(`${who} 打出 ${tile(e.pai)}${e.tsumogiri ? '（摸切）' : ''}`, `${who} discards ${tile(e.pai)}${e.tsumogiri ? ' (tsumogiri)' : ''}`);
      case 'reach': return L(`${who} 宣言立直`, `${who} declares riichi`);
      case 'reach_accepted': return L(`${who} 立直成立`, `${who}'s riichi is accepted`);
      case 'chi': return L(`${who} 吃`, `${who} calls chi`);
      case 'pon': return L(`${who} 碰`, `${who} calls pon`);
      case 'daiminkan': return L(`${who} 明杠`, `${who} calls an open kan`);
      case 'ankan': return L(`${who} 暗杠`, `${who} makes a closed kan`);
      case 'kakan': return L(`${who} 加杠`, `${who} makes an added kan`);
      case 'dora': return L(`新宝牌指示牌 ${tile(e.dora_marker)}`, `New dora indicator ${tile(e.dora_marker)}`);
      case 'hora': return e.actor === e.target ? L(`${who} 自摸`, `${who} wins by tsumo`) : L(`${who} 荣和 ${SEAT[e.target]}`, `${who} rons ${SEAT[e.target]}`);
      case 'ryukyoku': return L('流局', 'Draw');
      case 'end_kyoku': return L('本局结束', 'Hand over');
    }
    return e.type;
  }

  /** 本局结果：结合战绩里的逐局记录（番符、役种） */
  function resultHTML(st) {
    if (!st.results.length) return '';
    const entry = view.rec.log && view.rec.log[view.k];
    let text = '';
    if (entry && entry.type === 'win') {
      text = entry.wins.map((w) => {
        const how = w.tsumo ? L('自摸', 'tsumo') : L(`荣和 ${SEAT[w.from]}`, `ron from ${SEAT[w.from]}`);
        const val = w.ym ? tr(w.limit) : L(`${w.han}番${w.fu ? w.fu + '符' : ''}`, `${w.han} han${w.fu ? ' ' + w.fu + ' fu' : ''}`) + (w.limit ? ' ' + tr(w.limit) : '');
        return `<div><b>${SEAT[w.seat]} ${how} ${fmt(w.pts)}</b> <small>${val} · ${w.yaku.concat(w.dora || []).map(tr).join(L('、', ', '))}</small>` +
          (w.shape ? ` <code>${w.shape.text}</code>` : '') + '</div>';
      }).join('');
    } else if (entry && entry.type === 'abort') text = `<div><b>${L('途中流局', 'Abortive draw')}</b> <small>${ABORT[entry.kind] || ''}</small></div>`;
    else if (entry && entry.type === 'draw') {
      const tp = entry.tenpai.map((t, s) => (t ? SEAT[s] : null)).filter(Boolean);
      text = `<div><b>${entry.nagashi.length ? L('流局满贯', 'Nagashi Mangan') : L('流局', 'Draw')}</b> <small>${tp.length ? L('听牌：', 'Tenpai: ') + tp.join(L('、', ', ')) : L('全员未听', 'Everyone noten')}</small></div>`;
    } else text = `<div><b>${L('本局结束', 'Hand over')}</b></div>`;
    const d = st.results.reduce((acc, r) => (r.deltas ? acc.map((x, i) => x + r.deltas[i]) : acc), [0, 0, 0, 0]);
    const ds = d.map((v, s) => `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${SEAT[s]} ${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v))}</span>`).join('');
    const ura = st.results.find((r) => r.ura && r.ura.length);
    return `<div class="rp-result">${text}<div class="rp-deltas">${ds}</div>` +
      (ura ? `<div class="rp-ura"><small>${L('里宝牌指示', 'Ura indicator')}</small>${ura.ura.map((x) => tile(x)).join('')}</div>` : '') + '</div>';
  }

  /** 外框：只在打开、换局时重建（拖动进度条时不重建，避免打断拖动） */
  function render() {
    const ky = view.kyokus[view.k];
    const n = ky.end - ky.start;
    const options = view.kyokus.map((kk, i) => {
      const e = view.events[kk.start];
      return `<option value="${i}"${i === view.k ? ' selected' : ''}>${roundName(e)}</option>`;
    }).join('');
    $('#replay').innerHTML = `<div class="overlay"><div class="card replay">
      <div class="rp-top">
        <h2>${L('牌谱回放', 'Game replay')}</h2>
        <select class="rp-ky" aria-label="${L('选择局', 'Choose hand')}">${options}</select>
        <span class="rp-meta"></span>
        <span class="rp-dora"></span>
        <button class="btn small" data-a="close">${L('关闭', 'Close')}</button>
      </div>
      <div class="rp-table"></div>
      <div class="rp-res"></div>
      <div class="rp-bar">
        <span class="rp-act"></span>
        <input type="range" class="rp-slider" min="0" max="${n}" value="${view.pos}" aria-label="${L('进度', 'Progress')}">
        <span class="rp-step"></span>
      </div>
      <div class="rp-ctrl">
        <button class="btn small" data-a="pk" title="${L('上一局（↑）', 'Previous hand (↑)')}"${view.k === 0 ? ' disabled' : ''}>⏮ ${L('上一局', 'Prev hand')}</button>
        <button class="btn small" data-a="prev" title="${L('上一步（←）', 'Step back (←)')}">◀ ${L('上一步', 'Back')}</button>
        <button class="btn small primary" data-a="play" title="${L('播放 / 暂停（空格）', 'Play / pause (Space)')}"></button>
        <button class="btn small" data-a="next" title="${L('下一步（→）', 'Step forward (→)')}">${L('下一步', 'Next')} ▶</button>
        <button class="btn small" data-a="nk" title="${L('下一局（↓）', 'Next hand (↓)')}"${view.k === view.kyokus.length - 1 ? ' disabled' : ''}>${L('下一局', 'Next hand')} ⏭</button>
      </div>
    </div></div>`;
    view.shownK = view.k;
    update();
  }

  /** 按当前步数刷新牌桌内容 */
  function update() {
    if (view.shownK !== view.k) return render();
    const ky = view.kyokus[view.k];
    const n = ky.end - ky.start;
    view.pos = Math.max(0, Math.min(view.pos, n));
    const st = stateAt(view.events, ky, view.pos);
    const title = roundName(st);
    const box = $('#replay');
    $('.rp-meta', box).textContent = L(`供托 ${st.kyotaku} · 余 ${Math.max(0, st.left)} 张`, `Sticks ${st.kyotaku} · ${Math.max(0, st.left)} tiles left`);
    $('.rp-dora', box).innerHTML = `<small>${L('宝牌指示', 'Dora indicator')}</small>${st.dora.map((x) => tile(x)).join('')}`;
    $('.rp-table', box).innerHTML = [0, 1, 2, 3].map((s) => seatRow(st, s)).join('');
    $('.rp-res', box).innerHTML = resultHTML(st);
    $('.rp-act', box).innerHTML = `${title} · ${actionText(st)}`;
    $('.rp-step', box).textContent = `${view.pos} / ${n}`;
    const sl = $('.rp-slider', box);
    if (+sl.value !== view.pos) sl.value = view.pos;
    $('[data-a="play"]', box).textContent = view.timer ? L('❚❚ 暂停', '❚❚ Pause') : L('▶ 播放', '▶ Play');
  }

  function stop() {
    if (view.timer) clearInterval(view.timer);
    view.timer = null;
  }

  function step(d) {
    const ky = view.kyokus[view.k];
    const n = ky.end - ky.start;
    if (d > 0 && view.pos >= n) {
      if (view.k < view.kyokus.length - 1) {
        view.k++;
        view.pos = 0;
      } else stop();
    } else if (d < 0 && view.pos <= 0) {
      if (view.k > 0) {
        view.k--;
        const p = view.kyokus[view.k];
        view.pos = p.end - p.start;
      }
    } else view.pos += d;
    update();
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) {
      if (e.target.classList.contains('overlay')) close();
      return;
    }
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'play') {
      if (view.timer) stop();
      else view.timer = setInterval(() => step(1), 650);
      return update();
    }
    stop();
    if (a === 'prev') step(-1);
    else if (a === 'next') step(1);
    else if (a === 'pk' && view.k > 0) { view.k--; view.pos = 0; update(); }
    else if (a === 'nk' && view.k < view.kyokus.length - 1) { view.k++; view.pos = 0; update(); }
  }

  function onInput(e) {
    if (e.target.classList.contains('rp-slider')) {
      stop();
      view.pos = +e.target.value;
      update();
    } else if (e.target.classList.contains('rp-ky')) {
      if (+e.target.value === view.k) return;
      stop();
      view.k = +e.target.value;
      view.pos = 0;
      update();
    }
  }

  function onKey(e) {
    if (!$('#replay').classList.contains('show')) return;
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) { if (e.key !== 'Escape' && e.key !== ' ') return; }
    const k = e.key;
    if (k === 'Escape') return close();
    if (k === 'ArrowRight') { stop(); step(1); }
    else if (k === 'ArrowLeft') { stop(); step(-1); }
    else if (k === 'ArrowUp' && view.k > 0) { stop(); view.k--; view.pos = 0; update(); }
    else if (k === 'ArrowDown' && view.k < view.kyokus.length - 1) { stop(); view.k++; view.pos = 0; update(); }
    else if (k === ' ') {
      if (view.timer) stop();
      else view.timer = setInterval(() => step(1), 650);
      update();
    } else return;
    e.preventDefault();
  }

  /** 打开某条战绩记录的牌谱；没有牌谱时返回 false */
  async function open(rec) {
    const data = await MJ.Paifu.get(rec.id);
    if (!data || !Array.isArray(data.events)) return false;
    const kyokus = splitKyoku(data.events);
    if (!kyokus.length) return false;
    stop();
    Object.assign(view, { rec, events: data.events, kyokus, k: 0, pos: 0, shownK: -1 });
    $('#replay').classList.add('show');
    render();
    return true;
  }

  function close() {
    stop();
    $('#replay').classList.remove('show');
    $('#replay').innerHTML = '';
  }

  /** 牌谱文件：标准 mjai 格式，每行一个 JSON 事件 */
  async function download(rec) {
    const data = await MJ.Paifu.get(rec.id);
    if (!data) return false;
    const names = SEAT.map((n, i) => (i === 0 ? n : L(`${n}（${rec.ai}）`, `${n} (${tr(rec.ai)})`)));
    const lines = data.events.map((e) => JSON.stringify(e.type === 'start_game' ? Object.assign({}, e, { names }) : e));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' });
    const d = new Date(rec.date);
    const p = (x) => String(x).padStart(2, '0');
    const a = document.createElement('a');
    a.download = `${L('雀庭牌谱', 'riichi-pavilion-game')}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mjson`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  }

  function init() {
    const el = $('#replay');
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey);
  }

  Object.assign(MJ.Replay, { init, open, close, download });
})(typeof window !== 'undefined' ? window : globalThis);
