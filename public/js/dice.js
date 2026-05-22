// ============================================================
// dice.js — 3D CSS dice display controller
// ============================================================
const DiceUI = (() => {
  // pip layouts per face value (3×3 grid positions, 0-8)
  const PIP_LAYOUTS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
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

  // Base rotation angles for calculation
  const FACE_ROTATIONS = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: 180 },
    3: { x: 0, y: -90 },
    4: { x: 0, y: 90 },
    5: { x: -90, y: 0 },
    6: { x: 90, y: 0 }
  };

  let diceEl, valueDisplay;
  let currentRotX = 0;
  let currentRotY = 0;

  function init() {
    diceEl       = document.getElementById('dice-3d');
    valueDisplay = document.getElementById('dice-value-display');
  }

  function show(value, playerName, skipTransform = false) {
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
    if (!skipTransform && FACE_TRANSFORMS[value]) {
      const rot = FACE_ROTATIONS[value] || { x: 0, y: 0 };
      currentRotX = rot.x;
      currentRotY = rot.y;
      diceEl.style.transform = FACE_TRANSFORMS[value];
    }

    // Update value display
    if (valueDisplay) {
      const prefix = playerName ? `${playerName} ` : '';
      valueDisplay.innerHTML = value === 6
        ? `✨ ${prefix}rolled a <span class="rolled-num rolled-six">SIX</span>! ✨`
        : `${prefix}rolled <span class="rolled-num rolled-${value}">${value}</span>`;
      valueDisplay.style.color = '#f0f0ff';
    }
  }

  function roll(finalValue, playerName, onDone) {
    if (!diceEl) init();
    if (valueDisplay) {
      valueDisplay.textContent = 'Rolling...';
      valueDisplay.style.color = '#94a3b8';
    }
    SoundEngine.play.diceRoll();

    // Calculate cumulative rotation to spin the dice
    const targetRot = FACE_ROTATIONS[finalValue] || { x: 0, y: 0 };
    const spinsX = 720; // 2 full spins
    const spinsY = 720; // 2 full spins

    const diffX = ((targetRot.x - (currentRotX % 360)) + 360) % 360;
    currentRotX = currentRotX + spinsX + diffX;

    const diffY = ((targetRot.y - (currentRotY % 360)) + 360) % 360;
    currentRotY = currentRotY + spinsY + diffY;

    // Perform CSS transition by setting cumulative transform directly
    diceEl.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;

    // Wait for the transition duration (600ms)
    setTimeout(() => {
      show(finalValue, playerName, true); // skip resetting transform to base
      if (finalValue === 6) SoundEngine.play.six();
      if (onDone) onDone();
    }, 600);
  }

  function reset() {
    if (valueDisplay) valueDisplay.textContent = '';
  }

  return { init, show, roll, reset };
})();

window.DiceUI = DiceUI;
