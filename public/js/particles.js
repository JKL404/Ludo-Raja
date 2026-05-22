// ============================================================
// particles.js — Confetti & win particle system
// ============================================================
const ParticleSystem = (() => {
  let canvas, ctx, particles = [], animId = null;

  function init() {
    canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function burst(options = {}) {
    if (!canvas || !ctx) init();
    const {
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      count = 120,
      colors = ['#a855f7','#ec4899','#f5c842','#22c55e','#3b82f6','#ef4444','#ffffff'],
    } = options;

    for (let i = 0; i < count; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const speed  = 4 + Math.random() * 10;
      const size   = 5 + Math.random() * 10;
      const shape  = Math.random() < 0.5 ? 'rect' : 'circle';
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        shape,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        gravity: 0.25 + Math.random() * 0.15,
        drag: 0.98,
        life: 1,
        decay: 0.012 + Math.random() * 0.008,
      });
    }

    if (!animId) loop();
  }

  function loop() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.gravity;
      p.rotation += p.rotSpeed;
      p.life -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (particles.length > 0) {
      animId = requestAnimationFrame(loop);
    } else {
      animId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function stop() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    particles = [];
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Win celebration — multiple bursts
  function celebrate(winnerColor) {
    stop();
    const colorMap = {
      red:    ['#ef4444','#fca5a5','#fee2e2','#ffffff'],
      blue:   ['#3b82f6','#93c5fd','#dbeafe','#ffffff'],
      green:  ['#22c55e','#86efac','#dcfce7','#ffffff'],
      yellow: ['#eab308','#fde047','#fef9c3','#ffffff'],
    };
    const colors = colorMap[winnerColor] || ['#a855f7','#ec4899','#f5c842'];

    // Multiple burst locations
    const positions = [
      { x: window.innerWidth * 0.2, y: window.innerHeight * 0.3 },
      { x: window.innerWidth * 0.8, y: window.innerHeight * 0.3 },
      { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 },
      { x: window.innerWidth * 0.1, y: window.innerHeight * 0.6 },
      { x: window.innerWidth * 0.9, y: window.innerHeight * 0.6 },
    ];

    positions.forEach((pos, i) => {
      setTimeout(() => burst({ ...pos, count: 80, colors }), i * 300);
    });
  }

  return { init, burst, celebrate, stop };
})();

window.ParticleSystem = ParticleSystem;
