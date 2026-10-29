/**
 * FASOBRIEF - Authentification Forte (2FA TOTP), Cycle des Comptes & RBAC
 *
 * Exigences appliquées :
 * - Aucun accès sans enrôlement préalable (rejet 403 + journalisation INTRUSION_ATTEMPT).
 * - Cycle de vie strict : INVITED -> ACTIVE <-> SUSPENDED -> REVOKED (définitif).
 * - Code d'activation 128 bits à usage unique stocké uniquement haché (SHA-256), expiration 72 h.
 * - Mot de passe >= 12 caractères haché bcryptjs (jamais en clair).
 * - Second facteur TOTP RFC 6238 obligatoire (aucun code maître codé en dur).
 * - Contrôle des rôles et du statut du compte à chaque requête HTTP et WebSocket.
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { verifySync } = require('otplib');
const { db } = require('./database');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Jetons temporaires d'étape 1 -> étape 2 (TTL 5 minutes) pour l'API HTTP
const pendingLoginChallenges = new Map();

function generateBase32Secret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function hashActivationCode(rawCode) {
  const normalized = String(rawCode || '').replace(/[\s-]/g, '').toUpperCase();
  return crypto.createHash('sha256').update(`FASOBRIEF_INVITE_V1:${normalized}`).digest('hex');
}

function generateActivationCode() {
  // 16 octets = 128 bits d'entropie cryptographique, formaté par blocs de 4 caractères hex
  const hex = crypto.randomBytes(16).toString('hex').toUpperCase();
  return hex.match(/.{1,4}/g).join('-');
}

function logAuditEvent(eventType, actorId, ipAddress, details, targetId = null) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (event_type, actor_id, target_id, ip_address, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventType, actorId || null, targetId || null, ipAddress || '127.0.0.1', details || '');
  } catch (err) {
    console.error('[AUDIT_ERROR]', err);
  }
}

function createChallengeToken(userId) {
  const now = Date.now();
  for (const [k, v] of pendingLoginChallenges.entries()) {
    if (v.expiresAt < now) pendingLoginChallenges.delete(k);
  }
  const challengeToken = crypto.randomBytes(24).toString('hex');
  pendingLoginChallenges.set(challengeToken, {
    userId,
    expiresAt: now + 5 * 60 * 1000
  });
  return challengeToken;
}

function consumeChallengeToken(challengeToken, expectedUserId) {
  if (!challengeToken) return false;
  const entry = pendingLoginChallenges.get(challengeToken);
  if (!entry) return false;
  if (entry.expiresAt < Date.now() || entry.userId !== expectedUserId) {
    pendingLoginChallenges.delete(challengeToken);
    return false;
  }
  pendingLoginChallenges.delete(challengeToken);
  return true;
}

/**
 * Étape 1 : Matricule + Mot de passe
 */
function authenticateFirstFactor(matricule, password, clientIp) {
  const cleanMatricule = String(matricule || '').trim().toUpperCase();
  const user = db.prepare(`SELECT * FROM users WHERE UPPER(matricule) = ?`).get(cleanMatricule);

  if (!user || user.is_enrolled !== 1) {
    logAuditEvent('INTRUSION_ATTEMPT', null, clientIp, `Tentative d'accès non autorisée avec matricule: ${matricule}`);
    return { success: false, error: 'COMPTE_NON_ENROLE_OU_INCONNU', code: 403 };
  }

  if (user.is_revoked === 1 || user.status === 'REVOKED') {
    logAuditEvent('REVOKED_ACCESS_ATTEMPT', user.id, clientIp, `Tentative de connexion d'un agent révoqué: ${user.matricule}`);
    return { success: false, error: 'AGENT_REVOQUE_ACCES_INTERDIT', code: 403 };
  }

  if (user.status === 'SUSPENDED') {
    logAuditEvent('SUSPENDED_ACCESS_ATTEMPT', user.id, clientIp, `Tentative de connexion d'un compte suspendu: ${user.matricule}`);
    return { success: false, error: 'COMPTE_SUSPENDU_PAR_ADMINISTRATION', code: 403 };
  }

  if (user.status === 'INVITED' || !user.password_hash) {
    return { success: false, error: 'COMPTE_EN_ATTENTE_ACTIVATION', code: 403 };
  }

  const validPassword = bcrypt.compareSync(String(password || ''), user.password_hash);
  if (!validPassword) {
    logAuditEvent('LOGIN_FAILED_PASSWORD', user.id, clientIp, `Échec mot de passe pour: ${user.matricule}`);
    return { success: false, error: 'IDENTIFIANTS_INVALIDES', code: 401 };
  }

  const challengeToken = createChallengeToken(user.id);

  return {
    success: true,
    requires2FA: true,
    challengeToken,
    userId: user.id,
    matricule: user.matricule,
    fullName: user.full_name,
    role: user.role
  };
}

