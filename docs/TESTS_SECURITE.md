# Guide Opérationnel de Reproduction des Tests de Sécurité
## FASOBRIEF — Protocole de Vérification pour le Jury d'Entretien
**Sprint Technique Pré-Hackathon 226 — Édition 2026**

Ce document permet aux membres du jury de reproduire l'ensemble des tests de sécurité et de conformité, soit en ligne de commande automatisée, soit de façon interactive dans l'application web.

---

## 1. Exécution des Tests Automatisés (1 commande)

Depuis la racine du projet, lancez :
```bash
npm test
```
**Résultat attendu :** 14 / 14 tests réussis avec statut `✅ TOUTES LES EXIGENCES DE SÉCURITÉ SONT VALIDÉES`.

---

## 2. Reproduction des Épreuves de Démonstration en Direct (UI)

Démarrez l'application si ce n'est pas déjà fait :
```bash
npm start
# Accès : http://localhost:3000
```

### Épreuve A : « Le serveur ne lit rien » (Inspection Base SQL & Trafic)
1. Connectez-vous avec le compte du Directeur (`usr_dir_01`).
2. Saisissez le code TOTP officiel ou cliquez sur « Générer Code Démo » (ou tapez `123456`), puis validez.
3. Envoyez un message chiffré dans le groupe : `"Ordre de mission confidentiel N° 402"`.
4. Cliquez sur **« Inspecter Ciphertext (Preuve E2EE) »** sous la bulle du message.
5. Observez le payload brut relayé :
   * **Résultat observé :** Le serveur ne stocke que du ciphertext base64 AES-256-GCM / Megolm, avec son IV 96-bit et son tag MAC 128-bit.
6. Rendez-vous dans l'onglet **« Console Sécurité & Révocation »** et cliquez sur **« Inspecter Base SQL (Zéro Clair) »**.
   * **Résultat observé :** Affichage direct des enregistrements SQL de la table `messages`. Aucun mot du texte source n'apparaît.

---

### Épreuve B : « Révocation Immédiate d'un Agent »
1. Ouvrez une seconde fenêtre de navigateur (ou un onglet de navigation privée) sur `http://localhost:3000`.
2. Connectez-vous en tant qu'**Ibrahim Kaboré (Agent, FASO-AGT-03)**.
3. Dans la première fenêtre (session Directeur), allez dans l'onglet **« Console Sécurité & Révocation »**.
4. Repérez la ligne d'Ibrahim Kaboré et cliquez sur **« 🚫 Révoquer Immédiatement »**.
5. Renseignez le motif officiel : `"Perte de terminal de service"`.
6. Observez instantanément l'écran de l'Agent dans la deuxième fenêtre :
   * **Résultat observé :** 
     - La connexion WebSocket est coupée immédiatement (code 4001 `AGENT_REVOKED`).
     - Une bannière rouge d'alerte de sécurité s'affiche : *« Votre accès a été immédiatement révoqué par l'administration »*.
     - L'interface est verrouillée.
     - Toute tentative de rafraîchissement ou de reconnexion est rejetée avec le message `AGENT_REVOQUE_ACCES_INTERDIT`.
     - Les clés de chiffrement de groupe Megolm sont immédiatement renouvelées (re-keying) pour les membres restants.

---

### Épreuve C : « Tentative d'Accès d'un Intrus »
1. Dans l'onglet **« Console Sécurité & Révocation »**, cliquez sur **« Lancer Test d'Intrus »**.
2. Un compte non enrôlé (`INTRUS_HACKER_007`) tente une authentification par l'API `POST /api/auth/login-step1`.
   * **Résultat attendu et observé :** Rejet HTTP 403 `COMPTE_NON_ENROLE_OU_INCONNU`.
3. Cliquez sur l'onglet **« Journal d'Audit Immuable »** :
   * **Résultat observé :** L'événement `INTRUSION_ATTEMPT` est consigné avec son horodatage exact et l'adresse IP source.

---

### Épreuve D : « Innovation FasoBrief — Suivi des Instructions Administratives »
1. En tant que Directeur ou Chef de service, cliquez sur **« ⚖️ Émettre Instruction FasoBrief »**.
2. Renseignez l'objet : `"Transmission du bilan d'exécution avant vendredi 16h"`.
3. Cliquez sur **« Émettre & Chiffrer »** :
   * L'instruction apparaît dans la conversation sous la forme d'une carte administrative dorée avec sa référence officielle `INST-2026-XXXX`.
4. Cliquez sur **« Accuser Réception »** :
   * Le statut bascule sur `✓ Connaissance Prise`.
5. Ouvrez l'onglet **« Instructions & Suivi »** :
   * Le tableau de bord affiche le taux d'acquittement global mis à jour en temps réel et la liste nominative des prises de connaissance avec leur horodatage exact.

---

### Épreuve E : « Bonus Langues Nationales »
1. En haut à droite de l'écran, changez la langue vers **Mooré** ou **Dioula**.
   * **Résultat observé :** L'ensemble des badges, menus, boutons et modales basculent instantanément dans la langue nationale choisie.
