// ============================================================
// RoomStore.js — Abstracted storage layer for persistent rooms
// ============================================================

class RoomStore {
  constructor() {
    this.redisClient = null;
    this.inMemoryRooms = {}; // Fallback in-memory map
  }

  async init() {
    const redisUrl = process.env.REDIS_URL || (process.env.NODE_ENV !== 'production' ? 'redis://127.0.0.1:6379' : null);
    if (redisUrl) {
      try {
        const { createClient } = require('redis');
        this.redisClient = createClient({ url: redisUrl });
        await this.redisClient.connect();
        console.log('[RoomStore] Connected to Redis:', redisUrl);
      } catch (err) {
        if (process.env.REDIS_URL) {
          console.error('[RoomStore] Redis connection failed, falling back to memory:', err.message);
        } else {
          console.log('[RoomStore] Local Redis not detected, using in-memory store.');
        }
        this.redisClient = null;
      }
    } else {
      console.log('[RoomStore] No REDIS_URL found, using in-memory store.');
    }
  }

  async get(roomCode) {
    if (!roomCode) return null;
    roomCode = roomCode.toUpperCase();
    if (this.redisClient) {
      try {
        const data = await this.redisClient.get(`room:${roomCode}`);
        if (data) {
          return JSON.parse(data);
        }
      } catch (err) {
        console.error(`[RoomStore] Error reading room ${roomCode} from Redis:`, err.message);
      }
    }
    return this.inMemoryRooms[roomCode] || null;
  }

  async saveRoom(room) {
    if (!room || !room.roomCode) return;
    const roomCode = room.roomCode.toUpperCase();
    const serialized = room.toJSON();
    if (this.redisClient) {
      try {
        // Expire rooms after 24 hours to prevent memory bloat in Redis
        await this.redisClient.set(`room:${roomCode}`, JSON.stringify(serialized), {
          EX: 86400 // 24 hours expiration
        });
      } catch (err) {
        console.error(`[RoomStore] Error saving room ${roomCode} to Redis:`, err.message);
      }
    }
    this.inMemoryRooms[roomCode] = serialized;
  }

  async delete(roomCode) {
    if (!roomCode) return;
    roomCode = roomCode.toUpperCase();
    if (this.redisClient) {
      try {
        await this.redisClient.del(`room:${roomCode}`);
      } catch (err) {
        console.error(`[RoomStore] Error deleting room ${roomCode} from Redis:`, err.message);
      }
    }
    delete this.inMemoryRooms[roomCode];
  }

  async exists(roomCode) {
    if (!roomCode) return false;
    roomCode = roomCode.toUpperCase();
    if (this.redisClient) {
      try {
        const count = await this.redisClient.exists(`room:${roomCode}`);
        return count > 0;
      } catch (err) {
        console.error(`[RoomStore] Error checking room ${roomCode} in Redis:`, err.message);
      }
    }
    return !!this.inMemoryRooms[roomCode];
  }

  async saveHistory(roomCode, data) {
    if (!roomCode) return;
    roomCode = roomCode.toUpperCase();
    if (this.redisClient) {
      try {
        await this.redisClient.set(`history:${roomCode}`, JSON.stringify(data), {
          EX: 86400 // 1 day
        });
      } catch (err) {
        console.error(`[RoomStore] Error saving history ${roomCode}:`, err.message);
      }
    }
    // In-memory fallback (no TTL enforcement, but capped at 50 entries)
    this._historyCache = this._historyCache || {};
    this._historyCache[roomCode] = data;
    const keys = Object.keys(this._historyCache);
    if (keys.length > 50) delete this._historyCache[keys[0]];
  }

  async getHistory(roomCode) {
    if (!roomCode) return null;
    roomCode = roomCode.toUpperCase();
    if (this.redisClient) {
      try {
        const data = await this.redisClient.get(`history:${roomCode}`);
        if (data) return JSON.parse(data);
      } catch (err) {
        console.error(`[RoomStore] Error reading history ${roomCode}:`, err.message);
      }
    }
    return this._historyCache?.[roomCode] || null;
  }
}

module.exports = RoomStore;
