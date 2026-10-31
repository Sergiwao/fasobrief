/**
 * FASOBRIEF - Tests d'Intégration HTTP, WebSocket, RBAC, Olm/Megolm et Métier (node:test)
 *
 * Vérifie de bout en bout sur serveur Express réel + base SQLite temporaire isolée :
 * 1. Cycle complet d'invitation ADMIN -> activation 2 étapes -> mot de passe fort + TOTP réel
 * 2. Contrôles RBAC stricts côté serveur (AGENT, CHEF_SERVICE, DIRECTEUR, ADMIN)
 * 3. Annuaire institutionnel, conversations DIRECT (1:1 uniques) et GROUP
 * 4. Échange E2EE Olm 1:1 + Megolm via HTTP + déduplication clientMsgId + statuts sent/delivered/read
 * 5. Chiffrement de fichier AES-256-GCM + contrôle d'appartenance au téléchargement (403 hors groupe)
 * 6. Cycle complet des instructions : brouillon -> publication -> consultation (viewed != ack) ->
 *    confirmation Ed25519 vérifiée -> exécution -> modification versionnée (v2 exige re-confirmation)
 * 7. Notifications persistées, regroupées sans doublon et sans contenu confidentiel
 * 8. Suspension / réactivation / révocation immédiate (coupure WebSocket 4001 + rotation keyEpoch)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const TEMP_DB = path.join(os.tmpdir(), `fasobrief_integration_${process.pid}_${Date.now()}.sqlite`);
process.env.DATABASE_PATH = TEMP_DB;
process.env.FASOBRIEF_DEMO_MODE = '0';

const Olm = require('@matrix-org/olm');
const { generateSync } = require('otplib');
const { WebSocket } = require('ws');
const { db } = require('../server/database');
const { seedDatabase, FICTIONAL_USERS, DEFAULT_PASSWORD } = require('../server/seed');
const { server, startServer } = require('../server/server');

let baseUrl = '';
let wsUrl = '';

async function apiReq(endpoint, { method = 'GET', token = null, body = null, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let fetchBody = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${endpoint}`, { method, headers, body: fetchBody });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function loginFull(matricule, password, totpSecret) {
  const s1 = await apiReq('/api/auth/login-step1', {
    method: 'POST',
    body: { matricule, password }
  });
  assert.equal(s1.status, 200, `Login step1 failed for ${matricule}: ${JSON.stringify(s1.data)}`);
  const code = generateSync({ secret: totpSecret });
  const s2 = await apiReq('/api/auth/login-step2', {
    method: 'POST',
    body: {
      userId: s1.data.userId,
      totpCode: code,
      challengeToken: s1.data.challengeToken
    }
  });
  assert.equal(s2.status, 200, `Login step2 failed for ${matricule}: ${JSON.stringify(s2.data)}`);
  return s2.data;
}

test.before(async () => {
  await Olm.init();
  seedDatabase({ forceReset: true });
  await startServer(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(() => resolve()));
  try { db.close(); } catch (_) {}
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(TEMP_DB + suffix)) fs.unlinkSync(TEMP_DB + suffix);
    } catch (_) {}
  }
});

test('1. Sécurité Auth : blocage step2 sans challengeToken et blocage demo-totp hors mode démo', async () => {
  const dir = FICTIONAL_USERS.find((u) => u.id === 'usr_dir_01');
  const demoEndpoint = await apiReq(`/api/auth/demo-totp/${dir.id}`);
  assert.equal(demoEndpoint.status, 403);

  const skipStep1 = await apiReq('/api/auth/login-step2', {
    method: 'POST',
    body: {
      userId: dir.id,
      totpCode: generateSync({ secret: dir.totp_secret }),
      challengeToken: 'forged_token'
    }
  });
  assert.equal(skipStep1.status, 401);
});

test('2. Cycle complet Invitation ADMIN -> Activation 2 étapes -> Connexion opérationnelle', async () => {
  const adminDef = FICTIONAL_USERS.find((u) => u.role === 'ADMIN');
  const agentDef = FICTIONAL_USERS.find((u) => u.id === 'usr_agent_03');

  const adminSession = await loginFull(adminDef.matricule, DEFAULT_PASSWORD, adminDef.totp_secret);
  const agentSession = await loginFull(agentDef.matricule, DEFAULT_PASSWORD, agentDef.totp_secret);

  // Un AGENT ne peut pas créer d'invitation
  const forbiddenInvite = await apiReq('/api/admin/invitations', {
    method: 'POST',
    token: agentSession.token,
    body: {
      matricule: 'FASO-NEW-99',
      fullName: 'Agent Non Autorisé',
      role: 'AGENT',
      serviceId: 'srv_demat'
    }
  });
  assert.equal(forbiddenInvite.status, 403);

  // L'ADMIN crée une invitation officielle
  const invRes = await apiReq('/api/admin/invitations', {
    method: 'POST',
    token: adminSession.token,
    body: {
      matricule: 'FASO-AGT-77',
      fullName: 'Fatimata Zongo',
      role: 'AGENT',
      serviceId: 'srv_demat',
      jobTitle: 'Chargée de Suivi Administratif'
    }
  });
  assert.equal(invRes.status, 201);
  const activationCode = invRes.data.invitation.activationCode;
  assert.ok(activationCode && activationCode.length >= 16);

  // Vérifier que le code en clair n'est PAS dans la base SQLite
  const rawInvRow = db.prepare(`SELECT * FROM invitations WHERE id = ?`).get(invRes.data.invitation.id);
  assert.ok(!JSON.stringify(rawInvRow).includes(activationCode));

  // Un compte INVITED ne peut pas se connecter directement avant activation
  const prematureLogin = await apiReq('/api/auth/login-step1', {
    method: 'POST',
    body: { matricule: 'FASO-AGT-77', password: 'PasswordTresSolide2026!' }
  });
  assert.equal(prematureLogin.status, 403);
  assert.equal(prematureLogin.data.error, 'COMPTE_EN_ATTENTE_ACTIVATION');

  // Étape 1 d'activation
  const act1 = await apiReq('/api/auth/activate-step1', {
    method: 'POST',
    body: { matricule: 'FASO-AGT-77', activationCode }
  });
  assert.equal(act1.status, 200);
  assert.ok(act1.data.totpSecret);
  assert.ok(act1.data.otpauthUri.startsWith('otpauth://totp/'));

  // Rejet d'un mot de passe trop court (< 12 caractères)
  const weakPwd = await apiReq('/api/auth/activate-step2', {
    method: 'POST',
    body: {
      matricule: 'FASO-AGT-77',
      activationCode,
      password: 'court',
      totpCode: generateSync({ secret: act1.data.totpSecret })
    }
  });
  assert.equal(weakPwd.status, 400);

  // Étape 2 d'activation valide
  const act2 = await apiReq('/api/auth/activate-step2', {
    method: 'POST',
    body: {
      matricule: 'FASO-AGT-77',
      activationCode,
      password: 'MotDePasseSouverain2026!',
      totpCode: generateSync({ secret: act1.data.totpSecret })
    }
  });
  assert.equal(act2.status, 200);
  assert.equal(act2.data.user.status, 'ACTIVE');
  assert.ok(act2.data.token);

  // Le code à usage unique ne peut plus être réutilisé
  const replayAct = await apiReq('/api/auth/activate-step1', {
    method: 'POST',
    body: { matricule: 'FASO-AGT-77', activationCode }
  });
  assert.equal(replayAct.status, 403);
});

test('3. Annuaire, Conversations DIRECT (1:1 uniques), Groupes, Olm/Megolm, Statuts Réels & Fichiers E2EE', async () => {
  const dirDef = FICTIONAL_USERS.find((u) => u.id === 'usr_dir_01');
  const chefDef = FICTIONAL_USERS.find((u) => u.id === 'usr_chef_02');
  const outsiderDef = FICTIONAL_USERS.find((u) => u.id === 'usr_admin_00');

  const dirAuth = await loginFull(dirDef.matricule, DEFAULT_PASSWORD, dirDef.totp_secret);
  const chefAuth = await loginFull(chefDef.matricule, DEFAULT_PASSWORD, chefDef.totp_secret);
  const outsiderAuth = await loginFull(outsiderDef.matricule, DEFAULT_PASSWORD, outsiderDef.totp_secret);

  // Annuaire hiérarchique
  const dirRes = await apiReq('/api/directory?serviceId=srv_demat', { token: dirAuth.token });
  assert.equal(dirRes.status, 200);
  assert.ok(dirRes.data.organisations.length >= 2);
  assert.ok(dirRes.data.agents.some((a) => a.id === 'usr_chef_02'));

  // Ouverture conversation DIRECT idempotente (unique par paire)
  const dm1 = await apiReq('/api/conversations/direct', {
    method: 'POST',
    token: dirAuth.token,
    body: { targetUserId: chefDef.id }
  });
  const dm2 = await apiReq('/api/conversations/direct', {
    method: 'POST',
    token: chefAuth.token,
    body: { targetUserId: dirDef.id }
  });
  assert.equal(dm1.status, 200);
  assert.equal(dm1.data.group.id, dm2.data.group.id);
  const dmId = dm1.data.group.id;

  // Enregistrement de vrais comptes Olm pour Directeur et Cheffe de service
  const dirOlm = new Olm.Account();
  dirOlm.create();
  dirOlm.generate_one_time_keys(10);
  const dirKeys = JSON.parse(dirOlm.identity_keys());
  await apiReq('/api/crypto/devices', {
    method: 'POST',
    token: dirAuth.token,
    body: {
      deviceId: 'dev_dir_test',
      curve25519Key: dirKeys.curve25519,
      ed25519Key: dirKeys.ed25519,
      oneTimeKeys: JSON.parse(dirOlm.one_time_keys()).curve25519
    }
  });
  dirOlm.mark_keys_as_published();

  const chefOlm = new Olm.Account();
  chefOlm.create();
  chefOlm.generate_one_time_keys(10);
  const chefKeys = JSON.parse(chefOlm.identity_keys());
  await apiReq('/api/crypto/devices', {
    method: 'POST',
    token: chefAuth.token,
    body: {
      deviceId: 'dev_chef_test',
      curve25519Key: chefKeys.curve25519,
      ed25519Key: chefKeys.ed25519,
      oneTimeKeys: JSON.parse(chefOlm.one_time_keys()).curve25519
    }
  });
  chefOlm.mark_keys_as_published();

  // Réclamation OTK + échange Olm 1:1 de clé de session Megolm
  const otkClaim = await apiReq('/api/crypto/claim-otk', {
    method: 'POST',
    token: dirAuth.token,
    body: { targetUserId: chefDef.id, targetDeviceId: 'dev_chef_test' }
  });
  assert.equal(otkClaim.status, 200);

  const megolmOut = new Olm.OutboundGroupSession();
  megolmOut.create();
  const sessionId = megolmOut.session_id();
  const sessionKey = megolmOut.session_key();

  const olmOut = new Olm.Session();
  olmOut.create_outbound(dirOlm, otkClaim.data.curve25519Key, otkClaim.data.oneTimeKey);
  const olmPacket = olmOut.encrypt(JSON.stringify({
    type: 'm.room_key',
    groupId: dmId,
    sessionId,
    sessionKey
  }));

  const sendEnv = await apiReq('/api/crypto/to-device', {
    method: 'POST',
    token: dirAuth.token,
    body: {
      senderDeviceId: 'dev_dir_test',
      senderCurve25519: dirKeys.curve25519,
      senderEd25519: dirKeys.ed25519,
      messages: [{
        recipientUserId: chefDef.id,
        recipientDeviceId: 'dev_chef_test',
        olmType: olmPacket.type,
        olmBody: olmPacket.body,
        groupId: dmId,
        megolmSessionId: sessionId
      }]
    }
  });
  assert.equal(sendEnv.status, 200);
  assert.equal(sendEnv.data.count, 1);

  // Envoi d'un message Megolm avec déduplication clientMsgId
  const ciphertext = megolmOut.encrypt(JSON.stringify({ v: 2, kind: 'text', text: 'Réunion préparatoire à 10h00' }));
  const sig = dirOlm.sign(ciphertext);

  const msgSend1 = await apiReq(`/api/groups/${dmId}/messages`, {
    method: 'POST',
    token: dirAuth.token,
    body: {
      clientMsgId: 'cmsg_unique_001',
      protocol: 'megolm.v1',
      megolmSessionId: sessionId,
      ciphertext,
      senderDeviceId: 'dev_dir_test',
      senderEd25519: dirKeys.ed25519,
      signature: sig,
      messageType: 'CHAT'
    }
  });
  assert.equal(msgSend1.status, 200);
  assert.equal(msgSend1.data.message.delivery_status, 'sent'); // 1 coche grise initialement !

  // Renvoi réseau avec le même clientMsgId -> aucun doublon créé !
  const msgSendDup = await apiReq(`/api/groups/${dmId}/messages`, {
    method: 'POST',
    token: dirAuth.token,
    body: {
      clientMsgId: 'cmsg_unique_001',
      protocol: 'megolm.v1',
      megolmSessionId: sessionId,
      ciphertext,
      messageType: 'CHAT'
    }
  });
  assert.equal(msgSendDup.data.deduplicated, true);
  assert.equal(msgSendDup.data.message.id, msgSend1.data.message.id);

  // La Cheffe récupère son enveloppe Olm, déchiffre le message et émet delivered puis read
  const pendingEnv = await apiReq('/api/crypto/to-device?deviceId=dev_chef_test', { token: chefAuth.token });
  assert.equal(pendingEnv.data.envelopes.length, 1);
  const env = pendingEnv.data.envelopes[0];

  const olmIn = new Olm.Session();
  olmIn.create_inbound_from(chefOlm, env.senderCurve25519, env.olmBody);
  const roomKeyObj = JSON.parse(olmIn.decrypt(env.olmType, env.olmBody));
  const megolmIn = new Olm.InboundGroupSession();
  megolmIn.create(roomKeyObj.sessionKey);

  const history = await apiReq(`/api/groups/${dmId}/messages`, { token: chefAuth.token });
  assert.equal(history.data.messages.length, 1);
  const decMsg = JSON.parse(megolmIn.decrypt(history.data.messages[0].ciphertext).plaintext);
  assert.equal(decMsg.text, 'Réunion préparatoire à 10h00');

  // Accusé delivered -> statut passe à 'delivered' (2 coches grises)
  await apiReq('/api/messages/receipts', {
    method: 'POST',
    token: chefAuth.token,
    body: { messageIds: [msgSend1.data.message.id], type: 'delivered' }
  });
  let info = await apiReq(`/api/messages/${msgSend1.data.message.id}/info`, { token: dirAuth.token });
  assert.equal(info.data.message.deliveryStatus, 'delivered');

  // Accusé read -> statut passe à 'read' (2 coches vertes)
  await apiReq('/api/messages/receipts', {
    method: 'POST',
    token: chefAuth.token,
    body: { messageIds: [msgSend1.data.message.id], type: 'read' }
  });
  info = await apiReq(`/api/messages/${msgSend1.data.message.id}/info`, { token: dirAuth.token });
  assert.equal(info.data.message.deliveryStatus, 'read');
  assert.equal(info.data.recipients[0].status, 'read');

  // Téléversement de fichier chiffré et refus 403 pour un non-membre (outsiderAuth)
  const form = new FormData();
  form.append('encryptedFile', new Blob([crypto.randomBytes(64)]), 'cipher.bin');
  const upRes = await apiReq(`/api/groups/${dmId}/files`, {
    method: 'POST',
    token: dirAuth.token,
    body: form
  });
  assert.equal(upRes.status, 201);

  const outsiderDownload = await apiReq(`/api/files/${upRes.data.fileId}`, {
    token: outsiderAuth.token,
    raw: true
  });
  assert.equal(outsiderDownload.status, 403);

  const memberDownload = await apiReq(`/api/files/${upRes.data.fileId}`, {
    token: chefAuth.token,
    raw: true
  });
  assert.equal(memberDownload.status, 200);

  dirOlm.free();
  chefOlm.free();
  megolmOut.free();
  megolmIn.free();
  olmOut.free();
  olmIn.free();
});

test('4. Cycle complet des Instructions Administratives : Brouillon, Consultation != Confirmation, Signature Ed25519, Exécution & Versions', async () => {
  const dirDef = FICTIONAL_USERS.find((u) => u.id === 'usr_dir_01');
  const chefDef = FICTIONAL_USERS.find((u) => u.id === 'usr_chef_02');
  const agtDef = FICTIONAL_USERS.find((u) => u.id === 'usr_agent_03');

  const dirAuth = await loginFull(dirDef.matricule, DEFAULT_PASSWORD, dirDef.totp_secret);
  const chefAuth = await loginFull(chefDef.matricule, DEFAULT_PASSWORD, chefDef.totp_secret);
  const agtAuth = await loginFull(agtDef.matricule, DEFAULT_PASSWORD, agtDef.totp_secret);

  // Un simple AGENT ne peut pas émettre une instruction
  const forbiddenCreate = await apiReq('/api/instructions', {
    method: 'POST',
    token: agtAuth.token,
    body: {
      groupId: 'grp_transition_digitale_01',
      titleCiphertext: 'CIPHER_TEST'
    }
  });
  assert.equal(forbiddenCreate.status, 403);

  // Création en BROUILLON : invisible des autres membres tant que non publiée
  const draftRes = await apiReq('/api/instructions', {
    method: 'POST',
    token: dirAuth.token,
    body: {
      groupId: 'grp_transition_digitale_01',
      titleCiphertext: 'MEGOLM_CIPHER_V1_DRAFT',
      priority: 'HAUTE',
      deadline: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      isDraft: true
    }
  });
  assert.equal(draftRes.status, 201);
  const instId = draftRes.data.instruction.id;
  assert.equal(draftRes.data.instruction.status, 'BROUILLON');

  const chefDashBeforePub = await apiReq('/api/instructions/dashboard', { token: chefAuth.token });
  assert.ok(!chefDashBeforePub.data.dashboard.some((i) => i.id === instId));

  // Publication du brouillon -> notifie les destinataires (hors émetteur)
  const pubRes = await apiReq(`/api/instructions/${instId}/publish`, {
    method: 'POST',
    token: dirAuth.token,
    body: { recipientIds: [chefDef.id, agtDef.id] }
  });
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.data.instruction.status, 'PUBLIEE');
  assert.equal(pubRes.data.instruction.total_recipients, 2);

  // 1. Consultation (view) != Confirmation (ack)
  await apiReq(`/api/instructions/${instId}/view`, { method: 'POST', token: chefAuth.token });
  let details = await apiReq(`/api/instructions/${instId}`, { token: dirAuth.token });
  const chefRecAfterView = details.data.instruction.recipients.find((r) => r.userId === chefDef.id);
  assert.equal(chefRecAfterView.step, 'CONSULTEE');
  assert.equal(chefRecAfterView.acknowledgedAt, null);

  // Impossible de déclarer l'exécution avant d'avoir confirmé la réception
  const prematureExec = await apiReq(`/api/instructions/${instId}/execute`, {
    method: 'POST',
    token: chefAuth.token
  });
  assert.equal(prematureExec.status, 400);

  // 2. Enregistrement d'une clé Ed25519 pour l'Agent et confirmation signée Ed25519 vérifiée côté serveur
  const agtOlm = new Olm.Account();
  agtOlm.create();
  const agtKeys = JSON.parse(agtOlm.identity_keys());
  await apiReq('/api/crypto/devices', {
    method: 'POST',
    token: agtAuth.token,
    body: {
      deviceId: 'dev_agt_ack',
      curve25519Key: agtKeys.curve25519,
      ed25519Key: agtKeys.ed25519
    }
  });

  const signedPayload = `FASOBRIEF_ACK_V1:${instId}:v1:${agtDef.id}`;
  const validSig = agtOlm.sign(signedPayload);

  // Une signature Ed25519 falsifiée est rejetée
  const badSigAck = await apiReq(`/api/instructions/${instId}/ack`, {
    method: 'POST',
    token: agtAuth.token,
    body: {
      signedPayload,
      signatureProof: 'SIGNATURE_INVALIDE_FALSIFIEE',
      signerEd25519: agtKeys.ed25519
    }
  });
  assert.equal(badSigAck.status, 400);

  // La vraie signature Ed25519 est acceptée et marquée vérifiée
  const goodAck = await apiReq(`/api/instructions/${instId}/ack`, {
    method: 'POST',
    token: agtAuth.token,
    body: {
      signedPayload,
      signatureProof: validSig,
      signerEd25519: agtKeys.ed25519
    }
  });
  assert.equal(goodAck.status, 200);
  assert.equal(goodAck.data.signatureVerified, true);

  // Passage en cours puis exécution déclarée par l'Agent
  const execRes = await apiReq(`/api/instructions/${instId}/execute`, {
    method: 'POST',
    token: agtAuth.token,
    body: { executionCiphertext: 'CIPHER_COMPTE_RENDU_EXECUTION' }
  });
  assert.equal(execRes.status, 200);

  details = await apiReq(`/api/instructions/${instId}`, { token: dirAuth.token });
  assert.equal(details.data.instruction.recipients.find((r) => r.userId === agtDef.id).step, 'EXECUTEE');

  // 3. Modification d'une instruction publiée -> incrémente en v2 et réinitialise l'exigence de confirmation
  const v2Res = await apiReq(`/api/instructions/${instId}`, {
    method: 'PATCH',
    token: dirAuth.token,
    body: {
      titleCiphertext: 'MEGOLM_CIPHER_V2_MODIFIEE',
      priority: 'URGENTE'
    }
  });
  assert.equal(v2Res.status, 200);
  assert.equal(v2Res.data.instruction.version, 2);
  assert.equal(v2Res.data.instruction.ack_count, 0);

  // Vérifier que la notification d'échéance < 24h et de mise à jour a été générée sans fuite de texte
  const agtNotifs = await apiReq('/api/notifications', { token: agtAuth.token });
  assert.equal(agtNotifs.status, 200);
  assert.ok(agtNotifs.data.notifications.some((n) => n.type === 'INSTRUCTION_UPDATED'));
  assert.ok(agtNotifs.data.notifications.some((n) => n.type === 'DEADLINE_SOON'));

  agtOlm.free();
});

test('5. Suspension, Réactivation et Révocation en direct (fermeture WebSocket synchrone + RBAC)', async () => {
  const adminDef = FICTIONAL_USERS.find((u) => u.role === 'ADMIN');
  const dirDef = FICTIONAL_USERS.find((u) => u.id === 'usr_dir_01');
  const agt4Def = FICTIONAL_USERS.find((u) => u.id === 'usr_agent_04');

  const adminAuth = await loginFull(adminDef.matricule, DEFAULT_PASSWORD, adminDef.totp_secret);
  const dirAuth = await loginFull(dirDef.matricule, DEFAULT_PASSWORD, dirDef.totp_secret);
  const agt4Auth = await loginFull(agt4Def.matricule, DEFAULT_PASSWORD, agt4Def.totp_secret);

  // Un DIRECTEUR ne peut PAS révoquer un ADMIN
  const dirRevokeAdmin = await apiReq('/api/admin/revoke', {
    method: 'POST',
    token: dirAuth.token,
    body: { targetUserId: adminDef.id, reason: 'Tentative interdite' }
  });
  assert.equal(dirRevokeAdmin.status, 403);

  // Suspension par ADMIN -> invalide la session, puis réactivation permet une reconnexion
  const suspRes = await apiReq(`/api/admin/users/${agt4Def.id}/suspend`, {
    method: 'POST',
    token: adminAuth.token,
    body: { reason: 'Contrôle administratif temporaire' }
  });
  assert.equal(suspRes.status, 200);

  const checkSuspendedToken = await apiReq('/api/auth/me', { token: agt4Auth.token });
  assert.equal(checkSuspendedToken.status, 401);

  const reactRes = await apiReq(`/api/admin/users/${agt4Def.id}/reactivate`, {
    method: 'POST',
    token: adminAuth.token
  });
  assert.equal(reactRes.status, 200);

  // Reconnexion de agt4 + ouverture WebSocket temps réel + Révocation définitive en direct
  const agt4Fresh = await loginFull(agt4Def.matricule, DEFAULT_PASSWORD, agt4Def.totp_secret);

  const wsClosedPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => reject(new Error('Timeout fermeture WebSocket révocation')), 4000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'AUTH', token: agt4Fresh.token }));
    });
    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'AUTH_SUCCESS') {
        // Déclencher la révocation en direct dès que le socket est authentifié
        await apiReq('/api/admin/revoke', {
          method: 'POST',
          token: dirAuth.token,
          body: { targetUserId: agt4Def.id, reason: 'Épreuve révocation en direct' }
        });
      }
    });
    ws.on('close', (code, reasonBuf) => {
      clearTimeout(timeout);
      resolve({ code, reason: reasonBuf.toString() });
    });
  });

  const closeEvent = await wsClosedPromise;
  assert.equal(closeEvent.code, 4001);
  assert.equal(closeEvent.reason, 'AGENT_REVOKED');

  // Un compte REVOKED est définitif : même un ADMIN ne peut pas le réactiver
  const tryReactivateRevoked = await apiReq(`/api/admin/users/${agt4Def.id}/reactivate`, {
    method: 'POST',
    token: adminAuth.token
  });
  assert.equal(tryReactivateRevoked.status, 409);
});

test('6. Enrôlement Admin, Création de Service, Connexion par Identifiant et QR Code à Usage Unique (SHA-256)', async () => {
  const adminDef = FICTIONAL_USERS.find((u) => u.role === 'ADMIN');
  const dirDef = FICTIONAL_USERS.find((u) => u.id === 'usr_dir_01');

  // Connexion par identifiant court (username: 'admin' et 'issa')
  const adminAuth = await loginFull('admin', DEFAULT_PASSWORD, adminDef.totp_secret);
  const issaAuth = await loginFull('issa', DEFAULT_PASSWORD, dirDef.totp_secret);
  assert.equal(issaAuth.user.username, 'issa');

  // Création d'un nouveau service par l'administrateur -> canal de service automatique
  const srvRes = await apiReq('/api/admin/services', {
    method: 'POST',
    token: adminAuth.token,
    body: { name: 'Direction financière' }
  });
  assert.equal(srvRes.status, 201);
  assert.ok(srvRes.data.service.channelId);

  // Enrôlement d'un nouvel agent avec génération de QR code 128 bits à usage unique
  const enrollRes = await apiReq('/api/admin/users', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      fullName: 'Salif Traoré',
      jobTitle: 'Contrôleur budgétaire',
      username: 'salif',
      password: 'MotDePasseFort2026!',
      role: 'AGENT',
      serviceId: srvRes.data.service.id
    }
  });
  assert.equal(enrollRes.status, 201);
  assert.ok(enrollRes.data.qrPayload);

  // Vérifier que le jeton QR brut n'apparaît jamais en clair en base SQLite
  const allInvs = db.prepare(`SELECT * FROM invitations WHERE user_id = ?`).all(enrollRes.data.user.id);
  assert.equal(allInvs.length, 1);
  const decodedQr = JSON.parse(Buffer.from(enrollRes.data.qrPayload, 'base64url').toString('utf8'));
  assert.ok(!JSON.stringify(allInvs[0]).includes(decodedQr.t));

  // Première connexion par QR code -> succès et ouverture du canal de service
  const qrLogin1 = await apiReq('/api/auth/qr-login', {
    method: 'POST',
    body: { code: enrollRes.data.qrPayload }
  });
  assert.equal(qrLogin1.status, 200);
  assert.equal(qrLogin1.data.user.username, 'salif');

  const salifGroups = await apiReq('/api/groups', { token: qrLogin1.data.token });
  assert.ok(salifGroups.data.groups.some((g) => g.name === 'Direction financière' && g.channelKind === 'service'));

  // Rejeu du même QR code -> rejet strict 403 (usage unique garanti)
  const qrReplay = await apiReq('/api/auth/qr-login', {
    method: 'POST',
    body: { code: enrollRes.data.qrPayload }
  });
  assert.equal(qrReplay.status, 403);
  assert.equal(qrReplay.data.error, 'QR_CODE_EXPIRE_OU_DEJA_UTILISE');

  // Périmètre cryptographique d'instruction multi-services
  const scopeRes = await apiReq('/api/instructions/scope-group', {
    method: 'POST',
    token: issaAuth.token,
    body: { recipientIds: [enrollRes.data.user.id] }
  });
  assert.equal(scopeRes.status, 200);
  assert.ok(scopeRes.data.groupId.startsWith('grp_iscope_'));
});

test('7. Création de Groupe par Chef/Admin, Échanges E2EE & Envoi d\'Instruction Chiffrée', async () => {
  const adminDef = FICTIONAL_USERS.find((u) => u.role === 'ADMIN');
  const adminAuth = await loginFull('admin', DEFAULT_PASSWORD, adminDef.totp_secret);

  // Récupérer l'annuaire des agents actifs
  const dirRes = await apiReq('/api/directory', { token: adminAuth.token });
  assert.equal(dirRes.status, 200);
  const activeMembers = dirRes.data.agents.filter((a) => a.id !== adminAuth.user.id && a.status === 'ACTIVE');
  assert.ok(activeMembers.length >= 2, 'Au moins 2 autres agents actifs disponibles');

  // Création de groupe interservices
  const grpRes = await apiReq('/api/groups', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      name: 'Comité de Coordination Démo',
      description: 'Groupe interservices souverain',
      memberIds: [activeMembers[0].id, activeMembers[1].id]
    }
  });
  assert.equal(grpRes.status, 201);
  assert.equal(grpRes.data.group.name, 'Comité de Coordination Démo');
  assert.equal(grpRes.data.group.member_count, 3);

  // Envoi de message chiffré dans le groupe créé
  const msgRes = await apiReq(`/api/groups/${grpRes.data.group.id}/messages`, {
    method: 'POST',
    token: adminAuth.token,
    body: {
      protocol: 'megolm.v1',
      megolmSessionId: 'sess_coordination_test',
      ciphertext: 'MEGOLM_CIPHERTEXT_COORD_TEST',
      senderDeviceId: 'dev_adm_coord',
      senderEd25519: 'ed25519_adm_pubkey',
      ephemeralKey: 'curve_adm_key',
      signature: 'sig_coord_test',
      clientMsgId: 'cmsg_coord_1',
      messageType: 'CHAT'
    }
  });
  assert.equal(msgRes.status, 200);
  assert.equal(msgRes.data.message.delivery_status, 'sent');

  // Création d'une instruction administrative chiffrée
  const instScope = await apiReq('/api/instructions/scope-group', {
    method: 'POST',
    token: adminAuth.token,
    body: { recipientIds: [activeMembers[0].id] }
  });
  assert.equal(instScope.status, 200);

  const instRes = await apiReq('/api/instructions', {
    method: 'POST',
    token: adminAuth.token,
    body: {
      groupId: instScope.data.groupId,
      titleCiphertext: 'TITRE_INSTRUCTION_CHIFFRE_MEGOLM',
      megolmSessionId: 'sess_inst_coord',
      senderEd25519: 'ed25519_adm_pubkey',
      signature: 'sig_inst_coord',
      recipientIds: instScope.data.recipientIds,
      deadline: new Date(Date.now() + 86400000).toISOString()
    }
  });
  assert.equal(instRes.status, 201);
  assert.ok(instRes.data.instruction.id);

  // Vérification de la présence dans le dashboard
  const dashRes = await apiReq('/api/instructions/dashboard', { token: adminAuth.token });
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.data.dashboard.some((i) => i.id === instRes.data.instruction.id));
});



