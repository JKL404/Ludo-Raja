// ============================================================
// LUDO BOARD CONSTANTS (15×15 grid, 0-indexed)
// ============================================================

// Colors in clockwise order
const COLORS = ['red', 'blue', 'green', 'yellow'];

// Main path: 52 cells [col, row], going clockwise
// Red enters at index 0, Blue at 13, Green at 26, Yellow at 39
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

// Entry positions on MAIN_PATH for each color (where a token enters on rolling 6)
const COLOR_ENTRY = { red: 0, blue: 13, green: 26, yellow: 39 };

// Home column entry: the main path INDEX after which a token enters the home column
// (token has traveled COLOR_HOME_ENTRY[color] steps from its entry to reach home column)
// Each color travels 50 steps from entry to reach the home column start
const COLOR_HOME_ENTRY_INDEX = {
  red:    (0 + 50) % 52,   // = 50 → pos 50 = [7,14] → home col goes UP col=7
  blue:   (13 + 50) % 52,  // = 11 → pos 11 = [0,7]  → home col goes RIGHT row=7
  green:  (26 + 50) % 52,  // = 24 → pos 24 = [7,0]  → home col goes DOWN col=7
  yellow: (39 + 50) % 52,  // = 37 → pos 37 = [14,7] → home col goes LEFT row=7
};

// Home columns: 6 cells each, index 0 = closest to main track, index 5 = home finish
// These go toward the center of the board
const HOME_COLUMNS = {
  red:    [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],      // col=7, going UP toward center
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],          // row=7, going RIGHT toward center
  green:  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],          // col=7, going DOWN toward center
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],      // row=7, going LEFT toward center
};

// Home column entry cell (on main path) for each color
const HOME_COL_ENTRY = {
  red:    [7,14],   // position 50 on main path
  blue:   [0,7],    // position 11 on main path
  green:  [7,0],    // position 24 on main path
  yellow: [14,7],   // position 37 on main path
};

// Safe squares (star positions) — tokens here cannot be captured
// These are at standard star positions on the board
const SAFE_POSITIONS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Starting yard positions (pixel-based centers within home areas) for each color's 4 tokens
// These are [col, row] within the 15×15 grid (centered symmetrically)
const YARD_POSITIONS = {
  red:    [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
  blue:   [[1.5, 1.5],  [3.5, 1.5],  [1.5, 3.5],  [3.5, 3.5]],
  green:  [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  yellow: [[10.5, 10.5],[12.5, 10.5],[10.5, 12.5],[12.5, 12.5]],
};

// Color of each home zone on the board
const HOME_ZONE_COLORS = {
  red:    { rows: [9,14], cols: [0,5] },
  blue:   { rows: [0,5],  cols: [0,5] },
  green:  { rows: [0,5],  cols: [9,14] },
  yellow: { rows: [9,14], cols: [9,14] },
};

// Starting token positions (for game init) — token starts in yard (position = -1)
const TOTAL_MAIN_PATH = 51;
const HOME_COL_LENGTH = 5;
const TOTAL_STEPS = TOTAL_MAIN_PATH + HOME_COL_LENGTH; // 56 steps from entry to home finish

module.exports = {
  COLORS,
  MAIN_PATH,
  COLOR_ENTRY,
  COLOR_HOME_ENTRY_INDEX,
  HOME_COLUMNS,
  HOME_COL_ENTRY,
  SAFE_POSITIONS,
  YARD_POSITIONS,
  HOME_ZONE_COLORS,
  TOTAL_MAIN_PATH,
  HOME_COL_LENGTH,
  TOTAL_STEPS,
};
