import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import crypto from 'crypto';
import {
  hashRegistrationCode,
  maskRegistrationCode,
  pickUniformGroup,
  safeStringEqual,
  verifyRegistrationCode,
} from './crypto';
import { AUTHORIZED_TEAMS } from './authorizedTeams';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REGION = process.env.FUNCTION_REGION || 'asia-south1';
const GROUP_IDS = ['GROUP_A', 'GROUP_B', 'GROUP_C'] as const;
const MAX_GROUP_CAPACITY = 10;
const TOTAL_REGISTERED_TEAMS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function requireAdmin(auth: { uid: string; token: Record<string, unknown> } | undefined): void {
  if (!auth || auth.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator privileges are required.');
  }
}

function requireTeamLeader(
  auth: { uid: string; token: Record<string, unknown> } | undefined
): string {
  if (!auth || auth.token?.role !== 'team_leader' || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Authenticated Team Leader session required.');
  }
  return auth.uid;
}

// ============================================================================
// 1. PUBLIC NON-SENSITIVE ARENA TELEMETRY (For Login Page Briefing Only)
// ============================================================================
export const getPublicStatus = onCall({ region: REGION }, async () => {
  const [settingsSnap, groupsSnap, waitingSnap] = await Promise.all([
    db.collection('eventSettings').doc('live').get(),
    db.collection('groups').get(),
    db.collection('drawQueue').where('status', 'in', ['ACTIVE', 'WAITING']).get(),
  ]);

  const settings = settingsSnap.exists ? settingsSnap.data() : null;
  const groups = GROUP_IDS.map((gid) => {
    const doc = groupsSnap.docs.find((d) => d.id === gid);
    const data = doc?.data();
    return {
      groupId: gid,
      groupName: data?.groupName || gid.replace('_', ' '),
      teamCount: data?.teamCount || 0,
      maxCapacity: data?.maxCapacity || MAX_GROUP_CAPACITY,
    };
  });

  return {
    eventStatus: settings?.eventStatus || 'LIVE',
    queuePaused: Boolean(settings?.queuePaused),
    totalTeams: settings?.totalTeams || TOTAL_REGISTERED_TEAMS,
    completedDraws: settings?.completedDraws || 0,
    activeQueueCount: waitingSnap.size,
    groups,
  };
});

// ============================================================================
// 2. TEAM LEADER DUAL-CREDENTIAL LOGIN (Student ID + Unique Registration Code)
// ============================================================================
export const teamLeaderLogin = onCall({ region: REGION }, async (request) => {
  const rawStudentId = typeof request.data?.studentId === 'string' ? request.data.studentId.trim() : '';
  const rawRegCode =
    typeof request.data?.registrationCode === 'string'
      ? request.data.registrationCode.trim().toUpperCase()
      : '';

  if (!rawStudentId || !rawRegCode) {
    throw new HttpsError(
      'invalid-argument',
      'Both Student ID Number and Unique Registration Code are required.'
    );
  }

  // Query locked server-only `teamCredentials` collection by studentId
  const credQuery = await db
    .collection('teamCredentials')
    .where('studentId', '==', rawStudentId)
    .limit(1)
    .get();

  if (credQuery.empty) {
    throw new HttpsError(
      'unauthenticated',
      'Invalid credentials. Please verify your Student ID Number and Registration Code.'
    );
  }

  const credDoc = credQuery.docs[0];
  const cred = credDoc.data();
  const teamId = credDoc.id;

  const isMatch = verifyRegistrationCode(
    rawStudentId,
    rawRegCode,
    cred.salt,
    cred.registrationCodeHash
  );

  if (!isMatch) {
    await db.collection('auditLogs').add({
      action: 'LOGIN_FAILED',
      actor: rawStudentId,
      teamId,
      details: 'Mismatched registration code submitted for Student ID.',
      timestamp: nowIso(),
    });
    throw new HttpsError(
      'unauthenticated',
      'Invalid credentials. Student ID and Registration Code must match the same registered team.'
    );
  }

  const ts = nowIso();
  const teamRef = db.collection('teams').doc(teamId);
  await teamRef.update({
    authenticationStatus: 'AUTHENTICATED',
    lastLoginAt: ts,
    lastSeenAt: ts,
  });

  await db.collection('auditLogs').add({
    action: 'TEAM_LOGIN',
    actor: rawStudentId,
    teamId,
    details: 'Team leader authenticated with Student ID and Registration Code.',
    timestamp: ts,
  });

  const customToken = await admin.auth().createCustomToken(teamId, {
    role: 'team_leader',
    teamId,
    studentId: rawStudentId,
  });

  return { customToken, teamId };
});

