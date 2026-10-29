# AGENTS.md — Contexte persistant du projet FasoBrief

> Fichier de référence unique pour tout agent (humain ou IA) travaillant sur ce dépôt.
> À relire avant toute modification et à mettre à jour après chaque changement significatif.
> Sources faisant foi, par ordre : `Sprint_Technique_Pre-Hackathon_2026-KFD.pdf` (règlement officiel),
> puis `FasoBrief_Prompt_AntiGravity.md` (cahier de mission), puis le complément « Prompt d'extension »
> (fonctionnement métier, notifications, UX, contrôle qualité).

---

## 1. Objectif et périmètre

FasoBrief est une messagerie souveraine auto-hébergée pour les agents de l'administration publique
(démonstration : MTDPCE / DGTD, Burkina Faso), dotée d'une fonction distinctive : transformer ou émettre
des échanges sous forme d'**instructions administratives structurées, chiffrées et versionnées**, et en
suivre nominativement la consultation, la confirmation signée Ed25519 et l'exécution.

Usage principal : **téléphone mobile** (`320px` à `1440px`). Données de démonstration **strictement fictives**.

Hors périmètre : service tiers indispensable (API externe, push via FCM/APNs, SMTP externe, CDN de polices),
tests sur des systèmes réels, auto-inscription publique.

## 2. Exigences obligatoires (règlement + cahier initial)

| Exigence | Type | Statut vérifié |
|---|---|---|
| Chiffrement E2EE des messages **et** fichiers via protocole open source éprouvé | Éliminatoire | **OK** (`@matrix-org/olm` Olm + Megolm + WebCrypto `AES-256-GCM`) |
| Aucune cryptographie maison | Éliminatoire | **OK** |
| Aucun message, titre/corps d'instruction ni fichier en clair côté serveur | Éliminatoire | **OK** (vérifié par inspection SQLite et tests automatisés) |
| Agents préalablement enrôlés uniquement (épreuve « intrus ») | Éliminatoire | **OK** (rejet HTTP 403 + trace `INTRUSION_ATTEMPT`) |
| Authentification forte (second facteur TOTP RFC 6238) | Obligatoire | **OK** (`challengeToken` requis, aucun code maître) |
| Rôles et permissions vérifiés côté serveur | Obligatoire | **OK** (`ADMIN`, `DIRECTEUR`, `CHEF_SERVICE`, `AGENT`) |
| Révocation immédiate sur tous les appareils et conversations | Éliminatoire | **OK** (coupure WebSocket `4001`, purge clés Olm, incrément `key_epoch`, rotation Megolm) |
| Minimisation et documentation des métadonnées | Noté | **OK** (`docs/NOTE_SECURITE.md`) |
| Auto-hébergement, déploiement en une commande (`docker compose up --build`) | Obligatoire | **OK** (`Dockerfile` + `docker-compose.yml` + `/api/health`) |
| Aucun service tiers indispensable | Éliminatoire | **OK** |
| Licence OSI (`LICENSE` Apache-2.0), dépôt public, commits progressifs | Obligatoire | **OK** |
| README FR ≤ 2 p., note pré-projet ≤ 2 p., note sécurité ≤ 2 p., vidéo ≤ 3 min | Livrables | **OK** |

## 3. Rôles et permissions (vérifiés côté serveur)

