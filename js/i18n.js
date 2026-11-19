/*
 * 界面语言：中文 / English。
 * - MJ.L(zh, en)：界面文字就地写两种语言，按当前语言取其一
 * - MJ.tr(term)：役种、满贯名、符的项目、风、座位等「术语」查表翻译（数据里存的是中文，显示时再翻）
 * 语言保存在本机（mj-lang），默认跟随浏览器语言；切换后重新载入页面。
 * Node 测试环境下固定为中文。
 */
(function (root) {
  'use strict';
  const MJ = (root.MJ = root.MJ || {});
  const KEY = 'mj-lang';

  function detect() {
    if (typeof document === 'undefined') return 'zh';
    const saved = MJ.Store ? MJ.Store.get(KEY, null) : null;
    if (saved === 'zh' || saved === 'en') return saved;
    const nav = (root.navigator && ((root.navigator.languages && root.navigator.languages[0]) || root.navigator.language)) || '';
    return /^zh/i.test(nav) ? 'zh' : 'en';
  }

  MJ.lang = detect();
  MJ.L = (zh, en) => (MJ.lang === 'en' ? en : zh);

  // 术语表（中文 → English）
  const TERMS = {
    // 役
    立直: 'Riichi', 两立直: 'Double Riichi', 一发: 'Ippatsu', 门前清自摸和: 'Menzen Tsumo', 岭上开花: 'Rinshan Kaihou',
    抢杠: 'Chankan', 海底摸月: 'Haitei Raoyue', 河底捞鱼: 'Houtei Raoyui', 天和: 'Tenhou', 地和: 'Chiihou',
    宝牌: 'Dora', 赤宝牌: 'Red Dora', 里宝牌: 'Ura Dora', 国士无双: 'Kokushi Musou', 七对子: 'Chiitoitsu',
    字一色: 'Tsuuiisou', 断幺九: 'Tanyao', 混老头: 'Honroutou', 混一色: 'Honitsu', 清一色: 'Chinitsu',
    大三元: 'Daisangen', 四暗刻: 'Suuankou', 清老头: 'Chinroutou', 绿一色: 'Ryuuiisou', 大四喜: 'Daisuushii',
    小四喜: 'Shousuushii', 四杠子: 'Suukantsu', 九莲宝灯: 'Chuuren Poutou', 平和: 'Pinfu', 二杯口: 'Ryanpeikou',
    一杯口: 'Iipeikou', 役牌: 'Yakuhai', 场风: 'Round Wind', 自风: 'Seat Wind', 三色同顺: 'Sanshoku Doujun',
    一气通贯: 'Ittsuu', 混全带幺九: 'Chanta', 纯全带幺九: 'Junchan', 对对和: 'Toitoi', 三暗刻: 'Sanankou',
    三色同刻: 'Sanshoku Doukou', 三杠子: 'Sankantsu', 小三元: 'Shousangen',
    白: 'Haku', 发: 'Hatsu', 中: 'Chun', 东: 'East', 南: 'South', 西: 'West', 北: 'North',
    // 满贯以上
    满贯: 'Mangan', 跳满: 'Haneman', 倍满: 'Baiman', 三倍满: 'Sanbaiman', 役满: 'Yakuman', 累计役满: 'Kazoe Yakuman',
    双倍役满: 'Double Yakuman', 三倍役满: 'Triple Yakuman', 四倍役满: '4× Yakuman', 五倍役满: '5× Yakuman', 六倍役满: '6× Yakuman',
    // 符
    底符: 'Base', '平和自摸（不计自摸符）': 'Pinfu tsumo (no tsumo fu)', 门前清荣和: 'Closed ron', 自摸: 'Tsumo',
    七对子固定: 'Chiitoitsu (fixed)', 连风牌雀头: 'Double-wind pair', 役牌雀头: 'Value pair',
    两面听牌: 'Ryanmen wait', 嵌张听牌: 'Kanchan wait', 边张听牌: 'Penchan wait', 单骑听牌: 'Tanki wait', 双碰听牌: 'Shanpon wait',
    '副露平和形（按30符计）': 'Open pinfu shape (counted as 30)', 进位到十位: 'Round up',
    // 其他
    你: 'You', 下家: 'Right', 对家: 'Across', 上家: 'Left', '内置 AI': 'Built-in AI', 东风战: 'East game', 半庄战: 'Hanchan',
    九种九牌: 'Nine terminals', 四风连打: 'Four winds', 四家立直: 'Four riichi', 四杠散了: 'Four kans', 三家和了: 'Triple ron',
    流局: 'Draw', 流局满贯: 'Nagashi Mangan', 吃: 'Chi', 碰: 'Pon', 明杠: 'Open kan', 加杠: 'Added kan', 暗杠: 'Closed kan',
    荣和: 'Ron', 两面: 'Ryanmen', 嵌张: 'Kanchan', 边张: 'Penchan', 单骑: 'Tanki', 双碰: 'Shanpon',
  };
  // 刻子 / 杠子的符：幺九|中张 + 明|暗 + 刻|杠
  for (const y of ['幺九', '中张']) for (const o of ['明', '暗']) for (const k of ['刻', '杠']) {
    TERMS[y + o + k] = `${o === '明' ? 'Open' : 'Closed'} ${y === '幺九' ? 'terminal ' : ''}${k === '刻' ? 'triplet' : 'kan'}`;
  }

  /** 术语翻译：整词查表，查不到时按空格分词再查（如「役牌 白」「场风 东」） */
  MJ.tr = (s) => {
    if (MJ.lang !== 'en' || s == null) return s;
    if (TERMS[s]) return TERMS[s];
    if (/\s/.test(s)) return s.split(/(\s+)/).map((p) => TERMS[p] || p).join('');
    return s;
  };

  const ORD = ['1st', '2nd', '3rd', '4th'];
  /** 顺位：一位 / 1st */
  MJ.ord = (n) => (MJ.lang === 'en' ? ORD[n - 1] : ['一', '二', '三', '四'][n - 1] + '位');
  const WIND_ZH = ['东', '南', '西', '北'];
  const WIND_EN = ['East', 'South', 'West', 'North'];
  /** 风：0-3 */
  MJ.windName = (i) => (MJ.lang === 'en' ? WIND_EN[i] : WIND_ZH[i]);
  /** 局名：东1局 1本场 / East 1 · 1 honba；k 为 0-based 局序号 */
  MJ.roundName = (wind, num, honba) => (MJ.lang === 'en'
    ? `${WIND_EN[wind]} ${num}${honba ? ` · ${honba} honba` : ''}`
    : `${WIND_ZH[wind]}${num}局${honba ? ' ' + honba + '本场' : ''}`);

  function setLang(l) {
    if (l !== 'zh' && l !== 'en') return;
    if (MJ.Store) MJ.Store.set(KEY, l);
    if (typeof location !== 'undefined') location.reload();
  }
  MJ.setLang = setLang;

  /** index.html 里的静态文字 */
  MJ.applyStaticText = () => {
    if (typeof document === 'undefined') return;
    const L = MJ.L;
    document.documentElement.lang = L('zh-CN', 'en');
    document.title = L('雀庭 · 立直麻将', 'Riichi Pavilion · Riichi Mahjong');
    const set = (sel, text, title) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (text != null) el.textContent = text;
      if (title != null) el.title = title;
    };
    set('#hud-left .hud-title', L('宝牌指示牌', 'Dora indicator'));
    const btns = [
      ['#btn-tutorial', '教程', 'Learn', '点数教程', 'Scoring tutorial'],
      ['#btn-hint', '提示', 'Hint', '让 AI 给个建议', 'Ask the AI for advice'],
      ['#btn-rules', '规则', 'Rules', '规则设置', 'Rule settings'],
      ['#btn-sound', '音效', 'Sound', '音效开关', 'Toggle sound'],
      ['#btn-menu', '菜单', 'Menu', '回到主菜单', 'Back to main menu'],
    ];
    for (const [id, zs, es, zt, et] of btns) {
      set(id + ' small', L(zs, es));
      set(id, null, L(zt, et));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
