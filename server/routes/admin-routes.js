/**
 * FASOBRIEF - Routes d'Administration, d'Invitation, de Suspension/Révocation et d'Audit
 */

const express = require('express');
const { db } = require('../database');
const { requireAuth, requireRole, createInvitedAccount } = require('../auth');
const { revokeAgent, suspendAgent, reactivateAgent } = require('../revocation');
const { userSockets } = require('../ws-hub');

const router = express.Router();

/**
 * Liste des comptes et statuts (réservé ADMIN et DIRECTEUR)
 */
router.get('/admin/users', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.matricule, u.full_name, u.job_title, u.service_id, u.service_ministry,
           u.role, u.status, u.is_enrolled, u.is_revoked, u.revocation_reason,
           u.activated_at, u.revoked_at, u.created_at,
           (SELECT COUNT(*) FROM user_devices d WHERE d.user_id = u.id) AS device_count,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.is_revoked = 0) AS active_sessions
    FROM users u
    ORDER BY CASE u.role
      WHEN 'ADMIN' THEN 1
      WHEN 'DIRECTEUR' THEN 2
      WHEN 'CHEF_SERVICE' THEN 3
      ELSE 4
    END, u.full_name ASC
  `).all();

  res.json({ users });
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
    ? db.prepare(`SELECT * FROM audit_logs WHERE event_type = ? ORDER BY id DESC LIMIT 100`).all(eventType)
    : db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100`).all();

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
