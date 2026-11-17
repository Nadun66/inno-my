import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  History,
  KeyRound,
  Layers,
  Loader2,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { HudCard } from '../components/HudCard';
import { GroupProgressPanel } from '../components/GroupProgressPanel';
import { portalApi } from '../services/portalApi';
import { downloadAdminCompletePdf } from '../utils/exportPdf';
import { downloadAdminCompleteCsv, formatAllocationTimestamp } from '../utils/exportCsv';
import type { AdminSnapshot, GroupId, TeamRecord } from '../types/portal';

interface AdminPageProps {
  onAdminAuthChange?: (meta: {
    isAdmin: boolean;
    eventStatus?: 'LIVE' | 'COMPLETED';
    queuePaused?: boolean;
    connected?: boolean;
  }) => void;
}

type AdminTab = 'queue' | 'groups' | 'teams' | 'history';

function getPresenceState(lastSeenAt: string | null, serverTime: string): {
  status: 'ONLINE' | 'STALE' | 'OFFLINE';
  ageSec: number | null;
} {
  if (!lastSeenAt) return { status: 'OFFLINE', ageSec: null };
  const diffMs = Math.max(0, new Date(serverTime).getTime() - new Date(lastSeenAt).getTime());
  const ageSec = Math.round(diffMs / 1000);
  if (ageSec <= 20) return { status: 'ONLINE', ageSec };
  if (ageSec <= 45) return { status: 'STALE', ageSec };
  return { status: 'OFFLINE', ageSec };
}

