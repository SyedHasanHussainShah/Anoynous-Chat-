const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const db = require('./db');

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'CHANGE_ME';
const ENABLE_LOGS = String(process.env.ENABLE_LOGS || 'false').toLowerCase() === 'true';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase();
if (TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else if (TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
} else {
  // Accept a number (count of proxies) or explicit subnet/IP string
  const num = Number(TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(num) ? process.env.TRUST_PROXY : num);
}

const limiter = rateLimit({
  windowMs: 15 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

function getIp(reqOrSocket) {
  const headers = reqOrSocket.handshake ? reqOrSocket.handshake.headers : reqOrSocket.headers;
  const xff = headers && headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  if (reqOrSocket.handshake) return reqOrSocket.handshake.address || reqOrSocket.conn.remoteAddress;
  return reqOrSocket.ip || reqOrSocket.socket?.remoteAddress;
}

const waitingQueue = [];
const rooms = new Map(); // roomId -> { user1, user2, ip1, ip2 }
const partnerBySocket = new Map(); // socket.id -> partnerSocketId
const roomBySocket = new Map(); // socket.id -> roomId

// Per-socket message rate limit
const msgState = new Map(); // socket.id -> { tokens, last }
function canSend(socket) {
  const now = Date.now();
  const state = msgState.get(socket.id) || { tokens: 10, last: now };
  const refillRate = 5; // tokens per second
  const capacity = 10;
  const elapsed = (now - state.last) / 1000;
  state.tokens = Math.min(capacity, state.tokens + elapsed * refillRate);
  state.last = now;
  if (state.tokens >= 1) {
    state.tokens -= 1;
    msgState.set(socket.id, state);
    return true;
  }
  msgState.set(socket.id, state);
  return false;
}

function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 2000);
}

io.use((socket, next) => {
  const ip = getIp(socket) || '';
  if (db.isIpBanned(ip)) {
    return next(new Error('banned'));
  }
  next();
});

io.on('connection', (socket) => {
  const ip = getIp(socket) || '';

  socket.on('start_chat', () => {
    // Ensure clean state for this socket
    // Remove all existing occurrences in waiting queue
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
      if (waitingQueue[i] && waitingQueue[i].id === socket.id) waitingQueue.splice(i, 1)
    }
    // If any stale room mapping exists, clear it
    const existingRoom = roomBySocket.get(socket.id)
    if (existingRoom) {
      const info = rooms.get(existingRoom)
      if (info) {
        const partner = info.user1.id === socket.id ? info.user2 : info.user1
        io.to(existingRoom).emit('chat_ended', { reason: 'peer_disconnected' })
        rooms.delete(existingRoom)
        if (partner && !partner.disconnected) {
          partner.leave(existingRoom)
          partnerBySocket.delete(partner.id)
          roomBySocket.delete(partner.id)
        }
      }
      socket.leave(existingRoom)
      partnerBySocket.delete(socket.id)
      roomBySocket.delete(socket.id)
    }
    if (db.isIpBanned(ip)) {
      socket.emit('system', 'Access blocked.');
      return;
    }

    // Try to find a valid partner, skipping stale sockets
    let partner = null;
    while (waitingQueue.length) {
      const candidate = waitingQueue.shift();
      if (candidate && !candidate.disconnected && !roomBySocket.get(candidate.id)) {
        partner = candidate;
        break;
      }
    }

    if (!partner) {
      if (!waitingQueue.includes(socket)) waitingQueue.push(socket);
      socket.emit('system', 'Searching for a stranger…');
      return;
    }

    const roomId = `room_${uuidv4()}`;
    const ipPartner = getIp(partner) || '';

    rooms.set(roomId, { user1: socket, user2: partner, ip1: ip, ip2: ipPartner });
    partnerBySocket.set(socket.id, partner.id);
    partnerBySocket.set(partner.id, socket.id);
    roomBySocket.set(socket.id, roomId);
    roomBySocket.set(partner.id, roomId);

    socket.join(roomId);
    partner.join(roomId);

    socket.emit('system', 'You are now connected.');
    partner.emit('system', 'You are now connected.');
    socket.emit('paired', { roomId, role: 'user1' });
    partner.emit('paired', { roomId, role: 'user2' });
  });

  socket.on('message', (payload) => {
    const roomId = roomBySocket.get(socket.id);
    if (!roomId) return;
    if (!canSend(socket)) {
      socket.emit('system', 'You are sending messages too fast.');
      return;
    }
    const text = sanitize(payload?.text || '');
    if (!text) return;
    const info = rooms.get(roomId);
    if (!info) return;
    const senderRole = info.user1.id === socket.id ? 'user1' : 'user2';
    const timestamp = new Date().toISOString();
    db.logMessage(roomId, senderRole, text, ENABLE_LOGS);
    io.to(roomId).emit('message', { from: senderRole, text, timestamp });
  });

  socket.on('disconnect', () => {
    const roomId = roomBySocket.get(socket.id);
    // Remove from waiting queue if present
    const idx = waitingQueue.indexOf(socket);
    if (idx >= 0) waitingQueue.splice(idx, 1);

    if (roomId) {
      const info = rooms.get(roomId);
      if (info) {
        const partner = info.user1.id === socket.id ? info.user2 : info.user1;
        io.to(roomId).emit('chat_ended', { reason: 'peer_disconnected' });
        rooms.delete(roomId);
        if (partner && !partner.disconnected) {
          partner.leave(roomId);
          partnerBySocket.delete(partner.id);
          roomBySocket.delete(partner.id);
        }
      }
      partnerBySocket.delete(socket.id);
      roomBySocket.delete(socket.id);
    }
  });

  socket.on('disconnect_request', () => {
    // Remove from waiting queue if present
    const idx = waitingQueue.indexOf(socket);
    if (idx >= 0) waitingQueue.splice(idx, 1);

    const roomId = roomBySocket.get(socket.id);
    if (roomId) {
      const info = rooms.get(roomId);
      const partner = info && (info.user1.id === socket.id ? info.user2 : info.user1);
      io.to(roomId).emit('chat_ended', { reason: 'user_request' });
      rooms.delete(roomId);
      if (partner && !partner.disconnected) {
        partner.leave(roomId);
        partnerBySocket.delete(partner.id);
        roomBySocket.delete(partner.id);
      }
      socket.leave(roomId);
      partnerBySocket.delete(socket.id);
      roomBySocket.delete(socket.id);
    }
    // Keep the socket connected so the user can start a new chat immediately
  });
});

