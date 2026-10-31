/**
 * FASOBRIEF - Routes des Instructions Administratives Structurées & Suivi par Destinataire
 *
 * Règles métier strictes :
 * - Statuts de l'instruction : BROUILLON -> PUBLIEE -> CLOTUREE | ANNULEE
 * - Statuts par destinataire (calculés sur horodatages réels) :
 *   TRANSMISE -> CONSULTEE -> CONFIRMEE (Ed25519) -> EN_COURS -> EXECUTEE (+ indicateur EN_RETARD)
 * - Consultation (viewed_at) != Confirmation formelle (acknowledged_at) != Exécution (executed_at)
 * - Destinataires = membres actifs du groupe hors émetteur (ou sous-ensemble explicite)
 * - Modifier une instruction déjà PUBLIEE crée une nouvelle version (v2, v3...), conserve les
 *   preuves antérieures dans instruction_events et exige une nouvelle confirmation des destinataires.
 */

const crypto = require('node:crypto');
const express = require('express');
const Olm = require('@matrix-org/olm');
const { db } = require('../database');
const { requireAuth, requireRole, logAuditEvent } = require('../auth');
const { broadcastToGroup } = require('../ws-hub');
const { createNotification } = require('../notifications-service');
const { isActiveGroupMember } = require('./crypto-routes');

const router = express.Router();

let olmReadyPromise = null;
function ensureOlmInitialized() {
  if (!olmReadyPromise) {
    olmReadyPromise = Olm.init();
  }
  return olmReadyPromise;
}

async function verifyEd25519AckSignature(userId, signerEd25519, signedPayload, signatureProof) {
  const dev = db.prepare(`
    SELECT device_id, ed25519_key FROM user_devices WHERE user_id = ? AND ed25519_key = ?
  `).get(userId, signerEd25519);

  if (!dev) {
    return { valid: false, reason: 'CLE_ED25519_NON_RATTACHEE_A_AGENT' };
  }

  await ensureOlmInitialized();
  const util = new Olm.Utility();
  try {
    util.ed25519_verify(dev.ed25519_key, signedPayload, signatureProof);
    return { valid: true, deviceId: dev.device_id };
  } catch (_) {
    return { valid: false, reason: 'SIGNATURE_ED25519_INVALIDE' };
  } finally {
    util.free();
  }
}

function generateInstructionRef() {
  const year = new Date().getFullYear();
  const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM instructions`).get();
  const seq = String(((countRow && countRow.cnt) || 0) + 1).padStart(4, '0');
  const suffix = crypto.randomBytes(1).toString('hex').toUpperCase();
  return `INST-${year}-${seq}-${suffix}`;
}

function recordInstructionEvent(instructionId, version, actorId, eventType, metaObj = {}) {
  db.prepare(`
    INSERT INTO instruction_events (id, instruction_id, version, actor_id, event_type, meta_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'iev_' + crypto.randomUUID(),
    instructionId,
    version || 1,
    actorId,
    eventType,
    JSON.stringify(metaObj || {})
  );
}

function computeRecipientStep(r, instVersion, deadline, instStatus) {
  const ackCurrentVersion = r.acknowledged_at && Number(r.ack_version || 1) === Number(instVersion || 1);
  let step = 'TRANSMISE';
  if (r.executed_at && ackCurrentVersion) {
    step = 'EXECUTEE';
  } else if (r.in_progress_at && ackCurrentVersion) {
    step = 'EN_COURS';
  } else if (ackCurrentVersion) {
    step = 'CONFIRMEE';
  } else if (r.viewed_at) {
    step = 'CONSULTEE';
  }

  const isOverdue = Boolean(
    instStatus === 'PUBLIEE' &&
    deadline &&
    new Date(deadline).getTime() < Date.now() &&
    step !== 'EXECUTEE'
  );

  return { step, isOverdue, ackCurrentVersion: Boolean(ackCurrentVersion) };
}