export const AdminPage: React.FC<AdminPageProps> = ({ onAdminAuthChange }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(() =>
      Boolean(portalApi.getAdminSession())
  );
  const [passcode, setPasscode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [connected, setConnected] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');

  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Admin Action Controls
  const [busyAction, setBusyAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [abandonedReason, setAbandonedReason] = useState('');

  // Controlled Reassign Modal State
  const [reassignTeam, setReassignTeam] = useState<TeamRecord | null>(null);
  const [reassignTarget, setReassignTarget] = useState<GroupId>('GROUP_A');
  const [reassignReason, setReassignReason] = useState('');

  // Delete Allocation Modal State
  const [deleteTeam, setDeleteTeam] = useState<TeamRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Subscribe to real-time admin stream when authenticated
  useEffect(() => {
    if (!authenticated) {
      onAdminAuthChange?.({ isAdmin: false });
      return;
    }

    const unsub = portalApi.subscribeAdminSnapshot(
        (snap) => {
          setSnapshot(snap);
          onAdminAuthChange?.({
            isAdmin: true,
            eventStatus: snap?.eventSettings?.eventStatus,
            queuePaused: snap?.eventSettings?.queuePaused,
            connected: true,
          });
        },
        (isConn) => {
          setConnected(isConn);
          onAdminAuthChange?.({ isAdmin: true, connected: isConn });
        },
        () => {
          setAuthenticated(false);
          setSnapshot(null);
          onAdminAuthChange?.({ isAdmin: false });
        }
    );

    return () => unsub();
  }, [authenticated, onAdminAuthChange]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!passcode.trim()) {
      setLoginError('Please enter the organizer passcode.');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await portalApi.adminLogin(passcode.trim());
      if (res?.snapshot) setSnapshot(res.snapshot);
      setAuthenticated(true);
      setPasscode('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid organizer passcode.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleTogglePause = async () => {
    if (!snapshot) return;
    setBusyAction(true);
    setFeedback(null);
    try {
      const nextPaused = !snapshot.eventSettings?.queuePaused;
      await portalApi.adminToggleQueuePause(
          nextPaused,
          nextPaused
              ? 'Organizer temporarily paused new FIFO queue admissions.'
              : 'Organizer resumed FIFO queue admissions.'
      );
      setFeedback({
        type: 'ok',
        text: nextPaused
            ? 'New queue admissions paused and recorded in audit log.'
            : 'Queue admissions resumed and recorded in audit log.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update queue pause state.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleResolveAbandoned = async (
      teamId: string,
      action: 'MOVE_TO_BACK' | 'RELEASE_TO_IDLE'
  ) => {
    if (!abandonedReason.trim()) {
      setFeedback({
        type: 'err',
        text: 'Please provide an audit reason before resolving an active session.',
      });
      return;
    }
    setBusyAction(true);
    setFeedback(null);
    try {
      await portalApi.adminResolveAbandoned(teamId, action, abandonedReason.trim());
      setAbandonedReason('');
      setFeedback({
        type: 'ok',
        text:
            action === 'MOVE_TO_BACK'
                ? `${teamId} safely moved to the back of the FIFO queue and next team activated.`
                : `${teamId} released from active queue (eligible to rejoin later) and next team activated.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to resolve active session.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTeam) return;
    if (!reassignReason.trim()) {
      setFeedback({ type: 'err', text: 'Audit reason is required for controlled reassignment.' });
      return;
    }
    setBusyAction(true);
    setFeedback(null);
    try {
      await portalApi.adminControlledReassign(
          reassignTeam.teamId,
          reassignTarget,
          reassignReason.trim()
      );
      setFeedback({
        type: 'ok',
        text: `${reassignTeam.teamId} reassigned to ${reassignTarget.replace('_', ' ')} with audit log recorded.`,
      });
      setReassignTeam(null);
      setReassignReason('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Reassignment failed.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTeam) return;
    if (!deleteReason.trim()) {
      setFeedback({ type: 'err', text: 'Audit reason is required to delete a team allocation.' });
      return;
    }
    setBusyAction(true);
    setFeedback(null);
    try {
      await portalApi.adminRemoveTeamAllocation(deleteTeam.teamId, deleteReason.trim());
      setFeedback({
        type: 'ok',
        text: `${deleteTeam.teamId} removed from ${deleteTeam.assignedGroupName} and reset for re-draw.`,
      });
      setDeleteTeam(null);
      setDeleteReason('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete allocation.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const filteredTeams = useMemo(() => {
    if (!snapshot || !snapshot.teams) return [];
    return snapshot.teams.filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
          !q ||
          t.teamId.toLowerCase().includes(q) ||
          t.studentId.toLowerCase().includes(q) ||
          t.maskedRegistrationCode.toLowerCase().includes(q) ||
          (t.assignedGroupName ?? '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'AUTHENTICATED') return t.authenticationStatus === 'AUTHENTICATED';
      if (statusFilter === 'COMPLETED') return t.drawCompleted;
      if (statusFilter === 'IN_QUEUE') return t.queueStatus === 'ACTIVE' || t.queueStatus === 'WAITING';
      if (statusFilter === 'PENDING') return !t.drawCompleted;
      if (statusFilter === 'GROUP_A' || statusFilter === 'GROUP_B' || statusFilter === 'GROUP_C') {
        return t.assignedGroup === statusFilter;
      }
      return true;
    });
  }, [snapshot, searchQuery, statusFilter]);

  if (!authenticated) {
    return (
        <div className="mx-auto flex min-h-[72vh] max-w-lg flex-col justify-center px-4 py-12">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <HudCard highlight className="p-7 sm:p-9">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#00E1FF]/45 bg-[#00E1FF]/15 text-[#00E1FF] shadow-cyanGlow">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <span className="mt-4 inline-block font-display text-[10px] tracking-[0.24em] text-[#00E1FF] uppercase">
                SLIIT KANDY UNI · ORGANIZER ACCESS
              </span>
                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-wider text-white uppercase">
                  ADMIN <span className="text-inno-gradient">COMMAND CENTER</span>
                </h1>
                <p className="mt-2 text-xs text-[#8AA2BE]">
                  Sign in with the official Hackathon Organizer passcode to monitor the live FIFO
                  queue, disconnected sessions, group allocations, audit logs, and master reports.
                </p>
              </div>

              <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
                <div>
                  <label
                      htmlFor="adminPasscode"
                      className="block font-display text-[10px] font-semibold tracking-[0.18em] text-[#9BB4CF] uppercase mb-2"
                  >
                    Organizer Passcode
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#00E1FF]" />
                    <input
                        id="adminPasscode"
                        type="password"
                        value={passcode}
                        onChange={(e) => {
                          setPasscode(e.target.value);
                          if (loginError) setLoginError(null);
                        }}
                        placeholder="Enter organizer passcode"
                        className="w-full rounded-xl border border-[#183556] bg-[#06101E] py-3.5 pl-11 pr-4 font-mono text-sm text-white placeholder-[#4C6887] outline-none focus:border-[#00E1FF] focus:ring-2 focus:ring-[#00E1FF]/20"
                        disabled={loginLoading}
                    />
                  </div>
                </div>

                {loginError && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/45 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <span>{loginError}</span>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loginLoading}
                    className="btn-inno-primary w-full py-3.5 text-sm"
                >
                  {loginLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        AUTHENTICATING...
                      </>
                  ) : (
                      <>
                        ACCESS ADMIN DASHBOARD
                        <ArrowRight className="h-4 w-4" />
                      </>
                  )}
                </button>
              </form>
            </HudCard>
          </motion.div>
        </div>
    );
  }

  if (!snapshot) {
    return (
        <div className="mx-auto flex min-h-[65vh] max-w-7xl flex-col items-center justify-center px-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#00E1FF]" />
          <p className="mt-4 font-display text-xs tracking-[0.22em] text-[#8AA2BE] uppercase">
            LOADING LIVE ADMIN TELEMETRY...
          </p>
        </div>
    );
  }

  const teams = snapshot?.teams || [];
  const queueEntries = snapshot?.queueEntries || [];
  const groups = snapshot?.groups || [];
  const drawHistory = snapshot?.drawHistory || [];
  const eventSettings = snapshot?.eventSettings || {
    totalTeams: 30,
    queuePaused: false,
    currentActiveTeamId: null,
    completedDraws: 0,
    lastQueueSequence: 0,
    eventStatus: 'LIVE'
  };
  const auditLogs = snapshot?.auditLogs || [];
  const serverTime = snapshot?.serverTime || new Date().toISOString();

  const activeQueueList = queueEntries.filter(
      (q) => q.status === 'ACTIVE' || q.status === 'WAITING'
  );
  const currentActiveTeam = eventSettings.currentActiveTeamId
      ? teams.find((t) => t.teamId === eventSettings.currentActiveTeamId) ?? null
      : null;
  const currentActiveEntry = activeQueueList.find((q) => q.status === 'ACTIVE') ?? null;
  const activePresence = currentActiveTeam
      ? getPresenceState(currentActiveTeam.lastSeenAt, serverTime)
      : null;

  const authCount = teams.filter((t) => t.authenticationStatus === 'AUTHENTICATED').length;
  const disconnectedInQueue = activeQueueList.filter((q) => {
    const t = teams.find((x) => x.teamId === q.teamId);
    return getPresenceState(t?.lastSeenAt ?? q.lastHeartbeatAt, serverTime).status === 'OFFLINE';
  }).length;

  return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <HudCard highlight className="p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00E1FF]/45 bg-[#00E1FF]/15 px-3 py-1 font-display text-[10px] font-bold tracking-[0.2em] text-[#00E1FF] uppercase">
                <ShieldCheck className="h-3.5 w-3.5" />
                INTEGRATED LIVE DRAW ADMIN
              </span>
                <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase ${
                        connected
                            ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-400/40 bg-rose-500/10 text-rose-300'
                    }`}
                >
                <Radio className="h-3 w-3" />
                  {connected ? 'LIVE STREAM SYNCED' : 'RECONNECTING'}
              </span>
              </div>
              <h1 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold tracking-wider text-white uppercase">
                INNOHACK <span className="text-inno-gradient">ALLOCATION COMMAND CENTER</span>
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#8AA2BE]">
                Shared database control plane for all 30 squads, global FIFO queue sequencing,
                disconnected session recovery, and official master reports.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                  type="button"
                  disabled={busyAction || eventSettings.eventStatus === 'COMPLETED'}
                  onClick={handleTogglePause}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-display text-[11px] font-bold tracking-wider uppercase transition ${
                      eventSettings.queuePaused
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                          : 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  } disabled:opacity-45`}
              >
                {eventSettings.queuePaused ? (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Resume Queue
                    </>
                ) : (
                    <>
                      <PauseCircle className="h-4 w-4" />
                      Pause Queue Admissions
                    </>
                )}
              </button>

              <button
                  type="button"
                  onClick={() => downloadAdminCompletePdf(snapshot)}
                  className="btn-inno-primary px-4 py-2.5 text-[11px]"
              >
                <FileText className="h-4 w-4" />
                Complete Report – PDF
              </button>

              <button
                  type="button"
                  onClick={() => downloadAdminCompleteCsv(snapshot)}
                  className="btn-inno-secondary px-4 py-2.5 text-[11px]"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#00E1FF]" />
                Complete Data – CSV
              </button>
            </div>
          </div>
        </HudCard>

        {feedback && (
            <div
                className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm ${
                    feedback.type === 'ok'
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-500/45 bg-rose-500/10 text-rose-200'
                }`}
            >
              <div className="flex items-center gap-2.5">
                {feedback.type === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-xs opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'REGISTERED', value: String(eventSettings.totalTeams), color: 'text-white' },
            { label: 'AUTHENTICATED', value: `${authCount} / 30`, color: 'text-[#00E1FF]' },
            { label: 'IN FIFO QUEUE', value: String(activeQueueList.length), color: 'text-amber-300' },
            {
              label: 'DRAWS COMPLETE',
              value: `${eventSettings.completedDraws} / 30`,
              color: 'text-emerald-400',
            },
            {
              label: 'DISCONNECTED',
              value: String(disconnectedInQueue),
              color: disconnectedInQueue > 0 ? 'text-rose-400' : 'text-slate-300',
            },
            {
              label: 'LAST SEQ #',
              value: `#${eventSettings.lastQueueSequence}`,
              color: 'text-[#6DB3FF]',
            },
          ].map((k) => (
              <div
                  key={k.label}
                  className="rounded-xl border border-[#142D48] bg-[#091625]/90 px-4 py-3.5"
              >
                <div className="font-display text-[9px] tracking-[0.18em] text-[#7390AE] uppercase">
                  {k.label}
                </div>
                <div className={`mt-1.5 font-display text-xl font-extrabold ${k.color}`}>{k.value}</div>
              </div>
          ))}
        </div>

        <div className="mt-6">
          <GroupProgressPanel groups={groups} />
        </div>

        <HudCard brackets={false} className="mt-6 p-5 sm:p-6 border-[#00E1FF]/30">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#00E1FF]" />
                <h2 className="font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-white uppercase">
                  ACTIVE SPINNER &amp; SESSION RECOVERY CONTROL
                </h2>
              </div>

              {currentActiveTeam && currentActiveEntry ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-xl font-extrabold text-[#00E1FF]">
                    {currentActiveTeam.teamId}
                  </span>
                      <span className="font-mono text-sm text-white">
                    Student ID: {currentActiveTeam.studentId}
                  </span>
                      <span className="rounded border border-[#1B3A5B] bg-[#0B1C30] px-2 py-0.5 font-mono text-xs text-[#8AA2BE]">
                    FIFO Ticket #{currentActiveEntry.sequenceNumber}
                  </span>

                      {activePresence?.status === 'ONLINE' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300">
                      <Wifi className="h-3 w-3" />
                      ONLINE ({activePresence.ageSec}s ago)
                    </span>
                      )}
                      {activePresence?.status === 'STALE' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[10px] text-amber-300">
                      <Clock className="h-3 w-3" />
                      IDLE / STALE ({activePresence.ageSec}s ago)
                    </span>
                      )}
                      {activePresence?.status === 'OFFLINE' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/45 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[10px] text-rose-300 animate-pulse">
                      <WifiOff className="h-3 w-3" />
                      DISCONNECTED ({activePresence.ageSec ?? '?'}s ago)
                    </span>
                      )}
                    </div>
                    <p className="text-xs text-[#7F9AB7]">
                      Activated at {formatAllocationTimestamp(currentActiveEntry.activatedAt)}. Active
                      turns are preserved automatically on temporary disconnects; use the audited
                      controls on the right only if the session is confirmed abandoned.
                    </p>
                  </div>
              ) : (
                  <p className="mt-2 text-xs text-[#7693B1]">
                    No team is currently active at the spinning wheel. The next team to join the FIFO
                    queue will activate automatically.
                  </p>
              )}
            </div>

            {currentActiveTeam && (
                <div className="w-full lg:w-[430px] rounded-xl border border-[#173352] bg-[#06111F] p-4 space-y-3">
                  <div className="flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.18em] text-amber-300 uppercase">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    RESOLVE ABANDONED ACTIVE SESSION (AUDITED)
                  </div>
                  <input
                      type="text"
                      value={abandonedReason}
                      onChange={(e) => setAbandonedReason(e.target.value)}
                      placeholder="Mandatory audit reason (e.g. Leader offline >3 mins)"
                      className="w-full rounded-lg border border-[#19385A] bg-[#091625] px-3 py-2 text-xs text-white placeholder-[#52708F] outline-none focus:border-[#00E1FF]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={busyAction || activeQueueList.length < 2}
                        onClick={() => handleResolveAbandoned(currentActiveTeam.teamId, 'MOVE_TO_BACK')}
                        className="flex-1 rounded-lg border border-amber-400/45 bg-amber-500/15 px-3 py-2 font-display text-[10px] font-bold tracking-wider text-amber-200 uppercase hover:bg-amber-500/25 disabled:opacity-40 transition"
                    >
                      Move to Back of Queue
                    </button>
                    <button
                        type="button"
                        disabled={busyAction}
                        onClick={() =>
                            handleResolveAbandoned(currentActiveTeam.teamId, 'RELEASE_TO_IDLE')
                        }
                        className="flex-1 rounded-lg border border-rose-500/45 bg-rose-500/15 px-3 py-2 font-display text-[10px] font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-500/25 disabled:opacity-40 transition"
                    >
                      Release Active Slot
                    </button>
                  </div>
                </div>
            )}
          </div>
        </HudCard>

        <div className="mt-8 flex flex-wrap gap-2 border-b border-[#142D48] pb-3">
          {[
            { id: 'queue' as AdminTab, label: `Live FIFO Queue (${activeQueueList.length})`, icon: Radio },
            { id: 'groups' as AdminTab, label: 'Group Rosters (A / B / C)', icon: Layers },
            { id: 'teams' as AdminTab, label: `All 30 Teams`, icon: Users },
            {
              id: 'history' as AdminTab,
              label: `Draw History (${drawHistory.length}) & Audit Log`,
              icon: History,
            },
          ].map((tab) => (
              <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-display text-[11px] font-bold tracking-wider uppercase transition ${
                      activeTab === tab.id
                          ? 'border-[#00E1FF] bg-[#00E1FF]/15 text-[#00E1FF] shadow-cyanGlow'
                          : 'border-[#142D48] bg-[#081524] text-[#8AA2BE] hover:border-[#1E456E] hover:text-white'
                  }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
          ))}
        </div>

        {activeTab === 'queue' && (
            <HudCard brackets={false} className="mt-5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#142D48] bg-[#06111F] font-display text-[10px] tracking-[0.16em] text-[#7D97B4] uppercase">
                  <tr>
                    <th className="px-4 py-3.5">Pos</th>
                    <th className="px-4 py-3.5">Ticket #</th>
                    <th className="px-4 py-3.5">Team ID</th>
                    <th className="px-4 py-3.5">Student ID</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Presence</th>
                    <th className="px-4 py-3.5">Joined At</th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-[#10243B]">
                  {activeQueueList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-[#6B88A6]">
                          Global FIFO queue is currently empty.
                        </td>
                      </tr>
                  ) : (
                      activeQueueList.map((entry, idx) => {
                        const team = teams.find((t) => t.teamId === entry.teamId);
                        const presence = getPresenceState(
                            team?.lastSeenAt ?? entry.lastHeartbeatAt,
                            serverTime
                        );
                        return (
                            <tr
                                key={entry.queueEntryId}
                                className={entry.status === 'ACTIVE' ? 'bg-[#00E1FF]/8' : 'hover:bg-white/[0.02]'}
                            >
                              <td className="px-4 py-3 font-display font-bold text-white">#{idx + 1}</td>
                              <td className="px-4 py-3 font-mono text-[#00E1FF]">
                                #{entry.sequenceNumber}
                              </td>
                              <td className="px-4 py-3 font-display font-bold text-white">
                                {entry.teamId}
                              </td>
                              <td className="px-4 py-3 font-mono text-[#C7DCF2]">
                                {entry.studentId ?? team?.studentId}
                              </td>
                              <td className="px-4 py-3">
                          <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 font-display text-[9px] font-bold tracking-wider uppercase ${
                                  entry.status === 'ACTIVE'
                                      ? 'border-[#00E1FF]/55 bg-[#00E1FF]/15 text-[#00E1FF]'
                                      : 'border-amber-400/35 bg-amber-500/10 text-amber-300'
                              }`}
                          >
                            {entry.status === 'ACTIVE' ? 'CURRENTLY SPINNING' : 'WAITING'}
                          </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px]">
                                {presence.status === 'ONLINE' && (
                                    <span className="inline-flex items-center gap-1 text-emerald-400">
                              <Wifi className="h-3 w-3" /> Online ({presence.ageSec}s)
                            </span>
                                )}
                                {presence.status === 'STALE' && (
                                    <span className="inline-flex items-center gap-1 text-amber-300">
                              <Clock className="h-3 w-3" /> Stale ({presence.ageSec}s)
                            </span>
                                )}
                                {presence.status === 'OFFLINE' && (
                                    <span className="inline-flex items-center gap-1 text-rose-400">
                              <WifiOff className="h-3 w-3" /> Disconnected
                            </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px] text-[#7D97B4]">
                                {formatAllocationTimestamp(entry.joinedAt)}
                              </td>
                            </tr>
                        );
                      })
                  )}
                  </tbody>
                </table>
              </div>
            </HudCard>
        )}

        {activeTab === 'groups' && (
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {groups.map((g) => {
                const members = teams
                    .filter((t) => t.assignedGroup === g.groupId)
                    .sort((a, b) => (a.drawOrder ?? 999) - (b.drawOrder ?? 999));

                return (
                    <HudCard key={g.groupId} brackets={false} className="p-5">
                      <div className="flex items-center justify-between border-b border-[#142D48] pb-3">
                        <h3 className="font-display text-sm font-extrabold tracking-wider text-white uppercase">
                          {g.groupName}
                        </h3>
                        <span className="font-mono text-xs font-bold text-[#00E1FF]">
                    {members.length} / {g.maxCapacity}
                  </span>
                      </div>

                      {members.length === 0 ? (
                          <div className="py-10 text-center text-xs text-[#6582A1]">
                            No teams assigned to {g.groupName} yet.
                          </div>
                      ) : (
                          <div className="mt-3 space-y-2">
                            {members.map((m, idx) => (
                                <div
                                    key={m.teamId}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-[#132B45] bg-[#06111F] px-3 py-2.5 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-[#00E1FF]">
                              {idx + 1}.
                            </span>
                                      <span className="font-display font-bold text-white">{m.teamId}</span>
                                      <span className="font-mono text-[10px] text-[#6B88A6]">
                              (Draw #{m.drawOrder})
                            </span>
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] text-[#9BB4CF]">
                                      {m.studentId} · {m.maskedRegistrationCode}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        title="Audited Controlled Reassignment"
                                        onClick={() => {
                                          const other =
                                              groups.find(
                                                  (og) => og.groupId !== g.groupId && og.teamCount < og.maxCapacity
                                              )?.groupId ?? 'GROUP_A';
                                          setReassignTeam(m);
                                          setReassignTarget(other);
                                          setReassignReason('');
                                        }}
                                        className="rounded-md border border-[#19385A] bg-[#0A1A2D] p-1.5 text-[#7D97B4] hover:border-[#00E1FF] hover:text-[#00E1FF] transition"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                        type="button"
                                        title="Delete Allocation & Reset Team"
                                        onClick={() => {
                                          setDeleteTeam(m);
                                          setDeleteReason('');
                                        }}
                                        className="rounded-md border border-rose-500/45 bg-rose-500/15 p-1.5 text-rose-300 hover:bg-rose-500/25 transition"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                            ))}
                          </div>
                      )}
                    </HudCard>
                );
              })}
            </div>
        )}

        {activeTab === 'teams' && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B88A6]" />
                  <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by Team ID, Student ID, masked code, or group..."
                      className="w-full rounded-xl border border-[#163352] bg-[#081525] py-2.5 pl-10 pr-4 text-xs text-white placeholder-[#567493] outline-none focus:border-[#00E1FF]"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'ALL', label: 'All (30)' },
                    { key: 'AUTHENTICATED', label: 'Logged In' },
                    { key: 'IN_QUEUE', label: 'In Queue' },
                    { key: 'COMPLETED', label: 'Drawn' },
                    { key: 'PENDING', label: 'Pending' },
                    { key: 'GROUP_A', label: 'Grp A' },
                    { key: 'GROUP_B', label: 'Grp B' },
                    { key: 'GROUP_C', label: 'Grp C' },
                  ].map((f) => (
                      <button
                          key={f.key}
                          type="button"
                          onClick={() => setStatusFilter(f.key)}
                          className={`rounded-md border px-2.5 py-1.5 font-display text-[10px] font-bold tracking-wider uppercase transition ${
                              statusFilter === f.key
                                  ? 'border-[#00E1FF] bg-[#00E1FF]/15 text-[#00E1FF]'
                                  : 'border-[#142D48] bg-[#081525] text-[#7D97B4] hover:text-white'
                          }`}
                      >
                        {f.label}
                      </button>
                  ))}
                </div>
              </div>

              <HudCard brackets={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#142D48] bg-[#06111F] font-display text-[10px] tracking-[0.15em] text-[#7D97B4] uppercase">
                    <tr>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3">Student ID</th>
                      <th className="px-4 py-3">Reg Ref</th>
                      <th className="px-4 py-3">Auth</th>
                      <th className="px-4 py-3">Queue</th>
                      <th className="px-4 py-3">Draw #</th>
                      <th className="px-4 py-3">Assigned Group</th>
                      <th className="px-4 py-3">Presence</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-[#10243B]">
                    {filteredTeams.map((t) => {
                      const presence = getPresenceState(t.lastSeenAt, serverTime);
                      return (
                          <tr key={t.teamId} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 font-display font-bold text-white">
                              {t.teamId}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[#D2E4F7]">{t.studentId}</td>
                            <td className="px-4 py-2.5 font-mono text-[#7D97B4]">
                              {t.maskedRegistrationCode}
                            </td>
                            <td className="px-4 py-2.5">
                          <span
                              className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                                  t.authenticationStatus === 'AUTHENTICATED'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-800 text-slate-400'
                              }`}
                          >
                            {t.authenticationStatus === 'AUTHENTICATED' ? 'VERIFIED' : 'IDLE'}
                          </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px]">
                              {t.queueStatus}
                              {t.queueNumber ? ` (#${t.queueNumber})` : ''}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[#00E1FF]">
                              {t.drawOrder ? `#${t.drawOrder}` : '-'}
                            </td>
                            <td className="px-4 py-2.5">
                              {t.assignedGroupName ? (
                                  <span className="rounded border border-[#00E1FF]/40 bg-[#00E1FF]/10 px-2 py-0.5 font-display text-[10px] font-bold text-[#00E1FF]">
                              {t.assignedGroupName.toUpperCase()}
                            </span>
                              ) : (
                                  <span className="text-[#597796]">Pending</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10px]">
                              {presence.status === 'ONLINE' ? (
                                  <span className="text-emerald-400">ONLINE</span>
                              ) : presence.status === 'STALE' ? (
                                  <span className="text-amber-300">STALE</span>
                              ) : (
                                  <span className="text-slate-500">OFFLINE</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {t.drawCompleted ? (
                                  <button
                                      type="button"
                                      title="Delete Group Allocation & Reset Team"
                                      onClick={() => {
                                        setDeleteTeam(t);
                                        setDeleteReason('');
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/15 px-2.5 py-1 font-display text-[10px] font-bold text-rose-300 hover:bg-rose-500/25 transition"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </button>
                              ) : (
                                  <span className="text-[10px] text-[#456280]">—</span>
                              )}
                            </td>
                          </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </HudCard>
            </div>
        )}

        {activeTab === 'history' && (
            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <HudCard brackets={false} className="p-5">
                <h3 className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase border-b border-[#142D48] pb-3">
                  CONFIRMED DRAW HISTORY ({drawHistory.length} / 30)
                </h3>
                <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                  {drawHistory.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[#6684A3]">
                        No draws completed yet.
                      </div>
                  ) : (
                      drawHistory
                          .slice()
                          .reverse()
                          .map((h) => (
                              <div
                                  key={h.drawId}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-[#132B45] bg-[#06111F] px-3.5 py-2.5 text-xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#00E1FF]">
                            Draw #{String(h.drawOrder).padStart(2, '0')}
                          </span>
                                    <span className="font-display font-bold text-white">{h.teamId}</span>
                                    <span className="font-mono text-[11px] text-[#9AB4CF]">
                            {h.studentId}
                          </span>
                                  </div>
                                  <div className="mt-0.5 font-mono text-[10px] text-[#6684A3]">
                                    Queue #{h.sequenceNumber} · {formatAllocationTimestamp(h.timestamp)}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 font-display text-[10px] font-bold text-emerald-300">
                        {h.assignedGroupName.toUpperCase()}
                      </span>
                              </div>
                          ))
                  )}
                </div>
              </HudCard>

              <HudCard brackets={false} className="p-5">
                <h3 className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase border-b border-[#142D48] pb-3">
                  SECURITY &amp; ADMIN AUDIT TRAIL ({auditLogs.length})
                </h3>
                <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                  {auditLogs.map((log) => (
                      <div
                          key={log.logId}
                          className="rounded-lg border border-[#132B45] bg-[#06111F] px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-[#00E1FF]">
                      {log.action}
                    </span>
                          <span className="font-mono text-[10px] text-[#5F7D9C]">
                      {formatAllocationTimestamp(log.timestamp)}
                    </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#B0C6DE] leading-relaxed">{log.details}</p>
                        <div className="mt-1 font-mono text-[10px] text-[#6583A2]">
                          Actor: {log.actor} {log.teamId ? `· Team: ${log.teamId}` : ''}
                        </div>
                      </div>
                  ))}
                </div>
              </HudCard>
            </div>
        )}

        {reassignTeam && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <HudCard highlight className="w-full max-w-md p-6">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-display text-sm font-bold tracking-wider uppercase">
                    AUDITED GROUP CORRECTION
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#8AA2BE]">
                  Reassigning <strong className="text-white">{reassignTeam.teamId}</strong> (
                  {reassignTeam.studentId}) from{' '}
                  <strong className="text-[#00E1FF]">{reassignTeam.assignedGroupName}</strong>. Target
                  group must have open capacity (&lt;10 teams). Action is permanently logged.
                </p>

                <form onSubmit={handleReassignSubmit} className="mt-4 space-y-4">
                  <div>
                    <label className="block font-display text-[10px] tracking-[0.16em] text-[#8AA2BE] uppercase mb-1.5">
                      Target Group
                    </label>
                    <select
                        value={reassignTarget}
                        onChange={(e) => setReassignTarget(e.target.value as GroupId)}
                        className="w-full rounded-lg border border-[#19385A] bg-[#06111F] px-3 py-2.5 text-xs text-white outline-none focus:border-[#00E1FF]"
                    >
                      {groups.map((g) => (
                          <option
                              key={g.groupId}
                              value={g.groupId}
                              disabled={
                                  g.groupId === reassignTeam.assignedGroup || g.teamCount >= g.maxCapacity
                              }
                          >
                            {g.groupName} ({g.teamCount}/{g.maxCapacity})
                            {g.groupId === reassignTeam.assignedGroup ? ' — Current' : ''}
                            {g.teamCount >= g.maxCapacity ? ' — FULL' : ''}
                          </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-display text-[10px] tracking-[0.16em] text-[#8AA2BE] uppercase mb-1.5">
                      Mandatory Audit Reason
                    </label>
                    <textarea
                        rows={3}
                        value={reassignReason}
                        onChange={(e) => setReassignReason(e.target.value)}
                        placeholder="Describe organizer authorization & reason for adjustment..."
                        className="w-full rounded-lg border border-[#19385A] bg-[#06111F] px-3 py-2 text-xs text-white placeholder-[#52708F] outline-none focus:border-[#00E1FF]"
                        required
                    />
                  </div>

                  <div className="flex justify-end gap-2.5">
                    <button
                        type="button"
                        onClick={() => setReassignTeam(null)}
                        className="btn-inno-secondary px-4 py-2 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={busyAction}
                        className="btn-inno-primary px-5 py-2 text-[11px]"
                    >
                      Confirm &amp; Log
                    </button>
                  </div>
                </form>
              </HudCard>
            </div>
        )}

        {deleteTeam && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
              <HudCard highlight className="w-full max-w-md p-6 border-rose-500/50">
                <div className="flex items-center gap-2 text-rose-400">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="font-display text-sm font-bold tracking-wider uppercase">
                    DELETE TEAM ALLOCATION
                  </h3>
                </div>
                <p className="mt-2 text-xs text-[#8AA2BE]">
                  Are you sure you want to remove <strong className="text-white">{deleteTeam.teamId}</strong> ({deleteTeam.studentId}) from{' '}
                  <strong className="text-rose-300">{deleteTeam.assignedGroupName}</strong>? This will free up the group slot, update Firebase Firestore, and allow the team to spin again.
                </p>

                <form onSubmit={handleDeleteSubmit} className="mt-4 space-y-4">
                  <div>
                    <label className="block font-display text-[10px] tracking-[0.16em] text-[#8AA2BE] uppercase mb-1.5">
                      Mandatory Audit Reason
                    </label>
                    <textarea
                        rows={3}
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        placeholder="Enter reason for deleting this allocation..."
                        className="w-full rounded-lg border border-rose-500/40 bg-[#06111F] px-3 py-2 text-xs text-white placeholder-[#52708F] outline-none focus:border-rose-400"
                        required
                    />
                  </div>

                  <div className="flex justify-end gap-2.5">
                    <button
                        type="button"
                        onClick={() => setDeleteTeam(null)}
                        className="btn-inno-secondary px-4 py-2 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={busyAction}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/60 bg-rose-600/80 px-5 py-2 font-display text-[11px] font-bold tracking-wider text-white uppercase hover:bg-rose-600 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Confirm Delete
                    </button>
                  </div>
                </form>
              </HudCard>
            </div>
        )}
      </div>
  );
};

export default AdminPage;