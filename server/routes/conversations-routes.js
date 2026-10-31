/**
 * FASOBRIEF - Routes Conversations (1:1 & Groupes), Messages E2EE, Statuts Réels & Fichiers Chiffrés
 */

const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { db } = require('../database');
const { requireAuth, requireRole, logAuditEvent } = require('../auth');
const { broadcastToGroup, sendToUser, userSockets } = require('../ws-hub');
const { notifyGroupKeyRotation } = require('../revocation');
const { createNotification } = require('../notifications-service');
const { isActiveGroupMember } = require('./crypto-routes');

const router = express.Router();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

function canManageGroup(groupId, user) {
  const grp = db.prepare(`SELECT * FROM groups WHERE id = ? AND is_active = 1`).get(groupId);
  if (!grp || grp.type === 'DIRECT') return false;
  if (user.role === 'ADMIN') return true;
  const membership = db.prepare(`
    SELECT member_role FROM group_members WHERE group_id = ? AND user_id = ?
  `).get(groupId, user.id);
  return Boolean(membership && (membership.member_role === 'OWNER' || membership.member_role === 'ADMIN'));
}

function computeMessageDeliverySummary(messageId, groupId, senderId) {
  const recipients = db.prepare(`
    SELECT gm.user_id
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND gm.user_id != ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
  `).all(groupId, senderId);

  const recipientCount = recipients.length;
  if (recipientCount === 0) {
    return { deliveryStatus: 'sent', recipientCount: 0, deliveredCount: 0, readCount: 0 };
  }

  const recipientIds = recipients.map((r) => r.user_id);
  const placeholders = recipientIds.map(() => '?').join(',');
  const receipts = db.prepare(`
    SELECT user_id, delivered_at, read_at
    FROM message_receipts
    WHERE message_id = ? AND user_id IN (${placeholders})
  `).all(messageId, ...recipientIds);

  let deliveredCount = 0;
  let readCount = 0;
  for (const r of receipts) {
    if (r.delivered_at || r.read_at) deliveredCount++;
    if (r.read_at) readCount++;
  }

  let deliveryStatus = 'sent';
  if (readCount >= recipientCount) {
    deliveryStatus = 'read';
  } else if (deliveredCount >= recipientCount) {
    deliveryStatus = 'delivered';
  }

  return {
    deliveryStatus,
    recipientCount,
    deliveredCount,
    readCount
  };
}

function enrichGroupForUser(groupRow, currentUserId) {
  let displayName = groupRow.name;
  let displaySubtitle = groupRow.service_ministry;
  let peerUser = null;

  if (groupRow.type === 'DIRECT') {
    const peer = db.prepare(`
      SELECT u.id, u.matricule, u.full_name AS fullName, u.role, u.job_title AS jobTitle,
             u.avatar_data AS avatarData,
             u.service_ministry AS serviceMinistry, u.status
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND gm.user_id != ?
      LIMIT 1
    `).get(groupRow.id, currentUserId);
    if (peer) {
      displayName = peer.fullName;
      displaySubtitle = `${peer.role} • ${peer.serviceMinistry}`;
      peerUser = peer;
    }
  }

  const unreadRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM messages m
    LEFT JOIN message_receipts mr ON mr.message_id = m.id AND mr.user_id = ?
    WHERE m.group_id = ? AND m.sender_id != ? AND mr.read_at IS NULL
  `).get(currentUserId, groupRow.id, currentUserId);

  const lastMsgRow = db.prepare(`
    SELECT id, group_id, sender_id, protocol, megolm_session_id, ciphertext,
           sender_ed25519, signature, message_type, created_at
    FROM messages
    WHERE group_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(groupRow.id);

  return {
    id: groupRow.id,
    type: groupRow.type || 'GROUP',
    channelKind: groupRow.channel_kind || (groupRow.type === 'DIRECT' ? 'direct' : (groupRow.service_id ? 'service' : 'group')),
    name: displayName,
    rawName: groupRow.name,
    description: groupRow.description || '',
    service_ministry: displaySubtitle,
    serviceId: groupRow.service_id || null,
    keyEpoch: groupRow.key_epoch || 1,
    member_count: groupRow.member_count,
    myMemberRole: groupRow.my_member_role || 'MEMBER',
    unreadCount: (unreadRow && unreadRow.cnt) || 0,
    lastMessageAt: lastMsgRow ? lastMsgRow.created_at : groupRow.created_at,
    lastMessageType: lastMsgRow ? lastMsgRow.message_type : null,
    lastMessage: lastMsgRow || null,
    peerUser,
    created_at: groupRow.created_at
  };
}

