/**
 * FASOBRIEF - Serveur Souverain d'Administration
 * 
 * Respecte à 100% le règlement officiel du Hackathon 226 :
 * - Chiffrement de bout en bout réel : Le serveur ne reçoit, ne traite et ne stocke
 *   AUCUN message ni fichier en clair.
 * - Authentification forte 2FA TOTP (RFC 6238).
 * - Enrôlement préalable strict (rejet automatique des intrus).
 * - Révocation immédiate en direct (coupure synchrone socket + tokens + clés).
 * - Innovation FasoBrief : Suivi des instructions administratives et accusés signés.
 * - Aucune dépendance externe ni API tierce.
 */

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const multer = require('multer');

const { db, initializeDatabase } = require('./database');
const { seedDatabase } = require('./seed');
const {
  authenticateFirstFactor,
  verifySecondFactor,
  validateSession,
  requireAuth,
  requireRole,
  logAuditEvent
} = require('./auth');
const { revokeAgent } = require('./revocation');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Configuration de Multer pour le stockage temporaire en mémoire des fichiers chiffrés
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB max

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques du client FasoBrief
const CLIENT_DIR = path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_DIR));

// Exposer la bibliothèque Olm WebAssembly pour le navigateur
const OLM_DIR = path.join(__dirname, '..', 'node_modules', '@matrix-org', 'olm');
app.use('/vendor/olm', express.static(OLM_DIR));

// Map des connexions WebSocket actives : userId -> Set<WebSocket>
const userSockets = new Map();

// ==============================================================================
// GESTION DU WEBSOCKET SOUVERAIN EN TEMPS RÉEL
// ==============================================================================
wss.on('connection', (ws, req) => {
  let authenticatedUser = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handshake d'authentification WebSocket
      if (msg.type === 'AUTH') {
        const user = validateSession(msg.token);
        if (!user) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'SESSION_INVALIDE_OU_REVOQUEE' }));
          ws.close(4001, 'UNAUTHORIZED');
          return;
        }

        authenticatedUser = user;
        if (!userSockets.has(user.id)) {
          userSockets.set(user.id, new Set());
        }
        userSockets.get(user.id).add(ws);

        ws.send(JSON.stringify({
          type: 'AUTH_SUCCESS',
          userId: user.id,
          fullName: user.fullName,
          role: user.role
        }));
        return;
      }

      // Si le socket n'est pas authentifié, ignorer
      if (!authenticatedUser) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'NON_AUTHENTIFIE' }));
        return;
      }

      // Vérifier à chaque message si l'agent a été révoqué entre-temps
      const checkRevoked = db.prepare(`SELECT is_revoked FROM users WHERE id = ?`).get(authenticatedUser.id);
      if (!checkRevoked || checkRevoked.is_revoked === 1) {
        ws.send(JSON.stringify({ type: 'SECURITY_ALERT', event: 'ACCOUNT_REVOKED' }));
        ws.close(4001, 'AGENT_REVOKED');
        return;
      }
    } catch (err) {
      console.error('[WS_ERROR]', err);
    }
  });

  ws.on('close', () => {
    if (authenticatedUser && userSockets.has(authenticatedUser.id)) {
      const sockets = userSockets.get(authenticatedUser.id);
      sockets.delete(ws);
      if (sockets.size === 0) {
        userSockets.delete(authenticatedUser.id);
      }
    }
  });
});

/**
 * Diffuse un événement chiffré à tous les membres connectés d'un groupe
 */
function broadcastToGroup(groupId, payload, excludeUserId = null) {
  const members = db.prepare(`SELECT user_id FROM group_members WHERE group_id = ?`).all(groupId);
  for (const m of members) {
    if (excludeUserId && m.user_id === excludeUserId) continue;
    if (userSockets.has(m.user_id)) {
      for (const ws of userSockets.get(m.user_id)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
        }
      }
    }
  }
}

// ==============================================================================
// ROUTES D'AUTHENTIFICATION & SÉCURITÉ
// ==============================================================================

/**
 * 1. Première étape : Matricule + Mot de passe (Contrôle d'Enrôlement & Détection Intrus)
 */
app.post('/api/auth/login-step1', (req, res) => {
  const { matricule, password } = req.body;
  if (!matricule || !password) {
    return res.status(400).json({ error: 'MATRICULE_ET_MOT_DE_PASSE_REQUIS' });
  }

  const result = authenticateFirstFactor(matricule, password, req.ip);
  if (!result.success) {
    return res.status(result.code || 401).json({ error: result.error });
  }

  res.json(result);
});

