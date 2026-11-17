import { signInWithCustomToken, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../config/firebase';
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
  SessionInfo,
  SpinResult,
  TeamLeaderSnapshot,
  TeamRecord,
} from '../types/portal';

const TEAM_SESSION_KEY = 'innohack26_fb_team_session';
const ADMIN_SESSION_KEY = 'innohack26_fb_admin_session';

function assertFirebase() {
  if (!auth || !db || !functions) {
    throw new Error('Firebase is not initialized. Check your VITE_FIREBASE_* environment variables.');
  }
  return { auth, db, functions };
}

function readStored(key: string): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SessionInfo) : null;
  } catch {
    return null;
  }
}

export const firebasePortalService = {
  getTeamSession(): SessionInfo | null {
    return readStored(TEAM_SESSION_KEY);
  },

  getAdminSession(): SessionInfo | null {
    return readStored(ADMIN_SESSION_KEY);
  },

  clearTeamSession(): void {
    sessionStorage.removeItem(TEAM_SESSION_KEY);
    if (auth) void signOut(auth);
  },

  clearAdminSession(): void {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (auth) void signOut(auth);
  },

  async getPublicStatus(): Promise<PublicArenaStatus> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable<undefined, PublicArenaStatus>(fns, 'getPublicStatus');
    const res = await fn();
    return res.data;
  },

  async teamLeaderLogin(
    studentId: string,
    registrationCode: string
  ): Promise<{ session: SessionInfo; snapshot?: TeamLeaderSnapshot }> {
    const { auth: fbAuth, functions: fns } = assertFirebase();
    const fn = httpsCallable<
      { studentId: string; registrationCode: string },
      { customToken: string; teamId: string }
    >(fns, 'teamLeaderLogin');

    const res = await fn({ studentId, registrationCode });
    await signInWithCustomToken(fbAuth, res.data.customToken);

    const session: SessionInfo = {
      role: 'team_leader',
      token: res.data.customToken,
      teamId: res.data.teamId,
      studentId: studentId.trim(),
    };
    sessionStorage.setItem(TEAM_SESSION_KEY, JSON.stringify(session));
    return { session };
  },

  async adminLogin(passcode: string): Promise<{ session: SessionInfo; snapshot?: AdminSnapshot }> {
    const { auth: fbAuth, functions: fns } = assertFirebase();
    const fn = httpsCallable<{ passcode: string }, { customToken: string }>(fns, 'adminLogin');
    const res = await fn({ passcode });
    await signInWithCustomToken(fbAuth, res.data.customToken);

    const session: SessionInfo = {
      role: 'admin',
      token: res.data.customToken,
    };
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    return { session };
  },

  async joinDrawQueue(): Promise<JoinQueueResult> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable<undefined, JoinQueueResult>(fns, 'joinDrawQueue');
    const res = await fn();
    return res.data;
  },

  async executeSpin(): Promise<SpinResult> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable<undefined, SpinResult>(fns, 'executeSpin');
    const res = await fn();
    return res.data;
  },

  async sendHeartbeat(): Promise<void> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable(fns, 'updateHeartbeat');
    await fn();
  },

  subscribeTeamSnapshot(
    onData: (snapshot: TeamLeaderSnapshot) => void,
    onConnectionChange: (connected: boolean) => void,
    onAuthError: () => void
  ): () => void {
    const { db: firestore } = assertFirebase();
    const session = readStored(TEAM_SESSION_KEY);
    if (!session?.teamId) {
      onAuthError();
      return () => {};
    }

    const teamId = session.teamId;
    let team: TeamRecord | null = null;
    let activeQueue: QueueEntry[] = [];
    let groups: GroupRecord[] = [];
    let eventSettings: EventSettings | null = null;
    let recentDraws: DrawHistoryEntry[] = [];

    const emit = () => {
      if (team && eventSettings) {
        onConnectionChange(true);
        onData({
          team,
          activeQueue,
          groups,
          eventSettings,
          recentDraws,
          serverTime: new Date().toISOString(),
        });
      }
    };

    const unsubs: Unsubscribe[] = [];

    unsubs.push(
      onSnapshot(
        doc(firestore, 'teams', teamId),
        (snap) => {
          if (snap.exists()) {
            team = snap.data() as TeamRecord;
            emit();
          }
        },
        () => onAuthError()
      )
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(firestore, 'drawQueue'),
          where('status', 'in', ['ACTIVE', 'WAITING']),
          orderBy('sequenceNumber', 'asc')
        ),
        (snap) => {
          activeQueue = snap.docs.map((d) => d.data() as QueueEntry);
          emit();
        },
        () => onConnectionChange(false)
      )
    );

    unsubs.push(
      onSnapshot(collection(firestore, 'groups'), (snap) => {
        groups = snap.docs
          .map((d) => d.data() as GroupRecord)
          .sort((a, b) => a.groupId.localeCompare(b.groupId));
        emit();
      })
    );

    unsubs.push(
      onSnapshot(doc(firestore, 'eventSettings', 'live'), (snap) => {
        if (snap.exists()) {
          eventSettings = snap.data() as EventSettings;
          emit();
        }
      })
    );

    unsubs.push(
      onSnapshot(
        query(collection(firestore, 'drawHistory'), orderBy('drawOrder', 'desc'), limit(12)),
        (snap) => {
          recentDraws = snap.docs.map((d) => d.data() as DrawHistoryEntry);
          emit();
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  },

  subscribeAdminSnapshot(
    onData: (snapshot: AdminSnapshot) => void,
    onConnectionChange: (connected: boolean) => void,
    onAuthError: () => void
  ): () => void {
    const { db: firestore } = assertFirebase();
    let teams: TeamRecord[] = [];
    let queueEntries: QueueEntry[] = [];
    let groups: GroupRecord[] = [];
    let drawHistory: DrawHistoryEntry[] = [];
    let eventSettings: EventSettings | null = null;
    let auditLogs: AuditLogEntry[] = [];

    const emit = () => {
      if (eventSettings) {
        onConnectionChange(true);
        onData({
          teams,
          queueEntries,
          groups,
          drawHistory,
          eventSettings,
          auditLogs,
          serverTime: new Date().toISOString(),
        });
      }
    };

    const unsubs: Unsubscribe[] = [];

    unsubs.push(
      onSnapshot(
        collection(firestore, 'teams'),
        (snap) => {
          teams = snap.docs
            .map((d) => d.data() as TeamRecord)
            .sort((a, b) => a.teamId.localeCompare(b.teamId));
          emit();
        },
        () => onAuthError()
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(firestore, 'drawQueue'), orderBy('sequenceNumber', 'asc')),
        (snap) => {
          queueEntries = snap.docs.map((d) => d.data() as QueueEntry);
          emit();
        }
      )
    );

    unsubs.push(
      onSnapshot(collection(firestore, 'groups'), (snap) => {
        groups = snap.docs
          .map((d) => d.data() as GroupRecord)
          .sort((a, b) => a.groupId.localeCompare(b.groupId));
        emit();
      })
    );

    unsubs.push(
      onSnapshot(
        query(collection(firestore, 'drawHistory'), orderBy('drawOrder', 'asc')),
        (snap) => {
          drawHistory = snap.docs.map((d) => d.data() as DrawHistoryEntry);
          emit();
        }
      )
    );

    unsubs.push(
      onSnapshot(doc(firestore, 'eventSettings', 'live'), (snap) => {
        if (snap.exists()) {
          eventSettings = snap.data() as EventSettings;
          emit();
        }
      })
    );

    unsubs.push(
      onSnapshot(
        query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200)),
        (snap) => {
          auditLogs = snap.docs.map((d) => ({
            logId: d.id,
            ...(d.data() as Omit<AuditLogEntry, 'logId'>),
          }));
          emit();
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  },

  async adminToggleQueuePause(paused: boolean, reason: string): Promise<void> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable(fns, 'adminToggleQueuePause');
    await fn({ paused, reason });
  },

  async adminResolveAbandoned(
    teamId: string,
    action: 'MOVE_TO_BACK' | 'RELEASE_TO_IDLE',
    reason: string
  ): Promise<void> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable(fns, 'adminResolveAbandonedSession');
    await fn({ teamId, action, reason });
  },

  async adminControlledReassign(
    teamId: string,
    targetGroupId: GroupId,
    reason: string
  ): Promise<void> {
    const { functions: fns } = assertFirebase();
    const fn = httpsCallable(fns, 'adminControlledReassign');
    await fn({ teamId, targetGroupId, reason });
  },
};
