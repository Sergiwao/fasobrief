/**
 * FASOBRIEF - Routes Cryptographiques Olm / Megolm (Échange de Clés E2EE)
 *
 * Le serveur agit exclusivement comme annuaire de clés publiques (Curve25519,
 * Ed25519, One-Time Prekeys) et boîte aux lettres d'enveloppes Olm chiffrées
 * de bout en bout (to_device_messages). Aucune clé privée ni clé de session
 * en clair ne transite jamais par le serveur.
 */

const crypto = require('node:crypto');
const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const { broadcastToGroup, sendToDevice, sendToUser } = require('../ws-hub');

const router = express.Router();

function isActiveGroupMember(groupId, userId) {
  const row = db.prepare(`
    SELECT 1
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.group_id = ? AND gm.user_id = ?
      AND u.status = 'ACTIVE' AND u.is_revoked = 0 AND g.is_active = 1
  `).get(groupId, userId);
  return Boolean(row);
}

function usersShareAnyActiveConversation(userA, userB) {
  if (userA === userB) return true;
  const row = db.prepare(`
    SELECT 1
    FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    JOIN groups g ON g.id = gm1.group_id
    JOIN users u2 ON u2.id = gm2.user_id
    WHERE gm1.user_id = ? AND gm2.user_id = ?
      AND g.is_active = 1 AND u2.status = 'ACTIVE' AND u2.is_revoked = 0
    LIMIT 1
  `).get(userA, userB);
  return Boolean(row);
}

/**
 * Publication ou mise à jour des clés publiques Olm d'un terminal
 */
router.post('/crypto/devices', requireAuth, (req, res) => {
  const {
    deviceId,
    deviceLabel,
    curve25519Key,
    ed25519Key,
    oneTimeKeys,
    fallbackKeyId,
    fallbackKey
  } = req.body || {};

  if (!deviceId || !curve25519Key || !ed25519Key) {
    return res.status(400).json({ error: 'CLES_PUBLIQUES_OLM_REQUISES' });
  }

  // Interdire l'écrasement d'un deviceId appartenant à un autre utilisateur
  const existingDevice = db.prepare(`SELECT user_id FROM user_devices WHERE device_id = ?`).get(deviceId);
  if (existingDevice && existingDevice.user_id !== req.user.id) {
    return res.status(403).json({ error: 'DEVICE_ID_CONFLIT_INTERDIT' });
  }

  const isNewDevice = !existingDevice;

  db.prepare(`
    INSERT INTO user_devices (
      device_id, user_id, device_label, curve25519_key, ed25519_key,
      fallback_key_id, fallback_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(device_id) DO UPDATE SET
      device_label = excluded.device_label,
      curve25519_key = excluded.curve25519_key,
      ed25519_key = excluded.ed25519_key,
      fallback_key_id = COALESCE(excluded.fallback_key_id, user_devices.fallback_key_id),
      fallback_key = COALESCE(excluded.fallback_key, user_devices.fallback_key),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    deviceId,
    req.user.id,
    String(deviceLabel || 'Terminal Web FasoBrief').slice(0, 80),
    curve25519Key,
    ed25519Key,
    fallbackKeyId || null,
    fallbackKey || null
  );

  // Maintenir public_identity_key sur users pour rétrocompatibilité
  db.prepare(`UPDATE users SET public_identity_key = ? WHERE id = ?`).run(curve25519Key, req.user.id);
  db.prepare(`UPDATE sessions SET device_id = ? WHERE token = ?`).run(deviceId, req.sessionToken);

  let insertedOtks = 0;
  if (oneTimeKeys && typeof oneTimeKeys === 'object') {
    const insertOtk = db.prepare(`
      INSERT OR IGNORE INTO prekeys (id, user_id, device_id, key_id, public_prekey, is_used)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    for (const [keyId, pubKey] of Object.entries(oneTimeKeys)) {
      if (typeof pubKey === 'string' && pubKey.length > 10) {
        insertOtk.run(`otk_${deviceId}_${keyId}`, req.user.id, deviceId, keyId, pubKey);
        insertedOtks++;
      }
    }
  }

  // Si nouveau terminal, prévenir les groupes actifs de l'agent pour partage de clé Megolm
  if (isNewDevice) {
    const myGroups = db.prepare(`SELECT group_id FROM group_members WHERE user_id = ?`).all(req.user.id);
    for (const g of myGroups) {
      broadcastToGroup(g.group_id, {
        type: 'GROUP_DEVICE_ADDED',
        groupId: g.group_id,
        userId: req.user.id,
        deviceId,
        curve25519Key,
        ed25519Key
      }, req.user.id);
    }
  }

  const remainingOtks = db.prepare(`
    SELECT COUNT(*) AS cnt FROM prekeys WHERE device_id = ? AND is_used = 0
  `).get(deviceId).cnt;

  res.json({
    success: true,
    deviceId,
    insertedOtks,
    remainingOtks
  });
});

