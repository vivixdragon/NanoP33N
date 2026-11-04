'use strict';
// Tiny WebAudio synth — no audio files needed.
const Sfx = (() => {
  let ac = null, master = null, muted = false, noiseBuf = null;
  const last = {};
  const GAP = { arrow: 60, cannon: 90, frost: 90, storm: 110, poison: 90, hit: 50, die: 45, coin: 70, boom: 80 };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slide = 1, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  function play(name) {
    if (!ac || muted) return;
    const now = performance.now();
    if (last[name] && now - last[name] < (GAP[name] || 30)) return;
    last[name] = now;
    switch (name) {
      case 'arrow': noise(0.06, 0.12, 3000); break;
      case 'cannon': noise(0.25, 0.35, 400); tone(90, 0.2, 'sine', 0.3, 0.5); break;
      case 'boom': noise(0.35, 0.4, 600); tone(70, 0.3, 'sine', 0.35, 0.4); break;
      case 'frost': tone(1400, 0.12, 'triangle', 0.08, 1.6); break;
      case 'storm': noise(0.12, 0.2, 5000); tone(220, 0.1, 'sawtooth', 0.07, 2.5); break;
      case 'poison': tone(300, 0.12, 'sine', 0.1, 0.5); break;
      case 'die': tone(260 + Math.random() * 80, 0.09, 'square', 0.05, 0.4); break;
      case 'coin': tone(1320, 0.06, 'square', 0.05); tone(1760, 0.1, 'square', 0.05, 1, 0.05); break;
      case 'build': noise(0.1, 0.25, 900); tone(160, 0.1, 'triangle', 0.15, 0.7); break;
      case 'upgrade': [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.06)); break;
      case 'sell': tone(880, 0.08, 'square', 0.06); tone(660, 0.1, 'square', 0.06, 1, 0.06); break;
      case 'error': tone(140, 0.18, 'sawtooth', 0.12, 0.8); break;
      case 'leak': tone(220, 0.3, 'sawtooth', 0.15, 0.6); tone(165, 0.35, 'sawtooth', 0.12, 0.6, 0.1); break;
      case 'horn': tone(196, 0.6, 'sawtooth', 0.12, 1); tone(294, 0.7, 'sawtooth', 0.1, 1, 0.15); break;
      case 'boss': tone(80, 1.0, 'sawtooth', 0.25, 0.5); noise(0.9, 0.2, 300); break;
      case 'relic': [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, 1, i * 0.08)); break;
      case 'rank': tone(988, 0.08, 'square', 0.06); tone(1318, 0.15, 'square', 0.06, 1, 0.07); break;
      case 'meteor': noise(0.9, 0.5, 300); tone(60, 0.8, 'sine', 0.4, 0.4); break;
      case 'nova': tone(2000, 0.6, 'sine', 0.1, 0.3); noise(0.5, 0.15, 6000); break;
      case 'midas': [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.15, 'square', 0.05, 1, i * 0.05)); break;
      case 'interest': tone(1568, 0.05, 'square', 0.04); tone(2093, 0.08, 'square', 0.04, 1, 0.05); break;
      case 'clear': [523, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, 1, i * 0.1)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.1, 1, i * 0.25)); break;
      case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 1, i * 0.15)); break;
      case 'click': tone(700, 0.03, 'square', 0.04); break;
    }
  }

  return {
    init, play,
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
