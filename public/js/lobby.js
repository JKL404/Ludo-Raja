// ============================================================
// lobby.js — Lobby page logic
// ============================================================

// ---- State ----
let selectedTheme = 'galaxy';
let roomCode = null;
let isHost = false;
let maxPlayers = 4;
const ALL_COLORS = ['blue','red','green','yellow'];
const DIAGONAL_MAP = { blue: 'green', green: 'blue', red: 'yellow', yellow: 'red' };
const COLOR_EMOJI = { red:'🔴', blue:'🔵', green:'🟢', yellow:'🟡' };

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  SoundEngine.init();
  _setupVolToggle();
  _generateStars();

  // Default pre-fill name
  const saved = sessionStorage.getItem('ludoName') || localStorage.getItem('ludoName');
  if (saved) {
    document.getElementById('create-name').value = saved;
    document.getElementById('join-name').value   = saved;
  }

  // Update join history when room code is typed
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
      const color = sessionStorage.getItem('ludoColor');
      const userId = SocketClient.getUserId();
      SocketClient.emit('join-room', { roomCode, name, color, userId });
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

function setPlayerCount(count) {
  maxPlayers = count;
  document.querySelectorAll('.player-count-selector .count-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.count) === count);
  });
}

// ---- Tab switching ----
function switchTab(tab) {
  ['create','join','history'].forEach(t => {
    const tabEl = document.getElementById(`tab-${t}`);
    const secEl = document.getElementById(`section-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (secEl) secEl.classList.toggle('active', t === tab);
  });
  if (tab === 'history') {
    _renderRecentRooms();
  }
}

// ---- Theme selection ----
function selectTheme(t) {
  selectedTheme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-galaxy').classList.toggle('selected', t === 'galaxy');
  document.getElementById('theme-classic').classList.toggle('selected', t === 'classic');
}

async function _updateJoinColors(code) {
  const histCard = document.getElementById('room-history-card');
  if (!histCard) return;

  if (code.length !== 6) {
    histCard.style.display = 'none';
    return;
  }

  const upper = code.toUpperCase();
  const histRes = await fetch(`/api/history/${upper}`).catch(() => null);

  if (histRes?.ok) {
    const h = await histRes.json();
    histCard.style.display = 'block';
    histCard.innerHTML = _renderHistoryCard(h);
  } else {
    histCard.style.display = 'block';
    histCard.innerHTML = '<div class="history-card" style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.85rem;">No previous games found for this room</div>';
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

  sessionStorage.setItem('ludoName', name);
  localStorage.setItem('ludoName', name);
  sessionStorage.removeItem('ludoColor');

  const res  = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxPlayers })
  });
  const data = await res.json();
  roomCode   = data.roomCode;
  saveRecentRoom(roomCode);

  const userId = SocketClient.getUserId();
  SocketClient.emit('join-room', { roomCode, name, color: null, userId });
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
  localStorage.setItem('ludoName', name);
  sessionStorage.removeItem('ludoColor');
  roomCode = code;
  saveRecentRoom(code);

  const userId = SocketClient.getUserId();
  SocketClient.emit('join-room', { roomCode: code, name, color: null, userId });
  document.getElementById('display-room-code').textContent = code;
  document.getElementById('waiting-room').style.display = 'block';
  document.querySelector('.lobby-card').style.display = 'none';
}

// ---- Start Game ----
function startGame() {
  if (!isHost) return;
  SocketClient.emit('start-game', {
    roomCode,
    theme: selectedTheme,
  });
}

// ---- Copy/Share room code ----
function copyRoomCode() {
  if (!roomCode) return;
  
  const hostName = sessionStorage.getItem('ludoName') || 'a friend';
  const shareUrl = `${window.location.origin}/?join=${roomCode}&host=${encodeURIComponent(hostName)}`;
  
  const shareData = {
    title: 'Ludo Raja 🇳🇵',
    text: `Play Ludo Raja with ${hostName}! Click the link to join Room ${roomCode}:`,
    url: shareUrl
  };
  
  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData)
      .then(() => showToast('Shared successfully!', 'success'))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          _copyToClipboardFallback(shareUrl);
        }
      });
  } else {
    _copyToClipboardFallback(shareUrl);
  }
}

function _copyToClipboardFallback(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('Share link copied to clipboard!', 'success'))
    .catch(() => showToast('Failed to copy link.', 'error'));
}

// ---- Socket handlers ----
function _setupSocketHandlers() {
  SocketClient.on('joined', ({ color, roomCode: rc }) => {
    sessionStorage.setItem('ludoColor', color);
    sessionStorage.setItem('ludoRoom', rc);
  });

  SocketClient.on('error', (data) => {
    if (data && data.message === 'Game already started') {
      // Quietly clean up stale session state and return to lobby card
      sessionStorage.removeItem('ludoRoom');
      sessionStorage.removeItem('ludoIsHost');
      sessionStorage.removeItem('ludoColor');
      document.getElementById('waiting-room').style.display = 'none';
      document.querySelector('.lobby-card').style.display = 'block';
      return;
    }

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
    // Determine if we are host based on server-provided hostUserId
    const myUserId = SocketClient.getUserId();
    isHost = (info.hostUserId === myUserId);
    sessionStorage.setItem('ludoIsHost', isHost ? 'true' : 'false');

    _renderPlayersList(info.players, info.maxPlayers, info.hostColor);
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

function _renderPlayersList(players, maxCount, hostColor) {
  const list = document.getElementById('players-list');
  if (!list) return;
  const myColor = sessionStorage.getItem('ludoColor');
  list.innerHTML = '';

  const baseColors = ['blue', 'red', 'green', 'yellow'];
  const host = hostColor || 'blue';
  const idx = baseColors.indexOf(host);
  
  const clockwise = [
    baseColors[idx],
    baseColors[(idx + 1) % 4],
    baseColors[(idx + 2) % 4],
    baseColors[(idx + 3) % 4]
  ];

  const allowedColors = maxCount === 2 ? [clockwise[0], clockwise[2]] :
                        maxCount === 3 ? [clockwise[0], clockwise[1], clockwise[2]] :
                        clockwise;

  allowedColors.forEach(color => {
    const p = players.find(player => player.color === color);
    const div = document.createElement('div');
    if (p) {
      div.className = 'player-badge';
      const isMe = p.color === myColor;
      div.innerHTML = `
        <div class="badge-dot" style="background:var(--clr-${p.color});box-shadow:0 0 8px var(--clr-${p.color}-glow)"></div>
        <div class="badge-name">${escapeHtml(p.name)}</div>
        ${isMe ? '<span class="badge-you">YOU</span>' : ''}
      `;
    } else {
      div.className = 'player-badge waiting';
      div.innerHTML = `
        <div class="badge-dot waiting"></div>
        <div class="badge-name waiting" style="color:var(--text-muted)">Waiting for player… (Bot if started)</div>
      `;
    }
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

// leaveRoom function
function leaveRoom() {
  sessionStorage.removeItem('ludoRoom');
  sessionStorage.removeItem('ludoIsHost');
  sessionStorage.removeItem('ludoColor');
  window.location.reload();
}

function saveRecentRoom(code) {
  if (!code) return;
  let rooms = [];
  try {
    rooms = JSON.parse(localStorage.getItem('ludoRecentRooms') || '[]');
  } catch(e) {}
  if (!Array.isArray(rooms)) rooms = [];

  // Migrate old string elements to objects
  rooms = rooms.map(r => typeof r === 'string' ? { code: r, timestamp: Date.now() } : r);

  // Filter out any duplicate code
  rooms = rooms.filter(r => r.code !== code);

  // Unshift new room with timestamp
  rooms.unshift({ code, timestamp: Date.now() });

  // Limit to 3 rooms
  if (rooms.length > 3) rooms = rooms.slice(0, 3);

  localStorage.setItem('ludoRecentRooms', JSON.stringify(rooms));
}

async function _renderRecentRooms() {
  const container = document.getElementById('recent-rooms-list');
  if (!container) return;
  
  let rooms = [];
  try {
    rooms = JSON.parse(localStorage.getItem('ludoRecentRooms') || '[]');
  } catch(e){}
  
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.95rem;">No recent games found. Create or join a room to get started!</div>';
    return;
  }

  rooms = rooms.map(r => typeof r === 'string' ? { code: r, timestamp: Date.now() } : r);
  
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Loading recent games…</div>';
  
  try {
    const fetches = rooms.map(r => 
      fetch(`/api/history/${r.code}`)
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );
    
    const results = await Promise.all(fetches);
    
    container.innerHTML = '';
    
    results.forEach((h, idx) => {
      const item = rooms[idx];
      const code = item.code;
      const timestamp = item.timestamp;
      const timeStr = timestamp ? new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

      const div = document.createElement('div');
      div.className = 'recent-room-item';
      div.style.marginBottom = '16px';
      
      if (h) {
        div.innerHTML = `
          <div class="hist-header-recent" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding: 0 4px;">
            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">ROOM: ${code} <span style="font-weight:normal;opacity:0.8;margin-left:6px;">(${timeStr})</span></span>
            <span style="cursor:pointer;color:var(--gold);font-size:0.75rem;font-weight:600;" onclick="quickJoin('${code}')">🚪 Rejoin / View</span>
          </div>
          ${_renderHistoryCard(h)}
        `;
      } else {
        div.innerHTML = `
          <div class="history-card" style="padding:14px;background:rgba(0,0,0,0.25);">
            <div class="hist-header" style="margin-bottom:0;">
              <span class="hist-title">ROOM: ${code} <span style="font-size:0.75rem;font-weight:normal;color:var(--text-muted);margin-left:6px;">(${timeStr})</span></span>
              <span class="hist-meta" style="cursor:pointer;color:var(--gold);font-weight:600;" onclick="quickJoin('${code}')">🚪 Join Room</span>
            </div>
          </div>
        `;
      }
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--clr-red);">Error loading recent games.</div>';
  }
}

window.quickJoin = function(code) {
  const codeInput = document.getElementById('join-code');
  if (codeInput) {
    codeInput.value = code;
    switchTab('join');
    _updateJoinColors(code);
  }
};
