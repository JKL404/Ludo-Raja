// ============================================================
// board.js — Canvas Ludo board renderer (theme-aware)
// ============================================================
const BoardRenderer = (() => {
  // ---- Path definition (52 cells) [col, row] ----
  const MAIN_PATH = [
    // Bottom arm left side (going up)
    [6,13],[6,12],[6,11],[6,10],[6,9],
    // Left arm bottom side (going left)
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    // Left arm end (going up)
    [0,7],
    // Left arm top side (going right)
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],
    // Top arm left side (going up)
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    // Top arm end (going right)
    [7,0],
    // Top arm right side (going down)
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
    // Right arm top side (going right)
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    // Right arm end (going down)
    [14,7],
    // Right arm bottom side (going left)
    [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],
    // Bottom arm right side (going down)
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    // Bottom arm end (going left)
    [7,14],[6,14]
  ];

  const HOME_COLUMNS = {
    blue:   [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],      // col=7, going UP toward center
    red:    [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],          // row=7, going RIGHT toward center
    green:  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],          // col=7, going DOWN toward center
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],      // row=7, going LEFT toward center
  };

  const YARD_POSITIONS = {
    blue:   [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
    red:    [[1.5, 1.5],  [3.5, 1.5],  [1.5, 3.5],  [3.5, 3.5]],
    green:  [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
    yellow: [[10.5, 10.5],[12.5, 10.5],[10.5, 12.5],[12.5, 12.5]],
  };


  const COLOR_ENTRY = { blue: 0, red: 13, green: 26, yellow: 39 };

  // Star (safe) positions
  const SAFE_SET = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Home zone bounds [colMin,colMax,rowMin,rowMax]
  const HOME_ZONES = {
    blue:   [0,5,9,14],
    red:    [0,5,0,5],
    green:  [9,14,0,5],
    yellow: [9,14,9,14],
  };

  const TOKEN_COLORS = {
    red: '#d32f2f',     // Vibrant Classic Red
    blue: '#1976d2',    // Vibrant Classic Blue
    green: '#388e3c',   // Vibrant Classic Green
    yellow: '#fbc02d',  // Vibrant Classic Yellow
  };
  const TOKEN_BORDER = {
    red: '#ff8a80',     
    blue: '#82b1ff',
    green: '#b9f6ca',
    yellow: '#ffff8d',
  };
  const TOKEN_CENTER_CLASSIC = {
    red: '#ef5350',
    blue: '#42a5f5',
    green: '#66bb6a',
    yellow: '#ffee58',
  };
  const HOME_BG = {
    red: 'rgba(211,47,47,0.3)', blue: 'rgba(25,118,210,0.3)',
    green: 'rgba(56,142,60,0.3)', yellow: 'rgba(251,192,45,0.3)',
  };
  const HOME_BG_CLASSIC = {
    red: '#d32f2f', blue: '#1976d2',
    green: '#388e3c', yellow: '#fbc02d',
  };

  const GRID = 15;
  let canvas, ctx, cellSize, theme = 'galaxy';
  let gameState = null;
  let myColor = null;
  let movableIds = [];
  let hoveredToken = null;
  let animatingToken = null; // { color, id, fromX, fromY, toX, toY, startTime, duration }
  let displaySteps = {};
  let isAnimating = false;

  function _syncDisplaySteps() {
    displaySteps = {};
    if (!gameState?.tokens) return;
    for (const [color, tokens] of Object.entries(gameState.tokens)) {
      tokens.forEach((token, id) => {
        displaySteps[`${color}_${id}`] = token.steps;
      });
    }
  }

  function _getScreenCoords(boardX, boardY) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const angle = _getViewRotationAngle();
    
    let rx = boardX;
    let ry = boardY;
    if (angle !== 0) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const dx = boardX - cx;
      const dy = boardY - cy;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      rx = cx + dx * cos - dy * sin;
      ry = cy + dx * sin + dy * cos;
    }
    
    return {
      x: rect.left + rx * (rect.width / canvas.width),
      y: rect.top + ry * (rect.height / canvas.height)
    };
  }

  function _animateTokenMove(color, id, from, to, captured, reachedHome, onComplete) {
    isAnimating = true;
    let current = from;
    
    // Play initial sound if entering board from yard
    if (from === -1 && to >= 0) {
      if (window.SoundEngine) window.SoundEngine.play.enterBoard();
      // Entry burst
      setTimeout(() => {
        const cell = _getTokenCell(color, 0);
        if (cell) {
          const c = cellSize;
          const pos = _getScreenCoords(cell[0] * c + c/2, cell[1] * c + c/2);
          if (window.ParticleSystem) {
            window.ParticleSystem.spawnBurst(pos.x, pos.y, color, 'normal');
          }
        }
      }, 50);
    }

    function nextStep() {
      if (current >= to) {
        _syncDisplaySteps();
        isAnimating = false;
        animatingToken = null;
        
        let finalCell = _getTokenCell(color, to);
        let screenPos = null;
        if (finalCell) {
          const c = cellSize;
          screenPos = _getScreenCoords(finalCell[0] * c + c/2, finalCell[1] * c + c/2);
        } else if (to === -1) {
          const yard = YARD_POSITIONS[color];
          if (yard && yard[id]) {
            const c = cellSize;
            screenPos = _getScreenCoords(yard[id][0] * c + c/2, yard[id][1] * c + c/2);
          }
        }

        if (captured) {
          if (window.SoundEngine) window.SoundEngine.play.capture();
          if (screenPos && window.ParticleSystem) {
            window.ParticleSystem.spawnBurst(screenPos.x, screenPos.y, color, 'high');
          }
        } else if (reachedHome) {
          if (window.SoundEngine) window.SoundEngine.play.enterHome();
          if (screenPos && window.ParticleSystem) {
            window.ParticleSystem.spawnBurst(screenPos.x, screenPos.y, color, 'high');
          }
        } else {
          if (screenPos && window.ParticleSystem) {
            window.ParticleSystem.spawnBurst(screenPos.x, screenPos.y, color, 'normal');
          }
        }
        
        draw();
        if (onComplete) onComplete();
        return;
      }
      
      const stepDuration = 180;
      const fromStep = current;
      current++;
      const toStep = current;
      displaySteps[`${color}_${id}`] = toStep;
      
      const fromCoords = _getCellCenterCoords(color, id, fromStep);
      const toCoords = _getCellCenterCoords(color, id, toStep);
      
      if (fromCoords && toCoords) {
        animatingToken = {
          color,
          id,
          fromX: fromCoords.x,
          fromY: fromCoords.y,
          toX: toCoords.x,
          toY: toCoords.y,
          startTime: Date.now(),
          duration: stepDuration
        };
      } else {
        animatingToken = null;
      }

      if (toCoords && window.ParticleSystem) {
        const screenPos = _getScreenCoords(toCoords.x, toCoords.y);
        window.ParticleSystem.spawnTrail(screenPos.x, screenPos.y, TOKEN_COLORS[color] || '#ffffff');
      }
      
      // Play tick sound per step
      if (!(from === -1 && current === 0)) {
        if (window.SoundEngine) window.SoundEngine.play.tokenMove();
      }
      
      draw();
      setTimeout(nextStep, stepDuration);
    }
    
    nextStep();
  }

  // Helper to convert hex to rgb for opacity adjustments in Galaxy theme
  function _hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result
      ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16)
      : '255,255,255';
  }

  // Draw arrow on cell
  function _drawArrow(cx, cy, size, direction, color) {
    ctx.save();
    ctx.translate(cx, cy);
    if (direction === 'up') ctx.rotate(-Math.PI / 2);
    else if (direction === 'down') ctx.rotate(Math.PI / 2);
    else if (direction === 'left') ctx.rotate(Math.PI);
    // direction 'right' has rotation 0

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-size * 0.25, -size * 0.15);
    ctx.lineTo(size * 0.05, -size * 0.15);
    ctx.lineTo(size * 0.05, -size * 0.3);
    ctx.lineTo(size * 0.35, 0);
    ctx.lineTo(size * 0.05, size * 0.3);
    ctx.lineTo(size * 0.05, size * 0.15);
    ctx.lineTo(-size * 0.25, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- Init ----
  function init(canvasEl, themeStr) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    theme  = themeStr || 'galaxy';
    cellSize = canvas.width / GRID;
    canvas.addEventListener('click', _handleClick);
    canvas.addEventListener('mousemove', _handleHover);
    draw();
  }

  function setTheme(t) { theme = t; draw(); }
  function setState(state, mIds, options = {}) {
    const oldState = gameState;
    gameState  = state;
    movableIds = mIds || [];

    if (options.animate && oldState && oldState.tokens) {
      // Find which token moved
      let movingToken = null;
      for (const color of Object.keys(state.tokens)) {
        for (let id = 0; id < state.tokens[color].length; id++) {
          const oldSteps = oldState.tokens[color][id].steps;
          const newSteps = state.tokens[color][id].steps;
          if (newSteps > oldSteps) {
            movingToken = { color, id, from: oldSteps, to: newSteps };
            break;
          }
        }
        if (movingToken) break;
      }

      if (movingToken) {
        // Sync displaySteps to oldState first
        displaySteps = {};
        for (const [color, tokens] of Object.entries(oldState.tokens)) {
          tokens.forEach((token, id) => {
            displaySteps[`${color}_${id}`] = token.steps;
          });
        }

        // Run animation
        _animateTokenMove(
          movingToken.color,
          movingToken.id,
          movingToken.from,
          movingToken.to,
          options.captured,
          options.reachedHome,
          options.onComplete
        );
        return;
      }
    }

    animatingToken = null;
    _syncDisplaySteps();
    draw();
    if (options.onComplete) options.onComplete();
  }
  function _getViewRotationAngle() {
    if (!myColor) return 0;
    switch (myColor) {
      case 'blue': return 0;
      case 'red': return -Math.PI / 2;
      case 'green': return Math.PI;
      case 'yellow': return Math.PI / 2;
      default: return 0;
    }
  }

  function _unrotatePoint(x, y, angle) {
    if (angle === 0) return { x, y };
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  function setMyColor(c) { myColor = c; }

  // ---- Main draw ----
  function draw() {
    if (!ctx) return;
    cellSize = canvas.width / GRID;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const angle = _getViewRotationAngle();
    if (angle !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.translate(-centerX, -centerY);
    }

    _drawBoard();
    if (gameState) _drawTokens();

    ctx.restore();
  }

  // ---- Board drawing ----
  function _drawBoard() {
    const c = cellSize;

    // 1. Board background
    if (theme === 'classic') {
      ctx.fillStyle = '#fdfaf2'; // Warm, rich cream/ivory board base
    } else {
      const bg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width*0.7);
      bg.addColorStop(0, '#0d0d2b');
      bg.addColorStop(1, '#050512');
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Quadrants (Home Zones)
    for (const [color, [cMin,cMax,rMin,rMax]] of Object.entries(HOME_ZONES)) {
      const x = cMin * c, y = rMin * c;
      const w = (cMax - cMin + 1) * c, h = (rMax - rMin + 1) * c;

      ctx.save();
      const isCurrentTurn = gameState && gameState.currentColor === color && gameState.phase !== 'finished';
      if (theme === 'classic') {
        // Crisp, solid square for classic yard
        ctx.fillStyle = TOKEN_COLORS[color];
        ctx.fillRect(x, y, w, h);
        
        if (isCurrentTurn) {
          const pulse = Math.abs(Math.sin(Date.now() / 200));
          ctx.strokeStyle = '#ffd700'; // gold active border
          ctx.lineWidth = 4 + pulse * 2.5;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 8 + pulse * 10;
        } else {
          ctx.strokeStyle = '#5d4037';
          ctx.lineWidth = 3;
        }
        ctx.strokeRect(x, y, w, h);
      } else {
        // Frosted glowing panel for galaxy yard
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        if (isCurrentTurn) {
          grad.addColorStop(0, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.32)');
          grad.addColorStop(1, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.16)');
        } else {
          grad.addColorStop(0, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.18)');
          grad.addColorStop(1, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.06)');
        }
        ctx.fillStyle = grad;
        ctx.strokeStyle = TOKEN_COLORS[color];
        
        if (isCurrentTurn) {
          const pulse = Math.abs(Math.sin(Date.now() / 150));
          ctx.lineWidth = 3.5 + pulse * 2.0;
          ctx.shadowColor = TOKEN_COLORS[color];
          ctx.shadowBlur = 20 + pulse * 20;
        } else {
          ctx.lineWidth = 2.5;
          ctx.shadowColor = TOKEN_COLORS[color];
          ctx.shadowBlur = 15;
        }
        
        ctx.beginPath();
        ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 16);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Draw Yard Box in center of quadrant
      const boxW = 4 * c, boxH = 4 * c;
      const boxX = x + c, boxY = y + c;

      ctx.save();
      if (theme === 'classic') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(5, 5, 15, 0.85)';
        ctx.strokeStyle = 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Draw Pockets inside Yard Box
      const yard = YARD_POSITIONS[color];
      yard.forEach(([px, py]) => {
        const cx = px * c + c/2;
        const cy = py * c + c/2;
        const r = c * 0.36;

        ctx.save();
        if (theme === 'classic') {
          // Recessed tactile yard pocket cup
          ctx.fillStyle = '#f5eedc'; // Slightly darker cream than board for the pocket background
          ctx.strokeStyle = '#5d4037'; // Walnut wood border
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Inner colored accent ring
          ctx.strokeStyle = TOKEN_COLORS[color];
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
          ctx.stroke();

          // Recessed center hole with shadow gradient
          const holeGrad = ctx.createRadialGradient(cx - r*0.1, cy - r*0.1, 0, cx, cy, r * 0.42);
          holeGrad.addColorStop(0, '#4e342e'); // Deep wood shadow
          holeGrad.addColorStop(1, TOKEN_COLORS[color]); // Accent base
          ctx.fillStyle = holeGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.strokeStyle = TOKEN_COLORS[color];
          ctx.lineWidth = 2;
          ctx.shadowColor = TOKEN_COLORS[color];
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = TOKEN_COLORS[color];
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Large watermark label in center
      const labels = { red: 'R', blue: 'B', green: 'G', yellow: 'Y' };
      ctx.save();
      ctx.font = `bold ${c * 1.8}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = TOKEN_COLORS[color];
      ctx.globalAlpha = theme === 'classic' ? 0.09 : 0.15;
      ctx.fillText(labels[color], boxX + boxW/2, boxY + boxH/2);
      ctx.restore();
    }

    // 3. Draw Center Finish Triangles
    _drawCenter(c);

    // 4. Draw Path Cells (52 cells)
    MAIN_PATH.forEach((cell, idx) => {
      const col = cell[0], row = cell[1];
      const x = col * c, y = row * c;

      let bg = '';
      let stroke = '';
      let drawArrowDirection = null;

      // Check if starting cell (standard layout coordinates)
      const isRedStart = col === 6 && row === 13;
      const isBlueStart = col === 1 && row === 6;
      const isGreenStart = col === 8 && row === 1;
      const isYellowStart = col === 13 && row === 8;

      if (isRedStart) { bg = TOKEN_COLORS.red; drawArrowDirection = 'up'; }
      else if (isBlueStart) { bg = TOKEN_COLORS.blue; drawArrowDirection = 'right'; }
      else if (isGreenStart) { bg = TOKEN_COLORS.green; drawArrowDirection = 'down'; }
      else if (isYellowStart) { bg = TOKEN_COLORS.yellow; drawArrowDirection = 'left'; }
      // Check if other safe cell
      else if (SAFE_SET.has(idx)) {
        bg = theme === 'classic' ? '#ffe082' : 'rgba(6, 182, 212, 0.2)';
        stroke = theme === 'classic' ? '#f57f17' : '#06b6d4';
      } else {
        bg = theme === 'classic' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)';
        stroke = theme === 'classic' ? '#8d6e63' : 'rgba(168, 85, 247, 0.22)';
      }

      ctx.save();
      ctx.fillStyle = bg;
      ctx.fillRect(x + 1, y + 1, c - 2, c - 2);

      ctx.strokeStyle = stroke || (theme === 'classic' ? '#8d6e63' : 'rgba(255, 255, 255, 0.15)');
      ctx.lineWidth = theme === 'classic' ? 1.8 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
      ctx.restore();

      if (drawArrowDirection) {
        _drawArrow(x + c/2, y + c/2, c, drawArrowDirection, '#ffffff');
      }
    });

    // 5. Draw Home Columns (5 cells each on the path, leading to center)
    for (const [color, cells] of Object.entries(HOME_COLUMNS)) {
      cells.forEach((cell, i) => {
        // The 6th cell is inside the center, draw only first 5 in the columns
        if (i === 5) return;
        const x = cell[0] * c, y = cell[1] * c;

        ctx.save();
        if (theme === 'classic') {
          ctx.fillStyle = TOKEN_COLORS[color];
          ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
          ctx.strokeStyle = '#8d6e63';
          ctx.lineWidth = 1.8;
          ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
        } else {
          const grad = ctx.createLinearGradient(x, y, x + c, y + c);
          grad.addColorStop(0, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.6)');
          grad.addColorStop(1, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.25)');
          ctx.fillStyle = grad;
          ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
          ctx.strokeStyle = TOKEN_COLORS[color];
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
        }
        ctx.restore();
      });
    }

    // 6. Draw stars on safe cells (excluding starting spaces which have arrows)
    for (const pos of SAFE_SET) {
      if (pos === 0 || pos === 13 || pos === 26 || pos === 39) continue;
      const [col, row] = MAIN_PATH[pos];
      _drawStar(col * c + c/2, row * c + c/2, c * 0.28, theme === 'classic' ? '#f57f17' : '#06b6d4');
    }
  }

  function _drawCell(col, row, c) {
  }

  function _drawCenter(c) {
    const cx = 7.5 * c, cy = 7.5 * c;
    const xMin = 6 * c, xMax = 9 * c;
    const yMin = 6 * c, yMax = 9 * c;

    // Draw the 4 colored triangles meeting at the center
    const triangles = {
      blue:   [[xMin, yMin], [cx, cy], [xMin, yMax]], // Left
      green:  [[xMin, yMin], [cx, cy], [xMax, yMin]], // Top
      yellow: [[xMax, yMin], [cx, cy], [xMax, yMax]], // Right
      red:    [[xMin, yMax], [cx, cy], [xMax, yMax]], // Bottom
    };

    for (const [color, pts] of Object.entries(triangles)) {
      ctx.save();
      if (theme === 'classic') {
        ctx.fillStyle = TOKEN_COLORS[color];
        ctx.globalAlpha = 1.0;
      } else {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, c * 1.5);
        grad.addColorStop(0, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.65)');
        grad.addColorStop(1, 'rgba(' + _hexToRgb(TOKEN_COLORS[color]) + ', 0.3)');
        ctx.fillStyle = grad;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Center borders & diagonals
    ctx.save();
    ctx.strokeStyle = theme === 'classic' ? '#5d4037' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = theme === 'classic' ? 2.5 : 1.5;

    ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);

    ctx.beginPath();
    ctx.moveTo(xMin, yMin); ctx.lineTo(xMax, yMax);
    ctx.moveTo(xMax, yMin); ctx.lineTo(xMin, yMax);
    ctx.stroke();
    ctx.restore();

    // Center star
    _drawStar(cx, cy, c * 0.45, '#ffffff');
  }


  function _drawStar(x, y, r, color) {
    const spikes = 5, outer = r, inner = r * 0.45;
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer); rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner); rot += step;
    }
    ctx.lineTo(x, y - outer);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- Token drawing ----
  let tokenLayoutMap = {};

  function _updateTokenLayouts() {
    tokenLayoutMap = {};
    if (!gameState?.tokens) return;
    const c = cellSize;
    const TOTAL_MAIN = 51, HOME_COL_LEN = 5, TOTAL_STEPS = TOTAL_MAIN + HOME_COL_LEN;

    // Group active tokens by cell key: "col,row"
    const cellGroups = {};

    for (const [color, tokens] of Object.entries(gameState.tokens)) {
      tokens.forEach((token, id) => {
        const steps = displaySteps[`${color}_${id}`] !== undefined ? displaySteps[`${color}_${id}`] : token.steps;
        if (steps === -1) {
          // Yard tokens are placed in pockets, no overlap
          const yard = YARD_POSITIONS[color];
          if (yard && yard[id]) {
            const px = yard[id][0] * c + c/2;
            const py = yard[id][1] * c + c/2;
            tokenLayoutMap[`${color}_${id}`] = { x: px, y: py, scale: 1.0 };
          }
        } else if (steps >= 0 && steps < TOTAL_STEPS) {
          const cell = _getTokenCell(color, steps);
          if (cell) {
            const key = `${cell[0]},${cell[1]}`;
            if (!cellGroups[key]) cellGroups[key] = [];
            cellGroups[key].push({ color, id, steps: steps });
          }
        }
      });
    }

    // Calculate position and scale for each cell group
    for (const [key, group] of Object.entries(cellGroups)) {
      const [col, row] = key.split(',').map(Number);
      const cx = col * c + c/2;
      const cy = row * c + c/2;

      const count = group.length;
      if (count === 1) {
        // Center perfectly
        const t = group[0];
        tokenLayoutMap[`${t.color}_${t.id}`] = { x: cx, y: cy, scale: 1.0 };
      } else if (count === 2) {
        // Two tokens: placed diagonally
        const tScale = 0.76;
        const offset = c * 0.17;
        tokenLayoutMap[`${group[0].color}_${group[0].id}`] = { x: cx - offset, y: cy - offset, scale: tScale };
        tokenLayoutMap[`${group[1].color}_${group[1].id}`] = { x: cx + offset, y: cy + offset, scale: tScale };
      } else if (count === 3) {
        // Three tokens: triangular layout
        const tScale = 0.66;
        const offset = c * 0.18;
        tokenLayoutMap[`${group[0].color}_${group[0].id}`] = { x: cx, y: cy - offset, scale: tScale };
        tokenLayoutMap[`${group[1].color}_${group[1].id}`] = { x: cx - offset, y: cy + offset * 0.6, scale: tScale };
        tokenLayoutMap[`${group[2].color}_${group[2].id}`] = { x: cx + offset, y: cy + offset * 0.6, scale: tScale };
      } else {
        // Four or more tokens: quadrant layout
        const tScale = 0.58;
        const offset = c * 0.2;
        const offsets = [
          {x: -offset, y: -offset},
          {x: offset, y: -offset},
          {x: -offset, y: offset},
          {x: offset, y: offset}
        ];
        group.forEach((t, idx) => {
          const off = offsets[idx % 4];
          const stack = idx >= 4 ? Math.floor(idx / 4) * 2 : 0;
          tokenLayoutMap[`${t.color}_${t.id}`] = { x: cx + off.x + stack, y: cy + off.y + stack, scale: tScale };
        });
      }
    }
  }

  function _drawTokens() {
    if (!gameState?.tokens) return;
    _updateTokenLayouts();

    for (const [color, tokens] of Object.entries(gameState.tokens)) {
      tokens.forEach((token, i) => {
        const layout = tokenLayoutMap[`${color}_${i}`];
        if (!layout) return;

        let drawX = layout.x;
        let drawY = layout.y;
        let drawScale = layout.scale;

        if (animatingToken && animatingToken.color === color && animatingToken.id === i) {
          const elapsed = Date.now() - animatingToken.startTime;
          const progress = Math.min(1.0, elapsed / animatingToken.duration);
          const bounce = Math.sin(progress * Math.PI) * cellSize * 0.45;
          
          drawX = animatingToken.fromX + (animatingToken.toX - animatingToken.fromX) * progress;
          drawY = animatingToken.fromY + (animatingToken.toY - animatingToken.fromY) * progress - bounce;
          drawScale = 1.05;
        }

        const isMovable = myColor === color && movableIds.includes(i) && gameState.phase === 'moving';
        const isHovered = hoveredToken && hoveredToken.color === color && hoveredToken.id === i;

        _drawToken(drawX, drawY, color, i, isMovable, isHovered, cellSize, drawScale);
      });
    }
  }

  function _drawToken(x, y, color, id, isMovable, isHovered, c, tokenScale = 1.0) {
    const r = c * 0.28;

    ctx.save();

    // 1. Aura / Active pulsing glow ring at the base of the cell
    if (isMovable) {
      ctx.save();
      // Ensure no global shadows affect the custom multi-layered glow
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      
      const auraScale = 1.0 + Math.sin(Date.now() / 150) * 0.12;
      const baseColor = TOKEN_COLORS[color] || '#ffffff';
      
      // Outer soft ring
      ctx.strokeStyle = `rgba(${_hexToRgb(baseColor)}, 0.45)`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.6, r * 1.15 * auraScale, r * 0.35 * auraScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner crisp ring
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.6, r * 0.9 * auraScale, r * 0.27 * auraScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
    }

    // 2. Base Contact Drop Shadow
    ctx.fillStyle = 'rgba(5, 5, 18, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.72, r * 0.88, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing scale for movable/hovered, scaled by tokenScale
    const scale = (isMovable && isHovered ? 1.25 : isMovable ? 1.1 : 1) * tokenScale;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const angle = _getViewRotationAngle();
    if (angle !== 0) {
      ctx.rotate(-angle);
    }

    // --- PAWN RENDERING ---

    // 1. Base Stand (Beveled edge)
    const rimColor = theme === 'classic' ? '#3e2723' : `rgba(${_hexToRgb(TOKEN_BORDER[color])}, 0.85)`;
    ctx.fillStyle = rimColor;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.6, r * 0.78, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    
    const baseGrad = ctx.createLinearGradient(-r * 0.75, r * 0.6, r * 0.75, r * 0.6);
    if (theme === 'classic') {
      baseGrad.addColorStop(0, '#5d4037');
      baseGrad.addColorStop(0.3, TOKEN_COLORS[color]);
      baseGrad.addColorStop(0.7, TOKEN_COLORS[color]);
      baseGrad.addColorStop(1, '#3e2723');
    } else {
      baseGrad.addColorStop(0, TOKEN_BORDER[color]);
      baseGrad.addColorStop(0.4, TOKEN_COLORS[color]);
      baseGrad.addColorStop(0.8, '#0b0b1e');
    }
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.6, r * 0.74, r * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Body of Pawn
    const bodyColor = theme === 'classic' ? '#3e2723' : `rgba(${_hexToRgb(TOKEN_BORDER[color])}, 0.65)`;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-r * 0.58, r * 0.5);
    ctx.quadraticCurveTo(-r * 0.29, r * 0.15, -r * 0.19, -r * 0.05);
    ctx.lineTo(r * 0.19, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.29, r * 0.15, r * 0.58, r * 0.5);
    ctx.closePath();
    ctx.fill();
    
    const bodyGrad = ctx.createLinearGradient(-r * 0.55, 0, r * 0.55, 0);
    if (theme === 'classic') {
      bodyGrad.addColorStop(0, TOKEN_CENTER_CLASSIC[color]);
      bodyGrad.addColorStop(0.3, TOKEN_COLORS[color]);
      bodyGrad.addColorStop(1, '#3e2723');
    } else {
      bodyGrad.addColorStop(0, TOKEN_BORDER[color]);
      bodyGrad.addColorStop(0.3, TOKEN_COLORS[color]);
      bodyGrad.addColorStop(0.8, '#0b0b1e');
    }
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.53, r * 0.5);
    ctx.quadraticCurveTo(-r * 0.27, r * 0.15, -r * 0.17, -r * 0.05);
    ctx.lineTo(r * 0.17, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.27, r * 0.15, r * 0.53, r * 0.5);
    ctx.closePath();
    ctx.fill();

    // 3. Neck Collar Ring
    ctx.fillStyle = theme === 'classic' ? '#3e2723' : `rgba(${_hexToRgb(TOKEN_BORDER[color])}, 0.85)`;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.24, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    const collarGrad = ctx.createLinearGradient(-r * 0.22, 0, r * 0.22, 0);
    if (theme === 'classic') {
      collarGrad.addColorStop(0, '#fff3a8');
      collarGrad.addColorStop(0.4, '#ffd700'); // Gold ring
      collarGrad.addColorStop(1, '#9e7815');
    } else {
      collarGrad.addColorStop(0, '#ffffff');
      collarGrad.addColorStop(0.5, TOKEN_BORDER[color]);
      collarGrad.addColorStop(1, '#0b0b1e');
    }
    ctx.fillStyle = collarGrad;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.21, r * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Head Sphere
    const headRadius = r * 0.44;
    const headY = -r * 0.48;
    
    ctx.fillStyle = theme === 'classic' ? '#3e2723' : `rgba(${_hexToRgb(TOKEN_BORDER[color])}, 0.85)`;
    ctx.beginPath();
    ctx.arc(0, headY, headRadius + 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    const headGrad = ctx.createRadialGradient(-headRadius * 0.28, headY - headRadius * 0.28, 0, 0, headY, headRadius);
    if (theme === 'classic') {
      headGrad.addColorStop(0, '#ffffff'); // shiny spec
      headGrad.addColorStop(0.2, TOKEN_CENTER_CLASSIC[color]);
      headGrad.addColorStop(0.85, TOKEN_COLORS[color]);
      headGrad.addColorStop(1, '#3e2723');
    } else {
      headGrad.addColorStop(0, '#ffffff'); // glassy highlight
      headGrad.addColorStop(0.2, TOKEN_BORDER[color]);
      headGrad.addColorStop(0.8, TOKEN_COLORS[color]);
      headGrad.addColorStop(1, '#0b0b1e');
    }
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // 5. Specular Gloss Overlay (Glass finish)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.ellipse(-headRadius * 0.22, headY - headRadius * 0.22, headRadius * 0.35, headRadius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // 6. Token Number Text
    ctx.font = `bold ${headRadius * 1.05}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Soft shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillText(id + 1, 0, headY + 1);
    
    // Main text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(id + 1, 0, headY);

    // 7. Active diamond bounce floating indicator
    if (isMovable) {
      const bounce = Math.sin(Date.now() / 150) * 4;
      const dSize = 4.5;
      const dy = headY - headRadius - 10 + bounce;
      
      ctx.save();
      ctx.translate(0, dy);
      ctx.rotate(Math.PI / 4); // diamond
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-dSize, -dSize, dSize * 2, dSize * 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function _getTokenCell(color, steps) {
    const TOTAL_MAIN = 51, HOME_COL_LEN = 5, TOTAL_STEPS = TOTAL_MAIN + HOME_COL_LEN;
    if (steps < 0 || steps >= TOTAL_STEPS) return null;
    if (steps >= TOTAL_MAIN) {
      return HOME_COLUMNS[color][steps - TOTAL_MAIN] || null;
    }
    const entry = COLOR_ENTRY[color];
    return MAIN_PATH[(entry + steps) % MAIN_PATH.length];
  }

  function _getCellCenterCoords(color, id, steps) {
    const c = cellSize;
    if (steps === -1) {
      const yard = YARD_POSITIONS[color];
      if (yard && yard[id]) {
        return { x: yard[id][0] * c + c/2, y: yard[id][1] * c + c/2 };
      }
    }
    const cell = _getTokenCell(color, steps);
    if (cell) {
      return { x: cell[0] * c + c/2, y: cell[1] * c + c/2 };
    }
    return null;
  }

  // ---- Click/hover handling ----
  function _handleClick(e) {
    if (isAnimating) return;
    if (!gameState || gameState.phase !== 'moving' || !myColor) return;
    if (!movableIds.length) return;

    const rect = canvas.getBoundingClientRect();
    const physX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const physY = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const angle = _getViewRotationAngle();
    const { x: mx, y: my } = _unrotatePoint(physX, physY, angle);
    const c  = cellSize;

    _updateTokenLayouts();

    for (const id of movableIds) {
      const layout = tokenLayoutMap[`${myColor}_${id}`];
      if (!layout) continue;

      const dist = Math.sqrt((mx - layout.x)**2 + (my - layout.y)**2);
      if (dist < c * 0.4 * layout.scale) {
        GameController.moveToken(id);
        return;
      }
    }
  }

  function _handleHover(e) {
    if (isAnimating) return;
    if (!gameState || gameState.phase !== 'moving' || !myColor) return;
    const rect = canvas.getBoundingClientRect();
    const physX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const physY = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const angle = _getViewRotationAngle();
    const { x: mx, y: my } = _unrotatePoint(physX, physY, angle);
    const c  = cellSize;

    _updateTokenLayouts();

    let found = null;
    for (const id of movableIds) {
      const layout = tokenLayoutMap[`${myColor}_${id}`];
      if (!layout) continue;

      const dist = Math.sqrt((mx - layout.x)**2 + (my - layout.y)**2);
      if (dist < c * 0.4 * layout.scale) {
        found = {color: myColor, id};
        break;
      }
    }

    if (JSON.stringify(found) !== JSON.stringify(hoveredToken)) {
      hoveredToken = found;
      canvas.style.cursor = found ? 'pointer' : 'default';
      draw();
    }
  }

  // Animation loop for movable token pulse
  let _animFrame = null;
  function startAnimLoop() {
    function loop() {
      if (gameState && gameState.phase !== 'finished') draw();
      _animFrame = requestAnimationFrame(loop);
    }
    if (!_animFrame) loop();
  }
  function stopAnimLoop() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  }

  return { init, setTheme, setState, setMyColor, draw, startAnimLoop, stopAnimLoop, isAnimating: () => isAnimating, MAIN_PATH, HOME_COLUMNS, YARD_POSITIONS, COLOR_ENTRY };
})();

window.BoardRenderer = BoardRenderer;
