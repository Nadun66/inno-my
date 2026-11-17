import type {
  AdminSnapshot,
  GroupId,
  JoinQueueResult,
  PublicArenaStatus,
  SessionInfo,
  SpinResult,
  TeamLeaderSnapshot,
} from '../types/portal';

const TEAM_SESSION_KEY = 'innohack26_team_session';
const ADMIN_SESSION_KEY = 'innohack26_admin_session';

function readSession(key: string): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

function writeSession(key: string, session: SessionInfo | null): void {
  if (!session) {
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, JSON.stringify(session));
  }
}

async function apiFetch<T>(
    path: string,
    options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
        typeof data?.error === 'string'
            ? data.error
            : `Request failed with status ${res.status}`;
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const localPortalService = {
  getTeamSession(): SessionInfo | null {
    return readSession(TEAM_SESSION_KEY);
  },

  getAdminSession(): SessionInfo | null {
    return readSession(ADMIN_SESSION_KEY);
  },

  clearTeamSession(): void {
    writeSession(TEAM_SESSION_KEY, null);
  },

  clearAdminSession(): void {
    writeSession(ADMIN_SESSION_KEY, null);
  },

  async getPublicStatus(): Promise<PublicArenaStatus> {
    return apiFetch<PublicArenaStatus>('/api/public/status');
  },

  async teamLeaderLogin(
      studentId: string,
      registrationCode: string
  ): Promise<{ session: SessionInfo; snapshot: TeamLeaderSnapshot }> {
    const data = await apiFetch<{
      token: string;
      role: 'team_leader';
      teamId: string;
      studentId: string;
      snapshot: TeamLeaderSnapshot;
    }>('/api/auth/team-login', {
      method: 'POST',
      body: { studentId, registrationCode },
    });

    const session: SessionInfo = {
      role: 'team_leader',
      token: data.token,
      teamId: data.teamId,
      studentId: data.studentId,
    };
    writeSession(TEAM_SESSION_KEY, session);
    return { session, snapshot: data.snapshot };
  },

  async adminLogin(
      passcode: string
  ): Promise<{ session: SessionInfo; snapshot: AdminSnapshot }> {
    const data = await apiFetch<{
      token: string;
      role: 'admin';
      snapshot: AdminSnapshot;
    }>('/api/auth/admin-login', {
      method: 'POST',
      body: { passcode },
    });

    const session: SessionInfo = {
      role: 'admin',
      token: data.token,
    };
    writeSession(ADMIN_SESSION_KEY, session);
    return { session, snapshot: data.snapshot };
  },

  async fetchTeamSnapshot(): Promise<TeamLeaderSnapshot> {
    const session = readSession(TEAM_SESSION_KEY);
    if (!session?.token) throw new Error('Not logged in.');
    return apiFetch<TeamLeaderSnapshot>('/api/team/snapshot', {
      token: session.token,
    });
  },

  async joinDrawQueue(): Promise<JoinQueueResult & { snapshot?: TeamLeaderSnapshot }> {
    const session = readSession(TEAM_SESSION_KEY);
    if (!session?.token) throw new Error('Not logged in.');
    return apiFetch<JoinQueueResult & { snapshot: TeamLeaderSnapshot }>('/api/queue/join', {
      method: 'POST',
      token: session.token,
    });
  },

  async executeSpin(): Promise<SpinResult & { snapshot?: TeamLeaderSnapshot }> {
    const session = readSession(TEAM_SESSION_KEY);
    if (!session?.token) throw new Error('Not logged in.');
    return apiFetch<SpinResult & { snapshot: TeamLeaderSnapshot }>('/api/draw/spin', {
      method: 'POST',
      token: session.token,
    });
  },

  async sendHeartbeat(): Promise<void> {
    const session = readSession(TEAM_SESSION_KEY);
    if (!session?.token) return;
    await apiFetch('/api/presence/heartbeat', {
      method: 'POST',
      token: session.token,
    });
  },

  subscribeTeamSnapshot(
      onData: (snapshot: TeamLeaderSnapshot) => void,
      onConnectionChange: (connected: boolean) => void,
      onAuthError: () => void
  ): () => void {
    const session = readSession(TEAM_SESSION_KEY);
    if (!session?.token) {
      onAuthError();
      return () => {};
    }

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const url = `/api/stream?token=${encodeURIComponent(session.token)}`;
      source = new EventSource(url);

      source.addEventListener('open', () => {
        onConnectionChange(true);
      });

      source.addEventListener('snapshot', (evt) => {
        try {
          const parsed = JSON.parse((evt as MessageEvent).data) as TeamLeaderSnapshot;
          onConnectionChange(true);
          onData(parsed);
        } catch {
          // Ignore malformed event
        }
      });

      source.onerror = () => {
        onConnectionChange(false);
        source?.close();
        if (!closed) {
          this.fetchTeamSnapshot()
              .then((snap) => {
                if (!closed) {
                  onData(snap);
                  reconnectTimer = window.setTimeout(connect, 1800);
                }
              })
              .catch((err: Error & { status?: number }) => {
                if (err.status === 401 || err.status === 403) {
                  this.clearTeamSession();
                  onAuthError();
                } else if (!closed) {
                  reconnectTimer = window.setTimeout(connect, 3000);
                }
              });
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  },

  subscribeAdminSnapshot(
      onData: (snapshot: AdminSnapshot) => void,
      onConnectionChange: (connected: boolean) => void,
      onAuthError: () => void
  ): () => void {
    const session = readSession(ADMIN_SESSION_KEY);
    if (!session?.token) {
      onAuthError();
      return () => {};
    }

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const url = `/api/stream?token=${encodeURIComponent(session.token)}`;
      source = new EventSource(url);

      source.addEventListener('open', () => {
        onConnectionChange(true);
      });

      source.addEventListener('snapshot', (evt) => {
        try {
          const parsed = JSON.parse((evt as MessageEvent).data) as AdminSnapshot;
          onConnectionChange(true);
          onData(parsed);
        } catch {
          // Ignore malformed frame
        }
      });

      source.onerror = () => {
        onConnectionChange(false);
        source?.close();
        if (!closed) {
          apiFetch<AdminSnapshot>('/api/admin/snapshot', { token: session.token })
              .then((snap) => {
                if (!closed) {
                  onData(snap);
                  reconnectTimer = window.setTimeout(connect, 2000);
                }
              })
              .catch((err: Error & { status?: number }) => {
                if (err.status === 401 || err.status === 403) {
                  this.clearAdminSession();
                  onAuthError();
                } else if (!closed) {
                  reconnectTimer = window.setTimeout(connect, 3000);
                }
              });
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  },

  async adminToggleQueuePause(paused: boolean, reason: string): Promise<void> {
    const session = readSession(ADMIN_SESSION_KEY);
    if (!session?.token) throw new Error('Admin login required.');
    await apiFetch('/api/admin/queue/pause', {
      method: 'POST',
      token: session.token,
      body: { paused, reason },
    });
  },

  async adminResolveAbandoned(
      teamId: string,
      action: 'MOVE_TO_BACK' | 'RELEASE_TO_IDLE',
      reason: string
  ): Promise<void> {
    const session = readSession(ADMIN_SESSION_KEY);
    if (!session?.token) throw new Error('Admin login required.');
    await apiFetch('/api/admin/queue/resolve-abandoned', {
      method: 'POST',
      token: session.token,
      body: { teamId, action, reason },
    });
  },

  async adminControlledReassign(
      teamId: string,
      targetGroupId: GroupId,
      reason: string
  ): Promise<void> {
    const session = readSession(ADMIN_SESSION_KEY);
    if (!session?.token) throw new Error('Admin login required.');
    await apiFetch('/api/admin/groups/reassign', {
      method: 'POST',
      token: session.token,
      body: { teamId, targetGroupId, reason },
    });
  },

  async adminRemoveTeamAllocation(teamId: string, reason: string): Promise<void> {
    const session = readSession(ADMIN_SESSION_KEY);
    if (!session?.token) throw new Error('Admin login required.');
    await apiFetch('/api/admin/groups/remove', {
      method: 'POST',
      token: session.token,
      body: { teamId, reason },
    });
  },
};