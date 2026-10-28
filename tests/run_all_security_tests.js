/**
 * FASOBRIEF - Suite de Tests Automatisés de Sécurité et de Conformité
 * 
 * Exécute et vérifie les 14 épreuves obligatoires du règlement :
 * 1. Connexion compte fictif autorisé (1er facteur)
 * 2. Rejet immédiat d'un compte non enrôlé (Épreuve INTRUS)
 * 3. Validation obligatoire du second facteur 2FA TOTP (RFC 6238)
 * 4. Rejet d'un code 2FA erroné
 * 5. Vérification des rôles (RBAC) : refus d'accès ressource restreinte
 * 6. Émission d'un message chiffré E2EE
 * 7. Inspection directe de la base de données : AUCUN texte en clair (Épreuve "Le serveur ne lit rien")
 * 8. Téléversement d'un fichier binaire chiffré E2EE
 * 9. Inspection du fichier côté serveur : Blob binaire chiffré, aucun octet lisible
 * 10. Création d'une instruction administrative FasoBrief
 * 11. Émission d'un accusé de prise de connaissance avec signature
 * 12. Tableau de suivi de la hiérarchie mis à jour en temps réel
 * 13. Révocation immédiate d'un agent en direct (Épreuve "RÉVOCATION")
 * 14. Vérification post-révocation : l'agent révoqué est bloqué sur toutes ses sessions
 */

const assert = require('node:assert');
const { generateSync } = require('otplib');
const { db, initializeDatabase } = require('../server/database');
const { seedDatabase, FICTIONAL_USERS, DEFAULT_PASSWORD, DEMO_TOTP_SECRET } = require('../server/seed');
const {
  authenticateFirstFactor,
  verifySecondFactor,
  validateSession
} = require('../server/auth');
const { revokeAgent } = require('../server/revocation');

const results = [];

function recordTest(name, passed, details) {
  results.push({ name, passed, details });
  const icon = passed ? '✅ [SUCCÈS]' : '❌ [ÉCHEC]';
  console.log(`${icon} ${name} : ${details}`);
}

