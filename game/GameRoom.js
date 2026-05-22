// ============================================================
// GameRoom.js — Manages a single game room (players, bots, timers)
// ============================================================
const LudoGame = require('./LudoGame');
const BotPlayer = require('./BotPlayer');
const { COLORS } = require('./constants');

const TURN_TIMER_MS = 30000; // 30 seconds

class GameRoom {
  constructor(roomCode, io, roomStore = null) {
    this.roomCode = roomCode;
    this.io = io;
    this.roomStore = roomStore;
    this.players = {}; // socketId → { name, color, isBot }
    this.colorMap = {}; // color → socketId (null if bot)
    this.slotConfig = []; // [{color, isBot, name}] — set at room creation
    this.theme = 'galaxy'; // 'classic' | 'galaxy'
    this.game = null;
    this.timer = null;
    this.timerStart = null;
    this.finishOrder = []; // colors in order of finishing
    this.status = 'waiting'; // 'waiting' | 'playing' | 'finished'
    this.hostSocketId = null;
    this.rankings = []; // final rankings
  }

  async _save() {
    if (this.roomStore) {
      try {
        await this.roomStore.saveRoom(this);
      } catch (err) {
        console.error(`[GameRoom] Error saving room state to store:`, err.message);
      }
    }
  }

  // Add a human player to a slot
  async joinPlayer(socketId, name, color) {
    const oldSocketId = this.colorMap[color];
    if (oldSocketId && this.players[oldSocketId]) {
      delete this.players[oldSocketId];
    }
    this.players[socketId] = { name, color, isBot: false };
    this.colorMap[color] = socketId;
    if (!this.hostSocketId || this.hostSocketId === oldSocketId) {
      this.hostSocketId = socketId;
    }
    await this._save();
  }

  async removePlayer(socketId) {
    const player = this.players[socketId];
    if (!player) return;
    const { color } = player;
    delete this.players[socketId];
    // Convert to bot if game is in progress
    if (this.status === 'playing' && this.colorMap[color] === socketId) {
      this.colorMap[color] = null; // null = bot controlling this color
      
      // If it is currently this color's turn, trigger bot play immediately!
      if (this.game && this.game.currentColor === color) {
        if (this.game.phase === 'rolling') {
          this._handleBotTurnIfNeeded();
        } else if (this.game.phase === 'moving') {
          this._handleBotMoveIfNeeded(this.game.movableTokens.map(t => t.id));
        }
      }
    }
    await this._save();
  }

  // Start the game with given slot configuration
  async startGame(slotConfig, theme) {
    this.slotConfig = slotConfig;
    this.theme = theme || 'galaxy';
    const playerColors = slotConfig.map(s => s.color);
    this.game = new LudoGame(playerColors);
    this.status = 'playing';
    this._startTimer();
    await this._save();
    return this.game.getState();
  }

  // Handle a dice roll request
  async handleRoll(socketId) {
    if (!this.game || this.status !== 'playing') return;
    const color = this._getColorForSocket(socketId);
    if (!color || color !== this.game.currentColor) return;

    this._clearTimer();
    const result = this.game.rollDice();
    if (!result) return;

    this.io.to(this.roomCode).emit('dice-rolled', {
      color,
      value: result.value,
      movable: result.movable,
      tripleSix: result.tripleSix || false,
      noMoves: result.noMoves || false,
      state: this.game.getState(),
    });

    await this._save();

    if (result.tripleSix || result.noMoves) {
      this._startTimer();
      this._handleBotTurnIfNeeded();
      return;
    }

    if (result.movable.length > 0) {
      // If current turn is a bot, schedule bot move
      this._handleBotMoveIfNeeded(result.movable);
    }
  }

  // Handle a token move request
  async handleMove(socketId, tokenId) {
    if (!this.game || this.status !== 'playing') return;
    const color = this._getColorForSocket(socketId);
    if (!color || color !== this.game.currentColor) return;

    this._clearTimer();
    const result = this.game.moveToken(tokenId);
    if (!result) return;

    if (result.win) {
      this.finishOrder.push(result.win);
      this.status = 'finished';
    }

    this.io.to(this.roomCode).emit('token-moved', {
      color,
      tokenId,
      captured: result.captured,
      reachedHome: result.reachedHome,
      extraTurn: result.extraTurn,
      win: result.win || null,
      state: this.game.getState(),
    });

    await this._save();

    if (this.status !== 'finished') {
      this._startTimer();
      this._handleBotTurnIfNeeded();
    }
  }

  // Handle emoji reaction
  handleReaction(socketId, emoji) {
    const player = this.players[socketId];
    if (!player) return;
    this.io.to(this.roomCode).emit('reaction', { name: player.name, emoji });
  }

