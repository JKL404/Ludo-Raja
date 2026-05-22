// ============================================================
// server.js — Express + Socket.IO game server (Render-ready)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./game/GameRoom');

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

// Use PORT from environment (Render injects this) or 3000 for local dev
const PORT = process.env.PORT || 3000;
const rooms = {}; // roomCode → GameRoom

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ---- Health check (required for Render) ----
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// ---- REST endpoints ----

// Create a room
app.post('/api/rooms', (req, res) => {
  const roomCode = _generateCode();
  const room = new GameRoom(roomCode, io);
  rooms[roomCode] = room;
  res.json({ roomCode });
});

// Check room exists
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getRoomInfo());
});

// ---- Socket.IO events ----
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // Join a room as a player
  socket.on('join-room', ({ roomCode, name, color }) => {
    roomCode = roomCode.toUpperCase();
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (room.status !== 'waiting') {
      // Re-join active game check: allow if player is reclaiming their assigned color slot
      const isRejoining = room.status === 'playing' &&
                          room.slotConfig.some(s => s.color === color) &&
                          (room.colorMap[color] === null || !room.players[room.colorMap[color]]);
      if (!isRejoining) {
        socket.emit('error', { message: 'Game already started' });
        return;
      }
    } else {
      // If lobby is waiting, make sure color isn't already taken by another human player
      const existingSocketId = room.colorMap[color];
      if (existingSocketId && room.players[existingSocketId] && existingSocketId !== socket.id) {
        socket.emit('error', { message: `Color ${color.toUpperCase()} is already taken!` });
        return;
      }
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerColor = color;
    room.joinPlayer(socket.id, name, color);

    if (room.status === 'playing') {
      // Send the current game state immediately to the rejoining player
      socket.emit('game-started', {
        slotConfig: room.slotConfig,
        theme: room.theme,
        state: room.game.getState(),
      });
      // Also send the remaining time for the turn
      if (room.timerStart) {
        const elapsed = Date.now() - room.timerStart;
        const remaining = Math.max(0, 30000 - elapsed);
        socket.emit('timer-start', { duration: remaining, color: room.game.currentColor });
      }
    } else {
      io.to(roomCode).emit('room-updated', room.getRoomInfo());
    }
    socket.emit('joined', { color, roomCode });
    console.log(`[+] ${name} (${color}) joined room ${roomCode}`);
  });

  // Start the game
  socket.on('start-game', ({ roomCode, slotConfig, theme }) => {
    roomCode = roomCode?.toUpperCase() || socket.roomCode;
    const room = rooms[roomCode];
    if (!room || room.hostSocketId !== socket.id) return;

    // Register bot slots (colorMap = null)
    for (const slot of slotConfig) {
      if (slot.isBot && !room.colorMap[slot.color]) {
        room.colorMap[slot.color] = null;
      }
    }

    const state = room.startGame(slotConfig, theme);
    io.to(roomCode).emit('game-started', {
      slotConfig,
      theme,
      state,
    });

    // If first turn is a bot, handle it
    room._handleBotTurnIfNeeded();
  });

  // Roll dice
  socket.on('roll-dice', () => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    room.handleRoll(socket.id);
  });

  // Move token
  socket.on('move-token', ({ tokenId }) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    room.handleMove(socket.id, tokenId);
  });

  // Emoji reaction
  socket.on('reaction', ({ emoji }) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    room.handleReaction(socket.id, emoji);
  });

  // Chat message
  socket.on('chat', ({ message }) => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
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
  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    room.removePlayer(socket.id);
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