function hydrateInstructionForUser(inst, currentUserId) {
  let recipients = db.prepare(`
    SELECT ir.user_id, ir.assigned_version, ir.transmitted_at, ir.viewed_at,
           ir.acknowledged_at, ir.ack_version, ir.signature_proof, ir.signer_ed25519,
           ir.in_progress_at, ir.executed_at, ir.execution_ciphertext, ir.execution_session_id,
           u.full_name, u.matricule, u.role, u.service_ministry, u.status AS user_status
    FROM instruction_recipients ir
    JOIN users u ON u.id = ir.user_id
    WHERE ir.instruction_id = ?
    ORDER BY u.full_name ASC
  `).all(inst.id);

  // Rétrocompatibilité si une instruction a été insérée directement en SQL par un ancien test
  if (recipients.length === 0 && inst.status !== 'BROUILLON') {
    const fallbackMembers = db.prepare(`
      SELECT u.id AS user_id, u.full_name, u.matricule, u.role, u.service_ministry, u.status AS user_status,
             a.acknowledged_at, a.signature_proof, a.signer_ed25519, a.version AS ack_version
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN acknowledgements a ON a.instruction_id = ? AND a.user_id = u.id
      WHERE gm.group_id = ? AND u.id != ?
    `).all(inst.id, inst.group_id, inst.creator_id);

    recipients = fallbackMembers.map((m) => ({
      ...m,
      assigned_version: inst.version || 1,
      transmitted_at: inst.created_at,
      viewed_at: m.acknowledged_at || null,
      in_progress_at: null,
      executed_at: null
    }));
  }

  const enrichedRecipients = recipients.map((r) => {
    const calc = computeRecipientStep(r, inst.version || 1, inst.deadline, inst.status);
    return {
      user_id: r.user_id,
      userId: r.user_id,
      full_name: r.full_name,
      fullName: r.full_name,
      matricule: r.matricule,
      role: r.role,
      serviceMinistry: r.service_ministry,
      userStatus: r.user_status,
      step: calc.step,
      isOverdue: calc.isOverdue,
      transmittedAt: r.transmitted_at,
      viewedAt: r.viewed_at,
      acknowledgedAt: calc.ackCurrentVersion ? r.acknowledged_at : null,
      ackVersion: r.ack_version || null,
      signatureVerified: Boolean(r.signer_ed25519),
      signatureProof: r.signature_proof || null,
      inProgressAt: calc.ackCurrentVersion ? r.in_progress_at : null,
      executedAt: calc.ackCurrentVersion ? r.executed_at : null,
      executionCiphertext: r.execution_ciphertext || null,
      executionSessionId: r.execution_session_id || null
    };
  });

  const totalRecipients = enrichedRecipients.length;
  const viewedCount = enrichedRecipients.filter((r) => Boolean(r.viewedAt)).length;
  const ackCount = enrichedRecipients.filter((r) => Boolean(r.acknowledgedAt)).length;
  const inProgressCount = enrichedRecipients.filter((r) => r.step === 'EN_COURS').length;
  const executedCount = enrichedRecipients.filter((r) => r.step === 'EXECUTEE').length;
  const isOverdue = Boolean(
    inst.status === 'PUBLIEE' &&
    inst.deadline &&
    new Date(inst.deadline).getTime() < Date.now() &&
    (totalRecipients === 0 || executedCount < totalRecipients)
  );

  const myRecipientRecord = enrichedRecipients.find((r) => r.userId === currentUserId) || null;

  return {
    ...inst,
    version: inst.version || 1,
    priority: inst.priority || 'NORMALE',
    total_recipients: totalRecipients,
    viewed_count: viewedCount,
    ack_count: ackCount,
    in_progress_count: inProgressCount,
    executed_count: executedCount,
    is_overdue: isOverdue,
    is_creator: inst.creator_id === currentUserId,
    is_recipient: Boolean(myRecipientRecord),
    my_recipient: myRecipientRecord,
    recipients: enrichedRecipients,
    acknowledgements: enrichedRecipients
      .filter((r) => Boolean(r.acknowledgedAt))
      .map((r) => ({
        user_id: r.userId,
        full_name: r.fullName,
        matricule: r.matricule,
        status: 'PRIS_CONNAISSANCE',
        acknowledged_at: r.acknowledgedAt,
        signature_verified: r.signatureVerified
      }))
  };
}

/**
 * Prépare ou récupère un périmètre cryptographique Megolm dédié aux destinataires exacts d'une instruction
 */
