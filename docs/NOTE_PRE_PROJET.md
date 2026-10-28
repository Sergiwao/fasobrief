# Pièce 2 : Note de Pré-Projet
## FASOBRIEF — La Messagerie Souveraine de l'Administration Publique
**Sprint Technique Pré-Hackathon 226 — Édition 2026 (MTDPCE / DGTD)**

---

### 1. Contexte & Problématique Cible
Au sein des départements ministériels et institutions publiques du Burkina Faso, la coordination opérationnelle s'effectue fréquemment au moyen de messageries instantanées grand public (WhatsApp, Telegram). Cette situation présente des risques majeurs pour la souveraineté nationale :
* **Expatriation des données sensibles :** Métadonnées et échanges hébergés sur des infrastructures cloud sous juridictions étrangères.
* **Perte de traçabilité administrative :** Difficulté à distinguer une discussion informelle d'un ordre de service officiel, absence de preuve de prise de connaissance d'une instruction urgente.
* **Risque de fuite en cas de départ ou perte de terminal :** Absence de révocation centralisée immédiate des accès et des clés de déchiffrement.

---

### 2. Proposition de Valeur & L'Innovation FasoBrief
**FasoBrief** répond à ce défi en unissant un socle cryptographique souverain de niveau militaire à une fonctionnalité métier innovante : **la structuration et le suivi en temps réel des instructions administratives**.

#### Le parcours utilisateur d'une instruction FasoBrief :
1. **Émission qualifiée :** Une autorité hiérarchique habilitée (Directeur, Chef de service) convertit un message opérationnel en instruction administrative structurée dotée d'une référence officielle unique (`INST-2026-XXXX`), d'un objet et d'une échéance d'exécution.
2. **Chiffrement de bout en bout :** Le contenu et les métadonnées de l'instruction sont chiffrés sur le terminal émetteur avec le protocole Megolm/Olm avant transmission.
3. **Accusé de prise de connaissance à valeur probante :** Chaque agent destinataire atteste de sa lecture en générant un accusé signé cryptographiquement par sa clé privée Ed25519 locale.
4. **Tableau de bord de suivi temps réel :** La hiérarchie dispose d'un monitoring consolidé affichant le taux d'acquittement nominatif et les relances nécessaires.

---

### 3. Architecture Technique & Flux de Données
FasoBrief repose sur une architecture souveraine découplée :

```
[ Client Web / Mobile Agent A ]                [ Serveur Souverain d'État ]                [ Client Web / Mobile Agent B ]
              |                                            |                                             |
              |-- 1. Chiffrement local (Olm/Megolm) ------>|                                             |
              |-- 2. Envoi du Ciphertext (Opaque) -------->|-- 3. Relais temps réel (WebSocket) -------->|
              |                                            |      (Stockage SQLite Zéro-Clair)           |-- 4. Déchiffrement local
              |                                            |                                             |-- 5. Signature accusé
              |<-- 7. Notification mise à jour ------------|<-- 6. Envoi accusé signé -------------------|
```

* **Relais et Stockage Zéro-Clair :** Le serveur d'État agit comme un routeur aveugle et un annuaire de clés publiques. Il ne dispose d'aucune clé privée et ne peut déchiffrer ni les messages, ni les fichiers joints (chiffrés symétriquement en AES-256-GCM côté client).
* **Base de données souveraine :** Moteur natif SQLite sans aucune dépendance cloud externe, inspectable à tout instant.

---

### 4. Composants Open Source & Licences Reconnues OSI
Conformément à l'article 2 du règlement, la solution s'appuie exclusivement sur des briques open source éprouvées :

* **`@matrix-org/olm` (v3.2.15 - Licence Apache 2.0) :** Implémentation officielle C/WebAssembly des protocoles cryptographiques Olm et Megolm de la Fondation Matrix.org.
* **`otplib` (v13.5.0 - Licence MIT) :** Moteur d'authentification forte TOTP conforme au standard RFC 6238 de l'IETF.
* **`bcryptjs` (v3.0.3 - Licence MIT) :** Dérivation et hachage fort des mots de passe administratifs.
* **`node:sqlite` (Node.js runtime - Licence MIT / Public Domain) :** Moteur de persistance SQL souverain.
* **Licence du projet :** Le code produit par l'équipe est publié sous licence **Apache 2.0** avec fichier `LICENSE` à la racine.

**Déclaration de niveau d'engagement open source :** **Créer** une application nouvelle spécialisée pour l'administration publique, reposant sur une bibliothèque cryptographique éprouvée (`@matrix-org/olm`).

---

### 5. Organisation de l'Équipe & Répartition des Rôles
* **Membre 1 — Chef de projet & Architecture Sécurité :** Modélisation des flux E2EE, implémentation des contrôles RBAC, gestion des sessions 2FA TOTP et rédaction des notes techniques.
* **Membre 2 — Ingénieur Backend & Intégration Crypto :** Développement du serveur souverain Express/WebSocket, gestion de l'annuaire de clés Olm, moteur de révocation synchrone et tests automatisés.
* **Membre 3 — Ingénieur Frontend & Innovation Métier :** Interface responsive, module de suivi des instructions FasoBrief, intégration WebCrypto client-side et support multilingue (Français, Mooré, Dioula).
