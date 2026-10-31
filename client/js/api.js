/**
 * FASOBRIEF - Client API HTTP & Gestionnaire WebSocket Temps Réel
 */

class FasoApiClient {
  constructor() {
    this.token = localStorage.getItem('fasobrief_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('fasobrief_user') || 'null');
    this.deviceId = null;
    this.ws = null;
    this.reconnectTimer = null;
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
    this.deviceId = null;
    localStorage.removeItem('fasobrief_token');
    localStorage.removeItem('fasobrief_user');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }

  async request(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
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
      const err = new Error(data.error || `Erreur HTTP ${res.status}`);
      err.status = res.status;
      err.code = data.error;
      throw err;
    }
    return data;
  }

  // --- Configuration & Authentification 2FA ---
  async getAuthConfig() {
    return this.request('/api/auth/config');
  }

  async loginStep1(matricule, password) {
    return this.request('/api/auth/login-step1', {
      method: 'POST',
      body: JSON.stringify({ matricule, password })
    });
  }

  async loginStep2(userId, totpCode, challengeToken, deviceInfo = '') {
    const res = await this.request('/api/auth/login-step2', {
      method: 'POST',
      body: JSON.stringify({ userId, totpCode, challengeToken, deviceInfo })
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  }

  async getDemoTotp(userId) {
    return this.request(`/api/auth/demo-totp/${encodeURIComponent(userId)}`);
  }

  async qrLogin(code, deviceInfo = '') {
    const res = await this.request('/api/auth/qr-login', {
      method: 'POST',
      body: JSON.stringify({ code, deviceInfo })
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  }

  async activateStep1(matricule, activationCode) {
    return this.request('/api/auth/activate-step1', {
      method: 'POST',
      body: JSON.stringify({ matricule, activationCode })
    });
  }

  async activateStep2(payload) {
    const res = await this.request('/api/auth/activate-step2', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  async logoutServer() {
    try {
      if (this.token) {
        await this.request('/api/auth/logout', { method: 'POST' });
      }
    } catch (_) {}
    this.clearSession();
  }

  async updatePreferences(prefs) {
    const res = await this.request('/api/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs)
    });
    if (res.user) {
      this.currentUser = res.user;
      localStorage.setItem('fasobrief_user', JSON.stringify(res.user));
    }
    return res;
  }

  async updateProfile(profileData) {
    const res = await this.request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(profileData)
    });
    if (res.user) {
      this.currentUser = res.user;
      localStorage.setItem('fasobrief_user', JSON.stringify(res.user));
    }
    return res;
  }

  // --- Cryptographie Olm / Megolm ---
  async registerCryptoDevice(payload) {
    this.deviceId = payload.deviceId;
    return this.request('/api/crypto/devices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getGroupDevices(groupId) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/devices`);
  }

  async claimOneTimeKey(targetUserId, targetDeviceId) {
    return this.request('/api/crypto/claim-otk', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, targetDeviceId })
    });
  }

  async sendToDeviceEnvelopes(payload) {
    return this.request('/api/crypto/to-device', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getPendingToDevice(deviceId) {
    return this.request(`/api/crypto/to-device?deviceId=${encodeURIComponent(deviceId)}`);
  }

  async ackToDeviceEnvelopes(envelopeIds) {
    return this.request('/api/crypto/to-device/ack', {
      method: 'POST',
      body: JSON.stringify({ envelopeIds })
    });
  }

  async requestMegolmKey(groupId, megolmSessionId, deviceId) {
    return this.request('/api/crypto/key-requests', {
      method: 'POST',
      body: JSON.stringify({ groupId, megolmSessionId, deviceId })
    });
  }

  async getPendingKeyRequests() {
    return this.request('/api/crypto/key-requests');
  }

  // --- Annuaire & Conversations ---
  async getDirectory(filters = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/api/directory${suffix}`);
  }

  async getGroups() {
    return this.request('/api/groups');
  }

  async getGroupDetails(groupId) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}`);
  }

  async openDirectConversation(targetUserId) {
    return this.request('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    });
  }

  async createGroup(payload) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateGroup(groupId, payload) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async addGroupMembers(groupId, userIds, memberRole = 'MEMBER') {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds, memberRole })
    });
  }

  async removeGroupMember(groupId, userId) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  }

  async leaveGroup(groupId) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/leave`, {
      method: 'POST'
    });
  }

  // --- Messages, Accusés Réels & Pièces Jointes E2EE ---
  async getMessages(groupId) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/messages`);
  }

  async sendEncryptedMessage(groupId, payload) {
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async sendMessageReceipts(messageIds, type) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return { success: true };
    return this.request('/api/messages/receipts', {
      method: 'POST',
      body: JSON.stringify({ messageIds, type })
    });
  }

  async getMessageInfo(messageId) {
    return this.request(`/api/messages/${encodeURIComponent(messageId)}/info`);
  }

  async uploadGroupEncryptedFile(groupId, encryptedBlob) {
    const formData = new FormData();
    formData.append('encryptedFile', encryptedBlob, 'cipher.bin');
    return this.request(`/api/groups/${encodeURIComponent(groupId)}/files`, {
      method: 'POST',
      body: formData
    });
  }

  async downloadEncryptedFile(fileId) {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Accès fichier refusé (${res.status})`);
    }
    return res.blob();
  }

  // --- Instructions Administratives FasoBrief ---
  async prepareInstructionScope(recipientIds) {
    return this.request('/api/instructions/scope-group', {
      method: 'POST',
      body: JSON.stringify({ recipientIds })
    });
  }

  async createInstruction(payload) {
    return this.request('/api/instructions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async publishInstruction(instructionId, payload = {}) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async markInstructionViewed(instructionId) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/view`, {
      method: 'POST'
    });
  }

  async acknowledgeInstruction(instructionId, ackPayload) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/ack`, {
      method: 'POST',
      body: JSON.stringify(ackPayload)
    });
  }

  async markInstructionInProgress(instructionId) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/progress`, {
      method: 'POST'
    });
  }

  async declareInstructionExecuted(instructionId, payload = {}) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateInstruction(instructionId, payload) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async setInstructionFinalStatus(instructionId, status) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
  }

  async getInstructionsDashboard() {
    return this.request('/api/instructions/dashboard');
  }

  async getInstructionDetails(instructionId) {
    return this.request(`/api/instructions/${encodeURIComponent(instructionId)}`);
  }

  // --- Notifications ---
  async getNotifications() {
    return this.request('/api/notifications');
  }

  async markNotificationRead(id) {
    return this.request(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST'
    });
  }

  async markAllNotificationsRead() {
    return this.request('/api/notifications/read-all', {
      method: 'POST'
    });
  }

  // --- Administration, Comptes & Audit ---
  async getAdminUsers() {
    return this.request('/api/admin/users');
  }

  async createAdminService(name) {
    return this.request('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  async enrollAdminUser(payload) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAdminUser(userId, payload) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async generateUserQr(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/qr`, {
      method: 'POST'
    });
  }

  async resetDemo() {
    const res = await this.request('/api/admin/reset-demo', {
      method: 'POST'
    });
    if (res.success && res.token && res.user) {
      this.setSession(res.token, res.user);
    }
    return res;
  }

  async createInvitation(payload) {
    return this.request('/api/admin/invitations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async suspendUser(userId, reason) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async reactivateUser(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/reactivate`, {
      method: 'POST'
    });
  }

  async revokeAgent(targetUserId, reason) {
    return this.request('/api/admin/revoke', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, reason })
    });
  }

  async getAuditLogs(eventType = '') {
    const qs = eventType ? `?eventType=${encodeURIComponent(eventType)}` : '';
    return this.request(`/api/admin/audit-logs${qs}`);
  }

  async getServerInspection() {
    return this.request('/api/admin/server-inspection');
  }

  // --- WebSocket Temps Réel ---
  connectWebSocket(deviceId = null) {
    if (!this.token) return;
    if (deviceId) this.deviceId = deviceId;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'AUTH',
        token: this.token,
        deviceId: this.deviceId
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'SECURITY_ALERT') {
          this.emit(data.event || 'ACCOUNT_REVOKED', data);
        } else {
          this.emit(data.type, data);
        }
      } catch (e) {
        console.error('[WS] Erreur décodage message :', e);
      }
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (event.code === 4001) {
        const reasonEvent = event.reason === 'ACCOUNT_SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REVOKED';
        this.emit(reasonEvent, {
          reason: event.reason === 'ACCOUNT_SUSPENDED'
            ? 'Votre compte FasoBrief a été temporairement suspendu par l\'administration.'
            : 'Votre habilitation FasoBrief a été révoquée avec effet immédiat.'
        });
        this.clearSession();
        return;
      }

      if (this.token) {
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 2500);
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
