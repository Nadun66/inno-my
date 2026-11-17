import express from 'express';
import {
  ADMIN_PASSCODE,
  safeStringEqual,
  signSessionToken,
  verifySessionToken,
  type TokenPayload,
} from './auth';
import { PortalError, store } from './store';
import type { GroupId } from '../src/types/portal';

const app = express();
const PORT = Number(process.env.API_PORT || 3001);

app.use(express.json({ limit: '100kb' }));

// Attach basic security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function extractToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

function requireAuth(
    req: express.Request,
    role?: 'team_leader' | 'admin'
): TokenPayload {
  const token = extractToken(req);
  if (!token) {
    throw new PortalError(401, 'UNAUTHENTICATED', 'Authentication session required.');
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    throw new PortalError(401, 'INVALID_SESSION', 'Your session has expired. Please log in again.');
  }
  if (role && payload.role !== role) {
    throw new PortalError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
  }
  return payload;
}

function handleError(res: express.Response, err: unknown): void {
  if (err instanceof PortalError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[API ERROR]', err);
  res.status(500).json({ error: 'Internal server error.', code: 'INTERNAL_ERROR' });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'innohack-2026-portal-api', timestamp: new Date().toISOString() });
});

// Public non-sensitive arena stats (never returns credentials or Student IDs)
app.get('/api/public/status', (_req, res) => {
  try {
    res.json(store.getPublicStatus());
  } catch (err) {
    handleError(res, err);
  }
});

// Team Leader Login (Dual credential: Student ID + Unique Registration Code)
app.post('/api/auth/team-login', async (req, res) => {
  try {
    const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId : '';
    const registrationCode =
        typeof req.body?.registrationCode === 'string' ? req.body.registrationCode : '';
    const team = await store.authenticateTeamLeader(studentId, registrationCode);
    const token = signSessionToken({
      role: 'team_leader',
      teamId: team.teamId,
      studentId: team.studentId,
    });
    res.json({
      token,
      role: 'team_leader',
      teamId: team.teamId,
      studentId: team.studentId,
      snapshot: store.getTeamLeaderSnapshot(team.teamId),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Login
app.post('/api/auth/admin-login', (req, res) => {
  try {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!passcode || !safeStringEqual(passcode, ADMIN_PASSCODE)) {
      throw new PortalError(401, 'INVALID_ADMIN_PASSCODE', 'Invalid organizer passcode.');
    }
    const token = signSessionToken({ role: 'admin' });
    res.json({
      token,
      role: 'admin',
      snapshot: store.getAdminSnapshot(),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Team Leader Snapshot (scoped strictly to authenticated teamId)
app.get('/api/team/snapshot', (req, res) => {
  try {
    const auth = requireAuth(req, 'team_leader');
    res.json(store.getTeamLeaderSnapshot(auth.teamId!));
  } catch (err) {
    handleError(res, err);
  }
});

// Join Global FIFO Queue (server-authoritative atomic transaction)
app.post('/api/queue/join', async (req, res) => {
  try {
    const auth = requireAuth(req, 'team_leader');
    const result = await store.joinDrawQueue(auth.teamId!);
    res.json({
      ...result,
      snapshot: store.getTeamLeaderSnapshot(auth.teamId!),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Execute Server-Authoritative Spin (ACTIVE position #1 team only)
app.post('/api/draw/spin', async (req, res) => {
  try {
    const auth = requireAuth(req, 'team_leader');
    const result = await store.executeSpin(auth.teamId!);
    res.json({
      ...result,
      snapshot: store.getTeamLeaderSnapshot(auth.teamId!),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Presence Heartbeat (enables disconnect tracking without losing queue place)
app.post('/api/presence/heartbeat', async (req, res) => {
  try {
    const auth = requireAuth(req, 'team_leader');
    const result = await store.recordHeartbeat(auth.teamId!);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Full Snapshot
app.get('/api/admin/snapshot', (req, res) => {
  try {
    requireAuth(req, 'admin');
    res.json(store.getAdminSnapshot());
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Toggle Queue Admissions Pause
app.post('/api/admin/queue/pause', async (req, res) => {
  try {
    requireAuth(req, 'admin');
    const paused = Boolean(req.body?.paused);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const result = await store.adminToggleQueuePause(paused, reason);
    res.json({ ...result, snapshot: store.getAdminSnapshot() });
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Resolve Abandoned Active Session
app.post('/api/admin/queue/resolve-abandoned', async (req, res) => {
  try {
    requireAuth(req, 'admin');
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
    const action = req.body?.action === 'MOVE_TO_BACK' ? 'MOVE_TO_BACK' : 'RELEASE_TO_IDLE';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const result = await store.adminResolveAbandoned(teamId, action, reason);
    res.json({ ...result, snapshot: store.getAdminSnapshot() });
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Controlled Audited Group Reassignment
app.post('/api/admin/groups/reassign', async (req, res) => {
  try {
    requireAuth(req, 'admin');
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
    const targetGroupId = req.body?.targetGroupId as GroupId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const result = await store.adminControlledReassign(teamId, targetGroupId, reason);
    res.json({ ...result, snapshot: store.getAdminSnapshot() });
  } catch (err) {
    handleError(res, err);
  }
});

// Admin Delete / Reset Team Group Allocation
app.post('/api/admin/groups/remove', async (req, res) => {
  try {
    requireAuth(req, 'admin');
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const result = await store.adminRemoveTeamAllocation(teamId, reason);
    res.json({ ...result, snapshot: store.getAdminSnapshot() });
  } catch (err) {
    handleError(res, err);
  }
});

// Sandbox-only reset endpoint (requires admin auth + explicit phrase; disabled if NODE_ENV=production)
app.post('/api/admin/sandbox/reset', async (req, res) => {
  try {
    requireAuth(req, 'admin');
    if (process.env.DISABLE_SANDBOX_RESET === 'true') {
      throw new PortalError(403, 'RESET_DISABLED', 'Reset is disabled in live event mode.');
    }
    const confirmPhrase = typeof req.body?.confirmPhrase === 'string' ? req.body.confirmPhrase : '';
    const result = await store.adminResetForTesting(confirmPhrase);
    res.json({ ...result, snapshot: store.getAdminSnapshot() });
  } catch (err) {
    handleError(res, err);
  }
});

// Real-Time Server-Sent Events Stream (Mirrors Firestore onSnapshot push updates)
app.get('/api/stream', (req, res) => {
  let auth: TokenPayload;
  try {
    auth = requireAuth(req);
  } catch (err) {
    handleError(res, err);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendSnapshot = () => {
    try {
      const payload =
          auth.role === 'admin'
              ? store.getAdminSnapshot()
              : store.getTeamLeaderSnapshot(auth.teamId!);
      res.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Ignore write error on closed stream
    }
  };

  sendSnapshot();

  const onStateChanged = () => sendSnapshot();
  store.events.on('state-changed', onStateChanged);

  // Keepalive ping every 15s (also refreshes admin presence clock)
  const keepalive = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);
    if (auth.role === 'admin') {
      sendSnapshot();
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepalive);
    store.events.off('state-changed', onStateChanged);
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[INNOHACK 2026 API] Server-authoritative FIFO backend listening on http://127.0.0.1:${PORT}`);
});