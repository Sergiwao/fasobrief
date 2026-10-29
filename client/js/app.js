/**
 * FASOBRIEF — Contrôleur Frontend Mobile-First
 *
 * Fonctionnalités réelles connectées :
 * - Authentification forte en 2 étapes (Mot de passe + TOTP RFC 6238 avec challengeToken)
 * - Activation de compte invité par code à usage unique 128 bits + enrôlement TOTP
 * - Chiffrement de bout en bout Olm (1:1 Double Ratchet) + Megolm (Sessions de groupe)
 * - Pièces jointes chiffrées côté client AES-256-GCM + intégrité SHA-256
 * - Accusés réels d'envoi, de remise sur appareil (delivered) et de lecture effective (read)
 * - Annuaire institutionnel hiérarchique (Organisation -> Direction -> Service -> Agents)
 * - Conversations individuelles uniques (DIRECT) et groupes administrables (GROUP)
 * - Cycle complet et versionné des instructions administratives avec signature Ed25519
 * - Centre de notifications persistées sans fuite de contenu + alerte navigateur opt-in
 * - Administration des comptes (Invitation, Suspension, Réactivation, Révocation en direct) & Audit
 */

const AppState = {
  demoMode: false,
  demoAccounts: [],
  currentView: 'chat',
  adminSubTab: 'users',
  instFilter: 'ALL',
  pendingLogin: null,
  pendingActivation: null,
  conversations: [],
  activeGroupId: null,
  activeMessages: [],
  failedOutgoing: new Map(), // clientMsgId -> { groupId, plainText }
  decryptedFileMeta: new Map(), // messageId -> { fileId, fileKeyBase64, ivBase64, sha256Base64, originalName, originalMime, originalSize }
  decryptedMsgText: new Map(), // messageId -> plainText
  directoryCache: { organisations: [], directions: [], services: [], agents: [] },
  instructionsCache: [],
  openInstructionId: null,
  unreadNotifications: 0,
  actionConfirmHandler: null,
  wsBound: false
};

const DEMO_DEFAULT_PASS = 'FasoSecurite2026!';

