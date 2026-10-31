# FASOBRIEF — Messagerie Souveraine de l'Administration Publique

> **Sprint Technique Pré-Hackathon 226 — Édition 2026**  
> *Ministère de la Transition Digitale, des Postes et des Communications Électroniques (MTDPCE) — DGTD, Burkina Faso*  
> **Challenge :** La messagerie souveraine de l'administration  
> **Licence :** Apache-2.0 (Open Source Initiative)

---

## 1. Concept & Utilité Administrative

Les agents publics échangent quotidiennement des informations de service sur des messageries grand public étrangères dont l'infrastructure échappe au contrôle souverain de l'État.

**FasoBrief** est une messagerie mobile-first auto-hébergeable sur l'infrastructure de l'État burkinabè, garantissant un **chiffrement de bout en bout (E2EE) authentique** pour tous les messages et fichiers, sans aucun service tiers indispensable (ni API externe, ni SMTP tiers, ni Web Push cloud, ni police distante).

### L'Innovation FasoBrief : Instructions Administratives Structurées et Versionnées
Au-delà des discussions individuelles (`DIRECT`) et de groupes (`GROUP`), FasoBrief intègre le cycle complet des **instructions administratives** :
1. Une autorité habilitée (`DIRECTEUR`, `CHEF_SERVICE`, `ADMIN`) rédige ou convertit un message en **instruction officielle** dotée d'une référence (`INST-2026-XXXX`), d'une priorité, d'une échéance et de destinataires nominatifs (objet et consignes chiffrés via Megolm).
2. FasoBrief distingue strictement la simple **consultation** (`viewed_at`), la **confirmation formelle de réception signée Ed25519** (vérifiée cryptographiquement côté serveur) et la **déclaration d'exécution**.
3. Toute modification d'une instruction publiée génère une **nouvelle version** (`v2`, `v3`...), conserve l'historique immuable des preuves antérieures et redemande confirmation aux destinataires.

---

## 2. Architecture & Sécurité Éprouvée

- **Chiffrement E2EE Olm / Megolm (`@matrix-org/olm` v3.2.15, Apache-2.0) :** Chaque terminal génère localement un compte `Olm.Account` (`Curve25519` + `Ed25519` + `One-Time Prekeys`). Les clés de session de groupe **Megolm** sont distribuées appareil par appareil via des sessions 1:1 **Olm Double Ratchet**.
- **Chiffrement des pièces jointes (`AES-256-GCM` WebCrypto) :** Les fichiers sont chiffrés sur le terminal client avant envoi ; la clé symétrique 256 bits, l'IV 96 bits, le condensat `SHA-256` et le nom réel transitent exclusivement dans le message Megolm.
- **Enrôlement préalable & 2FA TOTP (RFC 6238) :** Inscription publique fermée. L'administrateur génère un code d'activation à usage unique (128 bits, haché SHA-256, valable 72 h). Connexion en deux étapes obligatoires (mot de passe `bcrypt` + code TOTP temporaire lié par `challengeToken`).
- **Révocation immédiate en direct :** Coupe instantanément les WebSockets (`4001`), invalide les sessions, purge les clés publiques Olm de l'agent révoqué, incrémente l'époque du groupe et force la rotation immédiate des clés Megolm pour les membres restants.

| Composant | Technologie | Version | Licence | Rôle dans FasoBrief |
|---|---|---|---|---|
| Cœur cryptographique E2EE | `@matrix-org/olm` | 3.2.15 | Apache-2.0 | Olm Double Ratchet, Megolm & Ed25519 |
| Chiffrement binaire fichiers | WebCrypto API | W3C | Standard | AES-256-GCM & SHA-256 côté client |
| Base de données souveraine | `node:sqlite` | Node 24 | MIT | Persistance SQLite sans service externe |
| Authentification 2FA | `otplib` | 13.4.0 | MIT | Validation TOTP RFC 6238 |
| Hachage mots de passe | `bcryptjs` | 3.0.3 | MIT | Hachage salé des mots de passe |
| Serveur HTTP & Temps réel | `express` & `ws` | 5.2 / 8.20 | MIT | API REST, contrôle RBAC & WebSocket `/ws` |

**Déclaration d'engagement Open Source :** Catégorie **« Créer (une application nouvelle reposant sur une bibliothèque éprouvée) »** basée sur `@matrix-org/olm` (Matrix.org Foundation).

---

## 3. Déploiement en Une Commande & Exécution Locale

```bash
# Déploiement souverain conteneurisé en une seule commande
docker compose up --build -d
```
Application disponible sur `http://localhost:3000` (sonde de santé : `GET /api/health`).

En environnement Node.js 24+ :
```bash
npm install
npm start            # Mode standard souverain (2FA TOTP strict)
npm run start:demo   # Mode démonstration jury (accès rapide + assistant TOTP activé)
npm run reset-demo   # Réinitialise proprement la base fictive (après un test de révocation)
npm test             # Exécute les 19 tests automatisés sur une base SQLite temporaire isolée
```

---

## 4. Comptes Fictifs de Démonstration (100 % Fictifs)

Mot de passe commun de démonstration : `demo2026`

| Nom fictif | Identifiant | Matricule | Rôle | Service | Secret TOTP Base32 (RFC 6238) |
|---|---|---|---|---|---|
| Awa Compaoré | `admin` | `FASO-ADM-00` | `ADMIN` | Administration | `JBSWY3DPEHPK3PXP234567ABCDEFGHJK` |
| Issa Ouédraogo | `issa` | `FASO-DIR-01` | `DIRECTEUR` | Cabinet | `FASOBRIEFBURKINAFASODGTD234567AB` |
| Fatou Zongo | `fatou` | `FASO-CHF-02` | `CHEF_SERVICE` | Direction des études | `MZXW6YTBOI5HS2LTMFZW6YTSNRSGK3LP` |
| Paul Kaboré | `paul` | `FASO-AGT-03` | `AGENT` | Cabinet | `KRSXG5CTMVRXEZLUKN2XAZLSNF2GS33O` |
| Mariam Sawadogo | `mariam` | `FASO-AGT-04` | `AGENT` | Direction des études | `NBSWY3DPFQQFO33SNRSCC43VNZ2G643F` |

> En lançant `npm run start:demo` (`FASOBRIEF_DEMO_MODE=1`), l'écran de connexion affiche l'aide TOTP dynamique de démonstration réservée à l'évaluation du jury. En mode normal (`npm start`), aucun générateur TOTP ni code statique n'est accessible.

---

## 5. Limites Connues & Honnêteté Technique
- **Remise des invitations hors bande :** Sans serveur SMTP tiers, le code d'activation à usage unique est remis à l'agent par canal administratif officiel.
- **Notifications hors application fermée :** Le Web Push en arrière-plan nécessitant des relais tiers (FCM/APNs), les notifications sont délivrées en temps réel via WebSocket application ouverte et persistées en base à la reconnexion.
- **Sécurité physique du terminal :** La révocation bloque immédiatement l'accès serveur et les clés futures, sans pouvoir effacer à distance d'éventuelles captures déjà effectuées sur un appareil physiquement compromis.
