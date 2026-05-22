// ============================================================
// socket-client.js — Socket.IO client wrapper
// ============================================================
const SocketClient = (() => {
  let socket = null;
  const handlers = {};

  function connect() {
    socket = io();

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      if (handlers.connect) handlers.connect(socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      if (handlers.disconnect) handlers.disconnect();
    });

    socket.on('error', (data) => {
      console.error('[Socket] Error:', data.message);
      showToast(data.message, 'error');
    });

    // Game events — delegate to registered handlers
    const events = [
      'joined', 'room-updated', 'game-started',
      'dice-rolled', 'token-moved', 'turn-skipped',
      'timer-start', 'reaction', 'chat',
    ];
    events.forEach(evt => {
      socket.on(evt, (data) => {
        if (handlers[evt]) handlers[evt](data);
      });
    });
  }

  function on(event, fn) { handlers[event] = fn; }

  function emit(event, data) {
    if (socket) socket.emit(event, data);
  }

  function getSocketId() { return socket?.id; }

  return { connect, on, emit, getSocketId };
})();

window.SocketClient = SocketClient;