/**
 * Rétrocompatibilité route identité simple
 */
router.post('/keys/identity', requireAuth, (req, res) => {
  const { publicIdentityKey } = req.body || {};
  if (!publicIdentityKey) {
    return res.status(400).json({ error: 'PUBLIC_IDENTITY_KEY_REQUISE' });
  }
  db.prepare(`UPDATE users SET public_identity_key = ? WHERE id = ?`).run(publicIdentityKey, req.user.id);
  res.json({ success: true });
});

/**
 * Liste des terminaux et clés publiques Olm des membres actifs d'une conversation
 */
function handleGetGroupDevices(req, res) {
  const { groupId } = req.params;
  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_GROUPE_NON_AUTORISE' });
  }

  const grp = db.prepare(`SELECT id, key_epoch FROM groups WHERE id = ?`).get(groupId);

  const members = db.prepare(`
    SELECT u.id, u.matricule, u.full_name, u.role, u.public_identity_key, gm.member_role
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
  `).all(groupId);

  const devices = db.prepare(`
    SELECT d.device_id AS deviceId, d.user_id AS userId, d.device_label AS deviceLabel,
           d.curve25519_key AS curve25519Key, d.ed25519_key AS ed25519Key,
           u.matricule, u.full_name AS fullName
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    JOIN user_devices d ON d.user_id = u.id
    WHERE gm.group_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
  `).all(groupId);

  res.json({
    groupId,
    keyEpoch: grp ? grp.key_epoch : 1,
    members,
    devices
  });
}

router.get('/groups/:groupId/devices', requireAuth, handleGetGroupDevices);
router.get('/groups/:groupId/keys', requireAuth, handleGetGroupDevices);

/**
 * Réclamation atomique d'une One-Time Prekey pour initier une session Olm 1:1
 */
router.post('/crypto/claim-otk', requireAuth, (req, res) => {
  const { targetUserId, targetDeviceId } = req.body || {};
  if (!targetUserId || !targetDeviceId) {
    return res.status(400).json({ error: 'TARGET_USER_ET_DEVICE_REQUIS' });
  }

  if (!usersShareAnyActiveConversation(req.user.id, targetUserId)) {
    return res.status(403).json({ error: 'AUCUNE_CONVERSATION_COMMUNE_AUTORISEE' });
  }

  const device = db.prepare(`
    SELECT d.*, u.status, u.is_revoked
    FROM user_devices d
    JOIN users u ON u.id = d.user_id
    WHERE d.device_id = ? AND d.user_id = ?
  `).get(targetDeviceId, targetUserId);

  if (!device || device.status !== 'ACTIVE' || device.is_revoked === 1) {
    return res.status(404).json({ error: 'TERMINAL_DESTINATAIRE_INACTIF' });
  }

  const otk = db.prepare(`
    SELECT id, key_id, public_prekey
    FROM prekeys
    WHERE device_id = ? AND is_used = 0
    ORDER BY created_at ASC
    LIMIT 1
  `).get(targetDeviceId);

  let selectedKey = null;
  let keyId = null;
  let isFallback = false;

  if (otk) {
    db.prepare(`UPDATE prekeys SET is_used = 1 WHERE id = ?`).run(otk.id);
    selectedKey = otk.public_prekey;
    keyId = otk.key_id;
  } else if (device.fallback_key) {
    selectedKey = device.fallback_key;
    keyId = device.fallback_key_id || 'fallback';
    isFallback = true;
  } else {
    return res.status(409).json({ error: 'AUCUNE_PREKEY_DISPONIBLE' });
  }

  const remaining = db.prepare(`
    SELECT COUNT(*) AS cnt FROM prekeys WHERE device_id = ? AND is_used = 0
  `).get(targetDeviceId).cnt;

  if (remaining < 10) {
    sendToDevice(targetUserId, targetDeviceId, {
      type: 'REPLENISH_OTK_REQUIRED',
      deviceId: targetDeviceId,
      remaining
    });
  }

  res.json({
    success: true,
    targetUserId,
    targetDeviceId,
    curve25519Key: device.curve25519_key,
    ed25519Key: device.ed25519_key,
    oneTimeKey: selectedKey,
    keyId,
    isFallback
  });
});

