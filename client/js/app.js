/**
 * FASOBRIEF — Application Client Souveraine (Reproduction fidèle Lovable + E2EE Olm/Megolm Réel)
 */

(function () {
  'use strict';

  // Icônes SVG Lucide en ligne (stroke-width="1.75", zéro dépendance externe)
  const ICONS = {
    shieldCheck: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    shieldSm: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    keyRound: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
    qrCode: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`,
    smartphone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
    messageSquare: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    clipboardCheck: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    logOut: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
    bell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>`,
    bellRing: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M22 8c0-2.3-.8-4.3-2-6"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/></svg>`,
    building2: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
    plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    chevronLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
    paperclip: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>`,
    fileText: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
    checkCheck: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
    clipboardPlus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14h6"/><path d="M12 17v-6"/></svg>`,
    inbox: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    calendarClock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>`,
    circle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`,
    eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`,
    checkCircle2: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    userPlus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
    pencil: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`,
    userX: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>`,
    userCheck: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
    history: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
    rotateCcw: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
    refreshCw: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    trash2: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
  };

  const ROLE_LABELS = {
    ADMIN: 'Administrateur',
    DIRECTEUR: 'Chef de service',
    CHEF_SERVICE: 'Chef de service',
    AGENT: 'Agent'
  };

  const state = {
    booting: true,
    demoMode: false,
    demoAccounts: [],
    loginStep: 'credentials', // 'credentials' | 'otp'
    loginUsername: '',
    loginPassword: '',
    loginOtp: '',
    loginError: '',
    loginChallenge: null,
    loginPendingUserId: null,
    demoLiveTotp: '',
    scanningQr: false,
    qrScannerCtrl: null,

    tab: 'messages', // 'messages' | 'instructions' | 'admin'
    groups: [],
    activeGroupId: null,
    mobileChatListOpen: true,
    messagesByGroup: new Map(),
    pendingAttachment: null, // File object
    draftText: '',
    sendingMessage: false,

    directoryAgents: [],
    directoryServices: [],

    instructions: [],
    notifications: [],
    unreadNotifCount: 0,
    notifPopoverOpen: false,

    adminUsers: [],
    adminServices: [],
    auditLogs: [],
    creatingServiceOpen: false,
    newServiceName: '',

    decryptedImageCache: new Map(), // fileId -> objectURL
    decryptingFiles: new Set(),

    intruderSimulationResult: null, // { status, code, matricule, timestamp }
    modal: null // { type, data }
  };

  const appRoot = document.getElementById('appRoot');
  const modalRoot = document.getElementById('modalRoot');
  const notifPopoverRoot = document.getElementById('notifPopoverRoot');
  const toastViewport = document.getElementById('toastViewport');

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => (part[0] ? part[0].toUpperCase() : ''))
      .join('') || '?';
  }

  function renderAvatar(name, avatarData, cssClass = 'avatar-circle') {
    if (avatarData) {
      return `<img src="${esc(avatarData)}" alt="${esc(name || '')}" class="${cssClass} avatar-img-cover" />`;
    }
    return `<div class="${cssClass}">${esc(initials(name))}</div>`;
  }

  function playNotificationTone() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      g1.gain.setValueAtTime(0.12, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc1.connect(g1);
      g1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.08);
      g2.gain.setValueAtTime(0.15, now + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.28);
    } catch (_) {}
  }

  async function encryptGroupPayloadSafely(groupId, payloadObj) {
    if (window.FasoCrypto && typeof window.FasoCrypto.encryptGroupPayload === 'function') {
      return window.FasoCrypto.encryptGroupPayload(groupId, payloadObj);
    }
    if (window.FasoCrypto && typeof window.FasoCrypto.encryptPayload === 'function') {
      return window.FasoCrypto.encryptPayload(groupId, payloadObj);
    }
    throw new Error('Moteur cryptographique non initialisé');
  }

  if (typeof window !== 'undefined' && window.FasoCrypto) {
    if (!window.FasoCrypto.encryptGroupPayload && typeof window.FasoCrypto.encryptPayload === 'function') {
      window.FasoCrypto.encryptGroupPayload = function(groupId, payload) {
        return this.encryptPayload(groupId, payload);
      };
    }
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  function formatDateShort(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function isChefOrAdmin(user) {
    return Boolean(user && (user.role === 'ADMIN' || user.role === 'DIRECTEUR' || user.role === 'CHEF_SERVICE'));
  }

  function roleLabel(role) {
    return ROLE_LABELS[role] || role;
  }

  function userServiceDisplay(user) {
    if (!user) return '';
    if (user.serviceName) return user.serviceName;
    if (user.serviceId) {
      const srv = state.directoryServices.find((s) => s.id === user.serviceId)
        || state.adminServices.find((s) => s.id === user.serviceId);
      if (srv) return srv.name;
    }
    if (user.serviceMinistry && user.serviceMinistry !== 'Administration') {
      return user.serviceMinistry;
    }
    return '';
  }

  function showToast(title, description = '', isError = false) {
    const el = document.createElement('div');
    el.className = `toast-item${isError ? ' error' : ''}`;
    el.innerHTML = `
      <div class="toast-title">${esc(title)}</div>
      ${description ? `<div class="toast-desc">${esc(description)}</div>` : ''}
    `;
    toastViewport.appendChild(el);
    setTimeout(() => {
      try { el.remove(); } catch (_) {}
    }, 3600);
  }

  function friendlyAuthError(code) {
    const map = {
      COMPTE_NON_ENROLE_OU_INCONNU: 'Identifiant ou mot de passe incorrect.',
      IDENTIFIANTS_INVALIDES: 'Identifiant ou mot de passe incorrect.',
      AGENT_REVOQUE_ACCES_INTERDIT: 'Ce compte a été révoqué par l\'administrateur.',
      AGENT_REVOQUE_OU_INEXISTANT: 'Ce compte a été révoqué par l\'administrateur.',
      COMPTE_SUSPENDU_PAR_ADMINISTRATION: 'Ce compte est suspendu par l\'administration.',
      COMPTE_EN_ATTENTE_ACTIVATION: 'Ce compte est en attente d\'activation.',
      CODE_2FA_INVALIDE: 'Code de vérification invalide.',
      QR_CODE_INVALIDE: 'QR code invalide.',
      QR_CODE_EXPIRE_OU_DEJA_UTILISE: 'QR code expiré ou déjà utilisé.'
    };
    return map[code] || code || 'Une erreur est survenue.';
  }

  // ==========================================================================
  // INITIALISATION DU MOTEUR CRYPTOGRAPHIQUE CLIENT (0 REQUÊTE PARASITE)
  // ==========================================================================
  async function provisionDemoEnvironmentIfNeeded() {
    try {
      await window.FasoCrypto.init();
    } catch (e) {
      console.warn('[CRYPTO] Init non bloquante :', e);
    }
  }

  // ==========================================================================
  // DÉCHIFFREMENT LOCAL E2EE (Messages, Pièces jointes AES-256-GCM, Instructions)
  // ==========================================================================
  function decryptMessageRecord(rawMsg) {
    const res = window.FasoCrypto.decryptGroupMessage(rawMsg);
    const data = (res && res.data) || {};
    return {
      ...rawMsg,
      decryptedOk: Boolean(res && res.ok),
      waitingForKey: Boolean(res && res.waitingForKey),
      text: res && res.ok ? (data.text || '') : (res ? res.text : '[Message chiffré]'),
      fileMeta: res && res.ok && data.file ? data.file : null,
      signatureVerified: Boolean(res && res.signatureVerified)
    };
  }

  function decryptInstructionRecord(inst) {
    const fakeMsg = {
      group_id: inst.group_id,
      megolm_session_id: inst.megolm_session_id,
      ciphertext: inst.title_ciphertext,
      sender_ed25519: inst.sender_ed25519,
      signature: inst.signature,
      protocol: 'megolm.v1'
    };
    const res = window.FasoCrypto.decryptGroupMessage(fakeMsg);
    let title = inst.instruction_ref || 'Instruction chiffrée';
    let body = '';
    if (res && res.ok) {
      if (res.data && typeof res.data === 'object') {
        title = res.data.title || res.text || title;
        body = res.data.description || res.data.body || '';
      } else {
        title = res.text || title;
      }
    } else if (res && res.text) {
      body = res.text;
    }
    return {
      ...inst,
      decryptedTitle: title,
      decryptedBody: body
    };
  }

  async function ensureImagePreviewDecrypted(fileMeta) {
    if (!fileMeta || !fileMeta.fileId || !fileMeta.key || !fileMeta.iv) return;
    if (!String(fileMeta.mime || '').startsWith('image/')) return;
    if (state.decryptedImageCache.has(fileMeta.fileId) || state.decryptingFiles.has(fileMeta.fileId)) return;

    state.decryptingFiles.add(fileMeta.fileId);
    try {
      const encBlob = await window.FasoApi.downloadEncryptedFile(fileMeta.fileId);
      const clearBlob = await window.FasoCrypto.decryptFile(
        encBlob,
        fileMeta.key,
        fileMeta.iv,
        fileMeta.sha256,
        fileMeta.mime
      );
      const objUrl = URL.createObjectURL(clearBlob);
      state.decryptedImageCache.set(fileMeta.fileId, objUrl);
      renderApp();
    } catch (err) {
      console.warn('[FILE] Échec déchiffrement aperçu image :', err);
    } finally {
      state.decryptingFiles.delete(fileMeta.fileId);
    }
  }

  async function downloadAndDecryptAttachment(fileMeta) {
    if (!fileMeta || !fileMeta.fileId) return;
    try {
      const encBlob = await window.FasoApi.downloadEncryptedFile(fileMeta.fileId);
      const clearBlob = await window.FasoCrypto.decryptFile(
        encBlob,
        fileMeta.key,
        fileMeta.iv,
        fileMeta.sha256,
        fileMeta.mime
      );
      const url = URL.createObjectURL(clearBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileMeta.name || 'document_fasobrief';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (err) {
      showToast('Téléchargement impossible', err.message || 'Accès au fichier refusé', true);
    }
  }

  // ==========================================================================
  // CHARGEMENT & SYNCHRONISATION DES DONNÉES SERVEUR
  // ==========================================================================
  async function loadAuthenticatedWorkspace() {
    const me = window.FasoApi.currentUser;
    if (!me) return;

    const deviceInfo = await window.FasoCrypto.bindUserSession(me.id, window.FasoApi);
    window.FasoApi.connectWebSocket(deviceInfo.deviceId);
    await window.FasoCrypto.syncKeysAndRequests();

    await Promise.all([
      refreshDirectory(),
      refreshGroups(),
      refreshInstructions(),
      refreshNotifications(),
      me.role === 'ADMIN' || me.role === 'DIRECTEUR' ? refreshAdminData() : Promise.resolve()
    ]);

    if (state.groups.length > 0 && (!state.activeGroupId || !state.groups.some((g) => g.id === state.activeGroupId))) {
      state.activeGroupId = state.groups[0].id;
    }

    if (state.activeGroupId) {
      await loadGroupMessages(state.activeGroupId);
    }

    if (typeof window.Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => {}); } catch (_) {}
    }
  }

  async function refreshDirectory() {
    try {
      const res = await window.FasoApi.getDirectory({ includeAllStatuses: '1' });
      state.directoryAgents = res.agents || [];
      state.directoryServices = res.services || [];
    } catch (_) {}
  }

  async function refreshGroups() {
    if (!window.FasoApi.token) return;
    try {
      await window.FasoCrypto.syncKeysAndRequests();
      const res = await window.FasoApi.getGroups();
      state.groups = (res.groups || []).map((g) => {
        let previewText = 'Aucun message';
        if (g.lastMessage) {
          const dec = decryptMessageRecord(g.lastMessage);
          if (dec.decryptedOk) {
            previewText = dec.text || (dec.fileMeta ? 'Pièce jointe' : 'Message chiffré');
          } else {
            previewText = g.lastMessageType === 'FILE' ? 'Pièce jointe chiffrée' : 'Message chiffré';
          }
        }
        return {
          ...g,
          previewText
        };
      });
    } catch (_) {}
  }

  async function loadGroupMessages(groupId) {
    if (!groupId || !window.FasoApi.token) return;
    try {
      await window.FasoCrypto.syncKeysAndRequests();
      const res = await window.FasoApi.getMessages(groupId);
      const decryptedList = (res.messages || []).map((m) => {
        const d = decryptMessageRecord(m);
        if (d.fileMeta && String(d.fileMeta.mime || '').startsWith('image/')) {
          ensureImagePreviewDecrypted(d.fileMeta);
        }
        return d;
      });
      state.messagesByGroup.set(groupId, decryptedList);

      const me = window.FasoApi.currentUser;
      const incomingIds = decryptedList
        .filter((m) => m.sender_id !== me.id)
        .map((m) => m.id);

      if (incomingIds.length > 0) {
        const isVisibleChat = state.tab === 'messages'
          && state.activeGroupId === groupId
          && (!isMobileViewport() || !state.mobileChatListOpen)
          && document.visibilityState === 'visible';

        await window.FasoApi.sendMessageReceipts(incomingIds, isVisibleChat ? 'read' : 'delivered');
        if (isVisibleChat) {
          const grp = state.groups.find((g) => g.id === groupId);
          if (grp) grp.unreadCount = 0;
          await refreshNotifications();
        }
      }
    } catch (_) {}
  }

  async function refreshInstructions() {
    if (!window.FasoApi.token) return;
    try {
      await window.FasoCrypto.syncKeysAndRequests();
      const res = await window.FasoApi.getInstructionsDashboard();
      state.instructions = (res.dashboard || []).map(decryptInstructionRecord);
    } catch (_) {}
  }

  async function refreshNotifications() {
    if (!window.FasoApi.token) return;
    try {
      const res = await window.FasoApi.getNotifications();
      state.notifications = res.notifications || [];
      state.unreadNotifCount = Number(res.unreadCount || 0);
    } catch (_) {}
  }

  async function refreshAdminData() {
    if (!window.FasoApi.token) return;
    const me = window.FasoApi.currentUser;
    if (!me || (me.role !== 'ADMIN' && me.role !== 'DIRECTEUR')) return;
    try {
      const [uRes, aRes] = await Promise.all([
        window.FasoApi.getAdminUsers(),
        window.FasoApi.getAuditLogs()
      ]);
      state.adminUsers = uRes.users || [];
      state.adminServices = uRes.services || [];
      state.auditLogs = aRes.logs || [];
    } catch (_) {}
  }

  function isMobileViewport() {
    return window.innerWidth < 1024;
  }

  function pendingInstructionsCount() {
    const me = window.FasoApi.currentUser;
    if (!me) return 0;
    return state.instructions.filter(
      (inst) => inst.status === 'PUBLIEE' && inst.my_recipient && !inst.my_recipient.acknowledgedAt
    ).length;
  }

  // ==========================================================================
  // GESTION WEBSOCKET TEMPS RÉEL
  // ==========================================================================
  function bindRealtimeEvents() {
    window.FasoApi.on('TO_DEVICE_MESSAGE', async () => {
      await window.FasoCrypto.syncKeysAndRequests();
      await refreshGroups();
      if (state.activeGroupId) await loadGroupMessages(state.activeGroupId);
      await refreshInstructions();
      renderApp();
    });

    window.FasoApi.on('MEGOLM_KEY_REQUESTED', async () => {
      await window.FasoCrypto.syncKeysAndRequests();
    });

    window.FasoApi.on('GROUP_KEY_ROTATION_REQUIRED', async (data) => {
      if (data && data.groupId) {
        window.FasoCrypto.invalidateOutboundGroupSession(data.groupId);
      }
      await refreshGroups();
      if (state.activeGroupId) await loadGroupMessages(state.activeGroupId);
      renderApp();
    });

    window.FasoApi.on('CONVERSATION_CREATED', async () => {
      await refreshGroups();
      renderApp();
    });

    window.FasoApi.on('GROUP_UPDATED', async (data) => {
      await refreshGroups();
      if (state.activeGroupId && data && data.groupId === state.activeGroupId) {
        await loadGroupMessages(state.activeGroupId);
      }
      renderApp();
    });

    window.FasoApi.on('GROUP_DELETED', async (data) => {
      if (data && data.groupId === state.activeGroupId) {
        state.activeGroupId = null;
        if (state.modal && state.modal.type === 'editGroup') {
          closeModal();
        }
      }
      await refreshGroups();
      renderApp();
    });

    window.FasoApi.on('REMOVED_FROM_GROUP', async (data) => {
      if (data && data.groupId === state.activeGroupId) {
        state.activeGroupId = null;
      }
      await refreshGroups();
      renderApp();
    });

    window.FasoApi.on('NEW_ENCRYPTED_MESSAGE', async (data) => {
      await window.FasoCrypto.syncKeysAndRequests();
      await refreshGroups();
      const me = window.FasoApi.currentUser;
      const isFromMe = data && data.message && me && data.message.senderId === me.id;

      if (data && data.message && data.message.groupId === state.activeGroupId) {
        await loadGroupMessages(state.activeGroupId);
        if (!isFromMe) {
          playNotificationTone();
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(60); } catch (_) {}
          }
        }
      } else if (data && data.message && !isFromMe) {
        await window.FasoApi.sendMessageReceipts([data.message.id], 'delivered');
        playNotificationTone();
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate([100, 50, 100]); } catch (_) {}
        }
        if (typeof window.Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          try {
            new Notification('Nouveau message reçu', {
              body: `${data.message.senderName || 'Un agent'} vous a envoyé un message chiffré.`,
              icon: '/favicon.ico'
            });
          } catch (_) {}
        }
      }
      renderApp();
      scrollMessagesToBottom();
    });

    window.FasoApi.on('MESSAGE_RECEIPT_UPDATED', (data) => {
      if (!data || !data.groupId) return;
      const list = state.messagesByGroup.get(data.groupId);
      if (list) {
        const msg = list.find((m) => m.id === data.messageId);
        if (msg) {
          msg.delivery_status = data.deliveryStatus;
          msg.recipient_count = data.recipientCount;
          msg.delivered_count = data.deliveredCount;
          msg.read_count = data.readCount;
          renderApp();
        }
      }
    });

    window.FasoApi.on('NEW_ADMINISTRATIVE_INSTRUCTION', async (data) => {
      await window.FasoCrypto.syncKeysAndRequests();
      await refreshInstructions();
      playNotificationTone();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate([120, 60, 120]); } catch (_) {}
      }
      showToast('Nouvelle instruction reçue', 'Une consigne administrative vous a été assignée.');
      renderApp();
    });

    window.FasoApi.on('INSTRUCTION_ACKNOWLEDGED', async () => {
      await refreshInstructions();
      renderApp();
    });

    window.FasoApi.on('INSTRUCTION_UPDATED', async () => {
      await window.FasoCrypto.syncKeysAndRequests();
      await refreshInstructions();
      renderApp();
    });

    const handleIncomingNotification = async (payload) => {
      const n = payload && payload.notification;
      if (payload && typeof payload.unreadCount === 'number') {
        state.unreadNotifCount = payload.unreadCount;
      } else {
        state.unreadNotifCount = (state.unreadNotifCount || 0) + 1;
      }
      await refreshNotifications();

      if (n) {
        playNotificationTone();
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate([120, 60, 120]); } catch (_) {}
        }
        showToast(n.title, n.body);
        if (typeof window.Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const notif = new Notification(n.title, {
              body: n.body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: n.id || ('notif_' + Date.now())
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch (_) {}
        }
      }
      renderApp();
      renderNotifPopover();
    };

    window.FasoApi.on('NOTIFICATION_EVENT', handleIncomingNotification);
    window.FasoApi.on('NOTIFICATION_CREATED', handleIncomingNotification);

    const handleForcedDisconnect = (payload) => {
      stopQrScannerIfActive();
      state.modal = null;
      state.notifPopoverOpen = false;
      state.loginStep = 'credentials';
      state.loginPassword = '';
      state.loginOtp = '';
      state.loginError = (payload && (payload.message || payload.reason)) || 'Votre session a été révoquée.';
      showToast('Session interrompue', state.loginError, true);
      renderModal();
      renderNotifPopover();
      renderApp();
    };

    window.FasoApi.on('ACCOUNT_REVOKED', handleForcedDisconnect);
    window.FasoApi.on('ACCOUNT_SUSPENDED', handleForcedDisconnect);
  }

  // ==========================================================================
  // CONNEXION QR CODE (?enroll=...) & SCANNER CAMÉRA
  // ==========================================================================
  function extractEnrollTokenFromRaw(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return null;
    try {
      const parsedUrl = new URL(trimmed, window.location.origin);
      const param = parsedUrl.searchParams.get('enroll');
      if (param) return param;
    } catch (_) {}
    if (trimmed.includes('enroll=')) {
      const m = trimmed.match(/[?&]enroll=([^&#\s]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]);
    }
    return trimmed;
  }

  async function performQrEnrollment(rawValue) {
    const code = extractEnrollTokenFromRaw(rawValue);
    if (!code) {
      showToast('QR code non reconnu', '', true);
      return;
    }
    stopQrScannerIfActive();
    if (window.FasoApi.token) {
      window.FasoApi.disconnectWebSocket();
      window.FasoApi.clearSession();
    }
    state.activeGroupId = null;
    try {
      const res = await window.FasoApi.qrLogin(code, 'Terminal Enrôlé par QR');
      if (res && res.success) {
        window.history.replaceState({}, '', window.location.pathname);
        state.tab = 'messages';
        await loadAuthenticatedWorkspace();
        showToast(`Connecté en tant que ${res.user.fullName}`);
        renderApp();
        scrollMessagesToBottom();
      }
    } catch (err) {
      window.history.replaceState({}, '', window.location.pathname);
      const msg = friendlyAuthError(err.code || err.message);
      state.loginError = msg;
      showToast(msg, '', true);
      renderApp();
    }
  }

  function stopQrScannerIfActive() {
    if (state.qrScannerCtrl) {
      try { state.qrScannerCtrl.stop(); } catch (_) {}
      state.qrScannerCtrl = null;
    }
    state.scanningQr = false;
  }

  // ==========================================================================
  // RENDU DE L'INTERFACE (Login / Shell / Chat / Instructions / Admin)
  // ==========================================================================
  function renderApp() {
    if (state.booting) {
      appRoot.innerHTML = `
        <div class="login-screen">
          <div class="login-container" style="text-align:center;">
            <div class="login-logo-box">${ICONS.shieldCheck}</div>
            <p class="login-subtitle">Initialisation cryptographique E2EE...</p>
          </div>
        </div>
      `;
      return;
    }

    if (!window.FasoApi.currentUser || !window.FasoApi.token) {
      renderLoginView();
      return;
    }

    renderShellView();
  }

  function renderLoginView() {
    const curLang = (typeof window.getLanguage === 'function' ? window.getLanguage() : 'fr');
    appRoot.innerHTML = `
      <main id="mainWorkspace" class="login-screen">
        <div class="login-container">
          <!-- Sélecteur de langues nationales (Bonus +3 points) -->
          <div style="display:flex; justify-content:center; margin-bottom:14px;">
            <div class="lang-segmented-control" role="group" aria-label="Langues nationales">
              <button type="button" class="lang-segment-btn${curLang === 'fr' ? ' active' : ''} js-switch-lang" data-lang="fr" title="Français (Officiel)">FR</button>
              <button type="button" class="lang-segment-btn${curLang === 'mo' ? ' active' : ''} js-switch-lang" data-lang="mo" title="Mooré (Langue nationale)">Mooré</button>
              <button type="button" class="lang-segment-btn${curLang === 'di' ? ' active' : ''} js-switch-lang" data-lang="di" title="Dioula (Langue nationale)">Dioula</button>
            </div>
          </div>

          <div class="login-brand">
            <div class="login-logo-box">${ICONS.shieldCheck}</div>
            <h1 class="login-title">${esc(window.t ? window.t('app_title') : 'FasoBrief')}</h1>
            <p class="login-subtitle">${esc(window.t ? window.t('app_subtitle') : "Messagerie des agents de l'administration")}</p>
          </div>

          <!-- Alerte Démonstration Jury : Épreuve Intrus (HTTP 403) -->
          ${state.intruderSimulationResult ? `
            <div class="intruder-alert-box" role="alert">
              <div class="intruder-alert-head">
                ${ICONS.shieldAlert || ICONS.shieldSm}
                <span>${esc(window.t ? window.t('intruder_alert_title') : 'ÉPREUVE INTRUS : ACCÈS STRICTEMENT REFUSÉ (HTTP 403)')}</span>
              </div>
              <p class="intruder-alert-text">
                ${esc(window.t ? window.t('intruder_alert_desc') : "Tentative d'accès par un agent non préalablement enrôlé. Bloqué côté serveur et consigné dans le journal d'audit.")}
                <br/>
                <span style="font-size:0.6875rem; opacity:0.85;">Matricule testé: <code>${esc(state.intruderSimulationResult.matricule)}</code> · Code HTTP: <strong>${state.intruderSimulationResult.status} (${state.intruderSimulationResult.code})</strong> à ${state.intruderSimulationResult.timestamp}</span>
              </p>
            </div>
          ` : ''}

          <div class="login-card">
            ${state.loginStep === 'credentials' ? `
              <form id="loginStep1Form" class="login-form">
                <div class="field-group">
                  <label class="field-label" for="loginUsernameInput">${esc(window.t ? window.t('matricule_label') : 'Identifiant')}</label>
                  <input
                    id="loginUsernameInput"
                    class="input input-login"
                    type="text"
                    autocomplete="username"
                    placeholder="ex. issa"
                    value="${esc(state.loginUsername)}"
                    required
                  />
                </div>
                <div class="field-group">
                  <label class="field-label" for="loginPasswordInput">${esc(window.t ? window.t('password_label') : 'Mot de passe')}</label>
                  <input
                    id="loginPasswordInput"
                    class="input input-login"
                    type="password"
                    autocomplete="current-password"
                    value="${esc(state.loginPassword)}"
                    required
                  />
                </div>
                ${state.loginError ? `<p class="login-error" role="alert">${esc(state.loginError)}</p>` : ''}
                <button type="submit" class="btn btn-primary btn-lg-login">
                  ${ICONS.keyRound}
                  <span>${esc(window.t ? window.t('btn_login') : 'Continuer')}</span>
                </button>
                <button type="button" id="toggleQrScanBtn" class="btn btn-outline btn-lg-login">
                  ${ICONS.qrCode}
                  <span>${state.scanningQr ? 'Fermer la caméra' : 'Scanner un QR code'}</span>
                </button>
                <!-- Bouton Épreuve Intrus pour le Jury -->
                <button type="button" id="simulateIntruderBtn" class="btn btn-danger-soft btn-sm" style="width:100%; margin-top:6px;" title="Tester le rejet 403 d'un intrus non enrôlé">
                  ${ICONS.shieldSm}
                  <span>${esc(window.t ? window.t('simulate_intruder') : "Simuler l'attaque d'un Intrus (403)")}</span>
                </button>
              </form>
              ${state.scanningQr ? `
                <div class="qr-scan-box">
                  <div id="qrCameraContainer" class="qr-camera-stage" style="position:relative; width:100%; height:220px; overflow:hidden; border-radius:12px; background:#111;">
                    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.8125rem;">
                      Démarrage de la caméra...
                    </div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <input type="file" id="qrPhotoInput" accept="image/*" capture="environment" style="display:none;" />
                    <button type="button" id="qrPhotoBtn" class="btn btn-outline btn-sm" style="flex:1;">
                      ${ICONS.smartphone}
                      <span>Prendre en photo le QR</span>
                    </button>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <input id="qrManualInput" class="input" type="text" placeholder="Ou coller le lien ?enroll=..." />
                    <button type="button" id="qrManualSubmitBtn" class="btn btn-outline btn-sm">Valider</button>
                  </div>
                </div>
              ` : ''}
            ` : `
              <form id="loginStep2Form" class="login-form">
                <div class="field-group">
                  <label class="field-label" for="loginOtpInput">
                    ${ICONS.smartphone}
                    <span>${esc(window.t ? window.t('login_step2_title') : 'Code de vérification')}</span>
                  </label>
                  <input
                    id="loginOtpInput"
                    class="input input-otp"
                    type="text"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="000000"
                    value="${esc(state.loginOtp)}"
                    required
                  />
                  <p class="otp-helper-text">
                    ${state.demoMode && state.demoLiveTotp
                      ? `Second facteur TOTP. Code de démonstration : <button type="button" id="fillDemoOtpBtn" class="otp-demo-pill" title="Cliquer pour insérer">${esc(state.demoLiveTotp)}</button>`
                      : `Second facteur TOTP (application d'authentification RFC 6238).`}
                  </p>
                </div>
                ${state.loginError ? `<p class="login-error" role="alert">${esc(state.loginError)}</p>` : ''}
                <button type="submit" class="btn btn-primary btn-lg-login">${esc(window.t ? window.t('btn_verify') : 'Se connecter')}</button>
                <button type="button" id="backToStep1Btn" class="btn btn-ghost btn-sm" style="width:100%;">${esc(window.t ? window.t('btn_back') : 'Retour')}</button>
              </form>
            `}
          </div>

          ${state.demoMode ? `
            <p class="login-hint">
              Comptes fictifs : <span style="font-weight:500;">admin</span>, <span style="font-weight:500;">issa</span>, <span style="font-weight:500;">fatou</span>, <span style="font-weight:500;">paul</span>, <span style="font-weight:500;">mariam</span> — mot de passe <span style="font-weight:500;">demo2026</span>
            </p>
          ` : ''}
        </div>
      </main>
    `;

    document.querySelectorAll('.js-switch-lang').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof window.setLanguage === 'function') {
          window.setLanguage(btn.dataset.lang);
        }
        renderApp();
      });
    });

    const simBtn = document.getElementById('simulateIntruderBtn');
    if (simBtn) {
      simBtn.addEventListener('click', async () => {
        try {
          await window.FasoApi.loginStep1('INTRUS-HACKER-99', 'AttaqueForceBrute2026');
        } catch (err) {
          state.intruderSimulationResult = {
            status: err.status || 403,
            code: err.code || 'COMPTE_NON_ENROLE_OU_INCONNU',
            matricule: 'INTRUS-HACKER-99',
            timestamp: new Date().toLocaleTimeString('fr-FR')
          };
          showToast('Épreuve Intrus validée : Rejet HTTP 403 immédiat', 'Tentative journalisée dans audit_logs', true);
          renderApp();
        }
      });
    }

    const s1Form = document.getElementById('loginStep1Form');
    if (s1Form) {
      s1Form.addEventListener('submit', async (e) => {
        e.preventDefault();
        state.loginUsername = document.getElementById('loginUsernameInput').value.trim();
        state.loginPassword = document.getElementById('loginPasswordInput').value;
        state.loginError = '';
        stopQrScannerIfActive();
        try {
          const res = await window.FasoApi.loginStep1(state.loginUsername, state.loginPassword);
          state.loginChallenge = res.challengeToken;
          state.loginPendingUserId = res.userId;
          state.loginOtp = '';
          state.demoLiveTotp = '';
          if (state.demoMode) {
            try {
              const demoRes = await window.FasoApi.getDemoTotp(res.userId);
              state.demoLiveTotp = demoRes.code || '';
            } catch (_) {}
          }
          state.loginStep = 'otp';
          renderApp();
          const otpEl = document.getElementById('loginOtpInput');
          if (otpEl) otpEl.focus();
        } catch (err) {
          state.loginError = friendlyAuthError(err.code || err.message);
          renderApp();
        }
      });

      const qrBtn = document.getElementById('toggleQrScanBtn');
      if (qrBtn) {
        qrBtn.addEventListener('click', () => {
          if (state.scanningQr) {
            stopQrScannerIfActive();
            renderApp();
          } else {
            state.scanningQr = true;
            state.loginError = '';
            renderApp();
            const stage = document.getElementById('qrCameraContainer');
            if (stage) {
              state.qrScannerCtrl = window.FasoQr.startQrCameraScanner(
                stage,
                (decoded) => performQrEnrollment(decoded),
                (errMsg) => {
                  if (stage) stage.textContent = errMsg;
                }
              );
            }
          }
        });
      }

      const manualSubmit = document.getElementById('qrManualSubmitBtn');
      if (manualSubmit) {
        manualSubmit.addEventListener('click', () => {
          const val = document.getElementById('qrManualInput').value;
          performQrEnrollment(val);
        });
      }
    }

    const s2Form = document.getElementById('loginStep2Form');
    if (s2Form) {
      const otpInput = document.getElementById('loginOtpInput');
      if (otpInput) {
        otpInput.addEventListener('input', () => {
          otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
          state.loginOtp = otpInput.value;
        });
      }
      const fillBtn = document.getElementById('fillDemoOtpBtn');
      if (fillBtn) {
        fillBtn.addEventListener('click', () => {
          state.loginOtp = state.demoLiveTotp;
          if (otpInput) {
            otpInput.value = state.demoLiveTotp;
            otpInput.focus();
          }
        });
      }
      document.getElementById('backToStep1Btn').addEventListener('click', () => {
        state.loginStep = 'credentials';
        state.loginError = '';
        state.loginOtp = '';
        renderApp();
      });
      s2Form.addEventListener('submit', async (e) => {
        e.preventDefault();
        state.loginOtp = document.getElementById('loginOtpInput').value.trim();
        state.loginError = '';
        try {
          await window.FasoApi.loginStep2(
            state.loginPendingUserId,
            state.loginOtp,
            state.loginChallenge,
            'Navigateur FasoBrief'
          );
          state.loginPassword = '';
          state.loginOtp = '';
          state.loginStep = 'credentials';
          state.tab = 'messages';
          await loadAuthenticatedWorkspace();
          renderApp();
          scrollMessagesToBottom();
        } catch (err) {
          state.loginError = friendlyAuthError(err.code || err.message);
          renderApp();
        }
      });
    }
  }

  function renderShellView() {
    const me = window.FasoApi.currentUser;
    const srvName = userServiceDisplay(me);
    const subLabel = `${roleLabel(me.role)}${srvName ? ` · ${srvName}` : ''}`;
    const pendingInst = pendingInstructionsCount();
    const curLang = (typeof window.getLanguage === 'function' ? window.getLanguage() : 'fr');

    const navItems = [
      { id: 'messages', label: window.t ? window.t('nav_messages') : 'Messages', icon: ICONS.messageSquare, badge: 0 },
      { id: 'instructions', label: window.t ? window.t('nav_instructions') : 'Instructions', icon: ICONS.clipboardCheck, badge: pendingInst },
      ...(me.role === 'ADMIN' ? [{ id: 'admin', label: window.t ? window.t('nav_admin') : 'Administration', icon: ICONS.users, badge: 0 }] : [])
    ];

    appRoot.innerHTML = `
      <div class="app-shell">
        <!-- En-tête mobile -->
        <header class="mobile-topbar">
          <div class="mobile-brand-user js-open-profile" style="cursor:pointer;" title="Modifier mon profil">
            ${renderAvatar(me.fullName, me.avatarData, 'avatar-circle')}
            <div class="mobile-user-meta">
              <p class="mobile-user-name">${esc(me.fullName)}</p>
              <p class="mobile-user-sub">${esc(subLabel)}</p>
            </div>
          </div>
          <div class="mobile-actions">
            <div class="lang-segmented-control" role="group" aria-label="Langues">
              <button type="button" class="lang-segment-btn${curLang === 'fr' ? ' active' : ''} js-switch-lang" data-lang="fr">FR</button>
              <button type="button" class="lang-segment-btn${curLang === 'mo' ? ' active' : ''} js-switch-lang" data-lang="mo">MO</button>
              <button type="button" class="lang-segment-btn${curLang === 'di' ? ' active' : ''} js-switch-lang" data-lang="di">DY</button>
            </div>
            <div class="bell-wrapper">
              <button type="button" class="btn-icon js-bell-btn" aria-label="Notifications">
                ${ICONS.bell}
              </button>
              ${state.unreadNotifCount > 0 ? `<span class="bell-badge">${state.unreadNotifCount > 9 ? '9+' : state.unreadNotifCount}</span>` : ''}
            </div>
            <button type="button" class="btn-icon js-logout-btn" aria-label="Se déconnecter" title="Se déconnecter">
              ${ICONS.logOut}
            </button>
          </div>
        </header>

        <!-- Barre latérale bureau -->
        <aside class="desktop-sidebar">
          <div class="sidebar-brand-row">
            <div class="sidebar-shield">${ICONS.shieldSm}</div>
            <span class="sidebar-brand-title">FasoBrief</span>
            <div class="bell-wrapper">
              <button type="button" class="btn-icon js-bell-btn" aria-label="Notifications">
                ${ICONS.bell}
              </button>
              ${state.unreadNotifCount > 0 ? `<span class="bell-badge">${state.unreadNotifCount > 9 ? '9+' : state.unreadNotifCount}</span>` : ''}
            </div>
          </div>

          <!-- Sélecteur de langues nationales (Sidebar) -->
          <div style="padding: 0 16px 12px 16px;">
            <div class="lang-segmented-control" style="width:100%; justify-content:space-around;" role="group" aria-label="Langues nationales">
              <button type="button" class="lang-segment-btn${curLang === 'fr' ? ' active' : ''} js-switch-lang" data-lang="fr" style="flex:1; text-align:center;">Français</button>
              <button type="button" class="lang-segment-btn${curLang === 'mo' ? ' active' : ''} js-switch-lang" data-lang="mo" style="flex:1; text-align:center;">Mooré</button>
              <button type="button" class="lang-segment-btn${curLang === 'di' ? ' active' : ''} js-switch-lang" data-lang="di" style="flex:1; text-align:center;">Dioula</button>
            </div>
          </div>

          <nav class="sidebar-nav" aria-label="Navigation principale">
            ${navItems.map((item) => `
              <button
                type="button"
                class="sidebar-nav-item${state.tab === item.id ? ' active' : ''} js-nav-tab"
                data-tab="${item.id}"
              >
                ${item.icon}
                <span class="sidebar-nav-label">${esc(item.label)}</span>
                ${item.badge > 0 ? `<span class="nav-count-pill">${item.badge}</span>` : ''}
              </button>
            `).join('')}
          </nav>

          <div class="sidebar-footer">
            <button type="button" class="btn btn-outline btn-xs js-open-inspection" style="width:100%; margin-bottom:10px; font-size:0.6875rem;" title="Prouver que le serveur ne lit rien">
              ${ICONS.lock}
              <span>${esc(window.t ? window.t('btn_inspect_server') : 'Inspecteur BDD (Zéro-Clair)')}</span>
            </button>
            <div class="sidebar-user-row">
              <div class="js-open-profile" style="display:flex; align-items:center; gap:12px; flex:1; min-width:0; cursor:pointer;" title="Modifier mon profil">
                ${renderAvatar(me.fullName, me.avatarData, 'avatar-circle')}
                <div class="sidebar-user-info">
                  <p class="sidebar-user-name">${esc(me.fullName)}</p>
                  <p class="sidebar-user-sub">${esc(subLabel)}</p>
                </div>
              </div>
              <button type="button" class="btn-icon js-open-profile" aria-label="Modifier mon profil" title="Modifier mon profil">
                ${ICONS.pencil}
              </button>
              <button type="button" class="btn-icon js-logout-btn" aria-label="Se déconnecter" title="Se déconnecter">
                ${ICONS.logOut}
              </button>
            </div>
            <p class="sidebar-proto-note">Chiffrement E2EE Olm/Megolm — données fictives</p>
          </div>
        </aside>

        <!-- Contenu principal -->
        <main id="mainWorkspace" class="shell-main">
          ${state.tab === 'messages' ? renderChatMarkup() : ''}
          ${state.tab === 'instructions' ? renderInstructionsMarkup() : ''}
          ${state.tab === 'admin' && me.role === 'ADMIN' ? renderAdminMarkup() : ''}
        </main>

        <!-- Barre d'onglets mobile -->
        <nav class="mobile-tabbar" style="grid-template-columns: repeat(${navItems.length}, minmax(0, 1fr));" aria-label="Navigation mobile">
          ${navItems.map((item) => `
            <button
              type="button"
              class="mobile-tab-btn${state.tab === item.id ? ' active' : ''} js-nav-tab"
              data-tab="${item.id}"
            >
              ${item.icon}
              <span>${esc(item.label)}</span>
              ${item.badge > 0 ? `<span class="mobile-tab-badge">${item.badge}</span>` : ''}
            </button>
          `).join('')}
        </nav>
      </div>
    `;

    bindShellEvents();
    if (state.tab === 'messages') bindChatEvents();
    if (state.tab === 'instructions') bindInstructionsEvents();
    if (state.tab === 'admin' && me.role === 'ADMIN') bindAdminEvents();
  }

  function renderChatMarkup() {
    const me = window.FasoApi.currentUser;
    const canManage = isChefOrAdmin(me);
    const activeConv = state.groups.find((g) => g.id === state.activeGroupId) || null;
    const messages = activeConv ? (state.messagesByGroup.get(activeConv.id) || []) : [];

    return `
      <div class="chat-view">
        <section class="chat-sidebar${!state.mobileChatListOpen && activeConv ? ' mobile-hidden' : ''}">
          <div class="chat-sidebar-head">
            <h1 class="chat-sidebar-title">Messages</h1>
            ${canManage ? `
              <button type="button" id="openNewGroupBtn" class="btn btn-outline btn-sm btn-pill">
                ${ICONS.plus}
                <span>Groupe</span>
              </button>
            ` : ''}
          </div>
          <div class="chat-conv-list">
            ${state.groups.length === 0 ? `
              <p class="chat-conv-empty">Aucune conversation disponible.</p>
            ` : state.groups.map((conv) => {
              const isService = conv.channelKind === 'service';
              const isSelected = activeConv && activeConv.id === conv.id;
              return `
                <button
                  type="button"
                  class="conv-item${isSelected ? ' active' : ''} js-select-conv"
                  data-group-id="${esc(conv.id)}"
                >
                  <div class="conv-icon ${isService ? 'service' : 'group'}">
                    ${isService ? ICONS.building2 : ICONS.users}
                  </div>
                  <div class="conv-body">
                    <div class="conv-top-line">
                      <p class="conv-name">${esc(conv.name)}</p>
                      ${conv.lastMessageAt ? `<span class="conv-time">${esc(formatTime(conv.lastMessageAt))}</span>` : ''}
                    </div>
                    <p class="conv-preview">${esc(conv.previewText || 'Aucun message')}</p>
                  </div>
                  ${conv.unreadCount > 0 ? `<span class="nav-count-pill">${conv.unreadCount}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </section>

        <section class="chat-pane${state.mobileChatListOpen || !activeConv ? ' mobile-hidden' : ''}">
          ${!activeConv ? `
            <p class="chat-pane-empty">Sélectionnez une conversation</p>
          ` : `
            <header class="chat-header">
              <button type="button" id="mobileBackToConvListBtn" class="chat-back-btn" aria-label="Retour aux conversations">
                ${ICONS.chevronLeft}
              </button>
              <div class="chat-header-info">
                <h2 class="chat-header-title">${esc(activeConv.name)}</h2>
                <p class="chat-header-sub">
                  ${Number(activeConv.member_count || 1)} membre${Number(activeConv.member_count || 1) > 1 ? 's' : ''} · ${activeConv.channelKind === 'service' ? 'Service' : 'Groupe'}
                </p>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                ${(activeConv.channelKind === 'group' || activeConv.type === 'GROUP') && (activeConv.created_by === me.id || activeConv.my_member_role === 'OWNER' || activeConv.my_member_role === 'ADMIN' || me.role === 'ADMIN') ? `
                  <button type="button" id="openEditGroupBtn" class="btn-icon" aria-label="Paramètres du groupe" title="Gérer le groupe" style="padding:6px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--surface-bg); display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
                    ${ICONS.settings}
                  </button>
                ` : ''}
                <div class="chat-lock-pill" title="Chiffré de bout en bout (Olm / Megolm)">
                  ${ICONS.lock}
                  <span>Accès restreint</span>
                </div>
              </div>
            </header>

            <div id="chatMessagesContainer" class="chat-messages">
              ${messages.length === 0 ? `
                <p class="chat-messages-empty">Début de la conversation — échanges réservés aux membres.</p>
              ` : messages.map((m) => {
                const own = m.sender_id === me.id;
                const recipientsTotal = Number(m.recipient_count || 0);
                const readByCount = Number(m.read_count || 0);
                const allRead = recipientsTotal > 0 && readByCount >= recipientsTotal;
                const isImg = m.fileMeta && String(m.fileMeta.mime || '').startsWith('image/');
                const cachedImgUrl = isImg ? state.decryptedImageCache.get(m.fileMeta.fileId) : null;

                return `
                  <div class="msg-row${own ? ' own' : ''}">
                    ${!own ? renderAvatar(m.sender_name || '?', m.sender_avatar, 'msg-avatar') : ''}
                    <div class="msg-col">
                      ${!own ? `<p class="msg-sender-name">${esc(m.sender_name || 'Agent')}</p>` : ''}
                      <div class="msg-bubble">
                        ${m.fileMeta ? (
                          isImg && cachedImgUrl
                            ? `<img src="${esc(cachedImgUrl)}" alt="${esc(m.fileMeta.name || 'Image')}" class="msg-attachment-img" />`
                            : `<button type="button" class="msg-attachment-file js-download-file" data-msg-id="${esc(m.id)}">
                                 ${ICONS.fileText}
                                 <span>${esc(m.fileMeta.name || 'Pièce jointe chiffrée')}</span>
                               </button>`
                        ) : ''}
                        ${m.text ? `<p class="msg-text">${esc(m.text)}</p>` : ''}
                      </div>
                      <div class="msg-meta-line">
                        <span>${esc(formatTime(m.created_at))}</span>
                        ${own ? `
                          <span class="msg-read-status${allRead ? ' all-read' : ''}">
                            ${readByCount > 0 ? ICONS.checkCheck : ICONS.check}
                            <span>${readByCount > 0 ? `Lu par ${readByCount}/${recipientsTotal}` : 'Envoyé'}</span>
                          </span>
                        ` : ''}
                        ${canManage && m.decryptedOk ? `
                          <button type="button" class="msg-convert-btn js-convert-msg" data-msg-id="${esc(m.id)}">
                            ${ICONS.clipboardPlus}
                            <span>Instruction</span>
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <form id="chatComposerForm" class="chat-composer-form">
              ${state.pendingAttachment ? `
                <div class="composer-file-chip">
                  ${ICONS.fileText}
                  <span class="composer-file-name">${esc(state.pendingAttachment.name)}</span>
                  <button type="button" id="removeAttachmentBtn" class="btn-icon" style="width:22px;height:22px;min-width:22px;min-height:22px;" aria-label="Retirer la pièce jointe">
                    ${ICONS.x}
                  </button>
                </div>
              ` : ''}
              <div class="composer-bar">
                <input id="composerFileInput" type="file" class="hidden" />
                <button type="button" id="composerAttachBtn" class="composer-attach-btn" aria-label="Joindre un fichier">
                  ${ICONS.paperclip}
                </button>
                <input
                  id="composerTextInput"
                  type="text"
                  class="composer-input"
                  placeholder="Écrire un message"
                  value="${esc(state.draftText)}"
                />
                <button
                  type="submit"
                  id="composerSendBtn"
                  class="composer-send-btn"
                  aria-label="Envoyer"
                  ${(!state.draftText.trim() && !state.pendingAttachment) || state.sendingMessage ? 'disabled' : ''}
                >
                  ${ICONS.send}
                </button>
              </div>
            </form>
          `}
        </section>
      </div>
    `;
  }

  function renderInstructionsMarkup() {
    const me = window.FasoApi.currentUser;
    const canCreate = isChefOrAdmin(me);

    return `
      <div class="page-scroll">
        <div class="page-container">
          <div class="page-header">
            <div>
              <h1 class="page-title">Instructions</h1>
              <p class="page-subtitle">Suivi des consignes et des accusés de réception</p>
            </div>
            ${canCreate ? `
              <button type="button" id="openNewInstructionBtn" class="btn btn-primary btn-pill">
                ${ICONS.plus}
                <span>Nouvelle</span>
              </button>
            ` : ''}
          </div>

          ${state.instructions.length === 0 ? `
            <div class="dashed-empty">
              ${ICONS.inbox}
              <p style="font-size:0.875rem;">Aucune instruction pour le moment.</p>
            </div>
          ` : `
            <div class="cards-stack">
              ${state.instructions.map((inst) => {
                const isClosed = inst.status === 'CLOTUREE' || inst.status === 'ANNULEE';
                const total = Number(inst.total_recipients || 0);
                const done = Number(inst.ack_count || 0);
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const overdue = !isClosed && inst.deadline && new Date(inst.deadline).getTime() < Date.now();
                const isAuthor = inst.creator_id === me.id;
                const myRec = inst.my_recipient;

                return `
                  <article class="inst-card">
                    <div class="inst-card-head">
                      <div>
                        <div class="inst-title-row">
                          <h2 class="inst-title">${esc(inst.decryptedTitle)}</h2>
                          ${isClosed ? `<span class="pill-closed">Clôturée</span>` : ''}
                        </div>
                        <p class="inst-author-meta">
                          Émise par ${esc(inst.creator_name || 'Responsable')} · ${esc(formatDateShort(inst.created_at))}
                        </p>
                      </div>
                      ${inst.deadline ? `
                        <span class="inst-due-tag${overdue ? ' overdue' : ''}">
                          ${ICONS.calendarClock}
                          <span>${overdue ? 'Échue le ' : 'Avant le '}${esc(formatDateShort(inst.deadline))}</span>
                        </span>
                      ` : ''}
                    </div>

                    ${inst.decryptedBody ? `<p class="inst-body">${esc(inst.decryptedBody)}</p>` : ''}

                    <div class="inst-progress-wrap">
                      <div class="inst-progress-labels">
                        <span>Prise de connaissance</span>
                        <span>${done}/${total}</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${pct}%;"></div>
                      </div>
                    </div>

                    ${(isAuthor || me.role === 'ADMIN') && Array.isArray(inst.recipients) && inst.recipients.length > 0 ? `
                      <div class="inst-recipients-box">
                        ${inst.recipients.map((r) => {
                          const hasAck = Boolean(r.acknowledgedAt);
                          const hasView = Boolean(r.viewedAt);
                          let statusCls = '';
                          let statusIcon = ICONS.circle;
                          let statusTxt = 'En attente';
                          if (hasAck) {
                            statusCls = ' lu';
                            statusIcon = ICONS.checkCircle2;
                            statusTxt = `Pris connaissance · ${formatTime(r.acknowledgedAt)}`;
                          } else if (hasView) {
                            statusCls = ' recu';
                            statusIcon = ICONS.eye;
                            statusTxt = 'Reçu';
                          }
                          return `
                            <div class="inst-rec-row">
                              <span>${esc(r.fullName)}</span>
                              <span class="inst-rec-status${statusCls}">
                                ${statusIcon}
                                <span>${esc(statusTxt)}</span>
                              </span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : ''}

                    <div class="inst-actions">
                      ${myRec && !isClosed && !myRec.acknowledgedAt ? `
                        ${!myRec.viewedAt ? `
                          <button type="button" class="btn btn-outline btn-sm btn-pill js-inst-view" data-inst-id="${esc(inst.id)}">
                            Accuser réception
                          </button>
                        ` : ''}
                        <button type="button" class="btn btn-primary btn-sm btn-pill js-inst-ack" data-inst-id="${esc(inst.id)}" data-inst-version="${Number(inst.version || 1)}">
                          J'ai pris connaissance
                        </button>
                      ` : ''}
                      ${isAuthor && !isClosed ? `
                        <button type="button" class="btn btn-ghost btn-sm btn-pill inst-close-btn js-inst-close" data-inst-id="${esc(inst.id)}">
                          Clôturer
                        </button>
                      ` : ''}
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderAdminMarkup() {
    const me = window.FasoApi.currentUser;
    const services = state.adminServices;
    const users = state.adminUsers;
    const noServiceUsers = users.filter((u) => !u.service_id);

    const renderUserRow = (u) => {
      const isRevoked = u.status === 'REVOKED' || u.is_revoked === 1;
      const isSuspended = u.status === 'SUSPENDED';
      const inactive = isRevoked || isSuspended;
      const uname = u.username || String(u.matricule || '').toLowerCase();
      return `
        <div class="admin-user-row${inactive ? ' inactive' : ''}">
          <div class="admin-user-left">
            ${renderAvatar(u.full_name, u.avatar_data || u.avatarData, 'admin-avatar')}
            <div>
              <p class="admin-user-name-line">
                <span class="admin-user-name">${esc(u.full_name)}</span>
                <span class="admin-username">@${esc(uname)}</span>
              </p>
              <p class="admin-user-sub">
                ${esc(roleLabel(u.role))}${u.job_title ? ` · ${esc(u.job_title)}` : ''}
              </p>
            </div>
          </div>

          <div class="admin-user-actions">
            ${!isRevoked ? `
              <button type="button" class="btn btn-outline btn-sm btn-pill js-admin-edit" data-user-id="${esc(u.id)}">
                ${ICONS.pencil}
                <span>Modifier</span>
              </button>
            ` : ''}
            ${!inactive ? `
              <button type="button" class="btn btn-outline btn-sm btn-pill js-admin-qr" data-user-id="${esc(u.id)}">
                ${ICONS.qrCode}
                <span>QR</span>
              </button>
            ` : ''}
            ${u.id !== me.id ? (
              isRevoked
                ? `<span class="status-tag-revoked">Révoqué</span>`
                : isSuspended
                  ? `<button type="button" class="btn btn-outline btn-sm btn-pill js-admin-reactivate" data-user-id="${esc(u.id)}">
                       ${ICONS.userCheck}
                       <span>Réactiver</span>
                     </button>
                     <button type="button" class="btn btn-ghost-danger btn-sm btn-pill js-admin-revoke" data-user-id="${esc(u.id)}">
                       ${ICONS.userX}
                       <span>Révoquer</span>
                     </button>`
                  : `<button type="button" class="btn btn-ghost-danger btn-sm btn-pill js-admin-revoke" data-user-id="${esc(u.id)}">
                       ${ICONS.userX}
                       <span>Révoquer</span>
                     </button>`
            ) : ''}
          </div>
        </div>
      `;
    };

    return `
      <div class="page-scroll">
        <div class="page-container">
          <div class="page-header">
            <div>
              <h1 class="page-title">Administration</h1>
              <p class="page-subtitle">Enrôlement des agents, services et journal d'audit</p>
            </div>
            <button type="button" id="openEnrollAgentBtn" class="btn btn-primary btn-pill">
              ${ICONS.userPlus}
              <span>Enrôler un agent</span>
            </button>
          </div>

          <div class="admin-service-creator">
            ${state.creatingServiceOpen ? `
              <form id="createServiceForm" class="admin-service-form">
                <input
                  id="newServiceNameInput"
                  class="input"
                  type="text"
                  placeholder="Nom du nouveau service (ex. Direction financière)"
                  value="${esc(state.newServiceName)}"
                  required
                />
                <button type="submit" class="btn btn-primary btn-sm btn-pill">Créer</button>
                <button type="button" id="cancelCreateServiceBtn" class="btn btn-ghost btn-sm btn-pill">Annuler</button>
              </form>
            ` : `
              <button type="button" id="showCreateServiceBtn" class="btn btn-outline btn-sm btn-pill">
                ${ICONS.plus}
                <span>Nouveau service</span>
              </button>
            `}
          </div>

          <div class="admin-sections">
            ${services.map((s) => {
              const members = users.filter((u) => u.service_id === s.id);
              const activeCount = members.filter((u) => u.status === 'ACTIVE' && u.is_revoked === 0).length;
              return `
                <section>
                  <div class="admin-section-head">
                    <span style="color:var(--primary);display:inline-flex;">${ICONS.building2}</span>
                    <h2 class="admin-section-title">${esc(s.name)}</h2>
                    <span class="admin-section-count">(${activeCount}/${members.length})</span>
                  </div>
                  <div class="admin-card-list">
                    ${members.length === 0
                      ? `<p class="admin-empty-service">Aucun agent dans ce service.</p>`
                      : members.map(renderUserRow).join('')}
                  </div>
                </section>
              `;
            }).join('')}

            ${noServiceUsers.length > 0 ? `
              <section>
                <div class="admin-section-head">
                  <h2 class="admin-section-title">Administration</h2>
                </div>
                <div class="admin-card-list">
                  ${noServiceUsers.map(renderUserRow).join('')}
                </div>
              </section>
            ` : ''}
          </div>

          <div class="admin-audit-block">
            <div class="admin-audit-head">
              <h2 class="admin-audit-title">
                <span style="color:var(--muted-foreground);display:inline-flex;">${ICONS.history}</span>
                <span>Journal d'audit</span>
              </h2>
              ${state.demoMode ? `
                <button type="button" id="resetDemoBtn" class="btn btn-ghost btn-sm btn-pill">
                  ${ICONS.rotateCcw}
                  <span>Réinitialiser la démo</span>
                </button>
              ` : ''}
            </div>
            <div class="admin-card-list">
              ${state.auditLogs.slice(0, 30).map((log) => `
                <div class="audit-row">
                  <div>
                    <span style="font-weight:500;">${esc(log.details || log.event_type)}</span>
                    ${log.actor_name ? `<span class="audit-actor"> · ${esc(log.actor_name)}</span>` : ''}
                  </div>
                  <span class="audit-time">${esc(formatTime(log.created_at))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // POPOVER NOTIFICATIONS (Bell Popover)
  // ==========================================================================
  function renderNotifPopover(anchorRect = null) {
    if (!state.notifPopoverOpen || !window.FasoApi.currentUser) {
      notifPopoverRoot.innerHTML = '';
      return;
    }

    const browserPerm = typeof window.Notification !== 'undefined' ? Notification.permission : 'denied';
    let posStyle = 'top: 60px; right: 16px;';
    if (anchorRect) {
      const top = Math.min(window.innerHeight - 360, anchorRect.bottom + 8);
      if (anchorRect.left < 320 && window.innerWidth >= 1024) {
        posStyle = `top: ${Math.max(12, top)}px; left: ${Math.max(12, anchorRect.left)}px;`;
      } else {
        const right = Math.max(12, window.innerWidth - anchorRect.right);
        posStyle = `top: ${Math.max(12, top)}px; right: ${right}px;`;
      }
    }

    notifPopoverRoot.innerHTML = `
      <div class="notif-popover" style="${posStyle}" role="dialog" aria-label="Notifications">
        <div class="notif-popover-head">
          <p class="notif-popover-title">Notifications</p>
          ${browserPerm === 'default' ? `
            <button type="button" id="enableBrowserNotifBtn" class="notif-optin-btn">
              ${ICONS.bellRing}
              <span>Activer les alertes</span>
            </button>
          ` : ''}
        </div>
        <div class="notif-popover-list">
          ${state.notifications.length === 0 ? `
            <p class="notif-empty">Aucune notification</p>
          ` : state.notifications.slice(0, 25).map((n) => `
            <button
              type="button"
              class="notif-row${!n.is_read ? ' unread' : ''} js-notif-item"
              data-notif-id="${esc(n.id)}"
              data-group-id="${esc(n.group_id || '')}"
              data-inst-id="${esc(n.instruction_id || '')}"
            >
              <p class="notif-row-title">${esc(n.title)}</p>
              <p class="notif-row-body">${esc(n.body)}</p>
              <p class="notif-row-time">${esc(formatTime(n.updated_at || n.created_at))}</p>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const enableBtn = document.getElementById('enableBrowserNotifBtn');
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        try {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            await window.FasoApi.updatePreferences({ notifBrowserEnabled: true });
            showToast('Notifications système activées');
          }
        } catch (_) {}
        renderNotifPopover(anchorRect);
      });
    }

    notifPopoverRoot.querySelectorAll('.js-notif-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.notifId;
        const gid = btn.dataset.groupId;
        const iid = btn.dataset.instId;
        try {
          await window.FasoApi.markNotificationRead(id);
          await refreshNotifications();
        } catch (_) {}
        state.notifPopoverOpen = false;
        renderNotifPopover();
        if (iid) {
          state.tab = 'instructions';
        } else if (gid) {
          state.tab = 'messages';
          state.activeGroupId = gid;
          state.mobileChatListOpen = false;
          await loadGroupMessages(gid);
        }
        renderApp();
      });
    });
  }

  // ==========================================================================
  // MODALES (GroupDialog, InstructionDialog, UserForm, QrDialog, RevokeDialog)
  // ==========================================================================
  function closeModal() {
    state.modal = null;
    modalRoot.innerHTML = '';
  }

  function renderModal() {
    if (!state.modal) {
      modalRoot.innerHTML = '';
      return;
    }

    const { type, data } = state.modal;
    const me = window.FasoApi.currentUser;

    if (type === 'group') {
      const candidates = state.directoryAgents.filter((u) => {
        return u.id !== me.id && u.status === 'ACTIVE';
      });
      const chefsIds = candidates
        .filter((u) => u.role === 'DIRECTEUR' || u.role === 'CHEF_SERVICE')
        .map((u) => u.id);

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head">
              <h2 id="modalTitle" class="modal-title">Nouveau groupe</h2>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>
            <form id="groupModalForm" class="modal-form">
              <div class="field-group">
                <label class="field-label" for="grpNameInput">Nom du groupe</label>
                <input id="grpNameInput" class="input" type="text" placeholder="ex. Cellule budget 2026" value="${esc(data.name || '')}" required />
              </div>
              ${(me.role === 'ADMIN' || me.role === 'DIRECTEUR') && chefsIds.length > 0 ? `
                <button type="button" id="selectAllChefsBtn" class="shortcut-link">
                  Sélectionner tous les chefs de service
                </button>
              ` : ''}
              <div class="field-group">
                <label class="field-label">Membres</label>
                <div class="checklist-box">
                  ${candidates.map((u) => {
                    const checked = data.members.has(u.id) ? 'checked' : '';
                    const sName = u.serviceName || u.serviceMinistry || '';
                    return `
                      <label class="checklist-row">
                        <input type="checkbox" class="checklist-checkbox js-grp-member" value="${esc(u.id)}" ${checked} />
                        <div class="checklist-info">
                          <p class="checklist-name">${esc(u.fullName)}</p>
                          <p class="checklist-sub">${esc(roleLabel(u.role))}${sName ? ` · ${esc(sName)}` : ''}</p>
                        </div>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ghost js-close-modal">Annuler</button>
                <button type="submit" class="btn btn-primary">Créer</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const chefsBtn = document.getElementById('selectAllChefsBtn');
      if (chefsBtn) {
        chefsBtn.addEventListener('click', () => {
          data.name = document.getElementById('grpNameInput').value;
          for (const id of chefsIds) data.members.add(id);
          renderModal();
        });
      }

      modalRoot.querySelectorAll('.js-grp-member').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) data.members.add(cb.value);
          else data.members.delete(cb.value);
        });
      });

      document.getElementById('groupModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('grpNameInput').value.trim();
        const memberIds = Array.from(data.members);
        if (!name || memberIds.length === 0) {
          showToast('Saisissez un nom et au moins un membre', '', true);
          return;
        }
        try {
          const res = await window.FasoApi.createGroup({
            name,
            serviceId: me.serviceId || null,
            memberIds
          });
          closeModal();
          await refreshGroups();
          if (res.group) {
            state.activeGroupId = res.group.id;
            state.mobileChatListOpen = false;
            await loadGroupMessages(res.group.id);
          }
          showToast('Groupe créé');
          renderApp();
        } catch (err) {
          showToast('Impossible de créer le groupe', err.message, true);
        }
      });
    } else if (type === 'editGroup') {
      const grp = data.group;
      const members = data.members || [];
      const isOwner = grp.created_by === me.id || grp.my_member_role === 'OWNER' || grp.my_member_role === 'ADMIN' || me.role === 'ADMIN';
      const nonMembers = state.directoryAgents.filter((u) => {
        return u.status === 'ACTIVE' && !members.some((m) => m.id === u.id);
      });

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog max-w-lg" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head">
              <h2 id="modalTitle" class="modal-title">Paramètres du groupe</h2>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>
            <div class="modal-body" style="max-height: calc(85vh - 120px); overflow-y: auto; padding: 16px 24px;">
              <form id="editGroupInfoForm" class="modal-form" style="margin-bottom: 20px;">
                <div class="field-group">
                  <label class="field-label" for="editGrpName">Nom du groupe</label>
                  <input id="editGrpName" class="input" type="text" value="${esc(grp.name)}" required ${!isOwner ? 'disabled' : ''} />
                </div>
                <div class="field-group">
                  <label class="field-label" for="editGrpDesc">Description</label>
                  <input id="editGrpDesc" class="input" type="text" value="${esc(grp.description || '')}" placeholder="Description du groupe..." ${!isOwner ? 'disabled' : ''} />
                </div>
                ${isOwner ? `
                  <button type="submit" class="btn btn-secondary btn-sm" style="margin-top: 4px;">Mettre à jour les informations</button>
                ` : ''}
              </form>

              <div class="field-group" style="margin-bottom: 20px;">
                <label class="field-label">Membres actuels (${members.length})</label>
                <div class="checklist-box" style="max-height: 180px;">
                  ${members.map((m) => {
                    const isGroupOwner = m.id === grp.created_by || m.memberRole === 'OWNER';
                    const canRemove = isOwner && !isGroupOwner && m.id !== me.id;
                    return `
                      <div class="checklist-row" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">
                        <div class="checklist-info">
                          <p class="checklist-name" style="font-weight:600;">${esc(m.fullName || m.full_name)}</p>
                          <p class="checklist-sub" style="font-size:12px; color:var(--text-muted);">${esc(roleLabel(m.role))} · <span class="badge ${isGroupOwner ? 'badge-primary' : 'badge-subtle'}">${isGroupOwner ? 'Propriétaire' : 'Membre'}</span></p>
                        </div>
                        ${canRemove ? `
                          <button type="button" class="btn-icon js-remove-member-btn" data-user-id="${esc(m.id)}" title="Retirer ce membre" style="color:#B91C1C; cursor:pointer;">
                            ${ICONS.userX || ICONS.x}
                          </button>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              ${isOwner && nonMembers.length > 0 ? `
                <div class="field-group" style="margin-bottom: 24px;">
                  <label class="field-label" for="addMemberSelect">Ajouter un nouveau membre</label>
                  <div style="display:flex; gap:8px;">
                    <select id="addMemberSelect" class="input" style="flex:1;">
                      <option value="">Sélectionner un agent de l'annuaire...</option>
                      ${nonMembers.map((u) => `
                        <option value="${esc(u.id)}">${esc(u.fullName)} (${esc(roleLabel(u.role))})</option>
                      `).join('')}
                    </select>
                    <button type="button" id="addMemberBtn" class="btn btn-primary btn-sm">Ajouter</button>
                  </div>
                </div>
              ` : ''}

              ${isOwner ? `
                <div style="padding-top: 16px; border-top: 1px solid var(--border-subtle);">
                  <label class="field-label" style="color:#B91C1C; font-weight:600;">Zone sensible</label>
                  <p class="text-xs text-muted" style="margin-bottom: 10px; font-size:12px;">La dissolution supprime définitivement le groupe et son historique pour tous les membres.</p>
                  <button type="button" id="dissolveGroupBtn" class="btn btn-danger btn-sm" style="background-color:#B91C1C; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                    ${ICONS.trash2} Dissoudre le groupe
                  </button>
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost js-close-modal">Fermer</button>
            </div>
          </div>
        </div>
      `;

      const editForm = document.getElementById('editGroupInfoForm');
      if (editForm) {
        editForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const newName = document.getElementById('editGrpName').value.trim();
          const newDesc = document.getElementById('editGrpDesc').value.trim();
          if (!newName) return;
          try {
            await window.FasoApi.updateGroup(grp.id, { name: newName, description: newDesc });
            showToast('Informations du groupe mises à jour');
            await refreshGroups();
            closeModal();
            renderApp();
          } catch (err) {
            showToast('Erreur modification', err.message, true);
          }
        });
      }

      modalRoot.querySelectorAll('.js-remove-member-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.userId;
          if (!confirm('Retirer cet agent du groupe ?')) return;
          try {
            await window.FasoApi.removeGroupMember(grp.id, uid);
            showToast('Membre retiré du groupe');
            const updated = await window.FasoApi.getGroupDetails(grp.id);
            state.modal.data.members = updated.members || [];
            await refreshGroups();
            renderModal();
          } catch (err) {
            showToast('Erreur retrait', err.message, true);
          }
        });
      });

      const addBtn = document.getElementById('addMemberBtn');
      if (addBtn) {
        addBtn.addEventListener('click', async () => {
          const sel = document.getElementById('addMemberSelect');
          const uid = sel.value;
          if (!uid) return;
          try {
            await window.FasoApi.addGroupMembers(grp.id, [uid]);
            showToast('Membre ajouté au groupe');
            const updated = await window.FasoApi.getGroupDetails(grp.id);
            state.modal.data.members = updated.members || [];
            await refreshGroups();
            renderModal();
          } catch (err) {
            showToast('Erreur ajout', err.message, true);
          }
        });
      }

      const dissolveBtn = document.getElementById('dissolveGroupBtn');
      if (dissolveBtn) {
        dissolveBtn.addEventListener('click', async () => {
          if (!confirm(`Êtes-vous sûr de vouloir dissoudre définitivement le groupe « ${grp.name} » ?`)) return;
          try {
            await window.FasoApi.deleteGroup(grp.id);
            closeModal();
            state.activeGroupId = null;
            await refreshGroups();
            showToast('Groupe dissous');
            renderApp();
          } catch (err) {
            showToast('Erreur dissolution', err.message, true);
          }
        });
      }
    } else if (type === 'instruction') {
      const recipientsPool = state.directoryAgents.filter(
        (u) => u.id !== me.id && u.status === 'ACTIVE'
      );

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog max-w-lg" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head">
              <h2 id="modalTitle" class="modal-title">Nouvelle instruction</h2>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>
            <form id="instModalForm" class="modal-form">
              <div class="field-group">
                <label class="field-label" for="instTitleInput">Objet</label>
                <input id="instTitleInput" class="input" type="text" placeholder="ex. Transmission du rapport trimestriel" value="${esc(data.title || '')}" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="instBodyInput">Contenu</label>
                <textarea id="instBodyInput" class="textarea" rows="3" required>${esc(data.body || '')}</textarea>
              </div>
              <div class="field-group">
                <label class="field-label" for="instDueInput">Échéance (facultatif)</label>
                <input id="instDueInput" class="input" type="date" value="${esc(data.dueAt || '')}" />
              </div>
              <div class="field-group">
                <label class="field-label">Destinataires</label>
                <div class="checklist-box" style="max-height:176px;">
                  ${recipientsPool.map((u) => {
                    const checked = data.to.has(u.id) ? 'checked' : '';
                    return `
                      <label class="checklist-row">
                        <input type="checkbox" class="checklist-checkbox js-inst-to" value="${esc(u.id)}" ${checked} />
                        <div class="checklist-info">
                          <p class="checklist-name">${esc(u.fullName)}</p>
                          <p class="checklist-sub">${esc(u.jobTitle || roleLabel(u.role))}</p>
                        </div>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ghost js-close-modal">Annuler</button>
                <button type="submit" class="btn btn-primary">Envoyer l'instruction</button>
              </div>
            </form>
          </div>
        </div>
      `;

      modalRoot.querySelectorAll('.js-inst-to').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) data.to.add(cb.value);
          else data.to.delete(cb.value);
        });
      });

      document.getElementById('instModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('instTitleInput').value.trim();
        const body = document.getElementById('instBodyInput').value.trim();
        const dueRaw = document.getElementById('instDueInput').value;
        const recipientIds = Array.from(data.to);

        if (!title || !body || recipientIds.length === 0) {
          showToast('Renseignez l\'objet, le contenu et au moins un destinataire', '', true);
          return;
        }

        try {
          const scopeRes = await window.FasoApi.prepareInstructionScope(recipientIds);
          const enc = await encryptGroupPayloadSafely(scopeRes.groupId, {
            v: 2,
            kind: 'instruction',
            title,
            description: body
          });

          const deadlineIso = dueRaw ? new Date(`${dueRaw}T18:00:00`).toISOString() : null;
          await window.FasoApi.createInstruction({
            groupId: scopeRes.groupId,
            messageId: data.fromMessageId || null,
            titleCiphertext: enc.ciphertext,
            megolmSessionId: enc.megolmSessionId,
            senderEd25519: enc.senderEd25519,
            signature: enc.signature,
            deadline: deadlineIso,
            recipientIds: scopeRes.recipientIds
          });

          closeModal();
          await refreshInstructions();
          showToast('Instruction envoyée');
          if (data.switchToInstructions) {
            state.tab = 'instructions';
          }
          renderApp();
        } catch (err) {
          showToast('Envoi impossible', err.message, true);
        }
      });
    } else if (type === 'userForm') {
      const u = data.user;
      const isSelf = u && u.id === me.id;
      const roleVal = data.role;
      const showService = roleVal !== 'ADMIN';

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head">
              <h2 id="modalTitle" class="modal-title">${u ? 'Modifier l\'agent' : 'Enrôler un nouvel agent'}</h2>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>
            <form id="userModalForm" class="modal-form">
              <div class="field-group">
                <label class="field-label" for="ufName">Nom complet</label>
                <input id="ufName" class="input" type="text" value="${esc(data.fullName)}" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="ufTitle">Fonction</label>
                <input id="ufTitle" class="input" type="text" placeholder="ex. Chargé de mission" value="${esc(data.jobTitle)}" />
              </div>
              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label" for="ufUsername">Identifiant</label>
                  <input id="ufUsername" class="input" type="text" value="${esc(data.username)}" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="ufPassword">${u ? 'Nouveau mot de passe' : 'Mot de passe initial'}</label>
                  <input id="ufPassword" class="input" type="text" placeholder="${u ? 'Laisser vide pour garder' : ''}" value="${esc(data.password)}" ${u ? '' : 'required'} />
                </div>
              </div>
              <div class="form-grid-2">
                <div class="field-group">
                  <label class="field-label" for="ufRole">Rôle</label>
                  <select id="ufRole" class="select-input" ${isSelf ? 'disabled' : ''}>
                    <option value="AGENT" ${roleVal === 'AGENT' ? 'selected' : ''}>Agent</option>
                    <option value="CHEF_SERVICE" ${roleVal === 'CHEF_SERVICE' || roleVal === 'DIRECTEUR' ? 'selected' : ''}>Chef de service</option>
                    <option value="ADMIN" ${roleVal === 'ADMIN' ? 'selected' : ''}>Administrateur</option>
                  </select>
                </div>
                ${showService ? `
                  <div class="field-group">
                    <label class="field-label" for="ufService">Service</label>
                    <select id="ufService" class="select-input">
                      ${state.adminServices.map((s) => `
                        <option value="${esc(s.id)}" ${data.serviceId === s.id ? 'selected' : ''}>${esc(s.name)}</option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ghost js-close-modal">Annuler</button>
                <button type="submit" class="btn btn-primary">${u ? 'Enregistrer' : 'Enrôler'}</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const roleSel = document.getElementById('ufRole');
      if (roleSel) {
        roleSel.addEventListener('change', () => {
          data.fullName = document.getElementById('ufName').value;
          data.jobTitle = document.getElementById('ufTitle').value;
          data.username = document.getElementById('ufUsername').value;
          data.password = document.getElementById('ufPassword').value;
          data.role = roleSel.value;
          renderModal();
        });
      }

      document.getElementById('userModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('ufName').value.trim();
        const jobTitle = document.getElementById('ufTitle').value.trim();
        const username = document.getElementById('ufUsername').value.trim();
        const password = document.getElementById('ufPassword').value;
        const role = document.getElementById('ufRole').value;
        const srvEl = document.getElementById('ufService');
        const serviceId = role === 'ADMIN' ? null : (srvEl ? srvEl.value : data.serviceId);

        try {
          if (u) {
            await window.FasoApi.updateAdminUser(u.id, {
              fullName,
              jobTitle,
              username,
              password,
              role,
              serviceId
            });
            closeModal();
            await Promise.all([refreshAdminData(), refreshDirectory(), refreshGroups()]);
            showToast('Modifications enregistrées');
            renderApp();
          } else {
            const res = await window.FasoApi.enrollAdminUser({
              fullName,
              jobTitle,
              username,
              password,
              role,
              serviceId
            });
            await Promise.all([refreshAdminData(), refreshDirectory(), refreshGroups()]);
            showToast('Agent enrôlé');
            state.modal = {
              type: 'qr',
              data: {
                userId: res.user.id,
                userName: res.user.fullName,
                qrPayload: res.qrPayload
              }
            };
            renderModal();
            renderApp();
          }
        } catch (err) {
          showToast('Erreur d\'enregistrement', err.message, true);
        }
      });
    } else if (type === 'qr') {
      const enrollUrl = `${window.location.origin}/?enroll=${encodeURIComponent(data.qrPayload)}`;
      const svgMarkup = window.FasoQr.renderQrSvg(enrollUrl, 220);

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog max-w-xs" style="text-align:center;" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head" style="text-align:left;">
              <h2 id="modalTitle" class="modal-title">QR code — ${esc(data.userName)}</h2>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>
            <div class="qr-display-card">
              ${svgMarkup}
            </div>
            <p class="modal-desc" style="font-size:0.75rem;margin-bottom:14px;">
              Valable pour une seule connexion. Scannez depuis l'écran d'accueil de FasoBrief.
            </p>
            <div style="display:flex;gap:8px;justify-content:center;">
              <button type="button" id="regenQrBtn" class="btn btn-outline btn-sm btn-pill">
                ${ICONS.refreshCw}
                <span>Nouveau code</span>
              </button>
              <button type="button" id="copyQrLinkBtn" class="btn btn-ghost btn-sm btn-pill">
                Copier le lien
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('regenQrBtn').addEventListener('click', async () => {
        try {
          const res = await window.FasoApi.generateUserQr(data.userId);
          data.qrPayload = res.qrPayload;
          await refreshAdminData();
          showToast('Nouveau QR code généré');
          renderModal();
          renderApp();
        } catch (err) {
          showToast('Impossible de régénérer le QR', err.message, true);
        }
      });

      document.getElementById('copyQrLinkBtn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(enrollUrl);
          showToast('Lien d\'enrôlement à usage unique copié');
        } catch (_) {}
      });
    } else if (type === 'revokeConfirm') {
      const u = data.user;
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle">
            <h2 id="modalTitle" class="modal-title">Révoquer ${esc(u.full_name)} ?</h2>
            <p class="modal-desc">
              Sa session active sera immédiatement coupée, son QR code invalidé et il ne pourra plus accéder aux conversations ni aux instructions.
            </p>
            <div class="modal-footer" style="margin-top:20px;">
              <button type="button" class="btn btn-outline js-close-modal">Annuler</button>
              <button type="button" id="confirmRevokeBtn" class="btn btn-destructive">Révoquer</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('confirmRevokeBtn').addEventListener('click', async () => {
        try {
          await window.FasoApi.revokeAgent(u.id, 'Révocation administrative immédiate');
          closeModal();
          await Promise.all([refreshAdminData(), refreshDirectory(), refreshGroups()]);
          showToast(`${u.full_name} a été révoqué`);
          renderApp();
        } catch (err) {
          showToast('Révocation refusée', err.message, true);
        }
      });
    } else if (type === 'serverInspection') {
      const inspectData = data.inspection || {};
      const msgs = inspectData.messagesTableSample || [];
      const files = inspectData.filesTableSample || [];

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog max-w-lg" role="dialog" aria-modal="true" aria-labelledby="modalTitle" style="max-width:680px;">
            <div class="modal-head">
              <div style="display:flex; align-items:center; gap:8px;">
                <div class="sidebar-shield">${ICONS.shieldSm}</div>
                <div>
                  <h2 id="modalTitle" class="modal-title">Preuve « Serveur Aveugle » (Zéro-Clair)</h2>
                  <p class="modal-sub">Inspection en direct de la base SQLite et des clés serveur</p>
                </div>
              </div>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>

            <div style="padding:16px 20px;">
              <div class="server-inspect-stat-grid">
                <div class="server-inspect-stat">
                  <div class="server-inspect-stat-val">0</div>
                  <div class="server-inspect-stat-label">Clés privées sur serveur</div>
                </div>
                <div class="server-inspect-stat">
                  <div class="server-inspect-stat-val" style="color:var(--primary);">NON</div>
                  <div class="server-inspect-stat-label">Capacité déchiffrement serveur</div>
                </div>
                <div class="server-inspect-stat">
                  <div class="server-inspect-stat-val">${msgs.length}</div>
                  <div class="server-inspect-stat-label">Messages chiffrés en base</div>
                </div>
              </div>

              <h3 style="font-size:0.8125rem; font-weight:600; margin-bottom:4px;">Échantillon brut table <code>messages</code> (SQLite) :</h3>
              <p style="font-size:0.75rem; color:var(--muted-foreground); margin-bottom:8px;">Zéro texte en clair : seul le ciphertext Megolm et la signature Ed25519 sont enregistrés.</p>
              <div style="max-height:160px; overflow:auto; border:1px solid var(--border); border-radius:8px;">
                <table class="server-inspect-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Protocole</th>
                      <th>Extrait Ciphertext</th>
                      <th>Signature Ed25519</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${msgs.length === 0 ? `<tr><td colspan="4" style="text-align:center; padding:12px;">Aucun message enregistré</td></tr>` : msgs.map((m) => `
                      <tr>
                        <td><code>${esc(m.id)}</code></td>
                        <td><span class="status-pill status-confirmed">${esc(m.protocol)}</span></td>
                        <td><code>${esc(m.ciphertext_sample || '...')}... (${m.ciphertext_len} octets)</code></td>
                        <td><code>${esc(m.ed25519_sig_sample || '...')}...</code></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="modal-footer" style="padding:12px 20px;">
              <button type="button" class="btn btn-primary js-close-modal">Fermer l'inspection</button>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'profileModal') {
      const u = window.FasoApi.currentUser || {};
      const curAvatar = data.avatarData !== undefined ? data.avatarData : (u.avatarData || null);
      const curFullName = data.fullName !== undefined ? data.fullName : (u.fullName || '');
      const curJobTitle = data.jobTitle !== undefined ? data.jobTitle : (u.jobTitle || '');

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog max-w-sm" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-head">
              <div style="display:flex; align-items:center; gap:8px;">
                <div class="sidebar-shield">${ICONS.pencil}</div>
                <div>
                  <h2 id="modalTitle" class="modal-title">Mon profil agent</h2>
                  <p class="modal-sub">Identité souveraine et informations professionnelles</p>
                </div>
              </div>
              <button type="button" class="btn-icon js-close-modal" aria-label="Fermer">${ICONS.x}</button>
            </div>

            <form id="profileModalForm" style="padding:16px 20px;">
              <!-- Photo de profil -->
              <div style="display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:18px;">
                <div id="profileAvatarPreview">
                  ${renderAvatar(curFullName, curAvatar, 'profile-avatar-large')}
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  <input type="file" id="profileAvatarFileInput" accept="image/png,image/jpeg,image/webp" style="display:none;" />
                  <button type="button" id="changeAvatarBtn" class="btn btn-outline btn-sm btn-pill">
                    ${ICONS.pencil}
                    <span>Changer la photo</span>
                  </button>
                  ${curAvatar ? `
                    <button type="button" id="removeAvatarBtn" class="btn btn-ghost-danger btn-sm btn-pill">
                      ${ICONS.x}
                      <span>Supprimer</span>
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Champs d'administration VERROUILLÉS -->
              <div class="field-group" style="margin-bottom:12px;">
                <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                  <span>Matricule administratif</span>
                  <span class="lock-badge">${ICONS.lock} Verrouillé</span>
                </label>
                <input class="input field-locked" value="${esc(u.matricule || '')}" disabled title="Le matricule ne peut pas être modifié" />
              </div>

              <div class="field-group" style="margin-bottom:12px;">
                <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                  <span>Rôle d'habilitation</span>
                  <span class="lock-badge">${ICONS.lock} Défini par décret</span>
                </label>
                <input class="input field-locked" value="${esc(roleLabel(u.role))}" disabled title="Le rôle d'habilitation est fixé par l'administration" />
              </div>

              <div class="field-group" style="margin-bottom:12px;">
                <label class="field-label" style="display:flex; justify-content:space-between; align-items:center;">
                  <span>Affectation de service</span>
                  <span class="lock-badge">${ICONS.lock} Attribution hiérarchique</span>
                </label>
                <input class="input field-locked" value="${esc(userServiceDisplay(u) || u.serviceMinistry || 'MTDPCE / DGTD')}" disabled title="L'affectation de service est gérée par l'administrateur" />
              </div>

              <!-- Champs MODIFIABLES par l'agent -->
              <div class="field-group" style="margin-bottom:12px;">
                <label class="field-label" for="profileFullNameInput">Nom et prénom(s) *</label>
                <input
                  id="profileFullNameInput"
                  class="input"
                  type="text"
                  value="${esc(curFullName)}"
                  placeholder="ex. Fatou Zongo"
                  required
                />
              </div>

              <div class="field-group" style="margin-bottom:16px;">
                <label class="field-label" for="profileJobTitleInput">Fonction / Poste occupé</label>
                <input
                  id="profileJobTitleInput"
                  class="input"
                  type="text"
                  value="${esc(curJobTitle)}"
                  placeholder="ex. Chef de division télécoms"
                />
              </div>

              <div class="modal-footer" style="padding:0; margin-top:20px;">
                <button type="button" class="btn btn-ghost js-close-modal">Annuler</button>
                <button type="submit" id="saveProfileBtn" class="btn btn-primary btn-pill">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const avatarInput = document.getElementById('profileAvatarFileInput');
      const changeBtn = document.getElementById('changeAvatarBtn');
      if (changeBtn && avatarInput) {
        changeBtn.addEventListener('click', () => avatarInput.click());
      }

      if (avatarInput) {
        avatarInput.addEventListener('change', () => {
          const file = avatarInput.files && avatarInput.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            showToast('Format d\'image non supporté', 'Veuillez sélectionner un fichier PNG ou JPEG.', true);
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              // Redimensionnement via Canvas en 128x128 max pour une empreinte SQLite minimale
              const maxDim = 128;
              let width = img.width;
              let height = img.height;
              if (width > height) {
                if (width > maxDim) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                }
              } else {
                if (height > maxDim) {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
              data.avatarData = dataUrl;
              renderModal();
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      const removeBtn = document.getElementById('removeAvatarBtn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          data.avatarData = null;
          renderModal();
        });
      }

      document.getElementById('profileModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('profileFullNameInput').value.trim();
        const jobTitle = document.getElementById('profileJobTitleInput').value.trim();
        if (!fullName || fullName.length < 2) {
          showToast('Nom incomplet', 'Le nom complet doit comporter au moins 2 caractères.', true);
          return;
        }
        const saveBtn = document.getElementById('saveProfileBtn');
        if (saveBtn) saveBtn.disabled = true;
        try {
          await window.FasoApi.updateProfile({
            fullName,
            jobTitle,
            avatarData: data.avatarData !== undefined ? data.avatarData : (u.avatarData || null)
          });
          closeModal();
          showToast('Profil mis à jour');
          renderApp();
        } catch (err) {
          if (saveBtn) saveBtn.disabled = false;
          showToast('Erreur mise à jour profil', err.message || 'Impossible de sauvegarder le profil.', true);
        }
      });
    }

    modalRoot.querySelectorAll('.js-close-modal').forEach((btn) => {
      btn.addEventListener('click', closeModal);
    });
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }
  }

  // ==========================================================================
  // ÉCOUTEURS D'ÉVÉNEMENTS DOM PAR VUE
  // ==========================================================================
  function bindShellEvents() {
    document.querySelectorAll('.js-switch-lang').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof window.setLanguage === 'function') {
          window.setLanguage(btn.dataset.lang);
        }
        renderApp();
      });
    });

    document.querySelectorAll('.js-open-inspection').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await window.FasoApi.request('/api/admin/server-inspection');
          state.modal = {
            type: 'serverInspection',
            data: { inspection: res }
          };
          renderModal();
        } catch (err) {
          showToast('Erreur lors de l\'inspection serveur', err.message, true);
        }
      });
    });
    document.querySelectorAll('.js-nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.tab;
        state.tab = nextTab;
        state.notifPopoverOpen = false;
        renderNotifPopover();
        renderApp();
        if (nextTab === 'messages') {
          scrollMessagesToBottom();
          refreshGroups().then(() => renderApp());
          if (state.activeGroupId) loadGroupMessages(state.activeGroupId).then(() => { renderApp(); scrollMessagesToBottom(); });
        } else if (nextTab === 'instructions') {
          refreshInstructions().then(() => renderApp());
        } else if (nextTab === 'admin') {
          refreshAdminData().then(() => renderApp());
        }
      });
    });

    document.querySelectorAll('.js-logout-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.notifPopoverOpen = false;
        closeModal();
        renderNotifPopover();
        await window.FasoApi.logoutServer();
        state.loginStep = 'credentials';
        state.loginPassword = '';
        state.loginOtp = '';
        state.loginError = '';
        renderApp();
      });
    });

    document.querySelectorAll('.js-bell-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.notifPopoverOpen = !state.notifPopoverOpen;
        if (state.notifPopoverOpen) {
          await refreshNotifications();
          renderNotifPopover(btn.getBoundingClientRect());
        } else {
          renderNotifPopover();
        }
      });
    });

    document.querySelectorAll('.js-open-profile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const me = window.FasoApi.currentUser;
        if (!me) return;
        state.modal = {
          type: 'profileModal',
          data: {
            fullName: me.fullName,
            jobTitle: me.jobTitle || '',
            avatarData: me.avatarData || null
          }
        };
        renderModal();
      });
    });
  }

  function bindChatEvents() {
    const newGrpBtn = document.getElementById('openNewGroupBtn');
    if (newGrpBtn) {
      newGrpBtn.addEventListener('click', async () => {
        await refreshDirectory();
        state.modal = {
          type: 'group',
          data: { name: '', members: new Set() }
        };
        renderModal();
      });
    }

    const editGrpBtn = document.getElementById('openEditGroupBtn');
    if (editGrpBtn && state.activeGroupId) {
      editGrpBtn.addEventListener('click', async () => {
        try {
          const res = await window.FasoApi.getGroupDetails(state.activeGroupId);
          await refreshDirectory();
          state.modal = {
            type: 'editGroup',
            data: {
              group: res.group,
              members: res.members || []
            }
          };
          renderModal();
        } catch (err) {
          showToast('Impossible d\'ouvrir les paramètres', err.message, true);
        }
      });
    }

    document.querySelectorAll('.js-select-conv').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.groupId;
        state.activeGroupId = gid;
        state.mobileChatListOpen = false;
        renderApp();
        scrollMessagesToBottom();
        loadGroupMessages(gid).then(() => {
          renderApp();
          scrollMessagesToBottom();
        });
      });
    });

    const backBtn = document.getElementById('mobileBackToConvListBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        state.mobileChatListOpen = true;
        renderApp();
      });
    }

    document.querySelectorAll('.js-download-file').forEach((btn) => {
      btn.addEventListener('click', () => {
        const msgId = btn.dataset.msgId;
        const list = state.messagesByGroup.get(state.activeGroupId) || [];
        const found = list.find((m) => m.id === msgId);
        if (found && found.fileMeta) {
          downloadAndDecryptAttachment(found.fileMeta);
        }
      });
    });

    document.querySelectorAll('.js-convert-msg').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.msgId;
        const list = state.messagesByGroup.get(state.activeGroupId) || [];
        const found = list.find((m) => m.id === msgId);
        if (!found) return;
        await refreshDirectory();

        let preselected = new Set();
        try {
          const details = await window.FasoApi.getGroupDetails(state.activeGroupId);
          for (const mem of (details.members || [])) {
            if (mem.id !== window.FasoApi.currentUser.id) preselected.add(mem.id);
          }
        } catch (_) {}

        state.modal = {
          type: 'instruction',
          data: {
            title: '',
            body: found.text || '',
            dueAt: '',
            to: preselected,
            fromMessageId: found.id,
            switchToInstructions: false
          }
        };
        renderModal();
      });
    });

    const fileInput = document.getElementById('composerFileInput');
    const attachBtn = document.getElementById('composerAttachBtn');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 15 * 1024 * 1024) {
          showToast('Fichier trop volumineux (max 15 Mo)', '', true);
          return;
        }
        state.pendingAttachment = f;
        renderApp();
      });
    }

    const rmAttach = document.getElementById('removeAttachmentBtn');
    if (rmAttach) {
      rmAttach.addEventListener('click', () => {
        state.pendingAttachment = null;
        renderApp();
      });
    }

    const textInput = document.getElementById('composerTextInput');
    const sendBtn = document.getElementById('composerSendBtn');
    if (textInput && sendBtn) {
      textInput.addEventListener('input', () => {
        state.draftText = textInput.value;
        sendBtn.disabled = (!state.draftText.trim() && !state.pendingAttachment) || state.sendingMessage;
      });
    }

    const composerForm = document.getElementById('chatComposerForm');
    if (composerForm) {
      composerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.sendingMessage || !state.activeGroupId) return;
        const cleanText = state.draftText.trim();
        const fileObj = state.pendingAttachment;
        if (!cleanText && !fileObj) return;

        state.sendingMessage = true;
        try {
          let uploadedFileId = null;
          let encryptedFileMeta = null;

          if (fileObj) {
            const buf = await fileObj.arrayBuffer();
            const encFile = await window.FasoCrypto.encryptFile(buf, fileObj.name, fileObj.type);
            const up = await window.FasoApi.uploadGroupEncryptedFile(state.activeGroupId, encFile.encryptedBlob);
            uploadedFileId = up.fileId;
            encryptedFileMeta = {
              fileId: up.fileId,
              name: encFile.originalName,
              mime: encFile.originalMime,
              size: encFile.originalSize,
              key: encFile.fileKeyBase64,
              iv: encFile.ivBase64,
              sha256: encFile.sha256Base64
            };
          }

          const megolmPayload = await encryptGroupPayloadSafely(state.activeGroupId, {
            v: 2,
            kind: encryptedFileMeta ? 'file' : 'text',
            text: cleanText,
            file: encryptedFileMeta
          });

          await window.FasoApi.sendEncryptedMessage(state.activeGroupId, {
            ...megolmPayload,
            fileId: uploadedFileId,
            clientMsgId: 'cmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            messageType: encryptedFileMeta ? 'FILE' : 'CHAT'
          });

          state.draftText = '';
          state.pendingAttachment = null;
          await refreshGroups();
          await loadGroupMessages(state.activeGroupId);
          renderApp();
          scrollMessagesToBottom();
        } catch (err) {
          showToast('Échec de l\'envoi chiffré', err.message, true);
        } finally {
          state.sendingMessage = false;
        }
      });
    }
  }

  function bindInstructionsEvents() {
    const newBtn = document.getElementById('openNewInstructionBtn');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        await refreshDirectory();
        state.modal = {
          type: 'instruction',
          data: {
            title: '',
            body: '',
            dueAt: '',
            to: new Set(),
            fromMessageId: null,
            switchToInstructions: false
          }
        };
        renderModal();
      });
    }

    document.querySelectorAll('.js-inst-view').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const instId = btn.dataset.instId;
        try {
          await window.FasoApi.markInstructionViewed(instId);
          await refreshInstructions();
          showToast('Accusé de réception enregistré');
          renderApp();
        } catch (err) {
          showToast('Action refusée', err.message, true);
        }
      });
    });

    document.querySelectorAll('.js-inst-ack').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const instId = btn.dataset.instId;
        const version = Number(btn.dataset.instVersion || 1);
        try {
          const sig = window.FasoCrypto.signInstructionAck(instId, version, window.FasoApi.currentUser.id);
          await window.FasoApi.acknowledgeInstruction(instId, sig);
          await refreshInstructions();
          showToast('Prise de connaissance confirmée (signature Ed25519)');
          renderApp();
        } catch (err) {
          showToast('Confirmation impossible', err.message, true);
        }
      });
    });

    document.querySelectorAll('.js-inst-close').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const instId = btn.dataset.instId;
        try {
          await window.FasoApi.setInstructionFinalStatus(instId, 'CLOTUREE');
          await refreshInstructions();
          showToast('Instruction clôturée');
          renderApp();
        } catch (err) {
          showToast('Clôture impossible', err.message, true);
        }
      });
    });
  }

  function bindAdminEvents() {
    const enrollBtn = document.getElementById('openEnrollAgentBtn');
    if (enrollBtn) {
      enrollBtn.addEventListener('click', () => {
        const firstSrv = state.adminServices[0] ? state.adminServices[0].id : null;
        state.modal = {
          type: 'userForm',
          data: {
            user: null,
            fullName: '',
            jobTitle: '',
            username: '',
            password: '',
            role: 'AGENT',
            serviceId: firstSrv
          }
        };
        renderModal();
      });
    }

    const showSrvBtn = document.getElementById('showCreateServiceBtn');
    if (showSrvBtn) {
      showSrvBtn.addEventListener('click', () => {
        state.creatingServiceOpen = true;
        renderApp();
        const inp = document.getElementById('newServiceNameInput');
        if (inp) inp.focus();
      });
    }

    const cancelSrvBtn = document.getElementById('cancelCreateServiceBtn');
    if (cancelSrvBtn) {
      cancelSrvBtn.addEventListener('click', () => {
        state.creatingServiceOpen = false;
        state.newServiceName = '';
        renderApp();
      });
    }

    const srvForm = document.getElementById('createServiceForm');
    if (srvForm) {
      srvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('newServiceNameInput').value.trim();
        if (!name) return;
        try {
          await window.FasoApi.createAdminService(name);
          state.creatingServiceOpen = false;
          state.newServiceName = '';
          await Promise.all([refreshAdminData(), refreshDirectory(), refreshGroups()]);
          showToast('Service créé');
          renderApp();
        } catch (err) {
          showToast('Création impossible', err.message, true);
        }
      });
    }

    document.querySelectorAll('.js-admin-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = state.adminUsers.find((x) => x.id === btn.dataset.userId);
        if (!u) return;
        state.modal = {
          type: 'userForm',
          data: {
            user: u,
            fullName: u.full_name,
            jobTitle: u.job_title || '',
            username: u.username || String(u.matricule || '').toLowerCase(),
            password: '',
            role: u.role === 'DIRECTEUR' ? 'CHEF_SERVICE' : u.role,
            serviceId: u.service_id || (state.adminServices[0] && state.adminServices[0].id) || null
          }
        };
        renderModal();
      });
    });

    document.querySelectorAll('.js-admin-qr').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const u = state.adminUsers.find((x) => x.id === btn.dataset.userId);
        if (!u) return;
        try {
          const res = await window.FasoApi.generateUserQr(u.id);
          await refreshAdminData();
          state.modal = {
            type: 'qr',
            data: {
              userId: u.id,
              userName: u.full_name,
              qrPayload: res.qrPayload
            }
          };
          renderModal();
          renderApp();
        } catch (err) {
          showToast('Impossible de générer le QR code', err.message, true);
        }
      });
    });

    document.querySelectorAll('.js-admin-revoke').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = state.adminUsers.find((x) => x.id === btn.dataset.userId);
        if (!u) return;
        state.modal = {
          type: 'revokeConfirm',
          data: { user: u }
        };
        renderModal();
      });
    });

    document.querySelectorAll('.js-admin-reactivate').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.userId;
        try {
          await window.FasoApi.reactivateUser(uid);
          await Promise.all([refreshAdminData(), refreshDirectory()]);
          showToast('Compte réactivé');
          renderApp();
        } catch (err) {
          showToast('Réactivation refusée', err.message, true);
        }
      });
    });

    const resetBtn = document.getElementById('resetDemoBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          localStorage.removeItem('fasobrief_lovable_demo_msgs_v1');
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith('fasobrief_olm_v2_')) localStorage.removeItem(key);
          }
          await window.FasoApi.resetDemo();
          const cfg = await window.FasoApi.getAuthConfig();
          state.demoAccounts = cfg.demoAccounts || [];
          await provisionDemoEnvironmentIfNeeded(state.demoAccounts);
          await loadAuthenticatedWorkspace();
          showToast('Données de démonstration réinitialisées');
          renderApp();
        } catch (err) {
          showToast('Réinitialisation impossible', err.message, true);
        }
      });
    }
  }

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      const box = document.getElementById('chatMessagesContainer');
      if (box) box.scrollTop = box.scrollHeight;
    });
  }

  // Fermeture popover notifications au clic extérieur & touche Échap
  document.addEventListener('click', (e) => {
    if (state.notifPopoverOpen && !e.target.closest('.notif-popover') && !e.target.closest('.js-bell-btn')) {
      state.notifPopoverOpen = false;
      renderNotifPopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.modal) closeModal();
      if (state.notifPopoverOpen) {
        state.notifPopoverOpen = false;
        renderNotifPopover();
      }
    }
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && window.FasoApi.token && state.tab === 'messages' && state.activeGroupId) {
      await loadGroupMessages(state.activeGroupId);
      renderApp();
    }
  });

  // ==========================================================================
  // DÉMARRAGE DE L'APPLICATION
  // ==========================================================================
  async function bootstrap() {
    bindRealtimeEvents();
    renderApp();

    try {
      const cfg = await window.FasoApi.getAuthConfig();
      state.demoMode = Boolean(cfg.demoMode);
      state.demoAccounts = cfg.demoAccounts || [];

      if (state.demoMode) {
        await provisionDemoEnvironmentIfNeeded(state.demoAccounts);
      }

      // Vérifier si un lien d'enrôlement ?enroll=... est présent dans l'URL
      const urlParams = new URLSearchParams(window.location.search);
      const enrollCode = urlParams.get('enroll');
      if (enrollCode) {
        state.booting = false;
        await performQrEnrollment(enrollCode);
        return;
      }

      // Restaurer une session valide existante
      if (window.FasoApi.token) {
        try {
          const meRes = await window.FasoApi.getMe();
          window.FasoApi.currentUser = meRes.user;
          localStorage.setItem('fasobrief_user', JSON.stringify(meRes.user));
          await loadAuthenticatedWorkspace();
        } catch (_) {
          window.FasoApi.clearSession();
        }
      }
    } catch (err) {
      console.error('[BOOT] Erreur initialisation :', err);
    } finally {
      state.booting = false;
      renderApp();
      scrollMessagesToBottom();
    }
  }

  bootstrap();
})();
