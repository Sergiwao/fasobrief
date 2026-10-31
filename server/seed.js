/**
 * FASOBRIEF - Données Fictives de Démonstration (Idempotentes)
 *
 * CONFORMITÉ RÉGLEMENTAIRE STRICTE :
 * - Données 100 % fictives (noms, identifiants, matricules, structures de démonstration).
 * - Exécution par défaut NON DESTRUCTIVE (INSERT OR IGNORE) : un redémarrage du
 *   serveur n'annule jamais une révocation, une suspension ou un compte créé.
 * - Réinitialisation explicite uniquement via `npm run reset-demo` (`--reset`).
 */

const bcrypt = require('bcryptjs');
const { db, initializeDatabase, resetAllTables } = require('./database');

const DEFAULT_PASSWORD = 'demo2026';
const DEMO_TOTP_SECRET = 'FASOBRIEFBURKINAFASODGTD234567AB';

const FICTIONAL_ORGS = [
  {
    id: 'org_mtdpce',
    code: 'MTDPCE',
    name: 'Ministère de la Transition Digitale, des Postes et des Communications Électroniques'
  },
  {
    id: 'org_anssi_fictif',
    code: 'ANSSI-DEMO',
    name: 'Agence Nationale de Sécurité des Systèmes d\'Information (Cellule Démo)'
  }
];

const FICTIONAL_DIRECTIONS = [
  {
    id: 'dir_sg',
    org_id: 'org_mtdpce',
    code: 'SG',
    name: 'Secrétariat Général'
  },
  {
    id: 'dir_dgtd',
    org_id: 'org_mtdpce',
    code: 'DGTD',
    name: 'Direction Générale de la Transition Digitale'
  },
  {
    id: 'dir_dssi',
    org_id: 'org_anssi_fictif',
    code: 'DSSI',
    name: 'Direction de la Sécurité des Systèmes d\'Information'
  }
];

const FICTIONAL_SERVICES = [
  {
    id: 'srv_cabinet_sg',
    direction_id: 'dir_sg',
    code: 'CAB',
    name: 'Cabinet'
  },
  {
    id: 'srv_demat',
    direction_id: 'dir_dgtd',
    code: 'ETUDES',
    name: 'Direction des études'
  }
];

const FICTIONAL_USERS = [
  {
    id: 'usr_admin_00',
    username: 'admin',
    matricule: 'FASO-ADM-00',
    full_name: 'Awa Compaoré',
    job_title: 'Administratrice système',
    service_id: null,
    service_ministry: 'Administration',
    role: 'ADMIN',
    password: DEFAULT_PASSWORD,
    totp_secret: 'JBSWY3DPEHPK3PXP234567ABCDEFGHJK'
  },
  {
    id: 'usr_dir_01',
    username: 'issa',
    matricule: 'FASO-DIR-01',
    full_name: 'Issa Ouédraogo',
    job_title: 'Directeur de cabinet',
    service_id: 'srv_cabinet_sg',
    service_ministry: 'Cabinet',
    role: 'DIRECTEUR',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET
  },
  {
    id: 'usr_chef_02',
    username: 'fatou',
    matricule: 'FASO-CHF-02',
    full_name: 'Fatou Zongo',
    job_title: 'Cheffe des études',
    service_id: 'srv_demat',
    service_ministry: 'Direction des études',
    role: 'CHEF_SERVICE',
    password: DEFAULT_PASSWORD,
    totp_secret: 'MZXW6YTBOI5HS2LTMFZW6YTSNRSGK3LP'
  },
  {
    id: 'usr_agent_03',
    username: 'paul',
    matricule: 'FASO-AGT-03',
    full_name: 'Paul Kaboré',
    job_title: 'Agent de liaison',
    service_id: 'srv_cabinet_sg',
    service_ministry: 'Cabinet',
    role: 'AGENT',
    password: DEFAULT_PASSWORD,
    totp_secret: 'KRSXG5CTMVRXEZLUKN2XAZLSNF2GS33O'
  },
  {
    id: 'usr_agent_04',
    username: 'mariam',
    matricule: 'FASO-AGT-04',
    full_name: 'Mariam Sawadogo',
    job_title: 'Chargée d\'études',
    service_id: 'srv_demat',
    service_ministry: 'Direction des études',
    role: 'AGENT',
    password: DEFAULT_PASSWORD,
    totp_secret: 'NBSWY3DPFQQFO33SNRSCC43VNZ2G643F'
  }
];