/**
 * Liste des conversations (DIRECT et GROUP) de l'agent connecté
 */
router.get('/groups', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT g.*, gm.member_role AS my_member_role,
           (SELECT COUNT(*)
            FROM group_members gm2
            JOIN users u2 ON u2.id = gm2.user_id
            WHERE gm2.group_id = g.id AND u2.status = 'ACTIVE' AND u2.is_revoked = 0) AS member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ? AND g.is_active = 1
      AND COALESCE(g.channel_kind, 'group') != 'instruction_scope'
  `).all(req.user.id);

  const groups = rows
    .map((r) => enrichGroupForUser(r, req.user.id))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  res.json({ groups });
});

/**
 * Ouverture ou récupération d'une conversation individuelle chiffrée (DIRECT, unique par paire)
 */
router.post('/conversations/direct', requireAuth, (req, res) => {
  const { targetUserId } = req.body || {};
  if (!targetUserId || targetUserId === req.user.id) {
    return res.status(400).json({ error: 'DESTINATAIRE_DIRECT_INVALIDE' });
  }

  const target = db.prepare(`
    SELECT id, full_name, matricule, service_ministry, status, is_revoked, is_enrolled
    FROM users WHERE id = ?
  `).get(targetUserId);

  if (!target || target.is_enrolled !== 1 || target.status !== 'ACTIVE' || target.is_revoked === 1) {
    return res.status(404).json({ error: 'DESTINATAIRE_INACTIF_OU_INTROUVABLE' });
  }

  const pairKey = [req.user.id, targetUserId].sort().join(':');
  let existing = db.prepare(`SELECT * FROM groups WHERE direct_pair_key = ?`).get(pairKey);

  if (!existing) {
    const groupId = 'dm_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO groups (id, type, direct_pair_key, name, description, service_ministry, created_by, is_active)
      VALUES (?, 'DIRECT', ?, ?, 'Conversation individuelle chiffrée', ?, ?, 1)
    `).run(
      groupId,
      pairKey,
      `${req.user.fullName} / ${target.full_name}`,
      target.service_ministry,
      req.user.id
    );

    const insMem = db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, 'MEMBER')
    `);
    insMem.run(groupId, req.user.id);
    insMem.run(groupId, targetUserId);

    existing = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
    sendToUser(targetUserId, { type: 'CONVERSATION_CREATED', groupId });
  } else {
    // S'assurer que les deux membres actifs sont bien liés
    const insMem = db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, 'MEMBER')
    `);
    insMem.run(existing.id, req.user.id);
    insMem.run(existing.id, targetUserId);
  }

  const row = db.prepare(`
    SELECT g.*, gm.member_role AS my_member_role, 2 AS member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    WHERE g.id = ?
  `).get(req.user.id, existing.id);

  res.json({ success: true, group: enrichGroupForUser(row, req.user.id) });
});

/**
 * Création d'un groupe officiel (réservé ADMIN, DIRECTEUR, CHEF_SERVICE)
 */
