// ============================================================
// board.js — Canvas Ludo board renderer (theme-aware)
// ============================================================
const BoardRenderer = (() => {
  // ---- Path definition (52 cells) [col, row] ----
  const MAIN_PATH = [
    [1,13],[1,12],[1,11],[1,10],[1,9],[1,8],[1,7],[1,6],[1,5],[1,4],[1,3],[1,2],[1,1],
    [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[13,2],
    [13,3],[13,4],[13,5],[13,6],[13,7],[13,8],[13,9],[13,10],[13,11],[13,12],[13,13],[14,13],[14,14],
    [13,14],[12,14],[11,14],[10,14],[9,14],[8,14],[7,14],[6,14],[5,14],[4,14],[3,14],[2,14],[1,14],
  ];

  const HOME_COLUMNS = {
    red:    [[2,13],[2,12],[2,11],[2,10],[2,9],[2,8]],
    blue:   [[2,2],[3,2],[4,2],[5,2],[6,2],[7,2]],
    green:  [[12,2],[12,3],[12,4],[12,5],[12,6],[12,7]],
    yellow: [[12,12],[11,12],[10,12],[9,12],[8,12],[7,12]],
  };

  const YARD_POSITIONS = {
    red:    [[2,10],[4,10],[2,12],[4,12]],
    blue:   [[2,2],[4,2],[2,4],[4,4]],
    green:  [[10,2],[12,2],[10,4],[12,4]],
    yellow: [[10,10],[12,10],[10,12],[12,12]],
  };

  const COLOR_ENTRY = { red: 0, blue: 13, green: 26, yellow: 39 };

  // Star (safe) positions
  const SAFE_SET = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Home zone bounds [colMin,colMax,rowMin,rowMax]
  const HOME_ZONES = {
    red:    [0,5,9,14],
    blue:   [0,5,0,5],
    green:  [9,14,0,5],
    yellow: [9,14,9,14],
  };

  const TOKEN_COLORS = {
    red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  };
  const TOKEN_BORDER = {
    red: '#fca5a5', blue: '#93c5fd', green: '#86efac', yellow: '#fde047',
  };
  const HOME_BG = {
    red: 'rgba(239,68,68,0.25)', blue: 'rgba(59,130,246,0.25)',
    green: 'rgba(34,197,94,0.25)', yellow: 'rgba(234,179,8,0.25)',
  };
  const HOME_BG_CLASSIC = {
    red: 'rgba(192,57,43,0.35)', blue: 'rgba(41,128,185,0.35)',
    green: 'rgba(39,174,96,0.35)', yellow: 'rgba(243,156,18,0.35)',
  };

  const GRID = 15;
  let canvas, ctx, cellSize, theme = 'galaxy';
  let gameState = null;
  let myColor = null;
  let movableIds = [];
  let hoveredToken = null;
  let tokenAnimations = {}; // color+id → { x, y, targetX, targetY }

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
  function setState(state, mIds) {
    gameState  = state;
    movableIds = mIds || [];
    draw();
  }
  function setMyColor(c) { myColor = c; }

  // ---- Main draw ----
  function draw() {
    if (!ctx) return;
    cellSize = canvas.width / GRID;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _drawBoard();
    if (gameState) _drawTokens();
  }

  // ---- Board drawing ----
  function _drawBoard() {
    const c = cellSize;

    // Board background
    if (theme === 'classic') {
      const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bg.addColorStop(0, '#2c1a0a');
      bg.addColorStop(1, '#1a0e06');
      ctx.fillStyle = bg;
    } else {
      const bg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width*0.7);
      bg.addColorStop(0, '#0d0d2b');
      bg.addColorStop(1, '#060614');
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all 15×15 cells
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        _drawCell(col, row, c);
      }
    }

    // Draw home zones (colored corners)
    for (const [color, [cMin,cMax,rMin,rMax]] of Object.entries(HOME_ZONES)) {
      const x = cMin * c, y = rMin * c;
      const w = (cMax - cMin + 1) * c, h = (rMax - rMin + 1) * c;
      const bg = theme === 'classic' ? HOME_BG_CLASSIC[color] : HOME_BG[color];
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);

      // Inner yard circle
      ctx.save();
      ctx.fillStyle = TOKEN_COLORS[color];
      ctx.globalAlpha = 0.15;
      const cx = x + w/2, cy = y + h/2, r = Math.min(w,h) * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // Corner label
      const labels = { red:'R', blue:'B', green:'G', yellow:'Y' };
      ctx.save();
      ctx.font = `bold ${c * 0.7}px Rajdhani, sans-serif`;
      ctx.fillStyle = TOKEN_COLORS[color];
      ctx.globalAlpha = 0.3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[color], cx, cy);
      ctx.restore();
    }

    // Draw home columns
    for (const [color, cells] of Object.entries(HOME_COLUMNS)) {
      cells.forEach((cell, i) => {
        const x = cell[0] * c, y = cell[1] * c;
        const progress = (i + 1) / cells.length;
        ctx.fillStyle = TOKEN_COLORS[color];
        ctx.globalAlpha = 0.08 + progress * 0.25;
        ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
        ctx.globalAlpha = 1;
      });
    }

    // Center star / home finish
    _drawCenter(c);

    // Draw grid lines
    ctx.strokeStyle = theme === 'classic' ? 'rgba(212,160,23,0.15)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i*c, 0); ctx.lineTo(i*c, GRID*c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*c); ctx.lineTo(GRID*c, i*c); ctx.stroke();
    }

    // Draw safe star squares
    for (const pos of SAFE_SET) {
      const [col, row] = MAIN_PATH[pos];
      _drawStar(col * c + c/2, row * c + c/2, c * 0.28, theme === 'classic' ? '#d4a017' : '#a855f7');
    }

    // Draw entry markers (colored arrow indicator)
    for (const [color, idx] of Object.entries(COLOR_ENTRY)) {
      const [col, row] = MAIN_PATH[idx];
      ctx.save();
      ctx.fillStyle = TOKEN_COLORS[color];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(col*c + c/2, row*c + c/2, c*0.18, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function _drawCell(col, row, c) {
    // Path cells get a subtle highlight
    const isPath = MAIN_PATH.some(([pc, pr]) => pc === col && pr === row);
    if (!isPath) return;

    ctx.fillStyle = theme === 'classic'
      ? 'rgba(245,230,200,0.07)'
      : 'rgba(255,255,255,0.04)';
    ctx.fillRect(col*c + 0.5, row*c + 0.5, c - 1, c - 1);
  }

  function _drawCenter(c) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const r  = c * 1.5;

    // Background
    if (theme === 'galaxy') {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(168,85,247,0.4)');
      grad.addColorStop(0.5, 'rgba(236,72,153,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(212,160,23,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fill();

    // Draw 4 colored triangles pointing to center (home finish indicator)
    const colors = ['red','blue','green','yellow'];
    const angles = [Math.PI, Math.PI/2, 0, -Math.PI/2];
    colors.forEach((color, i) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angles[i]);
      ctx.fillStyle = TOKEN_COLORS[color];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r*0.6, r*0.9);
      ctx.lineTo(r*0.6, r*0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Star in the middle
    _drawStar(cx, cy, r * 0.4, theme === 'classic' ? '#d4a017' : '#ffffff');
  }

  function _drawStar(x, y, r, color) {
    const spikes = 5, outer = r, inner = r * 0.45;
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
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
  function _drawTokens() {
    if (!gameState?.tokens) return;
    const c = cellSize;
    const TOTAL_MAIN = 52, HOME_COL_LEN = 6, TOTAL_STEPS = TOTAL_MAIN + HOME_COL_LEN;

    for (const [color, tokens] of Object.entries(gameState.tokens)) {
      tokens.forEach((token, i) => {
        const cell = _getTokenCell(color, token.steps);
        let px, py;

        if (token.steps === -1) {
          // In yard
          const yard = YARD_POSITIONS[color];
          if (!yard || !yard[i]) return;
          px = yard[i][0] * c + c/2;
          py = yard[i][1] * c + c/2;
        } else if (token.steps >= TOTAL_STEPS) {
          return; // at home finish, don't draw (or draw in center)
        } else if (cell) {
          px = cell[0] * c + c/2;
          py = cell[1] * c + c/2;
        } else return;

        // Offset for multiple tokens on same cell
        const offset = _getOffset(color, i, token.steps);
        px += offset.x;
        py += offset.y;

        const isMovable = myColor === color && movableIds.includes(i) && gameState.phase === 'moving';
        const isHovered = hoveredToken && hoveredToken.color === color && hoveredToken.id === i;

        _drawToken(px, py, color, i, isMovable, isHovered, c);
      });
    }
  }

  function _drawToken(x, y, color, id, isMovable, isHovered, c) {
    const r = c * 0.3;

    ctx.save();

    // Glow for movable
    if (isMovable) {
      ctx.shadowColor = TOKEN_COLORS[color];
      ctx.shadowBlur  = 20;
    }

    // Pulsing scale for movable/hovered
    const scale = isMovable && isHovered ? 1.25 : isMovable ? 1.1 : 1;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = TOKEN_BORDER[color];
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r*0.2, -r*0.2, 0, 0, 0, r*0.75);
    grad.addColorStop(0, TOKEN_BORDER[color]);
    grad.addColorStop(1, TOKEN_COLORS[color]);
    ctx.fillStyle = grad;
    ctx.fill();

    // Token number
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${r * 0.8}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id + 1, 0, 0);

    // Movable indicator (bouncing dot above)
    if (isMovable) {
      const bounce = Math.sin(Date.now() / 200) * 3;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -r - 5 + bounce, 3, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function _getOffset(color, id, steps) {
    // Simple fixed offsets for up to 4 tokens on same cell
    const offsets = [
      {x: -5, y: -5}, {x: 5, y: -5},
      {x: -5, y: 5},  {x: 5, y: 5},
    ];
    return offsets[id % 4];
  }

  function _getTokenCell(color, steps) {
    const TOTAL_MAIN = 52, HOME_COL_LEN = 6, TOTAL_STEPS = TOTAL_MAIN + HOME_COL_LEN;
    if (steps < 0 || steps >= TOTAL_STEPS) return null;
    if (steps >= TOTAL_MAIN) {
      return HOME_COLUMNS[color][steps - TOTAL_MAIN] || null;
    }
    const entry = COLOR_ENTRY[color];
    return MAIN_PATH[(entry + steps) % TOTAL_MAIN];
  }

  // ---- Click/hover handling ----
  function _handleClick(e) {
    if (!gameState || gameState.phase !== 'moving' || !myColor) return;
    if (!movableIds.length) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const c  = cellSize;
    const TOTAL_MAIN = 52, TOTAL_STEPS = 58;

    const tokens = gameState.tokens[myColor];
    for (const id of movableIds) {
      const token = tokens[id];
      let px, py;
      if (token.steps === -1) {
        const yard = YARD_POSITIONS[myColor];
        px = yard[id][0] * c + c/2;
        py = yard[id][1] * c + c/2;
      } else {
        const cell = _getTokenCell(myColor, token.steps);
        if (!cell) continue;
        px = cell[0] * c + c/2;
        py = cell[1] * c + c/2;
      }
      const offset = _getOffset(myColor, id, token.steps);
      px += offset.x; py += offset.y;
      const dist = Math.sqrt((mx - px)**2 + (my - py)**2);
      if (dist < c * 0.4) {
        GameController.moveToken(id);
        return;
      }
    }
  }

  function _handleHover(e) {
    if (!gameState || gameState.phase !== 'moving' || !myColor) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const c  = cellSize;

    let found = null;
    const tokens = gameState.tokens[myColor];
    for (const id of movableIds) {
      const token = tokens[id];
      let px, py;
      if (token.steps === -1) {
        const yard = YARD_POSITIONS[myColor];
        px = yard[id][0] * c + c/2; py = yard[id][1] * c + c/2;
      } else {
        const cell = _getTokenCell(myColor, token.steps);
        if (!cell) continue;
        px = cell[0] * c + c/2; py = cell[1] * c + c/2;
      }
      const offset = _getOffset(myColor, id, token.steps);
      px += offset.x; py += offset.y;
      if (Math.sqrt((mx-px)**2 + (my-py)**2) < c * 0.4) { found = {color:myColor, id}; break; }
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
      if (movableIds.length > 0 && gameState?.phase === 'moving') draw();
      _animFrame = requestAnimationFrame(loop);
    }
    if (!_animFrame) loop();
  }
  function stopAnimLoop() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  }

  return { init, setTheme, setState, setMyColor, draw, startAnimLoop, stopAnimLoop, MAIN_PATH, HOME_COLUMNS, YARD_POSITIONS, COLOR_ENTRY };
})();

window.BoardRenderer = BoardRenderer;