  // Get room info for lobby
  getRoomInfo() {
    return {
      roomCode: this.roomCode,
      status: this.status,
      theme: this.theme,
      slotConfig: this.slotConfig,
      players: Object.values(this.players).map(p => ({ name: p.name, color: p.color })),
    };
  }

  // ---- Timer management ----
  _startTimer(durationMs = TURN_TIMER_MS) {
    this._clearTimer();
    this.timerStart = Date.now() - (TURN_TIMER_MS - durationMs);
    this.io.to(this.roomCode).emit('timer-start', { duration: durationMs, color: this.game?.currentColor });
    this._save(); // Asynchronously save timer start state
    this.timer = setTimeout(async () => {
      if (this.game && this.status === 'playing') {
        this.game.skipTurn();
        this.io.to(this.roomCode).emit('turn-skipped', {
          reason: 'timeout',
          state: this.game.getState(),
        });
        await this._save();
        this._startTimer();
        this._handleBotTurnIfNeeded();
      }
    }, durationMs);
  }

  _clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ---- Bot handling ----
  _isCurrentTurnBot() {
    if (!this.game) return false;
    const color = this.game.currentColor;
    return this.colorMap[color] === null || this.colorMap[color] === undefined;
  }

  _handleBotTurnIfNeeded() {
    if (!this._isCurrentTurnBot()) return;
    setTimeout(async () => {
      if (!this.game || this.status !== 'playing') return;
      if (!this._isCurrentTurnBot()) return;
      
      const color = this.game.currentColor;
      // Bot rolls
      const result = this.game.rollDice();
      if (!result) return;

      this.io.to(this.roomCode).emit('dice-rolled', {
        color,
        value: result.value,
        movable: result.movable,
        tripleSix: result.tripleSix || false,
        noMoves: result.noMoves || false,
        state: this.game.getState(),
      });

      await this._save();

      if (result.movable.length > 0) {
        this._handleBotMoveIfNeeded(result.movable);
      } else {
        this._startTimer();
        this._handleBotTurnIfNeeded();
      }
    }, 1200 + Math.random() * 600);
  }

  _handleBotMoveIfNeeded(movableIds) {
    if (!this._isCurrentTurnBot()) return;
    setTimeout(async () => {
      if (!this.game || this.status !== 'playing') return;
      const tokenId = BotPlayer.chooseMove(this.game, movableIds);
      const currentColor = this.game.currentColor;
      this._clearTimer();
      const result = this.game.moveToken(tokenId);
      if (!result) return;

      if (result.win) {
        this.finishOrder.push(result.win);
        this.status = 'finished';
      }

      this.io.to(this.roomCode).emit('token-moved', {
        color: currentColor,
        tokenId,
        captured: result.captured,
        reachedHome: result.reachedHome,
        extraTurn: result.extraTurn,
        win: result.win || null,
        state: this.game.getState(),
      });

      await this._save();

      if (this.status !== 'finished') {
        this._startTimer();
        this._handleBotTurnIfNeeded();
      }
    }, 900 + Math.random() * 700);
  }

  _getColorForSocket(socketId) {
    const player = this.players[socketId];
    return player?.color || null;
  }

  toJSON() {
    return {
      roomCode: this.roomCode,
      players: this.players,
      colorMap: this.colorMap,
      slotConfig: this.slotConfig,
      theme: this.theme,
      game: this.game ? this.game.toJSON() : null,
      timerStart: this.timerStart,
      finishOrder: this.finishOrder,
      status: this.status,
      hostSocketId: this.hostSocketId,
      rankings: this.rankings,
    };
  }

  static fromJSON(data, io, roomStore) {
    if (!data) return null;
    const room = new GameRoom(data.roomCode, io, roomStore);
    room.players = data.players || {};
    room.colorMap = data.colorMap || {};
    room.slotConfig = data.slotConfig || [];
    room.theme = data.theme || 'galaxy';
    room.game = data.game ? LudoGame.fromJSON(data.game) : null;
    room.finishOrder = data.finishOrder || [];
    room.status = data.status || 'waiting';
    room.hostSocketId = data.hostSocketId;
    room.rankings = data.rankings || [];
    room.timerStart = data.timerStart || null;

    // Resume timer if playing
    if (room.status === 'playing' && room.timerStart) {
      const elapsed = Date.now() - room.timerStart;
      const remaining = TURN_TIMER_MS - elapsed;
      if (remaining > 0) {
        room._startTimer(remaining);
      } else {
        room._startTimer(0);
      }
    }
    return room;
  }
}

module.exports = GameRoom;
