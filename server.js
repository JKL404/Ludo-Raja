// ============================================================
// server.js — Express + Socket.IO game server (Render-ready)
// ============================================================
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./game/GameRoom');
const RoomStore = require('./game/RoomStore');

const app = express();
const server = http.createServer(app);

// ---- Render / reverse-proxy support ----
// Trust the proxy so req.ip, req.protocol etc. are correct behind Render's load balancer
app.set('trust proxy', 1);

// Socket.IO — configured for Render:
// • cors: wildcard so any origin (Render URL or custom domain) can connect
// • transports: prefer WebSocket, fall back to polling (Render supports both)
// • pingTimeout / pingInterval tuned for Render's 30s idle timeout
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true,
});

// Configure Redis adapter if REDIS_URL is provided, or try local Redis in development
const adapterRedisUrl = process.env.REDIS_URL || (process.env.NODE_ENV !== 'production' ? 'redis://127.0.0.1:6379' : null);
if (adapterRedisUrl) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pubClient = createClient({ url: adapterRedisUrl });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log(`[Socket.IO] Connected to Redis Pub/Sub adapter at ${adapterRedisUrl}.`);
      })
      .catch((err) => {
        if (process.env.REDIS_URL) {
          console.error('[Socket.IO] Redis adapter connection failed:', err.message);
        } else {
          console.log('[Socket.IO] Local Redis not detected, using in-memory Socket.IO adapter.');
        }
      });
  } catch (err) {
    console.error('[Socket.IO] Failed to load/configure Redis adapter:', err.message);
  }
}

// Initialize RoomStore
const roomStore = new RoomStore();
roomStore.init().catch(err => {
  console.error('[RoomStore] Initialization failed:', err.message);
});

// Use PORT from environment (Render injects this) or 3000 for local dev
const PORT = process.env.PORT || 3000;
const rooms = {}; // roomCode → GameRoom local cache

async function getRoom(roomCode) {
  if (!roomCode) return null;
  const code = roomCode.toUpperCase();
  if (rooms[code]) {
    return rooms[code];
  }
  const data = await roomStore.get(code);
  if (data) {
    const room = GameRoom.fromJSON(data, io, roomStore);
    rooms[code] = room;
    return room;
  }
  return null;
}

// Intercept root requests with join code and dynamic host name to serve index.html with Open Graph meta tags
app.get(['/', '/index.html'], async (req, res, next) => {
  const host = req.query.host;
  const join = req.query.join;
  
  if (join) {
    try {
      const filePath = path.join(__dirname, 'public', 'index.html');
      let html = await fs.promises.readFile(filePath, 'utf8');
      
      const hostName = host ? decodeURIComponent(host) : 'a friend';
      const origin = `${req.protocol}://${req.get('host')}`;
      
      const ogTitle = `<meta property="og:title" content="Ludo Raja 🇳🇵 — Play with ${hostName}" />`;
      const ogDesc = `<meta property="og:description" content="Join Room ${join} to play Ludo Raja with ${hostName} in real-time!" />`;
      const ogImage = `<meta property="og:image" content="${origin}/favicon.png" />`;
      const ogUrl = `<meta property="og:url" content="${origin}/?join=${join}&host=${encodeURIComponent(hostName)}" />`;
      const ogType = `<meta property="og:type" content="website" />`;
      
      const tags = `\n  ${ogTitle}\n  ${ogDesc}\n  ${ogImage}\n  ${ogUrl}\n  ${ogType}`;
      html = html.replace('</head>', `${tags}\n</head>`);
      
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(html);
    } catch (err) {
      console.error('[OG Tag Injection Error]', err);
    }
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));
app.use(express.json());

// ---- Health check (required for Render) ----
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// ---- REST endpoints ----

// Create a room
app.post('/api/rooms', async (req, res) => {
  const { maxPlayers } = req.body;
  const roomCode = _generateCode();
  const room = new GameRoom(roomCode, io, roomStore);
  room.maxPlayers = maxPlayers || 4;
  rooms[roomCode] = room;
  await roomStore.saveRoom(room);
  res.json({ roomCode });
});

// Check room exists
app.get('/api/rooms/:code', async (req, res) => {
  const room = await getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getRoomInfo());
});

// Get game history for a finished room (1-day TTL)
app.get('/api/history/:code', async (req, res) => {
  const history = await roomStore.getHistory(req.params.code);
  if (!history) return res.status(404).json({ error: 'No history found for this room' });
  res.json(history);
});

