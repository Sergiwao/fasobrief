# Guide Opérationnel de Reproduction des Tests de Sécurité
## FASOBRIEF — Protocole de Vérification pour le Jury d'Entretien
**Sprint Technique Pré-Hackathon 226 — Édition 2026**

Ce guide permet aux membres du jury de vérifier l'intégralité des exigences éliminatoires et fonctionnelles de FasoBrief, en ligne de commande puis directement dans l'interface.

---

## 1. Exécution Automatisée sur Base Isolée (1 commande)

Depuis la racine du dépôt :
```bash
npm test
```
Cette commande exécute successivement sur une base SQLite temporaire isolée (`DATABASE_PATH` dans le dossier temporaire système, sans altérer `data/`) :
1. **`tests/integration.test.js` (5 scénarios d'intégration HTTP & WebSocket)** : blocage du contournement 2FA, cycle complet invitation 128 bits → activation TOTP en 2 étapes → connexion, conversations `DIRECT`/`GROUP` + Olm/Megolm + statuts réels (`sent`/`delivered`/`read`) + fichiers chiffrés `AES-256-GCM`, cycle complet des instructions versionnées (`Consultée` ≠ `Confirmée Ed25519` ≠ `Exécutée`), suspension/réactivation et révocation WebSocket synchrone.
2. **`tests/run_all_security_tests.js` (14 épreuves de sécurité réglementaires)** : rejet intrus HTTP 403, rejet codes TOTP erronés, échange Olm Double Ratchet + Megolm, inspection SQL directe confirmant zéro texte ni clé en clair, contrôle strict des pièces jointes, vérification mathématique `ed25519_verify`, révocation et rotation effective de session Megolm.

---

## 2. Reproduction Interactive en Direct dans le Navigateur

Pour faciliter l'évaluation par le jury sur un poste unique, lancez le serveur avec le mode démonstration explicite :
```bash
npm run reset-demo
npm run start:demo
# Ouvrir http://localhost:3000
```
*(En mode production standard via `npm start`, le panneau d'accès rapide démo et le générateur TOTP sont totalement désactivés.)*

### Épreuve A : « Le serveur ne lit rien » (Inspection SQLite en direct)
1. Sur l'écran d'accueil, cliquez sur **Dr. Salif Ouédraogo (`FASO-DIR-01`)**, puis validez le 2e facteur TOTP.
2. Dans la conversation **Coordination Générale MTDPCE**, envoyez un message texte et joignez un fichier quelconque.
3. Ouvrez l'onglet **Administration** → sous-onglet **Vérification serveur (Jury)** → cliquez sur **Inspecter SQLite**.
4. **Constat :** `privateKeysStoredOnServer: 0`, `serverCanDecrypt: false`. Les tables `messages` et `encrypted_files` ne contiennent que des ciphertexts Megolm signés Ed25519 et des blobs opaques `AES-256-GCM` sans nom ni type MIME réel.

### Épreuve B : « Révocation immédiate d'un agent »
1. Ouvrez une fenêtre de navigation privée sur `http://localhost:3000` et connectez-vous en tant qu'**Ibrahim Kaboré (`FASO-AGT-03`, AGENT)**.
2. Dans la première fenêtre (`Dr. Salif Ouédraogo`, `DIRECTEUR`), ouvrez **Administration** → **Comptes et révocation** → cliquez sur **Révoquer** en face d'Ibrahim Kaboré et saisissez le motif officiel.
3. **Constat immédiat :**
   - Dans la fenêtre d'Ibrahim Kaboré, le WebSocket est coupé instantanément (code `4001`), l'interface est verrouillée et la bannière d'alerte s'affiche.
   - Toute tentative de reconnexion de `FASO-AGT-03` est rejetée HTTP 403 (`COMPTE_REVOQUE_ACCES_INTERDIT`).
   - L'époque de clé Megolm du groupe est incrémentée (`key_epoch + 1`), excluant mathématiquement le compte révoqué des nouveaux échanges.

### Épreuve C : « Tentative d'accès d'un intrus non enrôlé »
1. Dans **Administration** → **Vérification serveur (Jury)**, cliquez sur **Exécuter le test 403** (ou tentez une connexion sur l'écran d'accueil avec un matricule inconnu).
2. **Constat :** Rejet HTTP 403 immédiat et enregistrement horodaté `INTRUSION_ATTEMPT` visible dans le sous-onglet **Journal d'audit**.

### Épreuve D : « Cycle complet d'une Instruction Administrative FasoBrief »
1. Connecté en tant que `FASO-DIR-01`, cliquez sur **Instruction** dans la conversation active, saisissez l'objet et les consignes puis publiez.
2. Basculez vers **Aminata Sawadogo (`FASO-CHF-02`)** via le menu profil :
   - Une alerte interne apparaît dans **Alertes**.
   - Ouvrez la fiche de l'instruction : le statut passe à **Consultée (à confirmer)** (`viewed_at` enregistré sans valoir confirmation).
   - Cliquez sur **Confirmer la réception (Signature Ed25519)**, puis sur **Déclarer exécutée** avec un compte rendu chiffré.
3. Revenez sur `FASO-DIR-01` : le suivi nominatif affiche les horodatages exacts, la mention **Ed25519 vérifiée** et le compte rendu déchiffré. Si l'émetteur clique sur **Modifier (Nouvelle version)**, l'instruction passe en `v2` tout en conservant les preuves `v1` dans l'historique.