router.post('/groups', requireAuth, requireRole('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'), (req, res) => {
  const { name, description, serviceId, memberIds } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length < 3) {
    return res.status(400).json({ error: 'NOM_GROUPE_REQUIS_MIN_3_CARACTERES' });
  }

  let ministryLabel = req.user.serviceMinistry || 'Administration Publique';
  if (serviceId) {
    const srv = db.prepare(`
      SELECT s.name AS sName, o.code AS oCode
      FROM services s
      JOIN directions d ON d.id = s.direction_id
      JOIN organisations o ON o.id = d.org_id
      WHERE s.id = ?
    `).get(serviceId);
    if (srv) ministryLabel = `${srv.oCode} — ${srv.sName}`;
  }

  const groupId = 'grp_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO groups (id, type, channel_kind, name, description, service_id, service_ministry, created_by, is_active)
    VALUES (?, 'GROUP', 'group', ?, ?, ?, ?, ?, 1)
  `).run(
    groupId,
    cleanName,
    String(description || '').trim(),
    serviceId || null,
    ministryLabel,
    req.user.id
  );

  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)
  `);
  insertMember.run(groupId, req.user.id, 'OWNER');

  const addedUserIds = [];
  if (Array.isArray(memberIds)) {
    for (const uid of memberIds) {
      if (!uid || uid === req.user.id) continue;
      const validUser = db.prepare(`
        SELECT id FROM users WHERE id = ? AND status = 'ACTIVE' AND is_revoked = 0 AND is_enrolled = 1
      `).get(uid);
      if (validUser) {
        insertMember.run(groupId, uid, 'MEMBER');
        addedUserIds.push(uid);
      }
    }
  }

  logAuditEvent('GROUP_CREATED', req.user.id, req.ip, `Création du groupe "${cleanName}" (${addedUserIds.length + 1} membres)`, groupId);

  for (const uid of addedUserIds) {
    createNotification({
      userId: uid,
      type: 'GROUP_ADDED',
      dedupKey: `group_added:${groupId}`,
      groupId,
      title: `Ajout au groupe « ${cleanName} »`,
      body: `Vous avez été rattaché au groupe de travail par ${req.user.fullName}.`
    });
    sendToUser(uid, { type: 'CONVERSATION_CREATED', groupId });
  }

  const row = db.prepare(`
    SELECT g.*, 'OWNER' AS my_member_role,
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
    FROM groups g WHERE g.id = ?
  `).get(groupId);

  res.status(201).json({ success: true, group: enrichGroupForUser(row, req.user.id) });
});

/**
 * Détails et liste des membres d'une conversation
 */
router.get('/groups/:groupId', requireAuth, (req, res) => {
  const { groupId } = req.params;
  if (!isActiveGroupMember(groupId, req.user.id) && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'ACCES_GROUPE_REFUSE' });
  }

  const grp = db.prepare(`SELECT * FROM groups WHERE id = ? AND is_active = 1`).get(groupId);
  if (!grp) {
    return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
  }

  // NB : Même un ADMIN plateforme ne peut pas lire les messages s'il n'est pas membre,
  // mais il peut inspecter la composition administrative d'un groupe de type GROUP.
  if (grp.type === 'DIRECT' && !isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'CONVERSATION_PRIVE_INTERDITE' });
  }

  const members = db.prepare(`
    SELECT u.id, u.matricule, u.full_name AS fullName, u.role, u.job_title AS jobTitle,
           u.service_ministry AS serviceMinistry, gm.member_role AS memberRole, gm.joined_at AS joinedAt
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
    ORDER BY CASE gm.member_role WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 ELSE 3 END, u.full_name ASC
  `).all(groupId);

  const myMem = members.find((m) => m.id === req.user.id);

  res.json({
    group: {
      id: grp.id,
      type: grp.type,
      name: grp.name,
      description: grp.description || '',
      serviceMinistry: grp.service_ministry,
      keyEpoch: grp.key_epoch,
      myMemberRole: myMem ? myMem.memberRole : null,
      canManage: canManageGroup(groupId, req.user)
    },
    members
  });
});

/**
 * Modification du nom ou de la description d'un groupe (propriétaire/admin du groupe)
 */
router.patch('/groups/:groupId', requireAuth, (req, res) => {
  const { groupId } = req.params;
  if (!canManageGroup(groupId, req.user)) {
    return res.status(403).json({ error: 'MODIFICATION_GROUPE_INTERDITE' });
  }

  const { name, description } = req.body || {};
  const grp = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
  const nextName = name !== undefined ? String(name).trim() : grp.name;
  const nextDesc = description !== undefined ? String(description).trim() : grp.description;

  if (!nextName || nextName.length < 3) {
    return res.status(400).json({ error: 'NOM_GROUPE_TROP_COURT' });
  }

  db.prepare(`UPDATE groups SET name = ?, description = ? WHERE id = ?`).run(nextName, nextDesc, groupId);
  broadcastToGroup(groupId, { type: 'GROUP_UPDATED', groupId, name: nextName, description: nextDesc });

  res.json({ success: true, name: nextName, description: nextDesc });
});

