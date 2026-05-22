// ============================================================
// server.js — Express + Socket.IO local game server
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./game/GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3000;
const rooms = {}; // roomCode → GameRoom

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerColor = color;
    room.joinPlayer(socket.id, name, color);

    io.to(roomCode).emit('room-updated', room.getRoomInfo());
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
  console.log('\n🎲 ==========================================');
  console.log('   Premium Ludo Game Server Running!');
  console.log('==========================================');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Network:  Run 'ipconfig getifaddr en0' to get your WiFi IP`);
  console.log('   Share the network URL with friends on same WiFi!');
  console.log('==========================================\n');
});

function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