// ============================================================================
// 3. ADMIN ORGANIZER LOGIN
// ============================================================================
export const adminLogin = onCall({ region: REGION }, async (request) => {
  const passcode = typeof request.data?.passcode === 'string' ? request.data.passcode.trim() : '';
  const expected = process.env.INNOHACK_ADMIN_PASSCODE || 'INNOHACK-ADMIN-2026';

  if (!passcode || !safeStringEqual(passcode, expected)) {
    throw new HttpsError('unauthenticated', 'Invalid organizer passcode.');
  }

  const ts = nowIso();
  await db.collection('auditLogs').add({
    action: 'ADMIN_LOGIN',
    actor: 'ADMIN',
    teamId: null,
    details: 'Authorized organizer signed into Admin Live Draw Command Center.',
    timestamp: ts,
  });

  const customToken = await admin.auth().createCustomToken('innohack-admin', {
    role: 'admin',
  });

  return { customToken };
});

// ============================================================================
// 4. ATOMIC SERVER-AUTHORITATIVE GLOBAL FIFO QUEUE ADMISSION
// ============================================================================
export const joinDrawQueue = onCall({ region: REGION }, async (request) => {
  const teamId = requireTeamLeader(request.auth);
  const settingsRef = db.collection('eventSettings').doc('live');
  const teamRef = db.collection('teams').doc(teamId);

  const result = await db.runTransaction(async (tx) => {
    const [settingsSnap, teamSnap, existingQueueSnap] = await Promise.all([
      tx.get(settingsRef),
      tx.get(teamRef),
      tx.get(
        db
          .collection('drawQueue')
          .where('teamId', '==', teamId)
          .where('status', 'in', ['WAITING', 'ACTIVE'])
          .limit(1)
      ),
    ]);

    if (!settingsSnap.exists || !teamSnap.exists) {
      throw new HttpsError('failed-precondition', 'Event database has not been initialized.');
    }

    const settings = settingsSnap.data()!;
    const team = teamSnap.data()!;

    if (settings.eventStatus === 'COMPLETED' || (settings.completedDraws || 0) >= TOTAL_REGISTERED_TEAMS) {
      throw new HttpsError('failed-precondition', 'All 30 team allocations have already been completed.');
    }

    if (settings.queuePaused) {
      throw new HttpsError(
        'failed-precondition',
        'Queue admissions are temporarily paused by the Hackathon Organizers.'
      );
    }

    if (team.drawCompleted) {
      throw new HttpsError(
        'already-exists',
        `Your squad has already completed the draw and is assigned to ${team.assignedGroup}.`
      );
    }

    if (!existingQueueSnap.empty || team.queueStatus === 'WAITING' || team.queueStatus === 'ACTIVE') {
      throw new HttpsError(
        'already-exists',
        'Your team is already in the live FIFO queue. Duplicate queue entries are not allowed.'
      );
    }

    const ts = nowIso();
    const nextSequence = (settings.lastQueueSequence || 0) + 1;
    const becomesActive = !settings.currentActiveTeamId;
    const queueStatus = becomesActive ? 'ACTIVE' : 'WAITING';
    const queueEntryId = `Q${String(nextSequence).padStart(4, '0')}_${teamId}`;
    const queueRef = db.collection('drawQueue').doc(queueEntryId);
    const auditRef = db.collection('auditLogs').doc();

    tx.set(queueRef, {
      queueEntryId,
      teamId,
      teamName: team.teamName,
      maskedStudentId: `****${String(team.studentId).slice(-4)}`,
      sequenceNumber: nextSequence,
      status: queueStatus,
      joinedAt: ts,
      activatedAt: becomesActive ? ts : null,
      completedAt: null,
      lastHeartbeatAt: ts,
    });

    tx.update(teamRef, {
      queueStatus,
      queueNumber: nextSequence,
      activeQueueEntryId: queueEntryId,
      lastSeenAt: ts,
    });

    tx.update(settingsRef, {
      lastQueueSequence: nextSequence,
      currentActiveTeamId: becomesActive ? teamId : settings.currentActiveTeamId,
      queueStatus: 'ACTIVE',
    });

    tx.set(auditRef, {
      action: 'QUEUE_JOINED',
      actor: team.studentId,
      teamId,
      details: `Joined global FIFO queue at sequence #${nextSequence} (${queueStatus}).`,
      timestamp: ts,
    });

    return { queueEntryId, sequenceNumber: nextSequence, status: queueStatus };
  });

  return result;
});

