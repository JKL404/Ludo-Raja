// ============================================================
// BotPlayer.js — AI bot decision engine (priority-based heuristic)
// ============================================================
const { COLOR_ENTRY, MAIN_PATH, SAFE_POSITIONS, TOTAL_STEPS, TOTAL_MAIN_PATH } = require('./constants');

class BotPlayer {
  /**
   * Choose the best token to move given the game state.
   * Priority: Win > Capture > Escape Danger > Enter Board > Advance Furthest
   * Returns tokenId (0-3)
   */
  static chooseMove(game, movableIds, delay = 1000) {
    const color = game.currentColor;
    const dice = game.dice;
    const tokens = game.tokens[color];
    const opponents = Object.keys(game.tokens).filter(c => c !== color);

    // Score each movable token
    let bestId = movableIds[0];
    let bestScore = -Infinity;

    for (const id of movableIds) {
      const token = tokens[id];
      const newSteps = token.steps === -1 ? 0 : token.steps + dice;
      let score = 0;

      // 1. Reaching home finish = highest priority
      if (newSteps >= TOTAL_STEPS) {
        score += 10000;
      }

      // 2. Entering board from yard
      if (token.steps === -1) {
        score += 200;
        // Extra if multiple tokens in yard (want to spread out)
        const inYard = tokens.filter(t => t.steps === -1).length;
        score += inYard * 30;
      }

      // 3. Capture opponent
      const newMainIdx = _stepsToMainIndex(color, newSteps);
      if (newMainIdx !== null && !SAFE_POSITIONS.has(newMainIdx)) {
        for (const oppColor of opponents) {
          for (const ot of game.tokens[oppColor]) {
            if (ot.steps < 0 || ot.steps >= TOTAL_MAIN_PATH) continue;
            const otIdx = _stepsToMainIndex(oppColor, ot.steps);
            if (otIdx === newMainIdx) {
              score += 500; // capture!
            }
          }
        }
      }

      // 4. Landing on safe square is good
      if (newMainIdx !== null && SAFE_POSITIONS.has(newMainIdx)) {
        score += 50;
      }

      // 5. Escape danger (current position is threatened)
      const curMainIdx = _stepsToMainIndex(color, token.steps);
      if (curMainIdx !== null && !SAFE_POSITIONS.has(curMainIdx)) {
        for (const oppColor of opponents) {
          for (const ot of game.tokens[oppColor]) {
            if (ot.steps < 0) continue;
            const otIdx = _stepsToMainIndex(oppColor, ot.steps);
            // Opponent within 6 steps of our token (threat)
            if (otIdx !== null) {
              const dist = (curMainIdx - otIdx + TOTAL_MAIN_PATH) % TOTAL_MAIN_PATH;
              if (dist <= 6 && dist > 0) {
                score += 150; // moving away from danger
              }
            }
          }
        }
      }

      // 6. Advance furthest token (progress toward home)
      score += newSteps * 2;

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    return bestId;
  }
}

function _stepsToMainIndex(color, steps) {
  if (steps < 0 || steps >= TOTAL_MAIN_PATH) return null;
  const entry = COLOR_ENTRY[color];
  return (entry + steps) % TOTAL_MAIN_PATH;
}

module.exports = BotPlayer;
