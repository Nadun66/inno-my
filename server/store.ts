import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { AUTHORIZED_TEAMS } from '../functions/src/authorizedTeams';
import {
  hashRegistrationCode,
  maskRegistrationCode,
  maskStudentId,
  pickUniformGroup,
  verifyRegistrationCode,
} from './auth';
import type {
  AdminSnapshot,
  AuditLogEntry,
  DrawHistoryEntry,
  EventSettings,
  GroupId,
  GroupRecord,
  JoinQueueResult,
  PublicArenaStatus,
  QueueEntry,
  SpinResult,
  TeamLeaderSnapshot,
  TeamRecord,
} from '../src/types/portal';

// Initialize Firebase Admin SDK using serviceAccountKey.json
const SERVICE_ACCOUNT_PATH = path.resolve(process.cwd(), 'server', 'serviceAccountKey.json');
let firestoreDb: Firestore | null = null;

if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    firestoreDb = getFirestore();
    console.log('[FIREBASE] Connected to Firestore Database:', serviceAccount.project_id);
  } catch (err: unknown) {
    console.error('[FIREBASE] Failed to initialize Firebase Admin:', err);
  }
} else {
  console.warn('[FIREBASE] serviceAccountKey.json not found in server/ folder. Running local-only.');
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const GROUP_IDS: GroupId[] = ['GROUP_A', 'GROUP_B', 'GROUP_C'];
const MAX_GROUP_CAPACITY = 10;
const TOTAL_REGISTERED_TEAMS = 30;

interface StoredCredential {
  teamId: string;
  studentId: string;
  salt: string;
  registrationCodeHash: string;
}

interface DatabaseSchema {
  teamCredentials: Record<string, StoredCredential>;
  teams: Record<string, TeamRecord>;
  drawQueue: Record<string, QueueEntry>;
  groups: Record<GroupId, GroupRecord>;
  drawHistory: DrawHistoryEntry[];
  eventSettings: EventSettings;
  auditLogs: AuditLogEntry[];
}

export class PortalError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => nextLock);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildFreshDatabase(): DatabaseSchema {
  const uniqueIds = new Set(AUTHORIZED_TEAMS.map((t) => t.studentId));
  const uniqueCodes = new Set(AUTHORIZED_TEAMS.map((t) => t.registrationCode));
  if (
      AUTHORIZED_TEAMS.length !== TOTAL_REGISTERED_TEAMS ||
      uniqueIds.size !== TOTAL_REGISTERED_TEAMS ||
      uniqueCodes.size !== TOTAL_REGISTERED_TEAMS
  ) {
    throw new Error('Authorized team seed integrity failure: expected 30 unique records.');
  }

  const ts = nowIso();
  const teamCredentials: Record<string, StoredCredential> = {};
  const teams: Record<string, TeamRecord> = {};

  for (const seed of AUTHORIZED_TEAMS) {
    const salt = crypto.randomBytes(16).toString('hex');
    teamCredentials[seed.teamId] = {
      teamId: seed.teamId,
      studentId: seed.studentId,
      salt,
      registrationCodeHash: hashRegistrationCode(seed.studentId, seed.registrationCode, salt),
    };

    teams[seed.teamId] = {
      teamId: seed.teamId,
      studentId: seed.studentId,
      maskedRegistrationCode: maskRegistrationCode(seed.registrationCode),
      teamName: seed.teamName,
      teamLeader: `Leader · ${seed.teamId}`,
      authenticationStatus: 'NOT_AUTHENTICATED',
      queueStatus: 'NOT_JOINED',
      queueNumber: null,
      activeQueueEntryId: null,
      assignedGroup: null,
      assignedGroupName: null,
      drawCompleted: false,
      drawOrder: null,
      allocatedAt: null,
      lastLoginAt: null,
      lastSeenAt: null,
    };
  }