function requireAdmin(req, res, next) {
  const key = String(req.query.key || '');
  if (key !== ADMIN_SECRET) return res.status(403).json({ error: 'forbidden' });
  next();
}

app.get('/admin', requireAdmin, (req, res) => {
  const active = [];
  for (const [roomId, info] of rooms.entries()) {
    active.push({
      room_id: roomId,
      ips: [info.ip1, info.ip2],
    });
  }
  const waitingCount = waitingQueue.length;
  res.json({ active_rooms: active, waiting_count: waitingCount, banned_ips: db.getBannedIps() });
});

app.post('/admin/ban', requireAdmin, (req, res) => {
  const ip = String(req.body.ip || '').trim();
  const reason = req.body.reason ? String(req.body.reason) : null;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  db.banIp(ip, reason);
  res.json({ ok: true });
});

app.post('/admin/unban', requireAdmin, (req, res) => {
  const ip = String(req.body.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'ip required' });
  db.unbanIp(ip);
  res.json({ ok: true });
});

let currentPort = PORT;
let attempts = 0;
function tryListen() {
  server.listen(currentPort, () => {
    console.log(`Backend listening on http://localhost:${currentPort}`);
  });
}
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && attempts < 10) {
    currentPort += 1;
    attempts += 1;
    setTimeout(tryListen, 200);
  } else {
    throw err;
  }
});
tryListen();