router.post('/instructions/scope-group', requireAuth, requireRole('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'), (req, res) => {
  const { recipientIds } = req.body || {};
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ error: 'DESTINATAIRES_REQUIS' });
  }

  const validRecipientIds = [];
  const seen = new Set([req.user.id]);
  for (const uid of recipientIds) {
    if (!uid || seen.has(uid)) continue;
    const valid = db.prepare(`
      SELECT id FROM users WHERE id = ? AND status = 'ACTIVE' AND is_revoked = 0 AND is_enrolled = 1
    `).get(uid);
    if (valid) {
      seen.add(uid);
      validRecipientIds.push(uid);
    }
  }

  if (validRecipientIds.length === 0) {
    return res.status(400).json({ error: 'AUCUN_DESTINATAIRE_ACTIF_VALIDE' });
  }

  const allParticipants = [req.user.id, ...validRecipientIds].sort();
  const scopeKey = 'inst_scope:' + crypto.createHash('sha256').update(allParticipants.join(':')).digest('hex').slice(0, 32);

  let grp = db.prepare(`SELECT * FROM groups WHERE scope_key = ? AND is_active = 1`).get(scopeKey);
  if (!grp) {
    const groupId = 'grp_iscope_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, scope_key, name, description, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'instruction_scope', ?, 'Diffusion Instruction E2EE', 'Périmètre Megolm restreint aux destinataires désignés', 'Instructions', ?, 1)
    `).run(groupId, scopeKey, req.user.id);
    grp = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
  }

  const insMem = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)`);
  insMem.run(grp.id, req.user.id, 'OWNER');
  for (const uid of validRecipientIds) {
    insMem.run(grp.id, uid, 'MEMBER');
  }

  res.json({ success: true, groupId: grp.id, recipientIds: validRecipientIds });
});

/**
 * Création d'une instruction (BROUILLON ou PUBLIEE) par ADMIN, DIRECTEUR ou CHEF_SERVICE
 */
