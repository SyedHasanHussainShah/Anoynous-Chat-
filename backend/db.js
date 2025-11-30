const Database = require('better-sqlite3');

const db = new Database('data.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT UNIQUE NOT NULL,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender TEXT CHECK(sender IN ('user1','user2')) NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const isIpBannedStmt = db.prepare('SELECT 1 FROM banned_ips WHERE ip_address = ? LIMIT 1');
const insertBanStmt = db.prepare('INSERT OR IGNORE INTO banned_ips (ip_address, reason) VALUES (?, ?)');
const listBansStmt = db.prepare('SELECT id, ip_address, reason, timestamp FROM banned_ips ORDER BY timestamp DESC');
const deleteBanStmt = db.prepare('DELETE FROM banned_ips WHERE ip_address = ?');
const insertLogStmt = db.prepare('INSERT INTO chat_logs (room_id, sender, message) VALUES (?, ?, ?)');
const listLogsByRoomStmt = db.prepare('SELECT room_id, sender, message, timestamp FROM chat_logs WHERE room_id = ? ORDER BY id DESC LIMIT ?');
const listLogsRecentStmt = db.prepare('SELECT room_id, sender, message, timestamp FROM chat_logs ORDER BY id DESC LIMIT ?');

function isIpBanned(ip) {
  try {
    return Boolean(isIpBannedStmt.get(ip));
  } catch (e) {
    return false;
  }
}

function banIp(ip, reason = null) {
  insertBanStmt.run(ip, reason);
}

function unbanIp(ip) {
  deleteBanStmt.run(ip);
}

function getBannedIps() {
  return listBansStmt.all();
}

function logMessage(roomId, sender, message) {
  try {
    insertLogStmt.run(roomId, sender, message);
  } catch (e) {}
}

function getLogs(roomId, limit=50) {
  const lim = Number(limit) || 50;
  if (roomId) return listLogsByRoomStmt.all(roomId, lim);
  return listLogsRecentStmt.all(lim);
}

module.exports = {
  isIpBanned,
  banIp,
  unbanIp,
  getBannedIps,
  logMessage,
  getLogs,
};
