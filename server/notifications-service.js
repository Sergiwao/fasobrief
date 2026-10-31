/**
 * FASOBRIEF - Service de Notifications Internes Persistées
 *
 * RÈGLES DE CONFIDENTIALITÉ ET DE SOBRIÉTÉ :
 * - Aucune donnée déchiffrée ni aucun extrait de message/instruction n'est stocké
 *   dans une notification (le serveur ne connaît pas le contenu en clair).
 * - Regroupement automatique par clé de déduplication (dedup_key) tant que non lu
 *   pour éviter l'accumulation de notifications redondantes.
 * - Une notification n'accorde aucun droit d'accès : la ressource cible vérifie
 *   systématiquement l'appartenance et le statut du compte à l'ouverture.
 */

const crypto = require('node:crypto');
const { db } = require('./database');
const { sendToUser } = require('./ws-hub');

function isGroupMutedForUser(userRow, groupId) {
  if (!groupId || !userRow || !userRow.notif_muted_groups) return false;
  try {
    const muted = JSON.parse(userRow.notif_muted_groups);
    return Array.isArray(muted) && muted.includes(groupId);
  } catch (_) {
    return false;
  }
}

function createNotification({
  userId,
  type,
  dedupKey = null,
  groupId = null,
  instructionId = null,
  title,
  body
}) {
  const userRow = db.prepare(`
    SELECT id, status, is_revoked, notif_browser_enabled, notif_muted_groups
    FROM users WHERE id = ?
  `).get(userId);

  if (!userRow || userRow.status !== 'ACTIVE' || userRow.is_revoked === 1) {
    return null;
  }

  // Respect des préférences de sourdine uniquement pour les messages courants (pas les instructions urgentes)
  if (type === 'NEW_MESSAGE' && isGroupMutedForUser(userRow, groupId)) {
    return null;
  }

  if (dedupKey) {
    // Pour DEADLINE_SOON, ne jamais recréer même si déjà lue
    const existing = type === 'DEADLINE_SOON'
      ? db.prepare(`SELECT * FROM notifications WHERE user_id = ? AND dedup_key = ? LIMIT 1`).get(userId, dedupKey)
      : db.prepare(`SELECT * FROM notifications WHERE user_id = ? AND dedup_key = ? AND is_read = 0 LIMIT 1`).get(userId, dedupKey);

    if (existing) {
      if (type === 'DEADLINE_SOON') {
        return existing;
      }
      const nextCount = (existing.count || 1) + 1;
      const updatedBody = type === 'NEW_MESSAGE'
        ? `${nextCount} nouveaux messages chiffrés en attente de lecture`
        : body;

      db.prepare(`
        UPDATE notifications
        SET count = ?, title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextCount, title, updatedBody, existing.id);

      const updated = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(existing.id);
      const unreadCount = getUnreadCount(userId);
      sendToUser(userId, {
        type: 'NOTIFICATION_EVENT',
        notification: updated,
        unreadCount
      });
      return updated;
    }
  }

  const id = 'ntf_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO notifications (
      id, user_id, type, dedup_key, group_id, instruction_id, title, body, count, is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `).run(id, userId, type, dedupKey, groupId, instructionId, title, body);

  const created = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id);
  const unreadCount = getUnreadCount(userId);
  sendToUser(userId, {
    type: 'NOTIFICATION_EVENT',
    notification: created,
    unreadCount
  });
  return created;
}

function getUnreadCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0
  `).get(userId);
  return (row && row.cnt) || 0;
}

/**
 * Vérifie les instructions publiées dont l'échéance approche (< 24 h)
 * et notifie une seule fois chaque destinataire qui n'a pas encore déclaré l'exécution.
 */
function checkUpcomingInstructionDeadlines() {
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const dueSoon = db.prepare(`
    SELECT i.id, i.instruction_ref, i.version, i.deadline, i.group_id, ir.user_id
    FROM instructions i
    JOIN instruction_recipients ir ON ir.instruction_id = i.id
    JOIN users u ON u.id = ir.user_id
    WHERE i.status = 'PUBLIEE'
      AND i.deadline IS NOT NULL
      AND i.deadline > ?
      AND i.deadline <= ?
      AND ir.executed_at IS NULL
      AND u.status = 'ACTIVE'
      AND u.is_revoked = 0
  `).all(nowIso, in24hIso);

  let notified = 0;
  for (const row of dueSoon) {
    const res = createNotification({
      userId: row.user_id,
      type: 'DEADLINE_SOON',
      dedupKey: `deadline_24h:${row.id}:v${row.version}`,
      groupId: row.group_id,
      instructionId: row.id,
      title: `Échéance proche — ${row.instruction_ref}`,
      body: `Une instruction administrative arrive à échéance dans moins de 24 heures.`
    });
    if (res) notified++;
  }
  return notified;
}

module.exports = {
  createNotification,
  getUnreadCount,
  checkUpcomingInstructionDeadlines
};