// ============================================================================
// ICÔNES SVG LUCIDE EN LIGNE (TRAIT 2PX, ZÉRO EMOJI)
// ============================================================================
const Icons = {
  clock: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="En attente d'envoi"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  alert: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="Échec d'envoi"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  checkSingle: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="Envoyé au serveur"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkDoubleGrey: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="Reçu sur l'appareil de tous les destinataires"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
  checkDoubleGreen: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="Lu par tous les destinataires"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
  lock: `<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  file: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  users: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
};

// ============================================================================
// INITIALISATION AU DÉMARRAGE
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Thème & Langue
  if (localStorage.getItem('fasobrief_theme') === 'dark') {
    document.body.classList.add('dark-mode');
  }
  const savedLang = localStorage.getItem('fasobrief_lang') || 'fr';
  syncLanguageButtons(savedLang);
  setLanguage(savedLang);

  // 2. Masquage sobre du splash screen
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splash = document.getElementById('splashScreen');
  if (splash) {
    const delay = prefersReduced || sessionStorage.getItem('fasobrief_splash_seen') ? 40 : 380;
    sessionStorage.setItem('fasobrief_splash_seen', '1');
    setTimeout(() => {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.hidden = true;
      }, prefersReduced ? 0 : 200);
    }, delay);
  }

  // 3. Initialiser WebAssembly @matrix-org/olm
  try {
    await window.FasoCrypto.init();
  } catch (err) {
    console.error('[CRYPTO] Échec chargement Olm :', err);
    showToast('Erreur de chargement du module cryptographique Olm.', 'error');
  }

  // 4. Écouteurs globaux (WebSocket, visibilité d'onglet, fermeture menus/modales)
  setupGlobalListeners();

  // 5. Charger la configuration d'authentification (détection Mode Démo Jury)
  try {
    const cfg = await FasoApi.getAuthConfig();
    AppState.demoMode = Boolean(cfg.demoMode);
    AppState.demoAccounts = cfg.demoAccounts || [];
    renderDemoAccessControls();

    if (AppState.demoMode && AppState.demoAccounts.length > 0) {
      await provisionDemoOlmDevicesIfNeeded(AppState.demoAccounts);
    }
  } catch (err) {
    console.warn('[AUTH] Impossible de lire /api/auth/config :', err);
  }

  // 6. Restaurer la session active ou afficher l'écran d'authentification
  if (FasoApi.token) {
    try {
      const meRes = await FasoApi.getMe();
      AppState.demoMode = Boolean(meRes.demoMode);
      AppState.unreadNotifications = meRes.unreadNotifications || 0;
      await enterAuthenticatedApp(meRes.user);
    } catch (_) {
      FasoApi.clearSession();
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
});

/**
 * En mode démonstration (FASOBRIEF_DEMO_MODE=1 uniquement), s'assure que chaque
 * compte fictif actif dispose d'un vrai terminal Olm enregistré sur ce navigateur.
 * Cela permet au jury de basculer d'un compte à l'autre dans un seul onglet tout en
 * utilisant un chiffrement Olm/Megolm 100 % authentique (aucune clé simulée).
 */
async function provisionDemoOlmDevicesIfNeeded(demoAccounts) {
  const missing = demoAccounts.filter(
    (acc) => acc.status === 'ACTIVE' && !localStorage.getItem(`fasobrief_olm_v2_${acc.id}`)
  );
  if (missing.length === 0) return;

  const badge = document.getElementById('demoProvisionStatus');
  if (badge) {
    badge.textContent = 'Initialisation des clés Olm...';
    badge.className = 'badge badge-amber';
  }

  for (const acc of missing) {
    const tempApi = new FasoApiClient();
    const tempCrypto = new FasoCryptoEngine();
    // Ne pas écraser le jeton principal dans localStorage
    tempApi.setSession = function (tok, usr) {
      this.token = tok;
      this.currentUser = usr;
    };
    tempApi.clearSession = function () {
      this.token = null;
      this.currentUser = null;
    };

    try {
      const s1 = await tempApi.loginStep1(acc.matricule, DEMO_DEFAULT_PASS);
      if (s1 && s1.requires2FA) {
        const totpRes = await tempApi.getDemoTotp(s1.userId);
        await tempApi.loginStep2(s1.userId, totpRes.code, s1.challengeToken, 'Préparation Démo Olm');
        await tempCrypto.bindUserSession(s1.userId, tempApi);
        await tempApi.logoutServer();
      }
    } catch (_) {
      // Un compte démo peut avoir changé de mot de passe ou avoir été révoqué : ignorer proprement
    } finally {
      tempCrypto._freeCurrentAccount();
    }
  }

  if (badge) {
    badge.textContent = 'Terminaux Olm prêts';
    badge.className = 'badge badge-green';
  }
}

// ============================================================================
// ÉCOUTEURS GLOBAUX & TEMPS RÉEL WEBSOCKET
// ============================================================================
function setupGlobalListeners() {
  if (AppState.wsBound) return;
  AppState.wsBound = true;

  // Fermer le menu profil au clic extérieur
  document.addEventListener('click', (e) => {
    const btn = document.getElementById('userMenuBtn');
    const menu = document.getElementById('userDropdown');
    if (menu && !menu.hidden && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      closeUserDropdown();
    }
  });

  // Touche Échap pour fermer les modales
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserDropdown();
      document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((m) => {
        m.hidden = true;
      });
    }
  });

  // Émission automatique des accusés 'read' uniquement quand l'onglet redevient visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      markVisibleConversationMessagesRead();
    }
  });

  // --- Événements WebSocket Cryptographiques Olm/Megolm ---
  FasoApi.on('TO_DEVICE_ENCRYPTED', async (data) => {
    if (!data || !data.envelope) return;
    const imported = FasoCrypto.processRealtimeEnvelope(data.envelope);
    if (imported && data.envelope.groupId && data.envelope.groupId === AppState.activeGroupId) {
      await loadActiveConversationMessages({ preserveScroll: true });
    }
    if (imported && AppState.currentView === 'instructions') {
      await loadInstructionsView();
    }
  });

  FasoApi.on('MEGOLM_KEY_REQUESTED', async (data) => {
    if (!data || !data.groupId || !data.megolmSessionId) return;
    try {
      await FasoCrypto.shareSessionWithPeerDevice(data.groupId, data.megolmSessionId, {
        userId: data.requesterUserId,
        deviceId: data.requesterDeviceId,
        curve25519Key: data.requesterCurve25519,
        ed25519Key: data.requesterEd25519
      });
    } catch (_) {}
  });

  FasoApi.on('GROUP_DEVICE_ADDED', async (data) => {
    if (!data || !data.groupId) return;
    try {
      if (FasoCrypto.state && FasoCrypto.state.outboundGroupSessions[data.groupId]) {
        await FasoCrypto.ensureOutboundGroupSession(data.groupId);
      }
    } catch (_) {}
  });

  FasoApi.on('REPLENISH_OTK_REQUIRED', async () => {
    try {
      await FasoCrypto.replenishOneTimeKeys(20);
    } catch (_) {}
  });

  FasoApi.on('GROUP_KEY_ROTATION_REQUIRED', async (data) => {
    if (data && data.groupId) {
      FasoCrypto.invalidateOutboundGroupSession(data.groupId);
    }
    await loadConversations({ keepSelection: true });
  });

  // --- Événements Messagerie & Statuts ---
  FasoApi.on('NEW_ENCRYPTED_MESSAGE', async (data) => {
    const msg = data && data.message;
    if (!msg || !FasoApi.currentUser) return;

    const groupId = msg.group_id || msg.groupId;
    const senderId = msg.sender_id || msg.senderId;

    // Dès réception sur cet appareil d'un message d'autrui, confirmer la remise ('delivered')
    if (senderId !== FasoApi.currentUser.id) {
      FasoApi.sendMessageReceipts([msg.id], 'delivered').catch(() => {});
    }

    if (groupId === AppState.activeGroupId) {
      await loadActiveConversationMessages({ preserveScroll: false });
      markVisibleConversationMessagesRead();
    }
    await loadConversations({ keepSelection: true });
  });

  FasoApi.on('MESSAGE_RECEIPT_UPDATED', (data) => {
    if (!data || !data.messageId) return;
    const targetMsg = AppState.activeMessages.find((m) => m.id === data.messageId);
    if (targetMsg) {
      targetMsg.delivery_status = data.deliveryStatus;
      targetMsg.delivered_count = data.deliveredCount;
      targetMsg.read_count = data.readCount;
      targetMsg.recipient_count = data.recipientCount;
      updateMessageStatusDom(data.messageId, data.deliveryStatus);
    }
  });

  FasoApi.on('CONVERSATION_CREATED', async () => {
    await loadConversations({ keepSelection: true });
  });

  FasoApi.on('GROUP_UPDATED', async (data) => {
    await loadConversations({ keepSelection: true });
    if (data && data.groupId === AppState.activeGroupId) {
      updateActiveChatHeader();
    }
  });

  FasoApi.on('REMOVED_FROM_GROUP', async (data) => {
    if (data && data.groupId) {
      FasoCrypto.invalidateOutboundGroupSession(data.groupId);
      if (AppState.activeGroupId === data.groupId) {
        AppState.activeGroupId = null;
        document.body.classList.remove('mobile-chat-open');
      }
      showToast('Vous ne faites plus partie de ce groupe.', 'error');
      await loadConversations({ keepSelection: false });
    }
  });

  // --- Événements Instructions ---
  const handleInstRealtime = async (data) => {
    await refreshInstructionsBadgeAndCache();
    if (AppState.currentView === 'instructions') {
      renderInstructionsList();
    }
    if (AppState.activeGroupId) {
      await loadActiveConversationMessages({ preserveScroll: true });
    }
    const instId = (data && data.instructionId) || (data && data.instruction && data.instruction.id);
    if (AppState.openInstructionId && (!instId || instId === AppState.openInstructionId)) {
      await openInstructionDetail(AppState.openInstructionId, { skipMarkViewed: true });
    }
  };

  FasoApi.on('NEW_ADMINISTRATIVE_INSTRUCTION', handleInstRealtime);
  FasoApi.on('INSTRUCTION_ACKNOWLEDGED', handleInstRealtime);
  FasoApi.on('INSTRUCTION_UPDATED', handleInstRealtime);

  // --- Événements Notifications ---
  FasoApi.on('NOTIFICATION_EVENT', async (data) => {
    if (typeof data.unreadCount === 'number') {
      AppState.unreadNotifications = data.unreadCount;
      refreshNavigationBadges();
    }
    if (AppState.currentView === 'notifications') {
      await loadNotificationsView();
    }
    maybeTriggerBrowserNotification(data.notification);
  });

  // --- Événements Révocation / Suspension en direct ---
  FasoApi.on('ACCOUNT_REVOKED', (data) => {
    lockInterfaceOnSecurityCutoff(
      'Habilitation révoquée :',
      (data && data.reason) || 'Votre compte FasoBrief a été définitivement révoqué avec effet immédiat.'
    );
  });

  FasoApi.on('ACCOUNT_SUSPENDED', (data) => {
    lockInterfaceOnSecurityCutoff(
      'Compte suspendu :',
      (data && data.reason) || 'Votre session FasoBrief a été suspendue par l\'administration.'
    );
  });
}

function lockInterfaceOnSecurityCutoff(title, message) {
  const banner = document.getElementById('criticalBanner');
  document.getElementById('criticalBannerTitle').textContent = title;
  document.getElementById('criticalBannerText').textContent = message;
  banner.hidden = false;

  const bodyArea = document.querySelector('.shell-body');
  const mobNav = document.querySelector('.mobile-nav');
  if (bodyArea) {
    bodyArea.style.opacity = '0.28';
    bodyArea.style.pointerEvents = 'none';
  }
  if (mobNav) {
    mobNav.style.pointerEvents = 'none';
  }
  document.querySelectorAll('.modal-backdrop').forEach((m) => {
    m.hidden = true;
  });
}

function returnToLoginAfterRevocation() {
  FasoApi.clearSession();
  const bodyArea = document.querySelector('.shell-body');
  const mobNav = document.querySelector('.mobile-nav');
  if (bodyArea) {
    bodyArea.style.opacity = '1';
    bodyArea.style.pointerEvents = 'auto';
  }
  if (mobNav) {
    mobNav.style.pointerEvents = 'auto';
  }
  document.getElementById('criticalBanner').hidden = true;
  showAuthScreen();
}

// ============================================================================
// AUTHENTIFICATION & ACTIVATION DE COMPTE INVITÉ
// ============================================================================
function showAuthScreen() {
  document.getElementById('appShell').hidden = true;
  document.getElementById('authScreen').hidden = false;
  resetLoginToStep1();
  resetActivateToStep1();
  renderDemoAccessControls();
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('authTabLogin').classList.toggle('active', isLogin);
  document.getElementById('authTabLogin').setAttribute('aria-selected', String(isLogin));
  document.getElementById('authTabActivate').classList.toggle('active', !isLogin);
  document.getElementById('authTabActivate').setAttribute('aria-selected', String(!isLogin));

  document.getElementById('authPaneLogin').hidden = !isLogin;
  document.getElementById('authPaneActivate').hidden = isLogin;
}

function showInlineAuthError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.textContent = formatApiError(msg);
    el.hidden = false;
  }
}

async function handleLoginStep1(event) {
  if (event) event.preventDefault();
  showInlineAuthError('authLoginAlert', null);

  const matricule = document.getElementById('loginMatricule').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!matricule || !password) return;

  const btn = document.getElementById('btnLoginStep1');
  btn.disabled = true;
  try {
    const res = await FasoApi.loginStep1(matricule, password);
    if (res.requires2FA) {
      AppState.pendingLogin = {
        userId: res.userId,
        challengeToken: res.challengeToken,
        fullName: res.fullName,
        matricule: res.matricule,
        role: res.role
      };
      document.getElementById('formLoginStep1').hidden = true;
      document.getElementById('formLoginStep2').hidden = false;
      document.getElementById('loginStep2Banner').textContent =
        `1er facteur validé pour ${res.fullName} (${res.matricule} — ${res.role}).`;
      document.getElementById('btnFillDemoTotp').hidden = !AppState.demoMode;
      document.getElementById('loginTotpCode').value = '';
      document.getElementById('loginTotpCode').focus();

      if (AppState.demoMode) {
        await fillDemoTotpCode();
      }
    }
  } catch (err) {
    showInlineAuthError('authLoginAlert', err.message);
  } finally {
    btn.disabled = false;
  }
}

function resetLoginToStep1() {
  AppState.pendingLogin = null;
  showInlineAuthError('authLoginAlert', null);
  document.getElementById('formLoginStep1').hidden = false;
  document.getElementById('formLoginStep2').hidden = true;
  document.getElementById('loginTotpCode').value = '';
}

async function fillDemoTotpCode() {
  if (!AppState.demoMode || !AppState.pendingLogin) return;
  try {
    const res = await FasoApi.getDemoTotp(AppState.pendingLogin.userId);
    if (res && res.code) {
      document.getElementById('loginTotpCode').value = res.code;
    }
  } catch (err) {
    showInlineAuthError('authLoginAlert', err.message);
  }
}

async function handleLoginStep2(event) {
  if (event) event.preventDefault();
  if (!AppState.pendingLogin) return;
  showInlineAuthError('authLoginAlert', null);

  const totpCode = document.getElementById('loginTotpCode').value.trim();
  const btn = document.getElementById('btnLoginStep2');
  btn.disabled = true;
  try {
    const res = await FasoApi.loginStep2(
      AppState.pendingLogin.userId,
      totpCode,
      AppState.pendingLogin.challengeToken,
      navigator.platform || 'Web'
    );
    if (res.success && res.user) {
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginTotpCode').value = '';
      AppState.pendingLogin = null;
      await enterAuthenticatedApp(res.user);
    }
  } catch (err) {
    showInlineAuthError('authLoginAlert', err.message);
    if (err.code === 'ETAPE_1_REQUISE_OU_EXPIREE') {
      resetLoginToStep1();
    }
  } finally {
    btn.disabled = false;
  }
}

async function handleActivateStep1(event) {
  if (event) event.preventDefault();
  showInlineAuthError('authActivateAlert', null);

  const matricule = document.getElementById('actMatricule').value.trim();
  const activationCode = document.getElementById('actCode').value.trim();
  if (!matricule || !activationCode) return;

  try {
    const res = await FasoApi.activateStep1(matricule, activationCode);
    AppState.pendingActivation = { matricule, activationCode };
    document.getElementById('formActivateStep1').hidden = true;
    document.getElementById('formActivateStep2').hidden = false;
    document.getElementById('actAgentSummary').textContent =
      `Invitation vérifiée : ${res.fullName} (${res.matricule} • ${res.role} • ${res.serviceMinistry}).`;
    document.getElementById('actTotpSecretDisplay').textContent = res.totpSecret;
    document.getElementById('actOtpUriHint').textContent = `URI standard : ${res.otpauthUri}`;
    document.getElementById('actNewPassword').focus();
  } catch (err) {
    showInlineAuthError('authActivateAlert', err.message);
  }
}

function resetActivateToStep1() {
  AppState.pendingActivation = null;
  showInlineAuthError('authActivateAlert', null);
  document.getElementById('formActivateStep1').hidden = false;
  document.getElementById('formActivateStep2').hidden = true;
}

async function handleActivateStep2(event) {
  if (event) event.preventDefault();
  if (!AppState.pendingActivation) return;
  showInlineAuthError('authActivateAlert', null);

  const password = document.getElementById('actNewPassword').value;
  const confirm = document.getElementById('actConfirmPassword').value;
  const totpCode = document.getElementById('actFirstTotp').value.trim();

  if (password.length < 12) {
    showInlineAuthError('authActivateAlert', 'Le mot de passe doit comporter au moins 12 caractères.');
    return;
  }
  if (password !== confirm) {
    showInlineAuthError('authActivateAlert', 'Les deux mots de passe ne correspondent pas.');
    return;
  }

  try {
    const res = await FasoApi.activateStep2({
      matricule: AppState.pendingActivation.matricule,
      activationCode: AppState.pendingActivation.activationCode,
      password,
      totpCode,
      deviceInfo: navigator.platform || 'Web'
    });
    if (res.success && res.user) {
      AppState.pendingActivation = null;
      document.getElementById('actNewPassword').value = '';
      document.getElementById('actConfirmPassword').value = '';
      document.getElementById('actFirstTotp').value = '';
      showToast('Compte activé avec succès et terminal Olm initialisé.', 'success');
      await enterAuthenticatedApp(res.user);
    }
  } catch (err) {
    showInlineAuthError('authActivateAlert', err.message);
  }
}

function renderDemoAccessControls() {
  const panel = document.getElementById('demoQuickPanel');
  const list = document.getElementById('demoAccountsList');
  const dropSec = document.getElementById('dropdownDemoSection');
  const dropList = document.getElementById('dropdownDemoAccounts');

  if (!AppState.demoMode || AppState.demoAccounts.length === 0) {
    if (panel) panel.hidden = true;
    if (dropSec) dropSec.hidden = true;
    return;
  }

  if (panel && list) {
    panel.hidden = false;
    list.innerHTML = '';
    AppState.demoAccounts.forEach((acc) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-account-row';
      btn.onclick = () => selectDemoPersonaForLogin(acc);
      const statusBadge = acc.status === 'ACTIVE'
        ? `<span class="badge badge-green">${escapeHtml(acc.role)}</span>`
        : `<span class="badge badge-red">${escapeHtml(acc.status)}</span>`;
      btn.innerHTML = `
        <div>
          <div class="demo-account-name">${escapeHtml(acc.fullName)}</div>
          <div class="demo-account-meta">${escapeHtml(acc.matricule)} • ${escapeHtml(acc.serviceMinistry)}</div>
        </div>
        ${statusBadge}
      `;
      list.appendChild(btn);
    });
  }

  if (dropSec && dropList) {
    dropSec.hidden = false;
    dropList.innerHTML = '';
    AppState.demoAccounts.forEach((acc) => {
      if (FasoApi.currentUser && acc.id === FasoApi.currentUser.id) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.onclick = () => quickSwitchDemoPersona(acc);
      item.innerHTML = `
        <span class="avatar avatar-sm">${escapeHtml(getInitials(acc.fullName))}</span>
        <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(acc.fullName)} <span style="color:var(--text-muted); font-size:var(--fs-xs);">(${escapeHtml(acc.role)})</span>
        </span>
      `;
      dropList.appendChild(item);
    });
  }
}

async function selectDemoPersonaForLogin(acc) {
  switchAuthTab('login');
  resetLoginToStep1();
  document.getElementById('loginMatricule').value = acc.matricule;
  document.getElementById('loginPassword').value = DEMO_DEFAULT_PASS;
  await handleLoginStep1(null);
}

async function quickSwitchDemoPersona(acc) {
  closeUserDropdown();
  await FasoApi.logoutServer();
  FasoCrypto._freeCurrentAccount();
  showAuthScreen();
  await selectDemoPersonaForLogin(acc);
}

// ============================================================================
// ENTRÉE DANS LE SHELL AUTHENTIFIÉ & CONTRÔLE DES RÔLES UI
// ============================================================================
async function enterAuthenticatedApp(user) {
  document.getElementById('authScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
  document.getElementById('criticalBanner').hidden = true;

  const bodyArea = document.querySelector('.shell-body');
  const mobNav = document.querySelector('.mobile-nav');
  if (bodyArea) {
    bodyArea.style.opacity = '1';
    bodyArea.style.pointerEvents = 'auto';
  }
  if (mobNav) {
    mobNav.style.pointerEvents = 'auto';
  }

  // 1. Initialiser/restaurer le compte Olm personnel de l'agent et publier ses clés
  const cryptoInfo = await FasoCrypto.bindUserSession(user.id, FasoApi);

  // 2. Connecter le WebSocket temps réel avec le deviceId Olm
  FasoApi.connectWebSocket(cryptoInfo.deviceId);

  // 3. Mettre à jour l'en-tête et les permissions visuelles selon le rôle
  applyUserRoleAndHeader(user, cryptoInfo.deviceId);
  renderDemoAccessControls();

  // 4. Synchroniser préférences notifications
  const toggle = document.getElementById('browserNotifToggle');
  if (toggle) {
    toggle.checked = Boolean(user.notifBrowserEnabled);
  }

  // 5. Charger les données initiales réelles
  await Promise.all([
    loadConversations({ keepSelection: false }),
    refreshInstructionsBadgeAndCache(),
    refreshUnreadNotificationsCount()
  ]);

  switchMainView('chat');
}

function applyUserRoleAndHeader(user, deviceId) {
  const initials = getInitials(user.fullName);
  document.getElementById('headerAvatar').textContent = initials;
  document.getElementById('headerUserLabel').textContent = user.fullName;
  document.getElementById('dropdownFullName').textContent = user.fullName;
  document.getElementById('dropdownMeta').textContent = `${user.matricule} • ${user.role} • ${user.serviceMinistry}`;
  document.getElementById('dropdownDeviceMeta').textContent = deviceId ? `Terminal Olm : ${deviceId}` : '';

  const canCreateGroupOrInst = ['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'].includes(user.role);
  const canAccessAdmin = ['ADMIN', 'DIRECTEUR'].includes(user.role);
  const isAdminOnly = user.role === 'ADMIN';

  document.getElementById('btnOpenCreateGroup').hidden = !canCreateGroupOrInst;
  document.getElementById('btnDirNewGroup').hidden = !canCreateGroupOrInst;
  document.getElementById('btnChatCreateInst').hidden = !canCreateGroupOrInst;
  document.getElementById('btnPageNewInst').hidden = !canCreateGroupOrInst;
  document.getElementById('btnFilterDrafts').hidden = !canCreateGroupOrInst;

  document.getElementById('railAdmin').hidden = !canAccessAdmin;
  document.getElementById('mobAdmin').hidden = !canAccessAdmin;
  document.getElementById('dirIncludeAllWrap').hidden = !canAccessAdmin;
  document.getElementById('btnInviteAgent').hidden = !isAdminOnly;
}

async function performLogout() {
  closeUserDropdown();
  await FasoApi.logoutServer();
  FasoCrypto._freeCurrentAccount();
  AppState.activeGroupId = null;
  AppState.conversations = [];
  AppState.activeMessages = [];
  document.body.classList.remove('mobile-chat-open');
  showAuthScreen();
}

// ============================================================================
// NAVIGATION PRINCIPALE
// ============================================================================
function switchMainView(view) {
  const user = FasoApi.currentUser;
  if (view === 'admin' && (!user || !['ADMIN', 'DIRECTEUR'].includes(user.role))) {
    return;
  }

  AppState.currentView = view;
  if (view !== 'chat') {
    document.body.classList.remove('mobile-chat-open');
  }

  const viewsMap = {
    chat: 'viewChat',
    directory: 'viewDirectory',
    instructions: 'viewInstructions',
    notifications: 'viewNotifications',
    admin: 'viewAdmin'
  };

  Object.entries(viewsMap).forEach(([k, domId]) => {
    const el = document.getElementById(domId);
    if (el) el.hidden = k !== view;
  });

  const navMap = {
    chat: ['railChat', 'mobChat'],
    directory: ['railDirectory', 'mobDirectory'],
    instructions: ['railInstructions', 'mobInstructions'],
    notifications: ['railNotifications', 'mobNotifications'],
    admin: ['railAdmin', 'mobAdmin']
  };

  Object.entries(navMap).forEach(([k, ids]) => {
    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('active', k === view);
    });
  });

  if (view === 'chat') {
    loadConversations({ keepSelection: true });
    markVisibleConversationMessagesRead();
  } else if (view === 'directory') {
    loadDirectoryView();
  } else if (view === 'instructions') {
    loadInstructionsView();
  } else if (view === 'notifications') {
    loadNotificationsView();
  } else if (view === 'admin') {
    loadAdminView();
  }
}

function refreshNavigationBadges() {
  const unreadChat = AppState.conversations.reduce((acc, g) => acc + (g.unreadCount || 0), 0);
  const myPendingInst = AppState.instructionsCache.filter(
    (inst) =>
      inst.status === 'PUBLIEE' &&
      inst.is_recipient &&
      inst.my_recipient &&
      inst.my_recipient.step !== 'EXECUTEE' &&
      !inst.my_recipient.acknowledgedAt
  ).length;

  setBadgeValue('badgeChatDesktop', unreadChat);
  setBadgeValue('badgeChatMobile', unreadChat);
  setBadgeValue('badgeInstDesktop', myPendingInst);
  setBadgeValue('badgeInstMobile', myPendingInst);
  setBadgeValue('badgeNotifDesktop', AppState.unreadNotifications);
  setBadgeValue('badgeNotifMobile', AppState.unreadNotifications);
}

function setBadgeValue(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ============================================================================
// VUE 1 : DISCUSSIONS (1:1 & GROUPES), MESSAGES E2EE & ACCUSÉS RÉELS
// ============================================================================
async function loadConversations({ keepSelection = true } = {}) {
  if (!FasoApi.token) return;
  try {
    const res = await FasoApi.getGroups();
    AppState.conversations = res.groups || [];

    if (!keepSelection || !AppState.conversations.some((g) => g.id === AppState.activeGroupId)) {
      if (window.innerWidth >= 768 && AppState.conversations.length > 0) {
        AppState.activeGroupId = AppState.conversations[0].id;
      } else if (!AppState.conversations.some((g) => g.id === AppState.activeGroupId)) {
        AppState.activeGroupId = null;
      }
    }

    renderConversationsList();
    updateActiveChatHeader();
    refreshNavigationBadges();

    if (AppState.activeGroupId) {
      await loadActiveConversationMessages({ preserveScroll: true });
    }
  } catch (err) {
    console.warn('[CHAT] Erreur chargement conversations :', err);
  }
}

function renderConversationsList() {
  const listEl = document.getElementById('conversationsList');
  if (!listEl) return;
  const q = (document.getElementById('convSearchInput').value || '').trim().toLowerCase();

  const filtered = AppState.conversations.filter((g) => {
    if (!q) return true;
    return (
      (g.name || '').toLowerCase().includes(q) ||
      (g.service_ministry || '').toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Aucune discussion trouvée</div>
        <p>Ouvrez l'annuaire pour démarrer une conversation individuelle chiffrée.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'listitem');
    btn.className = `conv-row ${g.id === AppState.activeGroupId ? 'active' : ''} ${g.unreadCount > 0 ? 'unread' : ''}`;
    btn.onclick = () => openConversation(g.id);

    const isDirect = g.type === 'DIRECT';
    const avatarHtml = isDirect
      ? `<span class="avatar">${escapeHtml(getInitials(g.name))}</span>`
      : `<span class="avatar brand">${Icons.users}</span>`;

    const timeStr = formatShortTimeOrDate(g.lastMessageAt);
    const typeLabel = isDirect ? 'Direct' : `${g.member_count || 1} mbr.`;
    const unreadBadge = g.unreadCount > 0 ? `<span class="nav-badge">${g.unreadCount}</span>` : '';

    btn.innerHTML = `
      ${avatarHtml}
      <div class="conv-row-body">
        <div class="conv-row-top">
          <span class="conv-name">${escapeHtml(g.name)}</span>
          <span class="conv-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="conv-row-bottom">
          <span class="conv-sub">${escapeHtml(typeLabel)} • ${escapeHtml(g.service_ministry || '')}</span>
          ${unreadBadge}
        </div>
      </div>
    `;
    listEl.appendChild(btn);
  });
}

async function openConversation(groupId) {
  AppState.activeGroupId = groupId;
  if (window.innerWidth < 768) {
    document.body.classList.add('mobile-chat-open');
  }
  renderConversationsList();
  updateActiveChatHeader();
  await loadActiveConversationMessages({ preserveScroll: false });
  markVisibleConversationMessagesRead();
}

function closeMobileConversation() {
  document.body.classList.remove('mobile-chat-open');
}

function updateActiveChatHeader() {
  const emptyEl = document.getElementById('chatEmptySelection');
  const wrapEl = document.getElementById('chatActiveWrap');
  const grp = AppState.conversations.find((g) => g.id === AppState.activeGroupId);

  if (!grp) {
    emptyEl.hidden = false;
    wrapEl.style.display = 'none';
    return;
  }

  emptyEl.hidden = true;
  wrapEl.style.display = 'flex';

  const avatarEl = document.getElementById('activeConvAvatar');
  avatarEl.textContent = getInitials(grp.name);
  avatarEl.className = grp.type === 'DIRECT' ? 'avatar' : 'avatar brand';

  document.getElementById('activeConvTitle').textContent = grp.name;
  const prefix = grp.type === 'DIRECT' ? 'Échange individuel E2EE' : `Groupe E2EE (${grp.member_count || 1} actifs)`;
  document.getElementById('activeConvSub').textContent = `${prefix} • ${grp.service_ministry || ''}`;
}

function isConversationVisiblyOpen() {
  if (AppState.currentView !== 'chat' || !AppState.activeGroupId) return false;
  if (document.visibilityState !== 'visible') return false;
  if (window.innerWidth < 768 && !document.body.classList.contains('mobile-chat-open')) return false;
  return true;
}

async function markVisibleConversationMessagesRead() {
  if (!isConversationVisiblyOpen() || !FasoApi.currentUser) return;
  const unreadIds = AppState.activeMessages
    .filter((m) => m.sender_id !== FasoApi.currentUser.id && !m._markedReadByMe)
    .map((m) => m.id);

  if (unreadIds.length === 0) return;
  unreadIds.forEach((id) => {
    const found = AppState.activeMessages.find((m) => m.id === id);
    if (found) found._markedReadByMe = true;
  });

  try {
    await FasoApi.sendMessageReceipts(unreadIds, 'read');
    const grp = AppState.conversations.find((g) => g.id === AppState.activeGroupId);
    if (grp && grp.unreadCount > 0) {
      grp.unreadCount = 0;
      renderConversationsList();
      refreshNavigationBadges();
    }
    await refreshUnreadNotificationsCount();
  } catch (_) {}
}

async function loadActiveConversationMessages({ preserveScroll = false } = {}) {
  const groupId = AppState.activeGroupId;
  if (!groupId || !FasoApi.currentUser) return;

  const container = document.getElementById('chatMessages');
  const prevScrollTop = container.scrollTop;

  try {
    await FasoCrypto.syncPendingCrypto();
    const res = await FasoApi.getMessages(groupId);
    const messages = res.messages || [];
    AppState.activeMessages = messages;

    // Accusé 'delivered' pour tout message reçu non émis par moi
    const otherIds = messages
      .filter((m) => m.sender_id !== FasoApi.currentUser.id)
      .map((m) => m.id);
    if (otherIds.length > 0) {
      FasoApi.sendMessageReceipts(otherIds, 'delivered').catch(() => {});
    }

    container.innerHTML = '';

    // Bandeau discret de garantie cryptographique en haut du fil
    const notice = document.createElement('div');
    notice.className = 'e2ee-notice';
    notice.innerHTML = `${Icons.lock} <span>Messages et fichiers chiffrés de bout en bout (Olm / Megolm). Le serveur n'accède jamais au contenu en clair.</span>`;
    container.appendChild(notice);

    if (messages.length === 0 && AppState.failedOutgoing.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="empty-state-title">Aucun message pour le moment</div><p>Démarrez la discussion ci-dessous.</p>`;
      container.appendChild(empty);
    }

    for (const msg of messages) {
      const node = await buildMessageDomNode(groupId, msg);
      container.appendChild(node);
    }

    // Afficher également les éventuels messages échoués côté réseau pour permettre un renvoi sans doublon
    for (const [clientMsgId, failed] of AppState.failedOutgoing.entries()) {
      if (failed.groupId === groupId) {
        container.appendChild(buildFailedMessageNode(clientMsgId, failed));
      }
    }

    if (preserveScroll) {
      container.scrollTop = prevScrollTop;
    } else {
      container.scrollTop = container.scrollHeight;
    }

    markVisibleConversationMessagesRead();
  } catch (err) {
    console.warn('[CHAT] Erreur chargement messages :', err);
  }
}

async function buildMessageDomNode(groupId, msg) {
  const isMe = FasoApi.currentUser && msg.sender_id === FasoApi.currentUser.id;
  const row = document.createElement('div');
  row.className = `msg-row ${isMe ? 'sent' : 'received'}`;
  row.dataset.messageId = msg.id;

  const dec = await FasoCrypto.decryptPayload(groupId, msg);
  const senderLabel = !isMe ? `<div class="msg-sender">${escapeHtml(msg.sender_name || 'Agent')}</div>` : '';
  const timeStr = formatTimeOnly(msg.created_at);

  const canMakeInst =
    dec.ok &&
    msg.message_type === 'CHAT' &&
    FasoApi.currentUser &&
    ['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'].includes(FasoApi.currentUser.role);

  if (dec.ok && dec.text) {
    AppState.decryptedMsgText.set(msg.id, dec.text);
  }

  let bodyHtml = '';
  if (msg.message_type === 'INSTRUCTION' && msg.instruction_id) {
    const titleText = dec.ok
      ? (dec.data && dec.data.title) || dec.text
      : dec.text;
    const prioBadge = msg.instruction_priority === 'URGENTE'
      ? `<span class="badge badge-red">URGENTE</span>`
      : (msg.instruction_priority === 'HAUTE' ? `<span class="badge badge-amber">HAUTE</span>` : '');
    const statusBadge = renderInstructionStatusBadge(msg.instruction_status || 'PUBLIEE');

    bodyHtml = `
      ${senderLabel}
      <div class="msg-inst-block">
        <div class="msg-inst-top">
          <span class="badge badge-mono">${escapeHtml(msg.instruction_ref || 'INST')}</span>
          <span class="badge">v${Number(msg.instruction_version || 1)}</span>
          ${prioBadge}
          ${statusBadge}
        </div>
        <div class="msg-inst-title">${escapeHtml(titleText)}</div>
        <div class="msg-file-meta">
          ${msg.deadline ? `Échéance : ${escapeHtml(formatDateTime(msg.deadline))}` : 'Sans date limite'}
        </div>
        <div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openInstructionDetail('${escapeAttr(msg.instruction_id)}')">
            Ouvrir le détail et le suivi
          </button>
        </div>
      </div>
    `;
  } else if (msg.message_type === 'FILE' || msg.file_id) {
    const fileData = (dec.ok && dec.data) || {};
    const fileId = msg.file_id || fileData.fileId;
    if (dec.ok && fileId && fileData.fileKeyBase64) {
      AppState.decryptedFileMeta.set(msg.id, {
        fileId,
        fileKeyBase64: fileData.fileKeyBase64,
        ivBase64: fileData.ivBase64,
        sha256Base64: fileData.sha256Base64,
        originalName: fileData.originalName || 'document_fasobrief.bin',
        originalMime: fileData.originalMime || 'application/octet-stream',
        originalSize: fileData.originalSize || msg.file_size || 0
      });
    }
    const displayFileName = dec.ok && fileData.originalName
      ? fileData.originalName
      : '[Pièce jointe chiffrée AES-256-GCM]';
    const sizeBytes = (fileData && fileData.originalSize) || msg.file_size || 0;

    bodyHtml = `
      ${senderLabel}
      <div class="msg-file-block">
        <div class="msg-file-head">
          ${Icons.file}
          <div>
            <div class="msg-file-name">${escapeHtml(displayFileName)}</div>
            <div class="msg-file-meta">${escapeHtml(formatByteSize(sizeBytes))} • Chiffré AES-256-GCM</div>
          </div>
        </div>
        ${dec.ok && fileId
          ? `<button type="button" class="btn btn-secondary btn-sm" onclick="downloadAndDecryptAttachment('${escapeAttr(msg.id)}')">Télécharger et déchiffrer</button>`
          : `<div class="msg-text muted-cipher">${escapeHtml(dec.text)}</div>`}
      </div>
    `;
  } else {
    bodyHtml = `
      ${senderLabel}
      <div class="msg-text ${dec.ok ? '' : 'muted-cipher'}">${escapeHtml(dec.text)}</div>
    `;
  }

  const convertBtn = canMakeInst
    ? `<button type="button" class="msg-inline-btn" onclick="convertMessageToInstruction('${escapeAttr(msg.id)}')">Convertir en instruction</button>`
    : '';

  const infoBtn = isMe
    ? `<button type="button" class="msg-inline-btn" aria-label="Voir le statut par destinataire" onclick="openMessageInfoModal('${escapeAttr(msg.id)}')">Infos</button>`
    : '';

  const statusHtml = isMe ? renderDeliveryStatusIcon(msg.delivery_status || 'sent') : '';

  row.innerHTML = `
    <div class="msg-box">
      ${bodyHtml}
      <div class="msg-footer">
        ${convertBtn}
        ${infoBtn}
        <span>${escapeHtml(timeStr)}</span>
        <span class="msg-status-slot">${statusHtml}</span>
      </div>
    </div>
  `;
  return row;
}

function buildFailedMessageNode(clientMsgId, item) {
  const row = document.createElement('div');
  row.className = 'msg-row sent';
  row.innerHTML = `
    <div class="msg-box">
      <div class="msg-text">${escapeHtml(item.plainText)}</div>
      <div class="msg-footer">
        <span class="status-icon failed">${Icons.alert}</span>
        <span style="color: var(--danger);">Non remis</span>
        <button type="button" class="msg-inline-btn" style="color: var(--brand);" onclick="retryFailedMessage('${escapeAttr(clientMsgId)}')">
          Réessayer
        </button>
      </div>
    </div>
  `;
  return row;
}

function renderDeliveryStatusIcon(status) {
  if (status === 'pending') {
    return `<span class="status-icon" title="En attente côté client">${Icons.clock}</span>`;
  }
  if (status === 'read') {
    return `<span class="status-icon read" title="Lu par tous les destinataires">${Icons.checkDoubleGreen}</span>`;
  }
  if (status === 'delivered') {
    return `<span class="status-icon" title="Reçu sur l'appareil de tous les destinataires">${Icons.checkDoubleGrey}</span>`;
  }
  return `<span class="status-icon" title="Accepté par le serveur">${Icons.checkSingle}</span>`;
}

function updateMessageStatusDom(messageId, deliveryStatus) {
  const row = document.querySelector(`.msg-row[data-message-id="${CSS.escape(messageId)}"]`);
  if (!row) return;
  const slot = row.querySelector('.msg-status-slot');
  if (slot) {
    slot.innerHTML = renderDeliveryStatusIcon(deliveryStatus);
  }
}

function handleComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitChatMessage();
  }
}

async function submitChatMessage() {
  const input = document.getElementById('chatComposerInput');
  const plainText = (input.value || '').trim();
  const groupId = AppState.activeGroupId;
  if (!plainText || !groupId) return;

  input.value = '';
  const clientMsgId = `cmsg_${Date.now()}_${FasoCrypto._generateRandomHex(6)}`;
  await sendTextWithClientId(groupId, plainText, clientMsgId);
}

async function sendTextWithClientId(groupId, plainText, clientMsgId) {
  // Affichage optimiste immédiat avec icône horloge ('pending')
  const container = document.getElementById('chatMessages');
  let tempRow = null;
  if (groupId === AppState.activeGroupId && container) {
    tempRow = document.createElement('div');
    tempRow.className = 'msg-row sent';
    tempRow.innerHTML = `
      <div class="msg-box">
        <div class="msg-text">${escapeHtml(plainText)}</div>
        <div class="msg-footer">
          <span>${escapeHtml(formatTimeOnly(new Date().toISOString()))}</span>
          <span class="msg-status-slot">${renderDeliveryStatusIcon('pending')}</span>
        </div>
      </div>
    `;
    container.appendChild(tempRow);
    container.scrollTop = container.scrollHeight;
  }

  try {
    const enc = await FasoCrypto.encryptTextMessage(groupId, plainText);
    await FasoApi.sendEncryptedMessage(groupId, {
      ...enc,
      clientMsgId,
      messageType: 'CHAT'
    });
    AppState.failedOutgoing.delete(clientMsgId);
    await loadActiveConversationMessages({ preserveScroll: false });
    await loadConversations({ keepSelection: true });
  } catch (err) {
    if (tempRow && tempRow.parentNode) tempRow.parentNode.removeChild(tempRow);
    AppState.failedOutgoing.set(clientMsgId, { groupId, plainText });
    showToast(`Envoi interrompu : ${formatApiError(err.message)}`, 'error');
    await loadActiveConversationMessages({ preserveScroll: false });
  }
}

async function retryFailedMessage(clientMsgId) {
  const item = AppState.failedOutgoing.get(clientMsgId);
  if (!item) return;
  AppState.failedOutgoing.delete(clientMsgId);
  await sendTextWithClientId(item.groupId, item.plainText, clientMsgId);
}

// --- Pièces jointes chiffrées de bout en bout (AES-256-GCM + Megolm) ---
async function handleEncryptedFileSelection(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  const groupId = AppState.activeGroupId;
  if (!file || !groupId) return;

  if (file.size > 25 * 1024 * 1024) {
    showToast('La taille maximale autorisée par fichier est de 25 Mo.', 'error');
    return;
  }

  showToast('Chiffrement local AES-256-GCM du fichier en cours...', 'info');
  try {
    const buffer = await file.arrayBuffer();
    const encFile = await FasoCrypto.encryptFile(buffer, file.name, file.type);

    // 1. Téléverser le blob binaire opaque (sans nom ni clé en clair)
    const uploadRes = await FasoApi.uploadGroupEncryptedFile(groupId, encFile.encryptedBlob);

    // 2. Transmettre la clé AES-256-GCM, l'IV, le SHA-256 et le nom réel à l'intérieur du message Megolm
    const megolmDescriptor = await FasoCrypto.encryptPayload(groupId, {
      kind: 'file',
      fileId: uploadRes.fileId,
      fileKeyBase64: encFile.fileKeyBase64,
      ivBase64: encFile.ivBase64,
      sha256Base64: encFile.sha256Base64,
      originalName: encFile.originalName,
      originalMime: encFile.originalMime,
      originalSize: encFile.originalSize
    });

    await FasoApi.sendEncryptedMessage(groupId, {
      ...megolmDescriptor,
      fileId: uploadRes.fileId,
      clientMsgId: `cfile_${Date.now()}_${FasoCrypto._generateRandomHex(5)}`,
      messageType: 'FILE'
    });

    showToast('Document chiffré transmis.', 'success');
    await loadActiveConversationMessages({ preserveScroll: false });
    await loadConversations({ keepSelection: true });
  } catch (err) {
    showToast(`Échec d'envoi du fichier : ${formatApiError(err.message)}`, 'error');
  }
}