/**
 * Étape 2 : Vérification stricte du second facteur TOTP RFC 6238 (aucun code maître)
 */
function verifySecondFactor(userId, totpCode, clientIp, options = {}) {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user || user.is_enrolled !== 1) {
    return { success: false, error: 'AGENT_REVOQUE_OU_INEXISTANT', code: 403 };
  }
  if (user.is_revoked === 1 || user.status === 'REVOKED') {
    return { success: false, error: 'AGENT_REVOQUE_OU_INEXISTANT', code: 403 };
  }
  if (user.status !== 'ACTIVE') {
    return { success: false, error: 'COMPTE_NON_ACTIF', code: 403 };
  }

  let isValid = false;
  const cleanCode = String(totpCode || '').trim();
  if (/^\d{6}$/.test(cleanCode) && user.totp_secret) {
    try {
      const checkRes = verifySync({ token: cleanCode, secret: user.totp_secret });
      isValid = Boolean(checkRes && checkRes.valid);
    } catch (_) {
      isValid = false;
    }
  }

  if (!isValid) {
    logAuditEvent('2FA_FAILED', user.id, clientIp, `Code TOTP invalide pour ${user.matricule}`);
    return { success: false, error: 'CODE_2FA_INVALIDE', code: 401 };
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, device_id, device_info, is_revoked)
    VALUES (?, ?, ?, ?, 0)
  `).run(
    sessionToken,
    user.id,
    options.deviceId || null,
    options.deviceInfo || 'Terminal FasoBrief'
  );

  logAuditEvent('LOGIN_SUCCESS_2FA', user.id, clientIp, `Connexion 2FA réussie pour ${user.full_name} (${user.role})`);

  return {
    success: true,
    token: sessionToken,
    user: formatUserPublic(user)
  };
}

/**
 * Création d'un compte invité par un ADMIN habilité
 */
function createInvitedAccount(payload, adminActor, clientIp) {
  const { matricule, fullName, role, serviceId, jobTitle } = payload || {};
  const cleanMatricule = String(matricule || '').trim().toUpperCase();
  const cleanName = String(fullName || '').trim();
  const allowedRoles = ['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE', 'AGENT'];

  if (!cleanMatricule || !cleanName || !allowedRoles.includes(role) || !serviceId) {
    return { success: false, error: 'CHAMPS_INVITATION_INVALIDES', code: 400 };
  }

  const existing = db.prepare(`SELECT id FROM users WHERE UPPER(matricule) = ?`).get(cleanMatricule);
  if (existing) {
    return { success: false, error: 'MATRICULE_DEJA_ATTRIBUE', code: 409 };
  }

  const serviceRow = db.prepare(`
    SELECT s.id, s.name AS service_name, d.name AS direction_name, o.code AS org_code, o.name AS org_name
    FROM services s
    JOIN directions d ON d.id = s.direction_id
    JOIN organisations o ON o.id = d.org_id
    WHERE s.id = ?
  `).get(serviceId);

  if (!serviceRow) {
    return { success: false, error: 'SERVICE_RATTACHEMENT_INTROUVABLE', code: 404 };
  }

  const serviceLabel = `${serviceRow.org_code} — ${serviceRow.service_name}`;
  const userId = 'usr_' + crypto.randomUUID();
  const invitationId = 'inv_' + crypto.randomUUID();
  const activationCode = generateActivationCode();
  const codeHash = hashActivationCode(activationCode);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO users (
      id, matricule, full_name, service_id, service_ministry, job_title,
      role, status, password_hash, totp_secret, is_enrolled, is_revoked, invited_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INVITED', '', '', 1, 0, ?)
  `).run(
    userId,
    cleanMatricule,
    cleanName,
    serviceId,
    serviceLabel,
    String(jobTitle || '').trim(),
    role,
    adminActor.id
  );

  db.prepare(`
    INSERT INTO invitations (id, user_id, code_hash, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(invitationId, userId, codeHash, expiresAt, adminActor.id);

  logAuditEvent(
    'ACCOUNT_INVITED',
    adminActor.id,
    clientIp,
    `Création d'invitation pour ${cleanName} (${cleanMatricule}, rôle ${role}, service ${serviceLabel})`,
    userId
  );

  return {
    success: true,
    user: {
      id: userId,
      matricule: cleanMatricule,
      fullName: cleanName,
      role,
      status: 'INVITED',
      serviceId,
      serviceMinistry: serviceLabel
    },
    invitation: {
      id: invitationId,
      activationCode, // Retourné UNE SEULE FOIS à l'administrateur pour remise hors bande
      expiresAt,
      deliveryNotice: 'Aucun serveur SMTP externe configuré (exigence de souveraineté) : remettre ce code à usage unique par canal administratif interne.'
    }
  };
}

