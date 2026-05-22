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

  SocketClient.connect();
  _setupSocketHandlers();
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
  const next = ALL_COLORS.find(c => !used.includes(c));
  if (!next || slotConfig.length >= 4) return;
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
  selectedJoinColor = c;
  document.querySelectorAll('#join-color-grid .color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === c);
  });
}

// ---- Create Game ----
async function createGame() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  if (slotConfig.length < 2) { showToast('Add at least 2 slots', 'error'); return; }

  sessionStorage.setItem('ludoName', name);

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
  document.getElementById('wifi-url').textContent = `http://<your-ip>:3000  (run: ipconfig getifaddr en0)`;

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
    navigator.clipboard.writeText(roomCode).then(() => showToast('Room code copied!', 'success'));
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
  });

  SocketClient.on('room-updated', (info) => {
    _renderPlayersList(info.players);
    const startBtn  = document.getElementById('start-btn');
    const startHint = document.getElementById('start-hint');
    if (startBtn) {
      const canStart = isHost && info.players.length >= 1;
      startBtn.disabled = !canStart;
      if (startHint) startHint.textContent = canStart
        ? `Ready! ${info.players.length} human${info.players.length > 1 ? 's' : ''} connected.`
        : `Waiting for players…`;
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