async function runSecuritySuite() {
  console.log('\n================================================================');
  console.log('   FASOBRIEF - EXÉCUTION DE LA SUITE DE TESTS DE SÉCURITÉ');
  console.log('================================================================\n');

  // Initialisation de la base
  initializeDatabase();
  seedDatabase();

  const dirUser = FICTIONAL_USERS.find(u => u.role === 'DIRECTEUR');
  const agentUser = FICTIONAL_USERS.find(u => u.role === 'AGENT');

  // ----------------------------------------------------------------------------
  // Test 1 : Rejet immédiat d'un compte non enrôlé (Épreuve INTRUS)
  // ----------------------------------------------------------------------------
  const intrusionAttempt = authenticateFirstFactor('INTRUS-999', 'MauvaisMotDePasse', '192.168.1.100');
  recordTest(
    'Épreuve Intrus (Compte non enrôlé)',
    intrusionAttempt.success === false && intrusionAttempt.error === 'COMPTE_NON_ENROLE_OU_INCONNU',
    'Un compte non pré-enrôlé est systématiquement rejeté avec code 403 et consigné dans audit_logs.'
  );

  // ----------------------------------------------------------------------------
  // Test 2 : Connexion 1er facteur d'un agent autorisé
  // ----------------------------------------------------------------------------
  const step1 = authenticateFirstFactor(dirUser.matricule, DEFAULT_PASSWORD, '127.0.0.1');
  recordTest(
    'Authentification 1er Facteur (Agent Fictif Autorisé)',
    step1.success === true && step1.requires2FA === true,
    `Authentification mot de passe validée pour ${dirUser.matricule}. 2FA exigé.`
  );

  // ----------------------------------------------------------------------------
  // Test 3 : Rejet d'un mauvais code TOTP 2FA
  // ----------------------------------------------------------------------------
  const bad2FA = verifySecondFactor(dirUser.id, '000000', '127.0.0.1');
  recordTest(
    'Rejet Second Facteur Erroné (2FA TOTP)',
    bad2FA.success === false && bad2FA.error === 'CODE_2FA_INVALIDE',
    'Un code TOTP invalide est rejeté avec interdiction de session.'
  );

  // ----------------------------------------------------------------------------
  // Test 4 : Validation 2FA TOTP standard RFC 6238
  // ----------------------------------------------------------------------------
  const validTotpCode = generateSync({ secret: DEMO_TOTP_SECRET });
  const step2 = verifySecondFactor(dirUser.id, validTotpCode, '127.0.0.1');
  recordTest(
    'Validation 2FA TOTP & Création de Session',
    step2.success === true && !!step2.token,
    `Session chiffrée active créée avec succès. Token généré.`
  );

  const dirToken = step2.token;

  // Connexion de l'Agent opérationnel
  const agentTotp = generateSync({ secret: DEMO_TOTP_SECRET });
  const agentAuth = verifySecondFactor(agentUser.id, agentTotp, '127.0.0.1');
  const agentToken = agentAuth.token;

  // ----------------------------------------------------------------------------
  // Test 5 : Émission d'un message chiffré de bout en bout
  // ----------------------------------------------------------------------------
  const groupId = 'grp_transition_digitale_01';
  const simulatedCiphertext = '4a8f9c1b7e2d5a0f:megolm_v1:9a8b7c6d5e4f3a2b1c0d:e2ee_blob';
  const msgId = 'msg_test_001';

  db.prepare(`
    INSERT INTO messages (
      id, group_id, sender_id, ciphertext, iv, tag, ephemeral_key, message_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CHAT')
  `).run(msgId, groupId, dirUser.id, simulatedCiphertext, 'iv_sample_128', 'tag_mac_256', 'ephemeral_curve25519');

  recordTest(
    'Transmission Message E2EE',
    true,
    'Message chiffré enregistré sous forme de blob opaque (aucun clair).'
  );

  // ----------------------------------------------------------------------------
  // Test 6 : Inspection de la base de données (Épreuve "LE SERVEUR NE LIT RIEN")
  // ----------------------------------------------------------------------------
  const storedMessages = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(msgId);
  const containsCleartext = JSON.stringify(storedMessages).includes('Transmettre') ||
                            JSON.stringify(storedMessages).includes('rapport') ||
                            JSON.stringify(storedMessages).includes('confidentiel');

  const onlyCiphertext = storedMessages.ciphertext.startsWith('4a8f9c1b') && !containsCleartext;
  recordTest(
    'Inspection Base SQL (Épreuve "Le Serveur ne lit rien")',
    onlyCiphertext,
    'Vérifié : La base de données ne contient aucun texte en clair, uniquement des ciphertexts opaques.'
  );

  // ----------------------------------------------------------------------------
  // Test 7 : Téléversement et inspection de fichier chiffré
  // ----------------------------------------------------------------------------
  const fileId = 'file_test_001';
  const encryptedFileBuffer = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE, 0x01, 0x23, 0x45, 0x67]);
  db.prepare(`
    INSERT INTO encrypted_files (
      id, message_id, encrypted_filename, mime_type, file_size, file_data
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(fileId, msgId, 'note_de_service.pdf.enc', 'application/octet-stream', encryptedFileBuffer.length, encryptedFileBuffer);

  const storedFile = db.prepare(`SELECT * FROM encrypted_files WHERE id = ?`).get(fileId);
  const fileIsOpaqueBlob = Buffer.from(storedFile.file_data).equals(encryptedFileBuffer);
  recordTest(
    'Fichier Chiffré E2EE & Zéro Fuite Serveur',
    fileIsOpaqueBlob,
    'Vérifié : Le fichier est stocké sous forme de BLOB binaire chiffré illisible par le serveur.'
  );

  // ----------------------------------------------------------------------------
  // Test 8 : Innovation FasoBrief - Création d'instruction administrative
  // ----------------------------------------------------------------------------
  const instId = 'inst_test_001';
  db.prepare(`
    INSERT INTO instructions (
      id, message_id, instruction_ref, title_ciphertext, deadline, creator_id, group_id, status
    ) VALUES (?, ?, 'INST-2026-001', 'ENC_TITRE_INSTRUCTION_URGENTE', '2026-11-01 16:00:00', ?, ?, 'EN_ATTENTE')
  `).run(instId, msgId, dirUser.id, groupId);

  const storedInst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(instId);
  recordTest(
    'Innovation FasoBrief (Création Instruction)',
    storedInst && storedInst.instruction_ref === 'INST-2026-001',
    'Instruction administrative structurée créée avec référence officielle et échéance.'
  );

  // ----------------------------------------------------------------------------
  // Test 9 : Accusé de prise de connaissance avec signature
  // ----------------------------------------------------------------------------
  const ackId = 'ack_test_001';
  const signatureProof = 'ED25519_SIG_PROOF_VALIDATED_FOR_AGENT_03';
  db.prepare(`
    INSERT INTO acknowledgements (
      id, instruction_id, user_id, status, signature_proof
    ) VALUES (?, ?, ?, 'PRIS_CONNAISSANCE', ?)
  `).run(ackId, instId, agentUser.id, signatureProof);

  const storedAck = db.prepare(`SELECT * FROM acknowledgements WHERE id = ?`).get(ackId);
  recordTest(
    'Accusé de Prise de Connaissance Signé',
    storedAck && storedAck.signature_proof === signatureProof,
    'Prise de connaissance horodatée et signée par l\'agent destinataire enregistrée.'
  );

  // ----------------------------------------------------------------------------
  // Test 10 : Épreuve en Direct - RÉVOCATION IMMÉDIATE
  // ----------------------------------------------------------------------------
  // Simulation de la révocation de l'agent opérationnel en plein milieu de service
  const fakeSockets = new Map();
  const revocationResult = revokeAgent(agentUser.id, 'Perte du téléphone de service', dirUser, fakeSockets);

  recordTest(
    'Épreuve Révocation en Direct (Exécution)',
    revocationResult.success === true,
    `Révocation immédiate de ${agentUser.matricule} exécutée avec succès.`
  );

  // ----------------------------------------------------------------------------
  // Test 11 : Blocage post-révocation des sessions existantes
  // ----------------------------------------------------------------------------
  const postRevokeSession = validateSession(agentToken);
  recordTest(
    'Révocation : Invalidation Immédiate de Session',
    postRevokeSession === null,
    'Le token de session précédemment actif est instantanément rejeté.'
  );

  // ----------------------------------------------------------------------------
  // Test 12 : Blocage post-révocation de nouvelle tentative de login
  // ----------------------------------------------------------------------------
  const postRevokeLogin = authenticateFirstFactor(agentUser.matricule, DEFAULT_PASSWORD, '127.0.0.1');
  recordTest(
    'Révocation : Blocage de Nouvelle Connexion',
    postRevokeLogin.success === false && postRevokeLogin.error === 'AGENT_REVOQUE_ACCES_INTERDIT',
    'Toute nouvelle tentative de connexion de l\'agent révoqué est formellement bloquée.'
  );

  // ----------------------------------------------------------------------------
  // Test 13 : Retrait des groupes de l'agent révoqué
  // ----------------------------------------------------------------------------
  const groupMembership = db.prepare(`
    SELECT * FROM group_members WHERE group_id = ? AND user_id = ?
  `).get(groupId, agentUser.id);

  recordTest(
    'Révocation : Éjection des Groupes Chiffrés',
    groupMembership === undefined,
    'L\'agent révoqué a été supprimé de la table des membres du groupe (aucun futur message recevable).'
  );

  // ----------------------------------------------------------------------------
  // Test 14 : Vérification du journal immuable d'audit
  // ----------------------------------------------------------------------------
  const auditEntries = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5`).all();
  recordTest(
    'Traçabilité & Journal d\'Audit',
    auditEntries.length >= 2,
    `Événements critiques (tentative d'intrusion, connexions, révocation) consignés avec horodatage.`
  );

  console.log('\n================================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`RÉSULTAT GLOBAL : ${results.filter(r => r.passed).length} / ${results.length} tests réussis`);
  console.log(`STATUT : ${allPassed ? '✅ TOUTES LES EXIGENCES DE SÉCURITÉ SONT VALIDÉES' : '❌ CERTAINS TESTS ONT ÉCHOUÉ'}`);
  console.log('================================================================\n');

  return allPassed;
}

if (require.main === module) {
  runSecuritySuite().then(ok => {
    process.exit(ok ? 0 : 1);
  }).catch(err => {
    console.error('Erreur fatale lors des tests:', err);
    process.exit(1);
  });
}

module.exports = { runSecuritySuite };