async function downloadAndDecryptAttachment(messageId) {
  const meta = AppState.decryptedFileMeta.get(messageId);
  if (!meta) {
    showToast('Clé de déchiffrement du fichier indisponible sur ce terminal.', 'error');
    return;
  }

  try {
    const cipherBlob = await FasoApi.downloadEncryptedFile(meta.fileId);
    const clearBlob = await FasoCrypto.decryptFile(
      cipherBlob,
      meta.fileKeyBase64,
      meta.ivBase64,
      meta.sha256Base64,
      meta.originalMime
    );

    const url = URL.createObjectURL(clearBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.originalName || 'document_fasobrief';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (err) {
    showToast(`Déchiffrement impossible : ${formatApiError(err.message)}`, 'error');
  }
}

// --- Modale « Infos du message » ---
async function openMessageInfoModal(messageId) {
  const body = document.getElementById('modalMsgInfoBody');
  body.innerHTML = `<div class="empty-state">Chargement des accusés de remise...</div>`;
  openModal('modalMessageInfo');

  try {
    const res = await FasoApi.getMessageInfo(messageId);
    const m = res.message;
    const recs = res.recipients || [];

    const legendHtml = `
      <div class="status-legend">
        <span class="status-legend-item">${Icons.clock} En attente</span>
        <span class="status-legend-item">${Icons.checkSingle} Envoyé serveur</span>
        <span class="status-legend-item">${Icons.checkDoubleGrey} Reçu appareil</span>
        <span class="status-legend-item"><span class="status-icon read">${Icons.checkDoubleGreen}</span> Lu</span>
      </div>
    `;

    const metaHtml = `
      <div style="margin-bottom: 12px; font-size: var(--fs-xs); color: var(--text-secondary);">
        <div>Émis le : <strong>${escapeHtml(formatDateTime(m.createdAt))}</strong></div>
        <div>Protocole : <span class="badge badge-mono">${escapeHtml(m.protocol || 'megolm.v1')}</span></div>
        ${m.megolmSessionId ? `<div style="margin-top:4px;">Session Megolm : <code>${escapeHtml(m.megolmSessionId.slice(0, 24))}...</code></div>` : ''}
      </div>
    `;

    const rowsHtml = recs.length === 0
      ? `<div class="empty-state">Aucun autre destinataire actif dans cette conversation.</div>`
      : `<div class="compact-list">${recs.map((r) => {
          let badge = `<span class="badge badge-amber">En attente</span>`;
          let dates = 'Pas encore remis sur le terminal';
          if (r.status === 'read') {
            badge = `<span class="badge badge-green">Lu</span>`;
            dates = `Lu à ${formatDateTime(r.readAt)}${r.deliveredAt ? ` • Reçu à ${formatTimeOnly(r.deliveredAt)}` : ''}`;
          } else if (r.status === 'delivered') {
            badge = `<span class="badge">Reçu sur appareil</span>`;
            dates = `Reçu à ${formatDateTime(r.deliveredAt)}`;
          }
          return `
            <div class="list-row">
              <div class="list-row-main">
                <div class="list-row-title">${escapeHtml(r.fullName)} <span class="badge">${escapeHtml(r.matricule)}</span></div>
                <div class="list-row-sub">${escapeHtml(dates)}</div>
              </div>
              <div class="list-row-actions">${badge}</div>
            </div>
          `;
        }).join('')}</div>`;

    body.innerHTML = legendHtml + metaHtml + rowsHtml;
  } catch (err) {
    body.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

// --- Modale « Paramètres et membres de la conversation » ---
async function openConversationInfoModal() {
  const groupId = AppState.activeGroupId;
  if (!groupId) return;

  const body = document.getElementById('modalConvInfoBody');
  body.innerHTML = `<div class="empty-state">Chargement des détails...</div>`;
  openModal('modalConversationInfo');

  try {
    const [detailRes, dirRes] = await Promise.all([
      FasoApi.getGroupDetails(groupId),
      FasoApi.getDirectory()
    ]);

    const grp = detailRes.group;
    const members = detailRes.members || [];
    const mutedList = (FasoApi.currentUser && FasoApi.currentUser.notifMutedGroups) || [];
    const isMuted = mutedList.includes(groupId);

    const isDirect = grp.type === 'DIRECT';
    const memberIdsSet = new Set(members.map((m) => m.id));
    const addableAgents = (dirRes.agents || []).filter((a) => !memberIdsSet.has(a.id));

    let html = `
      <div class="inline-alert" style="background-color: var(--bg-subtle); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="font-weight: var(--fw-semibold);">${isDirect ? 'Conversation individuelle (DIRECT)' : 'Groupe de travail officiel'}</div>
          <div class="form-hint">Époque de clé Megolm : #${Number(grp.keyEpoch || 1)} (rotation automatique à chaque retrait/révocation)</div>
        </div>
        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:var(--fw-medium);">
          <input type="checkbox" ${isMuted ? 'checked' : ''} onchange="toggleGroupMute('${escapeAttr(groupId)}', this.checked)" style="width:17px; height:17px; accent-color:var(--brand);">
          <span>Mettre en sourdine</span>
        </label>
      </div>
    `;

    if (!isDirect && grp.canManage) {
      html += `
        <form onsubmit="submitEditGroupMeta(event, '${escapeAttr(groupId)}')" style="margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border);">
          <div class="form-group">
            <label class="form-label" for="editGrpName">Nom du groupe</label>
            <input id="editGrpName" class="form-input" type="text" value="${escapeAttr(grp.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="editGrpDesc">Description</label>
            <input id="editGrpDesc" class="form-input" type="text" value="${escapeAttr(grp.description || '')}">
          </div>
          <button type="submit" class="btn btn-secondary btn-sm">Enregistrer les modifications</button>
        </form>
      `;
    }

    html += `<div style="font-weight: var(--fw-semibold); margin-bottom: 8px;">Membres actifs (${members.length})</div>`;
    html += `<div class="compact-list" style="margin-bottom: 14px;">`;
    members.forEach((m) => {
      const canRemove = !isDirect && grp.canManage && m.id !== FasoApi.currentUser.id;
      html += `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">
              ${escapeHtml(m.fullName)}
              <span class="badge">${escapeHtml(m.role)}</span>
              ${!isDirect ? `<span class="badge badge-green">${escapeHtml(m.memberRole)}</span>` : ''}
            </div>
            <div class="list-row-sub">${escapeHtml(m.matricule)} • ${escapeHtml(m.serviceMinistry)}</div>
          </div>
          <div class="list-row-actions">
            ${canRemove ? `<button type="button" class="btn btn-danger btn-sm" onclick="removeMemberFromActiveGroup('${escapeAttr(groupId)}', '${escapeAttr(m.id)}')">Retirer</button>` : ''}
          </div>
        </div>
      `;
    });
    html += `</div>`;

    if (!isDirect && grp.canManage && addableAgents.length > 0) {
      html += `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom: 14px;">
          <select id="addGroupMemberSelect" class="form-select" style="flex:1; min-width:200px;">
            ${addableAgents.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.fullName)} (${escapeHtml(a.matricule)} • ${escapeHtml(a.role)})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-primary btn-sm" onclick="addSelectedMemberToGroup('${escapeAttr(groupId)}')">Ajouter au groupe</button>
        </div>
      `;
    }

    if (!isDirect) {
      html += `
        <div style="display:flex; justify-content:flex-end; padding-top: 8px; border-top: 1px solid var(--border);">
          <button type="button" class="btn btn-danger btn-sm" onclick="leaveCurrentGroup('${escapeAttr(groupId)}')">Quitter ce groupe</button>
        </div>
      `;
    }

    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function toggleGroupMute(groupId, muted) {
  const current = new Set((FasoApi.currentUser && FasoApi.currentUser.notifMutedGroups) || []);
  if (muted) current.add(groupId);
  else current.delete(groupId);
  try {
    await FasoApi.updatePreferences({ notifMutedGroups: Array.from(current) });
    showToast(muted ? 'Notifications du canal mises en sourdine.' : 'Notifications du canal réactivées.', 'success');
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function submitEditGroupMeta(event, groupId) {
  event.preventDefault();
  const name = document.getElementById('editGrpName').value.trim();
  const description = document.getElementById('editGrpDesc').value.trim();
  try {
    await FasoApi.updateGroup(groupId, { name, description });
    showToast('Informations du groupe mises à jour.', 'success');
    await loadConversations({ keepSelection: true });
    await openConversationInfoModal();
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function addSelectedMemberToGroup(groupId) {
  const sel = document.getElementById('addGroupMemberSelect');
  if (!sel || !sel.value) return;
  try {
    await FasoApi.addGroupMembers(groupId, [sel.value]);
    FasoCrypto.invalidateOutboundGroupSession(groupId);
    showToast('Membre ajouté et session Megolm mise à jour.', 'success');
    await loadConversations({ keepSelection: true });
    await openConversationInfoModal();
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function removeMemberFromActiveGroup(groupId, userId) {
  try {
    await FasoApi.removeGroupMember(groupId, userId);
    FasoCrypto.invalidateOutboundGroupSession(groupId);
    showToast('Membre retiré et clé Megolm renouvelée.', 'success');
    await loadConversations({ keepSelection: true });
    await openConversationInfoModal();
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function leaveCurrentGroup(groupId) {
  try {
    await FasoApi.leaveGroup(groupId);
    FasoCrypto.invalidateOutboundGroupSession(groupId);
    closeModal('modalConversationInfo');
    AppState.activeGroupId = null;
    document.body.classList.remove('mobile-chat-open');
    showToast('Vous avez quitté le groupe.', 'success');
    await loadConversations({ keepSelection: false });
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

// ============================================================================
// VUE 2 : ANNUAIRE INSTITUTIONNEL & CRÉATION DE GROUPES / CONVERSATIONS DIRECTES
// ============================================================================
async function loadDirectoryView() {
  if (!FasoApi.token) return;
  const q = (document.getElementById('dirSearchInput').value || '').trim();
  const orgId = document.getElementById('dirOrgSelect').value;
  const directionId = document.getElementById('dirDirectionSelect').value;
  const serviceId = document.getElementById('dirServiceSelect').value;
  const includeAll = document.getElementById('dirIncludeAllCheck').checked ? '1' : '0';

  try {
    const res = await FasoApi.getDirectory({ q, orgId, directionId, serviceId, includeAllStatuses: includeAll });
    AppState.directoryCache = res;
    populateDirectoryFilters(res, { orgId, directionId, serviceId });
    renderDirectoryAgents(res.agents || []);
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function populateDirectoryFilters(data, selected) {
  const orgSel = document.getElementById('dirOrgSelect');
  const dirSel = document.getElementById('dirDirectionSelect');
  const srvSel = document.getElementById('dirServiceSelect');

  orgSel.innerHTML = `<option value="">Toutes les organisations</option>` +
    (data.organisations || []).map((o) =>
      `<option value="${escapeAttr(o.id)}" ${o.id === selected.orgId ? 'selected' : ''}>${escapeHtml(o.code)} — ${escapeHtml(o.name)}</option>`
    ).join('');

  const filteredDirs = (data.directions || []).filter((d) => !selected.orgId || d.orgId === selected.orgId);
  dirSel.innerHTML = `<option value="">Toutes les directions</option>` +
    filteredDirs.map((d) =>
      `<option value="${escapeAttr(d.id)}" ${d.id === selected.directionId ? 'selected' : ''}>${escapeHtml(d.code)} — ${escapeHtml(d.name)}</option>`
    ).join('');

  const filteredSrvs = (data.services || []).filter((s) =>
    (!selected.orgId || s.orgId === selected.orgId) &&
    (!selected.directionId || s.directionId === selected.directionId)
  );
  srvSel.innerHTML = `<option value="">Tous les services</option>` +
    filteredSrvs.map((s) =>
      `<option value="${escapeAttr(s.id)}" ${s.id === selected.serviceId ? 'selected' : ''}>${escapeHtml(s.name)} (${s.activeAgentCount})</option>`
    ).join('');
}

function onDirectoryOrgChange() {
  document.getElementById('dirDirectionSelect').value = '';
  document.getElementById('dirServiceSelect').value = '';
  loadDirectoryView();
}

function onDirectoryDirectionChange() {
  document.getElementById('dirServiceSelect').value = '';
  loadDirectoryView();
}

function renderDirectoryAgents(agents) {
  const listEl = document.getElementById('directoryList');
  if (!listEl) return;

  if (agents.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Aucun agent correspondant</div>
        <p>Modifiez vos critères de recherche ou de filtre hiérarchique.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = agents.map((a) => {
    const isMe = FasoApi.currentUser && a.id === FasoApi.currentUser.id;
    const isActive = a.status === 'ACTIVE';
    const statusBadge = a.status === 'ACTIVE'
      ? ''
      : `<span class="badge ${a.status === 'INVITED' ? 'badge-amber' : 'badge-red'}">${escapeHtml(a.status)}</span>`;

    return `
      <div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">
            <span class="avatar avatar-sm">${escapeHtml(getInitials(a.fullName))}</span>
            <span>${escapeHtml(a.fullName)}</span>
            <span class="badge">${escapeHtml(a.role)}</span>
            ${statusBadge}
          </div>
          <div class="list-row-sub">
            ${escapeHtml(a.matricule)} • ${escapeHtml(a.jobTitle || 'Agent public')} • ${escapeHtml(a.orgCode ? `${a.orgCode} / ${a.serviceName || a.serviceMinistry}` : a.serviceMinistry)}
          </div>
        </div>
        <div class="list-row-actions">
          ${!isMe && isActive
            ? `<button type="button" class="btn btn-primary btn-sm" onclick="startDirectMessageWith('${escapeAttr(a.id)}')">Message chiffré</button>`
            : (isMe ? `<span class="badge badge-green">Vous</span>` : '')}
        </div>
      </div>
    `;
  }).join('');
}

async function startDirectMessageWith(targetUserId) {
  try {
    const res = await FasoApi.openDirectConversation(targetUserId);
    if (res && res.group) {
      AppState.activeGroupId = res.group.id;
      switchMainView('chat');
      if (window.innerWidth < 768) {
        document.body.classList.add('mobile-chat-open');
      }
      await loadConversations({ keepSelection: true });
    }
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function openCreateGroupModal() {
  try {
    const dir = await FasoApi.getDirectory();
    const srvSel = document.getElementById('newGroupService');
    srvSel.innerHTML = `<option value="">Rattachement général</option>` +
      (dir.services || []).map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join('');

    const others = (dir.agents || []).filter((a) => a.id !== FasoApi.currentUser.id && a.status === 'ACTIVE');
    const memBox = document.getElementById('newGroupMembersList');
    memBox.innerHTML = others.length === 0
      ? `<div class="empty-state">Aucun autre agent actif disponible.</div>`
      : others.map((a) => `
          <label class="checkbox-row">
            <input type="checkbox" name="newGrpMem" value="${escapeAttr(a.id)}" checked>
            <div>
              <div style="font-weight:var(--fw-medium);">${escapeHtml(a.fullName)}</div>
              <div class="form-hint">${escapeHtml(a.matricule)} • ${escapeHtml(a.role)} • ${escapeHtml(a.serviceMinistry)}</div>
            </div>
          </label>
        `).join('');

    document.getElementById('newGroupName').value = '';
    document.getElementById('newGroupDesc').value = '';
    openModal('modalCreateGroup');
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function submitCreateGroup(event) {
  event.preventDefault();
  const name = document.getElementById('newGroupName').value.trim();
  const description = document.getElementById('newGroupDesc').value.trim();
  const serviceId = document.getElementById('newGroupService').value || null;
  const memberIds = Array.from(document.querySelectorAll('input[name="newGrpMem"]:checked')).map((el) => el.value);

  try {
    const res = await FasoApi.createGroup({ name, description, serviceId, memberIds });
    closeModal('modalCreateGroup');
    showToast('Groupe officiel créé.', 'success');
    if (res && res.group) {
      AppState.activeGroupId = res.group.id;
      switchMainView('chat');
      if (window.innerWidth < 768) document.body.classList.add('mobile-chat-open');
      await loadConversations({ keepSelection: true });
    }
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

// ============================================================================
// VUE 3 : INSTRUCTIONS ADMINISTRATIVES, VERSIONS & SIGNATURES ED25519
// ============================================================================
async function refreshInstructionsBadgeAndCache() {
  if (!FasoApi.token) return;
  try {
    await FasoCrypto.syncPendingCrypto();
    const res = await FasoApi.getInstructionsDashboard();
    const items = res.dashboard || [];

    // Déchiffrer localement chaque titre/corps d'instruction
    for (const inst of items) {
      const dec = await FasoCrypto.decryptPayload(inst.group_id, {
        ciphertext: inst.title_ciphertext,
        megolm_session_id: inst.megolm_session_id,
        sender_ed25519: inst.sender_ed25519,
        signature: inst.signature
      });
      inst._decryptedTitle = dec.ok ? ((dec.data && dec.data.title) || dec.text) : dec.text;
      inst._decryptedBody = dec.ok && dec.data ? (dec.data.description || '') : '';
      inst._decOk = dec.ok;
    }

    AppState.instructionsCache = items;
    refreshNavigationBadges();
  } catch (err) {
    console.warn('[INST] Erreur rafraîchissement instructions :', err);
  }
}

async function loadInstructionsView() {
  await refreshInstructionsBadgeAndCache();
  renderInstructionsKpis();
  renderInstructionsList();
}

function renderInstructionsKpis() {
  const list = AppState.instructionsCache;
  const published = list.filter((i) => i.status === 'PUBLIEE');
  const minePending = published.filter(
    (i) => i.is_recipient && i.my_recipient && i.my_recipient.step !== 'EXECUTEE'
  );
  const overdue = published.filter((i) => i.is_overdue);

  let totalRec = 0;
  let totalAck = 0;
  published.forEach((i) => {
    totalRec += i.total_recipients || 0;
    totalAck += i.ack_count || 0;
  });

  document.getElementById('kpiInstPublished').textContent = String(published.length);
  document.getElementById('kpiInstMinePending').textContent = String(minePending.length);
  document.getElementById('kpiInstAckRatio').textContent =
    totalRec > 0 ? `${totalAck} / ${totalRec} (${Math.round((totalAck / totalRec) * 100)} %)` : '0 / 0';
  document.getElementById('kpiInstOverdue').textContent = String(overdue.length);
}

function setInstructionFilter(filter) {
  AppState.instFilter = filter;
  document.querySelectorAll('[data-inst-filter]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-inst-filter') === filter);
  });
  renderInstructionsList();
}

function renderInstructionsList() {
  const listEl = document.getElementById('instructionsList');
  if (!listEl) return;

  const filtered = AppState.instructionsCache.filter((i) => {
    if (AppState.instFilter === 'TO_ACT') {
      return i.status === 'PUBLIEE' && i.is_recipient && i.my_recipient && i.my_recipient.step !== 'EXECUTEE';
    }
    if (AppState.instFilter === 'ISSUED') {
      return i.is_creator && i.status !== 'BROUILLON';
    }
    if (AppState.instFilter === 'OVERDUE') {
      return i.is_overdue;
    }
    if (AppState.instFilter === 'DRAFTS') {
      return i.status === 'BROUILLON' && i.is_creator;
    }
    if (AppState.instFilter === 'CLOSED') {
      return i.status === 'CLOTUREE' || i.status === 'ANNULEE';
    }
    return i.status !== 'BROUILLON' || i.is_creator;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Aucune instruction dans cette vue</div>
        <p>Les instructions publiées dans vos groupes apparaissent automatiquement ici.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map((inst) => {
    const prioBadge = inst.priority === 'URGENTE'
      ? `<span class="badge badge-red">URGENTE</span>`
      : (inst.priority === 'HAUTE' ? `<span class="badge badge-amber">HAUTE</span>` : '');
    const overdueBadge = inst.is_overdue ? `<span class="badge badge-red">EN RETARD</span>` : '';
    const myStepBadge = inst.is_recipient && inst.my_recipient
      ? renderRecipientStepBadge(inst.my_recipient.step)
      : (inst.is_creator ? `<span class="badge">Émetteur</span>` : '');

    return `
      <div class="list-row interactive" role="button" tabindex="0" onclick="openInstructionDetail('${escapeAttr(inst.id)}')" onkeydown="if(event.key==='Enter') openInstructionDetail('${escapeAttr(inst.id)}')">
        <div class="list-row-main">
          <div class="list-row-title">
            <span class="badge badge-mono">${escapeHtml(inst.instruction_ref)}</span>
            <span class="badge">v${Number(inst.version || 1)}</span>
            ${renderInstructionStatusBadge(inst.status)}
            ${prioBadge}
            ${overdueBadge}
            <span>${escapeHtml(inst._decryptedTitle || '[Instruction chiffrée]')}</span>
          </div>
          <div class="list-row-sub">
            Canal : ${escapeHtml(inst.group_name)} • Par ${escapeHtml(inst.creator_name)}
            ${inst.deadline ? ` • Échéance : ${escapeHtml(formatDateTime(inst.deadline))}` : ''}
            ${inst.status !== 'BROUILLON' ? ` • Confirmées : ${inst.ack_count}/${inst.total_recipients} • Exécutées : ${inst.executed_count}/${inst.total_recipients}` : ''}
          </div>
        </div>
        <div class="list-row-actions">
          ${myStepBadge}
          <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openInstructionDetail('${escapeAttr(inst.id)}')">Détail</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderInstructionStatusBadge(status) {
  if (status === 'BROUILLON') return `<span class="badge badge-amber">BROUILLON</span>`;
  if (status === 'CLOTUREE') return `<span class="badge badge-green">CLÔTURÉE</span>`;
  if (status === 'ANNULEE') return `<span class="badge badge-red">ANNULÉE</span>`;
  return `<span class="badge badge-green">PUBLIÉE</span>`;
}

function renderRecipientStepBadge(step) {
  if (step === 'EXECUTEE') return `<span class="badge badge-green">Exécutée</span>`;
  if (step === 'EN_COURS') return `<span class="badge badge-amber">En cours</span>`;
  if (step === 'CONFIRMEE') return `<span class="badge badge-green">Réception confirmée</span>`;
  if (step === 'CONSULTEE') return `<span class="badge badge-amber">Consultée (à confirmer)</span>`;
  return `<span class="badge badge-amber">Transmise</span>`;
}

async function openInstructionModalFromChat(prefillTitle = '', prefillBody = '') {
  await openInstructionModal({
    preselectedGroupId: AppState.activeGroupId,
    prefillTitle,
    prefillBody
  });
}

async function convertMessageToInstruction(messageId) {
  const text = AppState.decryptedMsgText.get(messageId) || '';
  await openInstructionModal({
    preselectedGroupId: AppState.activeGroupId,
    prefillTitle: text.slice(0, 120),
    prefillBody: text
  });
}

async function openInstructionModal({ preselectedGroupId = null, prefillTitle = '', prefillBody = '', editInst = null } = {}) {
  if (!FasoApi.currentUser || !['ADMIN', 'DIRECTEUR', 'CHEF_SERVICE'].includes(FasoApi.currentUser.role)) {
    showToast('Seuls les Directeurs, Chefs de service et Administrateurs émettent des instructions.', 'error');
    return;
  }

  window._instSubmitMode = 'publish';
  const groupSel = document.getElementById('instTargetGroup');
  if (AppState.conversations.length === 0) {
    await loadConversations({ keepSelection: true });
  }

  if (AppState.conversations.length === 0) {
    showToast('Ouvrez d\'abord un groupe ou une conversation avec au moins un destinataire.', 'error');
    return;
  }

  groupSel.innerHTML = AppState.conversations.map((g) =>
    `<option value="${escapeAttr(g.id)}">${escapeHtml(g.name)} (${g.type === 'DIRECT' ? 'Direct' : 'Groupe'})</option>`
  ).join('');

  const noticeEl = document.getElementById('instFormNotice');
  if (editInst) {
    document.getElementById('instEditId').value = editInst.id;
    document.getElementById('instEditMode').value = editInst.status === 'BROUILLON' ? 'edit_draft' : 'new_version';
    document.getElementById('modalInstFormTitle').textContent = editInst.status === 'BROUILLON'
      ? `Modifier le brouillon ${editInst.instruction_ref}`
      : `Nouvelle version (v${Number(editInst.version || 1) + 1}) — ${editInst.instruction_ref}`;

    groupSel.value = editInst.group_id;
    groupSel.disabled = true;
    document.getElementById('instTitleInput').value = editInst._decryptedTitle || '';
    document.getElementById('instBodyInput').value = editInst._decryptedBody || '';
    document.getElementById('instPrioritySelect').value = editInst.priority || 'NORMALE';
    document.getElementById('instDeadlineInput').value = editInst.deadline ? toDatetimeLocalValue(editInst.deadline) : '';

    document.getElementById('btnSaveDraftInst').hidden = editInst.status !== 'BROUILLON';
    document.getElementById('btnPublishInst').textContent = editInst.status === 'BROUILLON'
      ? 'Publier maintenant'
      : `Publier la version v${Number(editInst.version || 1) + 1}`;

    if (editInst.status === 'PUBLIEE') {
      noticeEl.textContent =
        'La modification d\'une instruction déjà publiée génère une nouvelle version horodatée. Les confirmations antérieures restent dans l\'historique et une nouvelle confirmation sera demandée aux destinataires.';
      noticeEl.hidden = false;
    } else {
      noticeEl.hidden = true;
    }
  } else {
    document.getElementById('instEditId').value = '';
    document.getElementById('instEditMode').value = 'create';
    document.getElementById('modalInstFormTitle').textContent = 'Nouvelle instruction administrative';
    groupSel.disabled = false;
    if (preselectedGroupId && AppState.conversations.some((g) => g.id === preselectedGroupId)) {
      groupSel.value = preselectedGroupId;
    }
    document.getElementById('instTitleInput').value = prefillTitle;
    document.getElementById('instBodyInput').value = prefillBody;
    document.getElementById('instPrioritySelect').value = 'NORMALE';
    document.getElementById('instDeadlineInput').value = '';
    document.getElementById('btnSaveDraftInst').hidden = false;
    document.getElementById('btnPublishInst').textContent = 'Publier l\'instruction';
    noticeEl.hidden = true;
  }

  await loadInstructionRecipientChoices(editInst ? editInst.recipients.map((r) => r.userId) : null);
  openModal('modalInstructionForm');
}

async function loadInstructionRecipientChoices(precheckedIds = null) {
  const groupId = document.getElementById('instTargetGroup').value;
  const box = document.getElementById('instRecipientsList');
  if (!groupId || !box) return;

  try {
    const res = await FasoApi.getGroupDetails(groupId);
    const candidates = (res.members || []).filter((m) => m.id !== FasoApi.currentUser.id);
    if (candidates.length === 0) {
      box.innerHTML = `<div class="empty-state" style="padding:14px;">Aucun autre membre actif dans ce canal.</div>`;
      return;
    }
    const checkedSet = precheckedIds ? new Set(precheckedIds) : null;
    box.innerHTML = candidates.map((m) => {
      const checked = !checkedSet || checkedSet.has(m.id);
      return `
        <label class="checkbox-row">
          <input type="checkbox" name="instRecipientChoice" value="${escapeAttr(m.id)}" ${checked ? 'checked' : ''}>
          <div>
            <div style="font-weight:var(--fw-medium);">${escapeHtml(m.fullName)}</div>
            <div class="form-hint">${escapeHtml(m.matricule)} • ${escapeHtml(m.role)}</div>
          </div>
        </label>
      `;
    }).join('');
  } catch (err) {
    box.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function submitInstructionForm(event) {
  event.preventDefault();
  const mode = window._instSubmitMode || 'publish';
  const editId = document.getElementById('instEditId').value;
  const editMode = document.getElementById('instEditMode').value;
  const groupId = document.getElementById('instTargetGroup').value;
  const title = document.getElementById('instTitleInput').value.trim();
  const description = document.getElementById('instBodyInput').value.trim();
  const priority = document.getElementById('instPrioritySelect').value;
  const deadlineRaw = document.getElementById('instDeadlineInput').value;
  const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;
  const recipientIds = Array.from(document.querySelectorAll('input[name="instRecipientChoice"]:checked')).map((c) => c.value);

  if (!title || !groupId) return;
  if (mode === 'publish' && recipientIds.length === 0) {
    showToast('Sélectionnez au moins un destinataire actif pour publier l\'instruction.', 'error');
    return;
  }

  try {
    const enc = await FasoCrypto.encryptPayload(groupId, {
      kind: 'instruction',
      title,
      description
    });

    if (editMode === 'create') {
      const isDraft = mode === 'draft';
      let msgId = null;
      if (!isDraft) {
        const msgRes = await FasoApi.sendEncryptedMessage(groupId, {
          ...enc,
          clientMsgId: `cinst_${Date.now()}_${FasoCrypto._generateRandomHex(5)}`,
          messageType: 'INSTRUCTION'
        });
        msgId = msgRes.message.id;
      }

      await FasoApi.createInstruction({
        messageId: msgId,
        titleCiphertext: enc.ciphertext,
        megolmSessionId: enc.megolmSessionId,
        senderEd25519: enc.senderEd25519,
        signature: enc.signature,
        deadline,
        priority,
        groupId,
        recipientIds,
        isDraft
      });
      showToast(isDraft ? 'Brouillon enregistré.' : 'Instruction publiée et notifiée.', 'success');
    } else if (editMode === 'edit_draft') {
      if (mode === 'draft') {
        await FasoApi.updateInstruction(editId, {
          titleCiphertext: enc.ciphertext,
          megolmSessionId: enc.megolmSessionId,
          priority,
          deadline
        });
        showToast('Brouillon mis à jour.', 'success');
      } else {
        await FasoApi.updateInstruction(editId, {
          titleCiphertext: enc.ciphertext,
          megolmSessionId: enc.megolmSessionId,
          priority,
          deadline
        });
        const msgRes = await FasoApi.sendEncryptedMessage(groupId, {
          ...enc,
          clientMsgId: `cpub_${Date.now()}_${FasoCrypto._generateRandomHex(5)}`,
          messageType: 'INSTRUCTION'
        });
        await FasoApi.publishInstruction(editId, {
          messageId: msgRes.message.id,
          titleCiphertext: enc.ciphertext,
          megolmSessionId: enc.megolmSessionId,
          senderEd25519: enc.senderEd25519,
          signature: enc.signature,
          recipientIds
        });
        showToast('Brouillon publié officiellement.', 'success');
      }
    } else if (editMode === 'new_version') {
      const msgRes = await FasoApi.sendEncryptedMessage(groupId, {
        ...enc,
        clientMsgId: `cver_${Date.now()}_${FasoCrypto._generateRandomHex(5)}`,
        messageType: 'INSTRUCTION'
      });
      await FasoApi.updateInstruction(editId, {
        messageId: msgRes.message.id,
        titleCiphertext: enc.ciphertext,
        megolmSessionId: enc.megolmSessionId,
        senderEd25519: enc.senderEd25519,
        signature: enc.signature,
        priority,
        deadline,
        recipientIds
      });
      showToast('Nouvelle version publiée. Confirmation redemandée aux destinataires.', 'success');
    }

    closeModal('modalInstructionForm');
    await refreshInstructionsBadgeAndCache();
    if (AppState.currentView === 'instructions') renderInstructionsList();
    if (AppState.activeGroupId === groupId) await loadActiveConversationMessages({ preserveScroll: false });
    if (AppState.openInstructionId === editId && editId) {
      await openInstructionDetail(editId, { skipMarkViewed: true });
    }
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function openInstructionDetail(instructionId, { skipMarkViewed = false } = {}) {
  AppState.openInstructionId = instructionId;
  const body = document.getElementById('modalInstDetailBody');
  const footer = document.getElementById('modalInstDetailFooter');
  body.innerHTML = `<div class="empty-state">Déchiffrement de l'instruction...</div>`;
  footer.innerHTML = '';
  openModal('modalInstructionDetail');

  try {
    // Ouvrir le détail enregistre uniquement la consultation ('viewed_at'), jamais la confirmation !
    if (!skipMarkViewed) {
      await FasoApi.markInstructionViewed(instructionId).catch(() => {});
    }

    const res = await FasoApi.getInstructionDetails(instructionId);
    const inst = res.instruction;
    const events = res.events || [];

    const dec = await FasoCrypto.decryptPayload(inst.group_id, {
      ciphertext: inst.title_ciphertext,
      megolm_session_id: inst.megolm_session_id,
      sender_ed25519: inst.sender_ed25519,
      signature: inst.signature
    });

    inst._decryptedTitle = dec.ok ? ((dec.data && dec.data.title) || dec.text) : dec.text;
    inst._decryptedBody = dec.ok && dec.data ? (dec.data.description || '') : '';

    document.getElementById('modalInstDetailTitle').textContent = `${inst.instruction_ref} (v${inst.version || 1})`;

    let recipientNotice = '';
    if (inst.is_recipient && inst.status === 'PUBLIEE' && inst.my_recipient) {
      if (!inst.my_recipient.acknowledgedAt) {
        recipientNotice = `
          <div class="inline-alert warning">
            <strong>Consultation enregistrée — Confirmation formelle requise :</strong>
            L'ouverture de cette fiche ne vaut pas acceptation. Cliquez sur « Confirmer la réception (Signature Ed25519) » ci-dessous.
          </div>
        `;
      } else if (inst.my_recipient.step !== 'EXECUTEE') {
        recipientNotice = `
          <div class="inline-alert success">
            Réception confirmée et signée Ed25519 le ${escapeHtml(formatDateTime(inst.my_recipient.acknowledgedAt))}. Vous pouvez signaler l'avancement ou déclarer l'exécution.
          </div>
        `;
      } else {
        recipientNotice = `
          <div class="inline-alert success">
            Instruction exécutée par vos soins le ${escapeHtml(formatDateTime(inst.my_recipient.executedAt))}.
          </div>
        `;
      }
    }

    // Déchiffrer les éventuels comptes rendus d'exécution chiffrés
    const recipientRowsHtml = [];
    for (const r of inst.recipients || []) {
      let execNote = '';
      if (r.executionCiphertext && r.executionSessionId) {
        const execDec = await FasoCrypto.decryptPayload(inst.group_id, {
          ciphertext: r.executionCiphertext,
          megolm_session_id: r.executionSessionId
        });
        if (execDec.ok && execDec.text) {
          execNote = `<div style="margin-top:4px; color:var(--brand); font-size:var(--fs-xs);">Compte rendu E2EE : ${escapeHtml(execDec.text)}</div>`;
        }
      }

      const times = [];
      if (r.viewedAt) times.push(`Consultée : ${formatDateTime(r.viewedAt)}`);
      if (r.acknowledgedAt) times.push(`Confirmée v${r.ackVersion} : ${formatDateTime(r.acknowledgedAt)}`);
      if (r.inProgressAt && !r.executedAt) times.push(`En cours : ${formatDateTime(r.inProgressAt)}`);
      if (r.executedAt) times.push(`Exécutée : ${formatDateTime(r.executedAt)}`);

      recipientRowsHtml.push(`
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">
              ${escapeHtml(r.fullName)}
              <span class="badge">${escapeHtml(r.matricule)}</span>
              ${r.signatureVerified ? `<span class="badge badge-green">Ed25519 vérifiée</span>` : ''}
              ${r.isOverdue ? `<span class="badge badge-red">En retard</span>` : ''}
            </div>
            <div class="list-row-sub">${escapeHtml(times.join(' • ') || 'En attente d\'ouverture par le destinataire')}</div>
            ${execNote}
          </div>
          <div class="list-row-actions">${renderRecipientStepBadge(r.step)}</div>
        </div>
      `);
    }

    const eventsHtml = events.map((ev) => `
      <div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">
            <span class="badge badge-mono">${escapeHtml(ev.eventType)}</span>
            <span class="badge">v${Number(ev.version || 1)}</span>
            <span>${escapeHtml(ev.actorName)}</span>
          </div>
          <div class="list-row-sub">${escapeHtml(formatDateTime(ev.createdAt))}</div>
        </div>
      </div>
    `).join('');

    body.innerHTML = `
      ${recipientNotice}
      <div style="margin-bottom: 14px;">
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          ${renderInstructionStatusBadge(inst.status)}
          <span class="badge">Priorité : ${escapeHtml(inst.priority || 'NORMALE')}</span>
          ${inst.is_overdue ? `<span class="badge badge-red">ÉCHÉANCE DÉPASSÉE</span>` : ''}
        </div>
        <h3 style="font-size: var(--fs-lg); font-weight: var(--fw-semibold); margin-bottom: 6px;">
          ${escapeHtml(inst._decryptedTitle)}
        </h3>
        ${inst._decryptedBody ? `<p style="white-space: pre-wrap; color: var(--text-primary); margin-bottom: 10px;">${escapeHtml(inst._decryptedBody)}</p>` : ''}
        <div style="font-size: var(--fs-xs); color: var(--text-secondary);">
          Émetteur : <strong>${escapeHtml(inst.creator_name)}</strong> • Canal : <strong>${escapeHtml(inst.group_name)}</strong>
          ${inst.deadline ? ` • Échéance : <strong>${escapeHtml(formatDateTime(inst.deadline))}</strong>` : ' • Sans échéance fixe'}
        </div>
      </div>

      <div style="font-weight: var(--fw-semibold); margin-bottom: 6px;">Suivi nominatif des destinataires (${inst.recipients.length})</div>
      <div class="compact-list" style="margin-bottom: 16px;">
        ${recipientRowsHtml.join('') || `<div class="empty-state" style="padding:14px;">Destinataires assignés à la publication.</div>`}
      </div>

      <div style="font-weight: var(--fw-semibold); margin-bottom: 6px;">Historique des versions et preuves (${events.length})</div>
      <div class="compact-list">
        ${eventsHtml || `<div class="empty-state" style="padding:14px;">Aucun événement.</div>`}
      </div>
    `;

    // Actions du pied de modale selon le rôle réel (Destinataire vs Émetteur)
    const actions = [];
    if (inst.is_recipient && inst.status === 'PUBLIEE' && inst.my_recipient) {
      if (!inst.my_recipient.acknowledgedAt) {
        actions.push(`<button type="button" class="btn btn-primary btn-sm" onclick="confirmInstructionReceiptSigned('${escapeAttr(inst.id)}', ${Number(inst.version || 1)})">Confirmer la réception (Signature Ed25519)</button>`);
      } else if (inst.my_recipient.step !== 'EXECUTEE') {
        if (inst.my_recipient.step !== 'EN_COURS') {
          actions.push(`<button type="button" class="btn btn-secondary btn-sm" onclick="markInstructionProgressAction('${escapeAttr(inst.id)}')">Marquer en cours</button>`);
        }
        actions.push(`<button type="button" class="btn btn-primary btn-sm" onclick="promptDeclareInstructionExecution('${escapeAttr(inst.id)}', '${escapeAttr(inst.group_id)}')">Déclarer exécutée</button>`);
      }
    }

    if (inst.is_creator) {
      if (inst.status === 'BROUILLON') {
        actions.push(`<button type="button" class="btn btn-primary btn-sm" onclick="editCurrentInstructionFromDetail()">Compléter / Publier le brouillon</button>`);
      } else if (inst.status === 'PUBLIEE') {
        actions.push(`<button type="button" class="btn btn-secondary btn-sm" onclick="editCurrentInstructionFromDetail()">Modifier (Nouvelle version)</button>`);
        actions.push(`<button type="button" class="btn btn-primary btn-sm" onclick="changeInstructionFinalState('${escapeAttr(inst.id)}', 'CLOTUREE')">Clôturer</button>`);
        actions.push(`<button type="button" class="btn btn-danger btn-sm" onclick="changeInstructionFinalState('${escapeAttr(inst.id)}', 'ANNULEE')">Annuler</button>`);
      }
    }

    actions.push(`<button type="button" class="btn btn-secondary btn-sm" onclick="closeModal('modalInstructionDetail')">Fermer</button>`);
    footer.innerHTML = actions.join('');
    window._lastOpenedInstObj = inst;

    await refreshInstructionsBadgeAndCache();
    if (AppState.currentView === 'instructions') renderInstructionsList();
  } catch (err) {
    body.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function editCurrentInstructionFromDetail() {
  const inst = window._lastOpenedInstObj;
  if (!inst) return;
  closeModal('modalInstructionDetail');
  await openInstructionModal({ editInst: inst });
}

async function confirmInstructionReceiptSigned(instructionId, version) {
  try {
    const sig = FasoCrypto.signInstructionAck(instructionId, version, FasoApi.currentUser.id);
    await FasoApi.acknowledgeInstruction(instructionId, sig);
    showToast('Réception confirmée avec signature Ed25519 vérifiée.', 'success');
    await openInstructionDetail(instructionId, { skipMarkViewed: true });
    if (AppState.activeGroupId) await loadActiveConversationMessages({ preserveScroll: true });
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function markInstructionProgressAction(instructionId) {
  try {
    await FasoApi.markInstructionInProgress(instructionId);
    showToast('Statut passé à « En cours de traitement ».', 'success');
    await openInstructionDetail(instructionId, { skipMarkViewed: true });
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function promptDeclareInstructionExecution(instructionId, groupId) {
  openActionConfirmModal({
    title: 'Déclarer l\'exécution de l\'instruction',
    description: 'Vous pouvez joindre une note de compte rendu chiffrée de bout en bout à destination de l\'émetteur.',
    inputLabel: 'Compte rendu d\'exécution (optionnel, chiffré Megolm)',
    inputPlaceholder: 'ex. Rapport transmis et archivé sous référence interne',
    inputRequired: false,
    submitLabel: 'Valider l\'exécution',
    danger: false,
    onConfirm: async (noteText) => {
      let executionCiphertext = null;
      let executionSessionId = null;
      if (noteText) {
        const enc = await FasoCrypto.encryptTextMessage(groupId, noteText);
        executionCiphertext = enc.ciphertext;
        executionSessionId = enc.megolmSessionId;
      }
      await FasoApi.declareInstructionExecuted(instructionId, { executionCiphertext, executionSessionId });
      showToast('Exécution déclarée et notifiée à l\'émetteur.', 'success');
      await openInstructionDetail(instructionId, { skipMarkViewed: true });
    }
  });
}

async function changeInstructionFinalState(instructionId, status) {
  try {
    await FasoApi.setInstructionFinalStatus(instructionId, status);
    showToast(status === 'CLOTUREE' ? 'Instruction clôturée.' : 'Instruction annulée.', 'success');
    await openInstructionDetail(instructionId, { skipMarkViewed: true });
    if (AppState.activeGroupId) await loadActiveConversationMessages({ preserveScroll: true });
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

// ============================================================================
// VUE 4 : CENTRE DE NOTIFICATIONS INTERNES & PRÉFÉRENCES OPT-IN
// ============================================================================
async function refreshUnreadNotificationsCount() {
  if (!FasoApi.token) return;
  try {
    const res = await FasoApi.getNotifications();
    AppState.unreadNotifications = res.unreadCount || 0;
    refreshNavigationBadges();
  } catch (_) {}
}

async function loadNotificationsView() {
  if (!FasoApi.token) return;
  const listEl = document.getElementById('notificationsList');
  try {
    const res = await FasoApi.getNotifications();
    AppState.unreadNotifications = res.unreadCount || 0;
    refreshNavigationBadges();

    const items = res.notifications || [];
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Aucune notification</div>
          <p>Les alertes de nouveaux messages, groupes et instructions s'afficheront ici.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((n) => `
      <div class="list-row interactive ${n.isRead ? '' : 'unread-notif'}" role="button" tabindex="0" onclick="openNotificationTarget('${escapeAttr(n.id)}', '${escapeAttr(n.groupId || '')}', '${escapeAttr(n.instructionId || '')}')" onkeydown="if(event.key==='Enter') openNotificationTarget('${escapeAttr(n.id)}', '${escapeAttr(n.groupId || '')}', '${escapeAttr(n.instructionId || '')}')">
        <div class="list-row-main">
          <div class="list-row-title">
            ${!n.isRead ? `<span class="badge badge-green">Non lu</span>` : ''}
            ${n.count > 1 ? `<span class="badge">x${Number(n.count)}</span>` : ''}
            <span>${escapeHtml(n.title)}</span>
          </div>
          <div class="list-row-sub">${escapeHtml(n.body)} • ${escapeHtml(formatDateTime(n.updatedAt || n.createdAt))}</div>
        </div>
        <div class="list-row-actions">
          <span class="badge">${escapeHtml(n.type)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function openNotificationTarget(notifId, groupId, instructionId) {
  try {
    const res = await FasoApi.markNotificationRead(notifId);
    AppState.unreadNotifications = res.unreadCount || 0;
    refreshNavigationBadges();
  } catch (_) {}

  if (instructionId) {
    switchMainView('instructions');
    await openInstructionDetail(instructionId);
  } else if (groupId) {
    switchMainView('chat');
    await openConversation(groupId);
  } else {
    await loadNotificationsView();
  }
}

async function markAllNotificationsAsRead() {
  try {
    await FasoApi.markAllNotificationsRead();
    AppState.unreadNotifications = 0;
    refreshNavigationBadges();
    await loadNotificationsView();
    showToast('Toutes les notifications ont été marquées comme lues.', 'success');
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function toggleBrowserNotifications(event) {
  const wantEnable = event.target.checked;
  if (wantEnable) {
    if (!('Notification' in window)) {
      event.target.checked = false;
      showToast('Ce navigateur ne supporte pas l\'API locale Notification.', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      event.target.checked = false;
      showToast('Permission refusée dans le navigateur.', 'error');
      return;
    }
  }
  try {
    await FasoApi.updatePreferences({ notifBrowserEnabled: wantEnable });
    showToast(wantEnable ? 'Alertes navigateur activées (application ouverte).' : 'Alertes navigateur désactivées.', 'success');
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function maybeTriggerBrowserNotification(notif) {
  if (!notif || !FasoApi.currentUser || !FasoApi.currentUser.notifBrowserEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('FasoBrief — Alerte administrative', {
      body: notif.title || 'Nouvel événement disponible dans FasoBrief.',
      tag: notif.dedup_key || notif.id
    });
  } catch (_) {}
}

// ============================================================================
// VUE 5 : ADMINISTRATION, INVITATIONS, SUSPENSION/RÉVOCATION & AUDIT
// ============================================================================
function switchAdminSubTab(tab) {
  AppState.adminSubTab = tab;
  document.querySelectorAll('[data-admin-tab]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-admin-tab') === tab);
  });
  document.getElementById('adminSubUsers').hidden = tab !== 'users';
  document.getElementById('adminSubAudit').hidden = tab !== 'audit';
  document.getElementById('adminSubProofs').hidden = tab !== 'proofs';

  if (tab === 'users') loadAdminUsersView();
  if (tab === 'audit') loadAuditLogsView();
}

async function loadAdminView() {
  switchAdminSubTab(AppState.adminSubTab || 'users');
}

async function loadAdminUsersView() {
  const listEl = document.getElementById('adminUsersList');
  if (!listEl) return;
  try {
    const res = await FasoApi.getAdminUsers();
    const me = FasoApi.currentUser;
    const isAdmin = me && me.role === 'ADMIN';

    listEl.innerHTML = (res.users || []).map((u) => {
      const isSelf = me && u.id === me.id;
      let statusBadge = `<span class="badge badge-green">ACTIVE</span>`;
      if (u.status === 'INVITED') statusBadge = `<span class="badge badge-amber">INVITED</span>`;
      if (u.status === 'SUSPENDED') statusBadge = `<span class="badge badge-amber">SUSPENDED</span>`;
      if (u.status === 'REVOKED' || u.is_revoked === 1) statusBadge = `<span class="badge badge-red">REVOKED</span>`;

      const canSuspend = isAdmin && !isSelf && u.status === 'ACTIVE';
      const canReactivate = isAdmin && u.status === 'SUSPENDED' && u.is_revoked === 0;
      const canRevoke =
        !isSelf &&
        u.status !== 'REVOKED' &&
        u.is_revoked === 0 &&
        (isAdmin || (me.role === 'DIRECTEUR' && u.role !== 'ADMIN'));

      return `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">
              <span>${escapeHtml(u.full_name)}</span>
              <span class="badge">${escapeHtml(u.matricule)}</span>
              <span class="badge">${escapeHtml(u.role)}</span>
              ${statusBadge}
            </div>
            <div class="list-row-sub">
              ${escapeHtml(u.service_ministry)} • Sessions actives : ${Number(u.active_sessions || 0)} • Terminaux Olm : ${Number(u.device_count || 0)}
              ${u.revocation_reason ? ` • Motif : ${escapeHtml(u.revocation_reason)}` : ''}
            </div>
          </div>
          <div class="list-row-actions">
            ${canSuspend ? `<button type="button" class="btn btn-secondary btn-sm" onclick="promptSuspendUser('${escapeAttr(u.id)}', '${escapeAttr(u.full_name)}')">Suspendre</button>` : ''}
            ${canReactivate ? `<button type="button" class="btn btn-primary btn-sm" onclick="executeReactivateUser('${escapeAttr(u.id)}')">Réactiver</button>` : ''}
            ${canRevoke ? `<button type="button" class="btn btn-danger btn-sm" onclick="promptRevokeUser('${escapeAttr(u.id)}', '${escapeAttr(u.full_name)}')">Révoquer</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function openInviteModal() {
  try {
    const dir = await FasoApi.getDirectory();
    const sel = document.getElementById('invServiceId');
    sel.innerHTML = (dir.services || []).map((s) =>
      `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`
    ).join('');
    document.getElementById('invMatricule').value = '';
    document.getElementById('invFullName').value = '';
    document.getElementById('invJobTitle').value = '';
    openModal('modalInviteAgent');
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

async function submitInviteAgent(event) {
  event.preventDefault();
  const payload = {
    matricule: document.getElementById('invMatricule').value.trim(),
    fullName: document.getElementById('invFullName').value.trim(),
    jobTitle: document.getElementById('invJobTitle').value.trim(),
    role: document.getElementById('invRole').value,
    serviceId: document.getElementById('invServiceId').value
  };

  try {
    const res = await FasoApi.createInvitation(payload);
    closeModal('modalInviteAgent');
    document.getElementById('invitedTargetLabel').textContent = `${res.user.fullName} (${res.user.matricule})`;
    document.getElementById('invitedOneTimeCode').textContent = res.activationCode;
    document.getElementById('oneTimeInviteResult').hidden = false;
    showToast('Compte invité créé. Code à usage unique généré.', 'success');
    await loadAdminUsersView();
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function promptSuspendUser(userId, fullName) {
  openActionConfirmModal({
    title: `Suspendre temporairement ${fullName}`,
    description: 'Toutes les sessions actives et WebSockets de cet agent seront immédiatement coupés.',
    inputLabel: 'Motif administratif de suspension',
    inputPlaceholder: 'ex. Absence prolongée / Vérification administrative',
    inputRequired: true,
    submitLabel: 'Suspendre le compte',
    danger: true,
    onConfirm: async (reason) => {
      await FasoApi.suspendUser(userId, reason);
      showToast(`Compte de ${fullName} suspendu.`, 'success');
      await loadAdminUsersView();
    }
  });
}

async function executeReactivateUser(userId) {
  try {
    await FasoApi.reactivateUser(userId);
    showToast('Compte réactivé.', 'success');
    await loadAdminUsersView();
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function promptRevokeUser(userId, fullName) {
  openActionConfirmModal({
    title: `Révoquer définitivement ${fullName}`,
    description: 'Action irréversible : coupe instantanément tous les WebSockets, supprime les clés publiques Olm, retire l\'agent de toutes les conversations et déclenche la rotation Megolm.',
    inputLabel: 'Motif officiel de révocation',
    inputPlaceholder: 'ex. Fin de mission / Compromission ou perte de terminal',
    inputRequired: true,
    submitLabel: 'Révoquer immédiatement',
    danger: true,
    onConfirm: async (reason) => {
      await FasoApi.revokeAgent(userId, reason);
      showToast(`${fullName} a été révoqué immédiatement.`, 'success');
      await loadAdminUsersView();
      await loadConversations({ keepSelection: true });
    }
  });
}

async function loadAuditLogsView() {
  const listEl = document.getElementById('auditLogsList');
  const eventType = document.getElementById('auditFilterSelect').value;
  if (!listEl) return;

  try {
    const res = await FasoApi.getAuditLogs(eventType);
    const logs = res.logs || [];
    if (logs.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Aucun événement enregistré pour ce filtre.</div>`;
      return;
    }

    listEl.innerHTML = logs.map((l) => {
      const isAlert = l.event_type.includes('FAIL') || l.event_type.includes('INTRUSION') || l.event_type.includes('REVOKED') || l.event_type.includes('UNAUTHORIZED');
      return `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">
              <span class="badge badge-mono ${isAlert ? 'badge-red' : ''}">${escapeHtml(l.event_type)}</span>
              <span class="badge">#${Number(l.id)}</span>
            </div>
            <div class="list-row-sub">${escapeHtml(l.details || '')}</div>
            <div class="list-row-sub">Acteur : ${escapeHtml(l.actor_id || 'Externe')} • IP : ${escapeHtml(l.ip_address || '-')} • ${escapeHtml(formatDateTime(l.created_at))}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="inline-alert error">${escapeHtml(formatApiError(err.message))}</div>`;
  }
}

async function runIntruderProof() {
  const out = document.getElementById('adminProofOutput');
  out.hidden = false;
  out.textContent = 'Exécution de la requête d\'intrusion...';
  try {
    const res = await fetch('/api/auth/login-step1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricule: 'INTRUS_NON_ENROLE_99', password: 'TestPassword!' })
    });
    const body = await res.json();
    out.textContent = JSON.stringify({
      epreuve: 'Rejet automatique compte non préalablement enrôlé',
      httpStatus: res.status,
      reponseServeur: body
    }, null, 2);
  } catch (err) {
    out.textContent = `Erreur : ${err.message}`;
  }
}

async function runBlindServerInspection() {
  const out = document.getElementById('adminProofOutput');
  out.hidden = false;
  out.textContent = 'Lecture directe des tables SQLite côté serveur...';
  try {
    const res = await FasoApi.getServerInspection();
    out.textContent = JSON.stringify(res, null, 2);
  } catch (err) {
    out.textContent = `Erreur : ${err.message}`;
  }
}

// ============================================================================
// UTILITAIRES D'INTERFACE (MODALES, TOASTS, FORMATAGE, ÉCHAPPEMENT XSS)
// ============================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
  if (id === 'modalInstructionDetail') {
    AppState.openInstructionId = null;
  }
}

function openActionConfirmModal({
  title,
  description,
  inputLabel,
  inputPlaceholder,
  inputRequired,
  submitLabel,
  danger,
  onConfirm
}) {
  document.getElementById('modalActionTitle').textContent = title;
  document.getElementById('modalActionDesc').textContent = description;
  document.getElementById('modalActionInputLabel').textContent = inputLabel;
  const inp = document.getElementById('modalActionInput');
  inp.value = '';
  inp.placeholder = inputPlaceholder || '';
  inp.required = Boolean(inputRequired);

  const btn = document.getElementById('modalActionSubmitBtn');
  btn.textContent = submitLabel || 'Confirmer';
  btn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

  AppState.actionConfirmHandler = onConfirm;
  openModal('modalActionConfirm');
  setTimeout(() => inp.focus(), 30);
}

async function submitActionConfirm(event) {
  event.preventDefault();
  if (!AppState.actionConfirmHandler) return;
  const val = document.getElementById('modalActionInput').value.trim();
  const fn = AppState.actionConfirmHandler;
  AppState.actionConfirmHandler = null;
  closeModal('modalActionConfirm');
  try {
    await fn(val);
  } catch (err) {
    showToast(formatApiError(err.message), 'error');
  }
}

function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('userDropdown');
  const btn = document.getElementById('userMenuBtn');
  const nextHidden = !menu.hidden;
  menu.hidden = nextHidden;
  btn.setAttribute('aria-expanded', String(!nextHidden));
}

function closeUserDropdown() {
  const menu = document.getElementById('userDropdown');
  const btn = document.getElementById('userMenuBtn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function changeUiLang(lang) {
  setLanguage(lang);
  syncLanguageButtons(lang);
  closeUserDropdown();
}

function syncLanguageButtons(lang) {
  ['fr', 'mo', 'di'].forEach((code) => {
    const id = `langBtn${code.charAt(0).toUpperCase()}${code.slice(1)}`;
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', code === lang);
  });
}

function toggleColorTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('fasobrief_theme', isDark ? 'dark' : 'light');
  closeUserDropdown();
}

async function copyTextFromEl(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const text = el.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copié dans le presse-papiers.', 'success');
  } catch (_) {
    showToast('Sélectionnez le code affiché pour le copier.', 'info');
  }
}

function showToast(message, variant = 'info') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast-item ${variant}`;
  item.setAttribute('role', 'status');
  item.innerHTML = `<span>${escapeHtml(message)}</span>`;
  region.appendChild(item);

  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 3800);
}

function getInitials(name) {
  if (!name) return 'FB';
  return String(name)
    .replace(/^(Dr\.|M\.|Mme)\s+/i, '')
    .trim()
    .split(/\s+/)
    .map((p) => p[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatTimeOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatShortTimeOrDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatByteSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatApiError(codeOrMsg) {
  const map = {
    ACCES_REFUSE_COMPTE_NON_ENROLE: 'Accès refusé : ce matricule n\'est pas préalablement enrôlé.',
    COMPTE_REVOQUE_ACCES_INTERDIT: 'Accès interdit : ce compte a été définitivement révoqué.',
    COMPTE_SUSPENDU_CONTACTEZ_ADMIN: 'Accès refusé : ce compte est actuellement suspendu.',
    COMPTE_NON_ACTIVE_UTILISEZ_INVITATION: 'Ce compte n\'est pas encore activé. Utilisez l\'onglet « Activer une invitation ».',
    IDENTIFIANTS_INVALIDES: 'Matricule ou mot de passe incorrect.',
    CODE_2FA_INVALIDE: 'Code TOTP à 6 chiffres invalide ou expiré.',
    ETAPE_1_REQUISE_OU_EXPIREE: 'Le jeton de 1re étape a expiré. Veuillez ressaisir vos identifiants.',
    CODE_ACTIVATION_INVALIDE_OU_UTILISE: 'Code d\'activation invalide ou déjà consommé.',
    CODE_ACTIVATION_EXPIRE: 'Ce code d\'activation a expiré (délai de 72 h dépassé).',
    MOT_DE_PASSE_TROP_COURT_MIN_12: 'Le mot de passe doit contenir au moins 12 caractères.',
    MATRICULE_DEJA_EXISTANT: 'Ce matricule administratif est déjà enregistré.'
  };
  return map[codeOrMsg] || codeOrMsg || 'Une erreur est survenue.';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