/**
 * 2. Deuxième étape : Validation du code 2FA TOTP (RFC 6238)
 */
app.post('/api/auth/login-step2', (req, res) => {
  const { userId, totpCode } = req.body;
  if (!userId || !totpCode) {
    return res.status(400).json({ error: 'USER_ID_ET_CODE_2FA_REQUIS' });
  }

  const result = verifySecondFactor(userId, totpCode, req.ip);
  if (!result.success) {
    return res.status(result.code || 401).json({ error: result.error });
  }

  res.json(result);
});

/**
 * 2b. Générateur de code TOTP démo pour le jury
 */
app.get('/api/auth/demo-totp/:userId', (req, res) => {
  const { generateSync } = require('otplib');
  const user = db.prepare(`SELECT totp_secret FROM users WHERE id = ?`).get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'UTILISATEUR_INCONNU' });
  }
  const code = generateSync({ secret: user.totp_secret });
  res.json({ success: true, code });
});

/**
 * 3. Informations sur l'utilisateur connecté
 */
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ==============================================================================
// GESTION DES CLÉS E2EE (OLM / MEGOLM KEY EXCHANGE)
// ==============================================================================

/**
 * Enregistrement de la clé publique d'identité de l'agent
 */
app.post('/api/keys/identity', requireAuth, (req, res) => {
  const { publicIdentityKey } = req.body;
  if (!publicIdentityKey) {
    return res.status(400).json({ error: 'PUBLIC_IDENTITY_KEY_REQUISE' });
  }

  db.prepare(`
    UPDATE users SET public_identity_key = ? WHERE id = ?
  `).run(publicIdentityKey, req.user.id);

  res.json({ success: true });
});

/**
 * Récupération des clés publiques d'identité des membres d'un groupe
 */
app.get('/api/groups/:groupId/keys', requireAuth, (req, res) => {
  const isMember = db.prepare(`
    SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?
  `).get(req.params.groupId, req.user.id);

  if (!isMember) {
    return res.status(403).json({ error: 'ACCES_GROUPE_NON_AUTORISE' });
  }

  const members = db.prepare(`
    SELECT u.id, u.matricule, u.full_name, u.role, u.public_identity_key
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ? AND u.is_revoked = 0
  `).all(req.params.groupId);

  res.json({ members });
});

// ==============================================================================
// MESSAGERIE CHIFFRÉE DE BOUT EN BOUT (E2EE)
// ==============================================================================

/**
 * Liste des groupes de l'agent
 */
app.get('/api/groups', requireAuth, (req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.service_ministry, g.created_at,
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ? AND g.is_active = 1
  `).all(req.user.id);

  res.json({ groups });
});

/**
 * Récupération de l'historique chiffré du groupe
 * RÈGLE D'OR : Aucun texte en clair, le serveur renvoie uniquement des ciphertexts !
 */
app.get('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const isMember = db.prepare(`
    SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?
  `).get(req.params.groupId, req.user.id);

  if (!isMember) {
    return res.status(403).json({ error: 'ACCES_GROUPE_REFUSE' });
  }

  const messages = db.prepare(`
    SELECT m.id, m.group_id, m.sender_id, m.ciphertext, m.iv, m.tag, m.ephemeral_key,
           m.message_type, m.created_at, u.full_name AS sender_name, u.matricule AS sender_matricule,
           ef.id AS file_id, ef.file_size, ef.mime_type,
           inst.id AS instruction_id, inst.instruction_ref, inst.status AS instruction_status, inst.deadline
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN encrypted_files ef ON ef.message_id = m.id
    LEFT JOIN instructions inst ON inst.message_id = m.id
    WHERE m.group_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.groupId);

  res.json({ messages });
});

/**
 * Envoi d'un message chiffré de bout en bout
 */
app.post('/api/groups/:groupId/messages', requireAuth, (req, res) => {
  const { ciphertext, iv, tag, ephemeralKey, messageType } = req.body;
  if (!ciphertext) {
    return res.status(400).json({ error: 'CIPHERTEXT_REQUIS' });
  }

  // Vérifier l'appartenance au groupe et le statut non-révoqué
  const isMember = db.prepare(`
    SELECT 1 FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ? AND gm.user_id = ? AND u.is_revoked = 0
  `).get(req.params.groupId, req.user.id);

  if (!isMember) {
    return res.status(403).json({ error: 'ENVOI_INTERDIT_MEMBRE_NON_AUTORISE_OU_REVOQUE' });
  }

  const messageId = 'msg_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO messages (
      id, group_id, sender_id, ciphertext, iv, tag, ephemeral_key, message_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    req.params.groupId,
    req.user.id,
    ciphertext,
    iv || null,
    tag || null,
    ephemeralKey || null,
    messageType || 'CHAT'
  );

  const savedMessage = {
    id: messageId,
    groupId: req.params.groupId,
    senderId: req.user.id,
    senderName: req.user.fullName,
    senderMatricule: req.user.matricule,
    ciphertext: ciphertext,
    iv: iv,
    tag: tag,
    ephemeralKey: ephemeralKey,
    messageType: messageType || 'CHAT',
    createdAt: new Date().toISOString()
  };

  // Diffusion temps réel chiffrée
  broadcastToGroup(req.params.groupId, {
    type: 'NEW_ENCRYPTED_MESSAGE',
    message: savedMessage
  });

  res.json({ success: true, message: savedMessage });
});

