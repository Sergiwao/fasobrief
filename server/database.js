/**
 * FASOBRIEF - Module de Base de Données Souveraine (SQLite natif Node.js 24)
 *
 * RÈGLE D'OR RÉGLEMENTAIRE :
 * - Le serveur ne stocke AUCUN message, titre/description d'instruction ni fichier en clair.
 * - Aucune clé privée cryptographique n'est stockée sur le serveur.
 * - Migrations versionnées via la table schema_version.
 * - Isolation complète des tests via la variable d'environnement DATABASE_PATH.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'fasobrief.sqlite');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);
db.exec(`PRAGMA busy_timeout = 5000;`);

const TARGET_SCHEMA_VERSION = 4;

function hasColumn(tableName, columnName) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return cols.some((c) => c.name === columnName);
}

function addColumnIfMissing(tableName, columnName, columnDef) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
  }
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 1. Annuaire institutionnel : Organisations -> Directions -> Services
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS directions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(org_id, code),
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      direction_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(direction_id, code),
      FOREIGN KEY (direction_id) REFERENCES directions(id) ON DELETE CASCADE
    );

    -- 2. Utilisateurs pré-enrôlés (Cycle : INVITED -> ACTIVE <-> SUSPENDED -> REVOKED)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      matricule TEXT UNIQUE NOT NULL,
      username TEXT,
      full_name TEXT NOT NULL,
      service_id TEXT,
      service_ministry TEXT NOT NULL,
      job_title TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'DIRECTEUR', 'CHEF_SERVICE', 'AGENT')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
      password_hash TEXT NOT NULL DEFAULT '',
      totp_secret TEXT NOT NULL DEFAULT '',
      is_enrolled INTEGER DEFAULT 1,
      is_revoked INTEGER DEFAULT 0,
      revocation_reason TEXT,
      public_identity_key TEXT,
      invited_by TEXT,
      activated_at DATETIME,
      revoked_at DATETIME,
      notif_browser_enabled INTEGER DEFAULT 0,
      notif_muted_groups TEXT DEFAULT '[]',
      avatar_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
    );

    -- 3. Invitations d'activation à usage unique (code 128 bits stocké haché SHA-256)
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      pending_totp_secret TEXT,
      used_at DATETIME,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- 4. Sessions actives (révocables immédiatement)
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      device_info TEXT,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 5. Terminaux & clés publiques Olm (Curve25519 + Ed25519 + One-Time Prekeys)
    CREATE TABLE IF NOT EXISTS user_devices (
      device_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_label TEXT DEFAULT 'Terminal Web',
      curve25519_key TEXT NOT NULL,
      ed25519_key TEXT NOT NULL,
      fallback_key_id TEXT,
      fallback_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prekeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      key_id TEXT NOT NULL,
      public_prekey TEXT NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 6. Enveloppes Olm 1:1 chiffrées pour l'échange de clés de session Megolm (m.room_key)
    CREATE TABLE IF NOT EXISTS to_device_messages (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL,
      recipient_device_id TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_device_id TEXT NOT NULL,
      sender_curve25519 TEXT NOT NULL,
      sender_ed25519 TEXT,
      olm_type INTEGER NOT NULL,
      olm_body TEXT NOT NULL,
      group_id TEXT,
      megolm_session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_device_id) REFERENCES user_devices(device_id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id)
    );

    -- 7. Demandes de partage de clé Megolm par un terminal nouvellement activé d'un membre légitime
    CREATE TABLE IF NOT EXISTS key_requests (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      megolm_session_id TEXT NOT NULL,
      requester_user_id TEXT NOT NULL,
      requester_device_id TEXT NOT NULL,
      fulfilled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, megolm_session_id, requester_device_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_device_id) REFERENCES user_devices(device_id) ON DELETE CASCADE
    );

    -- 8. Conversations individuelles (DIRECT) et Groupes de service (GROUP)
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'GROUP' CHECK(type IN ('DIRECT', 'GROUP')),
      channel_kind TEXT NOT NULL DEFAULT 'group',
      scope_key TEXT,
      direct_pair_key TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      service_id TEXT,
      service_ministry TEXT NOT NULL,
      created_by TEXT NOT NULL,
      key_epoch INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK(member_role IN ('OWNER', 'ADMIN', 'MEMBER')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 9. Messages chiffrés de bout en bout (Megolm)
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_device_id TEXT,
      client_msg_id TEXT,
      protocol TEXT NOT NULL DEFAULT 'megolm.v1',
      megolm_session_id TEXT,
      ciphertext TEXT NOT NULL,
      sender_ed25519 TEXT,
      signature TEXT,
      iv TEXT,
      tag TEXT,
      ephemeral_key TEXT,
      message_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sender_id, client_msg_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    -- 10. Accusés réels de livraison (delivered) et de lecture (read) par destinataire
    CREATE TABLE IF NOT EXISTS message_receipts (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      delivered_at DATETIME,
      read_at DATETIME,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 11. Pièces jointes binaires chiffrées côté client (AES-256-GCM, clé transmise dans Megolm)
    CREATE TABLE IF NOT EXISTS encrypted_files (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      group_id TEXT,
      uploader_id TEXT,
      encrypted_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL,
      sha256_ciphertext TEXT,
      file_data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    -- 12. Instructions administratives structurées FasoBrief
    CREATE TABLE IF NOT EXISTS instructions (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      instruction_ref TEXT UNIQUE NOT NULL,
      title_ciphertext TEXT NOT NULL,
      megolm_session_id TEXT,
      sender_ed25519 TEXT,
      signature TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL DEFAULT 'NORMALE' CHECK(priority IN ('NORMALE', 'HAUTE', 'URGENTE')),
      deadline DATETIME,
      creator_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLIEE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    -- 13. Suivi nominatif par destinataire (transmise / consultée / confirmée / en cours / exécutée)
    CREATE TABLE IF NOT EXISTS instruction_recipients (
      instruction_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      assigned_version INTEGER NOT NULL DEFAULT 1,
      transmitted_at DATETIME,
      viewed_at DATETIME,
      acknowledged_at DATETIME,
      ack_version INTEGER,
      signature_proof TEXT,
      signer_ed25519 TEXT,
      in_progress_at DATETIME,
      executed_at DATETIME,
      execution_ciphertext TEXT,
      execution_session_id TEXT,
      PRIMARY KEY (instruction_id, user_id),
      FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table historique conservée pour rétrocompatibilité et audit direct
    CREATE TABLE IF NOT EXISTS acknowledgements (
      id TEXT PRIMARY KEY,
      instruction_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PRIS_CONNAISSANCE',
      signature_proof TEXT NOT NULL,
      signer_ed25519 TEXT,
      acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(instruction_id, user_id, version),
      FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 14. Historique immuable des événements et versions d'une instruction
    CREATE TABLE IF NOT EXISTS instruction_events (
      id TEXT PRIMARY KEY,
      instruction_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      actor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      meta_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );

    -- 15. Notifications internes persistées (strictement sans contenu confidentiel)
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      dedup_key TEXT,
      group_id TEXT,
      instruction_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 16. Journal d'audit immuable de sécurité
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      target_id TEXT,
      ip_address TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations non destructives si une base v1 existe déjà sur le disque
  const currentVersionRow = db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get();
  const currentVersion = (currentVersionRow && currentVersionRow.v) || 0;

  if (currentVersion < TARGET_SCHEMA_VERSION) {
    // Migration colonnes users
    addColumnIfMissing('users', 'username', 'TEXT');
    addColumnIfMissing('users', 'service_id', 'TEXT');
    addColumnIfMissing('users', 'job_title', "TEXT DEFAULT ''");
    addColumnIfMissing('users', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
    addColumnIfMissing('users', 'invited_by', 'TEXT');
    addColumnIfMissing('users', 'activated_at', 'DATETIME');
    addColumnIfMissing('users', 'revoked_at', 'DATETIME');
    addColumnIfMissing('users', 'notif_browser_enabled', 'INTEGER DEFAULT 0');
    addColumnIfMissing('users', 'notif_muted_groups', "TEXT DEFAULT '[]'");

    // Synchroniser status avec is_revoked existant
    db.exec(`UPDATE users SET status = 'REVOKED' WHERE is_revoked = 1 AND status = 'ACTIVE';`);

    // Migration colonnes sessions
    addColumnIfMissing('sessions', 'device_id', 'TEXT');
    addColumnIfMissing('sessions', 'last_seen_at', 'DATETIME');

    // Migration colonnes prekeys
    addColumnIfMissing('prekeys', 'device_id', 'TEXT');

    // Migration colonnes groups & group_members
    addColumnIfMissing('groups', 'type', "TEXT NOT NULL DEFAULT 'GROUP'");
    addColumnIfMissing('groups', 'channel_kind', "TEXT NOT NULL DEFAULT 'group'");
    addColumnIfMissing('groups', 'scope_key', 'TEXT');
    addColumnIfMissing('groups', 'direct_pair_key', 'TEXT');
    addColumnIfMissing('groups', 'description', "TEXT DEFAULT ''");
    addColumnIfMissing('groups', 'service_id', 'TEXT');
    addColumnIfMissing('groups', 'key_epoch', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing('group_members', 'member_role', "TEXT NOT NULL DEFAULT 'MEMBER'");
    addColumnIfMissing('users', 'avatar_data', 'TEXT');

    // Migration colonnes messages
    addColumnIfMissing('messages', 'sender_device_id', 'TEXT');
    addColumnIfMissing('messages', 'client_msg_id', 'TEXT');
    addColumnIfMissing('messages', 'protocol', "TEXT NOT NULL DEFAULT 'megolm.v1'");
    addColumnIfMissing('messages', 'megolm_session_id', 'TEXT');
    addColumnIfMissing('messages', 'sender_ed25519', 'TEXT');
    addColumnIfMissing('messages', 'signature', 'TEXT');

    // Migration colonnes encrypted_files
    addColumnIfMissing('encrypted_files', 'group_id', 'TEXT');
    addColumnIfMissing('encrypted_files', 'uploader_id', 'TEXT');
    addColumnIfMissing('encrypted_files', 'sha256_ciphertext', 'TEXT');

    // Migration colonnes instructions (si ancienne contrainte CHECK sur status dans v1, recréer proprement si vide ou migrer)
    migrateInstructionsTableIfLegacy();

    addColumnIfMissing('acknowledgements', 'version', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing('acknowledgements', 'signer_ed25519', 'TEXT');
    addColumnIfMissing('audit_logs', 'target_id', 'TEXT');

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username)) WHERE username IS NOT NULL AND username != '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_scope_key ON groups(scope_key) WHERE scope_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_messages_group_created ON messages(group_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_to_device_recipient ON to_device_messages(recipient_user_id, recipient_device_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inst_recipients_user ON instruction_recipients(user_id);
    `);

    db.prepare(`INSERT OR REPLACE INTO schema_version (version) VALUES (?)`).run(TARGET_SCHEMA_VERSION);
  }
}

function migrateInstructionsTableIfLegacy() {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instructions'`).get();
  if (!row || !row.sql) return;

  // La v1 avait CHECK(status IN ('EN_ATTENTE', 'PARTIEL', 'TRAITE', 'CLOTURE')) et message_id NOT NULL
  if (row.sql.includes("'EN_ATTENTE'") || !hasColumn('instructions', 'version')) {
    db.exec(`PRAGMA foreign_keys = OFF;`);
    try {
      db.exec(`
        CREATE TABLE instructions_v2 (
          id TEXT PRIMARY KEY,
          message_id TEXT,
          instruction_ref TEXT UNIQUE NOT NULL,
          title_ciphertext TEXT NOT NULL,
          megolm_session_id TEXT,
          sender_ed25519 TEXT,
          signature TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          priority TEXT NOT NULL DEFAULT 'NORMALE' CHECK(priority IN ('NORMALE', 'HAUTE', 'URGENTE')),
          deadline DATETIME,
          creator_id TEXT NOT NULL,
          group_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PUBLIEE',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          published_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
          FOREIGN KEY (creator_id) REFERENCES users(id),
          FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        );

        INSERT INTO instructions_v2 (
          id, message_id, instruction_ref, title_ciphertext, deadline, creator_id, group_id,
          status, created_at, published_at, updated_at
        )
        SELECT
          id, message_id, instruction_ref, title_ciphertext, deadline, creator_id, group_id,
          CASE WHEN status = 'CLOTURE' THEN 'CLOTUREE' ELSE 'PUBLIEE' END,
          created_at, created_at, created_at
        FROM instructions;

        DROP TABLE instructions;
        ALTER TABLE instructions_v2 RENAME TO instructions;
      `);
    } finally {
      db.exec(`PRAGMA foreign_keys = ON;`);
    }
  }
}

function resetAllTables() {
  db.exec(`PRAGMA foreign_keys = OFF;`);
  const tables = [
    'notifications',
    'instruction_events',
    'instruction_recipients',
    'acknowledgements',
    'instructions',
    'encrypted_files',
    'message_receipts',
    'messages',
    'key_requests',
    'to_device_messages',
    'prekeys',
    'user_devices',
    'group_members',
    'groups',
    'sessions',
    'invitations',
    'users',
    'services',
    'directions',
    'organisations',
    'audit_logs'
  ];
  for (const t of tables) {
    db.exec(`DELETE FROM ${t};`);
  }
  db.exec(`PRAGMA foreign_keys = ON;`);
}

module.exports = {
  db,
  initializeDatabase,
  resetAllTables,
  DB_PATH
};
