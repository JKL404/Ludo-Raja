// ============================================================
// lobby.js — Lobby page logic
// ============================================================

// ---- State ----
let selectedTheme = 'galaxy';
let selectedColor = 'red';
let selectedJoinColor = 'red';
let roomCode = null;
let isHost = false;
let slotConfig = []; // [{color, isBot}]
const ALL_COLORS = ['red','blue','green','yellow'];
const DIAGONAL_MAP = { red: 'green', green: 'red', blue: 'yellow', yellow: 'blue' };
const COLOR_EMOJI = { red:'🔴', blue:'🔵', green:'🟢', yellow:'🟡' };

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  SoundEngine.init();
  _setupVolToggle();
  _generateStars();
  _initSlots();

  // Default pre-fill name
  const saved = sessionStorage.getItem('ludoName');
  if (saved) {
    document.getElementById('create-name').value = saved;
    document.getElementById('join-name').value   = saved;
  }

  // Update join color grid when room code is typed
  document.getElementById('join-code')?.addEventListener('input', (e) => {
    _updateJoinColors(e.target.value.trim());
  });

  // Restore active room session if page was reloaded/re-opened
  const savedRoom = sessionStorage.getItem('ludoRoom');
  if (savedRoom && savedRoom.length === 6) {
    roomCode = savedRoom;
    isHost = sessionStorage.getItem('ludoIsHost') === 'true';
    document.getElementById('display-room-code').textContent = roomCode;
    document.getElementById('waiting-room').style.display = 'block';
    const lobbyCard = document.querySelector('.lobby-card');
    if (lobbyCard) lobbyCard.style.display = 'none';

    // Show WiFi hint
    const wifiEl = document.getElementById('wifi-url');
    if (wifiEl) wifiEl.textContent = `http://<your-ip>:3000  (run: ipconfig getifaddr en0)`;
  }

  SocketClient.connect();
  _setupSocketHandlers();

  // Handle share link: ?join=XXXXXX auto-fills room code and switches to Join tab
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('join');
  if (joinCode && joinCode.length === 6) {
    const codeInput = document.getElementById('join-code');
    if (codeInput) {
      codeInput.value = joinCode.toUpperCase();
      switchTab('join');
      _updateJoinColors(joinCode.toUpperCase());
    }
    // Clean the URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
  }

  SocketClient.on('connect', () => {
    if (roomCode) {
      const name = sessionStorage.getItem('ludoName') || 'Player';
      const color = sessionStorage.getItem('ludoColor') || (isHost ? selectedColor : selectedJoinColor);
      SocketClient.emit('join-room', { roomCode, name, color });
    }
  });
});

function _setupVolToggle() {
  document.getElementById('vol-toggle').addEventListener('click', () => SoundEngine.toggleMute());
}

function _generateStars() {
  const bg = document.getElementById('stars-bg');
  if (!bg) return;
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.cssText = `
      left:${Math.random()*100}%;
      bottom:${Math.random()*100}%;
      width:${1+Math.random()*3}px;
      height:${1+Math.random()*3}px;
      animation-duration:${8+Math.random()*20}s;
      animation-delay:${-Math.random()*20}s;
      opacity:${0.3+Math.random()*0.7};
    `;
    bg.appendChild(s);
  }
}

function _initSlots() {
  // Default: 1 human (host) + rest TBD
  slotConfig = [{ color: 'red', isBot: false, isHost: true }];
  _renderSlots();
}

