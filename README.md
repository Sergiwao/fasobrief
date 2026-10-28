# FASOBRIEF — Messagerie Souveraine de l'Administration Publique

> **Sprint Technique Pré-Hackathon 226 — Édition 2026**  
> *Ministère de la Transition Digitale, des Postes et des Communications Électroniques (MTDPCE) — DGTD, Burkina Faso*  
> **Challenge :** La messagerie souveraine de l'administration  
> **Licence :** Apache 2.0 (Open Source Initiative)

---

## 1. Concept & Utilité Administrative

Les agents de l'État burkinabè échangent quotidiennement des informations officielles sur des messageries grand public étrangères dont les serveurs échappent au contrôle souverain du pays. 

**FasoBrief** est une messagerie instantanée souveraine, auto-hébergeable sur l'infrastructure de l'État burkinabè, garantissant un **chiffrement de bout en bout (E2EE)** strict pour tous les messages et fichiers, sans aucun service tiers ni API externe.

### L'Innovation FasoBrief : Suivi des Instructions Administratives
Au-delà de la messagerie chiffrée, FasoBrief intègre nativement un mécanisme d'**instructions administratives structurées** :
1. Un supérieur hiérarchique (Directeur, Chef de service) peut marquer un message comme une **instruction officielle** avec objet, référence (`INST-2026-XXXX`) et échéance.
2. Les agents destinataires reçoivent l'instruction et émettent un **accusé de prise de connaissance signé numériquement**.
3. Un **tableau de bord de suivi hiérarchique** permet à l'autorité d'observer en temps réel le taux de prise en compte nominatif de ses ordres de service.

---

## 2. Architecture & Sécurité Éprouvée

### 2.1 Socle Cryptographique E2EE
* **Bibliothèque de référence :** `@matrix-org/olm` (version 3.2.15, licence Apache 2.0, auditée par NCC Group), implémentant les protocoles standards **Olm** (Double Ratchet) et **Megolm** (Ratchet de groupe).
* **Chiffrement symétrique des fichiers :** WebCrypto API (`AES-256-GCM` 96-bit IV, 128-bit MAC tag). Les fichiers sont chiffrés sur le poste client avant téléversement.
* **Règle absolue « Zéro fuite serveur » :** La base de données et le stockage serveur ne reçoivent, ne traitent et ne stockent **aucun texte ni fichier en clair**. Seuls des ciphertexts opaques sont relayés.

### 2.2 Contrôle d'Accès & Authentification Forte
* **Enrôlement préalable strict :** Aucune inscription publique anonyme. Seuls les agents pré-enregistrés par l'administration peuvent se connecter.
* **Authentification forte (2FA) :** Second facteur obligatoire par mot de passe temporaire basé sur le temps **TOTP standard (RFC 6238)**, compatible FreeOTP / Google Authenticator.
* **Gestion des Rôles (RBAC) :** `ADMIN` (Sécurité), `DIRECTEUR` (Gouvernance), `CHEF_SERVICE` (Coordination), `AGENT` (Exécution).
* **Révocation immédiate en direct :** Un agent révoqué voit l'ensemble de ses sessions invalidées, sa connexion WebSocket coupée instantanément et est exclu des groupes avec rotation immédiate des clés de chiffrement (re-keying Megolm).

---

## 3. Technologies Utilisées & Licences Open Source

| Composant | Technologie | Version | Licence | Rôle dans FasoBrief |
|---|---|---|---|---|
| Cœur E2EE | `@matrix-org/olm` | 3.2.15 | Apache 2.0 | Protocole Double Ratchet Olm / Megolm |
| Moteur Base de Données | `node:sqlite` (Node.js) | v24 native | MIT / Public Domain | Stockage SQLite souverain sans compilation C++ |
| Authentification 2FA | `otplib` | 13.5.0 | MIT | Vérification TOTP standard RFC 6238 |
| Hachage Mots de Passe | `bcryptjs` | 3.0.3 | MIT | Hachage sécurisé salé des mots de passe |
| Serveur Temps Réel | `ws` & `express` | 8.22 / 5.3 | MIT | Relais WebSocket temps réel et API HTTP |
| Client Web | Vanilla JS & WebCrypto | Standard W3C | Apache 2.0 | Chiffrement client-side et interface responsive |

**Déclaration d'engagement Open Source (Art. 2 du règlement) :**  
Notre équipe déclare son niveau d'engagement sous la catégorie : **« Créer (une application nouvelle reposant sur une bibliothèque éprouvée) »**, en s'appuyant sur l'implémentation de référence `@matrix-org/olm` de la Matrix.org Foundation.

---

## 4. Déploiement Souverain en Une Seule Commande

FasoBrief s'installe sur toute infrastructure souveraine (serveur d'État, VM Linux locale) sans aucun service cloud externe :

```bash
# Déploiement autonome complet via Docker Compose
docker compose up --build -d
```

L'application est immédiatement accessible sur `http://localhost:3000` (ou sur l'IP du serveur).

Pour un lancement en environnement de développement Node.js :
```bash
npm install
npm run seed     # Initialise la base SQLite avec les comptes fictifs
npm start        # Démarre le serveur souverain sur le port 3000
npm test         # Exécute la suite complète des 14 tests de sécurité automatisés
```

---

## 5. Comptes Fictifs de Démonstration (Pour le Jury)

Conformément au règlement, **toutes les données et identités sont 100% fictives** :

| Nom Fictif | Matricule | Rôle | Mot de passe | Secret TOTP Démo |
|---|---|---|---|---|
| Dr. Salif Ouédraogo | `FASO-DIR-01` | DIRECTEUR | `FasoSecurite2026!` | `FASOBRIEFBURKINAFASODGTD234567AB` |
| Aminata Sawadogo | `FASO-CHF-02` | CHEF_SERVICE | `FasoSecurite2026!` | `FASOBRIEFBURKINAFASODGTD234567AB` |
| Ibrahim Kaboré | `FASO-AGT-03` | AGENT | `FasoSecurite2026!` | `FASOBRIEFBURKINAFASODGTD234567AB` |
| Ousmane Traoré | `FASO-ADM-00` | ADMIN | `FasoSecurite2026!` | `FASOBRIEFBURKINAFASODGTD234567AB` |

> **Astuce Démo :** Lors de la saisie 2FA, cliquez sur le bouton **« Générer Code Démo »** (ou entrez `123456`) pour valider instantanément la session.

---

## 6. Vérification des Épreuves du Jury

1. **Épreuve « Le serveur ne lit rien » :** Cliquez sur *Inspecter Base SQL* dans l'onglet Sécurité ou exécutez `npm test` : le serveur ne stocke que des ciphertexts opaques.
2. **Épreuve « Révocation » :** Cliquez sur *Révoquer Immédiatement* sur un agent dans la console d'administration : son WebSocket est coupé instantanément, ses sessions sont détruites et les clés du groupe sont renouvelées.
3. **Épreuve « Intrus » :** Cliquez sur *Lancer Test d'Intrus* : tentative rejetée avec code 403 et journalisée dans l'audit.
4. **Bonus Langue Nationale (+3 pts) :** Sélecteur en haut à droite avec bascule instantanée en **Mooré** ou **Dioula**.

---

## 7. Limites Connues
* L'archivage légal E2EE requiert une clé d'escrow institutionnelle sur coffre-fort d'État pour déchiffrer a posteriori les instructions de service.
* Les métadonnées de transport (IP source, volume échangé, horodatage) restent visibles au niveau réseau mais sont minimisées par l'architecture.
