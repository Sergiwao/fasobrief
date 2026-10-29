/**
 * FASOBRIEF - Hub WebSocket Temps Réel Authentifié
 *
 * Gère les connexions temps réel par agent et par terminal, la diffusion
 * restreinte aux seuls membres actifs d'une conversation, et la coupure
 * synchrone immédiate lors d'une suspension ou d'une révocation.
 */

const { WebSocket } = require('ws');
const { db } = require('./database');

// userId -> Set<WebSocket>
const userSockets = new Map();

function registerSocket(user, ws, token, deviceId = null) {
  ws.fasoUserId = user.id;
  ws.fasoToken = token;
  ws.fasoDeviceId = deviceId || null;

  if (!userSockets.has(user.id)) {
    userSockets.set(user.id, new Set());
  }
  userSockets.get(user.id).add(ws);
}

function unregisterSocket(ws) {
  const userId = ws.fasoUserId;
  if (userId && userSockets.has(userId)) {
    const set = userSockets.get(userId);
    set.delete(ws);
    if (set.size === 0) {
      userSockets.delete(userId);
    }
  }
}

function sendToUser(userId, payload) {
  if (!userSockets.has(userId)) return 0;
  const serialized = JSON.stringify(payload);
  let sent = 0;
  for (const ws of userSockets.get(userId)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
      sent++;
    }
  }
  return sent;
}

function sendToDevice(userId, deviceId, payload) {
  if (!userSockets.has(userId)) return 0;
  const serialized = JSON.stringify(payload);
  let sent = 0;
  for (const ws of userSockets.get(userId)) {
    if (ws.readyState === WebSocket.OPEN && (!ws.fasoDeviceId || ws.fasoDeviceId === deviceId)) {
      ws.send(serialized);
      sent++;
    }
  }
  return sent;
}

function broadcastToGroup(groupId, payload, excludeUserId = null) {
  const members = db.prepare(`
    SELECT gm.user_id
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
  `).all(groupId);

  for (const m of members) {
    if (excludeUserId && m.user_id === excludeUserId) continue;
    sendToUser(m.user_id, payload);
  }
}

function disconnectUserSockets(userId, closeCode = 4001, closeReason = 'AGENT_REVOKED', alertPayload = null) {
  if (!userSockets.has(userId)) return 0;
  const sockets = Array.from(userSockets.get(userId));
  let closed = 0;
  for (const ws of sockets) {
    try {
      if (alertPayload && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(alertPayload));
      }
      ws.close(closeCode, closeReason);
      closed++;
    } catch (_) {
      // Socket déjà fermé
    }
  }
  userSockets.delete(userId);
  return closed;
}

module.exports = {
  userSockets,
  registerSocket,
  unregisterSocket,
  sendToUser,
  sendToDevice,
  broadcastToGroup,
  disconnectUserSockets
};
