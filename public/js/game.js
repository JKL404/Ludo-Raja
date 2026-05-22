// ============================================================
// game.js — Frontend game controller
// ============================================================

const GameController = (() => {
  let myColor = null;
  let myName  = null;
  let roomCode = null;
  let theme    = 'galaxy';
  let slotConfig = [];
  let currentState = null;
  let isMyTurn = false;

  const TOKEN_COLORS = {
    red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  };

  // ---- Boot ----
  function init() {
    SoundEngine.init();
    ParticleSystem.init();
    TimerUI.init();

    // Restore session
    myColor  = sessionStorage.getItem('ludoColor')  || 'red';
    myName   = sessionStorage.getItem('ludoName')   || 'Player';
    roomCode = sessionStorage.getItem('ludoRoom')   || '';
    theme    = sessionStorage.getItem('ludoTheme')  || 'galaxy';
    slotConfig = JSON.parse(sessionStorage.getItem('ludoSlots') || '[]');

    // Apply theme
    document.documentElement.setAttribute('data-theme', theme);
    _generateStars();

    // Init board
    const canvas = document.getElementById('game-canvas');
    _resizeCanvas(canvas);
    BoardRenderer.init(canvas, theme);
    BoardRenderer.setMyColor(myColor);
    BoardRenderer.startAnimLoop();

    // Handle window resize dynamically
    window.addEventListener('resize', () => {
      _resizeCanvas(canvas);
      BoardRenderer.draw();
    });

    // Init dice
    DiceUI.init();

    // Vol toggle
    document.getElementById('vol-toggle')?.addEventListener('click', () => SoundEngine.toggleMute());

    // Socket
    SocketClient.connect();
    _setupSocketHandlers();

    // After connect, re-join room
    SocketClient.on('connect', () => {
      if (roomCode && myColor) {
        SocketClient.emit('join-room', { roomCode, name: myName, color: myColor });
      }
    });

    // Build player panels
    _buildPlayerPanels();
    _updateRollBtn();
  }

  function _resizeCanvas(canvas) {
    let size;
    if (window.innerWidth > 900) {
      size = Math.min(window.innerWidth - 440, window.innerHeight - 180, 750);
    } else {
      size = Math.min(window.innerWidth - 24, window.innerHeight - 320, 650);
    }
    const finalSize = Math.max(size, 260);
    canvas.width  = finalSize;
    canvas.height = finalSize;
  }

  function _generateStars() {
    const bg = document.getElementById('stars-bg');
    if (!bg || theme !== 'galaxy') return;
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.style.cssText = `left:${Math.random()*100}%;bottom:${Math.random()*100}%;
        width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;
        animation-duration:${10+Math.random()*20}s;animation-delay:${-Math.random()*20}s`;
      bg.appendChild(s);
    }
  }

  // ---- Socket handlers ----
  function _setupSocketHandlers() {
    SocketClient.on('game-started', ({ slotConfig: sc, theme: t, state }) => {
      slotConfig = sc;
      theme = t;
      currentState = state;
      _applyState(state);
    });

    SocketClient.on('dice-rolled', ({ color, value, movable, tripleSix, noMoves, state }) => {
      currentState = state;
      const slot = slotConfig.find(s => s.color === color);
      const displayName = slot?.isBot ? `Bot (${color})` : (color === myColor ? 'You' : slot?.name || color.toUpperCase());
      DiceUI.roll(value, displayName, () => {
        BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : []);
        _updateUI(state, color, value, { tripleSix, noMoves, movable });
      });
    });

    SocketClient.on('token-moved', ({ color, tokenId, captured, reachedHome, extraTurn, win, state }) => {
      currentState = state;

      const slot = slotConfig.find(s => s.color === color);
      const name = slot?.isBot ? `Bot (${color})` : (color === myColor ? 'You' : slot?.name || color.toUpperCase());

      if (captured) {
        _addSystemMessage(`💥 ${name} captured ${captured.color.toUpperCase()}'s token!`);
      }
      if (reachedHome) {
        _addSystemMessage(`🏠 ${name} reached home!`);
      }

      BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : [], {
        animate: true,
        captured,
        reachedHome
      });
      _updateTurnUI(state);
      _updatePlayerCards(state);
      _updateRollBtn(state);

      if (win) {
        _showWin(win, state);
      } else if (extraTurn) {
        _addSystemMessage(`🎉 ${name} gets an extra turn!`);
      }
    });

    SocketClient.on('turn-skipped', ({ reason, state }) => {
      currentState = state;
      if (reason === 'timeout') {
        const color = state.currentColor;
        const slot = slotConfig.find(s => s.color === color);
        const name = slot?.isBot ? `Bot (${color})` : (color === myColor ? 'You' : slot?.name || color.toUpperCase());
        _addSystemMessage(`⏱️ ${name}'s turn timed out!`);
      }
      BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : []);
      _updateTurnUI(state);
      _updatePlayerCards(state);
      _updateRollBtn(state);
    });

    SocketClient.on('timer-start', ({ duration, color }) => {
      TimerUI.start(duration);
      if (color === myColor) SoundEngine.play.turnStart();
    });

    SocketClient.on('reaction', ({ name, emoji }) => {
      _showReactionPopup(emoji, name);
      _addChatMessage(name, emoji, 'reaction');
    });

    SocketClient.on('chat', ({ name, color, message }) => {
      _addChatMessage(name, message, color);
    });
  }

  function _applyState(state) {
    BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : []);
    _updateTurnUI(state);
    _updatePlayerCards(state);
    _updateRollBtn(state);
  }

  // ---- UI updates ----
  function _updateUI(state, rolledColor, value, { tripleSix, noMoves, movable }) {
    _updateTurnUI(state);
    _updatePlayerCards(state);

    const slot = slotConfig.find(s => s.color === rolledColor);
    const displayName = slot?.isBot ? `Bot (${rolledColor})` : (rolledColor === myColor ? 'You' : slot?.name || rolledColor.toUpperCase());

    if (tripleSix) {
      SoundEngine.play.tripleSix();
      _addSystemMessage(`💀 ${displayName} rolled triple 6 and forfeited their turn!`);
    }
    if (noMoves && !tripleSix) {
      _addSystemMessage(`🎲 ${displayName} rolled ${value} — no moves!`);
    }
    if (value === 6 && !tripleSix) {
      _addSystemMessage(`🎲 ${displayName} rolled a SIX! ✨`);
    }

    isMyTurn = state.currentColor === myColor && state.phase === 'moving';
    _updateRollBtn(state);
  }

  function _updateTurnUI(state) {
    const dot   = document.getElementById('turn-dot');
    const label = document.getElementById('turn-label');
    if (!dot || !label) return;

    const color = state.currentColor;
    dot.className = `turn-dot ${color}`;

    const slot = slotConfig.find(s => s.color === color);
    const name = slot?.isBot ? `🤖 Bot (${color})` : (color === myColor ? `${myName} (YOU)` : color.toUpperCase());
    label.textContent = state.phase === 'finished' ? '🏆 GAME OVER' : `${name}'s Turn`;
  }

  function _updatePlayerCards(state) {
    const colors = slotConfig.map(s => s.color);
    const left   = document.getElementById('panel-left');
    const right  = document.getElementById('panel-right');
    if (!left || !right) return;

    colors.forEach((color, i) => {
      const card = document.querySelector(`.player-card[data-color="${color}"]`);
      if (!card) return;
      card.classList.toggle('active-turn', color === state.currentColor && state.phase !== 'finished');

      // Token home pips
      const tokens = state.tokens?.[color] || [];
      const pipEls = card.querySelectorAll('.pc-token-pip');
      pipEls.forEach((pip, idx) => {
        const t = tokens[idx];
        pip.classList.toggle('home', t && t.steps >= 58);
        pip.style.background = (t && t.steps >= 0 && t.steps < 58)
          ? TOKEN_COLORS[color]
          : (t?.steps >= 58 ? '' : 'rgba(255,255,255,0.1)');
      });
    });
  }

  function _updateRollBtn(state) {
    const btn = document.getElementById('roll-btn');
    if (!btn) return;
    const s = state || currentState;
    if (!s) return;
    const myTurn = s.currentColor === myColor;
    const canRoll = myTurn && s.phase === 'rolling' && s.phase !== 'finished';
    btn.disabled = !canRoll;
    btn.textContent = canRoll ? '🎲 ROLL' : (s.phase === 'moving' && myTurn ? '← Pick a token' : '⏳ Waiting…');
    isMyTurn = myTurn;
  }

  // ---- Player panels ----
  function _buildPlayerPanels() {
    const colors = slotConfig.map(s => s.color);
    const leftColors  = colors.filter((_, i) => i < 2);
    const rightColors = colors.filter((_, i) => i >= 2);

    const panelLeft  = document.getElementById('panel-left');
    const panelRight = document.getElementById('panel-right');

    leftColors.forEach(color => panelLeft?.insertBefore(_makePlayerCard(color), panelLeft.firstChild));
    rightColors.forEach(color => {
      const existing = panelRight?.querySelector(`[data-color="${color}"]`);
      if (!existing) panelRight?.prepend(_makePlayerCard(color));
    });
  }

  function _makePlayerCard(color) {
    const slot = slotConfig.find(s => s.color === color);
    const name = slot?.isBot ? `Bot 🤖` : (color === myColor ? myName : color);
    const div  = document.createElement('div');
    div.className = 'player-card';
    div.dataset.color = color;
    div.innerHTML = `
      <div class="pc-header">
        <div class="pc-dot" style="background:${TOKEN_COLORS[color]};box-shadow:0 0 8px ${TOKEN_COLORS[color]}66"></div>
        <div class="pc-name">${escapeHtml(name)}</div>
        <span class="pc-badge ${slot?.isBot ? 'bot' : (color === myColor ? 'you' : '')}">${slot?.isBot ? '🤖' : (color === myColor ? 'YOU' : '')}</span>
      </div>
      <div class="pc-tokens">
        ${[0,1,2,3].map(i => `<div class="pc-token-pip" style="background:${TOKEN_COLORS[color]}55;border-color:${TOKEN_COLORS[color]}88"></div>`).join('')}
      </div>
    `;
    return div;
  }

  // ---- Win screen ----
  function _showWin(winnerColor, state) {
    TimerUI.stop();
    SoundEngine.play.win();
    ParticleSystem.celebrate(winnerColor);

    const slot = slotConfig.find(s => s.color === winnerColor);
    const winName = slot?.isBot ? `Bot (${winnerColor})` : (winnerColor === myColor ? myName : winnerColor.toUpperCase());

    const overlay = document.getElementById('win-overlay');
    const nameEl  = document.getElementById('win-name');
    if (overlay && nameEl) {
      nameEl.textContent = winName;
      nameEl.style.color = TOKEN_COLORS[winnerColor];
      overlay.style.display = 'flex';
    }
  }

  // ---- Reactions ----
  function _showReactionPopup(emoji, name) {
    const el = document.createElement('div');
    el.className = 'reaction-popup';
    el.textContent = emoji;
    el.style.cssText = `left:${20 + Math.random()*60}%;top:${30 + Math.random()*30}%`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  // ---- Chat ----
  function _addChatMessage(name, msg, type) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const color = TOKEN_COLORS[type] || 'var(--text-muted)';
    div.innerHTML = `
      <span class="chat-msg-name" style="color:${color}">${escapeHtml(name)}:</span>
      <span class="chat-msg-text">${escapeHtml(msg)}</span>
    `;
    log.appendChild(div);
    while (log.children.length > 60) {
      log.removeChild(log.firstChild);
    }
    log.scrollTop = log.scrollHeight;
  }

  function _addSystemMessage(msg) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'chat-msg system-msg';
    div.innerHTML = `
      <span class="chat-msg-text" style="color:var(--text-muted); font-style:italic;">⚙️ ${escapeHtml(msg)}</span>
    `;
    log.appendChild(div);
    while (log.children.length > 60) {
      log.removeChild(log.firstChild);
    }
    log.scrollTop = log.scrollHeight;
  }

  // ---- Public actions ----
  function rollDice() {
    const s = currentState;
    if (!s || s.currentColor !== myColor || s.phase !== 'rolling') return;
    SoundEngine.resume();
    const btn = document.getElementById('roll-btn');
    if (btn) btn.disabled = true;
    SocketClient.emit('roll-dice', {});
  }

  function moveToken(id) {
    const s = currentState;
    if (!s || s.currentColor !== myColor || s.phase !== 'moving') return;
    SocketClient.emit('move-token', { tokenId: id });
  }

  function sendReaction(emoji) {
    SoundEngine.resume();
    SocketClient.emit('reaction', { emoji });
  }

  function sendChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    SocketClient.emit('chat', { message: msg });
    input.value = '';
  }

  // ---- Helpers ----
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, rollDice, moveToken, sendReaction, sendChat };
})();

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => GameController.init());
window.GameController = GameController;
window.showToast = (msg, type) => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type||'info'}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
};
