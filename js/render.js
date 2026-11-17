/* 牌面绘制（全部用 SVG 程序生成，无外部图片）与通用渲染辅助。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const { typeOf, isRed } = MJ;

  const C = { ink: '#233142', red: '#c63d2f', green: '#1e8a5c', blue: '#27599c', gold: '#d99a2b' };
  const KAI = "'Kaiti SC','STKaiti','KaiTi','BiauKai','DFKai-SB','Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC',serif";
  const NUM = ['一', '二', '三', '四', '伍', '六', '七', '八', '九'];

  const txt = (ch, y, size, fill) =>
    `<text x="30" y="${y}" font-size="${size}" text-anchor="middle" font-family="${KAI}" font-weight="700" fill="${fill}">${ch}</text>`;

  function man(n, red) {
    return txt(NUM[n], 33, 31, red ? C.red : C.ink) + txt('萬', 71, 35, C.red);
  }

  function dot(x, y, r, col) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.6).toFixed(2)}" fill="none" stroke="#fffdf5" stroke-width="${(r * 0.17).toFixed(2)}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.24).toFixed(2)}" fill="#fffdf5"/>`;
  }

  function pin(n, red) {
    const B = red ? C.red : C.blue, G = red ? C.red : C.green, R = C.red;
    switch (n) {
      case 0: {
        let s = `<circle cx="30" cy="40" r="21.5" fill="${C.blue}"/><circle cx="30" cy="40" r="17.2" fill="#fffdf5"/>` +
          `<circle cx="30" cy="40" r="14" fill="${C.red}"/><circle cx="30" cy="40" r="9.6" fill="#fffdf5"/><circle cx="30" cy="40" r="6.2" fill="${C.green}"/><circle cx="30" cy="40" r="2.2" fill="#fffdf5"/>`;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          s += `<circle cx="${(30 + Math.cos(a) * 19.3).toFixed(2)}" cy="${(40 + Math.sin(a) * 19.3).toFixed(2)}" r="1.25" fill="#fffdf5"/>`;
        }
        return s;
      }
      case 1: return dot(30, 22, 11.5, B) + dot(30, 58, 11.5, G);
      case 2: return dot(15.5, 18, 9.3, B) + dot(30, 40, 9.3, R) + dot(44.5, 62, 9.3, G);
      case 3: return dot(18, 22, 10, B) + dot(42, 22, 10, G) + dot(18, 58, 10, G) + dot(42, 58, 10, B);
      case 4: return dot(16, 19, 8.8, B) + dot(44, 19, 8.8, G) + dot(30, 40, 8.8, R) + dot(16, 61, 8.8, G) + dot(44, 61, 8.8, B);
      case 5: return dot(18, 17, 8.6, G) + dot(42, 17, 8.6, G) + dot(18, 44, 8.6, R) + dot(42, 44, 8.6, R) + dot(18, 64, 8.6, R) + dot(42, 64, 8.6, R);
      case 6: return dot(14, 13.5, 6.8, G) + dot(30, 21, 6.8, G) + dot(46, 28.5, 6.8, G) + dot(19, 48, 7.6, R) + dot(41, 48, 7.6, R) + dot(19, 66, 7.6, R) + dot(41, 66, 7.6, R);
      case 7: {
        let s = '';
        for (const y of [13, 31, 49, 67]) s += dot(19, y, 7.6, B) + dot(41, y, 7.6, B);
        return s;
      }
      default: {
        let s = '';
        [[16, B], [40, R], [64, G]].forEach(([y, col]) => {
          for (const x of [13.5, 30, 46.5]) s += dot(x, y, 7.3, col);
        });
        return s;
      }
    }
  }

  function stick(x, y, h, col, rot) {
    const hh = h / 2;
    const dark = col === C.red ? '#9c2a20' : col === C.blue ? '#1b4177' : '#15694a';
    return `<g transform="translate(${x} ${y})${rot ? ` rotate(${rot})` : ''}">` +
      `<rect x="-3.4" y="${-hh}" width="6.8" height="${h}" rx="3.4" fill="${col}"/>` +
      `<rect x="-4.3" y="${-hh + 0.4}" width="8.6" height="2.6" rx="1.3" fill="${dark}"/>` +
      `<rect x="-4.3" y="-1.3" width="8.6" height="2.6" rx="1.3" fill="${dark}"/>` +
      `<rect x="-4.3" y="${hh - 3}" width="8.6" height="2.6" rx="1.3" fill="${dark}"/>` +
      `<rect x="-0.8" y="${-hh + 4.2}" width="1.6" height="${hh - 6.6}" rx=".8" fill="#fffdf5" opacity=".55"/>` +
      `<rect x="-0.8" y="2.4" width="1.6" height="${hh - 6.6}" rx=".8" fill="#fffdf5" opacity=".55"/></g>`;
  }

  function bird() {
    return `<path d="M30 45C17 51 12 63 15 74C24 69 30 59 30 45Z" fill="${C.green}"/>` +
      `<path d="M30 45C43 51 48 63 45 74C36 69 30 59 30 45Z" fill="${C.green}"/>` +
      `<path d="M30 43C24.5 55 25.5 67 30 76C34.5 67 35.5 55 30 43Z" fill="${C.red}"/>` +
      `<circle cx="18.5" cy="66" r="2" fill="#fffdf5" opacity=".8"/><circle cx="41.5" cy="66" r="2" fill="#fffdf5" opacity=".8"/><circle cx="30" cy="67" r="2" fill="#fffdf5" opacity=".8"/>` +
      `<ellipse cx="30" cy="35" rx="10.5" ry="13.5" fill="${C.green}"/>` +
      `<path d="M21 31C14 33 11 40 13 47C19 44 23 39 24 33Z" fill="${C.blue}"/><path d="M39 31C46 33 49 40 47 47C41 44 37 39 36 33Z" fill="${C.blue}"/>` +
      `<ellipse cx="30" cy="38" rx="4.6" ry="7.5" fill="#fffdf5" opacity=".4"/>` +
      `<circle cx="30" cy="17.5" r="7" fill="${C.blue}"/>` +
      `<path d="M36.2 15.4L44 18L36.2 20.6Z" fill="${C.gold}"/>` +
      `<circle cx="32.2" cy="16.4" r="1.5" fill="#fffdf5"/><circle cx="32.5" cy="16.4" r=".7" fill="#1a1a1a"/>` +
      `<path d="M26.5 11.5C24 5.5 27.5 3.5 29.6 8.8C30.4 3.2 35 4.6 32.6 11Z" fill="${C.red}"/>`;
  }

  function sou(n, red) {
    const G = red ? C.red : C.green, R = C.red;
    let s = '';
    switch (n) {
      case 0: return bird();
      case 1: return stick(30, 22, 27, G) + stick(30, 58, 27, G);
      case 2: return stick(30, 22, 27, G) + stick(18, 58, 27, G) + stick(42, 58, 27, G);
      case 3: return stick(19, 22, 27, G) + stick(41, 22, 27, G) + stick(19, 58, 27, G) + stick(41, 58, 27, G);
      case 4: return stick(15, 22, 26, G) + stick(45, 22, 26, G) + stick(30, 40, 26, R) + stick(15, 58, 26, G) + stick(45, 58, 26, G);
      case 5:
        for (const x of [14, 30, 46]) s += stick(x, 22, 27, G) + stick(x, 58, 27, G);
        return s;
      case 6:
        s = stick(30, 15.5, 20, R);
        for (const x of [14, 30, 46]) s += stick(x, 40.5, 20, G) + stick(x, 64.5, 20, G);
        return s;
      case 7:
        return stick(11, 22, 26, G) + stick(49, 22, 26, G) + stick(23.6, 22, 26, G, 27) + stick(36.4, 22, 26, G, -27) +
          stick(11, 58, 26, G) + stick(49, 58, 26, G) + stick(23.6, 58, 26, G, -27) + stick(36.4, 58, 26, G, 27);
      default:
        for (const y of [15.5, 40, 64.5]) s += stick(14, y, 20, G) + stick(30, y, 20, R) + stick(46, y, 20, G);
        return s;
    }
  }

  function honor(n) {
    if (n === 4) {
      return `<rect x="10.5" y="10.5" width="39" height="59" rx="5" fill="none" stroke="${C.blue}" stroke-width="3.2"/>` +
        `<rect x="16" y="16" width="28" height="48" rx="2.5" fill="none" stroke="${C.blue}" stroke-width="1.2" opacity=".6"/>`;
    }
    const ch = ['東', '南', '西', '北', '', '發', '中'][n];
    const col = n === 5 ? C.green : n === 6 ? C.red : C.ink;
    return txt(ch, 58, 50, col);
  }

  function face(key) {
    if (typeof key === 'string') {
      const s = +key[1];
      return s === 0 ? man(4, true) : s === 1 ? pin(4, true) : sou(4, true);
    }
    if (key < 9) return man(key, false);
    if (key < 18) return pin(key - 9, false);
    if (key < 27) return sou(key - 18, false);
    return honor(key - 27);
  }

  function installSprites() {
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (let t = 0; t < 34; t++) s += `<symbol id="tf-${t}" viewBox="0 0 60 80">${face(t)}</symbol>`;
    for (let k = 0; k < 3; k++) s += `<symbol id="tf-r${k}" viewBox="0 0 60 80">${face('r' + k)}</symbol>`;
    s += '</defs></svg>';
    const div = document.createElement('div');
    div.innerHTML = s;
    document.body.insertBefore(div.firstChild, document.body.firstChild);
  }

  const faceKey = (id) => (isRed(id) ? 'r' + ((typeOf(id) / 9) | 0) : typeOf(id));
  const faceSvg = (key) => `<svg viewBox="0 0 60 80"><use href="#tf-${key}"/></svg>`;

  /** 按 id 生成牌元素 */
  function tile(id, cls) {
    const d = document.createElement('div');
    d.className = 'tile' + (cls ? ' ' + cls : '');
    d.dataset.id = id;
    d.dataset.t = typeOf(id);
    d.innerHTML = faceSvg(faceKey(id));
    return d;
  }

  function back(cls) {
    const d = document.createElement('div');
    d.className = 'tile back' + (cls ? ' ' + cls : '');
    return d;
  }

  const tileHTMLByType = (t, red, cls) =>
    `<div class="tile${cls ? ' ' + cls : ''}" data-t="${t}">${faceSvg(red ? 'r' + ((t / 9) | 0) : t)}</div>`;
  const tileHTML = (id, cls) => tileHTMLByType(typeOf(id), isRed(id), cls);
  const backHTML = (cls) => `<div class="tile back${cls ? ' ' + cls : ''}"></div>`;

  /** "123m 456p" 记法 → 一排牌的 HTML；空格处留间隔，"#" 表示牌背 */
  function notationHTML(str, cls) {
    const groups = str.trim().split(/\s+/);
    return `<span class="tiles${cls ? ' ' + cls : ''}">` + groups.map((g) => {
      let out = '';
      let buf = '';
      for (const ch of g) {
        if (ch === '#') out += backHTML();
        else {
          buf += ch;
          if ('mpsz'.includes(ch)) {
            out += MJ.parseTypes(buf).map((x) => tileHTMLByType(x.t, x.red)).join('');
            buf = '';
          }
        }
      }
      return `<span class="tgroup">${out}</span>`;
    }).join('') + '</span>';
  }

  /** 副露的 HTML（seat 为副露者，决定横置牌位置） */
  function meldHTML(m, seat) {
    const side = (id) => tileHTML(id, 'side');
    if (m.type === 'ankan') {
      return `<div class="meld">${backHTML()}${tileHTML(m.tiles[0])}${tileHTML(m.tiles[1])}${backHTML()}</div>`;
    }
    const rel = (m.from - seat + 4) % 4; // 3 上家 2 对家 1 下家
    const own = m.tiles.filter((id) => id !== m.called && id !== m.added);
    const calledHTML = m.type === 'kakan'
      ? `<div class="stack">${side(m.called)}${side(m.added)}</div>`
      : side(m.called);
    const parts = own.map((id) => tileHTML(id));
    const pos = m.type === 'chi' || rel === 3 ? 0 : rel === 2 ? 1 : parts.length;
    parts.splice(pos, 0, calledHTML);
    return `<div class="meld">${parts.join('')}</div>`;
  }

  // ---------------------------------------------------------------- 点数讲解
  const fmt = (n) => n.toLocaleString('en-US');

  /** 生成一手和牌的逐步点数讲解（HTML 行数组） */
  function explain(res, isDealer, tsumo, honba) {
    const lines = [];
    const pay = MJ.calcPayments(res.base, isDealer, tsumo, 0);
    if (res.yakuman) {
      lines.push(`<b>役满</b>${res.yakuman > 1 ? ' × ' + res.yakuman : ''}：不计符与番，基本点 = 8000${res.yakuman > 1 ? ' × ' + res.yakuman + ' = ' + fmt(res.base) : ''}`);
    } else {
      const parts = res.fuDetail.filter((d) => !d.round).map((d) => `${d.label} <b>${d.fu}</b>`);
      const raw = res.fuDetail.filter((d) => !d.round).reduce((s, d) => s + d.fu, 0);
      let fuLine = `<b>符</b>：${parts.join(' + ')}`;
      if (res.form === 'chiitoi') fuLine = '<b>符</b>：七对子固定 <b>25</b> 符（不进位）';
      else if (raw !== res.fu) fuLine += ` = ${raw} → 进位为 <b>${res.fu}</b> 符`;
      else fuLine += ` = <b>${res.fu}</b> 符`;
      lines.push(fuLine);
      lines.push(`<b>番</b>：${res.yaku.map((y) => `${y.name} ${y.han}`).join(' + ')} = <b>${res.han}</b> 番`);
      const rawBase = res.fu * Math.pow(2, res.han + 2);
      if (res.han >= 5) lines.push(`<b>基本点</b>：${res.han} 番 → <b>${res.limit}</b>，基本点 ${fmt(res.base)}（5 番以上不再看符）`);
      else if (rawBase >= 2000) lines.push(`<b>基本点</b>：${res.fu} × 2<sup>${res.han}+2</sup> = ${fmt(rawBase)} ≥ 2000 → <b>满贯</b>，基本点封顶 2000`);
      else lines.push(`<b>基本点</b>：${res.fu} × 2<sup>${res.han}+2</sup> = ${res.fu} × ${Math.pow(2, res.han + 2)} = <b>${fmt(rawBase)}</b>`);
    }
    const b = res.base;
    const up = (x) => (x % 100 === 0 ? fmt(x) : `${fmt(x)} → 进位 ${fmt(MJ.ceil100(x))}`);
    if (!tsumo) {
      const k = isDealer ? 6 : 4;
      lines.push(`<b>支付</b>：${isDealer ? '亲家' : '子家'}荣和 = 基本点 × ${k} = ${up(b * k)}，由放铳者支付 <b>${fmt(pay.total)}</b>`);
    } else if (isDealer) {
      lines.push(`<b>支付</b>：亲家自摸，三家各付 基本点 × 2 = ${up(b * 2)}，合计 <b>${fmt(pay.total)}</b>`);
    } else {
      lines.push(`<b>支付</b>：子家自摸，亲家付 基本点 × 2 = ${up(b * 2)}，另两家各付 基本点 × 1 = ${up(b)}，合计 <b>${fmt(pay.total)}</b>`);
    }
    if (honba) lines.push(`<b>本场</b>：${honba} 本场，${tsumo ? `每家再加 ${honba * 100}` : `再加 ${honba * 300}`}`);
    return lines;
  }

  MJ.R = { installSprites, tile, back, tileHTML, tileHTMLByType, backHTML, notationHTML, meldHTML, explain, fmt, faceKey, faceSvg };
})();