/**
 * Ajout de membres dans un groupe
 */
router.post('/groups/:groupId/members', requireAuth, (req, res) => {
  const { groupId } = req.params;
  if (!canManageGroup(groupId, req.user)) {
    return res.status(403).json({ error: 'GESTION_MEMBRES_INTERDITE' });
  }

  const { userIds, memberRole } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'LISTE_MEMBRES_REQUISE' });
  }

  const grp = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
  const roleToAssign = memberRole === 'ADMIN' ? 'ADMIN' : 'MEMBER';
  const ins = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)`);

  let added = 0;
  for (const uid of userIds) {
    const validUser = db.prepare(`
      SELECT id, full_name FROM users WHERE id = ? AND status = 'ACTIVE' AND is_revoked = 0 AND is_enrolled = 1
    `).get(uid);
    if (!validUser) continue;

    const info = ins.run(groupId, uid, roleToAssign);
    if (info.changes > 0) {
      added++;
      createNotification({
        userId: uid,
        type: 'GROUP_ADDED',
        dedupKey: `group_added:${groupId}`,
        groupId,
        title: `Ajout au groupe « ${grp.name} »`,
        body: `Vous avez été ajouté au groupe par ${req.user.fullName}.`
      });
      sendToUser(uid, { type: 'CONVERSATION_CREATED', groupId });
    }
  }

  if (added > 0) {
    db.prepare(`UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?`).run(groupId);
    notifyGroupKeyRotation(groupId, null, userSockets, 'Nouveaux membres ajoutés — partage de session Megolm');
    logAuditEvent('GROUP_MEMBERS_ADDED', req.user.id, req.ip, `Ajout de ${added} membre(s) au groupe ${grp.name}`, groupId);
  }

  res.json({ success: true, added });
});

/**
 * Retrait d'un membre d'un groupe -> perte immédiate d'accès serveur + rotation Megolm
 */
router.delete('/groups/:groupId/members/:userId', requireAuth, (req, res) => {
  const { groupId, userId } = req.params;
  if (!canManageGroup(groupId, req.user)) {
    return res.status(403).json({ error: 'GESTION_MEMBRES_INTERDITE' });
  }

  const targetMem = db.prepare(`SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId);
  if (!targetMem) {
    return res.status(404).json({ error: 'MEMBRE_INTROUVABLE_DANS_CE_GROUPE' });
  }

  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, userId);
  db.prepare(`DELETE FROM to_device_messages WHERE group_id = ? AND recipient_user_id = ?`).run(groupId, userId);
  db.prepare(`DELETE FROM key_requests WHERE group_id = ? AND requester_user_id = ?`).run(groupId, userId);
  db.prepare(`UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?`).run(groupId);

  sendToUser(userId, { type: 'REMOVED_FROM_GROUP', groupId });
  notifyGroupKeyRotation(groupId, userId, userSockets, 'Membre retiré du groupe — rotation immédiate de la session Megolm');

  logAuditEvent('GROUP_MEMBER_REMOVED', req.user.id, req.ip, `Retrait de ${userId} du groupe ${groupId}`, userId);
  res.json({ success: true });
});

/**
 * Quitter un groupe (interdit sur une conversation individuelle DIRECT)
 */
