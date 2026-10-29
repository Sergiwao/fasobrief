/**
 * FASOBRIEF — Module Multilingue Institutionnel (Français, Mooré, Dioula)
 * Aucune ressource distante. Zéro emoji.
 */

const I18N = {
  fr: {
    app_title: "FASOBRIEF",
    app_subtitle: "Messagerie souveraine de l'administration",
    nav_chat: "Discussions",
    nav_directory: "Annuaire",
    nav_instructions: "Instructions",
    nav_notifications: "Alertes",
    nav_admin: "Administration",
    placeholder_message: "Écrire un message officiel chiffré...",
    btn_new_group: "Groupe",
    btn_new_instruction: "Nouvelle instruction",
    btn_mark_all_read: "Tout marquer comme lu",
    btn_logout: "Déconnexion",
    btn_theme: "Basculer le thème (Clair / Sombre)",
    dir_title: "Annuaire administratif",
    dir_desc: "Recherchez un agent actif par organisation, direction ou service pour ouvrir un échange chiffré.",
    inst_title: "Instructions administratives",
    inst_desc: "Suivi formel des instructions de service : consultation, confirmation signée Ed25519 et exécution.",
    notif_title: "Centre de notifications",
    notif_desc: "Événements internes persistés sans contenu confidentiel en clair.",
    admin_title: "Administration, sécurité et audit",
    admin_desc: "Gestion du cycle de vie des comptes, révocation immédiate et traçabilité immuable."
  },
  mo: {
    app_title: "FASOBRIEF",
    app_subtitle: "Leta tʋʋm sõsg la no-rɩkgo zĩiga",
    nav_chat: "Sõsga",
    nav_directory: "Tʋmtʋmdbã",
    nav_instructions: "Tʋʋm noy",
    nav_notifications: "Kibaré",
    nav_admin: "Gũusgo",
    placeholder_message: "Gʋls yãmb tʋʋm gomde solgr pʋgẽ...",
    btn_new_group: "Sull paalga",
    btn_new_instruction: "Tʋʋm no-paalga",
    btn_mark_all_read: "Wilg tɩ m karma fãa",
    btn_logout: "Yi kɛɛnga",
    btn_theme: "Togl vẽenem la liki",
    dir_title: "Leta tʋmtʋmdbã sebre",
    dir_desc: "Bao tʋmtʋmd n sɩng sõsg sẽn solge.",
    inst_title: "Leta tʋʋm noy la b tũubu",
    inst_desc: "Tʋʋm noy gũusgo, deegb la tʋʋmd baasgo wilgri.",
    notif_title: "Kibaré la tẽegre",
    notif_desc: "Tʋʋm kibaré sẽn ka wilgd gom-solgds ye.",
    admin_title: "Gũusgo la sõsg sebre",
    admin_desc: "Tʋmtʋmdbã kẽesgo, pãng yiisgo la tʋʋm kaseto."
  },
  di: {
    app_title: "FASOBRIEF",
    app_subtitle: "Faso baaradenw ka kumakan lakodolen",
    nav_chat: "Barow",
    nav_directory: "Baaradenw",
    nav_instructions: "Cikanw",
    nav_notifications: "Laseliw",
    nav_admin: "Kɔlɔsili",
    placeholder_message: "I ka kuma dogolen sɛbɛ yan...",
    btn_new_group: "Jɛkulu kura",
    btn_new_instruction: "Cikan kura",
    btn_mark_all_read: "A bɛɛ kɛ kalannen ye",
    btn_logout: "Bɔ kɛnɛ kan",
    btn_theme: "Yeelen walima dibi",
    dir_title: "Faso baaradenw ka lajɛyɔrɔ",
    dir_desc: "Baaraden ɲini ka baro lakodolen daminɛ.",
    inst_title: "Baara cikanw ni u kɔlɔsili",
    inst_desc: "Cikanw lase, u sɔnni ni u baara dafalen.",
    notif_title: "Laseliw yɔrɔ",
    notif_desc: "Laseliw minnu tɛ gundo bɔ kɛnɛ kan.",
    admin_title: "Lakanali ni kɔlɔsili sɛbɛ",
    admin_desc: " Kɔntiw dilanni, josira dabilali ani kɔlɔsili."
  }
};

let currentLang = localStorage.getItem('fasobrief_lang') || 'fr';

function t(key) {
  if (I18N[currentLang] && I18N[currentLang][key]) {
    return I18N[currentLang][key];
  }
  return (I18N.fr && I18N.fr[key]) || key;
}

function setLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem('fasobrief_lang', lang);
  document.documentElement.lang = lang === 'fr' ? 'fr' : 'fr';
  applyTranslations();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });
}

window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;
