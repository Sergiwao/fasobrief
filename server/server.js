/**
 * FASOBRIEF - Serveur Souverain d'Administration Publique
 *
 * Architecture :
 * - Chiffrement de bout en bout Olm (1:1 Double Ratchet) + Megolm (Sessions de groupe)
 *   + WebCrypto AES-256-GCM pour les pièces jointes (modèle Matrix EncryptedFile).
 * - Aucun message, titre/description d'instruction, fichier ni clé privée en clair sur le serveur.
 * - Authentification forte 2FA TOTP (RFC 6238) sans code maître.
 * - Cycle des comptes : INVITED -> ACTIVE <-> SUSPENDED -> REVOKED (définitif).
 * - Annuaire institutionnel (Organisations -> Directions -> Services -> Agents).
 * - Statuts réels d'envoi/livraison/lecture, notifications internes sans fuite de contenu,
 *   cycle complet et versionné des instructions administratives.
 */

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { db, initializeDatabase } = require('./database');
const { seedDatabase } = require('./seed');
const { validateSession } = require('./auth');
const { registerSocket, unregisterSocket } = require('./ws-hub');
const { checkUpcomingInstructionDeadlines } = require('./notifications-service');

const authRoutes = require('./routes/auth-routes');
const { router: cryptoRoutes } = require('./routes/crypto-routes');
const directoryRoutes = require('./routes/directory-routes');
const conversationsRoutes = require('./routes/conversations-routes');
const instructionsRoutes = require('./routes/instructions-routes');
const notificationsRoutes = require('./routes/notifications-routes');
const adminRoutes = require('./routes/admin-routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// En-têtes de sécurité HTTP sobres
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques du client et binaire WebAssembly @matrix-org/olm local (zéro CDN externe)
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const OLM_DIR = path.join(__dirname, '..', 'node_modules', '@matrix-org', 'olm');
app.use(express.static(CLIENT_DIR));
app.use('/vendor/olm', express.static(OLM_DIR));

// Sonde de santé conteneur
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', e2ee: 'olm-megolm', timestamp: new Date().toISOString() });
});

// Montage des routes API modulaires
app.use('/api/auth', authRoutes);
app.use('/api', cryptoRoutes);
app.use('/api', directoryRoutes);
app.use('/api', conversationsRoutes);
app.use('/api', instructionsRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', adminRoutes);

// Gestionnaire d'erreurs Express (ex. dépassement taille fichier Multer)
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'FICHIER_TROP_VOLUMINEUX_MAX_25_MO' });
  }
  console.error('[HTTP_ERROR]', err);
  res.status(500).json({ error: 'ERREUR_INTERNE_SERVEUR' });
});

// ==============================================================================
// WEBSOCKET TEMPS RÉEL AUTHENTIFIÉ (/ws)
// ==============================================================================
wss.on('connection', (ws) => {
  let authenticatedUser = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'AUTH') {
        const user = validateSession(msg.token);
        if (!user) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'SESSION_INVALIDE_OU_REVOQUEE' }));
          ws.close(4001, 'UNAUTHORIZED');
          return;
        }

        authenticatedUser = user;
        registerSocket(user, ws, msg.token, msg.deviceId || null);

        ws.send(JSON.stringify({
          type: 'AUTH_SUCCESS',
          userId: user.id,
          fullName: user.fullName,
          role: user.role
        }));
        return;
      }

      if (!authenticatedUser) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'NON_AUTHENTIFIE' }));
        return;
      }

      const freshUser = validateSession(ws.fasoToken);
      if (!freshUser) {
        const row = db.prepare(`SELECT status, is_revoked FROM users WHERE id = ?`).get(authenticatedUser.id);
        const isSuspended = row && row.status === 'SUSPENDED' && !row.is_revoked;
        ws.send(JSON.stringify({
          type: 'SECURITY_ALERT',
          event: isSuspended ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REVOKED'
        }));
        ws.close(4001, isSuspended ? 'ACCOUNT_SUSPENDED' : 'AGENT_REVOKED');
        return;
      }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (err) {
      console.error('[WS_ERROR]', err);
    }
  });

  ws.on('close', () => {
    unregisterSocket(ws);
  });
});

// Vérification périodique des échéances < 24 h (toutes les 5 minutes, unref pour ne pas bloquer les tests)
const deadlineTimer = setInterval(() => {
  try {
    checkUpcomingInstructionDeadlines();
  } catch (_) {}
}, 5 * 60 * 1000);
if (typeof deadlineTimer.unref === 'function') {
  deadlineTimer.unref();
}

const PORT = process.env.PORT || 3000;

function initApp({ skipSeed = false } = {}) {
  initializeDatabase();
  if (!skipSeed) {
    seedDatabase({ forceReset: false });
  }
  return app;
}

function startServer(port = PORT) {
  initApp();
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const actualPort = server.address().port;
      console.log('================================================================');
      console.log('[FASOBRIEF] Serveur Souverain Opérationnel');
      console.log(`[HTTP]       http://0.0.0.0:${actualPort}`);
      console.log(`[WEBSOCKET]  ws://0.0.0.0:${actualPort}/ws`);
      console.log(`[E2EE]       Olm (Double Ratchet) + Megolm + AES-256-GCM Fichiers`);
      console.log(`[2FA TOTP]   RFC 6238 strict | Demo Mode: ${process.env.FASOBRIEF_DEMO_MODE === '1' ? 'OUI' : 'NON'}`);
      console.log('================================================================');
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, wss, initApp, startServer };
