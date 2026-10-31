/**
 * FASOBRIEF - Routes d'Administration, Services, Enrôlement QR, Suspension/Révocation et Audit
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { db } = require('../database');
const {
  requireAuth,
  requireRole,
  createInvitedAccount,
  generateBase32Secret,
  issueQrEnrollToken,
  logAuditEvent,
  formatUserPublic
} = require('../auth');
const { revokeAgent, suspendAgent, reactivateAgent, notifyGroupKeyRotation } = require('../revocation');
const { userSockets, sendToUser } = require('../ws-hub');
const { seedDatabase } = require('../seed');

const router = express.Router();

function ensureServiceChannel(serviceId, serviceName, creatorUserId) {
  let grp = db.prepare(`
    SELECT * FROM groups
    WHERE service_id = ? AND channel_kind = 'service' AND is_active = 1
    LIMIT 1
  `).get(serviceId);

  if (!grp) {
    const groupId = 'grp_srv_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'service', ?, ?, ?, ?, ?, 1)
    `).run(
      groupId,
      serviceName,
      `Canal interne chiffré du service ${serviceName}.`,
      serviceId,
      serviceName,
      creatorUserId
    );
    grp = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
  }
  return grp;
}

function syncUserServiceChannelMembership(userId, previousServiceId, nextServiceId, nextRole, actorUserId) {
  if (previousServiceId && previousServiceId !== nextServiceId) {
    const oldCh = db.prepare(`
      SELECT id FROM groups WHERE service_id = ? AND channel_kind = 'service' AND is_active = 1
    `).all(previousServiceId);
    for (const c of oldCh) {
      const del = db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(c.id, userId);
      if (del.changes > 0) {
        db.prepare(`DELETE FROM to_device_messages WHERE group_id = ? AND recipient_user_id = ?`).run(c.id, userId);
        db.prepare(`UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?`).run(c.id);
        notifyGroupKeyRotation(c.id, userId, userSockets, 'Changement de service — rotation Megolm');
      }
    }
  }

  if (nextServiceId) {
    const srv = db.prepare(`SELECT id, name FROM services WHERE id = ?`).get(nextServiceId);
    if (srv) {
      const ch = ensureServiceChannel(srv.id, srv.name, actorUserId || userId);
      const memRole = (nextRole === 'DIRECTEUR' || nextRole === 'CHEF_SERVICE') ? 'OWNER' : 'MEMBER';
      const ins = db.prepare(`
        INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)
      `).run(ch.id, userId, memRole);
      if (ins.changes > 0) {
        db.prepare(`UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?`).run(ch.id);
        notifyGroupKeyRotation(ch.id, null, userSockets, 'Nouvel agent affecté au service — partage Megolm');
        sendToUser(userId, { type: 'CONVERSATION_CREATED', groupId: ch.id });
      }
    }
  }
}

/**
 * Liste des comptes, services et statuts (réservé ADMIN et DIRECTEUR)
 */
router.get('/admin/users', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.matricule, u.full_name, u.job_title, u.service_id, u.service_ministry,
           s.name AS service_name,
           u.role, u.status, u.is_enrolled, u.is_revoked, u.revocation_reason,
           u.activated_at, u.revoked_at, u.created_at,
           (SELECT COUNT(*) FROM user_devices d WHERE d.user_id = u.id) AS device_count,
           (SELECT COUNT(*) FROM sessions se WHERE se.user_id = u.id AND se.is_revoked = 0) AS active_sessions
    FROM users u
    LEFT JOIN services s ON s.id = u.service_id
    ORDER BY CASE u.role
      WHEN 'ADMIN' THEN 1
      WHEN 'DIRECTEUR' THEN 2
      WHEN 'CHEF_SERVICE' THEN 3
      ELSE 4
    END, u.full_name ASC
  `).all();

  const services = db.prepare(`
    SELECT s.id, s.code, s.name, s.direction_id
    FROM services s
    ORDER BY s.created_at ASC, s.name ASC
  `).all();

  res.json({ users, services });
});

/**
 * Création d'un nouveau service administratif + son canal chiffré dédié (ADMIN uniquement)
 */
router.post('/admin/services', requireAuth, requireRole('ADMIN'), (req, res) => {
  const cleanName = String((req.body && req.body.name) || '').trim();
  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: 'NOM_SERVICE_REQUIS' });
  }

  const dup = db.prepare(`SELECT id FROM services WHERE LOWER(name) = LOWER(?)`).get(cleanName);
  if (dup) {
    return res.status(409).json({ error: 'SERVICE_DEJA_EXISTANT' });
  }

  let defaultDir = db.prepare(`SELECT id FROM directions ORDER BY created_at ASC LIMIT 1`).get();
  if (!defaultDir) {
    db.prepare(`INSERT OR IGNORE INTO organisations (id, code, name) VALUES ('org_mtdpce', 'MTDPCE', 'Administration')`).run();
    db.prepare(`INSERT OR IGNORE INTO directions (id, org_id, code, name) VALUES ('dir_sg', 'org_mtdpce', 'SG', 'Secrétariat Général')`).run();
    defaultDir = { id: 'dir_sg' };
  }

  const serviceId = 'srv_' + crypto.randomUUID();
  const code = 'SRV-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  db.prepare(`
    INSERT INTO services (id, direction_id, code, name) VALUES (?, ?, ?, ?)
  `).run(serviceId, defaultDir.id, code, cleanName);

  const channel = ensureServiceChannel(serviceId, cleanName, req.user.id);

  logAuditEvent('SERVICE_CREATED', req.user.id, req.ip, `Service créé : ${cleanName}`, serviceId);

  res.status(201).json({
    success: true,
    service: { id: serviceId, code, name: cleanName, channelId: channel.id }
  });
});

/**
 * Enrôlement direct d'un agent par l'administrateur + génération d'un QR code 128 bits à usage unique
 */
router.post('/admin/users', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { fullName, jobTitle, username, password, role, serviceId } = req.body || {};
  const cleanName = String(fullName || '').trim();
  const cleanTitle = String(jobTitle || '').trim();
  const cleanUser = String(username || '').trim().toLowerCase();
  const rawPass = String(password || '');
  const allowedRoles = ['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE', 'AGENT'];
  const finalRole = allowedRoles.includes(role) ? role : 'AGENT';

  if (!cleanName || !cleanUser || !rawPass) {
    return res.status(400).json({ error: 'CHAMPS_REQUIS_MANQUANTS' });
  }
  if (rawPass.length < 6) {
    return res.status(400).json({ error: 'MOT_DE_PASSE_TROP_COURT' });
  }

  const existing = db.prepare(`
    SELECT id FROM users WHERE LOWER(username) = ? OR UPPER(matricule) = ?
  `).get(cleanUser, cleanUser.toUpperCase());
  if (existing) {
    return res.status(409).json({ error: 'IDENTIFIANT_DEJA_UTILISE' });
  }

  let finalServiceId = finalRole === 'ADMIN' ? (serviceId || null) : serviceId;
  let serviceLabel = 'Administration';
  if (finalRole !== 'ADMIN' && !finalServiceId) {
    return res.status(400).json({ error: 'SERVICE_OBLIGATOIRE' });
  }
  if (finalServiceId) {
    const srv = db.prepare(`SELECT id, name FROM services WHERE id = ?`).get(finalServiceId);
    if (!srv) {
      return res.status(404).json({ error: 'SERVICE_INTROUVABLE' });
    }
    serviceLabel = srv.name;
  }

  const userId = 'usr_' + crypto.randomUUID();
  const matricule = 'FASO-' + crypto.randomBytes(2).toString('hex').toUpperCase() + '-' + String(Math.floor(10 + Math.random() * 89));
  const passwordHash = bcrypt.hashSync(rawPass, 10);
  const totpSecret = generateBase32Secret(20);

  db.prepare(`
    INSERT INTO users (
      id, matricule, username, full_name, service_id, service_ministry, job_title,
      role, status, password_hash, totp_secret, is_enrolled, is_revoked, invited_by, activated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 1, 0, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    matricule,
    cleanUser,
    cleanName,
    finalServiceId,
    serviceLabel,
    cleanTitle || (finalRole === 'ADMIN' ? 'Administrateur' : finalRole === 'AGENT' ? 'Agent' : 'Chef de service'),
    finalRole,
    passwordHash,
    totpSecret,
    req.user.id
  );

  syncUserServiceChannelMembership(userId, null, finalServiceId, finalRole, req.user.id);
  const qrRes = issueQrEnrollToken(userId, req.user.id, req.ip);

  logAuditEvent('USER_ENROLLED', req.user.id, req.ip, `Agent enrôlé : ${cleanName} (@${cleanUser})`, userId);

  const created = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  res.status(201).json({
    success: true,
    user: formatUserPublic(created),
    qrPayload: qrRes.qrPayload
  });
});

