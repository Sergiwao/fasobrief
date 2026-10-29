/**
 * FASOBRIEF - Données Fictives de Démonstration (Idempotentes)
 *
 * CONFORMITÉ RÉGLEMENTAIRE STRICTE :
 * - Données 100 % fictives (noms, matricules, structures de démonstration).
 * - Exécution par défaut NON DESTRUCTIVE (INSERT OR IGNORE) : un redémarrage du
 *   serveur n'annule jamais une révocation, une suspension ou un compte créé.
 * - Réinitialisation explicite uniquement via `npm run reset-demo` (`--reset`).
 */

const bcrypt = require('bcryptjs');
const { db, initializeDatabase, resetAllTables } = require('./database');

const DEFAULT_PASSWORD = 'FasoSecurite2026!';
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
    name: 'Agence Nationale de Sécurité des Systèmes d\'Information ( Cellule Démo )'
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
    code: 'CAB-SG',
    name: 'Coordination Administrative du Secrétariat Général'
  },
  {
    id: 'srv_demat',
    direction_id: 'dir_dgtd',
    code: 'SRV-DEMAT',
    name: 'Service Dématérialisation des Procédures'
  },
  {
    id: 'srv_projets',
    direction_id: 'dir_dgtd',
    code: 'SRV-PROJ',
    name: 'Division Projets Souverains et Interopérabilité'
  },
  {
    id: 'srv_soc',
    direction_id: 'dir_dssi',
    code: 'SRV-SOC',
    name: 'Service Administration des Identités et Chiffrement'
  }
];

const FICTIONAL_USERS = [
  {
    id: 'usr_admin_00',
    matricule: 'FASO-ADM-00',
    full_name: 'Ousmane Traoré',
    job_title: 'Administrateur Sécurité Plateforme',
    service_id: 'srv_soc',
    service_ministry: 'ANSSI-DEMO — Service Administration des Identités et Chiffrement',
    role: 'ADMIN',
    password: DEFAULT_PASSWORD,
    totp_secret: 'JBSWY3DPEHPK3PXP234567ABCDEFGHJK'
  },
  {
    id: 'usr_dir_01',
    matricule: 'FASO-DIR-01',
    full_name: 'Dr. Salif Ouédraogo',
    job_title: 'Directeur Coordonnateur',
    service_id: 'srv_cabinet_sg',
    service_ministry: 'MTDPCE — Coordination Administrative du Secrétariat Général',
    role: 'DIRECTEUR',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET
  },
  {
    id: 'usr_chef_02',
    matricule: 'FASO-CHF-02',
    full_name: 'Aminata Sawadogo',
    job_title: 'Cheffe du Service Dématérialisation',
    service_id: 'srv_demat',
    service_ministry: 'MTDPCE — Service Dématérialisation des Procédures',
    role: 'CHEF_SERVICE',
    password: DEFAULT_PASSWORD,
    totp_secret: 'MZXW6YTBOI5HS2LTMFZW6YTSNRSGK3LP'
  },
  {
    id: 'usr_agent_03',
    matricule: 'FASO-AGT-03',
    full_name: 'Ibrahim Kaboré',
    job_title: 'Chargé d\'Études Projets Souverains',
    service_id: 'srv_projets',
    service_ministry: 'MTDPCE — Division Projets Souverains et Interopérabilité',
    role: 'AGENT',
    password: DEFAULT_PASSWORD,
    totp_secret: 'KRSXG5CTMVRXEZLUKN2XAZLSNF2GS33O'
  },
  {
    id: 'usr_agent_04',
    matricule: 'FASO-AGT-04',
    full_name: 'Mariam Compaoré',
    job_title: 'Analyste Procédures Numériques',
    service_id: 'srv_demat',
    service_ministry: 'MTDPCE — Service Dématérialisation des Procédures',
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
      id, matricule, full_name, service_id, service_ministry, job_title,
      role, status, password_hash, totp_secret, is_enrolled, is_revoked, activated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 1, 0, CURRENT_TIMESTAMP)
  `);

  for (const user of FICTIONAL_USERS) {
    const exists = db.prepare(`SELECT id, service_id FROM users WHERE id = ?`).get(user.id);
    if (!exists) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertUser.run(
        user.id,
        user.matricule,
        user.full_name,
        user.service_id,
        user.service_ministry,
        user.job_title,
        user.role,
        passwordHash,
        user.totp_secret
      );
    } else if (!exists.service_id) {
      // Rattachement non destructif d'une base v1 migrée
      db.prepare(`
        UPDATE users SET service_id = ?, job_title = ?, full_name = ? WHERE id = ?
      `).run(user.service_id, user.job_title, user.full_name, user.id);
    }
  }

  // 3. Groupes institutionnels initiaux (créés uniquement s'ils n'existent pas encore)
  const grp1 = 'grp_transition_digitale_01';
  const hasGrp1 = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grp1);
  if (!hasGrp1) {
    db.prepare(`
      INSERT INTO groups (id, type, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', ?, ?, ?, ?, ?, 1)
    `).run(
      grp1,
      'Coordination Générale MTDPCE',
      'Canal inter-services de coordination et de diffusion des instructions officielles.',
      'srv_cabinet_sg',
      'MTDPCE — Secrétariat Général & DGTD',
      'usr_dir_01'
    );

    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)
    `);
    insertMember.run(grp1, 'usr_dir_01', 'OWNER');
    insertMember.run(grp1, 'usr_chef_02', 'ADMIN');
    insertMember.run(grp1, 'usr_agent_03', 'MEMBER');
    insertMember.run(grp1, 'usr_agent_04', 'MEMBER');
  }

  const grp2 = 'grp_service_demat_02';
  const hasGrp2 = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(grp2);
  if (!hasGrp2) {
    db.prepare(`
      INSERT INTO groups (id, type, name, description, service_id, service_ministry, created_by, is_active)
      VALUES (?, 'GROUP', ?, ?, ?, ?, ?, 1)
    `).run(
      grp2,
      'Cellule Dématérialisation DGTD',
      'Échanges opérationnels internes du Service Dématérialisation des Procédures.',
      'srv_demat',
      'DGTD — Service Dématérialisation',
      'usr_chef_02'
    );

    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, member_role) VALUES (?, ?, ?)
    `);
    insertMember.run(grp2, 'usr_chef_02', 'OWNER');
    insertMember.run(grp2, 'usr_agent_04', 'MEMBER');
    insertMember.run(grp2, 'usr_dir_01', 'MEMBER');
  }

  if (existingUsersCount === 0 || forceReset) {
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
