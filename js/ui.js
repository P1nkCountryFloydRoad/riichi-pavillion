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
  const WIND = ['東', '南', '西', '北'];
  const NUM = ['一', '二', '三', '四'];
  const SEAT = ['你', '下家', '对家', '上家'];
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
    $('#center .round').textContent = WIND[g.roundWind] + NUM[g.kyoku % 4] + '局';
    $('#center .counts').innerHTML = `<span><i>本场</i>${g.honba}</span><span><i>供托</i>${g.sticks}</span>`;
    $('#center .wall-left').innerHTML = `余 <b>${g.live ? g.tilesLeft : 70}</b> 张`;
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
      return `<div class="w">${R.tileHTMLByType(t, false)}<small>${n} 张</small></div>`;
    }).join('');
    box.innerHTML = `<span class="lab${furiten ? ' furiten' : ''}">${furiten ? '振听' : label}</span>${html}<span class="sum">共 ${sum} 张</span>`;
    box.classList.add('show');
  }

  function updateWaits() {
    const g = UI.game;
    if (!g || !g.hands) return;
    if (g.drawn[0] != null || (g.hands[0].length + g.melds[0].length * 3) !== 13) return;
    const w = MJ.waits(counts(g.hands[0]), g.melds[0].length);
    showWaits(w, '听牌', w.length && g.isFuriten(0));
  }

  // ------------------------------------------------------------ 操作按钮
  function clearActions() {
    $('#actions').innerHTML = '';
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
        if (opt.tsumo) btns.push({ label: '自摸', cls: 'win', key: 'tsumo', fn: () => done({ type: 'tsumo' }) });
        if (opt.riichi.length) {
          btns.push({
            label: p.riichiMode ? '取消' : '立直', cls: p.riichiMode ? '' : 'riichi', key: 'riichi',
            fn: () => {
              p.riichiMode = !p.riichiMode;
              build();
              applyHandState();
            },
          });
        }
        const kans = opt.ankan.map((t) => ({ type: 'ankan', t })).concat(opt.kakan.map((t) => ({ type: 'kakan', t })));
        if (kans.length === 1) btns.push({ label: '杠', cls: 'call', key: 'kan', fn: () => done(kans[0]) });
        else if (kans.length > 1) {
          btns.push({
            label: '杠', cls: 'call', key: 'kan',
            fn: () => showActions(kans.map((k) => ({
              cls: 'opt', html: R.tileHTMLByType(k.t, false).repeat(4), fn: () => done(k),
            })).concat([{ label: '返回', fn: build }])),
          });
        }
        if (g.riichi[0]) btns.push({ label: '跳过', key: 'pass', fn: () => done({ type: 'discard', tile: opt.drawn }) });
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
        if (o.ron) btns.push({ label: '荣', cls: 'win', key: 'ron', fn: () => done({ type: 'ron' }) });
        if (o.kan) btns.push({ label: '杠', cls: 'call', key: 'kan', fn: () => done({ type: 'kan' }) });
        if (o.pon) btns.push({ label: '碰', cls: 'call', key: 'pon', fn: () => done({ type: 'pon' }) });
        if (o.chi.length) {
          btns.push({
            label: '吃', cls: 'call', key: 'chi',
            fn: () => {
              if (o.chi.length === 1) return done({ type: 'chi', tiles: o.chi[0] });
              showActions(o.chi.map((pair) => {
                const three = pair.concat(o.tile).sort((a, b) => a - b);
                return {
                  cls: 'opt', html: three.map((id) => R.tileHTML(id, id === o.tile ? 'dimmed' : '')).join(''),
                  fn: () => done({ type: 'chi', tiles: pair }),
                };
              }).concat([{ label: '返回', fn: build }]));
            },
          });
        }
        btns.push({ label: '跳过', key: 'pass', fn: () => done({ type: 'pass' }) });
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
      if (w) showWaits(w, '打出后听');
      else $('#waits').classList.remove('show');
    }
  }

  function onHandOut() {
    clearSame();
    const p = UI.pending;
    if (p && p.kind === 'turn') $('#waits').classList.remove('show');
  }

  function hint() {
    const g = UI.game, p = UI.pending;
    if (!g || !p) return;
    Sound.play('click');
    const flash = (key) => {
      const b = $(`#actions .act[data-key="${key}"]`);
      if (b) b.classList.add('suggest');
    };
    $$('#actions .act.suggest').forEach((b) => b.classList.remove('suggest'));
    if (p.kind === 'turn') {
      const a = MJ.AI.decideTurn(g, 0, p.opt);
      if (a.type === 'tsumo') flash('tsumo');
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
      banner(WIND[g.roundWind] + NUM[g.kyoku % 4] + '局', g.honba ? g.honba + ' 本场' : g.dealer === 0 ? '你是亲家' : SEAT[g.dealer] + '坐庄');
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
        bubble(seat, '立直', 'riichi');
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
      const text = d.kind === 'chi' ? '吃' : d.kind === 'pon' ? '碰' : '杠';
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
        bubble(r.seat, r.tsumo ? '自摸' : '荣', 'win');
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
      banner('流局', '荒牌流局');
      Sound.play('draw-end');
      for (let s = 1; s < 4; s++) if (d.tenpai[s]) renderOppHand(s, { reveal: true });
      await sleep(1400);
      await showDrawCard(d);
      renderCenter();
    },

    async gameEnd(d) {
      renderCenter();
      await showEndCard(d);
    },
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
    h += `<div class="wt" data-lab="${r.tsumo ? '自摸' : '荣和'}">${R.tileHTML(r.winTile)}</div>`;
    if (r.melds.length) h += '<div class="melds">' + r.melds.map((m) => R.meldHTML(m, r.seat)).join('') + '</div>';
    return h;
  }

  function showWinCard(r, before, after) {
    const g = UI.game;
    const res = r.res;
    const who = `${WIND[r.seatWind]}家 · ${SEAT[r.seat]}`;
    const fromTxt = r.tsumo ? '' : `<span class="sub">放铳：${WIND[g.seatWind(r.from)]}家 · ${SEAT[r.from]}</span>`;
    const yaku = res.yaku.map((y, i) =>
      `<div class="yaku${y.dora ? ' dora' : ''}${y.yakuman ? ' ym' : ''}" style="--i:${i}"><span>${y.name}</span><b>${y.yakuman ? '役满' : y.han + ' 番'}</b></div>`).join('');
    const pay = r.pay;
    let payDesc;
    if (!r.tsumo) payDesc = `${SEAT[r.from]}支付 ${fmt(pay.total)}`;
    else if (r.isDealer) payDesc = `三家各付 ${fmt(pay.all)}`;
    else payDesc = `亲家付 ${fmt(pay.dealer)}，子家各付 ${fmt(pay.other)}`;
    if (r.sticks) payDesc += `，另得供托 ${fmt(r.sticks * 1000)}`;
    const doraRow = `<div class="dora-row"><div><span class="lab">宝牌指示</span><span class="set">${r.doraInd.map((id) => R.tileHTML(id)).join('')}</span></div>` +
      (r.uraInd.length ? `<div><span class="lab">里宝牌指示</span><span class="set">${r.uraInd.map((id) => R.tileHTML(id)).join('')}</span></div>` : '') + '</div>';
    const lines = R.explain(res, r.isDealer, r.tsumo, r.honba);
    const html =
      `<div class="win-head"><span class="win-kind">${r.tsumo ? '自摸' : '荣和'}</span><h2>${who}</h2>${fromTxt}</div>` +
      `<div class="win-hand">${winHandHTML(r)}</div>${doraRow}` +
      `<div class="win-body"><div class="yaku-list">${yaku}</div><div>` +
      `<div class="total"><span class="hf">${res.yakuman ? '' : res.fu + ' 符 ' + res.han + ' 番'}</span><span class="limit">${res.limit}</span></div>` +
      `<div class="total"><span class="pts">${fmt(pay.total + (r.sticks || 0) * 1000)}<small>点</small></span></div>` +
      `<div class="paydesc">${payDesc}</div>` +
      `<details class="explain" open><summary>这手牌的点数是怎么算的</summary><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol></details>` +
      '</div></div>' +
      deltasHTML(g, before, after) +
      '<div class="btn-row"><button class="btn" data-a="tut">点数教程</button><button class="btn primary" data-a="next">继续</button></div>';
    return waitModal(modal(html));
  }

  function showDrawCard(d) {
    const g = UI.game;
    let rows = '';
    for (let s = 0; s < 4; s++) {
      let extra = '';
      if (d.tenpai[s]) {
        const w = MJ.waits(counts(g.hands[s]), g.melds[s].length);
        extra = `<span class="sub">听</span><span class="hand">${w.map((t) => R.tileHTMLByType(t, false)).join('')}</span>`;
      }
      rows += `<div class="tenpai-row"><span><b style="color:var(--gold);font-family:var(--kai)">${WIND[g.seatWind(s)]}</b> ${SEAT[s]}</span>` +
        `<span class="st ${d.tenpai[s] ? 'yes' : 'no'}">${d.tenpai[s] ? '听牌' : '未听'}</span>${extra}</div>`;
    }
    const n = d.tenpai.filter(Boolean).length;
    const note = n === 0 || n === 4 ? '无人支付罚符' : '未听牌者共付 3000 点，由听牌者平分';
    const html = `<div class="win-head"><span class="win-kind" style="color:var(--jade)">流局</span><span class="sub">${note}${d.tenpai[g.dealer] ? ' · 亲家听牌连庄' : ' · 亲家未听，轮庄'}</span></div>` +
      rows + deltasHTML(g, d.before, d.after) +
      '<div class="btn-row"><button class="btn primary" data-a="next">继续</button></div>';
    return waitModal(modal(html));
  }

  function showEndCard(d) {
    const g = UI.game;
    const place = d.ranking.indexOf(0) + 1;
    const title = ['一位！漂亮的胜利', '二位，稳稳连对', '三位，再接再厉', '四位，下次翻盘'][place - 1];
    let rows = '';
    d.ranking.forEach((s, i) => {
      rows += `<div class="rank-row${s === 0 ? ' me' : ''}" style="--i:${i}"><span class="no">${i + 1}</span><span>${SEAT[s]}</span><span class="sc">${fmt(d.scores[s])}</span></div>`;
    });
    const html = `<div class="win-head"><span class="win-kind">终局</span><h2>${title}</h2></div>${rows}` +
      '<div class="btn-row"><button class="btn" data-a="menu">返回主菜单</button><button class="btn primary" data-a="again">再来一局</button></div>';
    const m = modal(html);
    Sound.play(place <= 2 ? 'win' : 'draw-end');
    return new Promise((resolve) => {
      m.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'menu') {
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
  function startGame(length) {
    if (UI.game) UI.game.abort();
    Sound.unlock();
    const human = {
      onTurn: (g, seat, opt) => promptTurn(g, opt),
      onCall: (g, seat, o) => promptCall(g, o),
    };
    const delay = (kind) => sleep(kind === 'turn' ? 300 + Math.random() * 360 : 180);
    const agents = [human];
    for (let i = 1; i < 4; i++) agents.push(new MJ.AI.AIAgent({ delay }));
    const game = new MJ.Game({
      agents, length,
      listener: async (type, d, g) => {
        if (g !== UI.game) return;
        if (handlers[type]) await handlers[type](d);
      },
    });
    UI.game = game;
    UI.pending = null;
    clearActions();
    $('#my-hand').innerHTML = '';
    $('#my-melds').innerHTML = '';
    $('#waits').classList.remove('show');
    game.run().catch((err) => {
      console.error(err);
      modal(`<h2>出错了</h2><p class="sub">${String(err && err.message || err)}</p><div class="btn-row"><button class="btn primary" onclick="location.reload()">重新载入</button></div>`);
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
      '<h1>雀庭</h1><div class="tag">立直麻将 · 四人对局</div>' +
      '<div class="modes">' +
      '<button class="mode" data-len="east"><b>东风战</b><span>一圈四局，约十分钟<br>适合快速来一把</span></button>' +
      '<button class="mode" data-len="south"><b>半庄战</b><span>东南两圈八局<br>标准的完整对局</span></button>' +
      '<button class="mode learn" data-len="tut"><b>点数教程</b><span>符、番、点数表<br>例题与随机练习</span></button>' +
      '</div>' +
      '<div class="foot">25000 点起 · 有赤宝牌 · 食断 · 一发 · 里宝牌 · 双倍荣和<br>全部资源本地生成，可离线游玩</div>' +
      '</div>';
    $('#menu').classList.add('show');
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
      const b = e.target.closest('.mode');
      if (!b) return;
      Sound.unlock();
      Sound.play('click');
      if (b.dataset.len === 'tut') MJ.Tutorial.open();
      else startGame(b.dataset.len);
    });
    $('#btn-tutorial').addEventListener('click', () => {
      Sound.unlock();
      Sound.play('click');
      MJ.Tutorial.open();
    });
    $('#btn-hint').addEventListener('click', hint);
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
      box.innerHTML = '<div class="overlay" style="z-index:110"><div class="card" style="width:min(420px,100%)"><h2>回到主菜单？</h2><p class="sub">当前对局不会保存。</p>' +
        '<div class="btn-row"><button class="btn" data-a="no">继续对局</button><button class="btn primary" data-a="yes">回到主菜单</button></div></div></div>';
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

  MJ.UI = Object.assign(UI, { init, startGame, showMenu, layout });
})();
