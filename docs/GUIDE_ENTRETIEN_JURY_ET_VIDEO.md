# 🇧🇫 FASOBRIEF — GUIDE D'ENTRETIEN TECHNIQUE DU JURY (15 MIN) & SCRIPT VIDÉO (3 MIN)
**Sprint Technique Pré-Hackathon 226 (Édition 2026) — MTDPCE / DGTD • Burkina Faso**  
*Document de préparation opérationnelle aux épreuves orales et éliminatoires du Jury*

---

## PARTIE 1 : CHECKLIST OPÉRATIONNELLE DES 5 ÉPREUVES EN DIRECT DU JURY

| Épreuve en direct du Jury | Action exacte à réaliser devant le Jury | Preuve technique immédiate à montrer |
| :--- | :--- | :--- |
| **1. « Le serveur ne lit rien »** *(Éliminatoire)* | 1. Envoyer un message confidentiel et une pièce jointe entre `issa` et `fatou`.<br>2. Cliquer sur le bouton **« Inspecteur BDD (Zéro-Clair) »** dans la barre latérale (ou exécuter `SELECT * FROM messages;` dans SQLite). | • `serverCanDecrypt: false`<br>• `privateKeysStoredOnServer: 0`<br>• Les colonnes ne contiennent que le ciphertext Megolm (`AQAB...`) et la signature Ed25519.<br>• Zéro texte, zéro titre, zéro nom de fichier en clair en base. |
| **2. « Épreuve Révocation »** *(Éliminatoire)* | 1. Ouvrir deux fenêtres côte à côte : Fenêtre A (`admin`) et Fenêtre B (`paul`).<br>2. Dans la Fenêtre A (Administration), cliquer sur **« Révoquer »** pour Paul Kaboré.<br>3. Valider la boîte de dialogue d'alerte. | • **Instantanément (< 1 s)**, la Fenêtre B voit son WebSocket coupé avec le code de fermeture strict `4001 (AGENT_REVOKED)`.<br>• La session locale de Paul est verrouillée.<br>• Le serveur purge ses pré-clés Olm.<br>• Les conversations incrémentent `key_epoch` et forcent la rotation de la session Megolm sortante : Paul est mathématiquement exclu des futurs déchiffrements. |
| **3. « Épreuve Intrus »** *(Éliminatoire)* | Sur l'écran de connexion (`Login`), cliquer sur le bouton rouge **« Simuler l'attaque d'un Intrus (403) »** (ou tenter de se connecter avec le matricule fictif `INTRUS-999`). | • Rejet immédiat avec le code HTTP **`403 Forbidden`** (`COMPTE_NON_ENROLE_OU_INCONNU`).<br>• Affichage de l'alerte de sécurité rouge.<br>• Inscription instantanée de l'événement critique `INTRUSION_ATTEMPT` dans le journal d'audit immuable (`audit_logs`). |
| **4. « Explication du code »** *(Oral technique)* | Présenter ligne par ligne les fonctions dans :<br>1. [`client/js/crypto-client.js`](../client/js/crypto-client.js) : `ensureOutboundGroupSession` & `encryptPayload`<br>2. [`server/auth.js`](../server/auth.js) : `authenticateFirstFactor` & `verifySecondFactor`<br>3. [`server/routes/instructions-routes.js`](../server/routes/instructions-routes.js) : `verifyEd25519AckSignature` | Maîtrise totale démontrée : Double Ratchet Olm 1:1, Megolm Group Ratchet, WebCrypto `AES-256-GCM`, TOTP RFC 6238 strict et signatures Ed25519 vérifiées côté serveur. |
| **5. « Questions sur les choix souverains »** | Répondre avec assurance aux questions d'architecture :<br>• Pourquoi Megolm Matrix plutôt que Signal pour les groupes ?<br>• Pourquoi la licence Apache-2.0 plutôt que la GPLv3 ?<br>• Comment sont protégées les métadonnées ? | Argumentaire imparable détaillé en **Partie 3**. |

---

## PARTIE 2 : SCRIPT MINUTÉ DE LA VIDÉO DE DÉMONSTRATION (3 MINUTES CHRONO)

> **Exigence réglementaire stricte** : Durée ≤ 3 minutes (180 secondes). Démonstration obligatoire : échange chiffré, révocation d'un agent, et fonctionnalité innovante principale.

