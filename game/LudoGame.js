// ============================================================
// LudoGame.js — Core Ludo rules engine (server-side)
// ============================================================
const {
  COLORS, MAIN_PATH, COLOR_ENTRY, COLOR_HOME_ENTRY_INDEX,
  HOME_COLUMNS, SAFE_POSITIONS, TOTAL_MAIN_PATH, HOME_COL_LENGTH, TOTAL_STEPS
} = require('./constants');

class LudoGame {
  constructor(playerColors) {
    // playerColors: array of color strings, e.g. ['red','blue','green','yellow']
    this.playerColors = playerColors;
    this.tokens = {}; // color → [t0,t1,t2,t3] each token = { steps: -1 } (-1=yard, 0-57=on board, 58=home)
    this.currentTurnIndex = 0;
    this.dice = null;
    this.consecutiveSixes = 0;
    this.phase = 'rolling'; // 'rolling' | 'moving' | 'finished'
    this.winner = null;
    this.movableTokens = [];
    this.lastCapture = null;
    this.lastEvent = null;

    // Initialize tokens in yard
    for (const color of playerColors) {
      this.tokens[color] = [
        { steps: -1, id: 0 },
        { steps: -1, id: 1 },
        { steps: -1, id: 2 },
        { steps: -1, id: 3 },
      ];
    }
  }

  get currentColor() {
    return this.playerColors[this.currentTurnIndex];
  }

  // Roll dice — returns { value, movable, extraTurn }
  rollDice() {
    if (this.phase !== 'rolling') return null;
    const value = Math.floor(Math.random() * 6) + 1;
    this.dice = value;
    this.lastEvent = null;
    this.lastCapture = null;

    if (value === 6) {
      this.consecutiveSixes++;
      if (this.consecutiveSixes >= 3) {
        // 3 consecutive sixes: forfeit turn
        this.consecutiveSixes = 0;
        this.dice = null;
        this.lastEvent = 'triple-six';
        this._nextTurn();
        return { value, movable: [], extraTurn: false, tripleSix: true };
      }
    } else {
      this.consecutiveSixes = 0;
    }

    const movable = this._getMovableTokens(this.currentColor, value);
    this.movableTokens = movable;

    if (movable.length === 0) {
      // No moves available, skip turn
      this._nextTurn();
      return { value, movable: [], extraTurn: false, noMoves: true };
    }

    this.phase = 'moving';
    return { value, movable: movable.map(t => t.id), extraTurn: false };
  }

  // Move token — returns result object
  moveToken(tokenId) {
    if (this.phase !== 'moving') return null;
    const color = this.currentColor;
    const token = this.tokens[color][tokenId];
    const movable = this.movableTokens.find(t => t.id === tokenId);
    if (!movable) return null;

    const prevSteps = token.steps;
    token.steps = movable.newSteps;

    let captured = null;
    let extraTurn = this.dice === 6;
    let reachedHome = false;

    // Check if token reached home finish
    if (token.steps >= TOTAL_STEPS) {
      token.steps = TOTAL_STEPS; // cap at 58
      reachedHome = true;
      extraTurn = true; // bonus roll on reaching home
      this.lastEvent = 'reached-home';
    }

    // Check capture (only on main path)
    if (!reachedHome && token.steps >= 0 && token.steps < TOTAL_STEPS - HOME_COL_LENGTH) {
      const pos = this._stepsToMainIndex(color, token.steps);
      if (pos !== null && !SAFE_POSITIONS.has(pos)) {
        // Check for opponent tokens at same main-path position
        for (const otherColor of this.playerColors) {
          if (otherColor === color) continue;
          for (const ot of this.tokens[otherColor]) {
            if (ot.steps < 0 || ot.steps >= TOTAL_STEPS) continue;
            const otPos = this._stepsToMainIndex(otherColor, ot.steps);
            if (otPos === pos) {
              // Capture!
              ot.steps = -1;
              captured = { color: otherColor, tokenId: ot.id };
              extraTurn = true;
              this.lastCapture = captured;
              this.lastEvent = 'capture';
            }
          }
        }
      }
    }

    // Check win condition
    const allHome = this.tokens[color].every(t => t.steps >= TOTAL_STEPS);
    if (allHome) {
      this.phase = 'finished';
      this.winner = color;
      this.lastEvent = 'win';
      return { moved: tokenId, captured, reachedHome, extraTurn: false, win: color };
    }

    this.movableTokens = [];
    this.dice = null;

    if (extraTurn) {
      this.phase = 'rolling';
      // same player's turn
    } else {
      this._nextTurn();
    }

    return { moved: tokenId, captured, reachedHome, extraTurn };
  }