/**
 * Envoi d'enveloppes Olm 1:1 chiffrées (distribution de clés Megolm m.room_key / m.forwarded_room_key)
 */
router.post('/crypto/to-device', requireAuth, (req, res) => {
  const { senderDeviceId, senderCurve25519, senderEd25519, messages } = req.body || {};
  if (!senderDeviceId || !senderCurve25519 || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'ENVELOPPES_OLM_INVALIDES' });
  }

  const senderDev = db.prepare(`
    SELECT device_id FROM user_devices WHERE device_id = ? AND user_id = ?
  `).get(senderDeviceId, req.user.id);
  if (!senderDev) {
    return res.status(403).json({ error: 'TERMINAL_EMETTEUR_NON_ENREGISTRE' });
  }

  const insertStmt = db.prepare(`
    INSERT INTO to_device_messages (
      id, recipient_user_id, recipient_device_id, sender_user_id, sender_device_id,
      sender_curve25519, sender_ed25519, olm_type, olm_body, group_id, megolm_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let deliveredCount = 0;

  for (const item of messages) {
    const {
      recipientUserId,
      recipientDeviceId,
      olmType,
      olmBody,
      groupId,
      megolmSessionId
    } = item || {};

    if (!recipientUserId || !recipientDeviceId || (olmType !== 0 && olmType !== 1) || !olmBody) {
      continue;
    }

    // Vérification serveur stricte : jamais d'envoi vers un compte non actif ou hors du groupe !
    if (groupId) {
      if (!isActiveGroupMember(groupId, req.user.id) || !isActiveGroupMember(groupId, recipientUserId)) {
        continue;
      }
    } else if (!usersShareAnyActiveConversation(req.user.id, recipientUserId)) {
      continue;
    }

    const recDev = db.prepare(`
      SELECT d.device_id
      FROM user_devices d
      JOIN users u ON u.id = d.user_id
      WHERE d.device_id = ? AND d.user_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
    `).get(recipientDeviceId, recipientUserId);
    if (!recDev) continue;

    const msgId = 'tdm_' + crypto.randomUUID();
    insertStmt.run(
      msgId,
      recipientUserId,
      recipientDeviceId,
      req.user.id,
      senderDeviceId,
      senderCurve25519,
      senderEd25519 || null,
      olmType,
      olmBody,
      groupId || null,
      megolmSessionId || null
    );

    if (megolmSessionId && groupId) {
      db.prepare(`
        UPDATE key_requests
        SET fulfilled = 1
        WHERE group_id = ? AND megolm_session_id = ? AND requester_device_id = ?
      `).run(groupId, megolmSessionId, recipientDeviceId);
    }

    sendToDevice(recipientUserId, recipientDeviceId, {
      type: 'TO_DEVICE_ENCRYPTED',
      envelope: {
        id: msgId,
        senderUserId: req.user.id,
        senderDeviceId,
        senderCurve25519,
        senderEd25519: senderEd25519 || null,
        olmType,
        olmBody,
        groupId: groupId || null,
        megolmSessionId: megolmSessionId || null
      }
    });

    deliveredCount++;
  }

  res.json({ success: true, count: deliveredCount });
});

/**
 * Récupération des enveloppes Olm en attente pour le terminal courant
 */
router.get('/crypto/to-device', requireAuth, (req, res) => {
  const deviceId = req.query.deviceId;
  if (!deviceId) {
    return res.status(400).json({ error: 'DEVICE_ID_REQUIS' });
  }

  const rows = db.prepare(`
    SELECT id, sender_user_id AS senderUserId, sender_device_id AS senderDeviceId,
           sender_curve25519 AS senderCurve25519, sender_ed25519 AS senderEd25519,
           olm_type AS olmType, olm_body AS olmBody,
           group_id AS groupId, megolm_session_id AS megolmSessionId, created_at AS createdAt
    FROM to_device_messages
    WHERE recipient_user_id = ? AND recipient_device_id = ?
    ORDER BY created_at ASC
  `).all(req.user.id, deviceId);

  res.json({ envelopes: rows });
});

/**
 * Acquittement et purge immédiate des enveloppes Olm traitées (minimisation des métadonnées)
 */
router.post('/crypto/to-device/ack', requireAuth, (req, res) => {
  const { envelopeIds } = req.body || {};
  if (!Array.isArray(envelopeIds) || envelopeIds.length === 0) {
    return res.json({ success: true, deleted: 0 });
  }

  const del = db.prepare(`DELETE FROM to_device_messages WHERE id = ? AND recipient_user_id = ?`);
  let deleted = 0;
  for (const id of envelopeIds) {
    const info = del.run(id, req.user.id);
    deleted += info.changes || 0;
  }

  res.json({ success: true, deleted });
});

/**
 * Demande de partage d'une session Megolm par un membre actif légitime du groupe
 */
router.post('/crypto/key-requests', requireAuth, (req, res) => {
  const { groupId, megolmSessionId, deviceId } = req.body || {};
  if (!groupId || !megolmSessionId || !deviceId) {
    return res.status(400).json({ error: 'PARAMETRES_KEY_REQUEST_REQUIS' });
  }

  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_GROUPE_NON_AUTORISE' });
  }

  const dev = db.prepare(`
    SELECT curve25519_key, ed25519_key FROM user_devices WHERE device_id = ? AND user_id = ?
  `).get(deviceId, req.user.id);
  if (!dev) {
    return res.status(400).json({ error: 'TERMINAL_NON_ENREGISTRE' });
  }

  const reqId = 'kreq_' + crypto.randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO key_requests (id, group_id, megolm_session_id, requester_user_id, requester_device_id, fulfilled)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(reqId, groupId, megolmSessionId, req.user.id, deviceId);

  broadcastToGroup(groupId, {
    type: 'MEGOLM_KEY_REQUESTED',
    groupId,
    megolmSessionId,
    requesterUserId: req.user.id,
    requesterDeviceId: deviceId,
    requesterCurve25519: dev.curve25519_key,
    requesterEd25519: dev.ed25519_key
  }, req.user.id);

  res.json({ success: true });
});

/**
 * Liste des demandes de clés Megolm en attente dans les groupes de l'agent connecté
 */
router.get('/crypto/key-requests', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT kr.id, kr.group_id AS groupId, kr.megolm_session_id AS megolmSessionId,
           kr.requester_user_id AS requesterUserId, kr.requester_device_id AS requesterDeviceId,
           d.curve25519_key AS requesterCurve25519, d.ed25519_key AS requesterEd25519
    FROM key_requests kr
    JOIN group_members gm_me ON gm_me.group_id = kr.group_id AND gm_me.user_id = ?
    JOIN group_members gm_req ON gm_req.group_id = kr.group_id AND gm_req.user_id = kr.requester_user_id
    JOIN users u_req ON u_req.id = kr.requester_user_id
    JOIN user_devices d ON d.device_id = kr.requester_device_id
    WHERE kr.fulfilled = 0
      AND kr.requester_user_id != ?
      AND u_req.status = 'ACTIVE' AND u_req.is_revoked = 0
  `).all(req.user.id, req.user.id);

  res.json({ requests: rows });
});

module.exports = {
  router,
  isActiveGroupMember
};

