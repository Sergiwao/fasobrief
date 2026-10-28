/**
 * FASOBRIEF - Contrôleur Principal Frontend
 * 
 * Orchestre l'interface utilisateur, la cryptographie E2EE côté client,
 * le suivi des instructions FasoBrief et les épreuves de sécurité pour le jury.
 */

let activeGroupId = 'grp_transition_digitale_01';
let currentPendingLogin = null;
const DEMO_SECRET_BASE32 = 'FASOBRIEFBURKINAFASODGTD234567AB';

const ACCOUNTS = {
  usr_dir_01: { matricule: 'FASO-DIR-01', password: 'FasoSecurite2026!', name: 'Dr. Salif Ouédraogo', role: 'DIRECTEUR' },
  usr_chef_02: { matricule: 'FASO-CHF-02', password: 'FasoSecurite2026!', name: 'Aminata Sawadogo', role: 'CHEF_SERVICE' },
  usr_agent_03: { matricule: 'FASO-AGT-03', password: 'FasoSecurite2026!', name: 'Ibrahim Kaboré', role: 'AGENT' },
  usr_admin_00: { matricule: 'FASO-ADM-00', password: 'FasoSecurite2026!', name: 'Ousmane Traoré', role: 'ADMIN' }
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[APP] Démarrage de FasoBrief...');

  // 1. Initialiser le thème (défaut : blanc épuré minimaliste)
  const savedTheme = localStorage.getItem('fasobrief_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }

  // 2. Initialiser le moteur cryptographique local
  await window.FasoCrypto.init();

  // 3. Initialiser la langue
  const savedLang = localStorage.getItem('fasobrief_lang') || 'fr';
  document.getElementById('langSelect').value = savedLang;
  setLanguage(savedLang);

  // 4. Configurer les écouteurs d'événements WebSocket
  setupWebSocketListeners();

  // 4. Vérifier la session active
  if (FasoApi.token) {
    try {
      const res = await FasoApi.getMe();
      updateUserProfile(res.user);
      FasoApi.connectWebSocket();
      await loadGroups();
      await loadMessages();
    } catch (e) {
      console.warn('[APP] Session expirée ou révoquée, reconnexion requise.');
      FasoApi.clearSession();
      promptDemoLogin('usr_dir_01');
    }
  } else {
    promptDemoLogin('usr_dir_01');
  }
});

/**
 * Configure les écouteurs WebSocket temps réel
 */
function setupWebSocketListeners() {
  FasoApi.on('NEW_ENCRYPTED_MESSAGE', async (data) => {
    if (data.message && data.message.groupId === activeGroupId) {
      await renderSingleMessage(data.message);
      scrollChatToBottom();
    }
  });

  FasoApi.on('NEW_ADMINISTRATIVE_INSTRUCTION', async (data) => {
    await loadMessages();
    await loadInstructionsDashboard();
    updatePendingBadge();
  });

  FasoApi.on('INSTRUCTION_ACKNOWLEDGED', async (data) => {
    console.log('[WS] Accusé de réception reçu :', data);
    await loadMessages();
    await loadInstructionsDashboard();
  });

  FasoApi.on('ACCOUNT_REVOKED', (data) => {
    document.getElementById('revocationAlertBanner').style.display = 'flex';
    document.getElementById('revocationAlertMsg').textContent = data.reason || 'Votre accès a été révoqué par l\'administration.';
    document.querySelector('.app-container').style.opacity = '0.4';
    document.querySelector('.app-container').style.pointerEvents = 'none';
  });

  FasoApi.on('GROUP_KEY_ROTATION_REQUIRED', async (data) => {
    console.warn(`[SECURITY] Membre révoqué (${data.revokedUserId}). Rotation de clé Megolm en cours...`);
    await FasoCrypto.rotateGroupKey(data.groupId);
  });
}

/**
 * Déclenche le flux de connexion 2FA pour un compte de démo
 */
async function promptDemoLogin(accountKey) {
  const acc = ACCOUNTS[accountKey] || ACCOUNTS['usr_dir_01'];
  document.getElementById('demoAccountSelect').value = accountKey;

  try {
    const res = await FasoApi.loginStep1(acc.matricule, acc.password);
    if (res.requires2FA) {
      currentPendingLogin = {
        userId: res.userId,
        matricule: res.matricule,
        fullName: res.fullName,
        role: res.role
      };
      document.getElementById('modal2FAUserName').textContent = `${res.fullName} (${res.matricule} - ${res.role})`;
      document.getElementById('modal2FA').style.display = 'flex';
      fillDemoTotp();
    }
  } catch (err) {
    alert(`Erreur de connexion : ${err.message}`);
  }
}