function seedDatabase(options = {}) {
  const forceReset = Boolean(options.forceReset);
  initializeDatabase();

  if (forceReset) {
    resetAllTables();
    console.log('[SEED] Réinitialisation complète de la base de démonstration...');
  }

  // 1. Organisations, Directions, Services (idempotent)
  const insertOrg = db.prepare(`INSERT OR IGNORE INTO organisations (id, code, name) VALUES (?, ?, ?)`);
  for (const o of FICTIONAL_ORGS) {
    insertOrg.run(o.id, o.code, o.name);
  }

  const insertDir = db.prepare(`INSERT OR IGNORE INTO directions (id, org_id, code, name) VALUES (?, ?, ?, ?)`);
  for (const d of FICTIONAL_DIRECTIONS) {
    insertDir.run(d.id, d.org_id, d.code, d.name);
  }

  const insertSrv = db.prepare(`INSERT OR IGNORE INTO services (id, direction_id, code, name) VALUES (?, ?, ?, ?)`);
  for (const s of FICTIONAL_SERVICES) {
    insertSrv.run(s.id, s.direction_id, s.code, s.name);
  }

  // 2. Utilisateurs fictifs (INSERT OR IGNORE : ne touche jamais aux statuts/révocations existants)
  const existingUsersCount = db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get().cnt;

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, matricule, username, full_name, service_id, service_ministry, job_title,
      role, status, password_hash, totp_secret, is_enrolled, is_revoked, activated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 1, 0, CURRENT_TIMESTAMP)
  `);

  for (const user of FICTIONAL_USERS) {
    const exists = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(user.id);
    if (!exists) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertUser.run(
        user.id,
        user.matricule,
        user.username,
        user.full_name,
        user.service_id,
        user.service_ministry,
        user.job_title,
        user.role,
        passwordHash,
        user.totp_secret
      );
    } else if (!exists.username) {
      db.prepare(`
        UPDATE users SET username = ? WHERE id = ?
      `).run(user.username, user.id);
    }
  }

  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)
  `);

  // 3. Canaux de service & groupe des chefs de service (idempotents)
  const grpCabinet = 'grp_service_cabinet_01';
  if (!db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grpCabinet)) {
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'service', ?, ?, ?, ?, ?, 1)
    `).run(
      grpCabinet,
      'Cabinet',
      'Canal interne chiffré du service Cabinet.',
      'srv_cabinet_sg',
      'Cabinet',
      'usr_dir_01'
    );
    insertMember.run(grpCabinet, 'usr_dir_01', 'OWNER');
    insertMember.run(grpCabinet, 'usr_agent_03', 'MEMBER');
  }

  const grpEtudes = 'grp_service_demat_02';
  if (!db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grpEtudes)) {
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'service', ?, ?, ?, ?, ?, 1)
    `).run(
      grpEtudes,
      'Direction des études',
      'Canal interne chiffré de la Direction des études.',
      'srv_demat',
      'Direction des études',
      'usr_chef_02'
    );
    insertMember.run(grpEtudes, 'usr_chef_02', 'OWNER');
    insertMember.run(grpEtudes, 'usr_agent_04', 'MEMBER');
  }

  const grpChefs = 'grp_comite_chefs_03';
  if (!db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grpChefs)) {
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'group', ?, ?, NULL, ?, ?, 1)
    `).run(
      grpChefs,
      'Comité des chefs de service',
      'Coordination inter-services des responsables et de l\'administration.',
      'Coordination des services',
      'usr_admin_00'
    );
    insertMember.run(grpChefs, 'usr_admin_00', 'OWNER');
    insertMember.run(grpChefs, 'usr_dir_01', 'ADMIN');
    insertMember.run(grpChefs, 'usr_chef_02', 'ADMIN');
  }

  // Périmètre technique inter-services de diffusion d'instructions (masqué de la liste de discussions courantes)
  const grpScope = 'grp_transition_digitale_01';
  if (!db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grpScope)) {
    db.prepare(`
      INSERT INTO groups (id, type, channel_kind, scope_key, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', 'instruction_scope', 'inst_scope:seed_default', ?, ?, 'srv_cabinet_sg', ?, ?, 1)
    `).run(
      grpScope,
      'Diffusion Instructions Inter-Services',
      'Périmètre cryptographique Megolm pour instructions multi-services.',
      'MTDPCE — Coordination',
      'usr_dir_01'
    );
    insertMember.run(grpScope, 'usr_dir_01', 'OWNER');
    insertMember.run(grpScope, 'usr_chef_02', 'ADMIN');
    insertMember.run(grpScope, 'usr_agent_03', 'MEMBER');
    insertMember.run(grpScope, 'usr_agent_04', 'MEMBER');
  }

  if (existingUsersCount === 0 || forceReset) {
    const hasInitAudit = db.prepare(`SELECT id FROM audit_logs LIMIT 1`).get();
    if (!hasInitAudit) {
      db.prepare(`
        INSERT INTO audit_logs (event_type, actor_id, ip_address, details)
        VALUES ('SYSTEM_INITIALIZED', 'usr_admin_00', '127.0.0.1', 'Plateforme FasoBrief initialisée')
      `).run();
    }
    console.log(`[SEED] Annuaire et ${FICTIONAL_USERS.length} comptes fictifs prêts.`);
  }
}

if (require.main === module) {
  const isReset = process.argv.includes('--reset');
  seedDatabase({ forceReset: isReset });
}

module.exports = {
  seedDatabase,
  FICTIONAL_ORGS,
  FICTIONAL_DIRECTIONS,
  FICTIONAL_SERVICES,
  FICTIONAL_USERS,
  DEFAULT_PASSWORD,
  DEMO_TOTP_SECRET
};
