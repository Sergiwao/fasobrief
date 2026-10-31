/**
 * FASOBRIEF - Routes d'Authentification, d'Activation et de Préférences
 */

const express = require('express');
const { generateSync } = require('otplib');
const { db } = require('../database');
const {
  consumeChallengeToken,
  authenticateFirstFactor,
  verifySecondFactor,
  initiateAccountActivation,
  completeAccountActivation,
  consumeQrEnrollToken,
  requireAuth,
  logAuditEvent,
  formatUserPublic
} = require('../auth');
const { getUnreadCount } = require('../notifications-service');

const router = express.Router();

function isDemoMode() {
  return process.env.FASOBRIEF_DEMO_MODE === '1';
}

router.get('/config', (req, res) => {
  const demoMode = isDemoMode();
  let demoAccounts = [];
  if (demoMode) {
    demoAccounts = db.prepare(`
      SELECT id, username, matricule, full_name AS fullName, job_title AS jobTitle,
             role, status, service_id AS serviceId, service_ministry AS serviceMinistry
      FROM users
      WHERE id IN ('usr_admin_00', 'usr_dir_01', 'usr_chef_02', 'usr_agent_03', 'usr_agent_04')
      ORDER BY CASE role
        WHEN 'ADMIN' THEN 1
        WHEN 'DIRECTEUR' THEN 2
        WHEN 'CHEF_SERVICE' THEN 3
        WHEN 'AGENT' THEN 4
      END
    `).all();
  }
  res.json({ demoMode, demoAccounts });
});

router.post('/login-step1', (req, res) => {
  const { matricule, password } = req.body || {};
  if (!matricule || !password) {
    return res.status(400).json({ error: 'MATRICULE_ET_MOT_DE_PASSE_REQUIS' });
  }

  const result = authenticateFirstFactor(matricule, password, req.ip);
  if (!result.success) {
    return res.status(result.code || 401).json({ error: result.error });
  }

  res.json(result);
});

router.post('/login-step2', (req, res) => {
  const { userId, totpCode, challengeToken, deviceId, deviceInfo } = req.body || {};
  if (!userId || !totpCode) {
    return res.status(400).json({ error: 'USER_ID_ET_CODE_2FA_REQUIS' });
  }

  if (!consumeChallengeToken(challengeToken, userId)) {
    logAuditEvent('2FA_BYPASS_BLOCKED', userId, req.ip, 'Tentative de validation 2FA sans jeton préalable de 1er facteur');
    return res.status(401).json({ error: 'ETAPE_1_REQUISE_OU_EXPIREE' });
  }

  const result = verifySecondFactor(userId, totpCode, req.ip, { deviceId, deviceInfo });
  if (!result.success) {
    return res.status(result.code || 401).json({ error: result.error });
  }

  res.json(result);
});

/**
 * Générateur de code TOTP réservé exclusivement au mode démonstration jury (FASOBRIEF_DEMO_MODE=1).
 * Désactivé par défaut en exécution standard et en test de sécurité.
 */
router.get('/demo-totp/:userId', (req, res) => {
  if (!isDemoMode()) {
    return res.status(403).json({ error: 'MODE_DEMO_DESACTIVE' });
  }

  const user = db.prepare(`SELECT totp_secret, status, is_revoked FROM users WHERE id = ?`).get(req.params.userId);
  if (!user || user.is_revoked === 1 || user.status !== 'ACTIVE' || !user.totp_secret) {
    return res.status(404).json({ error: 'UTILISATEUR_INACTIF_OU_INCONNU' });
  }

  const code = generateSync({ secret: user.totp_secret });
  res.json({ success: true, code });
});

/**
 * Activation d'un compte invité — Étape 1 : Matricule + Code d'activation à usage unique
 */
router.post('/activate-step1', (req, res) => {
  const { matricule, activationCode } = req.body || {};
  if (!matricule || !activationCode) {
    return res.status(400).json({ error: 'MATRICULE_ET_CODE_ACTIVATION_REQUIS' });
  }

  const result = initiateAccountActivation(matricule, activationCode, req.ip);
  if (!result.success) {
    return res.status(result.code || 403).json({ error: result.error });
  }

  res.json(result);
});

/**
 * Activation d'un compte invité — Étape 2 : Mot de passe (>= 12 car.) + premier code TOTP
 */
