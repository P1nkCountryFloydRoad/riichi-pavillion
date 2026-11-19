/* 规则核心：牌的表示、向听数、和牌拆解、役种、符数与点数计算。
 * 纯逻辑，无 DOM 依赖，浏览器与 Node 均可使用。 */
(function (root) {
  'use strict';
  const MJ = (root.MJ = root.MJ || {});

  // ---------------------------------------------------------------- 牌
  // 牌 id 0..135，type = id >> 2：0-8 万、9-17 筒、18-26 索、27-30 东南西北、31-33 白发中
  // 赤宝牌：三枚时为 5万 id16、5筒 id52、5索 id88；四枚时再加 5筒 id53
  const typeOf = (id) => id >> 2;
  const AKA_SETS = { 0: [], 3: [16, 52, 88], 4: [16, 52, 53, 88] };
  let RED = new Set(AKA_SETS[3]);
  const isRed = (id) => RED.has(id);
  /** 设置本局使用的赤宝牌枚数（0 / 3 / 4），影响显示与计分 */
  function setAka(n) {
    RED = new Set(AKA_SETS[n] || AKA_SETS[3]);
  }
  const suitOf = (t) => (t < 27 ? (t / 9) | 0 : 3);
  const numOf = (t) => (t < 27 ? (t % 9) + 1 : t - 26);
  const isHonor = (t) => t >= 27;
  const isYaochu = (t) => t >= 27 || t % 9 === 0 || t % 9 === 8;
  const GREEN = new Set([19, 20, 21, 23, 25, 32]);
  const WIND_NAMES = ['东', '南', '西', '北'];
  const NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const HONOR_CN = ['东', '南', '西', '北', '白', '发', '中'];

  function typeName(t) {
    if (t >= 27) return HONOR_CN[t - 27];
    return NUM_CN[t % 9] + ['万', '筒', '索'][suitOf(t)];
  }

  function counts(ids) {
    const c = new Array(34).fill(0);
    for (let i = 0; i < ids.length; i++) c[ids[i] >> 2]++;
    return c;
  }

  const sortIds = (ids) => ids.slice().sort((a, b) => a - b);

  /** 解析 "123m0p55z" 记法为 [{t, red}]，0 表示赤五；z：1-4 东南西北，5 白 6 发 7 中 */
  function parseTypes(str) {
    const out = [];
    let buf = [];
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') buf.push(+ch);
      else if ('mpsz'.includes(ch)) {
        const s = 'mpsz'.indexOf(ch);
        for (const n of buf) {
          if (s === 3) out.push({ t: 26 + n, red: false });
          else if (n === 0) out.push({ t: s * 9 + 4, red: true });
          else out.push({ t: s * 9 + n - 1, red: false });
        }
        buf = [];
      }
    }
    return out;
  }

  /** 把记法转成具体牌 id；used 为跨多次调用共享的计数器，避免同一张牌被重复分配 */
  function parseIds(str, used) {
    used = used || {};
    return parseTypes(str).map(({ t, red }) => {
      const five = t < 27 && t % 9 === 4;
      if (red) return t * 4;
      const k = used[t] || 0;
      used[t] = k + 1;
      return t * 4 + (five ? 3 - (k % 3) : k % 4);
    });
  }

  /**
   * 牌 id → 记法字符串，如 "1112345678999m"、"340m55p"（赤五记为 0，字牌 1-7z = 东南西北白发中）。
   * 与 parseTypes 互逆。
   */
  function toNotation(ids) {
    const bySuit = [[], [], [], []];
    const sorted = ids.slice().sort((a, b) => typeOf(a) - typeOf(b) || (isRed(a) ? 1 : 0) - (isRed(b) ? 1 : 0) || a - b);
    for (const id of sorted) {
      const t = typeOf(id);
      const s = t >= 27 ? 3 : (t / 9) | 0;
      bySuit[s].push(s === 3 ? t - 26 : isRed(id) ? 0 : (t % 9) + 1);
    }
    return bySuit.map((d, s) => (d.length ? d.join('') + 'mpsz'[s] : '')).join('');
  }

  /** 宝牌指示牌 → 宝牌 */
  function doraFromIndicator(t) {
    if (t < 27) return ((t / 9) | 0) * 9 + ((t % 9) + 1) % 9;
    if (t < 31) return 27 + ((t - 27 + 1) % 4);
    return 31 + ((t - 31 + 1) % 3);
  }

  // ---------------------------------------------------------------- 向听数
  const suitCache = new Map();
  const honorCache = new Map();

  // 对单一花色（或字牌）求表：res[p*5+m] = 取 p 个雀头、m 个面子时最多的搭子数（不可行为 -1）
  function groupTable(c, off, len, seqOK) {
    let key = 0;
    for (let i = len - 1; i >= 0; i--) key = key * 5 + c[off + i];
    const cache = seqOK ? suitCache : honorCache;
    let res = cache.get(key);
    if (res) return res;
    res = new Int8Array(10).fill(-1);
    const a = c.slice(off, off + len);
    const rec = (i, m, t, p) => {
      while (i < len && a[i] === 0) i++;
      if (i >= len) {
        if (m <= 4) {
          const idx = p * 5 + m;
          if (t > res[idx]) res[idx] = t;
        }
        return;
      }
      if (a[i] >= 3) {
        a[i] -= 3; rec(i, m + 1, t, p); a[i] += 3;
      }
      if (seqOK && i + 2 < len && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--;
        rec(i, m + 1, t, p);
        a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (a[i] >= 2) {
        a[i] -= 2;
        if (!p) rec(i, m, t, 1);
        rec(i, m, t + 1, p);
        a[i] += 2;
      }
      if (seqOK) {
        if (i + 1 < len && a[i + 1]) {
          a[i]--; a[i + 1]--; rec(i, m, t + 1, p); a[i]++; a[i + 1]++;
        }
        if (i + 2 < len && a[i + 2]) {
          a[i]--; a[i + 2]--; rec(i, m, t + 1, p); a[i]++; a[i + 2]++;
        }
      }
      const sv = a[i];
      a[i] = 0; rec(i + 1, m, t, p); a[i] = sv;
    };
    rec(0, 0, 0, 0);
    cache.set(key, res);
    return res;
  }

  function shantenRegular(c, nM) {
    let dp = new Int8Array(10).fill(-1);
    dp[0] = 0;
    for (let g = 0; g < 4; g++) {
      const tb = g < 3 ? groupTable(c, g * 9, 9, true) : groupTable(c, 27, 7, false);
      const nd = new Int8Array(10).fill(-1);
      for (let p1 = 0; p1 < 2; p1++) {
        for (let m1 = 0; m1 < 5; m1++) {
          const base = dp[p1 * 5 + m1];
          if (base < 0) continue;
          for (let p2 = 0; p2 + p1 < 2; p2++) {
            for (let m2 = 0; m2 + m1 < 5; m2++) {
              const v = tb[p2 * 5 + m2];
              if (v < 0) continue;
              const idx = (p1 + p2) * 5 + m1 + m2;
              if (base + v > nd[idx]) nd[idx] = base + v;
            }
          }
        }
      }
      dp = nd;
    }
    let best = 8;
    for (let p = 0; p < 2; p++) {
      for (let m = 0; m < 5; m++) {
        const t = dp[p * 5 + m];
        if (t < 0) continue;
        const M = m + nM;
        if (M > 4) continue;
        const s = 8 - 2 * M - Math.min(t, 4 - M) - p;
        if (s < best) best = s;
      }
    }
    return best;
  }

  function shantenChiitoi(c) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  const YAOCHU_LIST = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function shantenKokushi(c) {
    let kinds = 0, pair = 0;
    for (const t of YAOCHU_LIST) {
      if (c[t] >= 1) kinds++;
      if (c[t] >= 2) pair = 1;
    }
    return 13 - kinds - pair;
  }

  /** 向听数：-1 和牌，0 听牌。c 为 34 种牌的张数，nM 为已副露（含暗杠）的面子数 */
  function shanten(c, nM) {
    const r = shantenRegular(c, nM || 0);
    if (nM) return r;
    return Math.min(r, shantenChiitoi(c), shantenKokushi(c));
  }

  /** 听牌时的待牌种类（c 为 13 张形） */
  function waits(c, nM) {
    const out = [];
    for (let x = 0; x < 34; x++) {
      if (c[x] >= 4) continue;
      c[x]++;
      if (shanten(c, nM) === -1) out.push(x);
      c[x]--;
    }
    return out;
  }

  // ---------------------------------------------------------------- 和牌拆解
  function decompose(c) {
    const out = [];
    const sets = [];
    let pair = -1;
    const rec = (i) => {
      while (i < 34 && c[i] === 0) i++;
      if (i === 34) {
        out.push({ pair, sets: sets.map((s) => ({ k: s.k, t: s.t })) });
        return;
      }
      if (c[i] >= 3) {
        c[i] -= 3; sets.push({ k: 'tri', t: i }); rec(i); sets.pop(); c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        sets.push({ k: 'seq', t: i });
        rec(i);
        sets.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    };
    for (let h = 0; h < 34; h++) {
      if (c[h] >= 2) {
        c[h] -= 2; pair = h; rec(0); c[h] += 2;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- 点数
  const ceil100 = (x) => Math.ceil(x / 100) * 100;

  function basePoints(han, fu, yakuman, kazoe) {
    if (yakuman) return 8000 * yakuman;
    if (han >= 13) return kazoe === false ? 6000 : 8000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    if (han >= 5) return 2000;
    return Math.min(2000, fu * Math.pow(2, han + 2));
  }

  function limitName(han, fu, yakuman, kazoe) {
    if (yakuman) return ['役满', '双倍役满', '三倍役满', '四倍役满', '五倍役满', '六倍役满'][Math.min(yakuman, 6) - 1];
    if (han >= 13) return kazoe === false ? '三倍满' : '累计役满';
    if (han >= 11) return '三倍满';
    if (han >= 8) return '倍满';
    if (han >= 6) return '跳满';
    if (han >= 5 || fu * Math.pow(2, han + 2) >= 2000) return '满贯';
    return '';
  }

  /** 支付：荣和 {total}；自摸 亲家 {all,total}，子家 {dealer,other,total}。honba 为本场数 */
  function calcPayments(base, isDealer, tsumo, honba) {
    honba = honba || 0;
    if (tsumo) {
      if (isDealer) {
        const all = ceil100(base * 2) + 100 * honba;
        return { all, total: all * 3 };
      }
      const dealer = ceil100(base * 2) + 100 * honba;
      const other = ceil100(base) + 100 * honba;
      return { dealer, other, total: dealer + other * 2 };
    }
    return { total: ceil100(base * (isDealer ? 6 : 4)) + 300 * honba };
  }

  // ---------------------------------------------------------------- 役判定
  const WAIT_CN = { ryanmen: '两面', kanchan: '嵌张', penchan: '边张', tanki: '单骑', shanpon: '双碰' };

  /**
   * 计算和牌。ctx:
   *  hand: 手牌 id（含和了牌），melds: [{type:'chi'|'pon'|'minkan'|'kakan'|'ankan', tiles:[id]}]
   *  winTile, tsumo, riichi(0/1/2), ippatsu, rinshan, chankan, haitei, houtei, tenhou, chiihou
   *  seatWind, roundWind (0..3), doraInd: [id], uraInd: [id]
   *  可选规则：kuitan（食断，默认 true）、kazoe（累计役满，默认 true）、multiYakuman（役满复合，默认 true）
   * 无役返回 null。
   */
  function evaluateWin(ctx) {
    const hand = ctx.hand;
    const melds = ctx.melds || [];
    const wt = typeOf(ctx.winTile);
    const tsumo = !!ctx.tsumo;
    const c = counts(hand);
    const menzen = melds.every((m) => m.type === 'ankan');
    const allIds = hand.slice();
    for (const m of melds) for (const id of m.tiles) allIds.push(id);
    const allTypes = allIds.map(typeOf);
    const seatT = 27 + ctx.seatWind;
    const roundT = 27 + ctx.roundWind;
    const meldSets = melds.map((m) => ({
      k: m.type === 'chi' ? 'seq' : m.type === 'pon' ? 'tri' : 'kan',
      t: Math.min.apply(null, m.tiles.map(typeOf)),
      open: m.type !== 'ankan',
    }));

    // 与牌型无关的役
    const situational = [];
    if (ctx.riichi === 2) situational.push({ name: '两立直', han: 2 });
    else if (ctx.riichi === 1) situational.push({ name: '立直', han: 1 });
    if (ctx.riichi && ctx.ippatsu) situational.push({ name: '一发', han: 1 });
    if (menzen && tsumo) situational.push({ name: '门前清自摸和', han: 1 });
    if (ctx.rinshan) situational.push({ name: '岭上开花', han: 1 });
    if (ctx.chankan) situational.push({ name: '抢杠', han: 1 });
    if (ctx.haitei) situational.push({ name: '海底摸月', han: 1 });
    if (ctx.houtei) situational.push({ name: '河底捞鱼', han: 1 });
    const sitYakuman = [];
    if (ctx.tenhou) sitYakuman.push('天和');
    if (ctx.chiihou) sitYakuman.push('地和');

    // 一色判定
    const suitsPresent = new Set();
    let hasHonorTile = false;
    for (const t of allTypes) {
      if (t >= 27) hasHonorTile = true;
      else suitsPresent.add(suitOf(t));
    }
    const oneSuit = suitsPresent.size === 1;
    const allYaochu = allTypes.every(isYaochu);
    const allHonor = allTypes.every(isHonor);
    const noYaochu = !allTypes.some(isYaochu);

    // 宝牌
    const doraTypes = (ctx.doraInd || []).map((id) => doraFromIndicator(typeOf(id)));
    const uraTypes = ctx.riichi ? (ctx.uraInd || []).map((id) => doraFromIndicator(typeOf(id))) : [];
    let nDora = 0, nUra = 0, nAka = 0;
    for (const id of allIds) {
      const t = typeOf(id);
      for (const d of doraTypes) if (d === t) nDora++;
      for (const d of uraTypes) if (d === t) nUra++;
      if (isRed(id)) nAka++;
    }

    const finish = (yaku, yakumanNames, fu, fuDetail, form, wait) => {
      const out = { form, wait: wait || null, fuDetail: fuDetail || [], tsumo, menzen };
      yakumanNames = yakumanNames.concat(sitYakuman);
      if (ctx.multiYakuman === false) yakumanNames = yakumanNames.slice(0, 1);
      if (yakumanNames.length) {
        out.yaku = yakumanNames.map((n) => ({ name: n, han: 13, yakuman: true }));
        out.yakuman = yakumanNames.length;
        out.han = 13 * out.yakuman;
        out.fu = fu;
        out.dora = { dora: 0, ura: 0, aka: 0 };
      } else {
        yaku = yaku.concat(situational);
        if (!yaku.length) return null;
        out.yakuman = 0;
        out.dora = { dora: nDora, ura: nUra, aka: nAka };
        if (nDora) yaku.push({ name: '宝牌', han: nDora, dora: true });
        if (nAka) yaku.push({ name: '赤宝牌', han: nAka, dora: true });
        if (nUra) yaku.push({ name: '里宝牌', han: nUra, dora: true });
        out.yaku = yaku;
        out.han = yaku.reduce((s, y) => s + y.han, 0);
        out.fu = fu;
      }
      out.base = basePoints(out.han, out.fu, out.yakuman, ctx.kazoe);
      out.limit = limitName(out.han, out.fu, out.yakuman, ctx.kazoe);
      return out;
    };

    const cands = [];

    // 国士无双
    if (!melds.length && shantenKokushi(c) === -1) {
      cands.push(finish([], ['国士无双'], 30, [], 'kokushi'));
    }

    // 七对子
    if (!melds.length) {
      let pairs = 0;
      for (let i = 0; i < 34; i++) if (c[i] === 2) pairs++;
      if (pairs === 7) {
        const ym = [];
        const yaku = [{ name: '七对子', han: 2 }];
        if (allHonor) ym.push('字一色');
        if (noYaochu) yaku.push({ name: '断幺九', han: 1 });
        if (allYaochu) yaku.push({ name: '混老头', han: 2 });
        if (oneSuit) yaku.push(hasHonorTile ? { name: '混一色', han: 3 } : { name: '清一色', han: 6 });
        cands.push(finish(yaku, ym, 25, [{ label: '七对子固定', fu: 25 }], 'chiitoi', 'tanki'));
      }
    }

    // 一般形
    const decomps = decompose(c);
    for (const d of decomps) {
      const opts = [];
      const seen = new Set();
      const add = (kind, idx) => {
        if (seen.has(kind)) return;
        seen.add(kind);
        opts.push({ kind, idx });
      };
      if (d.pair === wt) add('tanki', -1);
      d.sets.forEach((s, idx) => {
        if (s.k === 'tri') {
          if (s.t === wt) add('shanpon', idx);
        } else {
          if (wt === s.t) add(s.t % 9 === 6 ? 'penchan' : 'ryanmen', idx);
          else if (wt === s.t + 1) add('kanchan', idx);
          else if (wt === s.t + 2) add(s.t % 9 === 0 ? 'penchan' : 'ryanmen', idx);
        }
      });

      for (const w of opts) {
        const closed = d.sets.map((s, i) => ({
          k: s.k, t: s.t, open: w.kind === 'shanpon' && i === w.idx && !tsumo, closedSet: true,
        }));
        const all = closed.concat(meldSets);
        const seqs = all.filter((s) => s.k === 'seq');
        const tris = all.filter((s) => s.k !== 'seq');
        const kans = all.filter((s) => s.k === 'kan');
        const hasTri = (t) => tris.some((s) => s.t === t);
        const hasSeq = (t) => seqs.some((s) => s.t === t);
        const concealedTris = tris.filter((s) => !s.open).length;
        const pair = d.pair;
        const pairValue = (pair >= 31 ? 2 : 0) + (pair === seatT ? 2 : 0) + (pair === roundT ? 2 : 0);

        // ---- 役满
        const ym = [];
        if (hasTri(31) && hasTri(32) && hasTri(33)) ym.push('大三元');
        if (concealedTris === 4) ym.push('四暗刻');
        if (allHonor) ym.push('字一色');
        if (allYaochu && !hasHonorTile) ym.push('清老头');
        if (allTypes.every((t) => GREEN.has(t))) ym.push('绿一色');
        const windTris = [27, 28, 29, 30].filter(hasTri).length;
        if (windTris === 4) ym.push('大四喜');
        else if (windTris === 3 && pair >= 27 && pair <= 30) ym.push('小四喜');
        if (kans.length === 4) ym.push('四杠子');
        if (!melds.length && oneSuit && !hasHonorTile) {
          const s = [...suitsPresent][0] * 9;
          let ok = c[s] >= 3 && c[s + 8] >= 3;
          for (let i = 1; i < 8; i++) if (c[s + i] < 1) ok = false;
          if (ok) ym.push('九莲宝灯');
        }

        // ---- 符
        const fuDetail = [];
        const isPinfu = menzen && seqs.length === 4 && pairValue === 0 && w.kind === 'ryanmen';
        let fu;
        if (isPinfu) {
          if (tsumo) {
            fu = 20;
            fuDetail.push({ label: '底符', fu: 20 }, { label: '平和自摸（不计自摸符）', fu: 0 });
          } else {
            fu = 30;
            fuDetail.push({ label: '底符', fu: 20 }, { label: '门前清荣和', fu: 10 });
          }
        } else {
          let raw = 20;
          fuDetail.push({ label: '底符', fu: 20 });
          if (menzen && !tsumo) {
            raw += 10;
            fuDetail.push({ label: '门前清荣和', fu: 10 });
          }
          if (tsumo) {
            raw += 2;
            fuDetail.push({ label: '自摸', fu: 2 });
          }
          for (const s of all) {
            if (s.k === 'seq') continue;
            let v = 2;
            const yao = isYaochu(s.t);
            if (yao) v *= 2;
            if (!s.open) v *= 2;
            if (s.k === 'kan') v *= 4;
            raw += v;
            const nm = (yao ? '幺九' : '中张') + (s.open ? '明' : '暗') + (s.k === 'kan' ? '杠' : '刻');
            fuDetail.push({ label: nm, fu: v, tiles: new Array(s.k === 'kan' ? 4 : 3).fill(s.t) });
          }
          if (pairValue) {
            raw += pairValue;
            fuDetail.push({ label: pairValue === 4 ? '连风牌雀头' : '役牌雀头', fu: pairValue, tiles: [pair, pair] });
          }
          if (w.kind === 'kanchan' || w.kind === 'penchan' || w.kind === 'tanki') {
            raw += 2;
            fuDetail.push({ label: WAIT_CN[w.kind] + '听牌', fu: 2 });
          }
          if (raw === 20) {
            raw = 30;
            fuDetail.push({ label: '副露平和形（按30符计）', fu: 10 });
          }
          fu = Math.ceil(raw / 10) * 10;
          if (fu !== raw) fuDetail.push({ label: '进位到十位', fu: fu - raw, round: true });
        }

        if (ym.length) {
          cands.push(finish([], ym, fu, fuDetail, 'standard', w.kind));
          continue;
        }

        // ---- 一般役
        const yaku = [];
        if (isPinfu) yaku.push({ name: '平和', han: 1 });
        if (noYaochu && (menzen || ctx.kuitan !== false)) yaku.push({ name: '断幺九', han: 1 });
        if (menzen) {
          const cnt = {};
          for (const s of closed) if (s.k === 'seq') cnt[s.t] = (cnt[s.t] || 0) + 1;
          let pp = 0;
          for (const k in cnt) pp += cnt[k] >> 1;
          if (pp >= 2) yaku.push({ name: '二杯口', han: 3 });
          else if (pp === 1) yaku.push({ name: '一杯口', han: 1 });
        }
        if (hasTri(31)) yaku.push({ name: '役牌 白', han: 1 });
        if (hasTri(32)) yaku.push({ name: '役牌 发', han: 1 });
        if (hasTri(33)) yaku.push({ name: '役牌 中', han: 1 });
        if (hasTri(roundT)) yaku.push({ name: '场风 ' + WIND_NAMES[ctx.roundWind], han: 1 });
        if (hasTri(seatT)) yaku.push({ name: '自风 ' + WIND_NAMES[ctx.seatWind], han: 1 });
        for (let n = 0; n < 7; n++) {
          if (hasSeq(n) && hasSeq(9 + n) && hasSeq(18 + n)) {
            yaku.push({ name: '三色同顺', han: menzen ? 2 : 1 });
            break;
          }
        }
        for (let s = 0; s < 27; s += 9) {
          if (hasSeq(s) && hasSeq(s + 3) && hasSeq(s + 6)) {
            yaku.push({ name: '一气通贯', han: menzen ? 2 : 1 });
            break;
          }
        }
        if (allYaochu) {
          yaku.push({ name: '混老头', han: 2 });
        } else if (seqs.length > 0) {
          const everyYao = isYaochu(pair) && all.every((s) => (s.k === 'seq' ? s.t % 9 === 0 || s.t % 9 === 6 : isYaochu(s.t)));
          if (everyYao) {
            if (hasHonorTile) yaku.push({ name: '混全带幺九', han: menzen ? 2 : 1 });
            else yaku.push({ name: '纯全带幺九', han: menzen ? 3 : 2 });
          }
        }
        if (tris.length === 4) yaku.push({ name: '对对和', han: 2 });
        if (concealedTris === 3) yaku.push({ name: '三暗刻', han: 2 });
        for (let n = 0; n < 9; n++) {
          if (hasTri(n) && hasTri(9 + n) && hasTri(18 + n)) {
            yaku.push({ name: '三色同刻', han: 2 });
            break;
          }
        }
        if (kans.length === 3) yaku.push({ name: '三杠子', han: 2 });
        const dragonTris = [31, 32, 33].filter(hasTri).length;
        if (dragonTris === 2 && pair >= 31) yaku.push({ name: '小三元', han: 2 });
        if (oneSuit) {
          if (hasHonorTile) yaku.push({ name: '混一色', han: menzen ? 3 : 2 });
          else yaku.push({ name: '清一色', han: menzen ? 6 : 5 });
        }
        cands.push(finish(yaku, [], fu, fuDetail, 'standard', w.kind));
      }
    }

    let best = null;
    for (const r of cands) {
      if (!r) continue;
      if (!best || r.base > best.base || (r.base === best.base && (r.han > best.han || (r.han === best.han && r.fu > best.fu)))) best = r;
    }
    return best;
  }

  /** 默认规则（与雀魂 / 天凤段位战大体一致） */
  const DEFAULT_RULES = {
    startPoints: 25000, // 起始点数
    goalPoints: 30000, // 返点：南四局结束时有人达到才终局
    westRound: true, // 西入：无人达到返点时延长
    tobi: true, // 击飞：有人点数低于 0 时终局
    aka: 3, // 赤宝牌枚数 0 / 3 / 4
    kuitan: true, // 食断
    ippatsu: true,
    uradora: true,
    kandora: true,
    kazoe: true, // 累计役满（13 番以上算役满）
    multiYakuman: true, // 役满复合（双倍役满等）
    multiRon: 'multi', // 'multi' 允许双响 / 'head' 头跳（只算离放铳者最近的一家）
    kyuushu: true, // 九种九牌
    suufon: true, // 四风连打
    suucha: true, // 四家立直
    suukaikan: true, // 四杠散了
    sanchahou: true, // 三家和了
    nagashi: true, // 流局满贯
    uma: '15-5', // 顺位马，见 UMA
    ai: 'builtin', // 'builtin' | 'mortal'
    mortalUrl: 'http://127.0.0.1:8174',
    aiSpeed: 'normal', // 'normal' | 'fast'
    hintAi: 'auto', // 「策」按钮用谁：'auto' 对手是 Mortal 时用 Mortal | 'mortal' | 'builtin'
  };

  // 顺位马（单位：千点）。雀魂友人场默认 +15 / +5 / −5 / −15
  const UMA = {
    none: [0, 0, 0, 0],
    '5-10': [10, 5, -5, -10],
    '15-5': [15, 5, -5, -15],
    '10-20': [20, 10, -10, -20],
    '10-30': [30, 10, -10, -30],
  };

  /**
   * 终局精算：(终局点数 − 返点) / 1000 + 顺位马，一位另得返点差（(返点 − 起始点) × 4 / 1000）。
   * ranking 为按顺位排好的座位（同分时按起家顺序已排好）。返回每个座位的得点（保留一位小数），合计为 0。
   */
  function calcFinal(scores, ranking, rules) {
    const r = Object.assign({}, DEFAULT_RULES, rules);
    const start = r.startPoints;
    const goal = Math.max(r.goalPoints, start);
    const uma = UMA[r.uma] || UMA.none;
    const oka = ((goal - start) * 4) / 100; // 以 100 点为单位，避免浮点误差
    const pts = [0, 0, 0, 0];
    ranking.forEach((seat, i) => {
      const t = Math.round((scores[seat] - goal) / 100) + uma[i] * 10 + (i === 0 ? oka : 0);
      pts[seat] = t / 10 || 0; // 避免 -0
    });
    return pts;
  }

  Object.assign(MJ, {
    DEFAULT_RULES, setAka, AKA_SETS, UMA, calcFinal,
    typeOf, isRed, suitOf, numOf, isHonor, isYaochu, typeName, counts, sortIds,
    parseTypes, parseIds, toNotation, doraFromIndicator,
    shanten, shantenRegular, shantenChiitoi, shantenKokushi, waits, decompose,
    basePoints, limitName, calcPayments, evaluateWin, ceil100,
    WIND_NAMES, NUM_CN, HONOR_CN, WAIT_CN, YAOCHU_LIST,
  });
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined') module.exports = globalThis.MJ;