router.post('/instructions', requireAuth, requireRole('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'), (req, res) => {
  const {
    messageId,
    titleCiphertext,
    megolmSessionId,
    senderEd25519,
    signature,
    deadline,
    priority,
    groupId,
    recipientIds,
    isDraft
  } = req.body || {};

  if (!titleCiphertext || !groupId) {
    return res.status(400).json({ error: 'CHAMPS_INSTRUCTION_INCOMPLETS' });
  }

  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'EMETTEUR_NON_MEMBRE_DU_GROUPE' });
  }

  const allowedPriorities = ['NORMALE', 'HAUTE', 'URGENTE'];
  const finalPriority = allowedPriorities.includes(priority) ? priority : 'NORMALE';
  const finalStatus = isDraft ? 'BROUILLON' : 'PUBLIEE';
  const nowIso = new Date().toISOString();

  const instructionId = 'inst_' + crypto.randomUUID();
  const instructionRef = generateInstructionRef();

  db.prepare(`
    INSERT INTO instructions (
      id, message_id, instruction_ref, title_ciphertext, megolm_session_id,
      sender_ed25519, signature, version, priority, deadline, creator_id,
      group_id, status, created_at, published_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    instructionId,
    messageId || null,
    instructionRef,
    titleCiphertext,
    megolmSessionId || null,
    senderEd25519 || null,
    signature || null,
    finalPriority,
    deadline || null,
    req.user.id,
    groupId,
    finalStatus,
    nowIso,
    finalStatus === 'PUBLIEE' ? nowIso : null,
    nowIso
  );

  if (finalStatus === 'BROUILLON') {
    recordInstructionEvent(instructionId, 1, req.user.id, 'CREATED_DRAFT', { instructionRef });
  } else {
    assignAndNotifyInstructionRecipients({
      instructionId,
      instructionRef,
      groupId,
      creatorUser: req.user,
      recipientIds,
      version: 1,
      nowIso,
      isUpdate: false
    });
    recordInstructionEvent(instructionId, 1, req.user.id, 'PUBLISHED', { instructionRef, deadline: deadline || null });
  }

  logAuditEvent('INSTRUCTION_CREATED', req.user.id, req.ip, `Instruction ${instructionRef} (${finalStatus}) dans ${groupId}`, instructionId);

  const row = db.prepare(`
    SELECT i.*, m.iv, m.tag, g.name AS group_name, u.full_name AS creator_name
    FROM instructions i
    LEFT JOIN messages m ON m.id = i.message_id
    JOIN groups g ON g.id = i.group_id
    JOIN users u ON u.id = i.creator_id
    WHERE i.id = ?
  `).get(instructionId);

  const hydrated = hydrateInstructionForUser(row, req.user.id);

  if (finalStatus === 'PUBLIEE') {
    broadcastToGroup(groupId, {
      type: 'NEW_ADMINISTRATIVE_INSTRUCTION',
      instruction: hydrated
    });
  }

  res.status(201).json({ success: true, instruction: hydrated });
});

function assignAndNotifyInstructionRecipients({
  instructionId,
  instructionRef,
  groupId,
  creatorUser,
  recipientIds,
  version,
  nowIso,
  isUpdate
}) {
  // Destinataires autorisés = membres actifs du groupe HORS émetteur
  const groupActiveMembers = db.prepare(`
    SELECT gm.user_id
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND gm.user_id != ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
  `).all(groupId, creatorUser.id).map((r) => r.user_id);

  let targetIds = groupActiveMembers;
  if (Array.isArray(recipientIds) && recipientIds.length > 0) {
    const allowedSet = new Set(groupActiveMembers);
    const filtered = recipientIds.filter((id) => allowedSet.has(id));
    if (filtered.length > 0) targetIds = filtered;
  }

  const upsertRec = db.prepare(`
    INSERT INTO instruction_recipients (
      instruction_id, user_id, assigned_version, transmitted_at,
      viewed_at, acknowledged_at, ack_version, signature_proof, signer_ed25519,
      in_progress_at, executed_at, execution_ciphertext, execution_session_id
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT(instruction_id, user_id) DO UPDATE SET
      assigned_version = excluded.assigned_version,
      transmitted_at = excluded.transmitted_at,
      viewed_at = NULL,
      acknowledged_at = NULL,
      ack_version = NULL,
      signature_proof = NULL,
      signer_ed25519 = NULL,
      in_progress_at = NULL,
      executed_at = NULL,
      execution_ciphertext = NULL,
      execution_session_id = NULL
  `);

  for (const uid of targetIds) {
    upsertRec.run(instructionId, uid, version, nowIso);
    createNotification({
      userId: uid,
      type: isUpdate ? 'INSTRUCTION_UPDATED' : 'INSTRUCTION_RECEIVED',
      dedupKey: `inst:${instructionId}:v${version}`,
      groupId,
      instructionId,
      title: isUpdate
        ? `Instruction mise à jour (v${version}) — ${instructionRef}`
        : `Nouvelle instruction — ${instructionRef}`,
      body: isUpdate
        ? `${creatorUser.fullName} a publié la version v${version}. Une nouvelle confirmation de réception est requise.`
        : `Instruction transmise par ${creatorUser.fullName}. Confirmation de réception attendue.`
    });
  }
}

/**
 * Publication d'un brouillon d'instruction (émetteur uniquement)
 */
router.post('/instructions/:instructionId/publish', requireAuth, (req, res) => {
  const { instructionId } = req.params;
  const { messageId, titleCiphertext, megolmSessionId, senderEd25519, signature, recipientIds } = req.body || {};

  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(instructionId);
  if (!inst) return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  if (inst.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'SEUL_EMETTEUR_PEUT_PUBLIER' });
  }
  if (inst.status !== 'BROUILLON') {
    return res.status(400).json({ error: 'INSTRUCTION_DEJA_PUBLIEE_OU_CLOTUREE' });
  }
  if (!isActiveGroupMember(inst.group_id, req.user.id)) {
    return res.status(403).json({ error: 'EMETTEUR_NON_MEMBRE_DU_GROUPE' });
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE instructions
    SET status = 'PUBLIEE',
        message_id = COALESCE(?, message_id),
        title_ciphertext = COALESCE(?, title_ciphertext),
        megolm_session_id = COALESCE(?, megolm_session_id),
        sender_ed25519 = COALESCE(?, sender_ed25519),
        signature = COALESCE(?, signature),
        published_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    messageId || null,
    titleCiphertext || null,
    megolmSessionId || null,
    senderEd25519 || null,
    signature || null,
    nowIso,
    nowIso,
    instructionId
  );

  assignAndNotifyInstructionRecipients({
    instructionId,
    instructionRef: inst.instruction_ref,
    groupId: inst.group_id,
    creatorUser: req.user,
    recipientIds,
    version: inst.version || 1,
    nowIso,
    isUpdate: false
  });

  recordInstructionEvent(instructionId, inst.version || 1, req.user.id, 'PUBLISHED', {
    instructionRef: inst.instruction_ref
  });

  const row = db.prepare(`
    SELECT i.*, m.iv, m.tag, g.name AS group_name, u.full_name AS creator_name
    FROM instructions i
    LEFT JOIN messages m ON m.id = i.message_id
    JOIN groups g ON g.id = i.group_id
    JOIN users u ON u.id = i.creator_id
    WHERE i.id = ?
  `).get(instructionId);

  const hydrated = hydrateInstructionForUser(row, req.user.id);
  broadcastToGroup(inst.group_id, { type: 'NEW_ADMINISTRATIVE_INSTRUCTION', instruction: hydrated });
  res.json({ success: true, instruction: hydrated });
});

/**
 * Enregistrement d'une simple consultation (ouverture du détail) :
 * NE VAUT JAMAIS confirmation de réception !
 */
router.post('/instructions/:instructionId/view', requireAuth, (req, res) => {
  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!inst) return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  if (!isActiveGroupMember(inst.group_id, req.user.id) && inst.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'ACCES_INSTRUCTION_INTERDIT' });
  }

  const rec = db.prepare(`
    SELECT * FROM instruction_recipients WHERE instruction_id = ? AND user_id = ?
  `).get(inst.id, req.user.id);

  if (rec && !rec.viewed_at && inst.status === 'PUBLIEE') {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE instruction_recipients SET viewed_at = ? WHERE instruction_id = ? AND user_id = ?
    `).run(nowIso, inst.id, req.user.id);

    recordInstructionEvent(inst.id, inst.version || 1, req.user.id, 'VIEWED', {});
    broadcastToGroup(inst.group_id, {
      type: 'INSTRUCTION_UPDATED',
      instructionId: inst.id
    });
  }

  res.json({ success: true });
});