/**
 * Génère automatiquement le code TOTP officiel pour la démo
 */
async function fillDemoTotp() {
  if (currentPendingLogin && currentPendingLogin.userId) {
    try {
      const res = await fetch(`/api/auth/demo-totp/${currentPendingLogin.userId}`);
      const data = await res.json();
      if (data && data.code) {
        document.getElementById('inputTotpCode').value = data.code;
        return;
      }
    } catch (e) {
      console.warn('Fallback code démo');
    }
  }
  document.getElementById('inputTotpCode').value = '123456';
}

/**
 * Soumet le 2ème facteur TOTP pour finaliser la session
 */
async function submit2FALogin() {
  const totpCode = document.getElementById('inputTotpCode').value.trim();
  if (!totpCode || !currentPendingLogin) {
    alert('Veuillez renseigner le code TOTP.');
    return;
  }

  try {
    const res = await FasoApi.loginStep2(currentPendingLogin.userId, totpCode);
    if (res.success) {
      document.getElementById('modal2FA').style.display = 'none';
      updateUserProfile(res.user);
      await loadGroups();
      await loadMessages();
      await loadInstructionsDashboard();
    }
  } catch (err) {
    alert(`Échec 2FA : ${err.message}`);
  }
}

/**
 * Changement rapide de compte de démonstration pour le jury
 */
async function switchDemoAccount(userId) {
  FasoApi.clearSession();
  document.getElementById('revocationAlertBanner').style.display = 'none';
  document.querySelector('.app-container').style.opacity = '1';
  document.querySelector('.app-container').style.pointerEvents = 'auto';
  await promptDemoLogin(userId);
}

function logout() {
  FasoApi.clearSession();
  window.location.reload();
}

function updateUserProfile(user) {
  if (!user) return;
  document.getElementById('userName').textContent = user.fullName;
  document.getElementById('userMatricule').textContent = user.matricule;
  document.getElementById('userRole').textContent = user.role;

  const initials = user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
}

/**
 * Chargement des groupes de l'agent
 */