/**
 * Étape 1 d'activation : vérification matricule + code à usage unique -> génération secret TOTP
 */
function initiateAccountActivation(matricule, activationCode, clientIp) {
  const cleanMatricule = String(matricule || '').trim().toUpperCase();
  const user = db.prepare(`SELECT * FROM users WHERE UPPER(matricule) = ?`).get(cleanMatricule);

  if (!user || user.status !== 'INVITED' || user.is_revoked === 1) {
    logAuditEvent('ACTIVATION_FAILED', user ? user.id : null, clientIp, `Échec initiation activation pour matricule: ${cleanMatricule}`);
    return { success: false, error: 'INVITATION_INVALIDE_OU_DEJA_UTILISEE', code: 403 };
  }

  const codeHash = hashActivationCode(activationCode);
  const inv = db.prepare(`
    SELECT * FROM invitations
    WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id, codeHash);

  if (!inv || new Date(inv.expires_at).getTime() < Date.now()) {
    logAuditEvent('ACTIVATION_FAILED', user.id, clientIp, `Code d'activation erroné ou expiré pour ${cleanMatricule}`);
    return { success: false, error: 'CODE_ACTIVATION_INVALIDE_OU_EXPIRE', code: 403 };
  }

  const totpSecret = inv.pending_totp_secret || generateBase32Secret(20);
  if (!inv.pending_totp_secret) {
    db.prepare(`UPDATE invitations SET pending_totp_secret = ? WHERE id = ?`).run(totpSecret, inv.id);
  }

  const label = encodeURIComponent(`FasoBrief:${user.matricule}`);
  const otpauthUri = `otpauth://totp/${label}?secret=${totpSecret}&issuer=FasoBrief&algorithm=SHA1&digits=6&period=30`;

  return {
    success: true,
    userId: user.id,
    matricule: user.matricule,
    fullName: user.full_name,
    role: user.role,
    serviceMinistry: user.service_ministry,
    totpSecret,
    otpauthUri
  };
}

/**
 * Étape 2 d'activation : mot de passe fort (>= 12 car.) + validation d'un code TOTP réel -> ACTIVE
 */
