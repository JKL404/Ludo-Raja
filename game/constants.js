// ============================================================
// LUDO BOARD CONSTANTS (15×15 grid, 0-indexed)
// ============================================================

// Colors in clockwise order
const COLORS = ['red', 'blue', 'green', 'yellow'];

// Main path: 52 cells [col, row], going clockwise
// Red enters at index 0, Blue at 13, Green at 26, Yellow at 39
const MAIN_PATH = [
  // Segment 1: UP left side, col=1, rows 13→1 (through Red home + left arm + Blue home left edge)
  [1,13],[1,12],[1,11],[1,10],[1,9],[1,8],[1,7],[1,6],[1,5],[1,4],[1,3],[1,2],[1,1],
  // Segment 2: RIGHT along row=1 (through Blue home bottom + top arm + Green home bottom), then one step DOWN
  [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[13,2],
  // Segment 3: DOWN col=13, rows 3→13 (through Green home right edge + right arm + Yellow home right edge), then RIGHT+DOWN corner
  [13,3],[13,4],[13,5],[13,6],[13,7],[13,8],[13,9],[13,10],[13,11],[13,12],[13,13],[14,13],[14,14],
  // Segment 4: LEFT along row=14 (through Yellow home bottom + bottom arm + Red home bottom)
  [13,14],[12,14],[11,14],[10,14],[9,14],[8,14],[7,14],[6,14],[5,14],[4,14],[3,14],[2,14],[1,14],
];

// Entry positions on MAIN_PATH for each color (where a token enters on rolling 6)
const COLOR_ENTRY = { red: 0, blue: 13, green: 26, yellow: 39 };

// Home column entry: the main path INDEX after which a token enters the home column
// (token has traveled COLOR_HOME_ENTRY[color] steps from its entry to reach home column)
// Each color travels 50 steps from entry to reach the home column start
const COLOR_HOME_ENTRY_INDEX = {
  red:    (0 + 50) % 52,   // = 50 → pos 50 = [2,14] → home col goes UP col=2
  blue:   (13 + 50) % 52,  // = 11 → pos 11 = [1,2]  → home col goes RIGHT row=2
  green:  (26 + 50) % 52,  // = 24 → pos 24 = [13,1] → home col goes DOWN col=12 (actually LEFT)
  yellow: (39 + 50) % 52,  // = 37 → pos 37 = [14,13]→ home col goes LEFT row=13... UP col=8
};

// Home columns: 6 cells each, index 0 = closest to main track, index 5 = home finish
// These go toward the center of the board
const HOME_COLUMNS = {
  red:    [[2,13],[2,12],[2,11],[2,10],[2,9],[2,8]],  // col=2, going UP toward center
  blue:   [[2,2],[3,2],[4,2],[5,2],[6,2],[7,2]],      // row=2, going RIGHT toward center
  green:  [[12,2],[12,3],[12,4],[12,5],[12,6],[12,7]], // col=12, going DOWN toward center
  yellow: [[12,12],[11,12],[10,12],[9,12],[8,12],[7,12]], // row=12, going LEFT toward center
};

// Home column entry cell (on main path) for each color
const HOME_COL_ENTRY = {
  red:    [2,14],   // position 50 on main path
  blue:   [1,2],    // position 11 on main path
  green:  [13,1],   // position 24 on main path
  yellow: [14,13],  // position 37 on main path
};

// Safe squares (star positions) — tokens here cannot be captured
// These are at standard star positions on the board
const SAFE_POSITIONS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Starting yard positions (pixel-based centers within home areas) for each color's 4 tokens
// These are [col, row] within the 15×15 grid
const YARD_POSITIONS = {
  red:    [[2,10],[4,10],[2,12],[4,12]],
  blue:   [[2,2],[4,2],[2,4],[4,4]],
  green:  [[10,2],[12,2],[10,4],[12,4]],
  yellow: [[10,10],[12,10],[10,12],[12,12]],
};

// Color of each home zone on the board
const HOME_ZONE_COLORS = {
  red:    { rows: [9,14], cols: [0,5] },
  blue:   { rows: [0,5],  cols: [0,5] },
  green:  { rows: [0,5],  cols: [9,14] },
  yellow: { rows: [9,14], cols: [9,14] },
};

// Starting token positions (for game init) — token starts in yard (position = -1)
const TOTAL_MAIN_PATH = 52;
const HOME_COL_LENGTH = 6;
const TOTAL_STEPS = TOTAL_MAIN_PATH + HOME_COL_LENGTH; // 58 steps from entry to home finish

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
