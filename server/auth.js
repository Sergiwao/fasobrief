/**
 * FASOBRIEF - Module d'Authentification Forte (2FA TOTP), Rôles (RBAC) & Sessions
 * 
 * Exigences du règlement :
 * - Aucun accès sans enrôlement préalable (Rejet automatique des intrus)
 * - Authentification forte obligatoire (Mot de passe + TOTP RFC 6238)
 * - Rôles stricts : ADMIN, DIRECTEUR, CHEF_SERVICE, AGENT
 * - Journalisation immuable dans audit_logs
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { verifySync } = require('otplib');
const { db } = require('./database');

function logAuditEvent(eventType, actorId, ipAddress, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (event_type, actor_id, ip_address, details)
      VALUES (?, ?, ?, ?)
    `).run(eventType, actorId || null, ipAddress || '127.0.0.1', details || '');
  } catch (err) {
    console.error('[AUDIT_ERROR]', err);
  }
}

/**
 * Étape 1 : Vérification de l'Identité (Matricule + Mot de passe)
 * Détecte immédiatement les comptes non enrôlés ou révoqués.
 */
function authenticateFirstFactor(matricule, password, clientIp) {
  const user = db.prepare(`SELECT * FROM users WHERE matricule = ?`).get(matricule);

  // Rejet si utilisateur inconnu ou non enrôlé (Épreuve INTRUS)
  if (!user || user.is_enrolled !== 1) {
    logAuditEvent('INTRUSION_ATTEMPT', null, clientIp, `Tentative d'accès non autorisée avec matricule: ${matricule}`);
    return { success: false, error: 'COMPTE_NON_ENROLE_OU_INCONNU', code: 403 };
  }

  // Rejet si l'agent a été révoqué
  if (user.is_revoked === 1) {
    logAuditEvent('REVOKED_ACCESS_ATTEMPT', user.id, clientIp, `Tentative de connexion d'un agent révoqué: ${user.matricule}`);
    return { success: false, error: 'AGENT_REVOQUE_ACCES_INTERDIT', code: 403 };
  }

  // Vérification du mot de passe
  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    logAuditEvent('LOGIN_FAILED_PASSWORD', user.id, clientIp, `Échec mot de passe pour: ${user.matricule}`);
    return { success: false, error: 'IDENTIFIANTS_INVALIDES', code: 401 };
  }

  // Succès 1er facteur -> en attente du TOTP (2FA)
  return {
    success: true,
    requires2FA: true,
    userId: user.id,
    matricule: user.matricule,
    fullName: user.full_name,
    role: user.role
  };
}

/**
 * Étape 2 : Vérification du Second Facteur (TOTP à 6 chiffres)
 */
function verifySecondFactor(userId, totpCode, clientIp) {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user || user.is_revoked === 1) {
    return { success: false, error: 'AGENT_REVOQUE_OU_INEXISTANT', code: 403 };
  }

  // Validation du code TOTP via le secret standard RFC 6238
  let isValid = false;
  try {
    const checkRes = verifySync({ token: String(totpCode).trim(), secret: user.totp_secret });
    isValid = !!(checkRes && checkRes.valid);
  } catch (err) {
    isValid = false;
  }

  if (!isValid) {
    logAuditEvent('2FA_FAILED', user.id, clientIp, 'Code TOTP invalide ou expiré');
    return { success: false, error: 'CODE_2FA_INVALIDE', code: 401 };
  }

  // Création de la session active
  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, device_info, is_revoked)
    VALUES (?, ?, ?, 0)
  `).run(sessionToken, user.id, 'Web Client - Session Sécurisée');

  logAuditEvent('LOGIN_SUCCESS_2FA', user.id, clientIp, `Connexion 2FA réussie pour ${user.full_name} (${user.role})`);

  return {
    success: true,
    token: sessionToken,
    user: {
      id: user.id,
      matricule: user.matricule,
      fullName: user.full_name,
      role: user.role,
      serviceMinistry: user.service_ministry,
      publicIdentityKey: user.public_identity_key
    }
  };
}

/**
 * Validation d'une Session Active
 * Vérifie instantanément si la session ou l'utilisateur a été révoqué.
 */
function validateSession(token) {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.token, s.is_revoked AS session_revoked, u.id, u.matricule, u.full_name, u.role, u.is_revoked AS user_revoked, u.service_ministry, u.public_identity_key
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!session) return null;
  if (session.session_revoked === 1 || session.user_revoked === 1) {
    return null; // Session ou compte révoqué !
  }

  return {
    token: session.token,
    id: session.id,
    matricule: session.matricule,
    fullName: session.full_name,
    role: session.role,
    serviceMinistry: session.service_ministry,
    publicIdentityKey: session.public_identity_key
  };
}

/**
 * Middleware Express de Protection des Routes
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const user = validateSession(token);
  if (!user) {
    return res.status(401).json({ error: 'SESSION_INVALIDE_OU_REVOQUEE' });
  }

  req.user = user;
  next();
}

/**
 * Middleware de Vérification des Rôles (RBAC)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      logAuditEvent('RBAC_DENIED', req.user ? req.user.id : null, req.ip, `Refus d'accès au rôle: ${req.user ? req.user.role : 'none'}`);
      return res.status(403).json({ error: 'ACCES_REFUSE_ROLE_INSUFFISANT' });
    }
    next();
  };
}

module.exports = {
  authenticateFirstFactor,
  verifySecondFactor,
  validateSession,
  requireAuth,
  requireRole,
  logAuditEvent
};
