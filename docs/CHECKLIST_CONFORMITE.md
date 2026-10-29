# Checklist de Conformité Réglementaire — FasoBrief
## Sprint Technique Pré-Hackathon 226 (Édition 2026 — MTDPCE / DGTD)

**Date de vérification :** 29 octobre 2026  
**Sources vérifiées :** `Sprint_Technique_Pre-Hackathon_2026-KFD.pdf`, `FasoBrief_Prompt_AntiGravity.md`, `AGENTS.md`  
**Résultat des suites automatisées (`npm test`) :** 5 / 5 tests d'intégration + 14 / 14 tests de sécurité réussis sur base isolée.

---

| N° | Exigence du règlement | Implémentation réelle dans FasoBrief | Fichiers principaux | Preuve vérifiée | État |
|---|---|---|---|---|---|
| **01** | Équipe de 2 à 3 étudiants burkinabè | Modèle de fiche d'identification prêt à compléter | `docs/FICHE_EQUIPE.md` | Contrôle documentaire | Prêt à renseigner |
| **02** | Licence Open Source reconnue OSI | Licence Apache-2.0 à la racine du dépôt | `LICENSE` | Fichier présent | **Validé** |
| **03** | Traçabilité des composants open source | Tableau complet versions + licences OSI | `README.md`, `docs/NOTE_PRE_PROJET.md` | Vérifié avec `package.json` | **Validé** |
| **04** | Aucun service tiers indispensable | Zéro API cloud, zéro SMTP externe, zéro FCM/APNs, zéro CDN | `server/`, `client/`, `docker-compose.yml` | Exécution locale autonome | **Validé** |
| **05** | Déclaration d'engagement Open Source | Niveau « Créer » sur bibliothèque éprouvée `@matrix-org/olm` | `README.md`, `docs/NOTE_PRE_PROJET.md` | Documenté | **Validé** |
| **06** | Chiffrement E2EE messages ET fichiers | Olm 1:1 Double Ratchet + Megolm + fichiers `AES-256-GCM` | `client/js/crypto-client.js`, `server/routes/crypto-routes.js` | Tests 05 & 07 + E2E navigateur | **Validé** |
| **07** | Zéro cryptographie maison | `@matrix-org/olm` (Apache-2.0) + WebCrypto W3C uniquement | `client/js/crypto-client.js` | Revue statique & tests | **Validé** |
| **08** | Zéro texte ni fichier en clair sur serveur | Ciphertexts Megolm et blobs opaques sans nom ni MIME réel | `server/database.js`, `server/routes/conversations-routes.js` | Test 06 + `/api/admin/server-inspection` | **Validé** |
| **09** | Déploiement en une seule commande | `docker compose up --build` + healthcheck `/api/health` | `Dockerfile`, `docker-compose.yml` | Configuration vérifiée | **Validé** |
| **10** | Agents préalablement enrôlés uniquement | Invitation 128 bits par `ADMIN`, rejet HTTP 403 des intrus | `server/auth.js`, `server/routes/admin-routes.js` | Test 01 + Intégration #2 | **Validé** |
| **11** | Authentification forte 2FA obligatoire | TOTP RFC 6238 strict lié au 1er facteur par `challengeToken` | `server/auth.js`, `server/routes/auth-routes.js` | Tests 02-04 + Intégration #1 | **Validé** |
| **12** | Rôles et permissions côté serveur | `ADMIN`, `DIRECTEUR`, `CHEF_SERVICE`, `AGENT` + contrôle membre | `server/auth.js`, `server/routes/*.js` | Tests d'intégration RBAC | **Validé** |
| **13** | Révocation immédiate multi-appareils | Coupure WS `4001`, purge clés Olm, retrait groupes, rotation Megolm | `server/revocation.js` | Tests 10-13 + Intégration #5 | **Validé** |
| **14** | Minimisation et doc. des métadonnées | Titres d'instructions et noms de fichiers chiffrés ; purge enveloppes Olm | `docs/NOTE_SECURITE.md` | Vérifié en base SQLite | **Validé** |
| **15** | Données strictement fictives | 5 profils fictifs et 2 organisations de démonstration | `server/seed.js` | Inspection du seed | **Validé** |
| **16** | Interdiction de tests sur systèmes réels | Tests exécutés exclusivement sur base SQLite temporaire locale | `tests/integration.test.js`, `tests/run_all_security_tests.js` | Isolation `os.tmpdir()` | **Validé** |
| **17** | Innovation : Instructions structurées | Brouillon, publication, `viewed` ≠ `ack` signé Ed25519, versions, exécution | `server/routes/instructions-routes.js`, `client/js/app.js` | Tests 08-09 + Intégration #4 | **Validé** |
| **18** | UX Mobile-First sobre & responsive | Charte blanc/`#00705A`, zéro emoji/dégradé, `320px`–`1440px` sans débordement | `client/css/app.css`, `client/index.html` | Audit Chromium headless 6 tailles | **Validé** |
| **19** | Bonus Langues nationales (+3 pts) | Français, Mooré et Dioula disponibles hors ligne | `client/js/i18n.js` | Bascule UI vérifiée | **Validé** |
| **20** | Bonus Tests automatisés (+2 pts) | 19 tests automatisés reproductibles via `npm test` | `tests/` | `npm test` (code retour 0) | **Validé** |