// ============================================================================
// 5. ATOMIC SERVER-AUTHORITATIVE SPIN & GROUP ALLOCATION (10 / 10 / 10)
// ============================================================================
export const executeSpin = onCall({ region: REGION }, async (request) => {
  const teamId = requireTeamLeader(request.auth);
  const settingsRef = db.collection('eventSettings').doc('live');
  const teamRef = db.collection('teams').doc(teamId);
  const groupRefs = GROUP_IDS.map((gid) => db.collection('groups').doc(gid));

  const result = await db.runTransaction(async (tx) => {
    const [settingsSnap, teamSnap, groupASnap, groupBSnap, groupCSnap, waitingSnap] =
      await Promise.all([
        tx.get(settingsRef),
        tx.get(teamRef),
        tx.get(groupRefs[0]),
        tx.get(groupRefs[1]),
        tx.get(groupRefs[2]),
        tx.get(
          db
            .collection('drawQueue')
            .where('status', '==', 'WAITING')
            .orderBy('sequenceNumber', 'asc')
            .limit(1)
        ),
      ]);

    if (!settingsSnap.exists || !teamSnap.exists) {
      throw new HttpsError('failed-precondition', 'Event state missing.');
    }

    const settings = settingsSnap.data()!;
    const team = teamSnap.data()!;

    if (team.drawCompleted) {
      throw new HttpsError(
        'already-exists',
        'Repeated spins are prohibited. Your team draw is already permanently recorded.'
      );
    }

    if (settings.currentActiveTeamId !== teamId || team.queueStatus !== 'ACTIVE') {
      throw new HttpsError(
        'permission-denied',
        'It is not your turn yet. Only the position #1 ACTIVE team leader can spin.'
      );
    }

    const activeQueueEntryId: string | null = team.activeQueueEntryId || null;
    const activeEntryRef = activeQueueEntryId
      ? db.collection('drawQueue').doc(activeQueueEntryId)
      : null;
    const activeEntrySnap = activeEntryRef ? await tx.get(activeEntryRef) : null;

    const groupSnaps = [groupASnap, groupBSnap, groupCSnap];
    const eligibleGroups = groupSnaps
      .map((snap, idx) => ({
        ref: groupRefs[idx],
        groupId: GROUP_IDS[idx],
        data: snap.data() || {
          groupId: GROUP_IDS[idx],
          groupName: GROUP_IDS[idx].replace('_', ' '),
          maxCapacity: MAX_GROUP_CAPACITY,
          teamCount: 0,
          teamIds: [],
        },
      }))
      .filter((g) => (g.data.teamCount || 0) < (g.data.maxCapacity || MAX_GROUP_CAPACITY));

    if (eligibleGroups.length === 0) {
      throw new HttpsError('failed-precondition', 'All groups have reached maximum capacity (10/10/10).');
    }

    // Cryptographically uniform selection across remaining eligible groups
    const chosen = pickUniformGroup(eligibleGroups);
    const ts = nowIso();
    const drawOrder = (settings.completedDraws || 0) + 1;
    const sequenceNumber = team.queueNumber || activeEntrySnap?.data()?.sequenceNumber || drawOrder;
    const drawId = `DRAW_${String(drawOrder).padStart(2, '0')}_${teamId}`;
    const drawRef = db.collection('drawHistory').doc(drawId);
    const auditRef = db.collection('auditLogs').doc();

    // Update chosen group atomically
    const nextTeamIds = [...(chosen.data.teamIds || []), teamId];
    tx.update(chosen.ref, {
      teamCount: nextTeamIds.length,
      teamIds: nextTeamIds,
    });

    // Permanently save team allocation
    tx.update(teamRef, {
      assignedGroup: chosen.groupId,
      assignedGroupName: chosen.data.groupName,
      drawCompleted: true,
      drawOrder,
      queueStatus: 'COMPLETED',
      activeQueueEntryId: null,
      allocatedAt: ts,
      lastSeenAt: ts,
    });

    // Mark active queue entry completed
    if (activeEntryRef && activeEntrySnap?.exists) {
      tx.update(activeEntryRef, {
        status: 'COMPLETED',
        completedAt: ts,
        assignedGroup: chosen.groupId,
      });
    }

    // Append permanent drawHistory record
    tx.set(drawRef, {
      drawId,
      teamId,
      teamName: team.teamName,
      studentId: team.studentId,
      maskedRegistrationCode: team.maskedRegistrationCode,
      sequenceNumber,
      drawOrder,
      assignedGroup: chosen.groupId,
      assignedGroupName: chosen.data.groupName,
      timestamp: ts,
      status: 'CONFIRMED',
    });

    // Advance FIFO queue automatically to next waiting team
    let nextActiveTeamId: string | null = null;
    if (!waitingSnap.empty) {
      const nextQueueDoc = waitingSnap.docs[0];
      const nextData = nextQueueDoc.data();
      nextActiveTeamId = nextData.teamId;
      tx.update(nextQueueDoc.ref, {
        status: 'ACTIVE',
        activatedAt: ts,
      });
      tx.update(db.collection('teams').doc(nextData.teamId), {
        queueStatus: 'ACTIVE',
      });
    }

    const allCompleted = drawOrder >= TOTAL_REGISTERED_TEAMS;
    tx.update(settingsRef, {
      completedDraws: drawOrder,
      currentActiveTeamId: nextActiveTeamId,
      eventStatus: allCompleted ? 'COMPLETED' : 'LIVE',
      queueStatus: allCompleted ? 'COMPLETED' : nextActiveTeamId ? 'ACTIVE' : 'IDLE',
    });

    tx.set(auditRef, {
      action: 'DRAW_COMPLETED',
      actor: team.studentId,
      teamId,
      details: `Draw #${drawOrder}: Assigned to ${chosen.data.groupName} (Eligible pool: ${eligibleGroups
        .map((g) => g.groupId)
        .join(', ')}). Next active: ${nextActiveTeamId || 'NONE'}.`,
      timestamp: ts,
    });

    return {
      drawId,
      teamId,
      assignedGroup: chosen.groupId,
      assignedGroupName: chosen.data.groupName,
      drawOrder,
      sequenceNumber,
      allocatedAt: ts,
    };
  });

  return result;
});