/**
 * Confirmation formelle de réception / prise de connaissance (destinataire uniquement, signée Ed25519)
 */
router.post('/instructions/:instructionId/ack', requireAuth, async (req, res) => {
  const { signatureProof, signedPayload, signerEd25519 } = req.body || {};
  if (!signatureProof) {
    return res.status(400).json({ error: 'PREUVE_SIGNATURE_REQUISE' });
  }

  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!inst) {
    return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  }
  if (inst.status !== 'PUBLIEE') {
    return res.status(400).json({ error: 'INSTRUCTION_NON_ACTIVE_POUR_CONFIRMATION' });
  }
  if (!isActiveGroupMember(inst.group_id, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_GROUPE_INSTRUCTION_REFUSE' });
  }
  if (inst.creator_id === req.user.id) {
    return res.status(403).json({ error: 'EMETTEUR_NE_CONFIRME_PAS_SA_PROPRE_INSTRUCTION' });
  }

  const rec = db.prepare(`
    SELECT * FROM instruction_recipients WHERE instruction_id = ? AND user_id = ?
  `).get(inst.id, req.user.id);

  if (!rec) {
    return res.status(403).json({ error: 'NON_DESTINATAIRE_DE_CETTE_INSTRUCTION' });
  }

  let verifiedEd25519Key = null;
  if (signerEd25519) {
    const expectedCanonical = `FASOBRIEF_ACK_V1:${inst.id}:v${inst.version || 1}:${req.user.id}`;
    if (signedPayload !== expectedCanonical) {
      return res.status(400).json({ error: 'PAYLOAD_SIGNATURE_NON_CONFORME' });
    }
    const verif = await verifyEd25519AckSignature(req.user.id, signerEd25519, signedPayload, signatureProof);
    if (!verif.valid) {
      return res.status(400).json({ error: verif.reason || 'SIGNATURE_ED25519_INVALIDE' });
    }
    verifiedEd25519Key = signerEd25519;
  }

  const nowIso = new Date().toISOString();
  const currentVersion = inst.version || 1;

  db.prepare(`
    UPDATE instruction_recipients
    SET viewed_at = COALESCE(viewed_at, ?),
        acknowledged_at = ?,
        ack_version = ?,
        signature_proof = ?,
        signer_ed25519 = ?
    WHERE instruction_id = ? AND user_id = ?
  `).run(nowIso, nowIso, currentVersion, signatureProof, verifiedEd25519Key, inst.id, req.user.id);

  db.prepare(`
    INSERT OR REPLACE INTO acknowledgements (
      id, instruction_id, user_id, version, status, signature_proof, signer_ed25519, acknowledged_at
    ) VALUES (?, ?, ?, ?, 'PRIS_CONNAISSANCE', ?, ?, ?)
  `).run(
    'ack_' + crypto.randomUUID(),
    inst.id,
    req.user.id,
    currentVersion,
    signatureProof,
    verifiedEd25519Key,
    nowIso
  );

  recordInstructionEvent(inst.id, currentVersion, req.user.id, 'ACKNOWLEDGED', {
    signatureVerified: Boolean(verifiedEd25519Key)
  });

  createNotification({
    userId: inst.creator_id,
    type: 'INSTRUCTION_ACKED',
    dedupKey: `inst_ack:${inst.id}:v${currentVersion}`,
    groupId: inst.group_id,
    instructionId: inst.id,
    title: `Réception confirmée — ${inst.instruction_ref}`,
    body: `${req.user.fullName} a confirmé la prise de connaissance (v${currentVersion}).`
  });

  broadcastToGroup(inst.group_id, {
    type: 'INSTRUCTION_ACKNOWLEDGED',
    instructionId: inst.id,
    userId: req.user.id,
    userName: req.user.fullName,
    version: currentVersion,
    acknowledgedAt: nowIso
  });

  res.json({
    success: true,
    acknowledged: true,
    signatureVerified: Boolean(verifiedEd25519Key),
    instructionStatus: inst.status
  });
});