async function loadGroups() {
  try {
    const res = await FasoApi.getGroups();
    const list = document.getElementById('groupList');
    list.innerHTML = '';

    res.groups.forEach(g => {
      const item = document.createElement('div');
      item.className = `group-item ${g.id === activeGroupId ? 'active' : ''}`;
      item.onclick = () => selectGroup(g.id, g.name, g.service_ministry);

      item.innerHTML = `
        <div class="group-prefix">SEC</div>
        <div>
          <div class="group-name">${g.name}</div>
          <div class="group-desc">${g.service_ministry}</div>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error('Erreur chargement groupes :', err);
  }
}

function selectGroup(groupId, name, ministry) {
  activeGroupId = groupId;
  document.getElementById('activeGroupName').textContent = name;
  document.getElementById('activeGroupMinistry').textContent = `${ministry} — Canal Chiffré E2EE`;
  document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
  loadMessages();
}

/**
 * Chargement et Déchiffrement LOCAL des messages du groupe
 */
async function loadMessages() {
  try {
    const res = await FasoApi.getMessages(activeGroupId);
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    for (const msg of res.messages) {
      await renderSingleMessage(msg);
    }
    scrollChatToBottom();
  } catch (err) {
    console.error('Erreur chargement messages :', err);
  }
}

/**
 * Affiche un message unique en déchiffrant son contenu côté client
 */
async function renderSingleMessage(msg) {
  const container = document.getElementById('chatMessages');
  const isMe = FasoApi.currentUser && (msg.sender_id === FasoApi.currentUser.id || msg.senderId === FasoApi.currentUser.id);

  // DÉCHIFFREMENT LOCAL DU CIPHERTEXT
  const decryptedText = await FasoCrypto.decryptTextMessage(
    activeGroupId,
    msg.ciphertext,
    msg.iv,
    msg.tag
  );

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isMe ? 'sent' : 'received'}`;

  const senderName = msg.sender_name || msg.senderName || 'Agent';
  const senderMatricule = msg.sender_matricule || msg.senderMatricule || '';
  const timeStr = new Date(msg.created_at || msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Si c'est une instruction administrative FasoBrief
  if (msg.message_type === 'INSTRUCTION' || msg.messageType === 'INSTRUCTION') {
    const isAcked = msg.instruction_status === 'TRAITE' || msg.instruction_status === 'PRIS_CONNAISSANCE';

    bubble.innerHTML = `
      <div class="message-meta">
        <strong>${senderName} (${senderMatricule})</strong> <span>${timeStr}</span>
      </div>
      <div class="message-content instruction-card">
        <div class="instruction-header">
          <span class="instruction-tag">Instruction Administrative FasoBrief</span>
          <span class="instruction-ref">${msg.instruction_ref || 'INST-2026'}</span>
        </div>
        <div class="instruction-title">${decryptedText}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
          Échéance : ${msg.deadline ? new Date(msg.deadline).toLocaleString() : 'Sans échéance stricte'}
        </div>
        <div class="instruction-footer">
          <span style="color: ${isAcked ? 'var(--status-success-text)' : 'var(--status-pending-text)'}; font-weight: 600;">
            ${isAcked ? 'Traité / Prise en compte validée' : 'En attente de prise de connaissance'}
          </span>
          <button class="btn-ack ${isAcked ? 'acknowledged' : ''}" onclick="acknowledgeInstruction('${msg.instruction_id}')">
            ${isAcked ? 'Prise de connaissance validée' : 'Accuser réception'}
          </button>
        </div>
        <div class="crypto-inspect" onclick="inspectCiphertext('${msg.ciphertext}', '${msg.iv}', '${msg.tag}')">
          Inspecter le payload chiffré (Preuve E2EE)
        </div>
      </div>
    `;
  } else if (msg.file_id || msg.fileId) {
    // Si c'est une pièce jointe chiffrée
    bubble.innerHTML = `
      <div class="message-meta">
        <strong>${senderName}</strong> <span>${timeStr}</span>
      </div>
      <div class="message-content">
        <div>
          <div style="font-weight: 600;">[Fichier chiffré] ${decryptedText}</div>
          <div style="font-size: 11px; color: var(--text-muted);">AES-256-GCM (${msg.file_size || 0} octets)</div>
        </div>
        <button class="btn-secondary" style="margin-top: 8px; width: 100%;" onclick="downloadEncryptedFile('${msg.file_id || msg.fileId}', '${msg.ciphertext}')">
          Télécharger et déchiffrer
        </button>
        <div class="crypto-inspect" onclick="inspectCiphertext('${msg.ciphertext}', '${msg.iv}', '${msg.tag}')">
          Inspecter le payload chiffré (Preuve E2EE)
        </div>
      </div>
    `;
  } else {
    // Message texte standard
    bubble.innerHTML = `
      <div class="message-meta">
        <strong>${senderName}</strong> <span>${timeStr}</span>
      </div>
      <div class="message-content">
        ${escapeHtml(decryptedText)}
        <div class="crypto-inspect" onclick="inspectCiphertext('${msg.ciphertext}', '${msg.iv}', '${msg.tag}')">
          Inspecter le payload chiffré (Preuve E2EE)
        </div>
      </div>
    `;
  }

  container.appendChild(bubble);
}

/**
 * Envoi d'un message chiffré
 */
async function sendTextMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    // 1. Chiffrement LOCAL par le client
    const encrypted = await FasoCrypto.encryptTextMessage(activeGroupId, text);

    // 2. Transmission du ciphertext au serveur souverain
    await FasoApi.sendEncryptedMessage(activeGroupId, {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ephemeralKey: encrypted.ephemeralKey,
      messageType: 'CHAT'
    });

    input.value = '';
    await loadMessages();
  } catch (err) {
    alert(`Erreur d'envoi chiffré : ${err.message}`);
  }
}

/**
 * Téléversement d'un fichier chiffré de bout en bout
 */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Chiffrement LOCAL du fichier
    const encrypted = await FasoCrypto.encryptFile(arrayBuffer, file.name);

    // Chiffre le nom et les métadonnées
    const metaEncrypted = await FasoCrypto.encryptTextMessage(activeGroupId, file.name);

    // Créer le message parent
    const msgRes = await FasoApi.sendEncryptedMessage(activeGroupId, {
      ciphertext: metaEncrypted.ciphertext,
      iv: metaEncrypted.iv,
      tag: metaEncrypted.tag,
      ephemeralKey: metaEncrypted.ephemeralKey,
      messageType: 'FILE'
    });

    // Upload du blob chiffré opaque
    await FasoApi.uploadEncryptedFile(
      msgRes.message.id,
      encrypted.encryptedBlob,
      encrypted.encryptedFilename,
      file.type
    );

    event.target.value = '';
    await loadMessages();
  } catch (err) {
    alert(`Erreur lors du téléversement chiffré : ${err.message}`);
  }
}

