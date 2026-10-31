/**
 * FASOBRIEF — Module Multilingue Institutionnel (Bonus +3 points)
 * Langues supportées : Français (officiel), Mooré et Dioula (langues nationales du Burkina Faso)
 * Fonctionne 100 % hors-ligne, zéro ressource distante, zéro CDN.
 */

const I18N = {
  fr: {
    app_title: "FasoBrief",
    app_subtitle: "Messagerie souveraine de l'administration",
    tagline: "Plateforme souveraine E2EE pour l'administration publique",
    login_title: "Connexion sécurisée",
    login_step1_desc: "Identifiez-vous à l'aide de votre matricule administratif",
    login_step2_title: "Second facteur (TOTP)",
    login_step2_desc: "Saisissez le code à 6 chiffres généré par votre application d'authentification",
    matricule_label: "Matricule",
    password_label: "Mot de passe",
    btn_login: "Continuer",
    btn_verify: "Vérifier et accéder",
    btn_back: "Retour",
    simulate_intruder: "Simuler l'attaque d'un Intrus (403)",
    intruder_alert_title: "ÉPREUVE INTRUS : ACCÈS STRICTEMENT REFUSÉ (HTTP 403)",
    intruder_alert_desc: "Tentative d'accès par un agent non préalablement enrôlé. Bloqué côté serveur et consigné dans le journal d'audit.",
    nav_messages: "Messages",
    nav_instructions: "Instructions",
    nav_admin: "Administration",
    btn_new_group: "Groupe",
    btn_new_instruction: "Nouvelle instruction",
    btn_inspect_server: "Inspecteur BDD (Zéro-Clair)",
    btn_logout: "Déconnexion",
    composer_placeholder: "Écrire un message officiel chiffré...",
    restricted_access: "Accès restreint E2EE",
    instruction_object: "Objet",
    instruction_content: "Contenu",
    instruction_deadline: "Échéance",
    instruction_recipients: "Destinataires",
    btn_ack_instruction: "Accuser réception (Ed25519)",
    btn_progress_instruction: "Démarrer",
    btn_execute_instruction: "Déclarer exécutée",
    btn_close_instruction: "Clôturer",
    status_published: "PUBLIÉE",
    status_closed: "CLÔTURÉE",
    status_confirmed: "CONFIRMÉE",
    status_executed: "EXÉCUTÉE",
    status_in_progress: "EN COURS",
    status_viewed: "CONSULTÉE",
    audit_title: "Journal d'audit immuable",
    demo_mode_badge: "Chiffrement E2EE Olm/Megolm — Données fictives",
    switch_lang_aria: "Changer de langue"
  },
  mo: {
    app_title: "FasoBrief",
    app_subtitle: "Leta tʋʋm sõsg la no-rɩkgo zĩiga",
    tagline: "Leta tʋʋm solgem sõsg zĩiga Burkina Faso pʋgẽ",
    login_title: "Kẽe tʋʋmdẽ laafɩ pʋgẽ",
    login_step1_desc: "Kẽes yãmb leta tʋʋm sõore la gom-solgre",
    login_step2_title: "Pãng paasgo 2FA (TOTP)",
    login_step2_desc: "Kẽes sõor a yoob n wilgi tɩ yaa yãmba",
    matricule_label: "Tʋmtʋmd sõore",
    password_label: "Gom-solgre",
    btn_login: "Kẽe masã",
    btn_verify: "Ges kaseto n kẽ",
    btn_back: "Lebe poorẽ",
    simulate_intruder: "Mak ned sẽn ka segd n kẽ (403)",
    intruder_alert_title: "GŨUSGO : NED SẼN KA SEGD N KẼ WÃ RIKAME (HTTP 403)",
    intruder_alert_desc: "Ned ninga sẽn ka leta tʋmtʋmd sebrẽ ka tõe n kẽ ye. Gũusdbã gʋlsa kaseto masã.",
    nav_messages: "Sõsga",
    nav_instructions: "Tʋʋm noy",
    nav_admin: "Gũusgo",
    btn_new_group: "Sull paalga",
    btn_new_instruction: "Tʋʋm no-paalga",
    btn_inspect_server: "Ges sebre (Zéro-Clair)",
    btn_logout: "Yi kɛɛnga",
    composer_placeholder: "Gʋls yãmb tʋʋm gomde solgr pʋgẽ...",
    restricted_access: "Solgem pãng beeme",
    instruction_object: "Tʋʋm yʋre",
    instruction_content: "Gom-kãsenga",
    instruction_deadline: "Baasg wakato",
    instruction_recipients: "Deegdbã",
    btn_ack_instruction: "Wilgi tɩ m deegame (Ed25519)",
    btn_progress_instruction: "Sɩng tʋʋmde",
    btn_execute_instruction: "Wilgi tɩ tʋʋmd saame",
    btn_close_instruction: "Pidsame",
    status_published: "YIISA",
    status_closed: "PIDSAME",
    status_confirmed: "DEEGAME",
    status_executed: "SAAME",
    status_in_progress: "TƲƲMDAME",
    status_viewed: "GESAME",
    audit_title: "Tʋʋm kaset sebre sẽn ka sãamd ye",
    demo_mode_badge: "Solgem kãngã tara pãng (Olm/Megolm)",
    switch_lang_aria: "Togl buud gomde"
  },
  di: {
    app_title: "FasoBrief",
    app_subtitle: "Faso baaradenw ka kumakan lakodolen",
    tagline: "Faso baaradenw ka kumakan lakodolen E2EE Burkina Faso",
    login_title: "Don lakanani kɔnɔ",
    login_step1_desc: "I ka baaraden jateminɛ sɛbɛ yan",
    login_step2_title: "Lakanali sɔnna 2FA (TOTP)",
    login_step2_desc: "I ka nɔnbɔrɔ wolonwula don walasa ka don kɔnɔ",
    matricule_label: "Baaraden jateminɛ",
    password_label: "Gundo kumaden",
    btn_login: "Taa ɲɛfɛ",
    btn_verify: "A sɛbɛya ka don",
    btn_back: "Kɔsegi",
    simulate_intruder: "Gundo mɔgɔ kɔlɔsi (403)",
    intruder_alert_title: "KƆLƆSILI : MƆGƆ MIN TƐ BAARADEN YE A BƆRA (HTTP 403)",
    intruder_alert_desc: "Mɔgɔ min tɛ sɔrɔ baaradenw cɛma, a tɛ se ka don. Kɔlɔsilisɛbɛ ye nin don a kɔnɔ sisan.",
    nav_messages: "Barow",
    nav_instructions: "Cikanw",
    nav_admin: "Kɔlɔsili",
    btn_new_group: "Jɛkulu kura",
    btn_new_instruction: "Cikan kura",
    btn_inspect_server: "Dankun lajɛ (Zéro-Clair)",
    btn_logout: "Bɔ kɛnɛ kan",
    composer_placeholder: "I ka kuma dogolen sɛbɛ yan...",
    restricted_access: "Lakanali dogolen b'a la",
    instruction_object: "Koo",
    instruction_content: "Kumaɲɔgɔnya",
    instruction_deadline: "Wati latigɛlen",
    instruction_recipients: "Mɔgɔw",
    btn_ack_instruction: "Sɛbɛya kɛ ko n y'a mɛn (Ed25519)",
    btn_progress_instruction: "Daminɛ",
    btn_execute_instruction: "A dafara",
    btn_close_instruction: "A banna",
    status_published: "BƆRA",
    status_closed: "BANNA",
    status_confirmed: "SƆNNA",
    status_executed: "DAFARA",
    status_in_progress: "BE KƐ LA",
    status_viewed: "YE A YE",
    audit_title: "Baara sɛbɛ kɔlɔsili min tɛ tinya",
    demo_mode_badge: "Lakanali sɔnna kosɛbɛ (Olm/Megolm)",
    switch_lang_aria: "Yɛlɛma kan wɛrɛ la"
  }
};

let currentLang = localStorage.getItem('fasobrief_lang') || 'fr';

function t(key) {
  if (I18N[currentLang] && I18N[currentLang][key]) {
    return I18N[currentLang][key];
  }
  return (I18N.fr && I18N.fr[key]) || key;
}

function getLanguage() {
  return currentLang;
}

function setLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('fasobrief_lang', lang);
  if (typeof window !== 'undefined') {
    if (typeof window.applyTranslations === 'function') {
      window.applyTranslations();
    }
    // Déclencher un événement personnalisé
    window.dispatchEvent(new CustomEvent('fasobrief_lang_changed', { detail: { lang } }));
  }
}

window.I18N = I18N;
window.t = t;
window.getLanguage = getLanguage;
window.setLanguage = setLanguage;

