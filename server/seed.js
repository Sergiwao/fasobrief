/**
 * FASOBRIEF - Script de Données Fictives de Démonstration (Seed)
 * 
 * CONFORMITÉ RÈGLEMENTAIRE STRICTE :
 * - Aucune donnée personnelle réelle
 * - Tous les comptes, noms, téléphones et matricules sont 100% fictifs
 * - Les clés TOTP sont prédéfinies pour faciliter le test instantané par le jury
 */

const bcrypt = require('bcryptjs');
const { db, initializeDatabase } = require('./database');

const DEFAULT_PASSWORD = 'FasoSecurite2026!';
// Secret TOTP standard Base32 pour la démo (Générateur compatible Google Authenticator / FreeOTP / otplib)
const DEMO_TOTP_SECRET = 'FASOBRIEFBURKINAFASODGTD234567AB';

const FICTIONAL_USERS = [
  {
    id: 'usr_admin_00',
    matricule: 'FASO-ADM-00',
    full_name: 'Ousmane Traoré (Admin)',
    service_ministry: 'MTDPCE - Direction Sécurité des SI',
    role: 'ADMIN',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET,
    is_enrolled: 1,
    is_revoked: 0
  },
  {
    id: 'usr_dir_01',
    matricule: 'FASO-DIR-01',
    full_name: 'Dr. Salif Ouédraogo (Directeur)',
    service_ministry: 'MTDPCE - Secrétariat Général',
    role: 'DIRECTEUR',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET,
    is_enrolled: 1,
    is_revoked: 0
  },
  {
    id: 'usr_chef_02',
    matricule: 'FASO-CHF-02',
    full_name: 'Aminata Sawadogo (Chef de Service)',
    service_ministry: 'DGTD - Direction Transformation Digitale',
    role: 'CHEF_SERVICE',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET,
    is_enrolled: 1,
    is_revoked: 0
  },
  {
    id: 'usr_agent_03',
    matricule: 'FASO-AGT-03',
    full_name: 'Ibrahim Kaboré (Agent)',
    service_ministry: 'DGTD - Division Projets Souverains',
    role: 'AGENT',
    password: DEFAULT_PASSWORD,
    totp_secret: DEMO_TOTP_SECRET,
    is_enrolled: 1,
    is_revoked: 0
  }
];

function seedDatabase() {
  initializeDatabase();
  console.log('[SEED] Initialisation des comptes fictifs de démonstration...');

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (
      id, matricule, full_name, service_ministry, role, password_hash, totp_secret, is_enrolled, is_revoked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of FICTIONAL_USERS) {
    const passwordHash = bcrypt.hashSync(user.password, 10);
    insertUser.run(
      user.id,
      user.matricule,
      user.full_name,
      user.service_ministry,
      user.role,
      passwordHash,
      user.totp_secret,
      user.is_enrolled,
      user.is_revoked
    );
  }

  // Création du Groupe Administratif Fictif de Démonstration
  const groupId = 'grp_transition_digitale_01';
  db.prepare(`
    INSERT OR REPLACE INTO groups (id, name, service_ministry, created_by, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    groupId,
    'Cabinet & Direction Générale MTDPCE',
    'Ministère de la Transition Digitale',
    'usr_dir_01'
  );

  // Ajout des membres au groupe
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)
  `);

  insertMember.run(groupId, 'usr_dir_01');
  insertMember.run(groupId, 'usr_chef_02');
  insertMember.run(groupId, 'usr_agent_03');

  console.log('[SEED] Base de données initialisée avec succès avec 4 comptes fictifs et 1 groupe.');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  FICTIONAL_USERS,
  DEFAULT_PASSWORD,
  DEMO_TOTP_SECRET
};
