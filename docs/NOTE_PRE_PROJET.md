# Pièce 2 : Note de Pré-Projet
## FASOBRIEF — La Messagerie Souveraine de l'Administration Publique
**Sprint Technique Pré-Hackathon 226 — Édition 2026 (MTDPCE / DGTD)**

---

### 1. Contexte & Problématique Cible
Au sein des ministères, directions générales et services techniques du Burkina Faso, la coordination quotidienne repose encore largement sur des applications de messagerie grand public hébergées à l'étranger. Cet usage expose l'administration à trois risques directs :
1. **Perte de souveraineté numérique :** Hébergement des métadonnées et dépendance envers des opérateurs cloud soumis à des juridictions extra-nationales.
2. **Dilution du suivi hiérarchique :** Dans un fil de discussion classique, les ordres de service urgents se perdent parmi les échanges courants, sans distinction entre simple lecture, confirmation formelle et exécution effective.
3. **Absence de maîtrise du cycle de vie des agents :** Impossibilité de révoquer instantanément un agent muté ou dont le téléphone de service est égaré.

---

### 2. Proposition de Valeur & Innovation Métier FasoBrief
**FasoBrief** combine une messagerie mobile-first chiffrée de bout en bout (discussions individuelles `DIRECT` et groupes de service `GROUP`, annuaire hiérarchique par organisation/direction/service) avec une brique métier dédiée à l'État : **les instructions administratives structurées, chiffrées et versionnées**.

#### Fonctionnement réel d'une instruction FasoBrief :
1. **Création ou transformation :** Un `DIRECTEUR`, un `CHEF_SERVICE` ou un `ADMIN` crée une instruction (en brouillon ou publiée immédiatement) ou convertit un message existant en instruction dotée d'une référence unique (`INST-2026-XXXX`), d'une priorité et d'une échéance. L'objet et les consignes sont chiffrés de bout en bout via **Megolm**.
2. **Suivi granulaire par destinataire :** Le système distingue l'ouverture de la fiche (`Consultée`), la confirmation formelle signée cryptographiquement en **Ed25519** (`Réception confirmée`), la mise en traitement (`En cours`) et le compte rendu final (`Exécutée`), avec détection automatique des retards.
3. **Gestion de versions sans perte de preuve :** Si l'émetteur modifie une instruction déjà publiée, FasoBrief crée une version `v2` (puis `v3`...), conserve les confirmations antérieures dans le journal d'événements et exige une nouvelle confirmation des destinataires.

---

### 3. Architecture Technique & Flux Cryptographique

```
[ Terminal Agent Émetteur ]                [ Serveur Souverain FasoBrief ]               [ Terminal Agent Destinataire ]
             |                                            |                                             |
 1. Session Olm 1:1 (PreKey Curve25519)                   |                                             |
    -> Chiffre la clé de session Megolm ----------------->|--- Boîte aux lettres opaque --------------->| 2. Déchiffre clé Megolm
             |                                            |    (to_device_messages, zéro clair)         |
 3. Chiffre message/instruction (Megolm)                  |                                             |
    + Chiffre fichier (AES-256-GCM) --------------------->|--- Relais WebSocket + SQLite -------------->| 4. Déchiffre localement
             |                                            |                                             | 5. Signe accusé Ed25519
             |<-- Notification temps réel ----------------|<-- Vérifie signature publique Ed25519 ------|
```

- **Serveur aveugle auto-hébergé :** Déployable en une commande (`docker compose up --build`), sans aucune dépendance externe (zéro API tierce, zéro SMTP externe, zéro CDN).
- **Interface institutionnelle mobile-first :** Charte sobre (blanc `#FFFFFF`, vert institutionnel `#00705A`, police système, icônes SVG en ligne, zéro emoji), adaptée aux écrans mobiles dès `320px` et traduite en **Français**, **Mooré** et **Dioula**.

---

### 4. Briques Open Source & Licences Reconnues par l'OSI
Conformément à l'article 2 du règlement, FasoBrief n'utilise aucune cryptographie maison et repose sur des composants open source audités :
- **`@matrix-org/olm` (v3.2.15 — Licence Apache-2.0) :** Implémentation officielle C/WebAssembly des protocoles Olm (Double Ratchet) et Megolm de la Matrix.org Foundation.
- **WebCrypto API (Standard W3C) :** Chiffrement symétrique `AES-256-GCM` et condensats `SHA-256` pour les pièces jointes.
- **`otplib` (v13.4.0 — Licence MIT) & `bcryptjs` (v3.0.3 — Licence MIT) :** Authentification forte 2FA TOTP (RFC 6238) et hachage salé des mots de passe.
- **`express` (MIT), `ws` (MIT), `node:sqlite` (MIT) :** Serveur API, WebSocket temps réel et base embarquée souveraine.
- **Licence du dépôt :** Code publié sous licence **Apache-2.0** (`LICENSE` à la racine).

**Déclaration d'engagement Open Source :** **Créer** une application nouvelle spécialisée pour l'administration publique en s'appuyant sur une bibliothèque cryptographique éprouvée (`@matrix-org/olm`).

---

### 5. Organisation de l'Équipe
- **Membre 1 — Architecture Sécurité & Cryptographie :** Intégration Olm/Megolm, signatures Ed25519, cycle d'enrôlement/2FA TOTP, révocation synchrone et note de sécurité.
- **Membre 2 — Ingénierie Backend & Qualité :** Modèle de données SQLite versionné, contrôle RBAC, accusés de remise/lecture, notifications internes et suites de tests automatisés.
- **Membre 3 — Expérience Mobile-First & Métier :** Interface sobre responsive, suivi versionné des instructions administratives, annuaire hiérarchique et internationalisation (Français, Mooré, Dioula).
