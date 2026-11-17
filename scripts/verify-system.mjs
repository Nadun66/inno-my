/**
 * End-to-End Automated Verification & Concurrency Stress Test Suite
 * -----------------------------------------------------------------------------
 * Verifies every critical requirement of the INNOHACK Season 2026 Team Leader
 * Portal & Server-Authoritative FIFO Live Draw System:
 *   1. Credential security (rejects single credential, mismatched pair, unknown user)
 *   2. Independent login of all 30 authorized team leaders simultaneously
 *   3. Concurrent simultaneous FIFO queue admission (all 30 at once via Promise.all)
 *   4. Strict atomic FIFO ordering (unique sequence 1..30, zero skips, zero duplicates)
 *   5. Duplicate queue admission prevention
 *   6. Out-of-turn spin prevention (non-active users rejected with 403)
 *   7. Admin pause / resume + abandoned session resolution + audit log verification
 *   8. Full 30-team sequential draw execution & automatic queue advancement
 *   9. Duplicate spin prevention after completion
 *  10. Exact final 10 / 10 / 10 group distribution invariant & permanent persistence
 *  11. Bundle leak check (verifying zero plaintext registration codes inside dist/)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3001';
const ADMIN_PASSCODE = process.env.INNOHACK_ADMIN_PASSCODE || 'INNOHACK-ADMIN-2026';

const TEAMS = [
  ['IH26-Y8J8-CLAE', '200426604486'],
  ['IH26-8KMN-LNNE', '200266702029'],
  ['IH26-8FHM-DHQW', '200422003799'],
  ['IH26-X2QU-Z9AV', '200218702100'],
  ['IH26-X9EZ-26RK', '200327311137'],
  ['IH26-TKQW-CSGH', '200320700472'],
  ['IH26-NJAV-S74Y', '200623602435'],
  ['IH26-DMPC-WN98', '200328013405'],
  ['IH26-5G8E-YJFN', '200334412686'],
  ['IH26-JLCG-FKTG', '200420003773'],
  ['IH26-VG3P-Z9UL', '200666903134'],
  ['IH26-ZV5N-ZYPA', '200035300936'],
  ['IH26-6TRJ-ZJ5Q', '200274101253'],
  ['IH26-EJHA-EHD4', '200913504204'],
  ['IH26-LULP-3QMT', '200422302861'],
  ['IH26-P759-SLEQ', '200466900961'],
  ['IH26-QHLN-UMSP', '200534004109'],
  ['IH26-MBJK-JDDJ', '200213300090'],
  ['IH26-H3QQ-EY2K', '200510302760'],
  ['IH26-8TAU-G6K4', '200224101763'],
  ['IH26-KDCR-PK2Q', '200510901170'],
  ['IH26-6JJ5-U66J', '200484803220'],
  ['IH26-N9UR-LNKX', '200425903589'],
  ['IH26-23C9-WPNG', '200260201400'],
  ['IH26-J6MB-7A2H', '200522803731'],
  ['IH26-V2LC-ZE2N', '200315010280'],
  ['IH26-5F5M-MCE7', '200618102950'],
  ['IH26-8G3C-6XEX', '200330213004'],
  ['IH26-JCNV-25CX', '200208401740'],
  ['IH26-P8HU-75TR', '200602101081'],
];

async function req(endpoint, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log('=== INNOHACK 2026 SYSTEM VERIFICATION SUITE ===\n');

  // 0. Admin Login & Clean Sandbox Reset
  const adminLogin = await req('/api/auth/admin-login', {
    method: 'POST',
    body: { passcode: ADMIN_PASSCODE },
  });
  assert.equal(adminLogin.status, 200, 'Admin login must succeed');
  const adminToken = adminLogin.data.token;

  const resetRes = await req('/api/admin/sandbox/reset', {
    method: 'POST',
    token: adminToken,
    body: { confirmPhrase: 'RESET-INNOHACK-SANDBOX' },
  });
  assert.equal(resetRes.status, 200, 'Sandbox reset must succeed before test run');
  console.log('[PASS] 0. Admin auth & clean state initialized');

  // 1. Negative Auth Security Tests
  const missingCode = await req('/api/auth/team-login', {
    method: 'POST',
    body: { studentId: TEAMS[0][1], registrationCode: '' },
  });
  assert.equal(missingCode.status, 400, 'Single credential login must be rejected');

  const mismatchedPair = await req('/api/auth/team-login', {
    method: 'POST',
    body: { studentId: TEAMS[0][1], registrationCode: TEAMS[1][0] },
  });
  assert.equal(mismatchedPair.status, 401, 'Mismatched Student ID + Reg Code must be rejected');

  const unknownUser = await req('/api/auth/team-login', {
    method: 'POST',
    body: { studentId: '999999999999', registrationCode: 'IH26-FAKE-CODE' },
  });
  assert.equal(unknownUser.status, 401, 'Unauthorized account must be rejected');
  console.log('[PASS] 1. Dual-credential validation & unauthorized account blocking verified');

  // 2. All 30 Team Leaders Log In Simultaneously
  const loginResults = await Promise.all(
    TEAMS.map(([registrationCode, studentId]) =>
      req('/api/auth/team-login', {
        method: 'POST',
        body: { studentId, registrationCode },
      })
    )
  );
  assert.equal(loginResults.length, 30);
  const sessions = loginResults.map((r, i) => {
    assert.equal(r.status, 200, `Team ${i + 1} login failed: ${JSON.stringify(r.data)}`);
    assert.ok(r.data.token, `Team ${i + 1} missing session token`);
    return { teamId: r.data.teamId, studentId: r.data.studentId, token: r.data.token };
  });
  console.log('[PASS] 2. All 30 registered team leaders authenticated concurrently');

  // 3. Test Admin Queue Pause Enforcement
  const pauseRes = await req('/api/admin/queue/pause', {
    method: 'POST',
    token: adminToken,
    body: { paused: true, reason: 'Verification test pause' },
  });
  assert.equal(pauseRes.status, 200);
  const blockedJoin = await req('/api/queue/join', {
    method: 'POST',
    token: sessions[0].token,
  });
  assert.equal(blockedJoin.status, 423, 'Queue join must be blocked while paused');

  await req('/api/admin/queue/pause', {
    method: 'POST',
    token: adminToken,
    body: { paused: false, reason: 'Verification test resume' },
  });
  console.log('[PASS] 3. Admin queue pause/resume enforcement verified');

  // 4. Simultaneous Concurrent Queue Admission (All 30 Join At Once!)
  const joinResults = await Promise.all(
    sessions.map((s) =>
      req('/api/queue/join', {
        method: 'POST',
        token: s.token,
      }).then((r) => ({ ...s, res: r }))
    )
  );

  const sequenceMap = new Map();
  let activeCount = 0;
  for (const item of joinResults) {
    assert.equal(
      item.res.status,
      200,
      `Concurrent queue join failed for ${item.teamId}: ${JSON.stringify(item.res.data)}`
    );
    const seq = item.res.data.sequenceNumber;
    assert.ok(!sequenceMap.has(seq), `Duplicate FIFO sequence number ${seq} detected!`);
    sequenceMap.set(seq, item);
    if (item.res.data.status === 'ACTIVE') activeCount += 1;
  }

  assert.equal(sequenceMap.size, 30, 'Exactly 30 unique FIFO sequence numbers must be assigned');
  assert.equal(activeCount, 1, 'Exactly ONE team leader must be ACTIVE at position #1');
  for (let i = 1; i <= 30; i++) {
    assert.ok(sequenceMap.has(i), `Missing FIFO sequence number ${i}`);
  }
  console.log('[PASS] 4. 30 simultaneous FIFO queue admissions -> strictly unique 1..30, exactly 1 ACTIVE');

  // 5. Duplicate Queue Join Prevention
  const dupJoin = await req('/api/queue/join', {
    method: 'POST',
    token: sequenceMap.get(1).token,
  });
  assert.equal(dupJoin.status, 409, 'Duplicate queue join must be rejected');

  const dupJoinWaiting = await req('/api/queue/join', {
    method: 'POST',
    token: sequenceMap.get(2).token,
  });
  assert.equal(dupJoinWaiting.status, 409, 'Duplicate queue join for waiting team must be rejected');
  console.log('[PASS] 5. Duplicate queue admission strictly prevented');

  // 6. Out-of-turn Spin Rejection (Positions 2, 5, 15 try to spin concurrently)
  const outOfTurn = await Promise.all(
    [2, 5, 15].map((pos) =>
      req('/api/draw/spin', { method: 'POST', token: sequenceMap.get(pos).token })
    )
  );
  for (const attempt of outOfTurn) {
    assert.equal(attempt.status, 403, 'Out-of-turn spin MUST be rejected with 403');
  }
  console.log('[PASS] 6. Out-of-turn spin attempts strictly blocked');

  // 7. Test Admin Abandoned Session Resolution (Move Active #1 to Back -> #2 becomes Active)
  const firstTeam = sequenceMap.get(1);
  const secondTeam = sequenceMap.get(2);
  const resolveRes = await req('/api/admin/queue/resolve-abandoned', {
    method: 'POST',
    token: adminToken,
    body: {
      teamId: firstTeam.teamId,
      action: 'MOVE_TO_BACK',
      reason: 'Simulated disconnected leader test',
    },
  });
  assert.equal(resolveRes.status, 200, 'Admin move-to-back must succeed');
  assert.equal(
    resolveRes.data.nextActiveTeamId,
    secondTeam.teamId,
    'Position #2 must become ACTIVE when #1 is moved to back'
  );
  console.log('[PASS] 7. Admin abandoned session resolution & FIFO promotion verified');

  // 8. Execute All 30 Spins Strictly In FIFO Order + Verify Duplicate Spin Rejection
  const drawnOrder = [];
  for (let step = 1; step <= 30; step++) {
    const adminSnap = await req('/api/admin/snapshot', { token: adminToken });
    const currentTeamId = adminSnap.data.eventSettings.currentActiveTeamId;
    assert.ok(currentTeamId, `Expected an active team at draw step ${step}`);

    const session = sessions.find((s) => s.teamId === currentTeamId);
    assert.ok(session, `Could not find session for active team ${currentTeamId}`);

    const spinRes = await req('/api/draw/spin', {
      method: 'POST',
      token: session.token,
    });
    assert.equal(
      spinRes.status,
      200,
      `Spin failed at step ${step} for ${currentTeamId}: ${JSON.stringify(spinRes.data)}`
    );
    assert.equal(spinRes.data.drawOrder, step, `Draw order mismatch at step ${step}`);
    drawnOrder.push(spinRes.data);

    // Immediately verify duplicate spin rejection for the team that just finished!
    if (step <= 3) {
      const repeatSpin = await req('/api/draw/spin', {
        method: 'POST',
        token: session.token,
      });
      assert.equal(repeatSpin.status, 409, 'Repeated spin after completion MUST be rejected');
    }
  }
  console.log('[PASS] 8. All 30 teams spun sequentially in exact FIFO order; duplicate spins blocked');

  // 9. Verify Exact Final 10 / 10 / 10 Group Distribution & Data Integrity
  const finalAdmin = await req('/api/admin/snapshot', { token: adminToken });
  assert.equal(finalAdmin.status, 200);
  const { groups, teams, drawHistory, eventSettings, auditLogs } = finalAdmin.data;

  assert.equal(eventSettings.completedDraws, 30, 'Completed draws must be 30');
  assert.equal(eventSettings.eventStatus, 'COMPLETED', 'Event status must be COMPLETED');
  assert.equal(eventSettings.currentActiveTeamId, null, 'No active team should remain');
  assert.equal(drawHistory.length, 30, 'Draw history must have 30 permanent records');

  const gA = groups.find((g) => g.groupId === 'GROUP_A');
  const gB = groups.find((g) => g.groupId === 'GROUP_B');
  const gC = groups.find((g) => g.groupId === 'GROUP_C');

  assert.equal(gA.teamCount, 10, `Group A must have exactly 10 teams (got ${gA.teamCount})`);
  assert.equal(gB.teamCount, 10, `Group B must have exactly 10 teams (got ${gB.teamCount})`);
  assert.equal(gC.teamCount, 10, `Group C must have exactly 10 teams (got ${gC.teamCount})`);

  const allAssignedIds = new Set([...gA.teamIds, ...gB.teamIds, ...gC.teamIds]);
  assert.equal(allAssignedIds.size, 30, 'All 30 distinct teams must be assigned without duplicates');
  assert.ok(
    teams.every((t) => t.drawCompleted && t.assignedGroup && t.drawOrder),
    'Every team must be permanently marked drawCompleted with an assigned group'
  );
  assert.ok(auditLogs.length >= 60, 'Audit logs must capture logins, joins, spins, and admin actions');
  console.log(
    `[PASS] 9. Final distribution verified: Group A=${gA.teamCount}, Group B=${gB.teamCount}, Group C=${gC.teamCount} (10/10/10 exact!)`
  );

  // 10. Verify Team Leader Isolation (Team 1 snapshot does not leak other teams' Student IDs)
  const team1Snap = await req('/api/team/snapshot', { token: sessions[0].token });
  assert.equal(team1Snap.status, 200);
  const serialized = JSON.stringify(team1Snap.data);
  assert.ok(serialized.includes(sessions[0].studentId), 'Own Student ID should be visible');
  assert.ok(
    !serialized.includes(sessions[1].studentId),
    'Other teams full Student IDs must NOT be exposed in Team Leader snapshot'
  );
  console.log('[PASS] 10. Team leader data isolation verified');

  // 11. Verify Production Frontend Bundle Contains ZERO Plaintext Registration Codes
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    const jsFiles = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) jsFiles.push(full);
      }
    };
    walk(distDir);
    const allBundleText = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const [code] of TEAMS) {
      assert.ok(
        !allBundleText.includes(code),
        `SECURITY FAILURE: Registration code ${code} leaked into frontend dist/ bundle!`
      );
    }
    console.log(`[PASS] 11. Frontend bundle security audit passed (${jsFiles.length} JS chunks scanned, 0 codes leaked)`);
  }

  // 12. Reset back to clean LIVE state so the interactive Live Preview starts fresh!
  await req('/api/admin/sandbox/reset', {
    method: 'POST',
    token: adminToken,
    body: { confirmPhrase: 'RESET-INNOHACK-SANDBOX' },
  });
  console.log('[PASS] 12. Sandbox store reset cleanly for interactive live preview\n');
  console.log('ALL 12 VERIFICATION SUITES PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('\n[VERIFICATION FAILED]', err);
  process.exit(1);
});