// ============================================================================
// 6. PRESENCE HEARTBEAT (Supports Disconnect Detection Without Auto-Skip)
// ============================================================================
export const updateHeartbeat = onCall({ region: REGION }, async (request) => {
  const teamId = requireTeamLeader(request.auth);
  const ts = nowIso();
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();

  if (!teamSnap.exists) {
    throw new HttpsError('not-found', 'Team record not found.');
  }

  const team = teamSnap.data()!;
  const batch = db.batch();
  batch.update(teamRef, { lastSeenAt: ts });

  if (team.activeQueueEntryId) {
    batch.update(db.collection('drawQueue').doc(team.activeQueueEntryId), {
      lastHeartbeatAt: ts,
    });
  }

  await batch.commit();
  return { ok: true, timestamp: ts };
});

// ============================================================================
// 7. ADMIN: PAUSE / RESUME NEW QUEUE ADMISSIONS
// ============================================================================
export const adminToggleQueuePause = onCall({ region: REGION }, async (request) => {
  requireAdmin(request.auth);
  const paused = Boolean(request.data?.paused);
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim() : '';
  const ts = nowIso();

  await db.collection('eventSettings').doc('live').update({
    queuePaused: paused,
    queuePausedAt: paused ? ts : null,
  });

  await db.collection('auditLogs').add({
    action: paused ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED',
    actor: 'ADMIN',
    teamId: null,
    details: reason || (paused ? 'Admin paused new queue admissions.' : 'Admin resumed queue admissions.'),
    timestamp: ts,
  });

  return { queuePaused: paused };
});

