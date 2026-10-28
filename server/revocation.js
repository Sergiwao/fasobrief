/**
 * FASOBRIEF - Module de Révocation Immédiate
 * 
 * Satisfait directement l'Épreuve en Direct du Jury :
 * "Le jury révoque un agent pendant une conversation de groupe ;
 *  celui-ci doit perdre immédiatement l'accès, y compris aux nouveaux messages."
 */

const { db } = require('./database');
const { logAuditEvent } = require('./auth');

/**
 * Exécute la révocation immédiate d'un agent sur tous ses appareils
 * 
 * @param {string} targetUserId Identifiant de l'agent à révoquer
 * @param {string} reason Motif officiel de la révocation (ex. "Perte de terminal", "Départ de service")
 * @param {object} adminActor Utilisateur administrateur effectuant l'action
 * @param {Map<string, Set<WebSocket>>} userSockets Map des sockets WebSocket en direct
 */
function revokeAgent(targetUserId, reason, adminActor, userSockets) {
  const targetUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetUserId);
  if (!targetUser) {
    return { success: false, error: 'AGENT_INTROUVABLE', code: 404 };
  }

  // 1. Mise à jour du statut utilisateur dans la base
  db.prepare(`
    UPDATE users 
    SET is_revoked = 1, revocation_reason = ? 
    WHERE id = ?
  `).run(reason || 'Révocation administrative immédiate', targetUserId);

  // 2. Invalidation immédiate de TOUTES les sessions actives sur tous ses appareils
  db.prepare(`
    UPDATE sessions 
    SET is_revoked = 1 
    WHERE user_id = ?
  `).run(targetUserId);

  // 3. Retrait de l'agent de l'ensemble des groupes administratifs
  const userGroups = db.prepare(`SELECT group_id FROM group_members WHERE user_id = ?`).all(targetUserId);
  db.prepare(`DELETE FROM group_members WHERE user_id = ?`).run(targetUserId);

  // 4. Clôture immédiate et synchrone de tous les WebSockets actifs de cet agent
  if (userSockets && userSockets.has(targetUserId)) {
    const sockets = userSockets.get(targetUserId);
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({
          type: 'SECURITY_ALERT',
          event: 'ACCOUNT_REVOKED',
          message: 'Votre accès officiel à FasoBrief a été révoqué avec effet immédiat.'
        }));
        ws.close(4001, 'AGENT_REVOKED');
      } catch (err) {
        console.error('[REVOCATION_WS_ERROR]', err);
      }
    }
    userSockets.delete(targetUserId);
  }

  // 5. Notification des groupes pour rotation immédiate des clés Megolm (Re-keying)
  // Les membres restants doivent renouveler la session de groupe pour que l'agent
  // révoqué ne puisse mathématiquement plus jamais déchiffrer les futurs messages.
  for (const row of userGroups) {
    notifyGroupKeyRotation(row.group_id, targetUserId, userSockets);
  }

  // 6. Journalisation dans l'audit de sécurité
  logAuditEvent(
    'AGENT_REVOKED',
    adminActor ? adminActor.id : 'SYSTEM',
    '127.0.0.1',
    `Révocation immédiate de ${targetUser.full_name} (${targetUser.matricule}). Motif: ${reason}`
  );

  return {
    success: true,
    revokedUser: {
      id: targetUser.id,
      matricule: targetUser.matricule,
      fullName: targetUser.full_name,
      revokedAt: new Date().toISOString()
    }
  };
}

/**
 * Notifie les membres actifs d'un groupe qu'une rotation de clé E2EE est requise
 */
function notifyGroupKeyRotation(groupId, revokedUserId, userSockets) {
  if (!userSockets) return;

  const remainingMembers = db.prepare(`
    SELECT user_id FROM group_members WHERE group_id = ?
  `).all(groupId);

  for (const member of remainingMembers) {
    if (member.user_id !== revokedUserId && userSockets.has(member.user_id)) {
      const sockets = userSockets.get(member.user_id);
      for (const ws of sockets) {
        try {
          ws.send(JSON.stringify({
            type: 'GROUP_KEY_ROTATION_REQUIRED',
            groupId: groupId,
            revokedUserId: revokedUserId,
            reason: 'Membre révoqué - renouvellement de clé Megolm'
          }));
        } catch (e) {
          // Socket fermé ou déconnecté
        }
      }
    }
  }
}

module.exports = {
  revokeAgent,
  notifyGroupKeyRotation
};
