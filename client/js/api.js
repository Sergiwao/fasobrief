/**
 * FASOBRIEF - Client API & WebSocket Manager
 */

class FasoApiClient {
  constructor() {
    this.token = localStorage.getItem('fasobrief_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('fasobrief_user') || 'null');
    this.ws = null;
    this.eventListeners = new Map();
  }

  setSession(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('fasobrief_token', token);
    localStorage.setItem('fasobrief_user', JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('fasobrief_token');
    localStorage.removeItem('fasobrief_user');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erreur HTTP ${res.status}`);
    }
    return data;
  }

  // --- Authentification 2FA ---
  async loginStep1(matricule, password) {
    return this.request('/api/auth/login-step1', {
      method: 'POST',
      body: JSON.stringify({ matricule, password })
    });
  }

  async loginStep2(userId, totpCode) {
    const res = await this.request('/api/auth/login-step2', {
      method: 'POST',
      body: JSON.stringify({ userId, totpCode })
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
      this.connectWebSocket();
    }
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // --- Groupes & Messages Chiffrés ---
  async getGroups() {
    return this.request('/api/groups');
  }

  async getMessages(groupId) {
    return this.request(`/api/groups/${groupId}/messages`);
  }

  async sendEncryptedMessage(groupId, payload) {
    return this.request(`/api/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async uploadEncryptedFile(messageId, encryptedBlob, encryptedFilename, mimeType) {
    const formData = new FormData();
    formData.append('messageId', messageId);
    formData.append('encryptedFilename', encryptedFilename);
    formData.append('mimeType', mimeType);
    formData.append('encryptedFile', encryptedBlob, encryptedFilename);

    return this.request('/api/files/upload', {
      method: 'POST',
      body: formData
    });
  }

  async downloadEncryptedFile(fileId) {
    const res = await fetch(`/api/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    if (!res.ok) throw new Error('Échec du téléchargement');
    return res.blob();
  }

  // --- Innovation FasoBrief ---
  async createInstruction(messageId, titleCiphertext, deadline, groupId) {
    return this.request('/api/instructions', {
      method: 'POST',
      body: JSON.stringify({ messageId, titleCiphertext, deadline, groupId })
    });
  }

  async acknowledgeInstruction(instructionId, signatureProof) {
    return this.request(`/api/instructions/${instructionId}/ack`, {
      method: 'POST',
      body: JSON.stringify({ signatureProof })
    });
  }

  async getInstructionsDashboard() {
    return this.request('/api/instructions/dashboard');
  }

  // --- Administration & Révocation ---
  async revokeAgent(targetUserId, reason) {
    return this.request('/api/admin/revoke', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, reason })
    });
  }

  async getAdminUsers() {
    return this.request('/api/admin/users');
  }

  async getAuditLogs() {
    return this.request('/api/admin/audit-logs');
  }

  // --- WebSocket temps réel ---
  connectWebSocket() {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'AUTH', token: this.token }));
      console.log('[WS] Connecté au serveur souverain.');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (e) {
        console.error('[WS] Erreur parsing message :', e);
      }
    };

    this.ws.onclose = (event) => {
      console.warn(`[WS] Déconnecté (Code: ${event.code}, Raison: ${event.reason})`);
      if (event.code === 4001 && event.reason === 'AGENT_REVOKED') {
        this.emit('ACCOUNT_REVOKED', { reason: 'Votre accès a été révoqué par l\'administration.' });
        this.clearSession();
      }
    };
  }

  on(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType).add(callback);
  }

  emit(eventType, data) {
    if (this.eventListeners.has(eventType)) {
      for (const cb of this.eventListeners.get(eventType)) {
        cb(data);
      }
    }
  }
}

window.FasoApi = new FasoApiClient();