| Action | ADMIN | DIRECTEUR | CHEF_SERVICE | AGENT |
|---|---|---|---|---|
| Créer un compte (invitation 128 bits) | oui | non | non | non |
| Suspendre / réactiver un compte | oui | non | non | non |
| Révoquer définitivement un agent | oui | oui (sauf ADMIN, sauf soi-même) | non | non |
| Consulter l'annuaire (agents actifs) | oui | oui | oui | oui |
| Voir le statut des comptes (invité/suspendu/révoqué) | oui | oui | non | non |
| Ouvrir une conversation individuelle (`DIRECT`) | oui | oui | oui | oui |
| Créer un groupe (`GROUP`) | oui | oui | oui | non |
| Ajouter/retirer des membres d'un groupe | propriétaire/admin du groupe, ou ADMIN plateforme | idem | idem | idem |
| Modifier nom/description d'un groupe | propriétaire/admin du groupe, ou ADMIN plateforme | idem | idem | idem |
| Quitter un groupe | tout membre (interdit sur `DIRECT`) | | | |
| Envoyer / lire messages & fichiers dans un canal | tout membre actif uniquement (y compris ADMIN : pas d'accès au contenu s'il n'est pas membre) | | | |
| Créer / publier une instruction | oui | oui | oui | non |
| Confirmer réception (Ed25519) / déclarer exécution | destinataire désigné uniquement | | | |
| Modifier (nouvelle version) / clôturer / annuler | émetteur uniquement | | | |
| Journal d'audit & inspection SQLite | oui | oui | non | non |

## 4. Architecture et fonctionnement métier réels

- **Serveur** : Node.js 24, Express 5, `ws` (`/ws`), SQLite natif (`node:sqlite`), `bcryptjs`, `otplib`, `multer`, `@matrix-org/olm` (vérification serveur `ed25519_verify` des accusés d'instruction).
- **Routes modulaires** : `server/routes/auth-routes.js`, `crypto-routes.js`, `directory-routes.js`, `conversations-routes.js`, `instructions-routes.js`, `notifications-routes.js`, `admin-routes.js`.
- **Migrations de schéma non destructives** : `server/database.js` (`schema_version` v2). Le seed (`server/seed.js`) est idempotent (`INSERT OR IGNORE`) et ne réactive jamais un compte révoqué au redémarrage ; réinitialisation explicite via `npm run reset-demo`.
- **Chiffrement E2EE réel (`client/js/crypto-client.js`)** :
  - Chaque session utilisateur initialise ou restaure un `Olm.Account` isolé (`Curve25519` + `Ed25519` + 30 `One-Time Keys` + `Fallback Key`), persisté chiffré par `pickleKey` dans `localStorage`.
  - Les messages et instructions d'une conversation sont chiffrés via `Olm.OutboundGroupSession` (**Megolm**) et signés `Ed25519`.
  - La clé de session Megolm (`m.room_key` / `m.forwarded_room_key`) est distribuée appareil par appareil via `Olm.Session` (**Double Ratchet 1:1**).
  - Tout retrait, départ, suspension ou révocation incrémente `groups.key_epoch` et émet `GROUP_KEY_ROTATION_REQUIRED`, forçant la création d'une nouvelle `OutboundGroupSession` Megolm partagée uniquement aux terminaux actifs restants.
  - Les pièces jointes sont chiffrées côté client en `AES-256-GCM` (256 bits, IV 96 bits) avec empreinte `SHA-256` ; la clé, l'IV, le nom réel et le type MIME transitent uniquement dans le message Megolm.
- **Comptes & Activation** : `INVITED` → `ACTIVE` ⇄ `SUSPENDED` → `REVOKED` (irréversible). Code d'activation 128 bits haché SHA-256 en base (expiration 72 h), remis hors bande (aucun SMTP tiers).
- **Statuts de message réels** : horloge (`pending`), alerte + renvoi idempotent (`clientMsgId`), 1 coche grise (`sent`), 2 coches grises (`delivered` par tous les destinataires actifs), 2 coches vertes `#00705A` (`read` par tous, émis uniquement si la conversation est ouverte et `document.visibilityState === 'visible'`), modale « Infos du message ».
- **Instructions versionnées** : `BROUILLON` → `PUBLIEE` → `CLOTUREE` | `ANNULEE`. Par destinataire : `TRANSMISE` → `CONSULTEE` (`viewed_at` ≠ confirmation) → `CONFIRMEE` (signature Ed25519 vérifiée côté serveur) → `EN_COURS` → `EXECUTEE` (+ indicateur `EN RETARD`). Toute modification d'une instruction `PUBLIEE` crée une version `v+1`, conserve l'historique dans `instruction_events` et exige une nouvelle confirmation.
- **Notifications** : persistées en base (`notifications`) avec déduplication `dedup_key`, zéro texte confidentiel, temps réel WebSocket, sourdine par canal, alerte d'échéance `< 24 h`, notifications système navigateur opt-in (application ouverte uniquement).
- **Mode démonstration jury** : activé uniquement si `FASOBRIEF_DEMO_MODE=1` (`npm run start:demo`). Pré-enregistre de vrais terminaux Olm sur le navigateur courant pour permettre le changement rapide de compte dans un même onglet sans affaiblir le chiffrement E2EE. Désactivé par défaut (`npm start`, `docker compose up`, `npm test`).

## 5. Charte graphique et typographique appliquée

- Palette Cupertino souveraine : cartes blanches `#FFFFFF` sur canevas neutre `#F5F5F7` (pistes encastrées `#E8E8ED`), vert institutionnel `#00705A` (conteneur tonal `#E6F4F1`), ambre `#B45309`, rouge `#B91C1C` ; mode sombre tonal Cupertino `#111216` / `#1C1C1E` / `#2C2C2E` sans noir pur `#000000`, sans dégradé ni glow, et support `@media (prefers-contrast: more)` + `@media (prefers-reduced-motion: reduce)`.
- Zéro dégradé, zéro emoji, zéro glow, zéro glassmorphism (`backdrop-filter` exclu par conformité au cahier initial ; la profondeur de `apple-design` §12 est rendue par l'empilement tonal et le recul d'échelle `scale(0.978)` de `#appShell` sous les feuilles modales), zéro URL externe/CDN.
- Police système uniquement ; échelle relative `0.75 / 0.875 / 0.9375 / 1.0625 / 1.25 rem` (`12 / 14 / 15 / 17 / 20 px`) avec tracking optique WWDC par taille (`-0.022em` sur titres `20px` jusqu'à `+0.012em` sur légendes `12px`, `font-optical-sizing: auto`) ; graisses `400 / 500 / 600` uniquement ; chiffres tabulaires (`tabular-nums`).
- Système d'interaction fluide `apple-design` (`emilkowalski/skills` — *WWDC Fluid Interfaces & Details of UI Typography*) : réponse immédiate sur `pointer-down` (`:active scale(0.965..0.99)`), rayons concentriques (`22px` feuilles, `18px` scène macOS Sonoma encadrée, `11px` pistes → `8px` segments), contrôles segmentés iOS, barre de rédaction capsule style *Apple Messages* avec bouton d'envoi circulaire `↑`, feuilles modales glissables `1:1` aux *Pointer Events* avec résistance *rubber-banding* (`c = 0.55`), projection inertielle `(v/1000)*d/(1-d)` et solveur ressort amorti interruptible (`animateSpring`), geste tactile de retour depuis le bord gauche sur discussion mobile avec hystérésis directionnelle, popovers ancrés à leur source (`transform-origin: top right`), piège de focus WCAG 2.2 et raccourcis clavier (`Alt+1..5`, `/`).
- Icônes SVG Lucide en ligne (`stroke-width="2"`), conformité WCAG 2.5.3 (*Label in Name*) et lien d'évitement clavier (`.skip-link`).
- Responsive vérifié par navigateur headless sur `320px`, `375px`, `390px`, `768px`, `1024px` et `1440px` (0 débordement horizontal, zones tactiles ≥ 44 px, `safe-area-inset-bottom`).

## 6. État vérifié des fonctionnalités

| Fonctionnalité | État |
|---|---|
| Chiffrement de bout en bout réel (Olm 1:1 + Megolm groupe) | **OK** |
| Chiffrement E2EE des fichiers (AES-256-GCM + clé transmise via Megolm + contrôle membre) | **OK** |
| 2FA TOTP RFC 6238 + `challengeToken` | **OK** |
| Enrôlement / invitation 128 bits / activation en 2 étapes | **OK** |
| Suspension / réactivation / révocation synchrone + rotation Megolm | **OK** |
| Annuaire hiérarchique Organisation → Direction → Service → Agents | **OK** |
| Conversations individuelles (`DIRECT` uniques) et groupes (`GROUP` administrables) | **OK** |
| Statuts envoyé / reçu / lu + vue « Infos du message » + déduplication `clientMsgId` | **OK** |
| Notifications internes persistées + opt-in navigateur local | **OK** |
| Instructions : brouillon, publication, consultation ≠ confirmation Ed25519, versions, exécution | **OK** |

## 7. Limites connues et honnêteté technique

1. **Remise hors bande des codes d'invitation** : aucun serveur SMTP externe n'est utilisé (conformité souveraineté). Le code d'activation à usage unique est affiché une seule fois à l'administrateur pour remise par voie administrative officielle.
2. **Absence de notifications push application fermée** : le Web Push en arrière-plan dépend de relais tiers des éditeurs de navigateurs (FCM / Mozilla Autopush / APNs), exclus par le règlement. Les notifications fonctionnent en temps réel tant que l'application est ouverte et sont persistées en base pour consultation dès la reconnexion.
3. **Historique antérieur sur un tout nouvel appareil** : comme dans Matrix/Element sans serveur de sauvegarde de clés, un nouvel appareil ne déchiffre les messages antérieurs à sa création que si un pair déjà membre partage la session Megolm (`m.forwarded_room_key` sur `MEGOLM_KEY_REQUESTED`).
4. **Sécurité physique du terminal** : la révocation bloque instantanément l'accès serveur, détruit les sessions et exclut l'agent des futures clés Megolm, mais ne peut pas effacer physiquement des captures locales déjà réalisées avant révocation sur un appareil compromis.
5. **Limitation de débit HTTP** : non activée par défaut pour ne pas gêner les rafales de tests automatisés ; recommandée en frontal reverse-proxy lors d'un déploiement ministériel.

## 8. Journal des vérifications et changements significatifs

- **28/10** — Audit initial : constat d'un chiffrement E2EE simulé par clé déterministe, code 2FA maître `123456`, téléchargement de fichier sans vérification de groupe et seed destructif.
- **29/10** — Refonte complète E2EE, backend métier, interface mobile-first et suites de tests :
  - Implémentation complète Olm (`Olm.Account`, `Olm.Session`) + Megolm (`OutboundGroupSession` / `InboundGroupSession`) + `AES-256-GCM` fichiers + vérification serveur `ed25519_verify` des accusés d'instruction.
  - Ajout du cycle d'invitation/activation, suspension/réactivation/révocation, annuaire hiérarchique, discussions `DIRECT`/`GROUP`, accusés `delivered`/`read` réels, notifications persistées et instructions versionnées.
  - Réécriture de l'interface institutionnelle sobre (`client/index.html`, `client/css/app.css`, `client/js/app.js`, `client/js/i18n.js`).
  - Exécution réelle de `npm test` sur base temporaire isolée : **5 / 5 tests d'intégration HTTP réussis** (`tests/integration.test.js`) et **14 / 14 tests de sécurité réussis** (`tests/run_all_security_tests.js`).
  - Audit navigateur headless Chromium sur `320px`, `375px`, `390px`, `768px`, `1024px`, `1440px` : **0 débordement horizontal, 0 emoji, 0 dégradé, 0 erreur console**.
- **29/10 (évolution UI/UX Design Skills)** — Application raisonnée de `web-design-guidelines`, `ios-design-guidelines`, `android-design-guidelines` et `ipados-design-guidelines` :
  - Surfaces *Inset Grouped* iOS HIG, navigation 3 paliers (barre mobile M3 à pilule active `< 768px`, rail compact tablette `768–1099px`, barre latérale étendue `≥ 1100px`), *Filter Chips* M3 à coche, FAB mobile en zone du pouce, bulles asymétriques groupées par expéditeur, *Bottom Sheets* à poignée, piège/restauration de focus WCAG 2.2 et raccourcis clavier (`Alt+1..5`, `/`).
  - Exclusion explicite des règles incompatibles avec la souveraineté FasoBrief (aucune police Google Fonts/CDN tiers, aucune couleur dynamique papier-peint remplacant le `#00705A`).
  - Re-vérification complète du périmètre de sécurité : audit statique **0 URL externe / 0 emoji / 0 dégradé**, `npm test` **5/5 intégration + 14/14 sécurité**, et audit headless **6 largeurs sans débordement + E2EE Olm/Megolm validé**.
- **29/10 (refonte intégrale `apple-design` — `emilkowalski/skills`)** :
  - Installation et application de `.agents/skills/apple-design/SKILL.md` sur l'ensemble de l'application (`client/css/app.css`, `client/index.html`, `client/js/app.js`) : surfaces Cupertino `#F5F5F7` / `#FFFFFF` + vert souverain `#00705A`, scène macOS Sonoma encadrée sur grand écran, contrôles segmentés iOS, capsule de rédaction style *Messages* (`↑`), tracking optique par taille, ressort physique interruptible (`animateSpring`), feuilles modales glissables `1:1` avec *rubber-banding* et projection d'inertie, recul spatial `#appShell`, et balayage bord gauche `1:1` sur mobile.
  - Validation complète de conformité et sécurité : audit statique **0 anomalie**, `npm test` **5/5 intégration + 14/14 sécurité**, audit headless Chromium **6 largeurs (`320px`–`1440px`) sans débordement horizontal et 0 erreur console**.