/**
 * Passage à « En cours de traitement » par un destinataire ayant confirmé réception
 */
router.post('/instructions/:instructionId/progress', requireAuth, (req, res) => {
  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!inst || inst.status !== 'PUBLIEE') {
    return res.status(400).json({ error: 'INSTRUCTION_NON_ACTIVE' });
  }
  if (!isActiveGroupMember(inst.group_id, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_INTERDIT' });
  }

  const rec = db.prepare(`
    SELECT * FROM instruction_recipients WHERE instruction_id = ? AND user_id = ?
  `).get(inst.id, req.user.id);

  if (!rec) {
    return res.status(403).json({ error: 'DESTINATAIRE_UNIQUEMENT' });
  }
  if (!rec.acknowledged_at || Number(rec.ack_version || 1) !== Number(inst.version || 1)) {
    return res.status(400).json({ error: 'CONFIRMATION_RECEPTION_PREALABLE_REQUISE' });
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE instruction_recipients
    SET in_progress_at = COALESCE(in_progress_at, ?)
    WHERE instruction_id = ? AND user_id = ?
  `).run(nowIso, inst.id, req.user.id);

  recordInstructionEvent(inst.id, inst.version || 1, req.user.id, 'IN_PROGRESS', {});
  broadcastToGroup(inst.group_id, { type: 'INSTRUCTION_UPDATED', instructionId: inst.id });

  res.json({ success: true, inProgressAt: nowIso });
});

/**
 * Déclaration d'exécution par un destinataire (après confirmation de réception)
 */
router.post('/instructions/:instructionId/execute', requireAuth, (req, res) => {
  const { executionCiphertext, executionSessionId } = req.body || {};
  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!inst || inst.status !== 'PUBLIEE') {
    return res.status(400).json({ error: 'INSTRUCTION_NON_ACTIVE' });
  }
  if (!isActiveGroupMember(inst.group_id, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_INTERDIT' });
  }

  const rec = db.prepare(`
    SELECT * FROM instruction_recipients WHERE instruction_id = ? AND user_id = ?
  `).get(inst.id, req.user.id);

  if (!rec) {
    return res.status(403).json({ error: 'DESTINATAIRE_UNIQUEMENT' });
  }
  if (!rec.acknowledged_at || Number(rec.ack_version || 1) !== Number(inst.version || 1)) {
    return res.status(400).json({ error: 'CONFIRMATION_RECEPTION_PREALABLE_REQUISE' });
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE instruction_recipients
    SET in_progress_at = COALESCE(in_progress_at, ?),
        executed_at = ?,
        execution_ciphertext = ?,
        execution_session_id = ?
    WHERE instruction_id = ? AND user_id = ?
  `).run(nowIso, nowIso, executionCiphertext || null, executionSessionId || null, inst.id, req.user.id);

  recordInstructionEvent(inst.id, inst.version || 1, req.user.id, 'EXECUTED', {});

  createNotification({
    userId: inst.creator_id,
    type: 'INSTRUCTION_EXECUTED',
    dedupKey: `inst_exec:${inst.id}:${req.user.id}:v${inst.version || 1}`,
    groupId: inst.group_id,
    instructionId: inst.id,
    title: `Exécution déclarée — ${inst.instruction_ref}`,
    body: `${req.user.fullName} a déclaré l'exécution de l'instruction.`
  });

  broadcastToGroup(inst.group_id, { type: 'INSTRUCTION_UPDATED', instructionId: inst.id });

  res.json({ success: true, executedAt: nowIso });
});