### ⏱️ Chronométrage seconde par seconde :

#### [00:00 - 00:35] (35s) — Introduction Souveraine & Épreuve Intrus
- **Visuel** : Écran d'accueil de FasoBrief.
- **Narration** : *« Bonjour. Voici FasoBrief, la messagerie souveraine de l'administration publique burkinabè, développée pour le Sprint Technique Pré-Hackathon 226. FasoBrief est 100 % auto-hébergeable en une seule commande Docker Compose, sans aucun service tiers, sous licence libre OSI Apache-2.0. »*
- **Action** : 
  1. Basculer la langue en **Mooré** puis en **Dioula** via le sélecteur en haut pour montrer l'inclusion linguistique nationale (**Bonus +3 pts**).
  2. Cliquer sur le bouton **« Simuler l'attaque d'un Intrus (403) »** : montrer le rejet immédiat HTTP 403 et l'alerte d'intrusion (**Épreuve Intrus validée**).
  3. Se connecter avec le compte d'Awa Compaoré (`admin` / `demo2026`) avec validation du second facteur TOTP (RFC 6238).

#### [00:35 - 01:20] (45s) — Échanges Chiffrés E2EE (Megolm) & Preuve Serveur Aveugle
- **Visuel** : Deux fenêtres côte à côte : Fenêtre Gauche = `issa` (Directeur), Fenêtre Droite = `fatou` (Cheffe de service).
- **Narration** : *« Tous les échanges reposent sur le protocole éprouvé `@matrix-org/olm`. Les conversations de groupe utilisent le cliquet Megolm, garantissant un chiffrement en temps constant O(1), couplé à du AES-256-GCM pour les pièces jointes. »*
- **Action** :
  1. `issa` envoie un message confidentiel et téléverse un document PDF chiffré localement.
  2. `fatou` reçoit le message déchiffré en temps réel via WebSocket.
  3. Dans la Fenêtre Gauche, cliquer sur **« Inspecteur BDD (Zéro-Clair) »** : montrer au jury que la table SQLite `messages` ne contient que des blocs chiffrés illisibles et zéro clé privée (**Épreuve Serveur Aveugle validée**).

#### [01:20 - 02:15] (55s) — Innovation FasoBrief : Instructions Administratives & Signatures Ed25519
- **Visuel** : Vue Instructions administratives.
- **Narration** : *« L'innovation distinctive de FasoBrief est de transformer des échanges en instructions administratives formelles avec suivi juridique nominatif et versionnage. »*
- **Action** :
  1. `issa` clique sur **« + Nouvelle instruction »** : Objet : *"Audit de conformité DGTD"*, échéance fixée à 48h, sélection de `fatou`.
  2. Côté `fatou`, l'instruction apparaît. L'ouverture horodate une simple consultation (`viewed_at`), qui ne vaut **pas** acceptation juridique.
  3. `fatou` clique sur **« Accuser réception (Ed25519) »** : son terminal signe cryptographiquement l'accusé avec sa clé privée Ed25519, vérifiée mathématiquement par le serveur.
  4. L'instruction passe à l'état `CONFIRMÉE`, puis `fatou` clique sur `Démarrer` (`EN COURS`) et enfin `Déclarer exécutée` (`EXÉCUTÉE`).

#### [02:15 - 02:55] (40s) — Épreuve Éliminatoire : Révocation Immédiate en Direct
- **Visuel** : Fenêtre A = `admin`, Fenêtre B = `paul` (Agent).
- **Narration** : *« Testons maintenant la révocation immédiate en direct exigée par le règlement. »*
- **Action** :
  1. Dans la Fenêtre A, l'administrateur révoque l'accès de Paul Kaboré.
  2. En une fraction de seconde, la Fenêtre B subit une coupure WebSocket `4001 (AGENT_REVOKED)`, son trousseau local est invalidé et l'écran de verrouillage s'affiche.
  3. L'administrateur envoie un nouveau message dans le groupe : la session Megolm a tourné (`key_epoch + 1`), Paul est exclu et ne recevra plus jamais la clé de déchiffrement (**Épreuve Révocation validée**).

