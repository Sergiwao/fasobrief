/**
 * FASOBRIEF - Contrôleur Principal Frontend Mobile-First & WhatsApp Style
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
  document.body.classList.add('view-chat');

  // 1. Animation d'entrée : masque le splash screen après 1.2s
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.style.display = 'none', 500);
    }
  }, 1200);

  // 2. Thème (Clair par défaut)
  const savedTheme = localStorage.getItem('fasobrief_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }

  // 3. Moteur cryptographique local
  await window.FasoCrypto.init();

  // 4. Langue
  const savedLang = localStorage.getItem('fasobrief_lang') || 'fr';
  document.getElementById('langSelect').value = savedLang;
  setLanguage(savedLang);

  // 5. Écouteurs WebSocket
  setupWebSocketListeners();

  // 6. Session active
  if (FasoApi.token) {
    try {
      const res = await FasoApi.getMe();
      updateUserProfile(res.user);
      FasoApi.connectWebSocket();
      await loadGroups();
      await loadMessages();
    } catch (e) {
      console.warn('[APP] Reconnexion requise.');
      FasoApi.clearSession();
      promptDemoLogin('usr_dir_01');
    }
  } else {
    promptDemoLogin('usr_dir_01');
  }
});

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
  });

  FasoApi.on('INSTRUCTION_ACKNOWLEDGED', async (data) => {
    await loadMessages();
    await loadInstructionsDashboard();
  });

  FasoApi.on('ACCOUNT_REVOKED', (data) => {
    document.getElementById('revocationAlertBanner').style.display = 'flex';
    document.getElementById('revocationAlertMsg').textContent = data.reason || 'Votre accès a été révoqué par l\'administration.';
    document.querySelector('.app-container').style.opacity = '0.3';
    document.querySelector('.app-container').style.pointerEvents = 'none';
  });

  FasoApi.on('GROUP_KEY_ROTATION_REQUIRED', async (data) => {
    await FasoCrypto.rotateGroupKey(data.groupId);
  });
}

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
      document.getElementById('modal2FAUserName').textContent = `${res.fullName} (${res.matricule} • ${res.role})`;
      document.getElementById('modal2FA').style.display = 'flex';
      fillDemoTotp();
    }
  } catch (err) {
    alert(`Erreur de connexion : ${err.message}`);
  }
}

async function fillDemoTotp() {
  if (currentPendingLogin && currentPendingLogin.userId) {
    try {
      const res = await fetch(`/api/auth/demo-totp/${currentPendingLogin.userId}`);
      const data = await res.json();
      if (data && data.code) {
        document.getElementById('inputTotpCode').value = data.code;
        return;
      }
    } catch (e) {}
  }
  document.getElementById('inputTotpCode').value = '123456';
}

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
  document.getElementById('userMatricule').textContent = `${user.matricule} • ${user.role}`;

  const initials = user.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
}

/**
 * Chargement des groupes
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
        <div class="group-avatar">
          <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        </div>
        <div class="group-info">
          <div class="group-top">
            <span class="group-name">${g.name}</span>
            <span class="group-time">12:30</span>
          </div>
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
  document.getElementById('activeGroupMinistry').textContent = `${ministry} • Canal sécurisé`;
  document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));

  // Sur mobile : ouvrir la vue de conversation plein écran
  document.body.classList.add('mobile-chat-open');
  loadMessages();
}

function closeMobileChat() {
  document.body.classList.remove('mobile-chat-open');
}

/**
 * Déchiffrement et affichage des messages
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

async function renderSingleMessage(msg) {
  const container = document.getElementById('chatMessages');
  const isMe = FasoApi.currentUser && (msg.sender_id === FasoApi.currentUser.id || msg.senderId === FasoApi.currentUser.id);

  // Déchiffrement local transparent
  const decryptedText = await FasoCrypto.decryptTextMessage(
    activeGroupId,
    msg.ciphertext,
    msg.iv,
    msg.tag
  );

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isMe ? 'sent' : 'received'}`;

  const senderName = msg.sender_name || msg.senderName || 'Agent';
  const timeStr = new Date(msg.created_at || msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Checkmark WhatsApp SVG (double check)
  const checkSvg = `<svg style="width:14px;height:14px;fill:#53bdeb;vertical-align:middle;" viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.41 11.93l-1.41 1.41 5.66 5.66 12-12-1.42-1.41zM.41 13.34l5.66 5.66 1.41-1.41L1.83 11.93.41 13.34z"/></svg>`;

  if (msg.message_type === 'INSTRUCTION' || msg.messageType === 'INSTRUCTION') {
    const isAcked = msg.instruction_status === 'TRAITE' || msg.instruction_status === 'PRIS_CONNAISSANCE';

    bubble.innerHTML = `
      <div class="message-card instruction-mode">
        <div class="inst-badge-row">
          <span class="inst-pill">Instruction officielle</span>
          <span class="inst-ref">${msg.instruction_ref || 'INST-2026'}</span>
        </div>
        <div class="inst-title">${decryptedText}</div>
        <div class="inst-deadline">
          Échéance : ${msg.deadline ? new Date(msg.deadline).toLocaleString() : 'Sans délai strict'}
        </div>
        <div class="inst-action-row">
          <span style="font-size:11.5px; font-weight:600; color:${isAcked ? 'var(--status-success)' : 'var(--status-pending)'}">
            ${isAcked ? 'Prise de connaissance validée' : 'En attente de signature'}
          </span>
          <button class="btn-ack-clean ${isAcked ? 'done' : ''}" onclick="acknowledgeInstruction('${msg.instruction_id}')">
            ${isAcked ? 'Acquitté' : 'Accuser réception'}
          </button>
        </div>
        <span class="message-time">${timeStr} ${isMe ? checkSvg : ''}</span>
      </div>
    `;
  } else if (msg.file_id || msg.fileId) {
    bubble.innerHTML = `
      <div class="message-card">
        ${!isMe ? `<div class="message-sender">${senderName}</div>` : ''}
        <div style="font-weight:600; margin-bottom: 4px;">Document : ${decryptedText}</div>
        <div style="font-size:11px; color:var(--text-secondary); margin-bottom: 6px;">Pièce jointe sécurisée (${msg.file_size || 0} octets)</div>
        <button class="btn-secondary" style="width:100%; font-size:12px;" onclick="downloadEncryptedFile('${msg.file_id || msg.fileId}', '${msg.ciphertext}')">
          Télécharger le document
        </button>
        <span class="message-time">${timeStr} ${isMe ? checkSvg : ''}</span>
      </div>
    `;
  } else {
    bubble.innerHTML = `
      <div class="message-card">
        ${!isMe ? `<div class="message-sender">${senderName}</div>` : ''}
        <span>${escapeHtml(decryptedText)}</span>
        <span class="message-time">${timeStr} ${isMe ? checkSvg : ''}</span>
      </div>
    `;
  }

  container.appendChild(bubble);
}

async function sendTextMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    const encrypted = await FasoCrypto.encryptTextMessage(activeGroupId, text);
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
    alert(`Erreur d'envoi : ${err.message}`);
  }
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const encrypted = await FasoCrypto.encryptFile(arrayBuffer, file.name);
    const metaEncrypted = await FasoCrypto.encryptTextMessage(activeGroupId, file.name);

    const msgRes = await FasoApi.sendEncryptedMessage(activeGroupId, {
      ciphertext: metaEncrypted.ciphertext,
      iv: metaEncrypted.iv,
      tag: metaEncrypted.tag,
      ephemeralKey: metaEncrypted.ephemeralKey,
      messageType: 'FILE'
    });

    await FasoApi.uploadEncryptedFile(
      msgRes.message.id,
      encrypted.encryptedBlob,
      encrypted.encryptedFilename,
      file.type
    );

    event.target.value = '';
    await loadMessages();
  } catch (err) {
    alert(`Erreur téléversement : ${err.message}`);
  }
}

async function downloadEncryptedFile(fileId, fileMetaCiphertext) {
  try {
    const blob = await FasoApi.downloadEncryptedFile(fileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document_officiel_fasobrief.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Erreur téléchargement : ${err.message}`);
  }
}

function openInstructionModal() {
  if (FasoApi.currentUser && FasoApi.currentUser.role === 'AGENT') {
    alert('Règle hiérarchique : Seuls les Directeurs et Chefs de Service émettent des instructions.');
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
    alert('Veuillez renseigner un objet pour l\'instruction.');
    return;
  }

  try {
    const encrypted = await FasoCrypto.encryptTextMessage(activeGroupId, title);
    const msgRes = await FasoApi.sendEncryptedMessage(activeGroupId, {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ephemeralKey: encrypted.ephemeralKey,
      messageType: 'INSTRUCTION'
    });

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
    alert(`Erreur création : ${err.message}`);
  }
}

async function acknowledgeInstruction(instructionId) {
  if (!instructionId) return;

  try {
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
    alert(`Erreur accusé : ${err.message}`);
  }
}

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

      const decryptedTitle = await FasoCrypto.decryptTextMessage(
        inst.group_id || activeGroupId,
        inst.title_ciphertext,
        inst.iv || '',
        inst.tag || ''
      );

      const tr = document.createElement('tr');
      const isAckedByMe = inst.acknowledgements && inst.acknowledgements.some(a => a.user_id === FasoApi.currentUser.id);

      const acksListHtml = inst.acknowledgements && inst.acknowledgements.length > 0
        ? inst.acknowledgements.map(a => `<span style="display:inline-block; font-size:11px; background:var(--status-success-bg); color:var(--status-success); padding:2px 6px; border-radius:4px; margin:2px;">${a.full_name} (${new Date(a.acknowledged_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})</span>`).join(' ')
        : '<span style="color:var(--text-secondary); font-size:11px;">En attente</span>';

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:600; color:var(--wa-green);">${inst.instruction_ref}</td>
        <td style="font-weight:600;">${decryptedTitle}</td>
        <td>${inst.creator_name}</td>
        <td style="font-size:12px;">${inst.deadline ? new Date(inst.deadline).toLocaleString() : 'Permanente'}</td>
        <td>
          <span style="font-size:11px; font-weight:600; padding:3px 8px; border-radius:4px; background:${inst.status === 'TRAITE' ? 'var(--status-success-bg)' : 'var(--status-pending-bg)'}; color:${inst.status === 'TRAITE' ? 'var(--status-success)' : 'var(--status-pending)'}">
            ${inst.status} (${inst.ack_count || 0}/${inst.total_recipients || 1})
          </span>
        </td>
        <td>${acksListHtml}</td>
        <td>
          <button class="btn-ack-clean ${isAckedByMe ? 'done' : ''}" style="font-size:11px; padding:4px 8px;" onclick="acknowledgeInstruction('${inst.id}')">
            ${isAckedByMe ? 'Acquitté' : 'Accuser réception'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('kpiTotalInstructions').textContent = total;
    document.getElementById('kpiPendingInstructions').textContent = pendingCount;
    document.getElementById('kpiAckRate').textContent = total > 0 ? `${Math.round((totalAckCount / (total * 2)) * 100)}%` : '0%';
  } catch (err) {
    console.error('Erreur dashboard :', err);
  }
}

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
        <td><span class="inst-pill">${u.role}</span></td>
        <td>
          <span style="font-size:11px; font-weight:700; color:${isRevoked ? 'var(--status-danger)' : 'var(--status-success)'};">
            ${isRevoked ? 'RÉVOQUÉ' : 'ACTIF'}
          </span>
        </td>
        <td>
          ${isRevoked
            ? `<span style="font-size:11px; color:var(--text-secondary);">Accès révoqué</span>`
            : `<button class="btn-danger" onclick="executeRevocation('${u.id}', '${u.full_name}')">Révoquer</button>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erreur sécurité :', err);
  }
}

async function executeRevocation(userId, fullName) {
  const reason = prompt(`Motif officiel de révocation de ${fullName} :`, 'Départ de poste / Perte de terminal');
  if (!reason) return;

  try {
    const res = await FasoApi.revokeAgent(userId, reason);
    if (res.success) {
      alert(`L'agent ${fullName} a été immédiatement révoqué.`);
      await loadSecurityView();
      await loadAuditLogs();
    }
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

async function simulateIntruderTest() {
  const out = document.getElementById('securityProofOutput');
  const code = document.getElementById('securityProofCode');
  out.style.display = 'block';

  try {
    const res = await fetch('/api/auth/login-step1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricule: 'INTRUS_HACKER_007', password: '***' })
    });
    const data = await res.json();
    code.textContent = `[RÉPONSE DU CONTRÔLE D'INTRUSION]\nStatut HTTP : ${res.status} Rejeté\nMessage : ${JSON.stringify(data, null, 2)}\n\nÉvénement consigné dans le journal d'audit officiel.`;
  } catch (err) {
    code.textContent = `Erreur : ${err.message}`;
  }
}

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
      sender: m.sender_matricule,
      ciphertext: m.ciphertext.substring(0, 42) + '... [CHIFFRÉ]',
      iv: m.iv,
      tag: m.tag
    }));
    code.textContent = `[DONNÉES BRUTES SUR LE SERVEUR - TABLE SQL 'messages']\n` + JSON.stringify(sample, null, 2);
  } catch (err) {
    code.textContent = `Erreur : ${err.message}`;
  }
}

async function loadAuditLogs() {
  try {
    const res = await FasoApi.getAuditLogs();
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = '';

    res.logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:11px;">#${log.id}</td>
        <td><strong style="color:var(--wa-green); font-size:12px;">${log.event_type}</strong></td>
        <td style="font-size:12px;">${log.actor_id || 'Anonyme'}</td>
        <td style="font-family:monospace; font-size:11px;">${log.ip_address}</td>
        <td style="font-size:12px;">${log.details}</td>
        <td style="font-size:11px; color:var(--text-secondary);">${new Date(log.created_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erreur audit :', err);
  }
}

function switchView(viewName) {
  // Toggle classe vue sur le body
  if (viewName === 'chat') {
    document.body.classList.add('view-chat');
  } else {
    document.body.classList.remove('view-chat');
    document.body.classList.remove('mobile-chat-open');
  }

  // Masque toutes les vues
  document.getElementById('viewChat').style.display = viewName === 'chat' ? 'flex' : 'none';
  document.getElementById('viewInstructions').style.display = viewName === 'instructions' ? 'block' : 'none';
  document.getElementById('viewSecurity').style.display = viewName === 'security' ? 'block' : 'none';
  document.getElementById('viewAudit').style.display = viewName === 'audit' ? 'block' : 'none';

  // Synchronise onglets desktop
  document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));
  if (viewName === 'chat') {
    const btn = document.getElementById('tabChatDesktop');
    if (btn) btn.classList.add('active');
  }
  if (viewName === 'instructions') {
    const btn = document.getElementById('tabInstDesktop');
    if (btn) btn.classList.add('active');
    loadInstructionsDashboard();
  }
  if (viewName === 'security') {
    const btn = document.getElementById('tabSecDesktop');
    if (btn) btn.classList.add('active');
    loadSecurityView();
  }
  if (viewName === 'audit') {
    const btn = document.getElementById('tabAuditDesktop');
    if (btn) btn.classList.add('active');
    loadAuditLogs();
  }

  // Synchronise bottom nav mobile
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
  if (viewName === 'chat') {
    const btn = document.getElementById('btnMobileChat');
    if (btn) btn.classList.add('active');
  }
  if (viewName === 'instructions') {
    const btn = document.getElementById('btnMobileInst');
    if (btn) btn.classList.add('active');
  }
  if (viewName === 'security') {
    const btn = document.getElementById('btnMobileSec');
    if (btn) btn.classList.add('active');
  }
  if (viewName === 'audit') {
    const btn = document.getElementById('btnMobileAudit');
    if (btn) btn.classList.add('active');
  }
}

function scrollChatToBottom() {
  const container = document.getElementById('chatMessages');
  if (container) container.scrollTop = container.scrollHeight;
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('fasobrief_theme', isDark ? 'dark' : 'light');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