  const groups: Record<GroupId, GroupRecord> = {
    GROUP_A: {
      groupId: 'GROUP_A',
      groupName: 'Group A',
      maxCapacity: MAX_GROUP_CAPACITY,
      teamCount: 0,
      teamIds: [],
    },
    GROUP_B: {
      groupId: 'GROUP_B',
      groupName: 'Group B',
      maxCapacity: MAX_GROUP_CAPACITY,
      teamCount: 0,
      teamIds: [],
    },
    GROUP_C: {
      groupId: 'GROUP_C',
      groupName: 'Group C',
      maxCapacity: MAX_GROUP_CAPACITY,
      teamCount: 0,
      teamIds: [],
    },
  };

  return {
    teamCredentials,
    teams,
    drawQueue: {},
    groups,
    drawHistory: [],
    eventSettings: {
      eventStatus: 'LIVE',
      queueStatus: 'IDLE',
      queuePaused: false,
      queuePausedAt: null,
      currentActiveTeamId: null,
      lastQueueSequence: 0,
      totalTeams: TOTAL_REGISTERED_TEAMS,
      completedDraws: 0,
      initializedAt: ts,
    },
    auditLogs: [
      {
        logId: `LOG_${Date.now()}_INIT`,
        action: 'SYSTEM_INITIALIZED',
        actor: 'SYSTEM',
        teamId: null,
        details:
            'INNOHACK Season 2026 live allocation store initialized with 30 hashed team credentials and 3 groups (10 slots each).',
        timestamp: ts,
      },
    ],
  };
}