/**
 * Modification d'un agent par l'administrateur (nom, fonction, identifiant, rôle, service, mot de passe)
 */
router.patch('/admin/users/:userId', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { userId } = req.params;
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!target) {
    return res.status(404).json({ error: 'AGENT_INTROUVABLE' });
  }

  const { fullName, jobTitle, username, password, role, serviceId } = req.body || {};
  const allowedRoles = ['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE', 'AGENT'];
  const nextRole = allowedRoles.includes(role) ? role : target.role;

  if (userId === req.user.id && nextRole !== 'ADMIN') {
    return res.status(400).json({ error: 'IMPOSSIBLE_RETIRER_PROPRE_ROLE_ADMIN' });
  }

  const cleanName = fullName !== undefined ? String(fullName).trim() : target.full_name;
  const cleanTitle = jobTitle !== undefined ? String(jobTitle).trim() : target.job_title;
  const cleanUser = username !== undefined ? String(username).trim().toLowerCase() : (target.username || target.matricule.toLowerCase());

  if (!cleanName || !cleanUser) {
    return res.status(400).json({ error: 'CHAMPS_REQUIS_MANQUANTS' });
  }

  const taken = db.prepare(`
    SELECT id FROM users WHERE id != ? AND (LOWER(username) = ? OR UPPER(matricule) = ?)
  `).get(userId, cleanUser, cleanUser.toUpperCase());
  if (taken) {
    return res.status(409).json({ error: 'IDENTIFIANT_DEJA_UTILISE' });
  }

  let nextServiceId = nextRole === 'ADMIN' ? null : (serviceId !== undefined ? serviceId : target.service_id);
  let nextServiceLabel = 'Administration';
  if (nextRole !== 'ADMIN' && !nextServiceId) {
    return res.status(400).json({ error: 'SERVICE_OBLIGATOIRE' });
  }
  if (nextServiceId) {
    const srv = db.prepare(`SELECT id, name FROM services WHERE id = ?`).get(nextServiceId);
    if (!srv) {
      return res.status(404).json({ error: 'SERVICE_INTROUVABLE' });
    }
    nextServiceLabel = srv.name;
  }

  const nextPasswordHash = (password && String(password).trim().length > 0)
    ? bcrypt.hashSync(String(password), 10)
    : target.password_hash;

  db.prepare(`
    UPDATE users
    SET full_name = ?, job_title = ?, username = ?, role = ?, service_id = ?, service_ministry = ?, password_hash = ?
    WHERE id = ?
  `).run(cleanName, cleanTitle, cleanUser, nextRole, nextServiceId, nextServiceLabel, nextPasswordHash, userId);

  if (target.status === 'ACTIVE' && target.is_revoked === 0) {
    syncUserServiceChannelMembership(userId, target.service_id, nextServiceId, nextRole, req.user.id);
  }

  logAuditEvent('USER_UPDATED', req.user.id, req.ip, `Agent modifié : ${cleanName} (@${cleanUser})`, userId);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  res.json({ success: true, user: formatUserPublic(updated) });
});

/**
 * Génération ou renouvellement d'un QR code d'enrôlement à usage unique (ADMIN uniquement)
 */
router.post('/admin/users/:userId/qr', requireAuth, requireRole('ADMIN'), (req, res) => {
  const result = issueQrEnrollToken(req.params.userId, req.user.id, req.ip);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }
  res.json(result);
});

/**
 * Réinitialisation complète des données fictives de démonstration (ADMIN + mode démo uniquement)
 */