function _renderSlots() {
  const container = document.getElementById('slots-config');
  if (!container) return;
  container.innerHTML = '';

  slotConfig.forEach((slot, idx) => {
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <div class="slot-dot ${slot.color}"></div>
      <div class="slot-color-name">${slot.color}</div>
      <div class="slot-toggle">
        <button class="${!slot.isBot ? 'active' : ''}" onclick="setSlotType(${idx}, false)">Human</button>
        <button class="${slot.isBot ? 'active bot' : ''}" onclick="setSlotType(${idx}, true)">Bot 🤖</button>
      </div>
      ${idx > 0 ? `<button class="slot-remove" onclick="removeSlot(${idx})">✕</button>` : ''}
    `;
    container.appendChild(row);
  });

  // Show/hide add button
  const addBtn = document.getElementById('add-slot-btn');
  if (addBtn) addBtn.style.display = slotConfig.length >= 4 ? 'none' : 'block';
}

function setSlotType(idx, isBot) {
  slotConfig[idx].isBot = isBot;
  _renderSlots();
}

function removeSlot(idx) {
  slotConfig.splice(idx, 1);
  _renderSlots();
}

function addSlot() {
  const used = slotConfig.map(s => s.color);
  if (slotConfig.length >= 4) return;
  // For the 2nd slot, prefer diagonal color for better gameplay
  let next;
  if (slotConfig.length === 1) {
    const hostColor = slotConfig[0].color;
    const diagonal = DIAGONAL_MAP[hostColor];
    next = !used.includes(diagonal) ? diagonal : ALL_COLORS.find(c => !used.includes(c));
  } else {
    next = ALL_COLORS.find(c => !used.includes(c));
  }
  if (!next) return;
  slotConfig.push({ color: next, isBot: true });
  _renderSlots();
}

// ---- Tab switching ----
function switchTab(tab) {
  ['create','join'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`section-${t}`).classList.toggle('active', t === tab);
  });
}

// ---- Theme selection ----
function selectTheme(t) {
  selectedTheme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-galaxy').classList.toggle('selected', t === 'galaxy');
  document.getElementById('theme-classic').classList.toggle('selected', t === 'classic');
}

// ---- Color selection ----
function selectColor(c) {
  const oldColor = selectedColor;
  selectedColor = c;
  if (slotConfig[0]) {
    // If the color c is already used by another slot, swap it with the old color
    const existingIdx = slotConfig.findIndex((s, idx) => idx > 0 && s.color === c);
    if (existingIdx !== -1) {
      slotConfig[existingIdx].color = oldColor;
    }
    slotConfig[0].color = c;
    _renderSlots();
  }
  document.querySelectorAll('.color-grid .color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === c);
  });
}

function selectJoinColor(c) {
  const el = document.querySelector(`#join-color-grid .color-option[data-color="${c}"]`);
  if (el && el.classList.contains('taken')) return;
  selectedJoinColor = c;
  document.querySelectorAll('#join-color-grid .color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === c);
  });
}

async function _updateJoinColors(code) {
  const grid = document.getElementById('join-color-grid');
  const histCard = document.getElementById('room-history-card');
  if (!grid) return;

  if (code.length !== 6) {
    grid.querySelectorAll('.color-option').forEach(el => el.classList.remove('taken'));
    if (histCard) histCard.style.display = 'none';
    return;
  }

  const upper = code.toUpperCase();

  // Fetch room info and history in parallel
  const [roomRes, histRes] = await Promise.all([
    fetch(`/api/rooms/${upper}`).catch(() => null),
    fetch(`/api/history/${upper}`).catch(() => null),
  ]);

  // Update taken colors
  if (roomRes?.ok) {
    const info = await roomRes.json();
    const takenColors = (info.players || []).map(p => p.color);
    grid.querySelectorAll('.color-option').forEach(el => {
      el.classList.toggle('taken', takenColors.includes(el.dataset.color));
    });
    if (takenColors.includes(selectedJoinColor)) {
      const free = ALL_COLORS.find(c => !takenColors.includes(c));
      if (free) selectJoinColor(free);
    }
  }

  // Show last game history card if available
  if (histCard) {
    if (histRes?.ok) {
      const h = await histRes.json();
      histCard.style.display = 'block';
      histCard.innerHTML = _renderHistoryCard(h);
    } else {
      histCard.style.display = 'block';
      histCard.innerHTML = '<div class="history-card" style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.85rem;">No previous games found for this room</div>';
    }
  }
}

function _renderHistoryCard(h) {
  const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
  const REASON_LABEL = { win: 'Completed', host_ended: 'Ended by host' };
  const duration = h.durationSecs
    ? `${Math.floor(h.durationSecs / 60)}m ${h.durationSecs % 60}s`
    : '';
  const date = h.finishedAt
    ? new Date(h.finishedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const rows = (h.rankings || []).map((r, i) => `
    <div class="hist-row">
      <span class="hist-medal">${MEDALS[i] || (i + 1)}</span>
      <span class="hist-dot" style="background:var(--clr-${r.color})"></span>
      <span class="hist-name">${escapeHtml(r.name || r.color)}</span>
      ${r.isBot ? '<span class="hist-bot">BOT</span>' : ''}
    </div>`).join('');

  return `
    <div class="history-card">
      <div class="hist-header">
        <span class="hist-title">Last Game</span>
        <span class="hist-meta">${REASON_LABEL[h.reason] || ''} · ${duration} · ${date}</span>
      </div>
      <div class="hist-rankings">${rows}</div>
    </div>`;
}

// ---- Create Game ----
async function createGame() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  if (slotConfig.length < 2) { showToast('Add at least 2 slots', 'error'); return; }

  sessionStorage.setItem('ludoName', name);
  sessionStorage.setItem('ludoIsHost', 'true');

  const res  = await fetch('/api/rooms', { method: 'POST' });
  const data = await res.json();
  roomCode   = data.roomCode;
  isHost     = true;

  // Make sure host color is first slot
  slotConfig[0].color = selectedColor;
  slotConfig[0].isBot = false;

  SocketClient.emit('join-room', { roomCode, name, color: selectedColor });
  document.getElementById('display-room-code').textContent = roomCode;
  document.getElementById('waiting-room').style.display = 'block';

  // Show WiFi hint
  const wifiEl = document.getElementById('wifi-url');
  if (wifiEl) wifiEl.textContent = `http://<your-ip>:3000  (run: ipconfig getifaddr en0)`;

  // Hide main card
  document.querySelector('.lobby-card').style.display = 'none';
}

// ---- Join Game ----
function joinGame() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  if (code.length !== 6) { showToast('Enter a valid 6-letter room code', 'error'); return; }

  sessionStorage.setItem('ludoName', name);
  sessionStorage.setItem('ludoIsHost', 'false');
  roomCode = code;
  isHost   = false;

  SocketClient.emit('join-room', { roomCode: code, name, color: selectedJoinColor });
  document.getElementById('display-room-code').textContent = code;
  document.getElementById('waiting-room').style.display = 'block';
  document.querySelector('.lobby-card').style.display = 'none';
}

