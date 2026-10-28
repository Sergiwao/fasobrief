/**
 * FASOBRIEF - Module Multilingue (Bonus +3 points)
 * Support : Français (langue officielle), Mooré et Dioula (langues nationales du Burkina Faso)
 */

const I18N = {
  fr: {
    app_title: "FASOBRIEF",
    app_subtitle: "Messagerie Souveraine de l'Administration Publique",
    security_badge: "Chiffrement E2EE Actif",
    badge_2fa: "2FA Vérifié",
    zero_leak: "Zéro Fuite Serveur",
    tab_chat: "Discussions",
    tab_instructions: "Instructions",
    tab_security: "Sécurité",
    tab_audit: "Audit",
    group_title: "Groupes Officiels",
    placeholder_message: "Rédigez un message chiffré de bout en bout...",
    btn_send: "Envoyer (Chiffré)",
    btn_attach: "Joindre Fichier (E2EE)",
    btn_make_instruction: "Transformer en Instruction",
    status_pending: "En attente",
    status_acknowledged: "Pris en compte",
    status_completed: "Clôturé",
    btn_ack: "Accuser Prise de Connaissance",
    instruction_created_by: "Instruction émise par",
    deadline: "Échéance",
    recipients_status: "État des Destinataires",
    revoke_agent: "Révoquer l'accès immédiatement",
    revoked_badge: "RÉVOQUÉ",
    active_badge: "ACTIF",
    logout: "Déconnexion",
    demo_switch: "Changer de compte de démo",
    role_admin: "Administrateur Sécurité",
    role_dir: "Directeur Général",
    role_chef: "Chef de Service",
    role_agent: "Agent Opérationnel",
    view_ciphertext: "Inspecter Ciphertext (Preuve E2EE)",
    modal_2fa_title: "Authentification Forte - 2ème Facteur (TOTP)",
    modal_2fa_desc: "Entrez le code à 6 chiffres généré par votre application d'authentification.",
    btn_validate_2fa: "Valider la Session",
    btn_demo_2fa: "Générer Code Démo",
    intrusion_test_btn: "Tester Tentative d'Intrusion",
    inspect_db_btn: "Inspecter Base SQL (Zéro Clair)"
  },
  mo: { // Mooré
    app_title: "FASOBRIEF",
    app_subtitle: "Leta tʋʋm gʋls-kãsenga la sõngr zĩiga",
    security_badge: "Solgem kãngã tara pãng (E2EE)",
    badge_2fa: "Tõnd sõor 2FA sõngame",
    zero_leak: "Baasgo ka be seervɛɛrẽ ye",
    tab_chat: "Gʋls-n-taase solgr pʋgẽ",
    tab_instructions: "Leta tʋʋm noy la b gũub",
    tab_security: "Leta laafɩ la bõn-yalsgo zĩiga",
    tab_audit: "Sõsg sebr sẽn ka sãamd ye",
    group_title: "Tʋʋm sull rãmba",
    placeholder_message: "Gʋls yãmb tʋʋm gomde solgr pʋgẽ...",
    btn_send: "Tigs gomde (Solgre)",
    btn_attach: "Paas sebre (Chiffré)",
    btn_make_instruction: "Kɩt tɩ lebg tʋʋm noore",
    status_pending: "Gũusdame",
    status_acknowledged: "Deegame tɩ wilgi",
    status_completed: "Tʋʋmd saame",
    btn_ack: "Wilgi tɩ m deegame",
    instruction_created_by: "Noor rɩka yita",
    deadline: "Tʋʋmd wakato",
    recipients_status: "Sẽn segd n deeg bãmb zĩiga",
    revoke_agent: "Yiis a pãnga masã",
    revoked_badge: "YIISA",
    active_badge: "TƲƲMDAME",
    logout: "Yik kɛɛnga",
    demo_switch: "Togl ned a to yʋre",
    role_admin: "Gũusd kãsenga",
    role_dir: "Leta tʋʋm taoor soaba",
    role_chef: "Sull taoor soaba",
    role_agent: "Tʋʋm tʋmtʋmda",
    view_ciphertext: "Ges solgem yɛla (Preuve E2EE)",
    modal_2fa_title: "Pãng paasgo 2FA (TOTP)",
    modal_2fa_desc: "Kẽes yãmb sõor a yoob n bãng yãmb menga.",
    btn_validate_2fa: "Kẽe tʋʋmdẽ",
    btn_demo_2fa: "Yiis sõor masã",
    intrusion_test_btn: "Mak ned sẽn ka segd n kẽ",
    inspect_db_btn: "Ges sebre (Bũmb ka be vẽeneg ye)"
  },
  di: { // Dioula
    app_title: "FASOBRIEF",
    app_subtitle: "Faso baaradenw ka kumakan lakodolen",
    security_badge: "Kunnafoni dogolen don kosɛbɛ (E2EE)",
    badge_2fa: "2FA Sɛbɛya kɛra",
    zero_leak: "Foyi ma bɔ kɛnɛ kan",
    tab_chat: "Kuma dogolenw",
    tab_instructions: "Baara cikanw ni kɔlɔsili",
    tab_security: "Lakanali ni bɔli kɛrɛnkɛrɛnnen",
    tab_audit: "Baara sɛbɛ kɔlɔsili",
    group_title: "Faso baara jɛkuluw",
    placeholder_message: "I ka kuma dogolen sɛbɛ yan...",
    btn_send: "A ci (Dogolen)",
    btn_attach: "Dosiyen fara a kan (E2EE)",
    btn_make_instruction: "A kɛ baara cikan ye",
    status_pending: "Makɔnɔli la",
    status_acknowledged: "A ye a ye, a sɔnna",
    status_completed: "Baara banna",
    btn_ack: "Sɛbɛya kɛ ko n y'a mɛn",
    instruction_created_by: "Cikan bɔra",
    deadline: "Wati latigɛlen",
    recipients_status: "Mɔgɔw ka jɔyɔrɔ",
    revoke_agent: "A ka baara dabila sisan",
    revoked_badge: "DABILALEN",
    active_badge: "A BE BAARA LA",
    logout: "Bɔ kɛnɛ ma",
    demo_switch: "Jateminɛ wɛrɛ ta",
    role_admin: "Lakanabaga Kuntigi",
    role_dir: "Ɲɛmɔgɔba Kuntigi",
    role_chef: "Baarakulu Ɲɛmɔgɔ",
    role_agent: "Baaraden",
    view_ciphertext: "Kuma dogolen lajɛ (Preuve E2EE)",
    modal_2fa_title: "Lakanali sɔnna 2FA (TOTP)",
    modal_2fa_desc: "I ka nɔnbɔrɔ wolonwula don walasa ka kɛnɛ lakanali bila sira la.",
    btn_validate_2fa: "Don a kɔnɔ",
    btn_demo_2fa: "Nɔnbɔrɔ dilan sisan",
    intrusion_test_btn: "Gundo mɔgɔ kɔlɔsi",
    inspect_db_btn: "Dankun lajɛ (Foyi tɛ kɛnɛ kan)"
  }
};

let currentLang = 'fr';

function t(key) {
  if (I18N[currentLang] && I18N[currentLang][key]) {
    return I18N[currentLang][key];
  }
  return I18N['fr'][key] || key;
}

function setLanguage(lang) {
  if (I18N[lang]) {
    currentLang = lang;
    localStorage.setItem('fasobrief_lang', lang);
    applyTranslations();
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.placeholder) el.placeholder = t(key);
    } else {
      el.textContent = t(key);
    }
  });
}
