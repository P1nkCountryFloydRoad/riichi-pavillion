/* 牌桌界面：渲染、动画、玩家操作。对局引擎通过事件驱动这里的更新。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const R = MJ.R;
  const Sound = MJ.Sound;
  const { typeOf, counts, sortIds, shanten } = MJ;

  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = MJ.L;
  const tr = MJ.tr;
  const EN = MJ.lang === 'en';
  const WIND = EN ? ['E', 'S', 'W', 'N'] : ['東', '南', '西', '北'];
  const NUM = ['一', '二', '三', '四'];
  const SEAT = ['你', '下家', '对家', '上家'].map(tr);
  const roundTitle = (g) => (EN ? `${MJ.windName(g.roundWind)} ${(g.kyoku % 4) + 1}` : WIND[g.roundWind] + NUM[g.kyoku % 4] + '局');
  /** 东家 · 下家 / Right (East) */
  const whoLabel = (wind, s) => (EN ? `${SEAT[s]} (${MJ.windName(wind)})` : `${WIND[wind]}家 · ${SEAT[s]}`);
  const EASE = 'cubic-bezier(.2,.8,.25,1)';
  const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const fmt = R.fmt;

  const UI = { game: null, pending: null, sidePending: [false, false, false, false] };

  // ------------------------------------------------------------ 布局
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.max(22, Math.min(vh * 0.074, vw / 16.2));
    const hz = W * 1.98;
    const fit = (top) => Math.min((vh - hz - top) / (1 - 1.75 / 19), vw - 8);
    let tt = 6;
    let S = fit(tt);
    if ((vw - S) / 2 < 212) {
      tt = 70;
      S = fit(tt);
    }
    S = Math.max(S, 260);
    const st = document.documentElement.style;
    st.setProperty('--S', S + 'px');
    st.setProperty('--w', S / 19 + 'px');
    st.setProperty('--W', W + 'px');
    st.setProperty('--hz', hz + 'px');
    st.setProperty('--tt', tt + 'px');
  }

  function buildTable() {
    const table = $('#table');
    let html = '';
    for (let s = 0; s < 4; s++) {
      html += `<div class="seat" data-seat="${s}" style="--k:${s}">` +
        '<div class="river"><div class="row"></div><div class="row"></div><div class="row"></div></div>' +
        '<div class="opp-hand"></div><div class="melds"></div><div class="stick"></div><div class="bubble"></div></div>';
    }
    html += '<div id="center"><div class="info"><div class="round"></div><div class="counts"></div><div class="wall-left"></div></div>';
    for (let s = 0; s < 4; s++) html += `<div class="plate" data-seat="${s}"><span class="wind"></span><span class="pts"></span></div>`;
    html += '</div>';
    table.innerHTML = html;
  }

  const seatEl = (seat, sel) => $(`.seat[data-seat="${seat}"] ${sel || ''}`);

  // 朝向屏幕下方的"厚度"会压到相邻的牌上，1、2 号位需要反向叠放
  function zfix(seat, box) {
    if (seat !== 1 && seat !== 2) return;
    $$('.tile', box).forEach((t, i) => { t.style.zIndex = 400 - i; });
  }

  // ------------------------------------------------------------ 渲染
  function renderCenter() {
    const g = UI.game;
    if (!g) return;
    $('#center .round').textContent = roundTitle(g);
    $('#center .counts').innerHTML = `<span><i>${L('本场', 'Honba')}</i>${g.honba}</span><span><i>${L('供托', 'Sticks')}</i>${g.sticks}</span>`;
    $('#center .wall-left').innerHTML = L(`余 <b>${g.live ? g.tilesLeft : 70}</b> 张`, `<b>${g.live ? g.tilesLeft : 70}</b> left`);
    for (let s = 0; s < 4; s++) {
      const p = $(`.plate[data-seat="${s}"]`);
      p.querySelector('.wind').textContent = WIND[g.seatWind(s)];
      p.querySelector('.pts').textContent = fmt(g.scores[s]);
      p.classList.toggle('dealer', g.dealer === s);
      p.classList.toggle('active', g.turn === s && !!g.live);
      p.classList.toggle('riichi', !!(g.riichi && g.riichi[s]));
    }
  }

  function renderDora(flipLast) {
    const g = UI.game;
    const box = $('#dora');
    let html = '';
    for (let i = 0; i < 5; i++) html += i < g.doraInd.length ? R.tileHTML(g.doraInd[i], flipLast && i === g.doraInd.length - 1 ? 'flip' : '') : R.backHTML();
    box.innerHTML = html;
  }

  function renderOppHand(seat, opts) {
    opts = opts || {};
    const g = UI.game;
    const box = seatEl(seat, '.opp-hand');
    const drawn = g.drawn[seat];
    const rest = g.hands[seat].filter((x) => x !== drawn);
    const ids = opts.reveal ? sortIds(rest) : rest;
    box.innerHTML = '';
    ids.forEach((id, i) => {
      const t = opts.reveal ? R.tile(id) : R.back();
      if (opts.deal) {
        t.classList.add('deal');
        t.style.setProperty('--i', i);
      }
      if (opts.reveal) {
        t.classList.add('flip');
        t.style.setProperty('--i', i);
      }
      box.appendChild(t);
    });
    if (drawn != null) {
      const t = opts.reveal ? R.tile(drawn) : R.back();
      t.classList.add('drawn');
      if (opts.drawIn) t.classList.add('in');
      box.appendChild(t);
    }
    zfix(seat, box);
  }

  function renderMyHand(opts) {
    opts = opts || {};
    const g = UI.game;
    const box = $('#my-hand');
    const prev = new Map();
    $$('.tile', box).forEach((t) => prev.set(+t.dataset.id, t.getBoundingClientRect()));
    const drawn = g.drawn[0];
    const ids = sortIds(g.hands[0].filter((x) => x !== drawn));
    box.innerHTML = '';
    ids.forEach((id) => box.appendChild(R.tile(id)));
    if (drawn != null) box.appendChild(R.tile(drawn, 'drawn'));
    $$('.tile', box).forEach((t, i) => {
      const p = prev.get(+t.dataset.id);
      if (opts.deal) {
        t.classList.add('deal');
        t.style.setProperty('--i', i);
      } else if (p) {
        const r = t.getBoundingClientRect();
        const dx = p.left - r.left, dy = p.top - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          t.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 260, easing: EASE });
        }
      } else {
        t.animate([{ transform: 'translateY(-45%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 220, easing: EASE });
      }
    });
    applyHandState();
  }

  function renderMelds(seat, animateLast) {
    const g = UI.game;
    const box = seat === 0 ? $('#my-melds') : seatEl(seat, '.melds');
    box.innerHTML = g.melds[seat].map((m) => R.meldHTML(m, seat)).join('');
    if (animateLast && box.lastElementChild) box.lastElementChild.classList.add('new');
    if (seat !== 0) zfix(seat, box);
  }

  function bubble(seat, text, cls) {
    const b = seatEl(seat, '.bubble');
    b.className = 'bubble';
    b.textContent = text;
    void b.offsetWidth;
    b.className = 'bubble show' + (cls ? ' ' + cls : '');
  }

  function banner(text, sub) {
    const b = $('#banner');
    b.className = '';
    b.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    void b.offsetWidth;
    b.className = 'show';
  }

  // ------------------------------------------------------------ 飞牌动画
  function flyTile(id, from, fromAngle, toEl, toSeat, duration) {
    const side = toEl.classList.contains('side');
    const tw = side ? toEl.offsetHeight : toEl.offsetWidth;
    const to = toEl.getBoundingClientRect();
    const ghost = R.tile(id, side ? 'side ghost' : 'ghost');
    ghost.style.setProperty('--tw', tw + 'px');
    ghost.style.setProperty('--dx', DIRS[toSeat][0]);
    ghost.style.setProperty('--dy', DIRS[toSeat][1]);
    $('#fly').appendChild(ghost);
    const gw = side ? tw * 1.36 : tw, gh = side ? tw : tw * 1.36;
    const a1 = -90 * toSeat;
    let a0 = fromAngle + (side ? 90 : 0);
    while (a0 - a1 > 180) a0 -= 360;
    while (a1 - a0 > 180) a0 += 360;
    const fromTw = Math.abs(fromAngle) % 180 === 0 ? from.width : from.height;
    const fx = from.left + from.width / 2 - gw / 2, fy = from.top + from.height / 2 - gh / 2;
    const tx = to.left + to.width / 2 - gw / 2, ty = to.top + to.height / 2 - gh / 2;
    toEl.style.visibility = 'hidden';
    duration = duration || 240;
    const anim = ghost.animate([
      { transform: `translate(${fx}px,${fy}px) rotate(${a0}deg) scale(${fromTw / tw})` },
      { transform: `translate(${tx}px,${ty}px) rotate(${a1}deg) scale(1.1)`, offset: 0.72 },
      { transform: `translate(${tx}px,${ty}px) rotate(${a1}deg) scale(1)` },
    ], { duration, easing: EASE, fill: 'forwards' });
    return Promise.race([anim.finished, sleep(duration + 120)]).then(() => {
      ghost.remove();
      toEl.style.visibility = '';
    });
  }

  // ------------------------------------------------------------ 听牌提示
  function showWaits(types, label, furiten) {
    const box = $('#waits');
    if (!types || !types.length) {
      box.classList.remove('show');
      return;
    }
    const g = UI.game;
    const vis = g.visibleCounts(0);
    let sum = 0;
    const html = types.map((t) => {
      const n = Math.max(0, 4 - vis[t]);
      sum += n;
      return `<div class="w">${R.tileHTMLByType(t, false)}<small>${L(n + ' 张', '×' + n)}</small></div>`;
    }).join('');
    box.innerHTML = `<span class="lab${furiten ? ' furiten' : ''}">${furiten ? L('振听', 'Furiten') : label}</span>${html}<span class="sum">${L(`共 ${sum} 张`, `${sum} tiles`)}</span>`;
    box.classList.add('show');
  }

  function updateWaits() {
    const g = UI.game;
    if (!g || !g.hands) return;
    if (g.drawn[0] != null || (g.hands[0].length + g.melds[0].length * 3) !== 13) return;
    const w = MJ.waits(counts(g.hands[0]), g.melds[0].length);
    showWaits(w, L('听牌', 'Waits'), w.length && g.isFuriten(0));
  }

  // ------------------------------------------------------------ 操作按钮
  function clearActions() {
    $('#actions').innerHTML = '';
    clearHint();
  }

  function showActions(btns) {
    const box = $('#actions');
    box.innerHTML = '';
    btns.forEach((b, i) => {
      const el = document.createElement('button');
      el.className = 'act ' + (b.cls || '');
      el.style.animationDelay = i * 40 + 'ms';
      if (b.html) el.innerHTML = b.html;
      else el.textContent = b.label;
      if (b.key) el.dataset.key = b.key;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        Sound.play('click');
        b.fn();
      });
      box.appendChild(el);
    });
  }

  function applyHandState() {
    const box = $('#my-hand');
    const p = UI.pending;
    const turn = p && p.kind === 'turn';
    box.classList.toggle('locked', !turn);
    $$('.tile', box).forEach((t) => {
      const id = +t.dataset.id;
      let ok = true;
      if (turn) {
        ok = p.opt.discards.includes(id);
        if (ok && p.riichiMode) ok = p.opt.riichi.includes(typeOf(id));
      }
      t.classList.toggle('dim', turn && !ok);
      t.classList.remove('hint');
    });
  }

  function promptTurn(g, opt) {
    return new Promise((resolve) => {
      if (g.riichi[0] && !opt.tsumo && !opt.ankan.length) {
        setTimeout(() => resolve({ type: 'discard', tile: opt.drawn }), 420);
        return;
      }
      const done = (a) => {
        UI.pending = null;
        clearActions();
        applyHandState();
        resolve(a);
      };
      // 预先算好每张打出后的听牌，用于悬停预览
      const waitsBy = new Map();
      const c = counts(g.hands[0]);
      const nM = g.melds[0].length;
      for (const id of opt.discards) {
        const t = typeOf(id);
        if (waitsBy.has(t)) continue;
        c[t]--;
        waitsBy.set(t, shanten(c, nM) === 0 ? MJ.waits(c, nM) : null);
        c[t]++;
      }
      const p = (UI.pending = { kind: 'turn', opt, done, riichiMode: false, waitsBy });
      const build = () => {
        const btns = [];
        if (opt.tsumo) btns.push({ label: L('自摸', 'Tsumo'), cls: 'win', key: 'tsumo', fn: () => done({ type: 'tsumo' }) });
        if (opt.kyuushu) btns.push({ label: L('九种九牌', 'Nine terminals'), cls: 'call', key: 'kyuushu', fn: () => done({ type: 'kyuushu' }) });
        if (opt.riichi.length) {
          btns.push({
            label: p.riichiMode ? L('取消', 'Cancel') : L('立直', 'Riichi'), cls: p.riichiMode ? '' : 'riichi', key: 'riichi',
            fn: () => {
              p.riichiMode = !p.riichiMode;
              build();
              applyHandState();
            },
          });
        }
        const kans = opt.ankan.map((t) => ({ type: 'ankan', t })).concat(opt.kakan.map((t) => ({ type: 'kakan', t })));
        if (kans.length === 1) btns.push({ label: L('杠', 'Kan'), cls: 'call', key: 'kan', fn: () => done(kans[0]) });
        else if (kans.length > 1) {
          btns.push({
            label: L('杠', 'Kan'), cls: 'call', key: 'kan',
            fn: () => showActions(kans.map((k) => ({
              cls: 'opt', html: R.tileHTMLByType(k.t, false).repeat(4), fn: () => done(k),
            })).concat([{ label: L('返回', 'Back'), fn: build }])),
          });
        }
        if (g.riichi[0]) btns.push({ label: L('跳过', 'Skip'), key: 'pass', fn: () => done({ type: 'discard', tile: opt.drawn }) });
        showActions(btns);
      };
      build();
      applyHandState();
    });
  }

  function promptCall(g, o) {
    return new Promise((resolve) => {
      const done = (a) => {
        UI.pending = null;
        clearActions();
        $$('.tile.target').forEach((t) => t.classList.remove('target'));
        resolve(a);
      };
      UI.pending = { kind: 'call', o, done };
      const target = $(`#table .river .tile[data-id="${o.tile}"]`) || $(`#table .melds .tile[data-id="${o.tile}"]`);
      if (target) target.classList.add('target');
      const build = () => {
        const btns = [];
        if (o.ron) btns.push({ label: L('荣', 'Ron'), cls: 'win', key: 'ron', fn: () => done({ type: 'ron' }) });
        if (o.kan) btns.push({ label: L('杠', 'Kan'), cls: 'call', key: 'kan', fn: () => done({ type: 'kan' }) });
        if (o.pon) btns.push({ label: L('碰', 'Pon'), cls: 'call', key: 'pon', fn: () => done({ type: 'pon' }) });
        if (o.chi.length) {
          btns.push({
            label: L('吃', 'Chi'), cls: 'call', key: 'chi',
            fn: () => {
              if (o.chi.length === 1) return done({ type: 'chi', tiles: o.chi[0] });
              showActions(o.chi.map((pair) => {
                const three = pair.concat(o.tile).sort((a, b) => a - b);
                return {
                  cls: 'opt', html: three.map((id) => R.tileHTML(id, id === o.tile ? 'dimmed' : '')).join(''),
                  fn: () => done({ type: 'chi', tiles: pair }),
                };
              }).concat([{ label: L('返回', 'Back'), fn: build }]));
            },
          });
        }
        btns.push({ label: L('跳过', 'Skip'), key: 'pass', fn: () => done({ type: 'pass' }) });
        showActions(btns);
      };
      build();
    });
  }

  function onHandClick(e) {
    const t = e.target.closest('.tile');
    const p = UI.pending;
    if (!t || !p || p.kind !== 'turn' || t.classList.contains('dim')) return;
    const id = +t.dataset.id;
    if (!p.opt.discards.includes(id)) return;
    clearSame();
    p.done({ type: 'discard', tile: id, riichi: p.riichiMode });
  }

  function clearSame() {
    $$('#table .tile.same').forEach((x) => x.classList.remove('same'));
  }

  function onHandOver(e) {
    const t = e.target.closest('.tile');
    if (!t) return;
    clearSame();
    $$(`#table .tile[data-t="${t.dataset.t}"]`).forEach((x) => x.classList.add('same'));
    const p = UI.pending;
    if (p && p.kind === 'turn' && !t.classList.contains('dim')) {
      const w = p.waitsBy.get(+t.dataset.t);
      if (w) showWaits(w, L('打出后听', 'Then waits on'));
      else $('#waits').classList.remove('show');
    }
  }

  function onHandOut() {
    clearSame();
    const p = UI.pending;
    if (p && p.kind === 'turn') $('#waits').classList.remove('show');
  }

  // ------------------------------------------------------------ 「策」提示
  function flashAction(key) {
    const b = $(`#actions .act[data-key="${key}"]`);
    if (b) b.classList.add('suggest');
  }

  function clearHint() {
    UI.hintToken = null;
    const hp = $('#hint-panel');
    if (hp) {
      hp.classList.remove('show');
      hp.innerHTML = '';
    }
    $$('#my-hand .tile[data-p]').forEach((t) => { t.removeAttribute('data-p'); t.classList.remove('p-best'); });
    $$('#my-hand .tile.hint').forEach((t) => t.classList.remove('hint'));
    $$('#actions .act.suggest').forEach((b) => b.classList.remove('suggest'));
  }

  function hintPanel(html) {
    const hp = $('#hint-panel');
    hp.innerHTML = html;
    hp.classList.add('show');
  }

  const pctText = (p) => (p >= 0.995 ? '99+%' : p >= 0.1 ? Math.round(p * 100) + '%' : p >= 0.001 ? (p * 100).toFixed(1) + '%' : '<0.1%');

  /** Mortal 动作编号 → 显示用的标签 HTML 与对应的按钮 key */
  function actionLabel(it, p) {
    const a = it.action;
    if (it.tile) return { html: `<span class="hl-tile">${R.tileHTMLByType(it.tile.t, it.tile.red)}</span><span>${L('打', 'discard')}</span>`, key: null };
    if (a === 37) return { html: `<b>${L('立直', 'Riichi')}</b>`, key: 'riichi' };
    if (a >= 38 && a <= 40) {
      const t = typeOf(p.o.tile);
      const base = a === 38 ? t : a === 39 ? t - 1 : t - 2;
      const tiles = [base, base + 1, base + 2].map((x) => R.tileHTMLByType(x, false, x === t ? 'dimmed' : '')).join('');
      return { html: `<b>${L('吃', 'Chi')}</b><span class="hl-tile">${tiles}</span>`, key: 'chi' };
    }
    if (a === 41) return { html: `<b>${L('碰', 'Pon')}</b>`, key: 'pon' };
    if (a === 42) return { html: `<b>${L('杠', 'Kan')}</b>`, key: 'kan' };
    if (a === 43) return { html: `<b>${p.kind === 'turn' ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}</b>`, key: p.kind === 'turn' ? 'tsumo' : 'ron' };
    if (a === 44) return { html: `<b>${L('九种九牌', 'Nine terminals')}</b>`, key: 'kyuushu' };
    return { html: `<b>${p.kind === 'turn' ? L('不操作', 'No action') : L('跳过', 'Skip')}</b>`, key: 'pass' };
  }

  function hintSource() {
    const r = UI.rules || MJ.Settings.rules;
    if (r.hintAi === 'builtin' || !UI.advisor) return 'builtin';
    return 'mortal';
  }

  async function hint() {
    const g = UI.game, p = UI.pending;
    if (!g || !p) return;
    Sound.play('click');
    clearHint();
    if (hintSource() === 'mortal') return mortalHint(g, p);
    builtinHint(g, p);
  }

  async function mortalHint(g, p) {
    const token = {};
    UI.hintToken = token;
    hintPanel(`<div class="hp-head"><b>${UI.advisorName}</b><span>${L('思考中…', 'Thinking…')}</span></div>`);
    let info = null, err = null;
    try {
      info = MJ.Mjai.parseMeta(await UI.advisor.advise(0));
      if (!info) err = L('Mortal 没有返回评价数据', 'Mortal returned no evaluation data');
    } catch (e) {
      err = String(e && e.message || e);
    }
    if (UI.hintToken !== token || UI.pending !== p) return; // 已经做出决定或换了局面
    if (err) {
      toast(L('Mortal 提示失败：' + err + '，改用内置 AI', 'Mortal hint failed: ' + err + '. Using the built-in AI instead'), 5000);
      clearHint();
      return builtinHint(g, p);
    }
    const items = info.items;
    const best = items[0];
    const shown = items.slice(0, 8);
    const rest = items.length - shown.length;
    const rows = shown.map((it, i) => {
      const lab = actionLabel(it, p);
      return `<div class="hp-row${i === 0 ? ' best' : ''}"><span class="hp-lab">${lab.html}</span>` +
        `<span class="hp-bar"><i style="width:${Math.max(1.5, it.p * 100).toFixed(1)}%"></i></span>` +
        `<span class="hp-p">${pctText(it.p)}</span><span class="hp-q" title="${L('Q 值', 'Q value')}">${it.q.toFixed(2)}</span></div>`;
    }).join('');
    const sub = info.shanten != null && info.shanten >= 0 ? `${info.shanten ? L(info.shanten + ' 向听', info.shanten + '-shanten') : L('听牌', 'Tenpai')}${info.furiten ? L(' · 振听', ' · Furiten') : ''}` : '';
    hintPanel(`<div class="hp-head"><b>${UI.advisorName}</b><span>${sub}</span></div>${rows}` +
      (rest > 0 ? `<div class="hp-more">${L(`另有 ${rest} 个选项，合计`, `${rest} more option${rest > 1 ? 's' : ''}, total`)} ${pctText(items.slice(8).reduce((a, x) => a + x.p, 0))}</div>` : '') +
      `<div class="hp-note">${L('百分比 = 对合法操作的 Q 值做 softmax，表示 AI 的倾向，仅供参考', 'Percent = softmax of the Q values of legal actions. It shows what the AI leans towards; treat it as a hint.')}</div>`);
    // 手牌上标出每张可打牌的倾向（太小的不标，免得挤在一起；完整列表看面板）
    for (const it of items) {
      if (!it.tile || (it.p < 0.005 && it !== best)) continue;
      for (const el of $$('#my-hand .tile')) {
        const id = +el.dataset.id;
        if (typeOf(id) !== it.tile.t || MJ.isRed(id) !== it.tile.red || el.classList.contains('dim')) continue;
        el.dataset.p = pctText(it.p);
        if (it === best) el.classList.add('hint', 'p-best');
      }
    }
    if (!best.tile) {
      const key = actionLabel(best, p).key;
      if (key) flashAction(key);
    }
  }

  function builtinHint(g, p) {
    if (p.kind === 'turn') {
      // 列出向听数最小的几种打法及进张数
      const hand = g.hands[0];
      const cands = MJ.AI.analyze(hand, g.melds[0].length, MJ.AI.planOf(g, 0, counts(hand), g.melds[0]), MJ.AI.remaining(g, 0), new Set(p.opt.discards.map(typeOf)));
      cands.sort((a, b) => a.s - b.s || b.uke - a.uke);
      const rows = cands.slice(0, 5).map((c, i) => `<div class="hp-row plain${i === 0 ? ' best' : ''}"><span class="hp-lab"><span class="hl-tile">${R.tileHTMLByType(c.t, false)}</span><span>${L('打', 'discard')}</span></span>` +
        `<span class="hp-info">${c.s <= 0 ? L('听牌', 'Tenpai') : L(c.s + ' 向听', c.s + '-shanten')} · ${L(`进张 ${c.uke} 张`, `${c.uke} ukeire`)}</span></div>`).join('');
      if (rows) hintPanel(`<div class="hp-head"><b>${L('内置 AI', 'Built-in AI')}</b><span>${L('牌效参考', 'Tile efficiency')}</span></div>` + rows + `<div class="hp-note">${L('发光的牌是内置 AI 综合牌效、打点与安全度后的选择', 'The glowing tile is the built-in AI\'s pick, weighing efficiency, value and safety')}</div>`);
    }
    const flash = flashAction;
    if (p.kind === 'turn') {
      const a = MJ.AI.decideTurn(g, 0, p.opt);
      if (a.type === 'tsumo') flash('tsumo');
      else if (a.type === 'kyuushu') flash('kyuushu');
      else if (a.type === 'ankan' || a.type === 'kakan') flash('kan');
      else {
        $$('#my-hand .tile').forEach((t) => t.classList.toggle('hint', typeOf(+t.dataset.id) === typeOf(a.tile) && !t.classList.contains('dim')));
        if (a.riichi && !p.riichiMode) flash('riichi');
      }
    } else {
      const a = MJ.AI.decideCall(g, 0, p.o);
      flash(a.type);
    }
  }

  // ------------------------------------------------------------ 对局事件
  const handlers = {
    async gameStart() {
      $('#menu').classList.remove('show');
      $('#overlay').innerHTML = '';
      buildTable();
      renderCenter();
    },

    async handStart() {
      const g = UI.game;
      UI.pending = null;
      UI.sidePending = [false, false, false, false];
      clearActions();
      $('#waits').classList.remove('show');
      $('#overlay').innerHTML = '';
      buildTable();
      $('#my-melds').innerHTML = '';
      $('#my-hand').innerHTML = '';
      renderCenter();
      renderDora();
      banner(roundTitle(g), g.honba ? L(g.honba + ' 本场', g.honba + ' honba') : g.dealer === 0 ? L('你是亲家', 'You are the dealer') : L(SEAT[g.dealer] + '坐庄', `${SEAT[g.dealer]} is the dealer`));
      await sleep(650);
      Sound.play('deal');
      for (let s = 1; s < 4; s++) renderOppHand(s, { deal: true });
      renderMyHand({ deal: true });
      await sleep(780);
    },

    async draw(d) {
      renderCenter();
      if (d.seat === 0) {
        renderMyHand();
        Sound.play('draw');
        await sleep(60);
      } else {
        renderOppHand(d.seat, { drawIn: true });
        await sleep(110);
      }
    },

    async discard(d) {
      const g = UI.game;
      const seat = d.seat;
      let from, fromAngle = -90 * seat;
      if (seat === 0) {
        const t = $(`#my-hand .tile[data-id="${d.tile}"]`);
        from = t.getBoundingClientRect();
        fromAngle = 0;
      } else {
        const tiles = seatEl(seat, '.opp-hand').children;
        const src = d.tsumogiri || tiles.length < 2 ? tiles[tiles.length - 1] : tiles[Math.floor(Math.random() * (tiles.length - 1))];
        from = src.getBoundingClientRect();
      }
      if (d.riichi) {
        bubble(seat, L('立直', 'Riichi'), 'riichi');
        Sound.play('riichi');
        await sleep(480);
      }
      const side = d.riichi || UI.sidePending[seat];
      UI.sidePending[seat] = false;
      const rows = $$('.row', seatEl(seat, '.river'));
      const row = rows[0].children.length < 6 ? rows[0] : rows[1].children.length < 6 ? rows[1] : rows[2];
      const t = R.tile(d.tile, side ? 'side' : '');
      row.appendChild(t);
      zfix(seat, seatEl(seat, '.river'));
      if (seat === 0) {
        $('#waits').classList.remove('show');
        renderMyHand();
      } else renderOppHand(seat);
      $$('#table .tile.last').forEach((x) => x.classList.remove('last'));
      await flyTile(d.tile, from, fromAngle, t, seat);
      t.classList.add('last');
      Sound.play('discard');
      if (seat === 0) updateWaits();
      await sleep(70);
    },

    async riichiAccepted(d) {
      seatEl(d.seat, '.stick').classList.add('on');
      renderCenter();
      await sleep(120);
    },

    async call(d) {
      const g = UI.game;
      const text = d.kind === 'chi' ? L('吃', 'Chi') : d.kind === 'pon' ? L('碰', 'Pon') : L('杠', 'Kan');
      bubble(d.seat, text);
      Sound.play('call');
      if (d.from !== d.seat) {
        const t = $(`.seat[data-seat="${d.from}"] .river .tile[data-id="${d.meld.called}"]`);
        if (t) {
          if (t.classList.contains('side')) UI.sidePending[d.from] = true;
          t.remove();
        }
      }
      $$('#table .tile.last').forEach((x) => x.classList.remove('last'));
      renderMelds(d.seat, true);
      if (d.seat === 0) {
        renderMyHand();
        $('#waits').classList.remove('show');
      } else renderOppHand(d.seat);
      renderCenter();
      await sleep(620);
    },

    async dora() {
      renderDora(true);
      Sound.play('dora');
      renderCenter();
      await sleep(350);
    },

    async win(d) {
      const g = UI.game;
      UI.pending = null;
      clearActions();
      $('#waits').classList.remove('show');
      $$('.plate.active').forEach((p) => p.classList.remove('active'));
      for (const r of d.results) {
        bubble(r.seat, r.tsumo ? L('自摸', 'Tsumo') : L('荣', 'Ron'), 'win');
        if (r.seat !== 0) renderOppHand(r.seat, { reveal: true });
      }
      Sound.play('win');
      await sleep(1500);
      const running = d.before.slice();
      for (const r of d.results) {
        const before = running.slice();
        for (let s = 0; s < 4; s++) running[s] += r.deltas[s];
        await showWinCard(r, before, running.slice());
      }
      renderCenter();
    },

    async ryuukyoku(d) {
      const g = UI.game;
      UI.pending = null;
      clearActions();
      $$('.plate.active').forEach((p) => p.classList.remove('active'));
      banner(d.nagashi && d.nagashi.length ? L('流局满贯', 'Nagashi Mangan') : L('流局', 'Draw'), L('荒牌流局', 'Exhaustive draw'));
      Sound.play('draw-end');
      for (let s = 1; s < 4; s++) if (d.tenpai[s]) renderOppHand(s, { reveal: true });
      await sleep(1400);
      await showDrawCard(d);
      renderCenter();
    },

    async abort(d) {
      UI.pending = null;
      clearActions();
      $('#waits').classList.remove('show');
      $$('.plate.active').forEach((p) => p.classList.remove('active'));
      const info = ABORT[d.kind];
      if (d.kind === 'kyuushu' && d.seat !== 0) renderOppHand(d.seat, { reveal: true });
      if (d.kind === 'kyuushu') bubble(d.seat, L('流局', 'Draw'));
      banner(info.name, L('途中流局', 'Abortive draw'));
      Sound.play('draw-end');
      await sleep(1400);
      const g = UI.game;
      let who = '';
      if (d.kind === 'kyuushu') who = L(`${whoLabel(g.seatWind(d.seat), d.seat)}宣告。`, `Declared by ${whoLabel(g.seatWind(d.seat), d.seat)}. `);
      if (d.kind === 'sanchahou') who = L(`${d.seats.map((s) => SEAT[s]).join('、')}同时荣和${SEAT[d.from]}的舍牌。`, `${d.seats.map((s) => SEAT[s]).join(', ')} all called ron on ${SEAT[d.from]}'s discard. `);
      const html = `<div class="win-head"><span class="win-kind" style="color:var(--jade)">${info.name}</span><span class="sub">${L('途中流局 · 不计点数，本场 +1，亲家连庄', 'Abortive draw · no points change, honba +1, the dealer repeats')}</span></div>` +
        `<p class="abort-why">${who}${info.desc}</p>` +
        (d.kind === 'kyuushu' ? `<div class="win-hand"><div class="closed">${MJ.sortIds(g.hands[d.seat]).map((id) => R.tileHTML(id)).join('')}</div></div>` : '') +
        deltasHTML(g, d.before, d.after) +
        `<div class="btn-row"><button class="btn primary" data-a="next">${L('继续', 'Continue')}</button></div>`;
      await waitModal(modal(html));
      renderCenter();
    },

    async gameEnd(d) {
      renderCenter();
      await showEndCard(d);
    },
  };

  const ABORT = {
    kyuushu: { name: L('九种九牌', 'Nine Terminals'), desc: L('第一巡、无人鸣牌时，手里有九种以上的幺九牌，可以宣告流局。', 'On the first go-around with no calls, a hand holding nine or more different terminals and honors may declare a draw.') },
    suufon: { name: L('四风连打', 'Four Winds'), desc: L('第一巡四家打出了同一种风牌。', 'All four players discarded the same wind on the first go-around.') },
    suucha: { name: L('四家立直', 'Four Riichi'), desc: L('四家全部立直。', 'All four players declared riichi.') },
    suukaikan: { name: L('四杠散了', 'Four Kans'), desc: L('两家以上合计开了四个杠。', 'Four kans were made by two or more players.') },
    sanchahou: { name: L('三家和了', 'Triple Ron'), desc: L('三家同时荣和同一张牌。', 'Three players called ron on the same tile.') },
  };

  // ------------------------------------------------------------ 结算弹层
  function modal(html, wide) {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="overlay"><div class="card"${wide ? ' style="width:min(960px,100%)"' : ''}>${html}</div></div>`;
    return ov.firstChild;
  }

  function deltasHTML(g, before, after) {
    let h = '<div class="deltas">';
    for (let s = 0; s < 4; s++) {
      const df = after[s] - before[s];
      h += `<div class="delta${s === 0 ? ' me' : ''}"><div class="who"><i>${WIND[g.seatWind(s)]}</i>${SEAT[s]}</div>` +
        `<div class="sc">${fmt(after[s])}</div>` +
        `<div class="df ${df > 0 ? 'up' : df < 0 ? 'down' : ''}">${df > 0 ? '+' + fmt(df) : df < 0 ? '−' + fmt(-df) : '±0'}</div></div>`;
    }
    return h + '</div>';
  }

  function winHandHTML(r) {
    let h = '<div class="closed">' + r.hand.map((id) => R.tileHTML(id)).join('') + '</div>';
    h += `<div class="wt" data-lab="${r.tsumo ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}">${R.tileHTML(r.winTile)}</div>`;
    if (r.melds.length) h += '<div class="melds">' + r.melds.map((m) => R.meldHTML(m, r.seat)).join('') + '</div>';
    return h;
  }

  function showWinCard(r, before, after) {
    const g = UI.game;
    const res = r.res;
    const who = whoLabel(r.seatWind, r.seat);
    const fromTxt = r.tsumo ? '' : `<span class="sub">${L('放铳：', 'Dealt in by ')}${whoLabel(g.seatWind(r.from), r.from)}</span>`;
    const yaku = res.yaku.map((y, i) =>
      `<div class="yaku${y.dora ? ' dora' : ''}${y.yakuman ? ' ym' : ''}" style="--i:${i}"><span>${tr(y.name)}</span><b>${y.yakuman ? L('役满', 'Yakuman') : L(y.han + ' 番', y.han + ' han')}</b></div>`).join('');
    const pay = r.pay;
    let payDesc;
    if (!r.tsumo) payDesc = L(`${SEAT[r.from]}支付 ${fmt(pay.total)}`, `${SEAT[r.from]} pays ${fmt(pay.total)}`);
    else if (r.isDealer) payDesc = L(`三家各付 ${fmt(pay.all)}`, `${fmt(pay.all)} from each player`);
    else payDesc = L(`亲家付 ${fmt(pay.dealer)}，子家各付 ${fmt(pay.other)}`, `Dealer pays ${fmt(pay.dealer)}, others ${fmt(pay.other)} each`);
    if (r.sticks) payDesc += L(`，另得供托 ${fmt(r.sticks * 1000)}`, `, plus ${fmt(r.sticks * 1000)} in riichi sticks`);
    const doraRow = `<div class="dora-row"><div><span class="lab">${L('宝牌指示', 'Dora indicator')}</span><span class="set">${r.doraInd.map((id) => R.tileHTML(id)).join('')}</span></div>` +
      (r.uraInd.length ? `<div><span class="lab">${L('里宝牌指示', 'Ura dora indicator')}</span><span class="set">${r.uraInd.map((id) => R.tileHTML(id)).join('')}</span></div>` : '') + '</div>';
    const lines = R.explain(res, r.isDealer, r.tsumo, r.honba);
    const html =
      `<div class="win-head"><span class="win-kind">${r.tsumo ? L('自摸', 'Tsumo') : L('荣和', 'Ron')}</span><h2>${who}</h2>${fromTxt}</div>` +
      `<div class="win-hand">${winHandHTML(r)}</div>${doraRow}` +
      `<div class="win-body"><div class="yaku-list">${yaku}</div><div>` +
      `<div class="total"><span class="hf">${res.yakuman ? '' : L(res.fu + ' 符 ' + res.han + ' 番', res.fu + ' fu ' + res.han + ' han')}</span><span class="limit">${tr(res.limit)}</span></div>` +
      `<div class="total"><span class="pts">${fmt(pay.total + (r.sticks || 0) * 1000)}<small>${L('点', 'pts')}</small></span></div>` +
      `<div class="paydesc">${payDesc}</div>` +
      `<details class="explain" open><summary>${L('这手牌的点数是怎么算的', 'How this hand was scored')}</summary><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol></details>` +
      '</div></div>' +
      deltasHTML(g, before, after) +
      `<div class="btn-row"><button class="btn" data-a="tut">${L('点数教程', 'Scoring tutorial')}</button><button class="btn primary" data-a="next">${L('继续', 'Continue')}</button></div>`;
    return waitModal(modal(html));
  }

  function showDrawCard(d) {
    const g = UI.game;
    let rows = '';
    for (let s = 0; s < 4; s++) {
      let extra = '';
      if (d.tenpai[s]) {
        const w = MJ.waits(counts(g.hands[s]), g.melds[s].length);
        extra = `<span class="sub">${L('听', 'Waits')}</span><span class="hand">${w.map((t) => R.tileHTMLByType(t, false)).join('')}</span>`;
      }
      rows += `<div data-seat="${s}" class="tenpai-row"><span><b style="color:var(--gold);font-family:var(--kai)">${WIND[g.seatWind(s)]}</b> ${SEAT[s]}</span>` +
        `<span class="st ${d.tenpai[s] ? 'yes' : 'no'}">${d.tenpai[s] ? L('听牌', 'Tenpai') : L('未听', 'Noten')}</span>${extra}</div>`;
    }
    const n = d.tenpai.filter(Boolean).length;
    let note = n === 0 || n === 4 ? L('无人支付罚符', 'No noten penalty') : L('未听牌者共付 3000 点，由听牌者平分', 'Noten players pay 3,000 in total, split among tenpai players');
    if (d.nagashi && d.nagashi.length) {
      note = L(d.nagashi.map((s) => SEAT[s]).join('、') + ' 流局满贯（舍牌全是幺九且未被鸣走），按满贯自摸收点，不计不听罚符',
        d.nagashi.map((s) => SEAT[s]).join(', ') + ': Nagashi Mangan (every discard a terminal or honor, none called). Paid as a mangan tsumo; no noten penalty');
      for (const s of d.nagashi) rows = rows.replace(`data-seat="${s}" class="tenpai-row"`, `data-seat="${s}" class="tenpai-row nagashi"`);
    }
    const html = `<div class="win-head"><span class="win-kind" style="color:var(--jade)">${d.nagashi && d.nagashi.length ? L('流局满贯', 'Nagashi Mangan') : L('流局', 'Draw')}</span><span class="sub">${note}${d.tenpai[g.dealer] ? L(' · 亲家听牌连庄', ' · Dealer tenpai, dealer repeats') : L(' · 亲家未听，轮庄', ' · Dealer noten, deal passes')}</span></div>` +
      rows + deltasHTML(g, d.before, d.after) +
      `<div class="btn-row"><button class="btn primary" data-a="next">${L('继续', 'Continue')}</button></div>`;
    return waitModal(modal(html));
  }

  function showEndCard(d) {
    const g = UI.game;
    const place = d.ranking.indexOf(0) + 1;
    const title = L(['一位！漂亮的胜利', '二位，稳稳连对', '三位，再接再厉', '四位，下次翻盘'], ['1st place! A fine win', '2nd place, solid', '3rd place, keep going', '4th place, next time'])[place - 1];
    const r = g.rules;
    const goal = Math.max(r.goalPoints, r.startPoints);
    const uma = MJ.UMA[r.uma] || MJ.UMA.none;
    const oka = ((goal - r.startPoints) * 4) / 1000;
    const signed = MJ.Records.signed;
    let rows = '';
    d.ranking.forEach((s, i) => {
      const p = d.points[s];
      const parts = [`(${fmt(d.scores[s])} − ${fmt(goal)}) ÷ 1000`];
      if (uma[i]) parts.push(`${L('马', 'uma')} ${uma[i] > 0 ? '+' : '−'}${Math.abs(uma[i])}`);
      if (i === 0 && oka) parts.push(`${L('返点差', 'oka')} +${oka}`);
      rows += `<div class="rank-row${s === 0 ? ' me' : ''}" style="--i:${i}"><span class="no">${i + 1}</span><span>${SEAT[s]}</span>` +
        `<span class="sc">${fmt(d.scores[s])}</span><span class="fp ${p > 0 ? 'up' : p < 0 ? 'down' : ''}" title="${parts.join(' ＋ ')}">${signed(p)}</span></div>`;
    });
    const rec = UI.tracker && UI.tracker.record;
    let mine = '';
    if (rec) {
      const st = rec.stats;
      const n = MJ.Records.list().length;
      mine = `<div class="end-mine"><span>${L(`本场：${st.hands} 局 · 和了 ${st.win} · 放铳 ${st.dealin} · 立直 ${st.riichi} · 副露 ${st.open}`, `This game: ${st.hands} hands · ${st.win} wins · ${st.dealin} deal-ins · ${st.riichi} riichi · ${st.open} open`)}</span>` +
        `<span class="muted">${L(`已存入战绩（共 ${n} 场）`, `Saved to your records (${n} games)`)}</span></div>`;
    }
    const umaTxt = uma[0] ? L(`顺位马 ${MJ.Records.umaLabel(r.uma)}`, `uma ${MJ.Records.umaLabel(r.uma)}`) : L('无顺位马', 'no uma');
    const html = `<div class="win-head"><span class="win-kind">${L('终局', 'Game over')}</span><h2>${title}</h2>` +
      `<span class="sub">${L(`得点 = (点数 − 返点 ${fmt(goal)}) ÷ 1000 + ${umaTxt}${oka ? `，一位另得返点差 +${oka}` : ''}`, `Final = (score − ${fmt(goal)} return) ÷ 1000 + ${umaTxt}${oka ? `; 1st also gets oka +${oka}` : ''}`)}</span></div>${rows}${mine}` +
      '<div class="btn-row">' + (rec && rec.paifu ? `<button class="btn" data-a="replay">${L('查看牌谱', 'Replay game')}</button>` : '') +
      `<button class="btn" data-a="stats">${L('战绩与数据', 'Records & stats')}</button><button class="btn" data-a="menu">${L('返回主菜单', 'Main menu')}</button><button class="btn primary" data-a="again">${L('再来一局', 'Play again')}</button></div>`;
    const m = modal(html);
    Sound.play(place <= 2 ? 'win' : 'draw-end');
    return new Promise((resolve) => {
      m.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'stats') MJ.Records.open();
        else if (a === 'replay') Promise.resolve(UI.tracker && UI.tracker.paifuSaved).then(() => MJ.Replay.open(rec));
        else if (a === 'menu') {
          resolve();
          showMenu();
        } else if (a === 'again') {
          resolve();
          startGame(g.length);
        }
      });
    });
  }

  function waitModal(m) {
    return new Promise((resolve) => {
      m.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'tut') MJ.Tutorial.open();
        if (a === 'next') {
          Sound.play('click');
          $('#overlay').innerHTML = '';
          resolve();
        }
      });
    });
  }

  // ------------------------------------------------------------ 流程
  let toastTimer = null;
  function toast(text, ms) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 4200);
  }

  async function startGame(length) {
    if (UI.game) UI.game.abort();
    Sound.unlock();
    const rules = MJ.Settings.rules;
    const fast = rules.aiSpeed === 'fast';
    const human = {
      onTurn: (g, seat, opt) => promptTurn(g, opt),
      onCall: (g, seat, o) => promptCall(g, o),
      // 别家已经宣言了优先级更高的鸣牌（如碰 > 吃），撤回自己的鸣牌提示
      cancelCall: () => {
        const p = UI.pending;
        if (p && p.kind === 'call') p.done({ type: 'pass' });
      },
    };
    const delay = (kind) => sleep(kind === 'turn' ? (fast ? 120 + Math.random() * 120 : 300 + Math.random() * 360) : fast ? 80 : 180);
    const builtin = () => new MJ.AI.AIAgent({ delay });

    let useMortal = rules.ai === 'mortal';
    let engineName = 'Mortal';
    let bridgeOk = false;
    if (useMortal) {
      toast(L('正在连接 Mortal…', 'Connecting to Mortal…'), 2500);
      const p = await MJ.Mjai.ping(rules.mortalUrl);
      if (!p.ok) {
        useMortal = false;
        toast(L('连不上 Mortal 桥接程序（' + (p.error || '未知错误') + '），本局改用内置 AI', 'Cannot reach the Mortal bridge (' + (p.error || 'unknown error') + '). Using the built-in AI this game'), 6000);
      } else {
        bridgeOk = true;
        engineName = p.engine || 'Mortal';
        toast(L('对手：', 'Opponents: ') + engineName, 2500);
      }
    }
    // 「策」提示：跟随对手，或单独指定 Mortal
    let hintMortal = rules.hintAi === 'mortal' || (rules.hintAi === 'auto' && useMortal);
    if (hintMortal && !bridgeOk) {
      if (rules.ai === 'mortal') hintMortal = false; // 刚才已经连不上
      else {
        const p = await MJ.Mjai.ping(rules.mortalUrl);
        if (p.ok) engineName = p.engine || 'Mortal';
        else {
          hintMortal = false;
          toast(L('连不上 Mortal 桥接程序，「策」提示改用内置 AI', 'Cannot reach the Mortal bridge; hints will use the built-in AI'), 5000);
        }
      }
    }

    const agents = [human];
    const game = new MJ.Game({
      agents, length, rules,
      listener: async (type, d, g) => {
        if (g !== UI.game) return;
        if (handlers[type]) await handlers[type](d);
      },
    });
    // 完整事件记录：既是保存下来的牌谱，也是发给 Mortal 的输入
    const log = new MJ.Mjai.MjaiLog(game);
    const session = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    UI.advisor = hintMortal ? new MJ.Mjai.MjaiAdvisor({ url: rules.mortalUrl, log, session }) : null;
    UI.advisorName = engineName;
    UI.rules = rules;
    if (useMortal) {
      let warned = false;
      for (let s = 1; s < 4; s++) {
        const a = new MJ.Mjai.MjaiAgent({
          url: rules.mortalUrl, log, session, fallback: builtin(),
          onError: (msg) => {
            console.warn('Mortal seat ' + s + ':', msg);
            if (!warned) toast(L('Mortal 出错，已换回内置 AI：', 'Mortal failed, switched back to the built-in AI: ') + msg, 7000);
            warned = true;
            $('#ai-badge').classList.add('bad');
          },
        });
        // Mortal 自己就有计算延迟，只补一点节奏
        const t = a.onTurn.bind(a);
        a.onTurn = async (g, seat, opt) => {
          const [r] = await Promise.all([t(g, seat, opt), sleep(fast ? 60 : 220)]);
          return r;
        };
        agents.push(a);
      }
    } else {
      for (let i = 1; i < 4; i++) agents.push(builtin());
    }
    const badge = $('#ai-badge');
    badge.textContent = useMortal ? engineName : L('内置 AI', 'Built-in AI');
    badge.className = useMortal ? 'mortal' : '';

    UI.tracker = MJ.Records.track(game, { ai: useMortal ? engineName : '内置 AI', rules: MJ.Settings.summary(true, null, 'zh'), ruleSet: MJ.Settings.rules, log });
    UI.game = game;
    UI.pending = null;
    clearActions();
    $('#my-hand').innerHTML = '';
    $('#my-melds').innerHTML = '';
    $('#waits').classList.remove('show');
    game.run().catch((err) => {
      console.error(err);
      modal(`<h2>${L('出错了', 'Something went wrong')}</h2><p class="sub">${String(err && err.message || err)}</p><div class="btn-row"><button class="btn primary" onclick="location.reload()">${L('重新载入', 'Reload')}</button></div>`);
    });
  }

  function showMenu() {
    if (UI.game) UI.game.abort();
    UI.game = null;
    UI.pending = null;
    clearActions();
    $('#overlay').innerHTML = '';
    $('#waits').classList.remove('show');
    const deco = MJ.parseTypes('1m9p1s1z5z6z7z').map((x, i) =>
      R.tileHTMLByType(x.t, false).replace('class="tile"', `class="tile" style="--i:${i}"`)).join('');
    $('#menu').innerHTML =
      '<div class="bg"></div><div class="inner">' +
      `<div class="deco">${deco}</div>` +
      `<h1>雀庭</h1><div class="tag">${L('立直麻将 · 四人对局', 'Riichi Pavilion · 4-player riichi mahjong')}</div>` +
      '<div class="modes">' +
      `<button class="mode" data-len="east"><b>${L('东风战', 'East game')}</b><span>${L('一圈四局，约十分钟<br>适合快速来一把', 'One round of four hands<br>about ten minutes')}</span></button>` +
      `<button class="mode" data-len="south"><b>${L('半庄战', 'Hanchan')}</b><span>${L('东南两圈八局<br>标准的完整对局', 'East and South rounds<br>the standard full game')}</span></button>` +
      `<button class="mode learn" data-len="tut"><b>${L('点数教程', 'Scoring tutorial')}</b><span>${L('符、番、点数表<br>例题与随机练习', 'Fu, han, score tables<br>examples and practice')}</span></button>` +
      '</div>' +
      '<div class="menu-links">' +
      `<button class="rules-link" data-len="rules"><b>${L('规则设置', 'Rules')}</b><span class="rule-sum"></span></button>` +
      `<button class="rules-link" data-len="stats"><b>${L('战绩与数据', 'Records & stats')}</b><span class="stat-sum"></span></button>` +
      '</div>' +
      `<div class="foot">${L('全部资源本地生成，可离线游玩', 'Everything is generated locally and works offline')}</div>` +
      '</div>' +
      `<button class="lang-switch" data-len="lang" title="${L('切换语言', 'Switch language')}"><b class="${EN ? '' : 'on'}">中文</b><b class="${EN ? 'on' : ''}">English</b></button>`;
    $('#menu').classList.add('show');
    refreshMenu();
  }

  function refreshMenu() {
    const el = $('#menu .rule-sum');
    if (el) el.textContent = MJ.Settings.summary();
    const st = $('#menu .stat-sum');
    if (st) {
      const recs = MJ.Records.list();
      if (!recs.length) st.textContent = L('还没有对局记录', 'No games recorded yet');
      else {
        const sm = MJ.Records.summarize(recs);
        st.textContent = L(`${sm.games} 场 · 平均顺位 ${sm.avgRank.toFixed(2)} · 累计 ${MJ.Records.signed(sm.pt)} · 和了率 ${(sm.rate.win * 100).toFixed(1)}%`,
          `${sm.games} games · avg place ${sm.avgRank.toFixed(2)} · total ${MJ.Records.signed(sm.pt)} · win rate ${(sm.rate.win * 100).toFixed(1)}%`);
      }
    }
  }

  function init() {
    R.installSprites();
    Sound.init();
    layout();
    buildTable();
    window.addEventListener('resize', layout);
    $('#my-hand').addEventListener('click', onHandClick);
    $('#my-hand').addEventListener('mouseover', onHandOver);
    $('#my-hand').addEventListener('mouseleave', onHandOut);
    $('#menu').addEventListener('click', (e) => {
      const b = e.target.closest('.mode, .rules-link, .lang-switch');
      if (!b) return;
      Sound.unlock();
      Sound.play('click');
      if (b.dataset.len === 'lang') MJ.setLang(EN ? 'zh' : 'en');
      else if (b.dataset.len === 'tut') MJ.Tutorial.open();
      else if (b.dataset.len === 'rules') MJ.Settings.open();
      else if (b.dataset.len === 'stats') MJ.Records.open();
      else startGame(b.dataset.len);
    });
    $('#btn-tutorial').addEventListener('click', () => {
      Sound.unlock();
      Sound.play('click');
      MJ.Tutorial.open();
    });
    $('#btn-hint').addEventListener('click', hint);
    $('#btn-rules').addEventListener('click', () => {
      Sound.unlock();
      Sound.play('click');
      MJ.Settings.open();
    });
    const sb = $('#btn-sound');
    sb.classList.toggle('off', !Sound.on);
    sb.addEventListener('click', () => {
      Sound.unlock();
      sb.classList.toggle('off', !Sound.toggle());
    });
    $('#btn-menu').addEventListener('click', () => {
      Sound.play('click');
      if (!UI.game || UI.game.over) return showMenu();
      const box = document.createElement('div');
      box.innerHTML = `<div class="overlay" style="z-index:110"><div class="card" style="width:min(420px,100%)"><h2>${L('回到主菜单？', 'Back to the main menu?')}</h2><p class="sub">${L('当前对局不会保存。', 'This game will not be saved.')}</p>` +
        `<div class="btn-row"><button class="btn" data-a="no">${L('继续对局', 'Keep playing')}</button><button class="btn primary" data-a="yes">${L('回到主菜单', 'Main menu')}</button></div></div></div>`;
      const ov = box.firstChild;
      $('#app').appendChild(ov);
      ov.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'yes') {
          ov.remove();
          showMenu();
        } else if (a === 'no' || e.target === ov) ov.remove();
      });
    });
    showMenu();
  }

  MJ.UI = Object.assign(UI, { init, startGame, showMenu, layout, refreshMenu, toast });
})();
