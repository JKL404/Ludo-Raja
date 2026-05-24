// ============================================================
// particles.js — Advanced Micro-particle & win celebration system
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

  // Draw star shape
  function drawStar(c, cx, cy, spikes, outer, inner) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    c.beginPath();
    c.moveTo(cx, cy - outer);
    for (let i = 0; i < spikes; i++) {
      c.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
      c.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
    }
    c.lineTo(cx, cy - outer);
    c.closePath();
    c.fill();
  }

  // Main animation loop
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
      if (p.wobbleSpeed !== undefined) {
        p.wobble += p.wobbleSpeed;
      }

      ctx.save();
      const alpha = Math.max(0, p.life);
      ctx.globalAlpha = alpha;

      // Glow effect for magical particles
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.glowSize || 10;
      }

      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      const size = p.size * (p.scaleUpOnSpawn && p.life > 0.85 ? (1.0 - p.life) / 0.15 : 1.0);

      if (p.type === 'star') {
        drawStar(ctx, 0, 0, 5, size * 0.6, size * 0.25);
      } else if (p.type === 'ribbon') {
        // Draw wavy ribbon line
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size * 0.4;
        ctx.beginPath();
        const w = size * Math.sin(p.wobble);
        ctx.moveTo(-size/2, -size/4);
        ctx.bezierCurveTo(-size/4, size/4, size/4, -size/4, size/2, size/4);
        ctx.stroke();
      } else if (p.type === 'sparkle') {
        // 4-point sparkle star
        drawStar(ctx, 0, 0, 4, size * 0.7, size * 0.15);
      } else if (p.type === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Default rect (confetti strip)
        // Add 3D-like flip wobble
        const width = size;
        const height = size * 0.5 * Math.sin(p.wobble || 0);
        ctx.fillRect(-width / 2, -height / 2, width, height);
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

  // --- Particle Emitter Functions ---

  // 1. Confetti burst (general, win celebration)
  function burst(options = {}) {
    if (!canvas || !ctx) init();
    const {
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      count = 80,
      colors = ['#a855f7','#ec4899','#f5c842','#22c55e','#3b82f6','#ef4444','#ffffff'],
    } = options;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      const size  = 6 + Math.random() * 12;
      const r = Math.random();
      let type = 'rect';
      if (r < 0.2) type = 'star';
      else if (r < 0.4) type = 'ribbon';
      else if (r < 0.6) type = 'circle';

      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        type,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.1,
        gravity: 0.15 + Math.random() * 0.1,
        drag: 0.97,
        life: 1.0,
        decay: 0.008 + Math.random() * 0.008,
        glow: type === 'star',
        glowSize: 6,
        scaleUpOnSpawn: true
      });
    }

    if (!animId) loop();
  }

  // 2. Token Movement Trail (subtle, floating stars/bubbles)
  function spawnTrail(x, y, color) {
    if (!canvas || !ctx) init();
    const colors = [color, '#ffffff'];
    
    // Emit 1 subtle trail particle per call
    const count = 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 1.5 + (Math.random() - 0.5) * 1.2; // Mostly upwards
      const speed = 0.5 + Math.random() * 1.5;
      const size  = 3 + Math.random() * 3;
      const type  = Math.random() < 0.6 ? 'star' : 'circle';

      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        type,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        gravity: -0.01 - Math.random() * 0.02, // float upwards slightly
        drag: 0.98,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.02, // fades quickly
        glow: true,
        glowSize: 4,
        scaleUpOnSpawn: false
      });
    }

    if (!animId) loop();
  }

  // 3. Landing / Capture / Entry Burst (energetic star explosion)
  function spawnBurst(x, y, color, intensity = 'normal') {
    if (!canvas || !ctx) init();
    const colors = {
      red:    ['#ef4444','#fca5a5','#fee2e2','#ffffff'],
      blue:   ['#3b82f6','#93c5fd','#dbeafe','#ffffff'],
      green:  ['#22c55e','#86efac','#dcfce7','#ffffff'],
      yellow: ['#eab308','#fde047','#fef9c3','#ffffff'],
    }[color] || [color, '#ffffff'];

    let count = 20;
    let speedMult = 1.0;
    let decayMult = 1.0;
    let isCapture = false;

    if (intensity === 'high') { // Capture / Home
      count = 55;
      speedMult = 1.8;
      decayMult = 0.7; // last longer
      isCapture = true;
    } else if (intensity === 'low') { // standard hop step
      count = 8;
      speedMult = 0.6;
      decayMult = 1.5; // fades very fast
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 6) * speedMult;
      const size  = (isCapture ? 6 : 4) + Math.random() * 8;
      const type  = Math.random() < 0.6 ? 'sparkle' : (Math.random() < 0.5 ? 'star' : 'circle');

      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (isCapture ? 2.5 : 1),
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        type,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        gravity: isCapture ? 0.2 : 0.08, // gravity pulls capture sparks down
        drag: 0.96,
        life: 1.0,
        decay: (0.015 + Math.random() * 0.015) * decayMult,
        glow: true,
        glowSize: isCapture ? 12 : 8,
        scaleUpOnSpawn: true
      });
    }

    if (!animId) loop();
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
      setTimeout(() => burst({ ...pos, count: 60, colors }), i * 300);
    });
  }

  return { init, burst, celebrate, spawnTrail, spawnBurst, stop };
})();

window.ParticleSystem = ParticleSystem;
