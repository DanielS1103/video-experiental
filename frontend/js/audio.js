// Audio generativo con WebAudio (sin archivos). Se activa tras el primer gesto del usuario.
//   Nostalgia: colchón cálido + cajita de música + siseo de cinta; se "ahoga" al tocar/moverse.
//   Ansiedad : latido, zumbido agudo (tinnitus), drone disonante y ruido que crecen con la tensión.
export function createAudio() {
  let ctx = null, started = false, enabled = true, mode = 0;
  let master, nos, anx, nosFilter, lfoGain, hissGain, tin, tinGain, droneGain, noiseGain;
  let lastBeat = -1, nextNote = 0;

  function noiseBuffer() {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer();
    s.loop = true;
    s.start();
    return s;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    // ---------- NOSTALGIA ----------
    nos = ctx.createGain(); nos.gain.value = 0; nos.connect(master);
    nosFilter = ctx.createBiquadFilter();
    nosFilter.type = 'lowpass'; nosFilter.frequency.value = 3200; nosFilter.Q.value = 0.7;
    nosFilter.connect(nos);

    const pad = ctx.createGain(); pad.gain.value = 0.12; pad.connect(nosFilter);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35;
    lfoGain = ctx.createGain(); lfoGain.gain.value = 4;      // cents de vibrato
    lfo.connect(lfoGain); lfo.start();
    [220, 277.18, 329.63, 493.88].forEach((f, i) => {        // La mayor add9, abierto
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      lfoGain.connect(o.detune);
      o.connect(pad);
      o.start();
    });

    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    hissGain = ctx.createGain(); hissGain.gain.value = 0.012;
    noiseSource().connect(hp); hp.connect(hissGain); hissGain.connect(nos);

    // ---------- ANSIEDAD ----------
    anx = ctx.createGain(); anx.gain.value = 0; anx.connect(master);

    tin = ctx.createOscillator(); tin.type = 'sine'; tin.frequency.value = 5200;
    tinGain = ctx.createGain(); tinGain.gain.value = 0;
    tin.connect(tinGain); tinGain.connect(anx); tin.start();

    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 240;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.02;
    [55, 58.3].forEach((f) => {                              // casi unísono: batido incómodo
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(dl); o.start();
    });
    dl.connect(droneGain); droneGain.connect(anx);

    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.6;
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
    noiseSource().connect(bp); bp.connect(noiseGain); noiseGain.connect(anx);
  }

  function pluck(freq) {                                     // cajita de música
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(nosFilter);
    o.start(t); o2.start(t); o.stop(t + 3.1); o2.stop(t + 3.1);
  }

  function thump(vol) {                                      // latido
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(anx);
    o.start(t); o.stop(t + 0.25);
  }

  return {
    start() {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      started = true;
    },
    toggle() { enabled = !enabled; },
    setMode(m) { mode = m; lastBeat = -1; },
    get state() { return !started ? 'toca una tecla' : enabled ? 'on' : 'mute'; },

    // p = { tension, motion, presence, beatPhase, bpm }
    update(p) {
      if (!started || !ctx) return;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(enabled ? 0.8 : 0, t, 0.1);
      nos.gain.setTargetAtTime(mode === 0 ? 1 : 0, t, 0.4);
      anx.gain.setTargetAtTime(mode === 1 ? 1 : 0, t, 0.4);

      if (mode === 0) {
        const muffle = Math.min(1, p.presence * 0.9 + p.motion * 0.4);   // "bajo el agua"
        nosFilter.frequency.setTargetAtTime(3200 - 2700 * muffle, t, 0.15);
        lfoGain.gain.setTargetAtTime(4 + 45 * p.motion, t, 0.2);          // cinta inestable
        hissGain.gain.setTargetAtTime(0.01 + 0.03 * p.motion + 0.02 * p.presence, t, 0.2);
        if (t > nextNote) {
          const scale = [440, 493.88, 554.37, 659.25, 739.99, 880];
          pluck(scale[Math.floor(Math.random() * scale.length)]);
          nextNote = t + 1.5 + Math.random() * 3.5;
        }
      } else {
        const T = p.tension;
        tin.frequency.setTargetAtTime(5200 + 800 * T, t, 0.3);
        tinGain.gain.setTargetAtTime(0.002 + 0.03 * T * T, t, 0.3);
        droneGain.gain.setTargetAtTime(0.02 + 0.12 * T, t, 0.5);
        noiseGain.gain.setTargetAtTime(0.05 * T + 0.03 * p.motion, t, 0.3);
        const idx = Math.floor(p.beatPhase);
        if (idx !== lastBeat) {
          lastBeat = idx;
          thump(0.35 + 0.5 * T);
          setTimeout(() => { if (mode === 1) thump(0.22 + 0.3 * T); }, 0.25 * 60000 / p.bpm);
        }
      }
    },
  };
}
