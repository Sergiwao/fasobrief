# Scénario et Découpage Minuté de la Vidéo de Démonstration (3 min max)
## FASOBRIEF — Messagerie Souveraine de l'Administration Publique
**Sprint Technique Pré-Hackathon 226 — Édition 2026 (MTDPCE / DGTD)**

---

### Objectif de la Vidéo
Démontrer en 180 secondes chrono :
1. L'échange chiffré de bout en bout (E2EE) entre deux agents publics avec authentification 2FA.
2. L'innovation métier FasoBrief (instruction administrative et accusé signé).
3. La révocation immédiate en direct d'un agent.
4. La preuve technique que le serveur ne lit aucun message ni fichier en clair.

---

### Minutage Détaillé (Total : 2 min 50 s / 170 secondes)

| Temps | Séquence | Narration & Action à l'écran | Preuve apportée |
|---|---|---|---|
| **00:00 - 00:25** (25s) | **Introduction & Souveraineté** | Présentation de FasoBrief développé pour le Sprint Pré-Hackathon 226. Démontrer l'architecture auto-hébergeable en une seule commande Docker Compose sans aucun service tiers. Affichage des armoiries et des badges de sécurité. | Hébergement souverain & licence Apache 2.0 |
| **00:25 - 00:50** (25s) | **Authentification Forte 2FA & Rôles** | Connexion du Dr. Salif Ouédraogo (Directeur). Saisie du matricule et du mot de passe. Affichage de l'écran du second facteur TOTP (RFC 6238). Validation du code à 6 chiffres. Arrivée sur l'interface chiffrée. | Obligation 2FA respectée & Enrôlement préalable |
| **00:50 - 01:25** (35s) | **Échange Chiffré E2EE & Fichier** | Envoi d'un message confidentiel de service. Ajout d'une pièce jointe chiffrée localement via WebCrypto AES-256-GCM. Clic sur « Inspecter Ciphertext » montrant le blob chiffré Megolm / Curve25519. | Protocole éprouvé E2EE (libolm) & Zéro clair |
| **01:25 - 02:00** (35s) | **Innovation FasoBrief : Instruction Administrative** | Clic sur « ⚖️ Émettre Instruction FasoBrief ». Titre : *"Transmission du rapport d'audit avant vendredi 16h"*. Attribution automatique d'une référence `INST-2026-XXXX`. Côté destinataire (Agent B), clic sur « Accuser Réception ». Bascule vers le tableau de bord montrant l'acquittement nominatif en temps réel. | Innovation métier pour l'administration publique |
| **02:00 - 02:30** (30s) | **Épreuve en Direct : Révocation Immédiate** | Dans la console d'administration, le Directeur clique sur « Révoquer Immédiatement » pour l'Agent Ibrahim Kaboré (perte de terminal). À l'écran de l'agent, coupure instantanée du WebSocket, alerte de sécurité rouge, sessions invalidées et rotation de clé Megolm. | Épreuve éliminatoire de révocation validée |
| **02:30 - 02:50** (20s) | **Preuve Serveur Zéro-Clair & Langue Nationale** | Clic sur « Inspecter Base SQL » : la base ne contient que des ciphertexts. Bascule de l'interface en **Mooré** et **Dioula** (bonus +3 pts). Conclusion et rappel des 14 tests automatisés validés. | Épreuve "Le serveur ne lit rien" & Bonus national |

---

### Recommandations Techniques pour l'Enregistrement
* Utiliser **OBS Studio** ou l'enregistreur d'écran en résolution 1920x1080 (60 fps).
* Disposer deux fenêtres de navigateur côte à côte (Directeur à gauche, Agent à droite) pour visualiser en direct l'effet de la révocation et de l'accusé de réception.
* Format final : MP4 H.264 / AAC, durée inférieure à 3 minutes strictes, fichier hébergé sur le lien demandé par la plateforme du MTDPCE.
