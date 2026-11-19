/* 音效：全部用 WebAudio 实时合成，不依赖音频文件。 */
(function () {
  'use strict';
  const MJ = window.MJ;
  let ctx = null;
  let noiseBuf = null;

  const Sound = {
    on: true,
    init() {
      this.on = MJ.Store.get('mj-sound', 1) !== 0; // 旧版存的是 '0' / '1'，JSON 解析后同样兼容
    },
    toggle() {
      this.on = !this.on;
      MJ.Store.set('mj-sound', this.on ? 1 : 0);
      if (this.on) this.play('click');
      return this.on;
    },
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    },
    play(name) {
      if (!this.on || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      switch (name) {
        case 'discard': clack(t, 0.32, 2100, 0.07); thump(t, 150, 0.16, 0.06); break;
        case 'draw': clack(t, 0.09, 3400, 0.035); break;
        case 'click': clack(t, 0.07, 4200, 0.025); break;
        case 'call': clack(t, 0.3, 1900, 0.06); clack(t + 0.07, 0.24, 2400, 0.06); tone(t, 494, 0.16, 0.1, 'triangle'); break;
        case 'riichi': clack(t, 0.25, 1500, 0.09); tone(t, 587, 0.22, 0.09, 'triangle'); tone(t + 0.1, 880, 0.3, 0.09, 'triangle'); break;
        case 'dora': tone(t, 1175, 0.25, 0.06, 'sine'); tone(t + 0.08, 1568, 0.3, 0.05, 'sine'); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(t + i * 0.09, f, 0.7, 0.085, 'triangle'); tone(t + i * 0.09, f * 2, 0.5, 0.025, 'sine'); }); break;
        case 'draw-end': tone(t, 392, 0.5, 0.08, 'sine'); tone(t + 0.18, 330, 0.7, 0.08, 'sine'); break;
        case 'deal': for (let i = 0; i < 7; i++) clack(t + i * 0.055, 0.1, 2600 + (i % 3) * 300, 0.03); break;
        case 'ok': tone(t, 784, 0.18, 0.07, 'triangle'); tone(t + 0.09, 1047, 0.3, 0.07, 'triangle'); break;
        case 'bad': tone(t, 311, 0.3, 0.07, 'triangle'); tone(t + 0.12, 262, 0.4, 0.07, 'triangle'); break;
      }
    },
  };

  function clack(t, gain, freq, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function thump(t, freq, gain, dur) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function tone(t, freq, dur, gain, type) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  MJ.Sound = Sound;
})();