// ---- Start Game ----
function startGame() {
  if (!isHost) return;
  SocketClient.emit('start-game', {
    roomCode,
    slotConfig,
    theme: selectedTheme,
  });
}

// ---- Copy room code ----
function copyRoomCode() {
  if (roomCode) {
    const shareUrl = `${window.location.origin}/?join=${roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => showToast('Share link copied!', 'success'));
  }
}

// ---- Socket handlers ----
function _setupSocketHandlers() {
  SocketClient.on('joined', ({ color, roomCode: rc }) => {
    sessionStorage.setItem('ludoColor', color);
    sessionStorage.setItem('ludoRoom', rc);
  });

  SocketClient.on('error', (data) => {
    document.getElementById('waiting-room').style.display = 'none';
    document.querySelector('.lobby-card').style.display = 'block';
    
    // Clear room session to prevent reconnect loop on error
    sessionStorage.removeItem('ludoRoom');
    sessionStorage.removeItem('ludoIsHost');
    sessionStorage.removeItem('ludoColor');

    if (data && data.message) {
      showToast(data.message, 'error');
    }
    if (data && data.message === 'Room not found') {
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    }
  });

  SocketClient.on('room-updated', (info) => {
    _renderPlayersList(info.players);
    // Keep a color→name map in sessionStorage so game page always has real names
    const nameMap = {};
    (info.players || []).forEach(p => { nameMap[p.color] = p.name; });
    sessionStorage.setItem('ludoPlayerNames', JSON.stringify(nameMap));
    const startBtn  = document.getElementById('start-btn');
    const startHint = document.getElementById('start-hint');
    if (startBtn) {
      if (!isHost) {
        startBtn.style.display = 'none';
        if (startHint) startHint.textContent = `Waiting for host to start…`;
      } else {
        startBtn.style.display = 'block';
        const canStart = info.players.length >= 1;
        startBtn.disabled = !canStart;
        if (startHint) startHint.textContent = canStart
          ? `Ready! ${info.players.length} human${info.players.length > 1 ? 's' : ''} connected.`
          : `Waiting for players…`;
      }
    }
  });

  SocketClient.on('game-started', ({ slotConfig: sc, theme: t }) => {
    // Store info for game page
    sessionStorage.setItem('ludoTheme', t);
    sessionStorage.setItem('ludoSlots', JSON.stringify(sc));
    // Navigate to game
    window.location.href = '/game.html';
  });
}

function _renderPlayersList(players) {
  const list = document.getElementById('players-list');
  if (!list) return;
  const myColor = sessionStorage.getItem('ludoColor');
  list.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-badge';
    const isMe = p.color === myColor;
    div.innerHTML = `
      <div class="badge-dot" style="background:var(--clr-${p.color});box-shadow:0 0 8px var(--clr-${p.color}-glow)"></div>
      <div class="badge-name">${escapeHtml(p.name)}</div>
      ${isMe ? '<span class="badge-you">YOU</span>' : ''}
    `;
    list.appendChild(div);
  });
}

// ---- Toast helper ----
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function leaveRoom() {
  sessionStorage.removeItem('ludoRoom');
  sessionStorage.removeItem('ludoIsHost');
  sessionStorage.removeItem('ludoColor');
  window.location.reload();
}
