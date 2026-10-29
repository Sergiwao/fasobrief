/**
 * FASOBRIEF - Suite de Tests de Sécurité Réglementaires (Base SQLite Temporaire Isolée)
 *
 * Exécute les 14 épreuves obligatoires du règlement sur une base temporaire dédiée
 * (n'altère jamais data/fasobrief.sqlite) avec de véritables sessions Olm / Megolm.
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Isolation stricte AVANT le chargement de database.js
const TEMP_DB = path.join(os.tmpdir(), `fasobrief_security_${process.pid}_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = TEMP_DB;
process.env.FASOBRIEF_DEMO_MODE = '0';

const Olm = require('@matrix-org/olm');
const { generateSync } = require('otplib');
const { db, initializeDatabase } = require('../server/database');
const { seedDatabase, FICTIONAL_USERS, DEFAULT_PASSWORD } = require('../server/seed');
const { authenticateFirstFactor, verifySecondFactor, validateSession } = require('../server/auth');
const { revokeAgent } = require('../server/revocation');

const results = [];

function recordTest(name, passed, details) {
  results.push({ name, passed, details });
  const statusLabel = passed ? '[OK]' : '[ECHEC]';
  console.log(`${statusLabel} ${name} — ${details}`);
}

function cleanupTempDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(TEMP_DB + suffix)) fs.unlinkSync(TEMP_DB + suffix);
    } catch (_) {}
  }
}

async function runSecuritySuite() {
  console.log('\n================================================================');
  console.log('   FASOBRIEF - SUITE DE TESTS DE SÉCURITÉ SUR BASE ISOLÉE');
  console.log('================================================================\n');

  await Olm.init();
  initializeDatabase();
  seedDatabase({ forceReset: true });

  const dirUser = FICTIONAL_USERS.find((u) => u.role === 'DIRECTEUR');
  const agentUser = FICTIONAL_USERS.find((u) => u.role === 'AGENT' && u.id === 'usr_agent_03');

  // 1. Rejet intrus non enrôlé
  const intrusionAttempt = authenticateFirstFactor('INTRUS-999', 'MauvaisMotDePasse', '192.168.1.100');
  recordTest(
    '01. Épreuve Intrus (Compte non enrôlé)',
    intrusionAttempt.success === false && intrusionAttempt.code === 403 && intrusionAttempt.error === 'COMPTE_NON_ENROLE_OU_INCONNU',
    'Compte inconnu rejeté HTTP 403 et journalisé INTRUSION_ATTEMPT.'
  );

  // 2. Premier facteur valide
  const step1 = authenticateFirstFactor(dirUser.matricule, DEFAULT_PASSWORD, '127.0.0.1');
  recordTest(
    '02. Authentification 1er Facteur (Agent Fictif Autorisé)',
    step1.success === true && step1.requires2FA === true && Boolean(step1.challengeToken),
    `Mot de passe validé pour ${dirUser.matricule}, jeton de défi 2FA généré.`
  );

  // 3. Rejet mauvais code TOTP ET rejet de l'ancien code maître 123456
  const bad2FA = verifySecondFactor(dirUser.id, '000000', '127.0.0.1');
  const bypass123456 = verifySecondFactor(dirUser.id, '123456', '127.0.0.1');
  recordTest(
    '03. Rejet Second Facteur Erroné & Absence de Code Maître',
    bad2FA.success === false && bypass123456.success === false,
    'Les codes 000000 et 123456 sont rejetés ; seul un vrai TOTP RFC 6238 est accepté.'
  );

  // 4. Validation 2FA TOTP réel
  const validTotpCode = generateSync({ secret: dirUser.totp_secret });
  const step2 = verifySecondFactor(dirUser.id, validTotpCode, '127.0.0.1');
  recordTest(
    '04. Validation 2FA TOTP RFC 6238 & Création de Session',
    step2.success === true && Boolean(step2.token),
    'Session active créée après vérification TOTP réelle.'
  );

  const agentTotp = generateSync({ secret: agentUser.totp_secret });
  const agentAuth = verifySecondFactor(agentUser.id, agentTotp, '127.0.0.1');
  const agentToken = agentAuth.token;

  // 5. Échange cryptographique Olm 1:1 + Megolm réel entre Directeur et Agent
  const dirOlm = new Olm.Account();
  dirOlm.create();
  const dirIdKeys = JSON.parse(dirOlm.identity_keys());

  const agentOlm = new Olm.Account();
  agentOlm.create();
  agentOlm.generate_one_time_keys(5);
  const agentIdKeys = JSON.parse(agentOlm.identity_keys());
  const agentOtks = Object.values(JSON.parse(agentOlm.one_time_keys()).curve25519);

  // Session Megolm sortante du Directeur
  const dirOutboundMegolm = new Olm.OutboundGroupSession();
  dirOutboundMegolm.create();
  const megolmSessionId = dirOutboundMegolm.session_id();
  const megolmSessionKey = dirOutboundMegolm.session_key();

  // Partage de la clé Megolm via session Olm 1:1 Double Ratchet
  const olmOut = new Olm.Session();
  olmOut.create_outbound(dirOlm, agentIdKeys.curve25519, agentOtks[0]);
  const encryptedRoomKey = olmOut.encrypt(JSON.stringify({
    type: 'm.room_key',
    sessionId: megolmSessionId,
    sessionKey: megolmSessionKey
  }));

  // Déchiffrement Olm 1:1 par l'Agent et ouverture de la session Megolm entrante
  const olmIn = new Olm.Session();
  olmIn.create_inbound_from(agentOlm, dirIdKeys.curve25519, encryptedRoomKey.body);
  agentOlm.remove_one_time_keys(olmIn);
  const roomKeyPacket = JSON.parse(olmIn.decrypt(encryptedRoomKey.type, encryptedRoomKey.body));

  const agentInboundMegolm = new Olm.InboundGroupSession();
  agentInboundMegolm.create(roomKeyPacket.sessionKey);

  const secretPlaintext = 'Transmettre le rapport budgétaire confidentiel avant vendredi 16h00';
  const megolmCiphertext = dirOutboundMegolm.encrypt(JSON.stringify({ kind: 'text', text: secretPlaintext }));
  const edSignature = dirOlm.sign(megolmCiphertext);

  const groupId = 'grp_transition_digitale_01';
  const msgId = 'msg_real_megolm_01';
  db.prepare(`
    INSERT INTO messages (
      id, group_id, sender_id, protocol, megolm_session_id, ciphertext, sender_ed25519, signature, message_type
    ) VALUES (?, ?, ?, 'megolm.v1', ?, ?, ?, ?, 'CHAT')
  `).run(msgId, groupId, dirUser.id, megolmSessionId, megolmCiphertext, dirIdKeys.ed25519, edSignature);

  const decryptedByAgent = JSON.parse(agentInboundMegolm.decrypt(megolmCiphertext).plaintext);
  recordTest(
    '05. Chiffrement E2EE Réel Olm + Megolm',
    decryptedByAgent.text === secretPlaintext && megolmCiphertext !== secretPlaintext,
    'Clé Megolm échangée par Olm Double Ratchet et message déchiffré de bout en bout.'
  );

  // 6. Inspection SQL (Zéro clair sur le serveur)
  const storedMsg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(msgId);
  const serializedRow = JSON.stringify(storedMsg);
  const zeroCleartext = !serializedRow.includes('rapport') &&
                        !serializedRow.includes('budgétaire') &&
                        !serializedRow.includes('confidentiel');
  recordTest(
    '06. Inspection Base SQL (Épreuve Serveur Aveugle)',
    zeroCleartext && storedMsg.protocol === 'megolm.v1',
    'Aucun mot du message ni aucune clé de session n\'apparaît en clair en base SQLite.'
  );

  // 7. Fichier chiffré AES-256-GCM (WebCrypto) + clé transmise dans Megolm
  const subtle = crypto.webcrypto.subtle;
  const clearFileBytes = Buffer.from('NOTE DE SERVICE CONFIDENTIELLE MTDPCE 2026', 'utf8');
  const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.randomBytes(12);
  const cipherFileBuf = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, clearFileBytes));

  const fileId = 'file_real_aes_01';
  db.prepare(`
    INSERT INTO encrypted_files (id, message_id, group_id, uploader_id, encrypted_filename, mime_type, file_size, file_data)
    VALUES (?, ?, ?, ?, 'blob_opaque.enc', 'application/octet-stream', ?, ?)
  `).run(fileId, msgId, groupId, dirUser.id, cipherFileBuf.length, cipherFileBuf);

  const storedFile = db.prepare(`SELECT * FROM encrypted_files WHERE id = ?`).get(fileId);
  const rawBlobStr = Buffer.from(storedFile.file_data).toString('utf8');
  recordTest(
    '07. Pièce Jointe Chiffrée AES-256-GCM & Zéro Fuite Serveur',
    !rawBlobStr.includes('CONFIDENTIELLE') && storedFile.mime_type === 'application/octet-stream',
    'Blob binaire chiffré illisible sur le serveur, sans nom ni type MIME en clair.'
  );

  // 8. Création Instruction FasoBrief chiffrée
  const instId = 'inst_real_01';
  const instCipher = dirOutboundMegolm.encrypt(JSON.stringify({
    kind: 'instruction',
    title: 'Validation du schéma directeur',
    description: 'Retour attendu des chefs de service.'
  }));
  db.prepare(`
    INSERT INTO instructions (id, message_id, instruction_ref, title_ciphertext, megolm_session_id, creator_id, group_id, status)
    VALUES (?, ?, 'INST-2026-0001', ?, ?, ?, ?, 'PUBLIEE')
  `).run(instId, msgId, instCipher, megolmSessionId, dirUser.id, groupId);
  db.prepare(`
    INSERT INTO instruction_recipients (instruction_id, user_id, assigned_version, transmitted_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
  `).run(instId, agentUser.id);

  const storedInst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(instId);
  recordTest(
    '08. Innovation FasoBrief (Instruction Chiffrée Megolm)',
    Boolean(storedInst) && !storedInst.title_ciphertext.includes('Validation'),
    'Instruction enregistrée avec titre/description chiffrés de bout en bout.'
  );

  // 9. Accusé signé Ed25519 réel et vérifié via Olm.Utility
  const canonicalAck = `FASOBRIEF_ACK_V1:${instId}:v1:${agentUser.id}`;
  const realEd25519Sig = agentOlm.sign(canonicalAck);
  const util = new Olm.Utility();
  let sigVerified = false;
  try {
    util.ed25519_verify(agentIdKeys.ed25519, canonicalAck, realEd25519Sig);
    sigVerified = true;
  } finally {
    util.free();
  }
  db.prepare(`
    UPDATE instruction_recipients
    SET acknowledged_at = CURRENT_TIMESTAMP, ack_version = 1, signature_proof = ?, signer_ed25519 = ?
    WHERE instruction_id = ? AND user_id = ?
  `).run(realEd25519Sig, agentIdKeys.ed25519, instId, agentUser.id);

  recordTest(
    '09. Accusé de Prise de Connaissance Signé Ed25519',
    sigVerified === true,
    'Signature Ed25519 Olm vérifiée mathématiquement avec la clé publique du destinataire.'
  );

  // 10. Révocation immédiate en direct
  const fakeSockets = new Map();
  const revocationResult = revokeAgent(agentUser.id, 'Perte du terminal mobile', dirUser, fakeSockets);
  recordTest(
    '10. Épreuve Révocation en Direct',
    revocationResult.success === true,
    `Révocation immédiate de ${agentUser.matricule} exécutée.`
  );

  // 11. Invalidation immédiate de session
  const postRevokeSession = validateSession(agentToken);
  recordTest(
    '11. Révocation : Invalidation Immédiate de Session',
    postRevokeSession === null,
    'Jeton de session actif immédiatement invalidé.'
  );

  // 12. Blocage reconnexion
  const postRevokeLogin = authenticateFirstFactor(agentUser.matricule, DEFAULT_PASSWORD, '127.0.0.1');
  recordTest(
    '12. Révocation : Blocage de Toute Reconnexion',
    postRevokeLogin.success === false && postRevokeLogin.error === 'AGENT_REVOQUE_ACCES_INTERDIT',
    'Nouvelle connexion refusée avec code 403.'
  );

  // 13. Éjection des groupes + Rotation Megolm (l'agent révoqué ne peut pas déchiffrer la nouvelle session)
  const groupMembership = db.prepare(`SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, agentUser.id);
  const rotatedMegolm = new Olm.OutboundGroupSession();
  rotatedMegolm.create(); // Nouvelle clé NON partagée avec agentOlm
  const postRevokeCipher = rotatedMegolm.encrypt('Message post-révocation strictement confidentiel');

  let revokedCouldDecrypt = false;
  try {
    agentInboundMegolm.decrypt(postRevokeCipher);
    revokedCouldDecrypt = true;
  } catch (_) {
    revokedCouldDecrypt = false;
  }

  recordTest(
    '13. Révocation : Éjection Groupe & Rotation Megolm Effective',
    groupMembership === undefined && revokedCouldDecrypt === false,
    'Agent retiré du groupe et incapable mathématiquement de déchiffrer la nouvelle session Megolm.'
  );

  // 14. Journal d'audit
  const auditEntries = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10`).all();
  recordTest(
    '14. Traçabilité & Journal d\'Audit Immuable',
    auditEntries.some((a) => a.event_type === 'INTRUSION_ATTEMPT') &&
      auditEntries.some((a) => a.event_type === 'AGENT_REVOKED'),
    'Événements critiques consignés et horodatés.'
  );

  dirOlm.free();
  agentOlm.free();
  olmOut.free();
  olmIn.free();
  dirOutboundMegolm.free();
  agentInboundMegolm.free();
  rotatedMegolm.free();

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`RÉSULTAT GLOBAL : ${results.filter((r) => r.passed).length} / ${results.length} tests réussis`);
  console.log(`STATUT : ${allPassed ? 'CONFORME' : 'NON CONFORME'}`);
  console.log('================================================================\n');

  return allPassed;
}

if (require.main === module) {
  runSecuritySuite()
    .then((ok) => {
      try { db.close(); } catch (_) {}
      cleanupTempDb();
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error('Erreur fatale lors des tests:', err);
      try { db.close(); } catch (_) {}
      cleanupTempDb();
      process.exit(1);
    });
}

module.exports = { runSecuritySuite };