router.post('/activate-step2', (req, res) => {
  const { matricule, activationCode, password, totpCode, deviceId, deviceInfo } = req.body || {};
  if (!matricule || !activationCode || !password || !totpCode) {
    return res.status(400).json({ error: 'CHAMPS_ACTIVATION_INCOMPLETS' });
  }

  const result = completeAccountActivation(
    { matricule, activationCode, password, totpCode, deviceId, deviceInfo },
    req.ip
  );
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }

  res.json(result);
});

/**
 * Connexion / enrôlement par scan d'un QR code à usage unique (128 bits haché SHA-256)
 */
router.post('/qr-login', (req, res) => {
  const { code, userId, token, deviceId, deviceInfo } = req.body || {};
  const result = consumeQrEnrollToken({ code, userId, token }, req.ip, { deviceId, deviceInfo });
  if (!result.success) {
    return res.status(result.code || 403).json({ error: result.error });
  }
  res.json(result);
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    unreadNotifications: getUnreadCount(req.user.id),
    demoMode: isDemoMode()
  });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare(`UPDATE sessions SET is_revoked = 1 WHERE token = ?`).run(req.sessionToken);
  logAuditEvent('LOGOUT', req.user.id, req.ip, `Déconnexion volontaire de ${req.user.matricule}`);
  res.json({ success: true });
});

router.patch('/preferences', requireAuth, (req, res) => {
  const { notifBrowserEnabled, notifMutedGroups } = req.body || {};

  const current = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const nextBrowser = typeof notifBrowserEnabled === 'boolean'
    ? (notifBrowserEnabled ? 1 : 0)
    : current.notif_browser_enabled;

  let nextMuted = current.notif_muted_groups || '[]';
  if (Array.isArray(notifMutedGroups)) {
    nextMuted = JSON.stringify(notifMutedGroups.filter((id) => typeof id === 'string'));
  }

  db.prepare(`
    UPDATE users SET notif_browser_enabled = ?, notif_muted_groups = ? WHERE id = ?
  `).run(nextBrowser, nextMuted, req.user.id);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ success: true, user: formatUserPublic(updated) });
});

/**
 * Modification de son propre profil par l'agent connecté :
 * - Champs modifiables : Nom complet (fullName), Poste/Titre (jobTitle), Photo de profil (avatarData)
 * - Champs verrouillés (immutables par l'agent) : Matricule, Rôle, Service d'affectation
 */
router.patch('/profile', requireAuth, (req, res) => {
  const { fullName, jobTitle, avatarData } = req.body || {};

  // Sécurité souveraine : l'agent ne peut PAS modifier ses attributs administratifs
  if (req.body.matricule !== undefined && req.body.matricule !== req.user.matricule) {
    return res.status(403).json({ error: 'MODIFICATION_MATRICULE_INTERDITE' });
  }
  if (req.body.role !== undefined && req.body.role !== req.user.role) {
    return res.status(403).json({ error: 'MODIFICATION_ROLE_INTERDITE' });
  }
  if (req.body.serviceId !== undefined && req.body.serviceId !== req.user.serviceId) {
    return res.status(403).json({ error: 'MODIFICATION_SERVICE_INTERDITE' });
  }

  const current = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!current) {
    return res.status(404).json({ error: 'UTILISATEUR_INTROUVABLE' });
  }

  const nextFullName = typeof fullName === 'string' && fullName.trim().length >= 2
    ? fullName.trim()
    : current.full_name;

  const nextJobTitle = typeof jobTitle === 'string'
    ? jobTitle.trim()
    : current.job_title;

  let nextAvatar = current.avatar_data;
  if (avatarData === null || avatarData === '') {
    nextAvatar = null;
  } else if (typeof avatarData === 'string') {
    // Vérifier format data URL image et limiter à 500 Ko
    if (avatarData.startsWith('data:image/') && avatarData.length <= 500000) {
      nextAvatar = avatarData;
    } else {
      return res.status(400).json({ error: 'AVATAR_INVALIDE_OU_TROP_VOLUMINEUX' });
    }
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, job_title = ?, avatar_data = ?
    WHERE id = ?
  `).run(nextFullName, nextJobTitle, nextAvatar, req.user.id);

  logAuditEvent('USER_PROFILE_UPDATED', req.user.id, req.ip, `Mise à jour du profil de ${req.user.matricule}`);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ success: true, user: formatUserPublic(updated) });
});

module.exports = router;

