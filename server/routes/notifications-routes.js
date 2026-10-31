/**
 * FASOBRIEF - Routes des Notifications Internes Persistées
 */

const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');
const { getUnreadCount, checkUpcomingInstructionDeadlines } = require('../notifications-service');

const router = express.Router();

router.get('/notifications', requireAuth, (req, res) => {
  checkUpcomingInstructionDeadlines();

  const notifications = db.prepare(`
    SELECT id, type, group_id AS groupId, instruction_id AS instructionId,
           title, body, count, is_read AS isRead, created_at AS createdAt, updated_at AS updatedAt
    FROM notifications
    WHERE user_id = ?
    ORDER BY is_read ASC, updated_at DESC
    LIMIT 60
  `).all(req.user.id);

  res.json({
    notifications: notifications.map((n) => ({ ...n, isRead: Boolean(n.isRead) })),
    unreadCount: getUnreadCount(req.user.id)
  });
});

router.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);

  res.json({
    success: true,
    unreadCount: getUnreadCount(req.user.id)
  });
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0
  `).run(req.user.id);

  res.json({
    success: true,
    unreadCount: 0
  });
});

module.exports = router;