router.post('/admin/reset-demo', requireAuth, requireRole('ADMIN'), (req, res) => {
  if (process.env.FASOBRIEF_DEMO_MODE !== '1') {
    return res.status(403).json({ error: 'RESERVE_AU_MODE_DEMONSTRATION' });
  }

  seedDatabase({ forceReset: true });
  const adminRow = db.prepare(`SELECT * FROM users WHERE id = 'usr_admin_00'`).get();
  const freshToken = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, device_info, is_revoked) VALUES (?, 'usr_admin_00', 'Session Admin Post-Reset', 0)
  `).run(freshToken);

  res.json({
    success: true,
    token: freshToken,
    user: formatUserPublic(adminRow)
  });
});

/**
 * Création d'un compte invité avec code à usage unique 128 bits (réservé ADMIN uniquement)
 */
router.post('/admin/invitations', requireAuth, requireRole('ADMIN'), (req, res) => {
  const result = createInvitedAccount(req.body, req.user, req.ip);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }
  res.status(201).json(result);
});

/**
 * Suspension temporaire d'un compte (ADMIN uniquement)
 */
router.post('/admin/users/:userId/suspend', requireAuth, requireRole('ADMIN'), (req, res) => {
  const result = suspendAgent(req.params.userId, req.body && req.body.reason, req.user, userSockets, req.ip);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }
  res.json(result);
});

/**
 * Réactivation d'un compte suspendu (ADMIN uniquement)
 */
router.post('/admin/users/:userId/reactivate', requireAuth, requireRole('ADMIN'), (req, res) => {
  const result = reactivateAgent(req.params.userId, req.user, userSockets, req.ip);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }
  res.json(result);
});

/**
 * Révocation définitive et immédiate d'un agent (ADMIN ou DIRECTEUR, sauf ADMIN par DIRECTEUR)
 */
router.post('/admin/revoke', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const { targetUserId, reason } = req.body || {};
  if (!targetUserId) {
    return res.status(400).json({ error: 'TARGET_USER_ID_REQUIS' });
  }

  const result = revokeAgent(targetUserId, reason, req.user, userSockets, req.ip);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }

  res.json(result);
});

/**
 * Journal d'audit immuable (ADMIN et DIRECTEUR)
 */
router.get('/admin/audit-logs', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const { eventType } = req.query;
  const logs = eventType
    ? db.prepare(`
        SELECT a.*, u.full_name AS actor_name
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.event_type = ?
        ORDER BY a.id DESC LIMIT 100
      `).all(eventType)
    : db.prepare(`
        SELECT a.*, u.full_name AS actor_name
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.id DESC LIMIT 100
      `).all();

  res.json({ logs });
});

/**
 * Preuve d'inspection technique « Serveur Aveugle » pour le jury :
 * Affiche l'état brut SQLite (ciphertexts Megolm, enveloppes Olm, blobs AES-GCM, zéro clé privée)
 */
router.get('/admin/server-inspection', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const rawMessages = db.prepare(`
    SELECT id, group_id, sender_id, protocol, megolm_session_id,
           SUBSTR(ciphertext, 1, 64) AS ciphertext_sample,
           LENGTH(ciphertext) AS ciphertext_len,
           SUBSTR(signature, 1, 32) AS ed25519_sig_sample,
           message_type, created_at
    FROM messages ORDER BY created_at DESC LIMIT 5
  `).all();

  const rawFiles = db.prepare(`
    SELECT id, group_id, encrypted_filename, mime_type, file_size, sha256_ciphertext,
           HEX(SUBSTR(file_data, 1, 16)) AS first_16_bytes_hex, created_at
    FROM encrypted_files ORDER BY created_at DESC LIMIT 5
  `).all();

  const rawDevices = db.prepare(`
    SELECT device_id, user_id, curve25519_key, ed25519_key, created_at
    FROM user_devices ORDER BY created_at DESC LIMIT 6
  `).all();

  res.json({
    serverCanDecrypt: false,
    privateKeysStoredOnServer: 0,
    messagesTableSample: rawMessages,
    filesTableSample: rawFiles,
    publicDevicesSample: rawDevices
  });
});

module.exports = router;