class ServerAuthoritativeStore {
  private db: DatabaseSchema;
  private mutex = new AsyncMutex();
  public events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(200);
    this.db = this.loadOrInitialize();
  }

  private loadOrInitialize(): DatabaseSchema {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (
            parsed &&
            parsed.teams &&
            Object.keys(parsed.teams).length === TOTAL_REGISTERED_TEAMS &&
            parsed.teamCredentials &&
            parsed.groups &&
            parsed.eventSettings
        ) {
          this.syncToFirestore(parsed, true);
          return parsed;
        }
      } catch {
        // Fallback to fresh store if file is unreadable
      }
    }
    const fresh = buildFreshDatabase();
    this.persist(fresh, true);
    return fresh;
  }

  private persist(data: DatabaseSchema = this.db, syncAll = false): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
    this.syncToFirestore(data, syncAll);
  }

  private syncToFirestore(data: DatabaseSchema, syncAll = false): void {
    if (!firestoreDb) return;

    const batch = firestoreDb.batch();

    // 1. Sync eventSettings
    batch.set(firestoreDb.collection('eventSettings').doc('global'), data.eventSettings);

    // 2. Sync groups
    for (const gid of GROUP_IDS) {
      batch.set(firestoreDb.collection('groups').doc(gid), data.groups[gid]);
    }

    // 3. Sync teams
    for (const team of Object.values(data.teams)) {
      batch.set(firestoreDb.collection('teams').doc(team.teamId), team);
    }

    // 4. Sync drawHistory
    for (const draw of data.drawHistory) {
      batch.set(firestoreDb.collection('drawHistory').doc(draw.drawId), draw);
    }

    // 5. Sync active/recent queue entries
    for (const q of Object.values(data.drawQueue)) {
      batch.set(firestoreDb.collection('drawQueue').doc(q.queueEntryId), q);
    }

    // 6. Sync latest audit log (or all on init)
    const logsToSync = syncAll ? data.auditLogs.slice(0, 50) : data.auditLogs.slice(0, 1);
    for (const log of logsToSync) {
      batch.set(firestoreDb.collection('auditLogs').doc(log.logId), log);
    }

    batch.commit().catch((err: unknown) => {
      console.error('[FIREBASE SYNC ERROR]', err);
    });
  }

  private appendAudit(action: string, actor: string, teamId: string | null, details: string): void {
    this.db.auditLogs.unshift({
      logId: `LOG_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      action,
      actor,
      teamId,
      details,
      timestamp: nowIso(),
    });
    if (this.db.auditLogs.length > 500) {
      this.db.auditLogs.length = 500;
    }
  }

  private broadcastUpdate(reason: string): void {
    this.events.emit('state-changed', { reason, timestamp: nowIso() });
  }

  // --------------------------------------------------------------------------
  // PUBLIC STATUS
  // --------------------------------------------------------------------------
  getPublicStatus(): PublicArenaStatus {
    const activeQueueCount = Object.values(this.db.drawQueue).filter(
        (q) => q.status === 'ACTIVE' || q.status === 'WAITING'
    ).length;

    return {
      eventStatus: this.db.eventSettings.eventStatus,
      queuePaused: this.db.eventSettings.queuePaused,
      totalTeams: this.db.eventSettings.totalTeams,
      completedDraws: this.db.eventSettings.completedDraws,
      activeQueueCount,
      groups: GROUP_IDS.map((gid) => ({
        groupId: gid,
        groupName: this.db.groups[gid].groupName,
        teamCount: this.db.groups[gid].teamCount,
        maxCapacity: this.db.groups[gid].maxCapacity,
      })),
    };
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION: DUAL CREDENTIAL VALIDATION
  // --------------------------------------------------------------------------
  async authenticateTeamLeader(studentId: string, registrationCode: string): Promise<TeamRecord> {
    const cleanStudentId = studentId.trim();
    const cleanCode = registrationCode.trim().toUpperCase();

    if (!cleanStudentId || !cleanCode) {
      throw new PortalError(
          400,
          'MISSING_CREDENTIALS',
          'Both Student ID Number and Unique Registration Code are required.'
      );
    }

    return this.mutex.runExclusive(() => {
      const cred = Object.values(this.db.teamCredentials).find(
          (c) => c.studentId === cleanStudentId
      );

      if (!cred) {
        this.appendAudit(
            'LOGIN_FAILED',
            cleanStudentId,
            null,
            'Unrecognized Student ID attempted login.'
        );
        this.persist();
        throw new PortalError(
            401,
            'INVALID_CREDENTIALS',
            'Invalid credentials. Please verify your Student ID Number and Registration Code.'
        );
      }

      const valid = verifyRegistrationCode(
          cleanStudentId,
          cleanCode,
          cred.salt,
          cred.registrationCodeHash
      );

      if (!valid) {
        this.appendAudit(
            'LOGIN_FAILED',
            cleanStudentId,
            cred.teamId,
            'Mismatched Registration Code submitted for registered Student ID.'
        );
        this.persist();
        throw new PortalError(
            401,
            'INVALID_CREDENTIALS',
            'Invalid credentials. Student ID and Registration Code must match the same registered team.'
        );
      }

      const ts = nowIso();
      const team = this.db.teams[cred.teamId];
      team.authenticationStatus = 'AUTHENTICATED';
      team.lastLoginAt = ts;
      team.lastSeenAt = ts;

      if (team.activeQueueEntryId && this.db.drawQueue[team.activeQueueEntryId]) {
        this.db.drawQueue[team.activeQueueEntryId].lastHeartbeatAt = ts;
      }

      this.appendAudit(
          'TEAM_LOGIN',
          team.studentId,
          team.teamId,
          'Authenticated team leader entered the portal.'
      );
      this.persist();
      this.broadcastUpdate('team-login');
      return { ...team };
    });
  }

  // --------------------------------------------------------------------------
  // SNAPSHOTS
  // --------------------------------------------------------------------------
  getTeamLeaderSnapshot(teamId: string): TeamLeaderSnapshot {
    const team = this.db.teams[teamId];
    if (!team) {
      throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team record not found.');
    }

    const activeQueue = Object.values(this.db.drawQueue)
        .filter((q) => q.status === 'ACTIVE' || q.status === 'WAITING')
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        .map((q) => ({
          ...q,
          studentId: q.teamId === teamId ? team.studentId : undefined,
        }));

    const recentDraws = [...this.db.drawHistory]
        .sort((a, b) => b.drawOrder - a.drawOrder)
        .slice(0, 12)
        .map((d) => ({
          ...d,
          studentId: d.teamId === teamId ? d.studentId : undefined,
        }));

    return {
      team: { ...team },
      activeQueue,
      groups: GROUP_IDS.map((gid) => ({
        ...this.db.groups[gid],
        teamIds: [...this.db.groups[gid].teamIds],
      })),
      eventSettings: { ...this.db.eventSettings },
      recentDraws,
      serverTime: nowIso(),
    };
  }

  getAdminSnapshot(): AdminSnapshot {
    const teams = Object.values(this.db.teams).sort((a, b) =>
        a.teamId.localeCompare(b.teamId)
    );
    const queueEntries = Object.values(this.db.drawQueue)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        .map((q) => ({
          ...q,
          studentId: this.db.teams[q.teamId]?.studentId,
        }));

    return {
      teams: teams.map((t) => ({ ...t })),
      queueEntries,
      groups: GROUP_IDS.map((gid) => ({
        ...this.db.groups[gid],
        teamIds: [...this.db.groups[gid].teamIds],
      })),
      drawHistory: [...this.db.drawHistory].sort((a, b) => a.drawOrder - b.drawOrder),
      eventSettings: { ...this.db.eventSettings },
      auditLogs: [...this.db.auditLogs],
      serverTime: nowIso(),
    };
  }

  // --------------------------------------------------------------------------
  // ATOMIC FIFO QUEUE ADMISSION
  // --------------------------------------------------------------------------
  async joinDrawQueue(teamId: string): Promise<JoinQueueResult> {
    return this.mutex.runExclusive(() => {
      const team = this.db.teams[teamId];
      if (!team) {
        throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team record not found.');
      }

      const settings = this.db.eventSettings;
      if (settings.eventStatus === 'COMPLETED' || settings.completedDraws >= TOTAL_REGISTERED_TEAMS) {
        throw new PortalError(
            409,
            'EVENT_COMPLETED',
            'All 30 teams have already completed their group allocations.'
        );
      }

      if (settings.queuePaused) {
        throw new PortalError(
            423,
            'QUEUE_PAUSED',
            'New queue admissions are currently paused by the Hackathon Organizers.'
        );
      }

      if (team.drawCompleted) {
        throw new PortalError(
            409,
            'DRAW_ALREADY_COMPLETED',
            `Your squad has already completed its draw (${team.assignedGroupName}).`
        );
      }

      const existingEntry = Object.values(this.db.drawQueue).find(
          (q) => q.teamId === teamId && (q.status === 'WAITING' || q.status === 'ACTIVE')
      );

      if (existingEntry || team.queueStatus === 'WAITING' || team.queueStatus === 'ACTIVE') {
        throw new PortalError(
            409,
            'ALREADY_IN_QUEUE',
            'You are already in the live FIFO queue. Duplicate queue entries are blocked.'
        );
      }

      const ts = nowIso();
      const nextSequence = settings.lastQueueSequence + 1;
      const becomesActive = settings.currentActiveTeamId === null;
      const status: 'ACTIVE' | 'WAITING' = becomesActive ? 'ACTIVE' : 'WAITING';
      const queueEntryId = `Q${String(nextSequence).padStart(4, '0')}_${teamId}`;

      this.db.drawQueue[queueEntryId] = {
        queueEntryId,
        teamId,
        teamName: team.teamName,
        maskedStudentId: maskStudentId(team.studentId),
        sequenceNumber: nextSequence,
        status,
        joinedAt: ts,
        activatedAt: becomesActive ? ts : null,
        completedAt: null,
        lastHeartbeatAt: ts,
      };
      team.queueStatus = status;
      team.queueNumber = nextSequence;
      team.activeQueueEntryId = queueEntryId;
      team.lastSeenAt = ts;

      settings.lastQueueSequence = nextSequence;
      if (becomesActive) {
        settings.currentActiveTeamId = teamId;
      }
      settings.queueStatus = 'ACTIVE';

      this.appendAudit(
          'QUEUE_JOINED',
          team.studentId,
          teamId,
          `Joined global FIFO queue at sequence #${nextSequence} (${status}).`
      );
      this.persist();
      this.broadcastUpdate('queue-joined');

      return { queueEntryId, sequenceNumber: nextSequence, status };
    });
  }

  // --------------------------------------------------------------------------
  // ATOMIC SERVER-AUTHORITATIVE SPIN
  // --------------------------------------------------------------------------
  async executeSpin(teamId: string): Promise<SpinResult> {
    return this.mutex.runExclusive(() => {
      const team = this.db.teams[teamId];
      if (!team) {
        throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team record not found.');
      }

      const settings = this.db.eventSettings;

      if (team.drawCompleted) {
        throw new PortalError(
            409,
            'DRAW_ALREADY_COMPLETED',
            'Repeated spins are strictly prohibited. Your allocation is permanently locked.'
        );
      }

      if (settings.currentActiveTeamId !== teamId || team.queueStatus !== 'ACTIVE') {
        throw new PortalError(
            403,
            'NOT_YOUR_TURN',
            'Only the position #1 ACTIVE team leader in the FIFO queue can start the spin.'
        );
      }

      const eligibleGroups = GROUP_IDS.map((gid) => this.db.groups[gid]).filter(
          (g) => g.teamCount < g.maxCapacity
      );

      if (eligibleGroups.length === 0) {
        throw new PortalError(
            409,
            'ALL_GROUPS_FULL',
            'All groups have reached their 10-team maximum capacity.'
        );
      }

      const chosenGroup = pickUniformGroup(eligibleGroups);
      const ts = nowIso();
      const drawOrder = settings.completedDraws + 1;
      const activeEntry = team.activeQueueEntryId
          ? this.db.drawQueue[team.activeQueueEntryId]
          : null;
      const sequenceNumber = team.queueNumber ?? activeEntry?.sequenceNumber ?? drawOrder;
      const drawId = `DRAW_${String(drawOrder).padStart(2, '0')}_${teamId}`;

      chosenGroup.teamIds.push(teamId);
      chosenGroup.teamCount = chosenGroup.teamIds.length;

      team.assignedGroup = chosenGroup.groupId;
      team.assignedGroupName = chosenGroup.groupName;
      team.drawCompleted = true;
      team.drawOrder = drawOrder;
      team.queueStatus = 'COMPLETED';
      team.activeQueueEntryId = null;
      team.allocatedAt = ts;
      team.lastSeenAt = ts;

      if (activeEntry) {
        activeEntry.status = 'COMPLETED';
        activeEntry.completedAt = ts;
        activeEntry.assignedGroup = chosenGroup.groupId;
      }

      this.db.drawHistory.push({
        drawId,
        teamId,
        teamName: team.teamName,
        studentId: team.studentId,
        maskedStudentId: maskStudentId(team.studentId),
        maskedRegistrationCode: team.maskedRegistrationCode,
        sequenceNumber,
        drawOrder,
        assignedGroup: chosenGroup.groupId,
        assignedGroupName: chosenGroup.groupName,
        timestamp: ts,
        status: 'CONFIRMED',
      });

      const nextWaiting = Object.values(this.db.drawQueue)
          .filter((q) => q.status === 'WAITING')
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];

      if (nextWaiting) {
        nextWaiting.status = 'ACTIVE';
        nextWaiting.activatedAt = ts;
        const nextTeam = this.db.teams[nextWaiting.teamId];
        if (nextTeam) {
          nextTeam.queueStatus = 'ACTIVE';
        }
        settings.currentActiveTeamId = nextWaiting.teamId;
      } else {
        settings.currentActiveTeamId = null;
      }

      settings.completedDraws = drawOrder;
      const allDone = drawOrder >= TOTAL_REGISTERED_TEAMS;
      settings.eventStatus = allDone ? 'COMPLETED' : 'LIVE';
      settings.queueStatus = allDone
          ? 'COMPLETED'
          : settings.currentActiveTeamId
              ? 'ACTIVE'
              : 'IDLE';

      this.appendAudit(
          'DRAW_COMPLETED',
          team.studentId,
          teamId,
          `Draw #${drawOrder} locked -> ${chosenGroup.groupName} (${chosenGroup.teamCount}/10). Eligible pool: [${eligibleGroups
              .map((g) => g.groupName)
              .join(', ')}]. Next active: ${settings.currentActiveTeamId ?? 'NONE'}.`
      );
      this.persist();
      this.broadcastUpdate('draw-completed');

      return {
        drawId,
        teamId,
        assignedGroup: chosenGroup.groupId,
        assignedGroupName: chosenGroup.groupName,
        drawOrder,
        sequenceNumber,
        allocatedAt: ts,
      };
    });
  }

  // --------------------------------------------------------------------------
  // PRESENCE HEARTBEAT
  // --------------------------------------------------------------------------
  async recordHeartbeat(teamId: string): Promise<{ ok: true; timestamp: string }> {
    return this.mutex.runExclusive(() => {
      const team = this.db.teams[teamId];
      if (!team) {
        throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }
      const ts = nowIso();
      team.lastSeenAt = ts;
      if (team.activeQueueEntryId && this.db.drawQueue[team.activeQueueEntryId]) {
        this.db.drawQueue[team.activeQueueEntryId].lastHeartbeatAt = ts;
      }
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpPath = `${STORE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.db, null, 2), 'utf8');
      fs.renameSync(tmpPath, STORE_PATH);
      return { ok: true, timestamp: ts };
    });
  }

  // --------------------------------------------------------------------------
  // ADMIN CONTROLS
  // --------------------------------------------------------------------------
  async adminToggleQueuePause(paused: boolean, reason: string): Promise<{ queuePaused: boolean }> {
    return this.mutex.runExclusive(() => {
      const ts = nowIso();
      this.db.eventSettings.queuePaused = paused;
      this.db.eventSettings.queuePausedAt = paused ? ts : null;
      this.appendAudit(
          paused ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED',
          'ADMIN',
          null,
          reason.trim() ||
          (paused
              ? 'Organizer paused new FIFO queue admissions.'
              : 'Organizer resumed FIFO queue admissions.')
      );
      this.persist();
      this.broadcastUpdate('queue-pause-toggled');
      return { queuePaused: paused };
    });
  }

  async adminResolveAbandoned(
      targetTeamId: string,
      action: 'MOVE_TO_BACK' | 'RELEASE_TO_IDLE',
      reason: string
  ): Promise<{ resolvedTeamId: string; action: string; nextActiveTeamId: string | null }> {
    if (!reason.trim()) {
      throw new PortalError(400, 'REASON_REQUIRED', 'An audit reason is required for admin queue actions.');
    }

    return this.mutex.runExclusive(() => {
      const settings = this.db.eventSettings;
      const team = this.db.teams[targetTeamId];
      if (!team) {
        throw new PortalError(404, 'TEAM_NOT_FOUND', 'Target team not found.');
      }
      if (team.drawCompleted) {
        throw new PortalError(
            409,
            'DRAW_LOCKED',
            'Cannot resolve queue for a team that has already completed its draw.'
        );
      }
      if (settings.currentActiveTeamId !== targetTeamId || team.queueStatus !== 'ACTIVE') {
        throw new PortalError(
            409,
            'NOT_ACTIVE',
            'Target team is not the currently active spinner.'
        );
      }

      const nextWaiting = Object.values(this.db.drawQueue)
          .filter((q) => q.status === 'WAITING')
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];

      if (action === 'MOVE_TO_BACK' && !nextWaiting) {
        throw new PortalError(
            409,
            'NO_WAITING_TEAMS',
            'No other teams are waiting in queue. Use "Release from Active Queue" instead.'
        );
      }

      const ts = nowIso();
      if (team.activeQueueEntryId && this.db.drawQueue[team.activeQueueEntryId]) {
        this.db.drawQueue[team.activeQueueEntryId].status =
            action === 'MOVE_TO_BACK' ? 'REQUEUED' : 'ABANDONED_RELEASED';
        this.db.drawQueue[team.activeQueueEntryId].completedAt = ts;
      }

      if (action === 'MOVE_TO_BACK') {
        settings.lastQueueSequence += 1;
        const newSeq = settings.lastQueueSequence;
        const newEntryId = `Q${String(newSeq).padStart(4, '0')}_${targetTeamId}`;
        this.db.drawQueue[newEntryId] = {
          queueEntryId: newEntryId,
          teamId: targetTeamId,
          teamName: team.teamName,
          maskedStudentId: maskStudentId(team.studentId),
          sequenceNumber: newSeq,
          status: 'WAITING',
          joinedAt: ts,
          activatedAt: null,
          completedAt: null,
          lastHeartbeatAt: team.lastSeenAt,
        };
        team.queueStatus = 'WAITING';
        team.queueNumber = newSeq;
        team.activeQueueEntryId = newEntryId;
      } else {
        team.queueStatus = 'NOT_JOINED';
        team.queueNumber = null;
        team.activeQueueEntryId = null;
      }

      if (nextWaiting) {
        nextWaiting.status = 'ACTIVE';
        nextWaiting.activatedAt = ts;
        const nextTeam = this.db.teams[nextWaiting.teamId];
        if (nextTeam) nextTeam.queueStatus = 'ACTIVE';
        settings.currentActiveTeamId = nextWaiting.teamId;
        settings.queueStatus = 'ACTIVE';
      } else {
        settings.currentActiveTeamId = null;
        settings.queueStatus = 'IDLE';
      }

      this.appendAudit(
          `ADMIN_ABANDONED_${action}`,
          'ADMIN',
          targetTeamId,
          `Reason: ${reason.trim()}. Next active: ${settings.currentActiveTeamId ?? 'NONE'}.`
      );
      this.persist();
      this.broadcastUpdate('admin-resolved-abandoned');

      return {
        resolvedTeamId: targetTeamId,
        action,
        nextActiveTeamId: settings.currentActiveTeamId,
      };
    });
  }

  async adminControlledReassign(
      teamId: string,
      targetGroupId: GroupId,
      reason: string
  ): Promise<{ teamId: string; oldGroupId: GroupId; newGroupId: GroupId }> {
    if (!reason.trim()) {
      throw new PortalError(400, 'REASON_REQUIRED', 'An audit reason is required for group reassignment.');
    }
    if (!GROUP_IDS.includes(targetGroupId)) {
      throw new PortalError(400, 'INVALID_GROUP', 'Invalid target group.');
    }

    return this.mutex.runExclusive(() => {
      const team = this.db.teams[teamId];
      if (!team) throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      if (!team.drawCompleted || !team.assignedGroup) {
        throw new PortalError(409, 'NOT_DRAWN', 'Only completed allocations can be reassigned.');
      }
      const oldGroupId = team.assignedGroup;
      if (oldGroupId === targetGroupId) {
        throw new PortalError(409, 'SAME_GROUP', 'Team is already assigned to that group.');
      }

      const oldGroup = this.db.groups[oldGroupId];
      const newGroup = this.db.groups[targetGroupId];

      if (newGroup.teamCount >= newGroup.maxCapacity) {
        throw new PortalError(
            409,
            'TARGET_GROUP_FULL',
            `${newGroup.groupName} is already at maximum capacity (10/10).`
        );
      }

      oldGroup.teamIds = oldGroup.teamIds.filter((id) => id !== teamId);
      oldGroup.teamCount = oldGroup.teamIds.length;
      newGroup.teamIds.push(teamId);
      newGroup.teamCount = newGroup.teamIds.length;

      team.assignedGroup = targetGroupId;
      team.assignedGroupName = newGroup.groupName;

      const hist = this.db.drawHistory.find((h) => h.teamId === teamId);
      if (hist) {
        hist.assignedGroup = targetGroupId;
        hist.assignedGroupName = newGroup.groupName;
      }

      this.appendAudit(
          'ADMIN_CONTROLLED_REASSIGN',
          'ADMIN',
          teamId,
          `Reassigned ${teamId} from ${oldGroup.groupName} to ${newGroup.groupName}. Reason: ${reason.trim()}`
      );
      this.persist();
      this.broadcastUpdate('admin-reassign');

      return { teamId, oldGroupId, newGroupId: targetGroupId };
    });
  }

  async adminRemoveTeamAllocation(
      teamId: string,
      reason: string
  ): Promise<{ teamId: string; removedGroupId: GroupId }> {
    if (!reason.trim()) {
      throw new PortalError(400, 'REASON_REQUIRED', 'An audit reason is required to delete an allocation.');
    }

    return this.mutex.runExclusive(() => {
      const team = this.db.teams[teamId];
      if (!team) throw new PortalError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      if (!team.drawCompleted || !team.assignedGroup) {
        throw new PortalError(409, 'NOT_DRAWN', 'This team has not completed a group allocation yet.');
      }

      const oldGroupId = team.assignedGroup;
      const oldGroup = this.db.groups[oldGroupId];

      // 1. Remove team from group
      oldGroup.teamIds = oldGroup.teamIds.filter((id) => id !== teamId);
      oldGroup.teamCount = oldGroup.teamIds.length;

      // 2. Remove from drawHistory & delete from Firestore drawHistory collection
      const removedDraws = this.db.drawHistory.filter((h) => h.teamId === teamId);
      this.db.drawHistory = this.db.drawHistory.filter((h) => h.teamId !== teamId);
      if (firestoreDb) {
        for (const d of removedDraws) {
          firestoreDb.collection('drawHistory').doc(d.drawId).delete().catch((err: unknown) => {
            console.error('[FIREBASE DELETE DRAW ERROR]', err);
          });
        }
      }

      // 3. Reset team state so they can rejoin the queue & spin again
      team.assignedGroup = null;
      team.assignedGroupName = null;
      team.drawCompleted = false;
      team.drawOrder = null;
      team.allocatedAt = null;
      team.queueStatus = 'NOT_JOINED';
      team.queueNumber = null;
      team.activeQueueEntryId = null;

      // 4. Recalculate completed draws & event status
      this.db.eventSettings.completedDraws = this.db.drawHistory.length;
      if (this.db.eventSettings.completedDraws < TOTAL_REGISTERED_TEAMS) {
        this.db.eventSettings.eventStatus = 'LIVE';
      }

      this.appendAudit(
          'ADMIN_ALLOCATION_DELETED',
          'ADMIN',
          teamId,
          `Deleted ${teamId} allocation from ${oldGroup.groupName} and reset team for re-draw. Reason: ${reason.trim()}`
      );
      this.persist();
      this.broadcastUpdate('admin-allocation-deleted');

      return { teamId, removedGroupId: oldGroupId };
    });
  }

  async adminResetForTesting(confirmPhrase: string): Promise<{ reset: true }> {
    if (confirmPhrase !== 'RESET-INNOHACK-SANDBOX') {
      throw new PortalError(400, 'INVALID_CONFIRM', 'Confirmation phrase mismatch.');
    }
    return this.mutex.runExclusive(() => {
      this.db = buildFreshDatabase();
      this.persist(this.db, true);
      this.broadcastUpdate('sandbox-reset');
      return { reset: true };
    });
  }
}

export const store = new ServerAuthoritativeStore();