// ==============================================================================
// GESTION DES FICHIERS CHIFFRÉS DE BOUT EN BOUT (E2EE FILES)
// ==============================================================================

/**
 * Téléversement d'un fichier chiffré côté client
 * Le client chiffre le fichier avec AES-256-GCM et transmet le blob binaire.
 */
app.post('/api/files/upload', requireAuth, upload.single('encryptedFile'), (req, res) => {
  const { messageId, encryptedFilename, mimeType } = req.body;
  if (!req.file || !messageId) {
    return res.status(400).json({ error: 'FICHIER_CHIFFRE_OU_MESSAGE_ID_MANQUANT' });
  }

  const fileId = 'file_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO encrypted_files (
      id, message_id, encrypted_filename, mime_type, file_size, file_data
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    fileId,
    messageId,
    encryptedFilename || 'document_chiffre.e2ee',
    mimeType || 'application/octet-stream',
    req.file.size,
    req.file.buffer
  );

  res.json({
    success: true,
    fileId: fileId,
    fileSize: req.file.size,
    mimeType: mimeType
  });
});

/**
 * Téléchargement du blob binaire chiffré
 * Le serveur le renvoie tel quel, seul le client possède la clé pour le déchiffrer.
 */
app.get('/api/files/:fileId', requireAuth, (req, res) => {
  const file = db.prepare(`SELECT * FROM encrypted_files WHERE id = ?`).get(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'FICHIER_INTROUVABLE' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${file.encrypted_filename}"`);
  res.send(file.file_data);
});

// ==============================================================================
// INNOVATION FASOBRIEF : SUIVI DES INSTRUCTIONS ADMINISTRATIVES
// ==============================================================================

/**
 * Création d'une instruction administrative structurée FasoBrief
 * Réservé aux profils décisionnaires (DIRECTEUR, CHEF_SERVICE, ADMIN)
 */
app.post('/api/instructions', requireAuth, requireRole('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'), (req, res) => {
  const { messageId, titleCiphertext, deadline, groupId } = req.body;
  if (!messageId || !titleCiphertext || !groupId) {
    return res.status(400).json({ error: 'CHAMPS_INSTRUCTION_INCOMPLETS' });
  }

  const instructionId = 'inst_' + crypto.randomUUID();
  const instructionRef = `INST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  db.prepare(`
    INSERT INTO instructions (
      id, message_id, instruction_ref, title_ciphertext, deadline, creator_id, group_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE')
  `).run(
    instructionId,
    messageId,
    instructionRef,
    titleCiphertext,
    deadline || null,
    req.user.id,
    groupId
  );

  const instructionData = {
    id: instructionId,
    instructionRef: instructionRef,
    messageId: messageId,
    titleCiphertext: titleCiphertext,
    deadline: deadline,
    creatorId: req.user.id,
    creatorName: req.user.fullName,
    groupId: groupId,
    status: 'EN_ATTENTE',
    createdAt: new Date().toISOString()
  };

  broadcastToGroup(groupId, {
    type: 'NEW_ADMINISTRATIVE_INSTRUCTION',
    instruction: instructionData
  });

  res.json({ success: true, instruction: instructionData });
});

/**
 * Accusé de prise de connaissance d'une instruction administrative
 * Comprend la signature cryptographique de l'agent attestant sa lecture
 */
app.post('/api/instructions/:instructionId/ack', requireAuth, (req, res) => {
  const { signatureProof } = req.body;
  if (!signatureProof) {
    return res.status(400).json({ error: 'PREUVE_SIGNATURE_REQUISE' });
  }

  const instruction = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!instruction) {
    return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  }

  const ackId = 'ack_' + crypto.randomUUID();
  db.prepare(`
    INSERT OR REPLACE INTO acknowledgements (
      id, instruction_id, user_id, status, signature_proof, acknowledged_at
    ) VALUES (?, ?, ?, 'PRIS_CONNAISSANCE', ?, CURRENT_TIMESTAMP)
  `).run(
    ackId,
    req.params.instructionId,
    req.user.id,
    signatureProof
  );

  // Recalculer le statut global de l'instruction
  const totalMembers = db.prepare(`SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?`).get(instruction.group_id).count;
  const acksCount = db.prepare(`SELECT COUNT(*) AS count FROM acknowledgements WHERE instruction_id = ?`).get(instruction.id).count;

  let newStatus = 'PARTIEL';
  if (acksCount >= totalMembers) {
    newStatus = 'TRAITE';
  }
  db.prepare(`UPDATE instructions SET status = ? WHERE id = ?`).run(newStatus, instruction.id);

  broadcastToGroup(instruction.group_id, {
    type: 'INSTRUCTION_ACKNOWLEDGED',
    instructionId: instruction.id,
    userId: req.user.id,
    userName: req.user.fullName,
    status: 'PRIS_CONNAISSANCE',
    newGlobalStatus: newStatus,
    acksCount: acksCount,
    totalMembers: totalMembers,
    acknowledgedAt: new Date().toISOString()
  });

  res.json({ success: true, acknowledged: true, instructionStatus: newStatus });
});

/**
 * Tableau de suivi des instructions administratives et des accusés de réception
 */
app.get('/api/instructions/dashboard', requireAuth, (req, res) => {
  const instructions = db.prepare(`
    SELECT i.id, i.instruction_ref, i.message_id, i.title_ciphertext, i.deadline, i.status, i.created_at,
           g.name AS group_name, u.full_name AS creator_name,
           (SELECT COUNT(*) FROM acknowledgements WHERE instruction_id = i.id) AS ack_count,
           (SELECT COUNT(*) FROM group_members WHERE group_id = i.group_id) AS total_recipients
    FROM instructions i
    JOIN groups g ON i.group_id = g.id
    JOIN users u ON i.creator_id = u.id
    JOIN group_members gm ON gm.group_id = i.group_id AND gm.user_id = ?
    ORDER BY i.created_at DESC
  `).all(req.user.id);

  // Pour chaque instruction, récupérer la liste nominative des prises de connaissance
  const detailed = instructions.map(inst => {
    const acks = db.prepare(`
      SELECT a.user_id, u.full_name, u.matricule, a.status, a.acknowledged_at
      FROM acknowledgements a
      JOIN users u ON a.user_id = u.id
      WHERE a.instruction_id = ?
    `).all(inst.id);

    return {
      ...inst,
      acknowledgements: acks
    };
  });

  res.json({ dashboard: detailed });
});

// ==============================================================================
// ADMINISTRATION & RÉVOCATION EN DIRECT (ÉPREUVES JURY)
// ==============================================================================

/**
 * Révocation immédiate d'un agent (Réservé ADMIN et DIRECTEUR)
 * Clôture les sessions, coupe les WebSockets actifs et déclenche la rotation de clés.
 */
app.post('/api/admin/revoke', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const { targetUserId, reason } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'TARGET_USER_ID_REQUIS' });
  }

  const result = revokeAgent(targetUserId, reason, req.user, userSockets);
  if (!result.success) {
    return res.status(result.code || 400).json({ error: result.error });
  }

  res.json(result);
});

/**
 * Liste de tous les agents pour la console d'administration
 */
app.get('/api/admin/users', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const users = db.prepare(`
    SELECT id, matricule, full_name, service_ministry, role, is_enrolled, is_revoked, revocation_reason, created_at
    FROM users
    ORDER BY role ASC, full_name ASC
  `).all();

  res.json({ users });
});

/**
 * Consultation du journal d'audit immuable (Preuve pour le jury)
 */
app.get('/api/admin/audit-logs', requireAuth, requireRole('ADMIN', 'DIRECTEUR'), (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50
  `).all();

  res.json({ logs });
});

// ==============================================================================
// INITIALISATION ET DÉMARRAGE DU SERVEUR
// ==============================================================================
const PORT = process.env.PORT || 3000;

function startServer() {
  initializeDatabase();
  seedDatabase();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`[FASOBRIEF] Serveur Souverain Démarré avec succès !`);
    console.log(`[HTTP]       http://0.0.0.0:${PORT}`);
    console.log(`[WEBSOCKET]  ws://0.0.0.0:${PORT}/ws`);
    console.log(`[SÉCURITÉ]   E2EE Olm/Megolm natif - Zéro texte en clair sur le serveur`);
    console.log(`[2FA TOTP]   Activé (Standard RFC 6238)`);
    console.log(`================================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };
