/**
 * FASOBRIEF - Moteur Cryptographique Client de Bout en Bout (Olm / Megolm / WebCrypto)
 *
 * CONFORMITÉ STRICTE AU RÈGLEMENT :
 * - Aucune cryptographie maison : repose intégralement sur la bibliothèque officielle
 *   @matrix-org/olm (Apache-2.0 : Olm Double Ratchet Curve25519/Ed25519 + Megolm Group Ratchet)
 *   et sur l'API standard W3C WebCrypto (AES-256-GCM & SHA-256) pour le chiffrement binaire
 *   des pièces jointes volumineuses (modèle Matrix EncryptedFile).
 * - Clés privées générées et conservées exclusivement sur le terminal client.
 * - Distribution des clés de session Megolm chiffrée de bout en bout appareil par appareil via Olm.
 * - Rotation immédiate de la session Megolm sortante dès qu'un membre quitte, est suspendu
 *   ou est révoqué (incrément de keyEpoch / événement GROUP_KEY_ROTATION_REQUIRED).
 * - Signatures Ed25519 réelles et vérifiables pour les accusés d'instructions administratives.
 */

class FasoCryptoEngine {
  constructor() {
    this.olmLoaded = false;
    this.userId = null;
    this.deviceId = null;
    this.pickleKey = null;
    this.olmAccount = null;
    this.identityKeys = null; // { curve25519, ed25519 }
    this.state = null;
    this.api = null;
    this.requestedSessions = new Set();
    this._syncLock = Promise.resolve();
  }

  async init() {
    if (this.olmLoaded) return;
    if (typeof Olm === 'undefined') {
      throw new Error('Bibliothèque @matrix-org/olm introuvable sur le client.');
    }
    await Olm.init({
      locateFile: (file) => `/vendor/olm/${file || 'olm.wasm'}`
    });
    this.olmLoaded = true;
  }

  _storageKey(userId) {
    return `fasobrief_olm_v2_${userId}`;
  }

  _generateRandomHex(bytesLen = 16) {
    const arr = new Uint8Array(bytesLen);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  _freeCurrentAccount() {
    if (this.olmAccount) {
      try {
        this.olmAccount.free();
      } catch (_) {}
      this.olmAccount = null;
    }
    this.userId = null;
    this.deviceId = null;
    this.identityKeys = null;
    this.state = null;
    this.requestedSessions.clear();
  }

  _saveState() {
    if (!this.userId || !this.state || !this.olmAccount) return;
    this.state.accountPickle = this.olmAccount.pickle(this.pickleKey);
    localStorage.setItem(this._storageKey(this.userId), JSON.stringify(this.state));
  }

  /**
   * Initialise ou restaure le compte Olm isolé de l'agent connecté et publie ses clés publiques
   */
  async bindUserSession(userId, apiClient) {
    await this.init();
    this._freeCurrentAccount();

    this.userId = userId;
    this.api = apiClient;

    const rawSaved = localStorage.getItem(this._storageKey(userId));
    let isFreshAccount = false;

    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        this.pickleKey = parsed.pickleKey;
        this.deviceId = parsed.deviceId;
        this.state = parsed;
        this.olmAccount = new Olm.Account();
        this.olmAccount.unpickle(this.pickleKey, parsed.accountPickle);
      } catch (e) {
        console.warn('[CRYPTO] État Olm local corrompu, recréation propre du terminal :', e);
        isFreshAccount = true;
      }
    } else {
      isFreshAccount = true;
    }

    if (isFreshAccount) {
      this.pickleKey = this._generateRandomHex(32);
      this.deviceId = `dev_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${this._generateRandomHex(6)}`;
      this.olmAccount = new Olm.Account();
      this.olmAccount.create();
      this.olmAccount.generate_one_time_keys(30);
      this.olmAccount.generate_fallback_key();

      this.state = {
        deviceId: this.deviceId,
        pickleKey: this.pickleKey,
        accountPickle: '',
        olmSessions: {},          // peerCurve25519 -> [sessionPickle, ...]
        outboundGroupSessions: {}, // groupId -> { sessionId, keyEpoch, sharedDevices: [], pickle }
        inboundGroupSessions: {}   // `${groupId}:${sessionId}` -> { senderEd25519, senderCurve25519, pickle }
      };
    }

    this.identityKeys = JSON.parse(this.olmAccount.identity_keys());

    // Extraire les One-Time Keys et la Fallback Key à publier
    const otkObj = JSON.parse(this.olmAccount.one_time_keys());
    const curveOtks = (otkObj && otkObj.curve25519) || {};

    let fallbackKeyId = null;
    let fallbackKey = null;
    try {
      const fbObj = JSON.parse(this.olmAccount.fallback_key());
      const fbEntries = Object.entries((fbObj && fbObj.curve25519) || {});
      if (fbEntries.length > 0) {
        [fallbackKeyId, fallbackKey] = fbEntries[0];
      }
    } catch (_) {}

    await this.api.registerCryptoDevice({
      deviceId: this.deviceId,
      deviceLabel: `Navigateur (${navigator.platform || 'Web'})`,
      curve25519Key: this.identityKeys.curve25519,
      ed25519Key: this.identityKeys.ed25519,
      oneTimeKeys: curveOtks,
      fallbackKeyId,
      fallbackKey
    });

    this.olmAccount.mark_keys_as_published();
    this._saveState();

    // Synchroniser les enveloppes Olm en attente et répondre aux demandes de clés légitimes
    await this.syncPendingCrypto();
    return {
      deviceId: this.deviceId,
      identityKeys: this.identityKeys
    };
  }

  async replenishOneTimeKeys(count = 20) {
    if (!this.olmAccount || !this.api) return;
    this.olmAccount.generate_one_time_keys(count);
    const otkObj = JSON.parse(this.olmAccount.one_time_keys());
    const curveOtks = (otkObj && otkObj.curve25519) || {};

    await this.api.registerCryptoDevice({
      deviceId: this.deviceId,
      curve25519Key: this.identityKeys.curve25519,
      ed25519Key: this.identityKeys.ed25519,
      oneTimeKeys: curveOtks
    });

    this.olmAccount.mark_keys_as_published();
    this._saveState();
  }

  /**
   * Synchronise de manière séquentielle les enveloppes Olm entrantes et les demandes de clés Megolm
   */
  async syncPendingCrypto() {
    this._syncLock = this._syncLock
      .then(async () => {
        await this._pullAndProcessEnvelopes();
        await this._answerPendingKeyRequests();
      })
      .catch((err) => console.warn('[CRYPTO] Erreur syncPendingCrypto :', err));
    return this._syncLock;
  }

  async _pullAndProcessEnvelopes() {
    if (!this.api || !this.deviceId || !this.olmAccount) return 0;
    const res = await this.api.getPendingToDevice(this.deviceId);
    const envelopes = (res && res.envelopes) || [];
    if (envelopes.length === 0) return 0;

    const ackIds = [];
    for (const env of envelopes) {
      const handled = this._decryptAndImportEnvelope(env);
      if (handled) {
        ackIds.push(env.id);
      }
    }

    this._saveState();
    if (ackIds.length > 0) {
      await this.api.ackToDeviceEnvelopes(ackIds);
    }
    return ackIds.length;
  }

  processRealtimeEnvelope(envelope) {
    if (!envelope || !this.olmAccount) return false;
    const ok = this._decryptAndImportEnvelope(envelope);
    if (ok) {
      this._saveState();
      if (envelope.id && this.api) {
        this.api.ackToDeviceEnvelopes([envelope.id]).catch(() => {});
      }
    }
    return ok;
  }

  _decryptAndImportEnvelope(env) {
    const peerCurve = env.senderCurve25519;
    const olmType = env.olmType;
    const olmBody = env.olmBody;
    if (!peerCurve || (olmType !== 0 && olmType !== 1) || !olmBody) return true;

    let plaintext = null;
    const sessionPickles = this.state.olmSessions[peerCurve] || [];

    // 1. Tester les sessions Olm existantes avec ce pair
    for (let i = 0; i < sessionPickles.length; i++) {
      const sess = new Olm.Session();
      try {
        sess.unpickle(this.pickleKey, sessionPickles[i]);
        if (olmType === 0) {
          if (sess.matches_inbound_from(peerCurve, olmBody)) {
            plaintext = sess.decrypt(olmType, olmBody);
            sessionPickles[i] = sess.pickle(this.pickleKey);
            break;
          }
        } else {
          plaintext = sess.decrypt(olmType, olmBody);
          sessionPickles[i] = sess.pickle(this.pickleKey);
          break;
        }
      } catch (_) {
        // Essayer la session suivante
      } finally {
        sess.free();
      }
    }

    // 2. Si message PreKey (type 0) d'une nouvelle session Olm entrante
    if (plaintext === null && olmType === 0) {
      const sess = new Olm.Session();
      try {
        sess.create_inbound_from(this.olmAccount, peerCurve, olmBody);
        this.olmAccount.remove_one_time_keys(sess);
        plaintext = sess.decrypt(0, olmBody);
        sessionPickles.unshift(sess.pickle(this.pickleKey));
        this.state.olmSessions[peerCurve] = sessionPickles.slice(0, 5);
      } catch (err) {
        console.warn('[CRYPTO] Impossible d\'ouvrir l\'enveloppe PreKey Olm :', err);
        return true; // Purger l'enveloppe illisible pour ne pas bloquer la file
      } finally {
        sess.free();
      }
    }

    if (plaintext === null) {
      return true;
    }

    this.state.olmSessions[peerCurve] = sessionPickles;

    try {
      const packet = JSON.parse(plaintext);
      if (packet.type === 'm.room_key' && packet.groupId && packet.sessionId && packet.sessionKey) {
        const keyId = `${packet.groupId}:${packet.sessionId}`;
        if (!this.state.inboundGroupSessions[keyId]) {
          const inb = new Olm.InboundGroupSession();
          try {
            inb.create(packet.sessionKey);
            this.state.inboundGroupSessions[keyId] = {
              senderCurve25519: peerCurve,
              senderEd25519: packet.senderEd25519 || env.senderEd25519 || null,
              pickle: inb.pickle(this.pickleKey)
            };
          } finally {
            inb.free();
          }
        }
      } else if (
        packet.type === 'm.forwarded_room_key' &&
        packet.groupId &&
        packet.sessionId &&
        packet.exportedSessionKey
      ) {
        const keyId = `${packet.groupId}:${packet.sessionId}`;
        if (!this.state.inboundGroupSessions[keyId]) {
          const inb = new Olm.InboundGroupSession();
          try {
            inb.import_session(packet.exportedSessionKey);
            this.state.inboundGroupSessions[keyId] = {
              senderCurve25519: peerCurve,
              senderEd25519: packet.senderEd25519 || env.senderEd25519 || null,
              pickle: inb.pickle(this.pickleKey)
            };
          } finally {
            inb.free();
          }
        }
      }
    } catch (err) {
      console.warn('[CRYPTO] Paquet room_key invalide :', err);
    }

    return true;
  }

  /**
   * Chiffre un paquet JSON en 1:1 via Olm Double Ratchet à destination d'un terminal précis
   */
  async _encryptOlmForDevice(targetDevice, packetObj) {
    const peerCurve = targetDevice.curve25519Key;
    const plaintext = JSON.stringify(packetObj);
    const existingPickles = this.state.olmSessions[peerCurve] || [];

    if (existingPickles.length > 0) {
      const sess = new Olm.Session();
      try {
        sess.unpickle(this.pickleKey, existingPickles[0]);
        const olmMsg = sess.encrypt(plaintext);
        existingPickles[0] = sess.pickle(this.pickleKey);
        this.state.olmSessions[peerCurve] = existingPickles;
        return olmMsg;
      } finally {
        sess.free();
      }
    }

    // Créer une session Olm sortante en réclamant une One-Time Prekey du destinataire
    const claim = await this.api.claimOneTimeKey(targetDevice.userId, targetDevice.deviceId);
    const sess = new Olm.Session();
    try {
      sess.create_outbound(this.olmAccount, claim.curve25519Key, claim.oneTimeKey);
      const olmMsg = sess.encrypt(plaintext);
      this.state.olmSessions[peerCurve] = [sess.pickle(this.pickleKey), ...existingPickles].slice(0, 5);
      return olmMsg;
    } finally {
      sess.free();
    }
  }

  /**
   * Rotation explicite de la session Megolm sortante d'un groupe (suite à révocation ou retrait)
   */
  invalidateOutboundGroupSession(groupId) {
    if (this.state && this.state.outboundGroupSessions) {
      delete this.state.outboundGroupSessions[groupId];
      this._saveState();
    }
  }

  /**
   * Garantit une session Megolm sortante à jour avec l'époque de clé du groupe et
   * distribue la clé de session via Olm 1:1 à tous les terminaux actifs autorisés.
   */
  async ensureOutboundGroupSession(groupId) {
    const groupInfo = await this.api.getGroupDevices(groupId);
    const serverKeyEpoch = groupInfo.keyEpoch || 1;
    const activeDevices = groupInfo.devices || [];

    let outRecord = this.state.outboundGroupSessions[groupId];

    // Si aucun état sortant ou si keyEpoch a changé (membre retiré/révoqué/ajouté), rotation Megolm immédiate !
    if (!outRecord || outRecord.keyEpoch !== serverKeyEpoch) {
      const out = new Olm.OutboundGroupSession();
      let sessionId;
      let sessionKey;
      let outPickle;
      try {
        out.create();
        sessionId = out.session_id();
        sessionKey = out.session_key();
        outPickle = out.pickle(this.pickleKey);
      } finally {
        out.free();
      }

      // Enregistrer immédiatement la session entrante correspondante pour soi-même
      const inb = new Olm.InboundGroupSession();
      try {
        inb.create(sessionKey);
        this.state.inboundGroupSessions[`${groupId}:${sessionId}`] = {
          senderCurve25519: this.identityKeys.curve25519,
          senderEd25519: this.identityKeys.ed25519,
          pickle: inb.pickle(this.pickleKey)
        };
      } finally {
        inb.free();
      }

      outRecord = {
        sessionId,
        keyEpoch: serverKeyEpoch,
        sharedDevices: [this.deviceId],
        pickle: outPickle
      };
      this.state.outboundGroupSessions[groupId] = outRecord;
    }

    // Distribuer la clé Megolm courante à tout terminal actif du groupe qui ne l'a pas encore reçue
    const unshared = activeDevices.filter(
      (d) => d.deviceId !== this.deviceId && !outRecord.sharedDevices.includes(d.deviceId)
    );

    if (unshared.length > 0) {
      const out = new Olm.OutboundGroupSession();
      let currentSessionKey;
      try {
        out.unpickle(this.pickleKey, outRecord.pickle);
        currentSessionKey = out.session_key();
      } finally {
        out.free();
      }

      const envelopes = [];
      for (const dev of unshared) {
        try {
          const olmMsg = await this._encryptOlmForDevice(dev, {
            type: 'm.room_key',
            groupId,
            sessionId: outRecord.sessionId,
            sessionKey: currentSessionKey,
            senderCurve25519: this.identityKeys.curve25519,
            senderEd25519: this.identityKeys.ed25519
          });
          envelopes.push({
            recipientUserId: dev.userId,
            recipientDeviceId: dev.deviceId,
            olmType: olmMsg.type,
            olmBody: olmMsg.body,
            groupId,
            megolmSessionId: outRecord.sessionId
          });
          outRecord.sharedDevices.push(dev.deviceId);
        } catch (err) {
          console.warn(`[CRYPTO] Échec partage Olm vers ${dev.deviceId} :`, err);
        }
      }

      if (envelopes.length > 0) {
        await this.api.sendToDeviceEnvelopes({
          senderDeviceId: this.deviceId,
          senderCurve25519: this.identityKeys.curve25519,
          senderEd25519: this.identityKeys.ed25519,
          messages: envelopes
        });
      }
    }

    this._saveState();
    return outRecord;
  }

  /**
   * Partage d'une session Megolm connue avec un terminal légitime nouvellement connecté du groupe
   */
  async shareSessionWithPeerDevice(groupId, megolmSessionId, targetDevice) {
    if (!this.state || !this.api || !targetDevice || targetDevice.deviceId === this.deviceId) return false;
    const keyId = `${groupId}:${megolmSessionId}`;
    const inbRecord = this.state.inboundGroupSessions[keyId];
    if (!inbRecord) return false;

    const inb = new Olm.InboundGroupSession();
    let exportedSessionKey;
    try {
      inb.unpickle(this.pickleKey, inbRecord.pickle);
      exportedSessionKey = inb.export_session(inb.first_known_index());
    } finally {
      inb.free();
    }

    const olmMsg = await this._encryptOlmForDevice(targetDevice, {
      type: 'm.forwarded_room_key',
      groupId,
      sessionId: megolmSessionId,
      exportedSessionKey,
      senderCurve25519: this.identityKeys.curve25519,
      senderEd25519: this.identityKeys.ed25519
    });

    await this.api.sendToDeviceEnvelopes({
      senderDeviceId: this.deviceId,
      senderCurve25519: this.identityKeys.curve25519,
      senderEd25519: this.identityKeys.ed25519,
      messages: [
        {
          recipientUserId: targetDevice.userId,
          recipientDeviceId: targetDevice.deviceId,
          olmType: olmMsg.type,
          olmBody: olmMsg.body,
          groupId,
          megolmSessionId
        }
      ]
    });

    this._saveState();
    return true;
  }

  async _answerPendingKeyRequests() {
    if (!this.api || !this.state) return;
    const res = await this.api.getPendingKeyRequests();
    const requests = (res && res.requests) || [];
    for (const reqItem of requests) {
      const keyId = `${reqItem.groupId}:${reqItem.megolmSessionId}`;
      if (this.state.inboundGroupSessions[keyId]) {
        try {
          await this.shareSessionWithPeerDevice(reqItem.groupId, reqItem.megolmSessionId, {
            userId: reqItem.requesterUserId,
            deviceId: reqItem.requesterDeviceId,
            curve25519Key: reqItem.requesterCurve25519,
            ed25519Key: reqItem.requesterEd25519
          });
        } catch (_) {}
      }
    }
  }

  /**
   * Chiffre un objet JSON structuré (message, instruction ou descripteur de fichier) avec Megolm
   * et signe le ciphertext avec la clé Ed25519 du compte Olm.
   */
  async encryptPayload(groupId, payloadObj) {
    const outRecord = await this.ensureOutboundGroupSession(groupId);
    const out = new Olm.OutboundGroupSession();
    let ciphertext;
    try {
      out.unpickle(this.pickleKey, outRecord.pickle);
      const serialized = JSON.stringify({ v: 2, ...payloadObj });
      ciphertext = out.encrypt(serialized);
      outRecord.pickle = out.pickle(this.pickleKey);
    } finally {
      out.free();
    }

    const signature = this.olmAccount.sign(ciphertext);
    this._saveState();

    return {
      protocol: 'megolm.v1',
      megolmSessionId: outRecord.sessionId,
      ciphertext,
      senderDeviceId: this.deviceId,
      senderEd25519: this.identityKeys.ed25519,
      ephemeralKey: this.identityKeys.curve25519,
      signature
    };
  }

  /**
   * Compatibilité directe pour chiffrer un texte simple
   */
  async encryptTextMessage(groupId, plainText) {
    return this.encryptPayload(groupId, { kind: 'text', text: plainText });
  }

  /**
   * Alias d'envoi chiffré dans un groupe (compatible Lovable UI)
   */
  async encryptGroupPayload(groupId, payloadObj) {
    return this.encryptPayload(groupId, payloadObj);
  }

  /**
   * Alias de synchronisation des enveloppes et demandes de clés (compatible Lovable UI)
   */
  async syncKeysAndRequests() {
    return this.syncPendingCrypto();
  }

  /**
   * Déchiffrement synchrone rapide d'un message Megolm à partir des sessions en mémoire locale
   */
  decryptGroupMessage(msgLike) {
    if (!msgLike || !msgLike.ciphertext) {
      return { ok: false, text: '[Contenu chiffré absent]' };
    }

    const sessionId = msgLike.megolm_session_id || msgLike.megolmSessionId;
    if (!sessionId) {
      return {
        ok: false,
        legacy: true,
        text: '[Message chiffré issu d\'une ancienne session]'
      };
    }

    let inbRecord = null;
    const groupId = msgLike.conversation_id || msgLike.group_id || msgLike.groupId;
    if (this.state && this.state.inboundGroupSessions) {
      if (groupId && this.state.inboundGroupSessions[`${groupId}:${sessionId}`]) {
        inbRecord = this.state.inboundGroupSessions[`${groupId}:${sessionId}`];
      } else {
        for (const k of Object.keys(this.state.inboundGroupSessions)) {
          if (k.endsWith(`:${sessionId}`)) {
            inbRecord = this.state.inboundGroupSessions[k];
            break;
          }
        }
      }
    }

    if (!inbRecord) {
      if (this.api && this.deviceId && groupId) {
        const keyId = `${groupId}:${sessionId}`;
        if (!this.requestedSessions.has(keyId)) {
          this.requestedSessions.add(keyId);
          this.api.requestMegolmKey(groupId, sessionId, this.deviceId).catch(() => {});
        }
      }
      return {
        ok: false,
        waitingForKey: true,
        text: '[Clé de session E2EE en attente de synchronisation]'
      };
    }

    const inb = new Olm.InboundGroupSession();
    try {
      inb.unpickle(this.pickleKey, inbRecord.pickle);
      const dec = inb.decrypt(msgLike.ciphertext);

      let signatureVerified = false;
      const senderEd = msgLike.sender_ed25519 || msgLike.senderEd25519 || inbRecord.senderEd25519;
      if (msgLike.signature && senderEd) {
        const util = new Olm.Utility();
        try {
          util.ed25519_verify(senderEd, msgLike.ciphertext, msgLike.signature);
          signatureVerified = true;
        } catch (_) {
          signatureVerified = false;
        } finally {
          util.free();
        }
      }

      try {
        const parsed = JSON.parse(dec.plaintext);
        return {
          ok: true,
          data: parsed,
          text: parsed.text || parsed.title || '',
          signatureVerified,
          messageIndex: dec.message_index
        };
      } catch (_) {
        return {
          ok: true,
          data: { kind: 'text', text: dec.plaintext },
          text: dec.plaintext,
          signatureVerified,
          messageIndex: dec.message_index
        };
      }
    } catch (err) {
      return {
        ok: false,
        text: '[Message chiffré E2EE — Clé non disponible sur ce terminal]'
      };
    } finally {
      inb.free();
    }
  }

  /**
   * Déchiffre un payload Megolm et vérifie la signature Ed25519 de l'expéditeur si présente
   */
  async decryptPayload(groupId, msgLike) {
    if (!msgLike || !msgLike.ciphertext) {
      return { ok: false, text: '[Contenu chiffré absent]' };
    }

    const sessionId = msgLike.megolm_session_id || msgLike.megolmSessionId;
    if (!sessionId) {
      return {
        ok: false,
        legacy: true,
        text: '[Message chiffré issu d\'une ancienne session]'
      };
    }

    const keyId = `${groupId}:${sessionId}`;
    let inbRecord = this.state && this.state.inboundGroupSessions[keyId];

    // Si la clé n'est pas encore en mémoire locale, tenter une synchronisation immédiate des enveloppes Olm
    if (!inbRecord && this.api) {
      await this._pullAndProcessEnvelopes();
      inbRecord = this.state && this.state.inboundGroupSessions[keyId];
    }

    if (!inbRecord) {
      if (this.api && this.deviceId && !this.requestedSessions.has(keyId)) {
        this.requestedSessions.add(keyId);
        this.api.requestMegolmKey(groupId, sessionId, this.deviceId).catch(() => {});
      }
      return {
        ok: false,
        waitingForKey: true,
        text: '[Clé de session E2EE en attente de synchronisation]'
      };
    }

    const inb = new Olm.InboundGroupSession();
    try {
      inb.unpickle(this.pickleKey, inbRecord.pickle);
      const dec = inb.decrypt(msgLike.ciphertext);

      let signatureVerified = false;
      const senderEd = msgLike.sender_ed25519 || msgLike.senderEd25519 || inbRecord.senderEd25519;
      if (msgLike.signature && senderEd) {
        const util = new Olm.Utility();
        try {
          util.ed25519_verify(senderEd, msgLike.ciphertext, msgLike.signature);
          signatureVerified = true;
        } catch (_) {
          signatureVerified = false;
        } finally {
          util.free();
        }
      }

      try {
        const parsed = JSON.parse(dec.plaintext);
        return {
          ok: true,
          data: parsed,
          text: parsed.text || parsed.title || '',
          signatureVerified,
          messageIndex: dec.message_index
        };
      } catch (_) {
        return {
          ok: true,
          data: { kind: 'text', text: dec.plaintext },
          text: dec.plaintext,
          signatureVerified,
          messageIndex: dec.message_index
        };
      }
    } catch (err) {
      console.warn('[CRYPTO] Échec déchiffrement Megolm :', err);
      return {
        ok: false,
        text: '[Message chiffré E2EE — Clé non disponible sur ce terminal]'
      };
    } finally {
      inb.free();
    }
  }

  /**
   * Chiffrement binaire de pièce jointe par AES-256-GCM (WebCrypto standard)
   * La clé, le vecteur IV, l'empreinte SHA-256 et le nom original sont transmis
   * exclusivement à l'intérieur du message Megolm !
   */
  async encryptFile(fileArrayBuffer, fileName, mimeType) {
    const fileKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      fileArrayBuffer
    );

    const digestBuffer = await crypto.subtle.digest('SHA-256', encryptedContent);
    const exportedRawKey = await crypto.subtle.exportKey('raw', fileKey);

    return {
      encryptedBlob: new Blob([encryptedContent], { type: 'application/octet-stream' }),
      fileKeyBase64: this.bufferToBase64(new Uint8Array(exportedRawKey)),
      ivBase64: this.bufferToBase64(iv),
      sha256Base64: this.bufferToBase64(new Uint8Array(digestBuffer)),
      originalName: fileName,
      originalMime: mimeType || 'application/octet-stream',
      originalSize: fileArrayBuffer.byteLength
    };
  }

  /**
   * Vérification d'intégrité SHA-256 et déchiffrement local AES-256-GCM d'une pièce jointe
   */
  async decryptFile(encryptedBlob, fileKeyBase64, ivBase64, expectedSha256Base64, originalMime) {
    const arrayBuffer = await encryptedBlob.arrayBuffer();

    if (expectedSha256Base64) {
      const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const actualSha256 = this.bufferToBase64(new Uint8Array(digest));
      if (actualSha256 !== expectedSha256Base64) {
        throw new Error('Intégrité du fichier chiffré compromise (SHA-256 non concordant).');
      }
    }

    const rawKey = this.base64ToBuffer(fileKeyBase64);
    const iv = this.base64ToBuffer(ivBase64);

    const key = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      arrayBuffer
    );

    return new Blob([decryptedBuffer], { type: originalMime || 'application/octet-stream' });
  }

  /**
   * Signature Ed25519 réelle avec la clé privée Olm du terminal pour l'accusé d'instruction
   */
  signInstructionAck(instructionId, version, userId) {
    if (!this.olmAccount || !this.identityKeys) {
      throw new Error('Compte cryptographique Olm non initialisé.');
    }
    const signedPayload = `FASOBRIEF_ACK_V1:${instructionId}:v${version || 1}:${userId}`;
    const signatureProof = this.olmAccount.sign(signedPayload);
    return {
      signedPayload,
      signatureProof,
      signerEd25519: this.identityKeys.ed25519
    };
  }

  bufferToBase64(uint8) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  base64ToBuffer(base64) {
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }
}

window.FasoCrypto = new FasoCryptoEngine();
if (typeof window.FasoCrypto.encryptGroupPayload !== 'function') {
  window.FasoCrypto.encryptGroupPayload = function(groupId, payloadObj) {
    return this.encryptPayload(groupId, payloadObj);
  };
}
