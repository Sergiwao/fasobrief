# Pièce 3 : Note de Sécurité
## FASOBRIEF — Analyse des Menaces, Protections, Métadonnées et Limites
**Sprint Technique Pré-Hackathon 226 — Édition 2026 (MTDPCE / DGTD)**

---

### 1. Actifs Sensibles à Protéger
1. **Contenu des échanges et instructions :** Messages, objets et consignes détaillées des instructions administratives, comptes rendus d'exécution.
2. **Pièces jointes officielles :** Contenu binaire des documents, noms réels de fichiers et types MIME.
3. **Matériel cryptographique privé :** Clés privées d'identité Olm (`Curve25519`, `Ed25519`), clés de sessions `Olm.Session` et clés symétriques de groupe `Megolm` (conservées exclusivement côté client).
4. **Intégrité et imputabilité administrative :** Signatures numériques `Ed25519` des accusés de réception d'instructions et journal d'audit.
5. **Secrets d'authentification :** Mots de passe hachés (`bcrypt`), graines TOTP RFC 6238 et codes d'invitation à usage unique (hachés `SHA-256`).

---

### 2. Modèle de Menaces & Protections Implémentées

| Menace identifiée | Vecteur d'attaque | Protection implémentée et vérifiée dans FasoBrief | Vérification |
|---|---|---|---|
| **Serveur ou base SQL compromis** | Lecture directe du fichier SQLite par un attaquant | Chiffrement E2EE systématique Olm 1:1 + Megolm. Aucune clé privée ni clé de session en clair sur le serveur | Automatisé (`Test 05`, `Test 06`) |
| **Exfiltration des fichiers stockés** | Vol des blobs binaires ou accès direct par ID | Chiffrement client `AES-256-GCM` + `SHA-256` avant envoi (clé dans Megolm) + contrôle strict d'appartenance active au groupe sur `GET /api/files/:id` | Automatisé (`Test 07` + Intégration) |
| **Intrusion d'un tiers non enrôlé** | Tentative d'inscription ou de connexion externe | Aucune auto-inscription. Activation uniquement sur code 128 bits à usage unique généré par `ADMIN`. Rejet HTTP 403 et trace `INTRUSION_ATTEMPT` | Automatisé (`Test 01`) |
| **Compromission du mot de passe** | Phishing ou réutilisation de mot de passe | Second facteur TOTP RFC 6238 obligatoire couplé au 1er facteur par un `challengeToken` éphémère à usage unique (aucun code maître) | Automatisé (`Tests 02-04` + Intégration) |
| **Départ d'agent / Vol de terminal** | Maintien d'une session ouverte ou écoute passive | Révocation synchrone : invalidation `sessions`, fermeture WebSocket (`4001`), suppression des `user_devices`/OTKs, retrait des groupes et rotation Megolm (`key_epoch + 1`) | Automatisé (`Tests 10-13` + Intégration) |
| **Répudiation ou faux accusé** | Contestation de lecture ou confirmation non autorisée | Distinction stricte `viewed_at` vs `acknowledged_at` ; signature `Ed25519` Olm vérifiée côté serveur (`Olm.Utility.ed25519_verify`) pour les seuls destinataires | Automatisé (`Test 09` + Intégration) |

---

### 3. Architecture Cryptographique Retenue (Zéro Cryptographie Maison)
- **Échange de clés 1:1 (Olm Double Ratchet) :** Bibliothèque officielle `@matrix-org/olm` (v3.2.15, Apache-2.0). Chaque terminal publie ses clés publiques `Curve25519`, `Ed25519` et ses `One-Time Prekeys` à usage unique. Les clés de groupe transitent dans des enveloppes Olm chiffrées (`to_device_messages`), supprimées du serveur dès acquittement.
- **Chiffrement de conversation (Megolm) :** Chaque expéditeur chiffre ses messages et instructions via `Olm.OutboundGroupSession` et signe le ciphertext en `Ed25519`. Dès qu'un membre est retiré, suspendu ou révoqué, `key_epoch` est incrémenté et une nouvelle session Megolm est générée au message suivant.
- **Chiffrement des fichiers :** API standard W3C WebCrypto `AES-256-GCM` (clé aléatoire 256 bits et vecteur d'initialisation 96 bits uniques par fichier) + vérification d'intégrité `SHA-256` avant déchiffrement.

---

### 4. Métadonnées Visibles par le Serveur & Minimisation Appliquée
- **Ce que le serveur voit nécessairement :** Identifiants techniques des émetteurs et membres d'un canal, horodatages d'envoi et d'accusés (`delivered`/`read`), références administratives neutres (`INST-2026-XXXX`), échéances, priorités, compteurs de notifications et tailles des blobs chiffrés.
- **Mesures de minimisation effectives :**
  1. **Objet, consignes et comptes rendus d'instructions chiffrés :** Le serveur gère le workflow d'échéance sans connaître le sujet ni le texte de l'instruction.
  2. **Anonymisation totale des pièces jointes :** Les fichiers sont enregistrés sous `blob_<uuid>.enc` avec le type générique `application/octet-stream` ; le vrai nom et le type MIME restent chiffrés dans Megolm.
  3. **Notifications sans extrait confidentiel :** Les notifications persistées ne mentionnent que la référence administrative ou le nom du canal, jamais le contenu des messages.
  4. **Purge des enveloppes Olm :** Les enveloppes `to_device_messages` sont purgées après réception par le terminal destinataire.

---

### 5. Limites Connues & Risques Résiduels
1. **Compromission locale du terminal (Endpoint) :** Comme toute messagerie E2EE, si le téléphone ou le poste d'un agent est infecté par un logiciel malveillant, l'écran ou le stockage local (`localStorage`) peut être lu sur cet appareil. De même, la révocation empêche mathématiquement le déchiffrement de tout futur message mais ne détruit pas des copies déjà enregistrées localement avant révocation.
2. **Canaux hors bande sans services tiers :** En l'absence volontaire de SMTP externe et de relais Web Push tiers (FCM/APNs), les codes d'invitation sont transmis par voie administrative et les notifications temps réel opèrent lorsque l'application est ouverte (persistées sinon).
3. **Continuité d'historique multi-appareils :** Sans serveur de séquestre de clés, un nouveau terminal ne lit l'historique antérieur que lorsqu'un terminal pair actif lui transfère la session Megolm via Olm (`m.forwarded_room_key`).