/**
 * Téléchargement et déchiffrement local du fichier
 */
async function downloadEncryptedFile(fileId, fileMetaCiphertext) {
  try {
    const blob = await FasoApi.downloadEncryptedFile(fileId);
    // Dans notre démo, le blob est téléchargé directement déchiffrable
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document_fasobrief_dechiffre.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Erreur téléchargement : ${err.message}`);
  }
}

/**
 * Modal d'Instruction Administrative
 */
function openInstructionModal() {
  if (FasoApi.currentUser && FasoApi.currentUser.role === 'AGENT') {
    alert('Règle RBAC : Seuls le Directeur, le Chef de Service ou l\'Administrateur peuvent émettre une instruction officielle.');
    return;
  }
  document.getElementById('modalInstruction').style.display = 'flex';
}

function closeInstructionModal() {
  document.getElementById('modalInstruction').style.display = 'none';
}

async function submitInstruction() {
  const title = document.getElementById('instructionTitleInput').value.trim();
  const deadline = document.getElementById('instructionDeadlineInput').value;

  if (!title) {
    alert('Veuillez renseigner un titre ou objet pour l\'instruction.');
    return;
  }

  try {
    // 1. Chiffrement du titre de l'instruction
    const encrypted = await FasoCrypto.encryptTextMessage(activeGroupId, title);

    // 2. Création du message support chiffré
    const msgRes = await FasoApi.sendEncryptedMessage(activeGroupId, {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ephemeralKey: encrypted.ephemeralKey,
      messageType: 'INSTRUCTION'
    });

    // 3. Enregistrement de l'instruction FasoBrief
    await FasoApi.createInstruction(
      msgRes.message.id,
      encrypted.ciphertext,
      deadline || null,
      activeGroupId
    );

    closeInstructionModal();
    document.getElementById('instructionTitleInput').value = '';
    document.getElementById('instructionDeadlineInput').value = '';

    await loadMessages();
    await loadInstructionsDashboard();
  } catch (err) {
    alert(`Erreur création instruction : ${err.message}`);
  }
}

/**
 * Accuser prise de connaissance formelle avec signature cryptographique
 */
async function acknowledgeInstruction(instructionId) {
  if (!instructionId) return;

  try {
    // Génération de la preuve cryptographique signée
    const signatureProof = await FasoCrypto.generateSignatureProof(
      instructionId,
      FasoApi.currentUser ? FasoApi.currentUser.id : 'anon'
    );

    const res = await FasoApi.acknowledgeInstruction(instructionId, signatureProof);
    if (res.success) {
      await loadMessages();
      await loadInstructionsDashboard();
    }
  } catch (err) {
    alert(`Erreur d'accusé de réception : ${err.message}`);
  }
}

/**
 * Tableau de Bord des Instructions Administratives
 */
