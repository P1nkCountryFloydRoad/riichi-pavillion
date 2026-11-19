/* 规则与 AI 设置面板：保存在本机浏览器，下一局开始时生效。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  const $ = (s, root) => (root || document).querySelector(s);
  const KEY = 'mj-rules-v1';
  const fmt = (n) => n.toLocaleString('en-US');

  function load() {
    const saved = MJ.Store.get(KEY, {}) || {};
    const r = Object.assign({}, MJ.DEFAULT_RULES);
    for (const k in saved) if (k in r && typeof saved[k] === typeof r[k]) r[k] = saved[k];
    return r;
  }

  function save(r) { MJ.Store.set(KEY, r); }

  const state = { rules: load(), ping: null, pinging: false };

  // 每个选项：[键, 标签, 选项值, 选项文字, 说明]
  const ON_OFF = [[true, false], ['有', '无']];
  const GROUPS = [
    { title: '点数与终局', items: [
      ['startPoints', '起始点数', [20000, 25000, 30000, 35000], null, ''],
      ['goalPoints', '返点', [25000, 30000, 35000, 40000], null, '尾局结束时需有人达到返点才终局；低于起始点数时按起始点数计'],
      ['westRound', '西入', ...ON_OFF, '尾局结束时无人达到返点则进入西场，最多延长一圈'],
      ['tobi', '击飞', ...ON_OFF, '有人点数低于 0 时立即终局'],
      ['uma', '顺位马', ['none', '5-10', '15-5', '10-20', '10-30'], ['无', '5-10', '雀魂式 15/5', '10-20', '10-30'],
        '终局得点 = (点数 − 返点) ÷ 1000 + 顺位马，一位另得返点差；例：雀魂式为 +15 / +5 / −5 / −15'],
    ] },
    { title: '宝牌与役', items: [
      ['aka', '赤宝牌', [0, 3, 4], ['无', '3 枚', '4 枚'], '4 枚为赤五万、赤五索各一，赤五筒两枚'],
      ['kuitan', '食断', ...ON_OFF, '副露后断幺九是否成立'],
      ['ippatsu', '一发', ...ON_OFF, ''],
      ['uradora', '里宝牌', ...ON_OFF, ''],
      ['kandora', '杠宝牌', ...ON_OFF, '开杠后翻开新的宝牌指示牌'],
      ['kazoe', '累计役满', ...ON_OFF, '关闭时 13 番以上按三倍满计'],
      ['multiYakuman', '役满复合', ...ON_OFF, '关闭时双倍役满等只按一倍计'],
    ] },
    { title: '和了与流局', items: [
      ['multiRon', '一炮多响', ['multi', 'head'], ['双响', '头跳'], '头跳：多家同时荣和时，只有放铳者下家起最近的一家和牌'],
      ['nagashi', '流局满贯', ...ON_OFF, '荒牌时舍牌全是幺九且未被鸣走，按满贯自摸收点'],
    ] },
    { title: '途中流局', items: [
      ['kyuushu', '九种九牌', ...ON_OFF, '第一巡未被鸣牌打断时，手里有九种以上幺九牌可宣告流局'],
      ['suufon', '四风连打', ...ON_OFF, '第一巡四家打出同一种风牌'],
      ['suucha', '四家立直', ...ON_OFF, '四家都立直成立'],
      ['suukaikan', '四杠散了', ...ON_OFF, '两家以上合计开了四个杠'],
      ['sanchahou', '三家和了', ...ON_OFF, '三家同时荣和同一张牌时流局（关闭则三家都和）'],
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
    if (state.pinging) status = '<span class="st">连接中…</span>';
    else if (p && p.ok) status = `<span class="st ok">已连接：${p.engine}</span>`;
    else if (p) status = `<span class="st bad">连不上：${p.error || '未知错误'}</span>`;
    return `
      <div class="set-row"><span class="lab">对手 AI</span>${seg('ai', ['builtin', 'mortal'], ['内置 AI', 'Mortal'])}
        <span class="hint">内置 AI 离线可用；Mortal 是更强的深度学习 AI，需要在本机运行桥接程序</span></div>
      <div class="set-row"><span class="lab">AI 速度</span>${seg('aiSpeed', ['normal', 'fast'], ['从容', '快速'])}<span class="hint"></span></div>
      <div class="mortal-box${r.ai === 'mortal' ? '' : ' off'}">
        <div class="set-row"><span class="lab">桥接地址</span>
          <div class="url-row"><input id="mortal-url" spellcheck="false" value="${r.mortalUrl.replace(/"/g, '&quot;')}">
          <button class="btn" data-a="ping">测试连接</button></div>${status}</div>
        <ol class="howto">
          <li>准备 <a href="https://github.com/Equim-chan/Mortal" target="_blank" rel="noopener">Mortal</a>：按其文档编译 libriichi，再准备一个模型权重 .pth（Mortal 官方不附带训练好的权重，README 里列了几个社区权重）。</li>
          <li>在本项目目录运行：<code>python3 tools/mortal_bridge.py --mortal-dir ~/Mortal/mortal --model 权重.pth</code>（换权重就换 <code>--model</code> 后重启桥接程序）</li>
          <li>点「测试连接」确认在线后开始对局。对局中如果 Mortal 出错或无响应，会自动换回内置 AI 并提示。</li>
        </ol>
      </div>`;
  }

  function render() {
    const root = $('#settings');
    const main = $('.settings-body', root);
    const top = main ? main.scrollTop : 0;
    const inGame = MJ.UI.game && !MJ.UI.game.over;
    root.innerHTML = `<div class="overlay"><div class="card settings">
      <div class="win-head"><h2>规则设置</h2><span class="sub">${inGame ? '修改将从下一场对局开始生效' : '设置保存在本机，开始对局时生效'}</span></div>
      <div class="settings-body">
        <h4>对手</h4>${aiBlock()}
        ${GROUPS.map((g) => `<h4>${g.title}</h4>` + g.items.map(([key, label, vals, labels, hint]) =>
          `<div class="set-row"><span class="lab">${label}</span>${seg(key, vals, labels)}<span class="hint">${hint}</span></div>`).join('')).join('')}
      </div>
      <div class="btn-row"><button class="btn" data-a="reset">恢复默认</button><button class="btn primary" data-a="close">完成</button></div>
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

  /** 菜单底部显示的规则摘要 */
  function summary(forRecord) {
    const r = state.rules;
    const parts = [fmt(r.startPoints) + ' 点起 / ' + fmt(Math.max(r.goalPoints, r.startPoints)) + ' 返'];
    parts.push(r.aka ? '赤 ' + r.aka : '无赤');
    parts.push(r.kuitan ? '食断' : '无食断');
    const u = MJ.UMA[r.uma];
    parts.push(u && u[0] ? '马 ' + u.map((v) => (v > 0 ? '+' : '') + v).join('/') : '无马');
    if (!r.tobi) parts.push('无击飞');
    if (!r.westRound) parts.push('无西入');
    if (r.multiRon === 'head') parts.push('头跳');
    const ab = ['kyuushu', 'suufon', 'suucha', 'suukaikan', 'sanchahou'].filter((k) => r[k]).length;
    parts.push(ab === 5 ? '途中流局全有' : ab === 0 ? '无途中流局' : '途中流局 ' + ab + ' 种');
    if (forRecord) return parts.join(' · ');
    parts.push(r.ai === 'mortal' ? '对手：Mortal' : '对手：内置 AI');
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