// ============================================================================
// 8. ADMIN: RESOLVE ABANDONED ACTIVE SESSION (Safe, Non-Duplicating)
// ============================================================================
export const adminResolveAbandonedSession = onCall({ region: REGION }, async (request) => {
  requireAdmin(request.auth);
  const targetTeamId = typeof request.data?.teamId === 'string' ? request.data.teamId.trim() : '';
  const action = request.data?.action === 'MOVE_TO_BACK' ? 'MOVE_TO_BACK' : 'RELEASE_TO_IDLE';
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim() : '';

  if (!targetTeamId || !reason) {
    throw new HttpsError('invalid-argument', 'Target teamId and audit reason are required.');
  }

  const settingsRef = db.collection('eventSettings').doc('live');
  const teamRef = db.collection('teams').doc(targetTeamId);

  return db.runTransaction(async (tx) => {
    const [settingsSnap, teamSnap, waitingSnap] = await Promise.all([
      tx.get(settingsRef),
      tx.get(teamRef),
      tx.get(
        db
          .collection('drawQueue')
          .where('status', '==', 'WAITING')
          .orderBy('sequenceNumber', 'asc')
          .limit(1)
      ),
    ]);

    if (!settingsSnap.exists || !teamSnap.exists) {
      throw new HttpsError('not-found', 'Event settings or team not found.');
    }

    const settings = settingsSnap.data()!;
    const team = teamSnap.data()!;

    if (team.drawCompleted) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot modify queue state for a team that has already completed their draw.'
      );
    }

    if (settings.currentActiveTeamId !== targetTeamId || team.queueStatus !== 'ACTIVE') {
      throw new HttpsError('failed-precondition', 'Specified team is not the currently active spinner.');
    }

    if (action === 'MOVE_TO_BACK' && waitingSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        'No other teams are waiting behind this team. Use Release to Idle instead.'
      );
    }

    const ts = nowIso();
    const oldEntryId: string | null = team.activeQueueEntryId || null;
    if (oldEntryId) {
      tx.update(db.collection('drawQueue').doc(oldEntryId), {
        status: action === 'MOVE_TO_BACK' ? 'REQUEUED' : 'ABANDONED_RELEASED',
        completedAt: ts,
      });
    }

    let nextSequence = settings.lastQueueSequence || 0;
    if (action === 'MOVE_TO_BACK') {
      nextSequence += 1;
      const newEntryId = `Q${String(nextSequence).padStart(4, '0')}_${targetTeamId}`;
      tx.set(db.collection('drawQueue').doc(newEntryId), {
        queueEntryId: newEntryId,
        teamId: targetTeamId,
        teamName: team.teamName,
        maskedStudentId: `****${String(team.studentId).slice(-4)}`,
        sequenceNumber: nextSequence,
        status: 'WAITING',
        joinedAt: ts,
        activatedAt: null,
        completedAt: null,
        lastHeartbeatAt: team.lastSeenAt || ts,
      });
      tx.update(teamRef, {
        queueStatus: 'WAITING',
        queueNumber: nextSequence,
        activeQueueEntryId: newEntryId,
      });
    } else {
      tx.update(teamRef, {
        queueStatus: 'NOT_JOINED',
        queueNumber: null,
        activeQueueEntryId: null,
      });
    }

    let nextActiveTeamId: string | null = null;
    if (!waitingSnap.empty) {
      const nextDoc = waitingSnap.docs[0];
      const nextData = nextDoc.data();
      nextActiveTeamId = nextData.teamId;
      tx.update(nextDoc.ref, { status: 'ACTIVE', activatedAt: ts });
      tx.update(db.collection('teams').doc(nextData.teamId), { queueStatus: 'ACTIVE' });
    }

    tx.update(settingsRef, {
      lastQueueSequence: nextSequence,
      currentActiveTeamId: nextActiveTeamId,
      queueStatus: nextActiveTeamId ? 'ACTIVE' : 'IDLE',
    });

    tx.set(db.collection('auditLogs').doc(), {
      action: `ADMIN_ABANDONED_${action}`,
      actor: 'ADMIN',
      teamId: targetTeamId,
      details: `Reason: ${reason}. Next active: ${nextActiveTeamId || 'NONE'}.`,
      timestamp: ts,
    });

    return { resolvedTeamId: targetTeamId, action, nextActiveTeamId };
  });
});