  // Skip turn (used by timer timeout)
  skipTurn() {
    this.dice = null;
    this.movableTokens = [];
    this.lastEvent = 'timeout';
    this.consecutiveSixes = 0;
    this._nextTurn();
  }

  // Returns all tokens' position data for broadcast
  getState() {
    return {
      tokens: this.tokens,
      currentColor: this.currentColor,
      phase: this.phase,
      dice: this.dice,
      movableTokens: this.movableTokens.map(t => t.id),
      winner: this.winner,
      lastEvent: this.lastEvent,
      lastCapture: this.lastCapture,
    };
  }

  // Sum of steps across all tokens (yard=-1 treated as 0) — used for forced-end rankings
  getTokenProgress(color) {
    const tokens = this.tokens[color];
    if (!tokens) return 0;
    return tokens.reduce((sum, t) => sum + Math.max(0, t.steps), 0);
  }

  // ---- Private helpers ----

  _nextTurn() {
    this.phase = 'rolling';
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerColors.length;
    this.consecutiveSixes = 0;
  }

  // Get list of movable tokens for a color given dice value
  _getMovableTokens(color, dice) {
    const movable = [];
    for (const token of this.tokens[color]) {
      const newSteps = this._calcNewSteps(color, token, dice);
      if (newSteps !== null) {
        movable.push({ id: token.id, newSteps });
      }
    }
    return movable;
  }

  _calcNewSteps(color, token, dice) {
    // Token in yard — can only enter on 6
    if (token.steps === -1) {
      if (dice === 6) return 0; // enters at step 0 (entry point on main path)
      return null;
    }
    // Token already home
    if (token.steps >= TOTAL_STEPS) return null;

    const newSteps = token.steps + dice;
    // Can't overshoot home column
    if (newSteps > TOTAL_STEPS) return null;
    return newSteps;
  }

  // Convert color + steps to main path index (null if in home column or yard)
  _stepsToMainIndex(color, steps) {
    if (steps < 0 || steps >= TOTAL_MAIN_PATH) return null;
    const entry = COLOR_ENTRY[color];
    return (entry + steps) % MAIN_PATH.length;
  }

  // Get [col,row] for a token's current position (for rendering)
  getTokenCell(color, steps) {
    if (steps === -1) return null; // in yard
    if (steps >= TOTAL_STEPS) return null; // at home finish

    // In home column
    if (steps >= TOTAL_MAIN_PATH) {
      const homeIdx = steps - TOTAL_MAIN_PATH;
      return HOME_COLUMNS[color][homeIdx] || null;
    }

    // On main path
    const entry = COLOR_ENTRY[color];
    const pathIdx = (entry + steps) % MAIN_PATH.length;
    return MAIN_PATH[pathIdx];
  }

  toJSON() {
    return {
      playerColors: this.playerColors,
      tokens: this.tokens,
      currentTurnIndex: this.currentTurnIndex,
      dice: this.dice,
      consecutiveSixes: this.consecutiveSixes,
      phase: this.phase,
      winner: this.winner,
      movableTokens: this.movableTokens,
      lastCapture: this.lastCapture,
      lastEvent: this.lastEvent,
    };
  }

  static fromJSON(data) {
    if (!data) return null;
    const game = new LudoGame(data.playerColors);
    game.tokens = data.tokens;
    game.currentTurnIndex = data.currentTurnIndex;
    game.dice = data.dice;
    game.consecutiveSixes = data.consecutiveSixes;
    game.phase = data.phase;
    game.winner = data.winner;
    game.movableTokens = data.movableTokens || [];
    game.lastCapture = data.lastCapture;
    game.lastEvent = data.lastEvent;
    return game;
  }
}

module.exports = LudoGame;
