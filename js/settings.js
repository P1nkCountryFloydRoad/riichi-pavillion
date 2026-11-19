/* 规则与 AI 设置面板：保存在本机浏览器，下一局开始时生效。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const $ = (s, root) => (root || document).querySelector(s);
  const KEY = 'mj-rules-v1';
  const fmt = (n) => n.toLocaleString('en-US');
  const L = MJ.L;

  function load() {
    const saved = MJ.Store.get(KEY, {}) || {};
    const r = Object.assign({}, MJ.DEFAULT_RULES);
    for (const k in saved) if (k in r && typeof saved[k] === typeof r[k]) r[k] = saved[k];
    return r;
  }

  function save(r) { MJ.Store.set(KEY, r); }

  const state = { rules: load(), ping: null, pinging: false };

  // 每个选项：[键, 标签, 选项值, 选项文字, 说明]
  const ON_OFF = [[true, false], L(['有', '无'], ['On', 'Off'])];
  const GROUPS = [
    { title: L('点数与终局', 'Points and game end'), items: [
      ['startPoints', L('起始点数', 'Starting points'), [20000, 25000, 30000, 35000], null, ''],
      ['goalPoints', L('返点', 'Return points'), [25000, 30000, 35000, 40000], null, L('尾局结束时需有人达到返点才终局；低于起始点数时按起始点数计', 'After the last hand, the game ends only if someone has reached this; values below the starting points count as the starting points')],
      ['westRound', L('西入', 'West round'), ...ON_OFF, L('尾局结束时无人达到返点则进入西场，最多延长一圈', 'If nobody has reached the return points after the last hand, play on into the West round (one extra round at most)')],
      ['tobi', L('击飞', 'Bust ends game'), ...ON_OFF, L('有人点数低于 0 时立即终局', 'The game ends as soon as someone drops below 0')],
      ['uma', L('顺位马', 'Uma'), ['none', '5-10', '15-5', '10-20', '10-30'], L(['无', '5-10', '雀魂式 15/5', '10-20', '10-30'], ['None', '5-10', 'Online 15/5', '10-20', '10-30']),
        L('终局得点 = (点数 − 返点) ÷ 1000 + 顺位马，一位另得返点差；例：雀魂式为 +15 / +5 / −5 / −15', 'Final points = (score − return) ÷ 1000 + uma; 1st also gets the oka. Online 15/5 means +15 / +5 / −5 / −15')],
    ] },
    { title: L('宝牌与役', 'Dora and yaku'), items: [
      ['aka', L('赤宝牌', 'Red fives'), [0, 3, 4], L(['无', '3 枚', '4 枚'], ['None', '3', '4']), L('4 枚为赤五万、赤五索各一，赤五筒两枚', '4 = one red 5m, one red 5s and two red 5p')],
      ['kuitan', L('食断', 'Open tanyao'), ...ON_OFF, L('副露后断幺九是否成立', 'Whether tanyao counts with an open hand')],
      ['ippatsu', L('一发', 'Ippatsu'), ...ON_OFF, ''],
      ['uradora', L('里宝牌', 'Ura dora'), ...ON_OFF, ''],
      ['kandora', L('杠宝牌', 'Kan dora'), ...ON_OFF, L('开杠后翻开新的宝牌指示牌', 'Each kan reveals a new dora indicator')],
      ['kazoe', L('累计役满', 'Kazoe yakuman'), ...ON_OFF, L('关闭时 13 番以上按三倍满计', 'When off, 13+ han counts as sanbaiman')],
      ['multiYakuman', L('役满复合', 'Stacked yakuman'), ...ON_OFF, L('关闭时双倍役满等只按一倍计', 'When off, double yakuman and above count as a single yakuman')],
    ] },
    { title: L('和了与流局', 'Wins and draws'), items: [
      ['multiRon', L('一炮多响', 'Multiple ron'), ['multi', 'head'], L(['双响', '头跳'], ['Allowed', 'Head bump']), L('头跳：多家同时荣和时，只有放铳者下家起最近的一家和牌', 'Head bump: when several players ron, only the first one counting from the discarder\'s right wins')],
      ['nagashi', L('流局满贯', 'Nagashi mangan'), ...ON_OFF, L('荒牌时舍牌全是幺九且未被鸣走，按满贯自摸收点', 'At an exhaustive draw, if all your discards are terminals or honors and none were called, you are paid a mangan tsumo')],
    ] },
    { title: L('途中流局', 'Abortive draws'), items: [
      ['kyuushu', L('九种九牌', 'Nine terminals'), ...ON_OFF, L('第一巡未被鸣牌打断时，手里有九种以上幺九牌可宣告流局', 'On the first go-around with no calls, nine or more different terminals and honors may declare a draw')],
      ['suufon', L('四风连打', 'Four winds'), ...ON_OFF, L('第一巡四家打出同一种风牌', 'All four players discard the same wind on the first go-around')],
      ['suucha', L('四家立直', 'Four riichi'), ...ON_OFF, L('四家都立直成立', 'All four players are in riichi')],
      ['suukaikan', L('四杠散了', 'Four kans'), ...ON_OFF, L('两家以上合计开了四个杠', 'Four kans made by two or more players')],
      ['sanchahou', L('三家和了', 'Triple ron'), ...ON_OFF, L('三家同时荣和同一张牌时流局（关闭则三家都和）', 'Three players ron the same tile: the hand is drawn (when off, all three win)')],
    ] },
  ];

  function seg(key, vals, labels) {
    const cur = state.rules[key];
    return `<div class="seg" data-key="${key}">${vals.map((v, i) =>
      `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${labels ? labels[i] : typeof v === 'number' ? fmt(v) : v}</button>`).join('')}</div>`;
  }

  function aiBlock() {
    const r = state.rules;
    const p = state.ping;
    let status = '';
    if (state.pinging) status = `<span class="st">${L('连接中…', 'Connecting…')}</span>`;
    else if (p && p.ok) status = `<span class="st ok">${L('已连接：', 'Connected: ')}${p.engine}</span>`;
    else if (p) status = `<span class="st bad">${L('连不上：', 'Cannot connect: ')}${p.error || L('未知错误', 'unknown error')}</span>`;
    const mortalLink = '<a href="https://github.com/Equim-chan/Mortal" target="_blank" rel="noopener">Mortal</a>';
    return `
      <div class="set-row"><span class="lab">${L('对手 AI', 'Opponent AI')}</span>${seg('ai', ['builtin', 'mortal'], [L('内置 AI', 'Built-in AI'), 'Mortal'])}
        <span class="hint">${L('内置 AI 离线可用；Mortal 是更强的深度学习 AI，需要在本机运行桥接程序', 'The built-in AI works offline; Mortal is a much stronger deep-learning AI that needs a bridge program running on this computer')}</span></div>
      <div class="set-row"><span class="lab">${L('AI 速度', 'AI speed')}</span>${seg('aiSpeed', ['normal', 'fast'], L(['从容', '快速'], ['Relaxed', 'Fast']))}<span class="hint"></span></div>
      <div class="set-row"><span class="lab">${L('「策」提示', 'Hint (策)')}</span>${seg('hintAi', ['auto', 'mortal', 'builtin'], [L('跟随对手', 'Same as opponents'), 'Mortal', L('内置 AI', 'Built-in AI')])}
        <span class="hint">${L('Mortal 提示会列出每个选项的倾向百分比；对手用内置 AI 时也可以单独让 Mortal 来提示（需要桥接程序在线）', 'Mortal hints list a percentage for every option; you can use Mortal for hints even when the opponents are the built-in AI (the bridge must be running)')}</span></div>
      <div class="mortal-box${r.ai === 'mortal' ? '' : ' off'}">
        <div class="set-row"><span class="lab">${L('桥接地址', 'Bridge URL')}</span>
          <div class="url-row"><input id="mortal-url" spellcheck="false" value="${r.mortalUrl.replace(/"/g, '&quot;')}">
          <button class="btn" data-a="ping">${L('测试连接', 'Test connection')}</button></div>${status}</div>
        <ol class="howto">
          <li>${L(`准备 ${mortalLink}：按其文档编译 libriichi，再准备一个模型权重 .pth（Mortal 官方不附带训练好的权重，README 里列了几个社区权重）。`,
            `Set up ${mortalLink}: build libriichi as its docs describe, then get a model weights file (.pth). Mortal does not ship trained weights; the README lists a few community ones.`)}</li>
          <li>${L('在本项目目录运行：', 'In this project folder, run: ')}<code>python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model ${L('权重', 'weights')}.pth</code>${L('（换权重就换 <code>--model</code> 后重启桥接程序）', ' (to switch weights, change <code>--model</code> and restart the bridge)')}</li>
          <li>${L('点「测试连接」确认在线后开始对局。对局中如果 Mortal 出错或无响应，会自动换回内置 AI 并提示。', 'Click “Test connection”, then start a game. If Mortal fails or stops responding mid-game, that seat switches back to the built-in AI and you are told.')}</li>
        </ol>
      </div>`;
  }

  function render() {
    const root = $('#settings');
    const main = $('.settings-body', root);
    const top = main ? main.scrollTop : 0;
    const inGame = MJ.UI.game && !MJ.UI.game.over;
    root.innerHTML = `<div class="overlay"><div class="card settings">
      <div class="win-head"><h2>${L('规则设置', 'Rules')}</h2><span class="sub">${inGame ? L('修改将从下一场对局开始生效', 'Changes apply from the next game') : L('设置保存在本机，开始对局时生效', 'Saved on this device; applied when a game starts')}</span></div>
      <div class="settings-body">
        <div class="set-row"><span class="lab">语言 / Language</span><div class="seg" data-lang="1"><button data-v="zh" class="${MJ.lang === 'zh' ? 'on' : ''}">中文</button><button data-v="en" class="${MJ.lang === 'en' ? 'on' : ''}">English</button></div><span class="hint">${L('切换后页面会重新载入（对局中切换会结束当前对局）', 'The page reloads after switching (a game in progress is ended)')}</span></div>
        <h4>${L('对手', 'Opponents')}</h4>${aiBlock()}
        ${GROUPS.map((g) => `<h4>${g.title}</h4>` + g.items.map(([key, label, vals, labels, hint]) =>
          `<div class="set-row"><span class="lab">${label}</span>${seg(key, vals, labels)}<span class="hint">${hint}</span></div>`).join('')).join('')}
      </div>
      <div class="btn-row"><button class="btn" data-a="reset">${L('恢复默认', 'Reset to defaults')}</button><button class="btn primary" data-a="close">${L('完成', 'Done')}</button></div>
    </div></div>`;
    const m = $('.settings-body', root);
    m.scrollTop = top;
  }

  function set(key, raw) {
    const def = MJ.DEFAULT_RULES[key];
    const v = typeof def === 'boolean' ? raw === 'true' : typeof def === 'number' ? +raw : raw;
    state.rules[key] = v;
    save(state.rules);
  }

  async function ping() {
    const input = $('#mortal-url');
    if (input) {
      state.rules.mortalUrl = input.value.trim() || MJ.DEFAULT_RULES.mortalUrl;
      save(state.rules);
    }
    state.pinging = true;
    render();
    state.ping = await MJ.Mjai.ping(state.rules.mortalUrl);
    state.pinging = false;
    if ($('#settings').classList.contains('show')) render();
    return state.ping;
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) {
      if (e.target.classList.contains('overlay')) close();
      return;
    }
    const segEl = t.closest('.seg');
    if (segEl && segEl.dataset.lang) {
      if (t.dataset.v !== MJ.lang) MJ.setLang(t.dataset.v);
      return;
    }
    if (segEl) {
      set(segEl.dataset.key, t.dataset.v);
      MJ.Sound.play('click');
      render();
      if (segEl.dataset.key === 'ai' && state.rules.ai === 'mortal' && !state.ping) ping();
      return;
    }
    const a = t.dataset.a;
    if (a === 'close') close();
    else if (a === 'reset') {
      state.rules = Object.assign({}, MJ.DEFAULT_RULES);
      save(state.rules);
      state.ping = null;
      render();
    } else if (a === 'ping') ping();
  }

  function onInput(e) {
    if (e.target.id === 'mortal-url') {
      state.rules.mortalUrl = e.target.value.trim();
      state.ping = null;
      save(state.rules);
    }
  }

  function open() {
    $('#settings').classList.add('show');
    render();
  }

  function close() {
    MJ.Sound.play('click');
    $('#settings').classList.remove('show');
    $('#settings').innerHTML = '';
    if (MJ.UI.refreshMenu) MJ.UI.refreshMenu();
  }

  /**
   * 规则摘要（菜单底部、战绩详情）。rules 不传时用当前设置；lang 可强制语言（存进战绩的旧格式摘要固定用中文）。
   */
  function summary(forRecord, rules, lang) {
    const r = Object.assign({}, MJ.DEFAULT_RULES, rules || state.rules);
    const T = lang ? (zh, en) => (lang === 'en' ? en : zh) : L;
    const goal = fmt(Math.max(r.goalPoints, r.startPoints));
    const parts = [T(fmt(r.startPoints) + ' 点起 / ' + goal + ' 返', fmt(r.startPoints) + ' start / ' + goal + ' return')];
    parts.push(r.aka ? T('赤 ', 'red ×') + r.aka : T('无赤', 'no reds'));
    parts.push(r.kuitan ? T('食断', 'open tanyao') : T('无食断', 'no open tanyao'));
    const u = MJ.UMA[r.uma];
    parts.push(u && u[0] ? T('马 ', 'uma ') + u.map((v) => (v > 0 ? '+' : '') + v).join('/') : T('无马', 'no uma'));
    if (!r.tobi) parts.push(T('无击飞', 'no bust'));
    if (!r.westRound) parts.push(T('无西入', 'no West round'));
    if (r.multiRon === 'head') parts.push(T('头跳', 'head bump'));
    const ab = ['kyuushu', 'suufon', 'suucha', 'suukaikan', 'sanchahou'].filter((k) => r[k]).length;
    parts.push(ab === 5 ? T('途中流局全有', 'all abortive draws') : ab === 0 ? T('无途中流局', 'no abortive draws') : T('途中流局 ' + ab + ' 种', ab + ' abortive draws'));
    if (forRecord) return parts.join(' · ');
    parts.push(r.ai === 'mortal' ? T('对手：Mortal', 'vs Mortal') : T('对手：内置 AI', 'vs built-in AI'));
    return parts.join(' · ');
  }

  function init() {
    $('#settings').addEventListener('click', onClick);
    $('#settings').addEventListener('input', onInput);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#settings').classList.contains('show')) close();
    });
  }

  MJ.Settings = { init, open, close, get rules() { return Object.assign({}, state.rules); }, summary, ping };
})();