/**
 * Modification d'une instruction par son émetteur uniquement :
 * - Si BROUILLON : mise à jour sur place (v1)
 * - Si PUBLIEE : création d'une nouvelle version (v+1), conservation de l'historique et
 *   demande d'une nouvelle confirmation aux destinataires !
 */
router.patch('/instructions/:instructionId', requireAuth, (req, res) => {
  const { instructionId } = req.params;
  const {
    messageId,
    titleCiphertext,
    megolmSessionId,
    senderEd25519,
    signature,
    deadline,
    priority,
    recipientIds
  } = req.body || {};

  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(instructionId);
  if (!inst) return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  if (inst.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'MODIFICATION_RESERVEE_EMETTEUR' });
  }
  if (inst.status === 'CLOTUREE' || inst.status === 'ANNULEE') {
    return res.status(400).json({ error: 'INSTRUCTION_CLOTUREE_OU_ANNULEE_NON_MODIFIABLE' });
  }

  const nowIso = new Date().toISOString();
  const nextPriority = ['NORMALE', 'HAUTE', 'URGENTE'].includes(priority) ? priority : inst.priority;
  const nextDeadline = deadline !== undefined ? (deadline || null) : inst.deadline;

  if (inst.status === 'BROUILLON') {
    db.prepare(`
      UPDATE instructions
      SET title_ciphertext = COALESCE(?, title_ciphertext),
          megolm_session_id = COALESCE(?, megolm_session_id),
          priority = ?,
          deadline = ?,
          updated_at = ?
      WHERE id = ?
    `).run(titleCiphertext || null, megolmSessionId || null, nextPriority, nextDeadline, nowIso, instructionId);
  } else {
    if (!titleCiphertext) {
      return res.status(400).json({ error: 'NOUVEAU_CONTENU_CHIFFRE_REQUIS_POUR_NOUVELLE_VERSION' });
    }
    const nextVersion = (inst.version || 1) + 1;

    db.prepare(`
      UPDATE instructions
      SET version = ?,
          message_id = COALESCE(?, message_id),
          title_ciphertext = ?,
          megolm_session_id = COALESCE(?, megolm_session_id),
          sender_ed25519 = COALESCE(?, sender_ed25519),
          signature = COALESCE(?, signature),
          priority = ?,
          deadline = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextVersion,
      messageId || null,
      titleCiphertext,
      megolmSessionId || null,
      senderEd25519 || null,
      signature || null,
      nextPriority,
      nextDeadline,
      nowIso,
      instructionId
    );

    assignAndNotifyInstructionRecipients({
      instructionId,
      instructionRef: inst.instruction_ref,
      groupId: inst.group_id,
      creatorUser: req.user,
      recipientIds,
      version: nextVersion,
      nowIso,
      isUpdate: true
    });

    recordInstructionEvent(instructionId, nextVersion, req.user.id, 'UPDATED_VERSION', {
      previousVersion: inst.version || 1,
      newVersion: nextVersion,
      deadline: nextDeadline
    });

    logAuditEvent('INSTRUCTION_VERSIONED', req.user.id, req.ip, `Nouvelle version v${nextVersion} de ${inst.instruction_ref}`, instructionId);
    broadcastToGroup(inst.group_id, { type: 'INSTRUCTION_UPDATED', instructionId });
  }

  const row = db.prepare(`
    SELECT i.*, m.iv, m.tag, g.name AS group_name, u.full_name AS creator_name
    FROM instructions i
    LEFT JOIN messages m ON m.id = i.message_id
    JOIN groups g ON g.id = i.group_id
    JOIN users u ON u.id = i.creator_id
    WHERE i.id = ?
  `).get(instructionId);

  res.json({ success: true, instruction: hydrateInstructionForUser(row, req.user.id) });
});

/**
 * Clôture ou annulation d'une instruction (émetteur uniquement)
 */
router.post('/instructions/:instructionId/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (status !== 'CLOTUREE' && status !== 'ANNULEE') {
    return res.status(400).json({ error: 'STATUT_CIBLE_INVALIDE' });
  }

  const inst = db.prepare(`SELECT * FROM instructions WHERE id = ?`).get(req.params.instructionId);
  if (!inst) return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });
  if (inst.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'SEUL_EMETTEUR_PEUT_CLOTURER_OU_ANNULER' });
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE instructions SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?
  `).run(status, nowIso, nowIso, inst.id);

  recordInstructionEvent(inst.id, inst.version || 1, req.user.id, status === 'CLOTUREE' ? 'CLOSED' : 'CANCELLED', {});

  const recs = db.prepare(`SELECT user_id FROM instruction_recipients WHERE instruction_id = ?`).all(inst.id);
  for (const r of recs) {
    createNotification({
      userId: r.user_id,
      type: 'INSTRUCTION_UPDATED',
      dedupKey: `inst_close:${inst.id}:${status}`,
      groupId: inst.group_id,
      instructionId: inst.id,
      title: `Instruction ${status === 'CLOTUREE' ? 'clôturée' : 'annulée'} — ${inst.instruction_ref}`,
      body: `${req.user.fullName} a ${status === 'CLOTUREE' ? 'clôturé' : 'annulé'} cette instruction.`
    });
  }

  broadcastToGroup(inst.group_id, { type: 'INSTRUCTION_UPDATED', instructionId: inst.id });
  res.json({ success: true, status });
});

