// ============================================================
// timer.js — Animated countdown ring timer
// ============================================================
const TimerUI = (() => {
  const DURATION = 30000; // 30s
  const CIRCUMFERENCE = 2 * Math.PI * 24; // r=24

  let ring, numEl, intervalId = null, endTime = 0, tickCount = 0;

  function init() {
    ring  = document.getElementById('timer-ring');
    numEl = document.getElementById('timer-number');
    if (ring) ring.style.strokeDasharray = CIRCUMFERENCE;
  }

  function start(durationMs = DURATION) {
    if (!ring || !numEl) init();
    stop();
    endTime   = Date.now() + durationMs;
    tickCount = 0;
    _update();
    intervalId = setInterval(_update, 250);
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (ring)  { ring.style.strokeDashoffset = '0'; ring.className = 'timer-ring-fill'; }
    if (numEl) numEl.textContent = '30';
  }

  function _update() {
    const remaining = Math.max(0, endTime - Date.now());
    const secs      = Math.ceil(remaining / 1000);
    const fraction  = remaining / DURATION;

    if (numEl) numEl.textContent = secs;
    if (ring)  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);

    // Color states
    if (ring) {
      ring.className = 'timer-ring-fill';
      if (secs <= 5)  ring.classList.add('danger');
      else if (secs <= 10) ring.classList.add('warning');
    }

    // Sound ticks
    tickCount++;
    if (tickCount % 4 === 0) { // every ~1 second
      if (secs <= 5 && secs > 0) SoundEngine.play.tickDanger();
      else if (secs <= 10 && secs > 5) SoundEngine.play.tick();
    }

    if (remaining <= 0) stop();
  }

  return { init, start, stop };
})();

window.TimerUI = TimerUI;
