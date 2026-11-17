/**
 * Idempotent Firestore Seeding Script for INNOHACK Season 2026
 * -----------------------------------------------------------------------------
 * Reuses your existing Firebase project and shared Hackathon database without
 * creating duplicate team records or overwriting completed draws.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   export INNOHACK_AUTH_PEPPER="your-production-pepper"
 *   npm run seed:firestore
 */

import crypto from 'crypto';
import { AUTHORIZED_TEAMS } from '../functions/src/authorizedTeams';
import { hashRegistrationCode, maskRegistrationCode } from '../functions/src/crypto';

async function main() {
  // Dynamically load firebase-admin so root project builds without requiring service creds locally
  const adminModule = await import('firebase-admin').catch(() => null);
  if (!adminModule) {
    console.error(
      'firebase-admin is installed inside functions/. Run `npm --prefix functions install` or run via `cd functions && npx tsx ../scripts/seedFirestore.ts`.'
    );
    process.exit(1);
  }

  const admin = adminModule.default || adminModule;
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();
  const ts = new Date().toISOString();

  // Assert exactly 30 unique registration codes & student IDs
  const uniqueCodes = new Set(AUTHORIZED_TEAMS.map((t) => t.registrationCode));
  const uniqueIds = new Set(AUTHORIZED_TEAMS.map((t) => t.studentId));
  if (AUTHORIZED_TEAMS.length !== 30 || uniqueCodes.size !== 30 || uniqueIds.size !== 30) {
    throw new Error('Integrity check failed: expected exactly 30 unique team credentials.');
  }

  const batch = db.batch();

  // 1. Ensure 3 Groups exist (max 10 teams each)
  for (const gid of ['GROUP_A', 'GROUP_B', 'GROUP_C']) {
    const ref = db.collection('groups').doc(gid);
    const snap = await ref.get();
    if (!snap.exists) {
      batch.set(ref, {
        groupId: gid,
        groupName: gid.replace('_', ' '),
        maxCapacity: 10,
        teamCount: 0,
        teamIds: [],
      });
      console.log(`+ Creating group ${gid}`);
    } else {
      console.log(`= Group ${gid} already exists (${snap.data()?.teamCount || 0}/10)`);
    }
  }

  // 2. Ensure eventSettings/live exists
  const settingsRef = db.collection('eventSettings').doc('live');
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    batch.set(settingsRef, {
      eventStatus: 'LIVE',
      queueStatus: 'IDLE',
      queuePaused: false,
      currentActiveTeamId: null,
      lastQueueSequence: 0,
      totalTeams: 30,
      completedDraws: 0,
      initializedAt: ts,
    });
    console.log('+ Creating eventSettings/live');
  } else {
    console.log('= eventSettings/live already exists — preserving live state');
  }

  // 3. Seed 30 authorized team credentials (hashed) + team docs (no duplicates!)
  for (const team of AUTHORIZED_TEAMS) {
    const existing = await db
      .collection('teams')
      .where('studentId', '==', team.studentId)
      .limit(1)
      .get();

    const docId = existing.empty ? team.teamId : existing.docs[0].id;
    const salt = crypto.randomBytes(16).toString('hex');
    const registrationCodeHash = hashRegistrationCode(team.studentId, team.registrationCode, salt);
    const maskedRegistrationCode = maskRegistrationCode(team.registrationCode);

    // Strictly server-only hashed credentials collection
    batch.set(
      db.collection('teamCredentials').doc(docId),
      {
        teamId: docId,
        studentId: team.studentId,
        salt,
        registrationCodeHash,
        updatedAt: ts,
      },
      { merge: true }
    );

    if (existing.empty) {
      batch.set(db.collection('teams').doc(docId), {
        teamId: docId,
        studentId: team.studentId,
        maskedRegistrationCode,
        teamName: team.teamName,
        teamLeader: `Team Leader ${docId}`,
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
      console.log(`+ Created team ${docId} (${team.studentId} / ${maskedRegistrationCode})`);
    } else {
      batch.set(
        db.collection('teams').doc(docId),
        { maskedRegistrationCode },
        { merge: true }
      );
      console.log(`= Linked existing team ${docId} (${team.studentId}) — no duplicate created`);
    }
  }

  await batch.commit();
  console.log('\nDone! All 30 INNOHACK 2026 authorized team credentials are securely hashed and seeded.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
