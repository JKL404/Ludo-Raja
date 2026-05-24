// ============================================================
// game.js — Frontend game controller
// ============================================================

const GameController = (() => {
  let myColor = null;
  let myName  = null;
  let roomCode = null;
  let theme    = 'galaxy';
  let slotConfig = [];
  let playerNames = {}; // color → name, persisted from lobby
  let currentState = null;
  let isMyTurn = false;
  let isHost = false;

  const TOKEN_COLORS = {
    red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  };

  // ---- Boot ----
  function init() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    SoundEngine.init();
    ParticleSystem.init();
    TimerUI.init();

    // Restore session
    myColor     = sessionStorage.getItem('ludoColor')       || 'red';
    myName      = sessionStorage.getItem('ludoName')        || localStorage.getItem('ludoName') || 'Player';
    roomCode    = sessionStorage.getItem('ludoRoom')        || '';
    theme       = sessionStorage.getItem('ludoTheme')       || 'galaxy';
    slotConfig  = JSON.parse(sessionStorage.getItem('ludoSlots')       || '[]');
    playerNames = JSON.parse(sessionStorage.getItem('ludoPlayerNames') || '{}');

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
        const userId = SocketClient.getUserId();
        SocketClient.emit('join-room', { roomCode, name: myName, color: myColor, userId });
      }
    });

    // Build player panels
    _buildPlayerPanels();
    _updateRollBtn();

    // Ensure we start at the top of the viewport
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);
  }

  function _resizeCanvas(canvas) {
    let size;
    if (window.innerWidth > 900) {
      size = Math.min(window.innerWidth - 440, window.innerHeight - 180, 750);
    } else {
      size = Math.min(window.innerWidth - 24, window.innerHeight - 290, 650);
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
    SocketClient.on('error', (data) => {
      const msg = data?.message || 'Something went wrong';
      showToast(msg, 'error');
      setTimeout(() => { window.location.href = '/'; }, 2500);
    });

    SocketClient.on('game-started', ({ slotConfig: sc, hostColor, theme: t, state, isPaused }) => {
      slotConfig = sc;
      theme = t;
      currentState = state;
      // Refresh playerNames from the server's enriched slotConfig and persist
      sc.forEach(s => { if (!s.isBot && s.name) playerNames[s.color] = s.name; });
      sessionStorage.setItem('ludoPlayerNames', JSON.stringify(playerNames));
      sessionStorage.setItem('ludoSlots', JSON.stringify(sc));
      // Show host-only buttons
      if (hostColor) {
        isHost = hostColor === myColor;
        const endBtn    = document.getElementById('btn-end-game');
        const pauseBtn  = document.getElementById('btn-pause-game');
        const resumeBtn = document.getElementById('btn-resume-game');
        if (endBtn)   endBtn.style.display   = isHost ? 'inline-flex' : 'none';
        if (pauseBtn) pauseBtn.style.display  = isHost ? 'inline-flex' : 'none';
        if (resumeBtn) resumeBtn.style.display = 'none'; // shown only when paused
      }
      // If rejoining a paused game, show the paused overlay immediately
      if (isPaused) _showPausedOverlay('Game is paused', isHost);
      // Refresh card names in-place (handles reconnects)
      _refreshCardNames();
      _applyState(state);
    });

    SocketClient.on('game-paused', ({ pausedBy }) => {
      TimerUI.stop();
      _showPausedOverlay(`Paused by ${pausedBy}`, isHost);
      // Swap pause↔resume buttons for host
      const pauseBtn  = document.getElementById('btn-pause-game');
      const resumeBtn = document.getElementById('btn-resume-game');
      if (pauseBtn)  pauseBtn.style.display  = 'none';
      if (resumeBtn) resumeBtn.style.display = isHost ? 'inline-flex' : 'none';
    });

    SocketClient.on('game-resumed', ({ state }) => {
      _hidePausedOverlay();
      currentState = state;
      _applyState(state);
      // Swap resume↔pause buttons for host
      const pauseBtn  = document.getElementById('btn-pause-game');
      const resumeBtn = document.getElementById('btn-resume-game');
      if (pauseBtn)  pauseBtn.style.display  = isHost ? 'inline-flex' : 'none';
      if (resumeBtn) resumeBtn.style.display = 'none';
    });

    SocketClient.on('game-ended', ({ reason, rankings }) => {
      TimerUI.stop();
      const msg = reason === 'host_ended' ? 'Host ended the game' : 'Game over';
      showToast(msg, 'info');
      // Show a brief rankings overlay then redirect
      _showEndedScreen(rankings);
    });

    SocketClient.on('dice-rolled', ({ color, value, movable, tripleSix, noMoves, state }) => {
      currentState = state;
      const isMe = color === myColor;
      const rawName = isMe ? 'You' : _nameFor(color);
      const styledName = `<span class="roll-player-name roll-player-${isMe ? 'you' : color}">${rawName}</span>`;
      DiceUI.roll(value, styledName, () => {
        BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : []);
        _updateUI(state, color, value, { tripleSix, noMoves, movable });
      });
    });

    SocketClient.on('token-moved', ({ color, tokenId, captured, reachedHome, extraTurn, win, autoMoved, state }) => {
      currentState = state;

      const name = color === myColor ? 'You' : _nameFor(color);

      if (autoMoved && color === myColor) {
        _addSystemMessage(`⚡ Only one valid move! Auto-moved your token.`);
      }

      if (captured) {
        _addSystemMessage(`💥 ${name} captured ${captured.color.toUpperCase()}'s token!`);
      }
      if (reachedHome) {
        _addSystemMessage(`🏠 ${name} reached home!`);
      }

      BoardRenderer.setState(state, myColor === state.currentColor ? state.movableTokens : [], {
        animate: true,
        captured,
        reachedHome,
        onComplete: () => {
          _updateRollBtn(state);
        }
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
        const name = color === myColor ? 'You' : _nameFor(color);
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

  // Resolve a display name for any color, with layered fallbacks
  function _nameFor(color) {
    if (color === myColor) return myName;
    const slot = slotConfig.find(s => s.color === color);
    if (slot?.isBot) return `Bot (${color})`;
    return slot?.name || playerNames[color] || color.toUpperCase();
  }

  function _updateTurnUI(state) {
    const dot   = document.getElementById('turn-dot');
    const label = document.getElementById('turn-label');
    if (!dot || !label) return;

    const color = state.currentColor;
    dot.className = `turn-dot ${color}`;

    const name = color === myColor ? `${myName} (YOU)` : _nameFor(color);
    label.textContent = state.phase === 'finished' ? '🏆 GAME OVER' : `${name}'s Turn`;
  }

  function _updatePlayerCards(state) {
    const colors = slotConfig.map(s => s.color);

    colors.forEach((color, i) => {
      const cards = document.querySelectorAll(`.player-card[data-color="${color}"]`);
      cards.forEach(card => {
        card.classList.toggle('active-turn', color === state.currentColor && state.phase !== 'finished');

        // Token home pips
        const tokens = state.tokens?.[color] || [];
        const pipEls = card.querySelectorAll('.pc-token-pip');
        pipEls.forEach((pip, idx) => {
          const t = tokens[idx];
          pip.classList.toggle('home', t && t.steps >= 56);
          pip.style.background = (t && t.steps >= 0 && t.steps < 56)
            ? TOKEN_COLORS[color]
            : (t?.steps >= 56 ? '' : 'rgba(255,255,255,0.1)');
        });
      });
    });
  }

  function _updateRollBtn(state) {
    const btn  = document.getElementById('roll-btn');
    const wrap = document.getElementById('dice-3d-wrap');
    if (!btn) return;
    const s = state || currentState;
    if (!s) return;
    const myTurn = s.currentColor === myColor;
    const canRoll = myTurn && s.phase === 'rolling' && s.phase !== 'finished' && !BoardRenderer.isAnimating();
    btn.disabled = !canRoll;
    btn.textContent = canRoll ? '🎲 ROLL' : (s.phase === 'moving' && myTurn ? '← Pick a token' : '⏳ Waiting…');
    isMyTurn = myTurn;
    if (wrap) {
      wrap.classList.toggle('dice-ready', canRoll);
      if (canRoll) wrap.classList.remove('dice-rolling');
    }
  }

  // ---- Player panels ----
  // Update name labels in existing cards without rebuilding the whole panel
  function _refreshCardNames() {
    document.querySelectorAll('.player-card[data-color]').forEach(card => {
      const color = card.dataset.color;
      const nameEl = card.querySelector('.pc-name');
      if (nameEl) nameEl.textContent = color === myColor ? myName : _nameFor(color);
    });
  }

  function _buildPlayerPanels() {
    const colors = slotConfig.map(s => s.color);
    const leftColors  = colors.filter((_, i) => i < 2);
    const rightColors = colors.filter((_, i) => i >= 2);

    const panelLeft   = document.getElementById('panel-left');
    const panelRight  = document.getElementById('panel-right');
    const playerStrip = document.getElementById('player-strip');

    leftColors.forEach(color => panelLeft?.insertBefore(_makePlayerCard(color), panelLeft.firstChild));
    rightColors.forEach(color => {
      const existing = panelRight?.querySelector(`[data-color="${color}"]`);
      if (!existing) panelRight?.prepend(_makePlayerCard(color));
    });

    if (playerStrip) {
      playerStrip.innerHTML = '';
      colors.forEach(color => {
        playerStrip.appendChild(_makePlayerCard(color));
      });
    }
  }

  function _makePlayerCard(color) {
    const slot = slotConfig.find(s => s.color === color);
    const name = color === myColor ? myName : _nameFor(color);
    const div  = document.createElement('div');
    div.className = 'player-card';
    div.dataset.color = color;
    div.innerHTML = `
      <div class="pc-header">
        <div class="pc-dot" style="background:${TOKEN_COLORS[color]};box-shadow:0 0 8px ${TOKEN_COLORS[color]}66"></div>
        <div class="pc-name">${escapeHtml(name)}</div>
        <span class="pc-badge ${slot?.isBot ? 'bot' : (color === myColor ? 'you' : '')}">${slot?.isBot ? '🤖' : (color === myColor ? 'YOU' : '')}</span>
        <div class="pc-go-bubble">GO</div>
      </div>
      <div class="pc-tokens">
        ${[0,1,2,3].map(i => `<div class="pc-token-pip" style="background:${TOKEN_COLORS[color]}55;border-color:${TOKEN_COLORS[color]}88"></div>`).join('')}
      </div>
    `;
    return div;
  }

  // ---- Pause overlay ----
  function _showPausedOverlay(message, hostCanResume) {
    const overlay   = document.getElementById('paused-overlay');
    const subLabel  = document.getElementById('paused-by-label');
    const hint      = document.getElementById('paused-hint');
    const resumeBtn = document.getElementById('paused-resume-btn');
    if (!overlay) return;
    if (subLabel)  subLabel.textContent  = message;
    if (hint)      hint.textContent      = hostCanResume ? 'Click Resume to continue.' : 'Waiting for host to resume…';
    if (resumeBtn) resumeBtn.style.display = hostCanResume ? 'inline-flex' : 'none';
    overlay.style.display = 'flex';
  }

  function _hidePausedOverlay() {
    const overlay = document.getElementById('paused-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ---- Force-ended screen ----
  function _showEndedScreen(rankings) {
    const overlay = document.getElementById('win-overlay');
    const nameEl  = document.getElementById('win-name');
    const rankEl  = document.getElementById('win-rankings');
    const crownEl = overlay?.querySelector('.win-crown');
    const titleEl = overlay?.querySelector('.win-title');
    if (!overlay) { setTimeout(() => { window.location.href = '/'; }, 2000); return; }
    if (crownEl) crownEl.textContent = '🏁';
    if (titleEl) titleEl.textContent = 'Game Ended';
    if (nameEl)  { nameEl.textContent = 'Host ended the game'; nameEl.style.color = 'var(--text-muted)'; }
    if (rankEl && rankings?.length) {
      const medals = ['🥇','🥈','🥉','4️⃣'];
      rankEl.innerHTML = rankings.map((r, i) =>
        `<div>${medals[i] || (i+1)} ${escapeHtml(r.name || r.color)}</div>`
      ).join('');
    }
    overlay.style.display = 'flex';
    setTimeout(() => { window.location.href = '/'; }, 8000);
  }

  // ---- Win screen ----
  function _showWin(winnerColor, state) {
    TimerUI.stop();
    SoundEngine.play.win();
    ParticleSystem.celebrate(winnerColor);

    const winName = winnerColor === myColor ? myName : _nameFor(winnerColor);

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
    if (!s || s.currentColor !== myColor || s.phase !== 'rolling' || BoardRenderer.isAnimating()) return;
    SoundEngine.resume();
    const btn  = document.getElementById('roll-btn');
    const wrap = document.getElementById('dice-3d-wrap');
    if (btn)  btn.disabled = true;
    if (wrap) {
      wrap.classList.remove('dice-ready');
      wrap.classList.add('dice-rolling');
      // Remove rolling class after animation completes so it can retrigger
      setTimeout(() => wrap.classList.remove('dice-rolling'), 520);
    }
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

  function pauseGame() {
    if (!isHost) return;
    SocketClient.emit('pause-game', {});
  }

  function resumeGame() {
    if (!isHost) return;
    SocketClient.emit('resume-game', {});
  }

  function goBackToLobby() {
    if (currentState && currentState.phase === 'finished') {
      sessionStorage.removeItem('ludoRoom');
      sessionStorage.removeItem('ludoIsHost');
      sessionStorage.removeItem('ludoColor');
      window.location.href = '/';
      return;
    }

    const overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
      if (confirm("Leave the game? You can rejoin later using the room code.")) {
        sessionStorage.removeItem('ludoRoom');
        sessionStorage.removeItem('ludoIsHost');
        sessionStorage.removeItem('ludoColor');
        window.location.href = '/';
      }
      return;
    }

    // Customize overlay for leaving the game
    const title = overlay.querySelector('.confirm-title');
    const msg = overlay.querySelector('.confirm-msg');
    const okBtn = document.getElementById('confirm-ok-btn');

    if (title) title.textContent = "Leave Game?";
    if (msg) msg.textContent = "Are you sure you want to leave this game? You can rejoin later using the room code.";
    if (okBtn) {
      okBtn.textContent = "Leave Game";
      okBtn.className = "btn btn-danger btn-lg";
      okBtn.onclick = () => {
        sessionStorage.removeItem('ludoRoom');
        sessionStorage.removeItem('ludoIsHost');
        sessionStorage.removeItem('ludoColor');
        window.location.href = '/';
      };
    }

    overlay.style.display = 'flex';
  }

  function forceEndGame() {
    if (!isHost) return;
    const overlay = document.getElementById('confirm-overlay');
    if (!overlay) return;

    // Customize overlay for ending the game
    const title = overlay.querySelector('.confirm-title');
    const msg = overlay.querySelector('.confirm-msg');
    const okBtn = document.getElementById('confirm-ok-btn');

    if (title) title.textContent = "End Game?";
    if (msg) msg.textContent = "Are you sure you want to end the game for everyone? This will terminate the session and return all players to the lobby.";
    if (okBtn) {
      okBtn.textContent = "End Game";
      okBtn.className = "btn btn-danger btn-lg";
      okBtn.onclick = () => {
        confirmEndGame();
      };
    }

    overlay.style.display = 'flex';
  }

  function closeConfirmModal() {
    const overlay = document.getElementById('confirm-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function confirmEndGame() {
    if (!isHost) return;
    closeConfirmModal();
    SocketClient.emit('force-end-game', {});
  }

  return { init, rollDice, moveToken, sendReaction, sendChat, pauseGame, resumeGame, forceEndGame, closeConfirmModal, confirmEndGame, goBackToLobby };
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