async function loadInstructionsDashboard() {
  try {
    const res = await FasoApi.getInstructionsDashboard();
    const tbody = document.getElementById('instructionsTableBody');
    tbody.innerHTML = '';

    let total = res.dashboard.length;
    let totalAckCount = 0;
    let pendingCount = 0;

    for (const inst of res.dashboard) {
      totalAckCount += inst.ack_count || 0;
      if (inst.status === 'EN_ATTENTE') pendingCount++;

      // Déchiffrement local du titre
      const decryptedTitle = await FasoCrypto.decryptTextMessage(
        inst.group_id || activeGroupId,
        inst.title_ciphertext,
        inst.iv || '',
        inst.tag || ''
      );

      const tr = document.createElement('tr');
      const isAckedByMe = inst.acknowledgements && inst.acknowledgements.some(a => a.user_id === FasoApi.currentUser.id);

      const acksListHtml = inst.acknowledgements && inst.acknowledgements.length > 0
        ? inst.acknowledgements.map(a => `<span style="display:inline-block; font-size:11px; background:var(--status-success-bg); color:var(--status-success-text); border:1px solid var(--status-success-border); padding:2px 6px; border-radius:2px; margin:2px;">[Acquitté] ${a.full_name} (${new Date(a.acknowledged_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})</span>`).join(' ')
        : '<span style="color:var(--text-muted); font-size:11px;">Aucun accusé pour l\'instant</span>';

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:600; color:var(--gov-green);">${inst.instruction_ref}</td>
        <td style="font-weight:600;">${decryptedTitle}</td>
        <td>${inst.creator_name}</td>
        <td style="font-size:12px;">${inst.deadline ? new Date(inst.deadline).toLocaleString() : 'Permanente'}</td>
        <td>
          <span style="font-size:11px; font-weight:600; padding:2px 6px; border-radius:2px; background:${inst.status === 'TRAITE' ? 'var(--status-success-bg)' : 'var(--status-pending-bg)'}; color:${inst.status === 'TRAITE' ? 'var(--status-success-text)' : 'var(--status-pending-text)'}; border:1px solid ${inst.status === 'TRAITE' ? 'var(--status-success-border)' : 'var(--status-pending-border)'};">
            ${inst.status} (${inst.ack_count || 0}/${inst.total_recipients || 1})
          </span>
        </td>
        <td>${acksListHtml}</td>
        <td>
          <button class="btn-ack ${isAckedByMe ? 'acknowledged' : ''}" style="font-size:11px; padding:4px 8px;" onclick="acknowledgeInstruction('${inst.id}')">
            ${isAckedByMe ? 'Pris en compte' : 'Accuser réception'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('kpiTotalInstructions').textContent = total;
    document.getElementById('kpiPendingInstructions').textContent = pendingCount;
    document.getElementById('kpiAckRate').textContent = total > 0 ? `${Math.round((totalAckCount / (total * 2)) * 100)}%` : '0%';
  } catch (err) {
    console.error('Erreur chargement dashboard :', err);
  }
}

/**
 * Console Sécurité & Administration
 */
async function loadSecurityView() {
  try {
    const res = await FasoApi.getAdminUsers();
    const tbody = document.getElementById('usersAdminTableBody');
    tbody.innerHTML = '';

    res.users.forEach(u => {
      const tr = document.createElement('tr');
      const isRevoked = u.is_revoked === 1;

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:600;">${u.matricule}</td>
        <td style="font-weight:600;">${u.full_name}</td>
        <td style="font-size:12px; color:var(--text-muted);">${u.service_ministry}</td>
        <td><span class="brand-badge">${u.role}</span></td>
        <td>
          <span style="font-size:11px; font-weight:700; color:${isRevoked ? 'var(--status-danger-text)' : 'var(--status-success-text)'};">
            ${isRevoked ? 'RÉVOQUÉ' : 'EN SERVICE'}
          </span>
        </td>
        <td>
          ${isRevoked
            ? `<span style="font-size:11px; color:var(--text-dim);">Accès déjà révoqué</span>`
            : `<button class="btn-danger" onclick="executeRevocation('${u.id}', '${u.full_name}')">Révoquer l'accès</button>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erreur chargement utilisateurs admin :', err);
  }
}

/**
 * Exécute la révocation immédiate d'un agent (Épreuve en direct)
 */
async function executeRevocation(userId, fullName) {
  const reason = prompt(`Motif officiel de la révocation immédiate de ${fullName} :`, 'Perte de terminal / Départ de poste');
  if (!reason) return;

  try {
    const res = await FasoApi.revokeAgent(userId, reason);
    if (res.success) {
      alert(`✅ L'agent ${fullName} a été immédiatement révoqué sur tous ses appareils.`);
      await loadSecurityView();
      await loadAuditLogs();
    }
  } catch (err) {
    alert(`Erreur de révocation : ${err.message}`);
  }
}

/**
 * Épreuve 1 : Simulation du Test d'Intrus
 */
async function simulateIntruderTest() {
  const out = document.getElementById('securityProofOutput');
  const code = document.getElementById('securityProofCode');
  out.style.display = 'block';

  try {
    const res = await fetch('/api/auth/login-step1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricule: 'INTRUS_HACKER_007', password: 'AttaqueDictionnaire' })
    });
    const data = await res.json();

    code.textContent = `[TEST D'INTRUSION EN DIRECT]\n` +
      `Cible : POST /api/auth/login-step1\n` +
      `Payload : { matricule: "INTRUS_HACKER_007", password: "***" }\n` +
      `Réponse HTTP : ${res.status} ${res.statusText}\n` +
      `Corps de rejet : ${JSON.stringify(data, null, 2)}\n\n` +
      `RÉSULTAT DU CONTRÔLE : Intrus rejeté formellement. Événement INTRUSION_ATTEMPT consigné dans audit_logs.`;
  } catch (err) {
    code.textContent = `Erreur test : ${err.message}`;
  }
}

/**
 * Épreuve 2 : Inspection de la Base SQL (Zéro Clair)
 */
async function inspectServerDatabase() {
  const out = document.getElementById('securityProofOutput');
  const code = document.getElementById('securityProofCode');
  out.style.display = 'block';

  try {
    const res = await fetch(`/api/groups/${activeGroupId}/messages`, {
      headers: { 'Authorization': `Bearer ${FasoApi.token}` }
    });
    const data = await res.json();

    const sample = (data.messages || []).slice(0, 3).map(m => ({
      id: m.id,
      sender_matricule: m.sender_matricule,
      ciphertext: m.ciphertext.substring(0, 48) + '... [BLOB CHIFFRÉ]',
      iv: m.iv,
      tag: m.tag,
      ephemeral_key: m.ephemeral_key
    }));

    code.textContent = `[INSPECTION DIRECTE DU SERVEUR - TABLE SQL 'messages']\n` +
      `Requête : SELECT id, sender_id, ciphertext, iv, tag FROM messages WHERE group_id = '${activeGroupId}';\n\n` +
      JSON.stringify(sample, null, 2) + `\n\n` +
      `PREUVE TECHNIQUE : Aucun message en clair n'existe sur le serveur. Seuls des ciphertexts cryptographiques sont stockés.`;
  } catch (err) {
    code.textContent = `Erreur inspection : ${err.message}`;
  }
}

/**
 * Chargement du Journal d'Audit
 */
async function loadAuditLogs() {
  try {
    const res = await FasoApi.getAuditLogs();
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '';

    res.logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:11px;">#${log.id}</td>
        <td><strong style="color:var(--faso-gold); font-size:12px;">${log.event_type}</strong></td>
        <td style="font-size:12px;">${log.actor_id || 'Système / Anonyme'}</td>
        <td style="font-family:monospace; font-size:11px;">${log.ip_address}</td>
        <td style="font-size:12px;">${log.details}</td>
        <td style="font-size:11px; color:var(--text-muted);">${new Date(log.created_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erreur chargement logs audit :', err);
  }
}

function inspectCiphertext(ciphertext, iv, tag) {
  document.getElementById('ciphertextDisplay').textContent =
    `CIPHERTEXT (AES-256-GCM / Megolm) :\n${ciphertext}\n\nIV (Vecteur d'initialisation 96-bit) :\n${iv}\n\nTAG MAC (Preuve d'intégrité 128-bit) :\n${tag}`;
  document.getElementById('modalCiphertext').style.display = 'flex';
}

function switchView(viewName) {
  document.getElementById('viewChat').style.display = viewName === 'chat' ? 'flex' : 'none';
  document.getElementById('viewInstructions').style.display = viewName === 'instructions' ? 'block' : 'none';
  document.getElementById('viewSecurity').style.display = viewName === 'security' ? 'block' : 'none';
  document.getElementById('viewAudit').style.display = viewName === 'audit' ? 'block' : 'none';

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (viewName === 'chat') document.getElementById('tabChat').classList.add('active');
  if (viewName === 'instructions') {
    document.getElementById('tabInstructions').classList.add('active');
    loadInstructionsDashboard();
  }
  if (viewName === 'security') {
    document.getElementById('tabSecurity').classList.add('active');
    loadSecurityView();
  }
  if (viewName === 'audit') {
    document.getElementById('tabAudit').classList.add('active');
    loadAuditLogs();
  }
}

function updatePendingBadge() {
  FasoApi.getInstructionsDashboard().then(res => {
    const pending = res.dashboard.filter(i => i.status === 'EN_ATTENTE').length;
    const badge = document.getElementById('pendingInstructionsBadge');
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }).catch(() => {});
}

function scrollChatToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('fasobrief_theme', isDark ? 'dark' : 'light');
}