// ============================================================================
// 9. ADMIN: AUDITED CONTROLLED GROUP CORRECTION (Preserves <=10 Cap Invariant)
// ============================================================================
export const adminControlledReassign = onCall({ region: REGION }, async (request) => {
  requireAdmin(request.auth);
  const teamId = typeof request.data?.teamId === 'string' ? request.data.teamId.trim() : '';
  const targetGroupId = typeof request.data?.targetGroupId === 'string' ? request.data.targetGroupId.trim() : '';
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim() : '';

  if (!teamId || !GROUP_IDS.includes(targetGroupId as (typeof GROUP_IDS)[number]) || !reason) {
    throw new HttpsError('invalid-argument', 'Valid teamId, targetGroupId, and audit reason are required.');
  }

  return db.runTransaction(async (tx) => {
    const teamRef = db.collection('teams').doc(teamId);
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.');

    const team = teamSnap.data()!;
    if (!team.drawCompleted || !team.assignedGroup) {
      throw new HttpsError('failed-precondition', 'Team has not completed a draw yet.');
    }

    const oldGroupId: string = team.assignedGroup;
    if (oldGroupId === targetGroupId) {
      throw new HttpsError('invalid-argument', 'Team is already in the target group.');
    }

    const oldGroupRef = db.collection('groups').doc(oldGroupId);
    const newGroupRef = db.collection('groups').doc(targetGroupId);
    const [oldGroupSnap, newGroupSnap] = await Promise.all([
      tx.get(oldGroupRef),
      tx.get(newGroupRef),
    ]);

    const oldGroup = oldGroupSnap.data()!;
    const newGroup = newGroupSnap.data()!;

    if ((newGroup.teamCount || 0) >= MAX_GROUP_CAPACITY) {
      throw new HttpsError(
        'failed-precondition',
        `${newGroup.groupName} is already at maximum capacity (10/10).`
      );
    }

    const ts = nowIso();
    const updatedOldIds = (oldGroup.teamIds || []).filter((id: string) => id !== teamId);
    const updatedNewIds = [...(newGroup.teamIds || []), teamId];

    tx.update(oldGroupRef, { teamIds: updatedOldIds, teamCount: updatedOldIds.length });
    tx.update(newGroupRef, { teamIds: updatedNewIds, teamCount: updatedNewIds.length });
    tx.update(teamRef, {
      assignedGroup: targetGroupId,
      assignedGroupName: newGroup.groupName,
    });

    tx.set(db.collection('auditLogs').doc(), {
      action: 'ADMIN_CONTROLLED_REASSIGN',
      actor: 'ADMIN',
      teamId,
      details: `Reassigned from ${oldGroupId} to ${targetGroupId}. Reason: ${reason}`,
      timestamp: ts,
    });

    return { teamId, oldGroupId, newGroupId: targetGroupId };
  });
});

// ============================================================================
// 10. ADMIN: IDEMPOTENT SEED HELPER (Safe Against Existing Shared Database)
// ============================================================================
export const seedAuthorizedTeams = onCall({ region: REGION }, async (request) => {
  requireAdmin(request.auth);
  const ts = nowIso();
  const batch = db.batch();

  // Initialize groups only if absent
  for (const gid of GROUP_IDS) {
    const gRef = db.collection('groups').doc(gid);
    const snap = await gRef.get();
    if (!snap.exists) {
      batch.set(gRef, {
        groupId: gid,
        groupName: gid.replace('_', ' '),
        maxCapacity: MAX_GROUP_CAPACITY,
        teamCount: 0,
        teamIds: [],
      });
    }
  }

  // Initialize eventSettings only if absent
  const settingsRef = db.collection('eventSettings').doc('live');
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    batch.set(settingsRef, {
      eventStatus: 'LIVE',
      queueStatus: 'IDLE',
      queuePaused: false,
      currentActiveTeamId: null,
      lastQueueSequence: 0,
      totalTeams: TOTAL_REGISTERED_TEAMS,
      completedDraws: 0,
      initializedAt: ts,
    });
  }

  let createdCount = 0;
  for (const t of AUTHORIZED_TEAMS) {
    const existingByStudent = await db
      .collection('teams')
      .where('studentId', '==', t.studentId)
      .limit(1)
      .get();

    const docId = existingByStudent.empty ? t.teamId : existingByStudent.docs[0].id;
    const salt = crypto.randomBytes(16).toString('hex');
    const registrationCodeHash = hashRegistrationCode(t.studentId, t.registrationCode, salt);
    const maskedRegistrationCode = maskRegistrationCode(t.registrationCode);

    // Store hash strictly inside locked teamCredentials collection
    batch.set(
      db.collection('teamCredentials').doc(docId),
      {
        teamId: docId,
        studentId: t.studentId,
        salt,
        registrationCodeHash,
        updatedAt: ts,
      },
      { merge: true }
    );

    // Create team doc only if it doesn't already exist in the shared database
    if (existingByStudent.empty) {
      createdCount += 1;
      batch.set(db.collection('teams').doc(docId), {
        teamId: docId,
        studentId: t.studentId,
        maskedRegistrationCode,
        teamName: t.teamName,
        teamLeader: `Leader ${docId}`,
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
      });
    } else {
      batch.set(
        db.collection('teams').doc(docId),
        { maskedRegistrationCode },
        { merge: true }
      );
    }
  }

  await batch.commit();
  return { totalAuthorized: AUTHORIZED_TEAMS.length, newlyCreatedTeams: createdCount };
});