/**
 * Tableau de suivi des instructions autorisées pour l'agent connecté
 */
router.get('/instructions/dashboard', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT i.*, m.iv, m.tag,
           g.name AS group_name, u.full_name AS creator_name, u.matricule AS creator_matricule
    FROM instructions i
    LEFT JOIN messages m ON i.message_id = m.id
    JOIN groups g ON i.group_id = g.id
    JOIN users u ON i.creator_id = u.id
    LEFT JOIN group_members gm ON gm.group_id = i.group_id AND gm.user_id = ?
    WHERE (gm.user_id IS NOT NULL AND i.status != 'BROUILLON')
       OR (i.creator_id = ?)
    ORDER BY i.updated_at DESC, i.created_at DESC
  `).all(req.user.id, req.user.id);

  const detailed = rows.map((inst) => hydrateInstructionForUser(inst, req.user.id));

  res.json({ dashboard: detailed });
});

/**
 * Détail complet d'une instruction + historique immuable des événements et versions
 */
router.get('/instructions/:instructionId', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT i.*, m.iv, m.tag,
           g.name AS group_name, u.full_name AS creator_name, u.matricule AS creator_matricule
    FROM instructions i
    LEFT JOIN messages m ON i.message_id = m.id
    JOIN groups g ON i.group_id = g.id
    JOIN users u ON i.creator_id = u.id
    WHERE i.id = ?
  `).get(req.params.instructionId);

  if (!row) return res.status(404).json({ error: 'INSTRUCTION_INTROUVABLE' });

  const isMember = isActiveGroupMember(row.group_id, req.user.id);
  if (row.status === 'BROUILLON' && row.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'BROUILLON_PRIVE_EMETTEUR' });
  }
  if (!isMember && row.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'ACCES_INSTRUCTION_REFUSE' });
  }

  const events = db.prepare(`
    SELECT ie.id, ie.version, ie.event_type AS eventType, ie.meta_json AS metaJson,
           ie.created_at AS createdAt, u.full_name AS actorName, u.matricule AS actorMatricule
    FROM instruction_events ie
    JOIN users u ON u.id = ie.actor_id
    WHERE ie.instruction_id = ?
    ORDER BY ie.created_at DESC
  `).all(row.id);

  res.json({
    instruction: hydrateInstructionForUser(row, req.user.id),
    events
  });
});

module.exports = router;