router.post('/groups/:groupId/leave', requireAuth, (req, res) => {
  const { groupId } = req.params;
  const grp = db.prepare(`SELECT * FROM groups WHERE id = ? AND is_active = 1`).get(groupId);
  if (!grp) {
    return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
  }
  if (grp.type === 'DIRECT') {
    return res.status(400).json({ error: 'QUITTER_CONVERSATION_DIRECTE_IMPOSSIBLE' });
  }

  const myMem = db.prepare(`SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, req.user.id);
  if (!myMem) {
    return res.status(404).json({ error: 'NON_MEMBRE_DU_GROUPE' });
  }

  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, req.user.id);
  db.prepare(`DELETE FROM to_device_messages WHERE group_id = ? AND recipient_user_id = ?`).run(groupId, req.user.id);

  // Si le dernier OWNER quitte alors qu'il reste des membres, promouvoir le plus ancien membre actif
  const remainingOwner = db.prepare(`
    SELECT user_id FROM group_members WHERE group_id = ? AND member_role = 'OWNER' LIMIT 1
  `).get(groupId);
  if (!remainingOwner) {
    const nextLeader = db.prepare(`
      SELECT gm.user_id
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
      ORDER BY CASE gm.member_role WHEN 'ADMIN' THEN 1 ELSE 2 END, gm.joined_at ASC
      LIMIT 1
    `).get(groupId);
    if (nextLeader) {
      db.prepare(`UPDATE group_members SET member_role = 'OWNER' WHERE group_id = ? AND user_id = ?`).run(groupId, nextLeader.user_id);
    }
  }

  db.prepare(`UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?`).run(groupId);
  notifyGroupKeyRotation(groupId, req.user.id, userSockets, 'Départ d\'un membre — renouvellement de la session Megolm');

  res.json({ success: true });
});

/**
 * Récupération de l'historique chiffré d'une conversation (strictement réservé aux membres actifs)
 */
router.get('/groups/:groupId/messages', requireAuth, (req, res) => {
  const { groupId } = req.params;
  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_GROUPE_REFUSE' });
  }

  const rows = db.prepare(`
    SELECT m.id, m.group_id, m.sender_id, m.sender_device_id, m.client_msg_id,
           m.protocol, m.megolm_session_id, m.ciphertext, m.sender_ed25519, m.signature,
           m.iv, m.tag, m.ephemeral_key, m.message_type, m.created_at,
           u.full_name AS sender_name, u.matricule AS sender_matricule,
           u.avatar_data AS sender_avatar,
           ef.id AS file_id, ef.file_size, ef.mime_type, ef.sha256_ciphertext,
           inst.id AS instruction_id, inst.instruction_ref, inst.status AS instruction_status,
           inst.deadline, inst.version AS instruction_version, inst.priority AS instruction_priority,
           ir.viewed_at AS my_viewed_at, ir.acknowledged_at AS my_ack_at, ir.ack_version AS my_ack_version,
           ir.executed_at AS my_executed_at
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN encrypted_files ef ON ef.message_id = m.id
    LEFT JOIN instructions inst ON inst.message_id = m.id
    LEFT JOIN instruction_recipients ir ON ir.instruction_id = inst.id AND ir.user_id = ?
    WHERE m.group_id = ?
    ORDER BY m.created_at ASC
  `).all(req.user.id, groupId);

  const messages = rows.map((m) => {
    const summary = computeMessageDeliverySummary(m.id, groupId, m.sender_id);
    return {
      ...m,
      delivery_status: summary.deliveryStatus,
      recipient_count: summary.recipientCount,
      delivered_count: summary.deliveredCount,
      read_count: summary.readCount
    };
  });

  res.json({ messages });
});

/**
 * Envoi d'un message chiffré de bout en bout (Megolm) avec déduplication idempotente clientMsgId
 */
router.post('/groups/:groupId/messages', requireAuth, (req, res) => {
  const { groupId } = req.params;
  const {
    ciphertext,
    megolmSessionId,
    senderDeviceId,
    senderEd25519,
    signature,
    protocol,
    iv,
    tag,
    ephemeralKey,
    messageType,
    clientMsgId,
    fileId
  } = req.body || {};

  if (!ciphertext) {
    return res.status(400).json({ error: 'CIPHERTEXT_REQUIS' });
  }

  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'ENVOI_INTERDIT_MEMBRE_NON_AUTORISE_OU_REVOQUE' });
  }

  const cleanClientMsgId = clientMsgId ? String(clientMsgId).trim().slice(0, 100) : null;

  // Déduplication idempotente en cas de renvoi après coupure réseau
  if (cleanClientMsgId) {
    const existing = db.prepare(`
      SELECT * FROM messages WHERE sender_id = ? AND client_msg_id = ?
    `).get(req.user.id, cleanClientMsgId);
    if (existing) {
      const summary = computeMessageDeliverySummary(existing.id, groupId, req.user.id);
      return res.json({
        success: true,
        deduplicated: true,
        message: {
          ...existing,
          groupId: existing.group_id,
          senderId: existing.sender_id,
          senderName: req.user.fullName,
          senderMatricule: req.user.matricule,
          delivery_status: summary.deliveryStatus,
          recipient_count: summary.recipientCount,
          delivered_count: summary.deliveredCount,
          read_count: summary.readCount
        }
      });
    }
  }

  const allowedTypes = ['CHAT', 'INSTRUCTION', 'FILE'];
  const finalType = allowedTypes.includes(messageType) ? messageType : 'CHAT';
  const messageId = 'msg_' + crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (
      id, group_id, sender_id, sender_device_id, client_msg_id,
      protocol, megolm_session_id, ciphertext, sender_ed25519, signature,
      iv, tag, ephemeral_key, message_type, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    groupId,
    req.user.id,
    senderDeviceId || null,
    cleanClientMsgId,
    protocol || (megolmSessionId ? 'megolm.v1' : 'aes-gcm.legacy'),
    megolmSessionId || null,
    ciphertext,
    senderEd25519 || null,
    signature || null,
    iv || null,
    tag || null,
    ephemeralKey || null,
    finalType,
    createdAt
  );

  let attachedFile = null;
  if (fileId) {
    const fileRow = db.prepare(`
      SELECT id, file_size, mime_type, sha256_ciphertext
      FROM encrypted_files
      WHERE id = ? AND group_id = ? AND uploader_id = ?
    `).get(fileId, groupId, req.user.id);
    if (fileRow) {
      db.prepare(`UPDATE encrypted_files SET message_id = ? WHERE id = ?`).run(messageId, fileId);
      attachedFile = fileRow;
    }
  }

  const summary = computeMessageDeliverySummary(messageId, groupId, req.user.id);

  const savedMessage = {
    id: messageId,
    group_id: groupId,
    groupId,
    sender_id: req.user.id,
    senderId: req.user.id,
    sender_device_id: senderDeviceId || null,
    sender_name: req.user.fullName,
    senderName: req.user.fullName,
    sender_matricule: req.user.matricule,
    senderMatricule: req.user.matricule,
    client_msg_id: cleanClientMsgId,
    protocol: protocol || (megolmSessionId ? 'megolm.v1' : 'aes-gcm.legacy'),
    megolm_session_id: megolmSessionId || null,
    ciphertext,
    sender_ed25519: senderEd25519 || null,
    signature: signature || null,
    iv: iv || null,
    tag: tag || null,
    ephemeral_key: ephemeralKey || null,
    message_type: finalType,
    messageType: finalType,
    file_id: attachedFile ? attachedFile.id : null,
    file_size: attachedFile ? attachedFile.file_size : null,
    sha256_ciphertext: attachedFile ? attachedFile.sha256_ciphertext : null,
    delivery_status: summary.deliveryStatus,
    recipient_count: summary.recipientCount,
    delivered_count: summary.deliveredCount,
    read_count: summary.readCount,
    created_at: createdAt,
    createdAt
  };

  broadcastToGroup(groupId, {
    type: 'NEW_ENCRYPTED_MESSAGE',
    message: savedMessage
  });

  // Notifications internes regroupées pour les messages courants (les instructions ont leur propre notification dédiée)
  if (finalType !== 'INSTRUCTION') {
    const grp = db.prepare(`SELECT name, type FROM groups WHERE id = ?`).get(groupId);
    const otherMembers = db.prepare(`
      SELECT gm.user_id
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND gm.user_id != ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
    `).all(groupId, req.user.id);

    const notifTitle = grp && grp.type === 'DIRECT'
      ? `Nouveau message de ${req.user.fullName}`
      : `Nouveau message — ${grp ? grp.name : 'Conversation'}`;

    for (const m of otherMembers) {
      createNotification({
        userId: m.user_id,
        type: 'NEW_MESSAGE',
        dedupKey: `unread_msg:${groupId}`,
        groupId,
        title: notifTitle,
        body: finalType === 'FILE'
          ? 'Une pièce jointe chiffrée a été partagée.'
          : 'Un nouveau message chiffré est en attente de lecture.'
      });
    }
  }

  res.json({ success: true, message: savedMessage });
});

/**
 * Émission d'accusés réels de livraison (delivered) ou de lecture (read) par le client destinataire
 */
router.post('/messages/receipts', requireAuth, (req, res) => {
  const { messageIds, type } = req.body || {};
  if (!Array.isArray(messageIds) || messageIds.length === 0 || (type !== 'delivered' && type !== 'read')) {
    return res.status(400).json({ error: 'PARAMETRES_RECEIPTS_INVALIDES' });
  }

  const nowIso = new Date().toISOString();
  const touchedGroups = new Set();
  let updatedCount = 0;

  for (const msgId of messageIds.slice(0, 100)) {
    const msg = db.prepare(`SELECT id, group_id, sender_id FROM messages WHERE id = ?`).get(msgId);
    if (!msg || msg.sender_id === req.user.id) continue;
    if (!isActiveGroupMember(msg.group_id, req.user.id)) continue;

    const existing = db.prepare(`
      SELECT delivered_at, read_at FROM message_receipts WHERE message_id = ? AND user_id = ?
    `).get(msgId, req.user.id);

    let changed = false;
    if (!existing) {
      db.prepare(`
        INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
        VALUES (?, ?, ?, ?)
      `).run(msgId, req.user.id, nowIso, type === 'read' ? nowIso : null);
      changed = true;
    } else if (type === 'read' && !existing.read_at) {
      db.prepare(`
        UPDATE message_receipts
        SET delivered_at = COALESCE(delivered_at, ?), read_at = ?
        WHERE message_id = ? AND user_id = ?
      `).run(nowIso, nowIso, msgId, req.user.id);
      changed = true;
    } else if (type === 'delivered' && !existing.delivered_at) {
      db.prepare(`
        UPDATE message_receipts SET delivered_at = ? WHERE message_id = ? AND user_id = ?
      `).run(nowIso, msgId, req.user.id);
      changed = true;
    }

    if (changed) {
      updatedCount++;
      touchedGroups.add(msg.group_id);
      const summary = computeMessageDeliverySummary(msg.id, msg.group_id, msg.sender_id);
      broadcastToGroup(msg.group_id, {
        type: 'MESSAGE_RECEIPT_UPDATED',
        messageId: msg.id,
        groupId: msg.group_id,
        deliveryStatus: summary.deliveryStatus,
        recipientCount: summary.recipientCount,
        deliveredCount: summary.deliveredCount,
        readCount: summary.readCount
      });
    }
  }

  // Si lecture confirmée dans une conversation, marquer la notification regroupée de message comme lue
  if (type === 'read') {
    for (const gid of touchedGroups) {
      db.prepare(`
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = ? AND group_id = ? AND type = 'NEW_MESSAGE' AND is_read = 0
      `).run(req.user.id, gid);
    }
  }

  res.json({ success: true, updatedCount });
});

/**
 * Vue « Infos du message » : état détaillé par destinataire (lu / livré / en attente)
 */
router.get('/messages/:messageId/info', requireAuth, (req, res) => {
  const msg = db.prepare(`
    SELECT m.id, m.group_id, m.sender_id, m.protocol, m.megolm_session_id, m.created_at,
           u.full_name AS sender_name, u.matricule AS sender_matricule
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(req.params.messageId);

  if (!msg) {
    return res.status(404).json({ error: 'MESSAGE_INTROUVABLE' });
  }
  if (!isActiveGroupMember(msg.group_id, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_MESSAGE_REFUSE' });
  }

  const recipients = db.prepare(`
    SELECT u.id AS userId, u.full_name AS fullName, u.matricule, u.role,
           u.service_ministry AS serviceMinistry,
           mr.delivered_at AS deliveredAt, mr.read_at AS readAt
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN message_receipts mr ON mr.message_id = ? AND mr.user_id = u.id
    WHERE gm.group_id = ? AND u.id != ? AND u.status = 'ACTIVE' AND u.is_revoked = 0
    ORDER BY mr.read_at DESC, mr.delivered_at DESC, u.full_name ASC
  `).all(msg.id, msg.group_id, msg.sender_id);

  const summary = computeMessageDeliverySummary(msg.id, msg.group_id, msg.sender_id);

  res.json({
    message: {
      id: msg.id,
      groupId: msg.group_id,
      senderId: msg.sender_id,
      senderName: msg.sender_name,
      senderMatricule: msg.sender_matricule,
      protocol: msg.protocol,
      megolmSessionId: msg.megolm_session_id,
      createdAt: msg.created_at,
      ...summary
    },
    recipients: recipients.map((r) => ({
      ...r,
      status: r.readAt ? 'read' : (r.deliveredAt ? 'delivered' : 'pending')
    }))
  });
});

/**
 * Téléversement d'une pièce jointe binaire chiffrée E2EE rattachée à une conversation
 * (Le nom réel, le type MIME réel et la clé AES-256-GCM restent dans le message Megolm !)
 */
router.post('/groups/:groupId/files', requireAuth, upload.single('encryptedFile'), (req, res) => {
  const { groupId } = req.params;
  if (!isActiveGroupMember(groupId, req.user.id)) {
    return res.status(403).json({ error: 'ENVOI_FICHIER_INTERDIT' });
  }
  if (!req.file || !req.file.buffer || req.file.size === 0) {
    return res.status(400).json({ error: 'FICHIER_CHIFFRE_MANQUANT' });
  }

  const fileId = 'file_' + crypto.randomUUID();
  const opaqueName = `blob_${crypto.randomUUID()}.enc`;
  const sha256Cipher = crypto.createHash('sha256').update(req.file.buffer).digest('base64');

  db.prepare(`
    INSERT INTO encrypted_files (
      id, message_id, group_id, uploader_id, encrypted_filename, mime_type, file_size, sha256_ciphertext, file_data
    ) VALUES (?, NULL, ?, ?, ?, 'application/octet-stream', ?, ?, ?)
  `).run(fileId, groupId, req.user.id, opaqueName, req.file.size, sha256Cipher, req.file.buffer);

  res.status(201).json({
    success: true,
    fileId,
    fileSize: req.file.size,
    sha256Ciphertext: sha256Cipher
  });
});

/**
 * Route rétrocompatible /api/files/upload avec contrôle strict d'appartenance au groupe du message
 */
router.post('/files/upload', requireAuth, upload.single('encryptedFile'), (req, res) => {
  const { messageId } = req.body || {};
  if (!req.file || !messageId) {
    return res.status(400).json({ error: 'FICHIER_CHIFFRE_OU_MESSAGE_ID_MANQUANT' });
  }

  const msg = db.prepare(`SELECT id, group_id, sender_id FROM messages WHERE id = ?`).get(messageId);
  if (!msg || msg.sender_id !== req.user.id || !isActiveGroupMember(msg.group_id, req.user.id)) {
    return res.status(403).json({ error: 'ACCES_MESSAGE_FICHIER_INTERDIT' });
  }

  const fileId = 'file_' + crypto.randomUUID();
  const opaqueName = `blob_${crypto.randomUUID()}.enc`;
  const sha256Cipher = crypto.createHash('sha256').update(req.file.buffer).digest('base64');

  db.prepare(`
    INSERT INTO encrypted_files (
      id, message_id, group_id, uploader_id, encrypted_filename, mime_type, file_size, sha256_ciphertext, file_data
    ) VALUES (?, ?, ?, ?, ?, 'application/octet-stream', ?, ?, ?)
  `).run(fileId, messageId, msg.group_id, req.user.id, opaqueName, req.file.size, sha256Cipher, req.file.buffer);

  res.json({
    success: true,
    fileId,
    fileSize: req.file.size,
    mimeType: 'application/octet-stream'
  });
});

/**
 * Téléchargement d'un blob chiffré : contrôle strict que le demandeur est membre actif de la conversation !
 */
router.get('/files/:fileId', requireAuth, (req, res) => {
  const file = db.prepare(`
    SELECT ef.*, COALESCE(ef.group_id, m.group_id) AS resolved_group_id
    FROM encrypted_files ef
    LEFT JOIN messages m ON m.id = ef.message_id
    WHERE ef.id = ?
  `).get(req.params.fileId);

  if (!file) {
    return res.status(404).json({ error: 'FICHIER_INTROUVABLE' });
  }

  if (!file.resolved_group_id || !isActiveGroupMember(file.resolved_group_id, req.user.id)) {
    logAuditEvent('UNAUTHORIZED_FILE_ACCESS', req.user.id, req.ip, `Tentative d'accès non autorisée au fichier ${file.id}`);
    return res.status(403).json({ error: 'ACCES_FICHIER_REFUSE_NON_MEMBRE' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${file.encrypted_filename}"`);
  res.send(Buffer.from(file.file_data));
});

module.exports = router;

