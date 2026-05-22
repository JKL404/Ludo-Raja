// ============================================================
// dice.js — 3D CSS dice display controller
// ============================================================
const DiceUI = (() => {
  // pip layouts per face value (3×3 grid positions, 0-8)
  const PIP_LAYOUTS = {
    1: [4],
    2: [1, 7],
    3: [1, 4, 7],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  // CSS transform for each face value (which face to show front)
  const FACE_TRANSFORMS = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(180deg)',
    3: 'rotateX(0deg) rotateY(-90deg)',
    4: 'rotateX(0deg) rotateY(90deg)',
    5: 'rotateX(-90deg) rotateY(0deg)',
    6: 'rotateX(90deg) rotateY(0deg)',
  };

  let diceEl, valueDisplay;

  function init() {
    diceEl       = document.getElementById('dice-3d');
    valueDisplay = document.getElementById('dice-value-display');
  }

  function show(value) {
    if (!diceEl) init();
    // Update all faces' pips
    const faces = diceEl.querySelectorAll('.dice-face');
    faces.forEach((face, faceIdx) => {
      const faceValue = faceIdx + 1;
      const pips = face.querySelectorAll('.pip');
      const activePips = PIP_LAYOUTS[faceValue] || [];
      pips.forEach((pip, i) => {
        pip.classList.toggle('hidden', !activePips.includes(i));
      });
    });

    // Rotate to show the correct face
    if (FACE_TRANSFORMS[value]) {
      diceEl.style.transform = FACE_TRANSFORMS[value];
    }

    // Update value display
    if (valueDisplay) {
      const colors = { 1:'#94a3b8', 2:'#94a3b8', 3:'#94a3b8', 4:'#94a3b8', 5:'#94a3b8', 6:'#f5c842' };
      valueDisplay.textContent = value === 6 ? '✨ SIX! ✨' : `rolled ${value}`;
      valueDisplay.style.color = colors[value] || '#f0f0ff';
    }
  }

  function roll(finalValue, onDone) {
    if (!diceEl) init();
    SoundEngine.play.diceRoll();
    diceEl.classList.add('rolling');

    // Flash through random values during roll
    let flashes = 0;
    const maxFlashes = 8;
    const interval = setInterval(() => {
      const rndVal = Math.floor(Math.random() * 6) + 1;
      if (diceEl && FACE_TRANSFORMS[rndVal]) {
        diceEl.style.transform = FACE_TRANSFORMS[rndVal];
      }
      flashes++;
      if (flashes >= maxFlashes) {
        clearInterval(interval);
        setTimeout(() => {
          diceEl.classList.remove('rolling');
          show(finalValue);
          if (finalValue === 6) SoundEngine.play.six();
          if (onDone) onDone();
        }, 200);
      }
    }, 60);
  }

  function reset() {
    if (valueDisplay) valueDisplay.textContent = '';
  }

  return { init, show, roll, reset };
})();

window.DiceUI = DiceUI;
