// ============================================================
// sound.js — Web Audio API synthesized sound engine
// ============================================================
const SoundEngine = (() => {
  let ctx = null;
  let muted = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function isMuted() { return muted; }
  function toggleMute() {
    muted = !muted;
    const btn = document.getElementById('vol-toggle');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
    return muted;
  }

  // ---- Low-level synth primitives ----
  function beep({ freq = 440, type = 'sine', gain = 0.3, duration = 0.15, delay = 0, detune = 0 } = {}) {
    if (muted || !ctx) return;
    resume();
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  }

  function noise({ gain = 0.2, duration = 0.1, delay = 0 } = {}) {
    if (muted || !ctx) return;
    resume();
    const bufSize = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    src.buffer = buf;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(gain, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    src.start(ctx.currentTime + delay);
    src.stop(ctx.currentTime + delay + duration);
  }

  // ---- Sound effects ----
  const SFX = {
    // Dice rolling — rattling tumble
    diceRoll() {
      init();
      for (let i = 0; i < 8; i++) {
        noise({ gain: 0.15 + Math.random() * 0.1, duration: 0.04 + Math.random() * 0.04, delay: i * 0.07 });
        beep({ freq: 200 + Math.random() * 300, type: 'square', gain: 0.05, duration: 0.03, delay: i * 0.07 + 0.01 });
      }
    },

    // Token move — satisfying click per square
    tokenMove() {
      init();
      beep({ freq: 520, type: 'triangle', gain: 0.25, duration: 0.08 });
      beep({ freq: 780, type: 'triangle', gain: 0.12, duration: 0.05, delay: 0.04 });
    },

    // Token capture — dramatic impact
    capture() {
      init();
      noise({ gain: 0.4, duration: 0.15 });
      beep({ freq: 80,  type: 'sawtooth', gain: 0.4, duration: 0.25 });
      beep({ freq: 120, type: 'sawtooth', gain: 0.2, duration: 0.2, delay: 0.05 });
      beep({ freq: 200, type: 'triangle', gain: 0.15, duration: 0.15, delay: 0.1 });
    },

    // Enter home column — ascending chime
    enterHome() {
      init();
      [523, 659, 784, 1047].forEach((f, i) =>
        beep({ freq: f, type: 'sine', gain: 0.3, duration: 0.18, delay: i * 0.1 })
      );
    },

    // All tokens home — fanfare
    win() {
      init();
      const notes = [523, 659, 784, 1047, 1319, 1047, 784, 1047, 1319];
      notes.forEach((f, i) =>
        beep({ freq: f, type: 'triangle', gain: 0.35, duration: 0.22, delay: i * 0.12 })
      );
      [261, 329, 392, 523].forEach((f, i) =>
        beep({ freq: f, type: 'sawtooth', gain: 0.1, duration: 0.9, delay: i * 0.05 })
      );
    },

    // Six rolled — shimmer sparkle
    six() {
      init();
      [880, 1100, 1320, 1760].forEach((f, i) =>
        beep({ freq: f, type: 'sine', gain: 0.2, duration: 0.12, delay: i * 0.06 })
      );
      noise({ gain: 0.08, duration: 0.3, delay: 0.05 });
    },

    // Timer warning tick
    tick() {
      init();
      beep({ freq: 660, type: 'square', gain: 0.15, duration: 0.05 });
    },

    // Timer danger pulse
    tickDanger() {
      init();
      beep({ freq: 880, type: 'square', gain: 0.2, duration: 0.05 });
      beep({ freq: 440, type: 'square', gain: 0.15, duration: 0.05, delay: 0.07 });
    },

    // Turn start notification ping
    turnStart() {
      init();
      beep({ freq: 440, type: 'sine', gain: 0.2, duration: 0.12 });
      beep({ freq: 660, type: 'sine', gain: 0.15, duration: 0.1, delay: 0.1 });
    },

    // Bot thinking blip
    botThink() {
      init();
      beep({ freq: 300, type: 'sine', gain: 0.1, duration: 0.08, detune: 50 });
    },

    // Triple six forfeit
    tripleSix() {
      init();
      [330, 294, 262].forEach((f, i) =>
        beep({ freq: f, type: 'sawtooth', gain: 0.25, duration: 0.2, delay: i * 0.15 })
      );
    },

    // Token enters board from yard
    enterBoard() {
      init();
      beep({ freq: 392, type: 'triangle', gain: 0.25, duration: 0.15 });
      beep({ freq: 523, type: 'triangle', gain: 0.2,  duration: 0.12, delay: 0.1 });
    },
  };

  return { init, resume, toggleMute, isMuted, play: SFX };
})();

// Expose globally
window.SoundEngine = SoundEngine;