function completeAccountActivation(payload, clientIp) {
  const { matricule, activationCode, password, totpCode, deviceInfo, deviceId } = payload || {};
  const cleanMatricule = String(matricule || '').trim().toUpperCase();
  const rawPassword = String(password || '');

  if (rawPassword.length < 12) {
    return { success: false, error: 'MOT_DE_PASSE_TROP_COURT_MIN_12', code: 400 };
  }

  const user = db.prepare(`SELECT * FROM users WHERE UPPER(matricule) = ?`).get(cleanMatricule);
  if (!user || user.status !== 'INVITED' || user.is_revoked === 1) {
    return { success: false, error: 'INVITATION_INVALIDE_OU_DEJA_UTILISEE', code: 403 };
  }

  const codeHash = hashActivationCode(activationCode);
  const inv = db.prepare(`
    SELECT * FROM invitations
    WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id, codeHash);

  if (!inv || !inv.pending_totp_secret || new Date(inv.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'CODE_ACTIVATION_INVALIDE_OU_EXPIRE', code: 403 };
  }

  const cleanTotp = String(totpCode || '').trim();
  let validTotp = false;
  if (/^\d{6}$/.test(cleanTotp)) {
    try {
      const checkRes = verifySync({ token: cleanTotp, secret: inv.pending_totp_secret });
      validTotp = Boolean(checkRes && checkRes.valid);
    } catch (_) {
      validTotp = false;
    }
  }

  if (!validTotp) {
    logAuditEvent('ACTIVATION_2FA_FAILED', user.id, clientIp, `Échec validation TOTP initiale pour ${user.matricule}`);
    return { success: false, error: 'CODE_2FA_INVALIDE', code: 401 };
  }

  const passwordHash = bcrypt.hashSync(rawPassword, 10);

  db.prepare(`
    UPDATE users
    SET password_hash = ?, totp_secret = ?, status = 'ACTIVE', activated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(passwordHash, inv.pending_totp_secret, user.id);

  db.prepare(`
    UPDATE invitations
    SET used_at = CURRENT_TIMESTAMP, pending_totp_secret = NULL
    WHERE id = ?
  `).run(inv.id);

  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, device_id, device_info, is_revoked)
    VALUES (?, ?, ?, ?, 0)
  `).run(sessionToken, user.id, deviceId || null, deviceInfo || 'Terminal FasoBrief Activé');

  logAuditEvent('ACCOUNT_ACTIVATED', user.id, clientIp, `Activation complète et 2FA vérifié pour ${user.full_name} (${user.matricule})`);

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  return {
    success: true,
    token: sessionToken,
    user: formatUserPublic(updatedUser)
  };
}

function formatUserPublic(u) {
  let mutedGroups = [];
  try {
    mutedGroups = JSON.parse(u.notif_muted_groups || '[]');
  } catch (_) {
    mutedGroups = [];
  }
  return {
    id: u.id,
    matricule: u.matricule,
    fullName: u.full_name,
    role: u.role,
    status: u.status || (u.is_revoked ? 'REVOKED' : 'ACTIVE'),
    serviceId: u.service_id || null,
    serviceMinistry: u.service_ministry,
    jobTitle: u.job_title || '',
    notifBrowserEnabled: Boolean(u.notif_browser_enabled),
    notifMutedGroups: mutedGroups
  };
}

/**
 * Validation continue d'un jeton de session (vérifie session ET statut courant du compte)
 */
function validateSession(token) {
  if (!token) return null;

  const row = db.prepare(`
    SELECT s.token, s.device_id, s.is_revoked AS session_revoked,
           u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!row) return null;
  if (row.session_revoked === 1 || row.is_revoked === 1 || row.status !== 'ACTIVE' || row.is_enrolled !== 1) {
    return null;
  }

  return formatUserPublic(row);
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const user = validateSession(token);
  if (!user) {
    return res.status(401).json({ error: 'SESSION_INVALIDE_OU_REVOQUEE' });
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      logAuditEvent(
        'RBAC_ACCESS_DENIED',
        req.user ? req.user.id : null,
        req.ip,
        `Refus d'accès RBAC sur ${req.method} ${req.originalUrl}`
      );
      return res.status(403).json({ error: 'PERMISSION_REFUSEE_ROLE_INSUFFISANT' });
    }
    next();
  };
}

module.exports = {
  generateBase32Secret,
  hashActivationCode,
  generateActivationCode,
  consumeChallengeToken,
  authenticateFirstFactor,
  verifySecondFactor,
  createInvitedAccount,
  initiateAccountActivation,
  completeAccountActivation,
  validateSession,
  requireAuth,
  requireRole,
  logAuditEvent,
  formatUserPublic
};
