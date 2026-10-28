/**
 * FASOBRIEF - Module de Base de Données Souveraine
 * Utilise le moteur natif node:sqlite (zéro dépendance externe C++, stockage local SQLite standard)
 * 
 * RÈGLE D'OR RÉGLEMENTAIRE :
 * Le serveur ne stocke AUCUN message ni fichier en clair.
 * Toutes les données sensibles sont des blobs chiffrés (ciphertexts, iv, tags).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'fasobrief.sqlite');
const db = new DatabaseSync(DB_PATH);

// Activer le mode WAL et les contraintes de clés étrangères
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

function initializeDatabase() {
  db.exec(`
    -- 1. Table des Utilisateurs Pré-enrôlés (Aucune auto-inscription publique)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      matricule TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      service_ministry TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE', 'AGENT')),
      password_hash TEXT NOT NULL,
      totp_secret TEXT NOT NULL,
      is_enrolled INTEGER DEFAULT 1,
      is_revoked INTEGER DEFAULT 0,
      revocation_reason TEXT,
      public_identity_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Table des Sessions Actives (Révocables instantanément)
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_info TEXT,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 3. Table des Clés Publiques Olm / One-Time Prekeys (Pour initialiser l'E2EE)
    CREATE TABLE IF NOT EXISTS prekeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      public_prekey TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 4. Table des Groupes de Service Officiels
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service_ministry TEXT NOT NULL,
      created_by TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- 5. Membres des Groupes
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 6. Table des Messages Chiffrés de Bout en Bout
    -- ATTENTION : Le serveur ne lit absolument rien en clair !
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,      -- Message chiffré par Megolm / Olm
      iv TEXT,                       -- Vecteur d'initialisation
      tag TEXT,                      -- Tag d'authentification MAC
      ephemeral_key TEXT,            -- Clé publique éphémère de session
      message_type TEXT NOT NULL,    -- 'CHAT', 'INSTRUCTION', 'ACK', 'FILE'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    -- 7. Table des Pièces Jointes Chiffrées (E2EE Files)
    -- Le contenu du fichier est chiffré par le client avec AES-256-GCM avant upload
    CREATE TABLE IF NOT EXISTS encrypted_files (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      encrypted_filename TEXT NOT NULL, -- Nom chiffré ou hashé
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_data BLOB NOT NULL,          -- BLOB binaire strictement chiffré
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    -- 8. Table des Instructions Administratives FasoBrief
    CREATE TABLE IF NOT EXISTS instructions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      instruction_ref TEXT NOT NULL,     -- Référence administrative (ex. INST-2026-004)
      title_ciphertext TEXT NOT NULL,    -- Titre chiffré
      deadline DATETIME,                 -- Échéance facultative
      creator_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK(status IN ('EN_ATTENTE', 'PARTIEL', 'TRAITE', 'CLOTURE')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    -- 9. Table des Accusés de Prise de Connaissance (Signatures)
    CREATE TABLE IF NOT EXISTS acknowledgements (
      id TEXT PRIMARY KEY,
      instruction_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PRIS_CONNAISSANCE',
      signature_proof TEXT NOT NULL,     -- Preuve cryptographique signée par la clé privée de l'agent
      acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(instruction_id, user_id),
      FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 10. Table d'Audit de Sécurité (Journalisation immuable des événements critiques)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,          -- LOGIN_SUCCESS, LOGIN_FAILED, INTRUSION_ATTEMPT, REVOCATION, 2FA_VERIFIED
      actor_id TEXT,
      ip_address TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = {
  db,
  initializeDatabase,
  DB_PATH
};
