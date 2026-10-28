# Pièce 3 : Note de Sécurité
## FASOBRIEF — Analyse des Menaces, Protections et Limites
**Sprint Technique Pré-Hackathon 226 — Édition 2026 (MTDPCE / DGTD)**

---

### 1. Actifs Sensibles à Protéger
1. **Contenu des échanges officiels :** Ordres de service, instructions ministérielles, rapports d'activité, documents d'orientation administrative.
2. **Pièces jointes administratives :** Notes de cadrage, décrets préliminaires, fichiers numérisés.
3. **Clés privées cryptographiques :** Paires de clés d'identité Curve25519/Ed25519 et clés de sessions Megolm générées exclusivement sur les terminaux clients.
4. **Intégrité des instructions et des accusés de réception :** Non-répudiation de la prise de connaissance d'un ordre de service.
5. **Secrets d'authentification :** Mots de passe administratifs et graines TOTP à 128 bits.

---

### 2. Modèle de Menaces & Protections Implémentées

| Menace identifiée | Vecteur d'attaque | Protection mise en place dans FasoBrief | Statut de test |
|---|---|---|---|
| **Interception / Serveur compromis** | Un attaquant contrôle le serveur d'hébergement ou la base SQL | Chiffrement de bout en bout systématique (Olm/Megolm). Zéro texte en clair sur le serveur | **Testé et Validé** (Test 6) |
| **Vol de pièces jointes** | Exfiltration directe du dossier d'upload sur le serveur | Chiffrement symétrique client AES-256-GCM avant téléversement. Stockage sous forme de BLOB binaire opaque | **Testé et Validé** (Test 7) |
| **Intrusion par compte non enrôlé** | Un utilisateur externe tente de rejoindre le service | Inscription publique fermée. Enrôlement strict préalable requis. Rejet HTTP 403 immédiat et alerte | **Testé et Validé** (Test 1) |
| **Vol d'identifiants (Phishing / Rejeu)** | Vol du mot de passe d'un agent public | Second facteur obligatoire TOTP (RFC 6238) avec tolérance temporelle stricte (fenêtre de 30s) | **Testé et Validé** (Tests 2, 3, 4) |
| **Agent corrompu / Perte de terminal** | L'agent quitte son poste ou perd son terminal de fonction | Révocation immédiate en direct : destruction des sessions, coupure WebSocket et rotation de clé Megolm | **Testé et Validé** (Tests 10-13) |
| **Usurpation d'accusé de lecture** | Contestation de la réception d'un ordre administratif | Signature cryptographique locale (Ed25519) horodatée de l'accusé de prise de connaissance | **Testé et Validé** (Test 9) |

---

### 3. Protocoles & Composants Cryptographiques Retenus
* **Chiffrement de groupe (Megolm) :** Ratchet cryptographique dérivé de la bibliothèque officielle `@matrix-org/olm` (licence Apache 2.0). Chaque message bénéficie du secret parfait vers l'avant (Forward Secrecy).
* **Chiffrement point-à-point (Olm) :** Échange de clés basé sur l'algorithme Triple Diffie-Hellman (3DH) et le Double Ratchet sur courbe Curve25519.
* **Chiffrement des fichiers :** `AES-256-GCM` via la WebCrypto API native du navigateur (IV 96 bits unique par fichier, tag d'intégrité MAC 128 bits).
* **Hachage et Salage des identifiants :** Algorithme `bcrypt` (10 rounds de salage cryptographique).

---

### 4. Métadonnées Visibles par le Serveur & Mesures de Minimisation

Bien que le contenu des messages et des fichiers soit 100% inaccessible au serveur, certaines métadonnées de transport demeurent intrinsèquement observables par le relais réseau :

* **Métadonnées observables par le serveur :**
  1. Identifiants des agents émetteurs et destinataires (matricules/ID internes).
  2. Horodatage de réception du paquet réseau chiffré.
  3. Taille approximative des ciphertexts et des fichiers chiffrés.
  4. Appartenance des agents aux groupes administratifs de service.
* **Mesures de minimisation implémentées :**
  1. **Titre d'instruction chiffré :** Même pour le suivi administratif, le titre de l'instruction est transmis chiffré (seule la référence neutre `INST-2026-XXXX` est lisible par le routeur).
  2. **Nom de fichier anonymisé :** Le nom réel du fichier est chiffré dans le message E2EE ; le fichier est stocké sous un UUID neutre (`e2ee_xxxxxxxx.enc`).
  3. **Absence de profils publics :** Pas d'avatar personnel ou de statut en ligne diffusé publiquement.

---

### 5. Procédure et Résultats des Tests de Sécurité

La conformité a été vérifiée au moyen d'une suite automatisée de 14 tests (`npm test`) :
* **Preuve d'inspection SQL :** Requête directe sur la table `messages` prouvant l'absence de toute chaîne en clair : `100% de ciphertexts valides`.
* **Preuve de révocation en direct :** Coupure synchrone de socket, invalidation de session vérifiée sur `sessions` et refus de toute ré-authentification (`AGENT_REVOQUE_ACCES_INTERDIT`).
* **Preuve d'éviction d'intrus :** Tentative avec matricule `INTRUS-999` rejetée et tracée dans `audit_logs`.

---

### 6. Limites Connues & Risques Résiduels
1. **Sécurité du terminal hôte (End-Point Security) :** Si le terminal d'un agent est compromis par un logiciel espion (capture d'écran, keylogger), le contenu déchiffré in-memory peut être exposé localement.
2. **Archivage légal d'État :** En l'absence de mécanisme de mise sous séquestre d'une clé d'autorité d'État, la perte de tous les terminaux membres d'un groupe rendrait l'historique irrécupérable.
