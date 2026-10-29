/**
 * FASOBRIEF - Routes de l'Annuaire Institutionnel (Organisations / Directions / Services / Agents)
 */

const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/directory', requireAuth, (req, res) => {
  const { q, orgId, directionId, serviceId, includeAllStatuses } = req.query;
  const canSeeStatuses = req.user.role === 'ADMIN' || req.user.role === 'DIRECTEUR';
  const showAll = canSeeStatuses && includeAllStatuses === '1';

  const organisations = db.prepare(`
    SELECT id, code, name FROM organisations ORDER BY code ASC
  `).all();

  const directions = db.prepare(`
    SELECT id, org_id AS orgId, code, name FROM directions ORDER BY code ASC
  `).all();

  const services = db.prepare(`
    SELECT s.id, s.direction_id AS directionId, d.org_id AS orgId,
           s.code, s.name,
           (SELECT COUNT(*) FROM users u WHERE u.service_id = s.id AND u.status = 'ACTIVE' AND u.is_revoked = 0) AS activeAgentCount
    FROM services s
    JOIN directions d ON d.id = s.direction_id
    ORDER BY s.name ASC
  `).all();

  const conditions = [`u.is_enrolled = 1`];
  const params = [];

  if (!showAll) {
    conditions.push(`u.status = 'ACTIVE'`, `u.is_revoked = 0`);
  }

  if (serviceId) {
    conditions.push(`u.service_id = ?`);
    params.push(serviceId);
  } else if (directionId) {
    conditions.push(`d.id = ?`);
    params.push(directionId);
  } else if (orgId) {
    conditions.push(`o.id = ?`);
    params.push(orgId);
  }

  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    conditions.push(`(u.full_name LIKE ? OR u.matricule LIKE ? OR u.job_title LIKE ? OR u.service_ministry LIKE ?)`);
    params.push(like, like, like, like);
  }

  const sql = `
    SELECT u.id, u.matricule, u.full_name AS fullName, u.role,
           u.job_title AS jobTitle, u.service_id AS serviceId, u.service_ministry AS serviceMinistry,
           ${canSeeStatuses ? `u.status, u.revocation_reason AS statusReason,` : `'ACTIVE' AS status,`}
           s.name AS serviceName, d.id AS directionId, d.name AS directionName,
           o.id AS orgId, o.code AS orgCode, o.name AS orgName
    FROM users u
    LEFT JOIN services s ON s.id = u.service_id
    LEFT JOIN directions d ON d.id = s.direction_id
    LEFT JOIN organisations o ON o.id = d.org_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY u.full_name ASC
  `;

  const agents = db.prepare(sql).all(...params);

  res.json({
    organisations,
    directions,
    services,
    agents
  });
});

module.exports = router;