#### [02:55 - 03:00] (5s) — Conclusion & Tests Automatisés
- **Visuel** : Terminal montrant les **21 / 21 tests automatisés réussis** (`npm test`).
- **Narration** : *« FasoBrief : souveraineté nationale, sécurité mathématique E2EE et valeur probante pour l'État. Merci. »*

---

## PARTIE 3 : ARGUMENTAIRE TECHNIQUE ET RÉPONSES AUX QUESTIONS PIÈGES DU JURY

### Question 1 : « Pourquoi avoir choisi le protocole Megolm de Matrix plutôt que Signal pour les groupes ? »
- **Réponse à donner** :
  > *« Le protocole Signal est excellent en 1-à-1, mais sa bibliothèque open source officielle TypeScript (`libsignal`) n'inclut pas de composant de groupe (Sender Keys). Les projets utilisant Signal sont donc contraints de faire du chiffrement pair-à-pair en $O(N)$, c'est-à-dire rechiffrer individuellement chaque message pour chaque participant du groupe.*  
  > *FasoBrief a choisi le standard mondialement éprouvé pour l'administration publique : **Megolm** (`@matrix-org/olm`). C'est le protocole retenu par l'État français (Tchap) et l'armée allemande (BwMessagerie). Il permet de chiffrer en $O(1)$ avec un cliquet symétrique de groupe, tout en distribuant la clé de session via des sessions Olm 1:1 Double Ratchet Curve25519. C'est infiniment plus performant, scalable et adapté aux ministères burkinabè. »*

### Question 2 : « Quelle est votre licence et pourquoi est-elle supérieure à la GPLv3 ? »
- **Réponse à donner** :
  > *« FasoBrief est distribué sous licence **Apache-2.0**, reconnue par l'OSI. Contrairement à la GPL-3.0 qui est une licence contaminante à fort risque juridique pour les services de l'État (obligeant à rendre public tout code ministériel interconnecté), Apache-2.0 est une licence permissive qui permet à l'État burkinabè d'adapter, d'intégrer et de déployer FasoBrief dans ses datacenters sans contrainte juridique hostile. »*

### Question 3 : « Que voit exactement le serveur (métadonnées) ? »
- **Réponse à donner** :
  > *« Le serveur applique le principe de minimisation stricte :*  
  > *1. Le contenu des messages, les titres et descriptions des instructions, ainsi que le nom réel et le type MIME des fichiers sont **chiffrés de bout en bout** et illisibles par le serveur.*  
  > *2. Les clés de session Megolm sont transmises dans des enveloppes chiffrées Olm 1:1 et purgées du serveur dès leur accusé de réception (`/api/crypto/to-device/ack`).*  
  > *3. Le serveur n'observe que les identifiants techniques nécessaires au routage et le timestamp d'acheminement, consignés dans un journal d'audit immuable. »*

### Question 4 : « Comment garantissez-vous qu'aucun intrus ne peut s'auto-inscrire ? »
- **Réponse à donner** :
  > *« L'auto-inscription est totalement inexistante. Seul un administrateur authentifié peut enrôler un agent en générant un jeton cryptographique 128 bits à usage unique, valable 72h et haché en SHA-256 en base de données. Tout matricule non enrôlé est immédiatement refoulé par l'API avec un code HTTP 403 et journalisé sous l'événement `INTRUSION_ATTEMPT`. »*

---

## PARTIE 4 : FICHIERS CLÉS À MONTRER AU JURY LORS DE L'EXAMEN DU CODE

1. **Chiffrement Megolm & Envoi** : [`client/js/crypto-client.js`](../client/js/crypto-client.js#L366-L425) (`ensureOutboundGroupSession`) et lignes 530-560 (`encryptPayload`).
2. **Vérification serveur de l'accusé Ed25519** : [`server/routes/instructions-routes.js`](../server/routes/instructions-routes.js#L33-L53) (`verifyEd25519AckSignature`).
3. **Coupure WebSocket synchrone de révocation** : [`server/revocation.js`](../server/revocation.js#L30-L75) (`revokeAgent`).
4. **Vérification 2FA TOTP RFC 6238** : [`server/auth.js`](../server/auth.js#L140-L195) (`verifySecondFactor`).
5. **Preuve du banc d'essai automatisé (21 tests)** : [`tests/integration.test.js`](../tests/integration.test.js) & [`tests/run_all_security_tests.js`](../tests/run_all_security_tests.js).