// ---- Socket.IO events ----
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // Join a room as a player
  socket.on('join-room', async ({ roomCode, name, color, userId }) => {
    roomCode = roomCode.toUpperCase();
    const room = await getRoom(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Determine player color based on userId or next free slot
    const allowedColors = room.getAllowedColors();
    let assignedColor = color;
    if (assignedColor && !allowedColors.includes(assignedColor)) {
      assignedColor = null;
    }

    if (room.userIdMap && room.userIdMap[userId]) {
      assignedColor = room.userIdMap[userId];
    }

    if (!assignedColor || !allowedColors.includes(assignedColor)) {
      const takenColors = Object.values(room.players).map(p => p.color);
      const freeColor = allowedColors.find(c => !takenColors.includes(c));
      if (!freeColor) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      assignedColor = freeColor;
    }

    if (room.status !== 'waiting') {
      // Allow re-joining any non-bot slot in a live or paused game.
      const isRejoining = (room.status === 'playing' || room.status === 'paused') &&
                          room.slotConfig.some(s => s.color === assignedColor && !s.isBot);
      if (!isRejoining) {
        socket.emit('error', { message: 'Game already started' });
        return;
      }
    } else {
      // If lobby is waiting, make sure color isn't already taken by another human player
      const existingSocketId = room.colorMap[assignedColor];
      if (existingSocketId && room.players[existingSocketId] && existingSocketId !== socket.id) {
        socket.emit('error', { message: `Color ${assignedColor.toUpperCase()} is already taken!` });
        return;
      }
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerColor = assignedColor;
    await room.joinPlayer(socket.id, name, assignedColor, userId);

    if (room.status === 'playing' || room.status === 'paused') {
      const isPaused = room.status === 'paused';
      // Send the current game state immediately to the rejoining player
      socket.emit('game-started', {
        slotConfig: room.slotConfig,
        hostColor: room.hostColor,
        theme: room.theme,
        state: room.game.getState(),
        isPaused,
      });
      // Send remaining timer only if game is actively running
      if (!isPaused && room.timerStart) {
        const elapsed = Date.now() - room.timerStart;
        const remaining = Math.max(0, 30000 - elapsed);
        socket.emit('timer-start', { duration: remaining, color: room.game.currentColor });
      }
    } else {
      io.to(roomCode).emit('room-updated', room.getRoomInfo());
    }
    socket.emit('joined', { color: assignedColor, roomCode });
    console.log(`[+] ${name} (${assignedColor}) joined room ${roomCode}`);
  });

  // Start the game
  socket.on('start-game', async ({ roomCode, theme }) => {
    roomCode = roomCode?.toUpperCase() || socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;

    // Automatically build slotConfig on start (empty slots become bots)
    const slotConfig = room.buildStartSlotConfig();

    // Register bot slots (colorMap = null)
    for (const slot of slotConfig) {
      if (slot.isBot && !room.colorMap[slot.color]) {
        room.colorMap[slot.color] = null;
      }
    }

    const state = await room.startGame(slotConfig, theme);
    io.to(roomCode).emit('game-started', {
      slotConfig: room.slotConfig, // enriched with real player names
      hostColor: room.hostColor,
      theme,
      state,
    });

    // If first turn is a bot, handle it
    room._handleBotTurnIfNeeded();
  });

  // Host pauses / resumes the game
  socket.on('pause-game', async () => {
    const room = await getRoom(socket.roomCode);
    if (room) await room.pause(socket.id);
  });

  socket.on('resume-game', async () => {
    const room = await getRoom(socket.roomCode);
    if (room) await room.resume(socket.id);
  });

  // Host force-ends the game
  socket.on('force-end-game', async () => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    await room.forceEnd(socket.id);
  });

  // Roll dice
  socket.on('roll-dice', async () => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    await room.handleRoll(socket.id);
  });

  // Move token
  socket.on('move-token', async ({ tokenId }) => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    await room.handleMove(socket.id, tokenId);
  });

  // Emoji reaction
  socket.on('reaction', async ({ emoji }) => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    room.handleReaction(socket.id, emoji);
  });

  // Chat message
  socket.on('chat', async ({ message }) => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;
    io.to(roomCode).emit('chat', {
      name: player.name,
      color: player.color,
      message: message.substring(0, 100),
      ts: Date.now(),
    });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const roomCode = socket.roomCode;
    const room = await getRoom(roomCode);
    if (!room) return;
    await room.removePlayer(socket.id);
    if (room.status === 'waiting') {
      io.to(roomCode).emit('room-updated', room.getRoomInfo());
    }
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

// ---- Start server ----
server.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  console.log('\n🎲 ==========================================');
  console.log('   Premium Ludo Game Server Running!');
  console.log(`   Environment: ${env}`);
  console.log('==========================================');
  console.log(`   Local:    http://localhost:${PORT}`);
  if (env !== 'production') {
    console.log(`   Network:  Run 'ipconfig getifaddr en0' to get your WiFi IP`);
    console.log('   Share the network URL with friends on same WiFi!');
  } else {
    console.log('   Deployed on Render — use your Render URL to play!');
  }
  console.log('==========================================\n');
});

// ---- Graceful shutdown (Render sends SIGTERM on deploy/scale) ----
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
