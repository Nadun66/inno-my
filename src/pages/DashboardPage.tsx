import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Hourglass,
  Layers,
  Loader2,
  Lock,
  PauseCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import { HudCard } from '../components/HudCard';
import { GroupProgressPanel } from '../components/GroupProgressPanel';
import { SpinningWheel } from '../components/SpinningWheel';
import { AllocationCertificate } from '../components/AllocationCertificate';
import { portalApi } from '../services/portalApi';
import { soundFx } from '../utils/soundFx';
import { formatAllocationTimestamp } from '../utils/exportCsv';
import type { SpinResult, TeamLeaderSnapshot } from '../types/portal';

interface DashboardPageProps {
  initialSnapshot?: TeamLeaderSnapshot | null;
  onSessionExpired: () => void;
  onSnapshotMeta?: (meta: {
    teamLabel: string;
    studentId: string;
    eventStatus: 'LIVE' | 'COMPLETED';
    queuePaused: boolean;
    connected: boolean;
  }) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  initialSnapshot = null,
  onSessionExpired,
  onSnapshotMeta,
}) => {
  const [snapshot, setSnapshot] = useState<TeamLeaderSnapshot | null>(initialSnapshot);
  const [connected, setConnected] = useState(true);
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [spinAnimLocked, setSpinAnimLocked] = useState(false);

  const prevQueueStatusRef = useRef<string | null>(initialSnapshot?.team.queueStatus ?? null);

  // Real-time subscription (Firestore onSnapshot in Firebase mode / SSE in local mode)
  useEffect(() => {
    const unsub = portalApi.subscribeTeamSnapshot(
      (nextSnap) => {
        setSnapshot(nextSnap);
        // Play subtle celebratory cue when promoted from WAITING -> ACTIVE
        if (
          prevQueueStatusRef.current === 'WAITING' &&
          nextSnap.team.queueStatus === 'ACTIVE'
        ) {
          soundFx.playTurnActive();
        }
        prevQueueStatusRef.current = nextSnap.team.queueStatus;
      },
      (isConnected) => {
        setConnected(isConnected);
      },
      () => {
        onSessionExpired();
      }
    );

    return () => unsub();
  }, [onSessionExpired]);

  // Notify Navbar of live metadata
  useEffect(() => {
    if (snapshot && onSnapshotMeta) {
      onSnapshotMeta({
        teamLabel: snapshot.team.teamId,
        studentId: snapshot.team.studentId,
        eventStatus: snapshot.eventSettings.eventStatus,
        queuePaused: snapshot.eventSettings.queuePaused,
        connected,
      });
    }
  }, [snapshot, connected, onSnapshotMeta]);

  // Presence Heartbeat every 8 seconds (enables admin disconnect monitor without auto-skip)
  useEffect(() => {
    const sendBeat = () => {
      void portalApi.sendHeartbeat().catch(() => {});
    };
    sendBeat();
    const timer = window.setInterval(sendBeat, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const queueMetrics = useMemo(() => {
    if (!snapshot) {
      return {
        position: null as number | null,
        aheadCount: 0,
        totalInQueue: 0,
        activeEntry: null,
        progressPct: 0,
      };
    }

    const list = snapshot.activeQueue;
    const myIndex = list.findIndex((q) => q.teamId === snapshot.team.teamId);
    const activeEntry = list.find((q) => q.status === 'ACTIVE') ?? list[0] ?? null;

    if (myIndex === -1) {
      return {
        position: null,
        aheadCount: 0,
        totalInQueue: list.length,
        activeEntry,
        progressPct: snapshot.team.drawCompleted ? 100 : 0,
      };
    }

    const position = myIndex + 1;
    const aheadCount = myIndex;
    // Progress fills smoothly as teams ahead drop toward 0
    const denom = Math.max(list.length, position);
    const progressPct =
      position === 1 ? 100 : Math.max(12, Math.round(((denom - aheadCount) / denom) * 100));

    return {
      position,
      aheadCount,
      totalInQueue: list.length,
      activeEntry,
      progressPct,
    };
  }, [snapshot]);

  const handleJoinQueue = async () => {
    setActionError(null);
    setJoining(true);
    try {
      const res = await portalApi.joinDrawQueue();
      if ('snapshot' in res && res.snapshot) {
        setSnapshot(res.snapshot as TeamLeaderSnapshot);
      }
      if (res.status === 'ACTIVE') {
        soundFx.playTurnActive();
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to join the live draw queue.'
      );
    } finally {
      setJoining(false);
    }
  };

  const handleRequestSpin = async (): Promise<SpinResult> => {
    setSpinAnimLocked(true);
    try {
      const result = await portalApi.executeSpin();
      return result;
    } catch (err) {
      setSpinAnimLocked(false);
      throw err;
    }
  };

  const handleSpinRevealComplete = () => {
    setSpinAnimLocked(false);
  };

  if (!snapshot) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-7xl flex-col items-center justify-center px-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#00E1FF]" />
        <p className="mt-4 font-display text-xs tracking-[0.22em] text-[#8AA2BE] uppercase">
          SYNCHRONIZING LIVE FIFO ARENA STATE...
        </p>
      </div>
    );
  }

  const { team, eventSettings, groups, activeQueue, recentDraws } = snapshot;
  const remainingTeams = Math.max(0, eventSettings.totalTeams - eventSettings.completedDraws);

  // Determine which primary stage view to display
  const showSpinningStage =
    spinAnimLocked || (!team.drawCompleted && team.queueStatus === 'ACTIVE');
  const showCompletedStage = !spinAnimLocked && team.drawCompleted;
  const showWaitingStage =
    !spinAnimLocked && !team.drawCompleted && team.queueStatus === 'WAITING';
  const showJoinStage =
    !spinAnimLocked && !team.drawCompleted && team.queueStatus === 'NOT_JOINED';

  const drawStatusMeta = team.drawCompleted
    ? { label: `ALLOCATED · ${team.assignedGroupName}`, color: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15' }
    : team.queueStatus === 'ACTIVE'
    ? { label: 'YOUR TURN — SPIN ACTIVE', color: 'text-[#00E1FF] border-[#00E1FF]/50 bg-[#00E1FF]/15 animate-pulse' }
    : team.queueStatus === 'WAITING'
    ? { label: `IN QUEUE · POSITION #${queueMetrics.position ?? '?'}`, color: 'text-amber-300 border-amber-400/40 bg-amber-500/15' }
    : { label: 'READY TO JOIN QUEUE', color: 'text-sky-300 border-sky-400/35 bg-sky-500/10' };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Reconnection Banner (preserves active turn on temporary network drops) */}
      {!connected && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-400/45 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-200">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
            <span>
              <strong>Temporary connection interruption detected.</strong> Your login session and
              FIFO queue position are safely preserved on the server while reconnecting...
            </span>
          </div>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
        </div>
      )}

      {/* Personalized Welcome Header Card */}
      <HudCard brackets={false} className="p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 font-display text-[10px] font-bold tracking-[0.18em] text-emerald-300 uppercase">
                <ShieldCheck className="h-3.5 w-3.5" />
                REGISTRATION VERIFIED
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[10px] font-bold tracking-[0.18em] uppercase ${drawStatusMeta.color}`}
              >
                {drawStatusMeta.label}
              </span>
            </div>

            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold tracking-wider text-white uppercase">
              WELCOME, <span className="text-inno-gradient">TEAM LEADER</span>
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm text-[#8AA2BE]">
              <span>
                Squad: <strong className="font-display text-white">{team.teamId}</strong> ({team.teamName})
              </span>
              <span>
                Student ID: <strong className="font-mono text-[#00E1FF]">{team.studentId}</strong>
              </span>
              <span>
                Reg Code: <strong className="font-mono text-white">{team.maskedRegistrationCode}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-[#163454] bg-[#06111F] px-4 py-3 text-right">
              <div className="font-display text-[9px] tracking-[0.2em] text-[#6E8BA8] uppercase">
                LIVE EVENT STATUS
              </div>
              <div className="mt-1 flex items-center justify-end gap-2 font-display text-sm font-bold text-white">
                <span
                  className={`h-2 w-2 rounded-full ${
                    eventSettings.eventStatus === 'COMPLETED'
                      ? 'bg-emerald-400'
                      : eventSettings.queuePaused
                      ? 'bg-amber-400'
                      : 'bg-[#00E1FF] animate-pulse'
                  }`}
                />
                {eventSettings.eventStatus === 'COMPLETED'
                  ? 'DRAW COMPLETE'
                  : eventSettings.queuePaused
                  ? 'QUEUE PAUSED'
                  : 'LIVE DRAW OPEN'}
              </div>
            </div>
          </div>
        </div>
      </HudCard>

      {/* 4 Telemetry KPI Cards (with subtle watermark indices matching reference design) */}
      <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          {
            idx: '01',
            label: 'YOUR QUEUE POSITION',
            value: team.drawCompleted
              ? `DRAWN #${team.drawOrder}`
              : queueMetrics.position
              ? `#${queueMetrics.position}`
              : 'NOT JOINED',
            sub: team.queueNumber ? `FIFO Ticket #${team.queueNumber}` : 'Click Join to enter',
            accent: team.queueStatus === 'ACTIVE' ? 'text-[#00E1FF]' : 'text-white',
            icon: Radio,
          },
          {
            idx: '02',
            label: 'PARTICIPANTS AHEAD',
            value: team.drawCompleted
              ? '0'
              : team.queueStatus === 'ACTIVE'
              ? '0 · YOUR TURN'
              : team.queueStatus === 'WAITING'
              ? `${queueMetrics.aheadCount}`
              : `${queueMetrics.totalInQueue} IN QUEUE`,
            sub:
              team.queueStatus === 'WAITING'
                ? 'Updates live in real time'
                : team.queueStatus === 'ACTIVE'
                ? 'Spin wheel unlocked'
                : `${queueMetrics.totalInQueue} active in FIFO line`,
            accent: team.queueStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-[#00E1FF]',
            icon: Hourglass,
          },
          {
            idx: '03',
            label: 'REMAINING TEAMS',
            value: `${remainingTeams} / ${eventSettings.totalTeams}`,
            sub: `${eventSettings.completedDraws} squads allocated`,
            accent: 'text-white',
            icon: Users,
          },
          {
            idx: '04',
            label: 'ASSIGNED GROUP',
            value: team.assignedGroupName ? team.assignedGroupName.toUpperCase() : 'PENDING',
            sub: team.drawCompleted
              ? 'Permanently locked'
              : '3 groups · max 10 each',
            accent: team.drawCompleted ? 'text-emerald-400' : 'text-[#7DA0C4]',
            icon: Layers,
          },
        ].map((kpi) => (
          <div
            key={kpi.idx}
            className="relative overflow-hidden rounded-xl border border-[#142D48] bg-[#091625]/90 p-4 sm:p-5"
          >
            <span className="pointer-events-none absolute right-3 top-1 font-display text-4xl font-black text-white/[0.04] select-none">
              {kpi.idx}
            </span>
            <div className="flex items-center gap-2 text-[#00E1FF]">
              <kpi.icon className="h-4 w-4" />
              <span className="font-display text-[9px] sm:text-[10px] font-semibold tracking-[0.18em] text-[#7D97B4] uppercase">
                {kpi.label}
              </span>
            </div>
            <div className={`mt-2.5 font-display text-lg sm:text-2xl font-extrabold ${kpi.accent}`}>
              {kpi.value}
            </div>
            <div className="mt-1 text-[11px] text-[#6684A3]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ===================================================================== */}
      {/* PRIMARY INTERACTIVE STAGE (Join -> Waiting -> Active Spin -> Complete)*/}
      {/* ===================================================================== */}
      <div className="mt-8">
        {/* STATE 1: READY TO JOIN GLOBAL FIFO QUEUE */}
        {showJoinStage && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <HudCard highlight className="p-6 sm:p-10 text-center">
              <span className="section-kicker">STEP 01 · GLOBAL FIFO ADMISSION</span>
              <h2 className="mt-3 font-display text-2xl sm:text-4xl font-extrabold tracking-wider text-white uppercase">
                ENTER THE LIVE <span className="text-inno-gradient">DRAW QUEUE</span>
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-[#8AA2BE] leading-relaxed">
                Click the button below to claim your atomic server-assigned FIFO queue position.
                Earlier entrants always spin first. Once your turn arrives, your personal live
                spinning wheel will automatically activate on this screen.
              </p>

              {/* Queue Paused Notice */}
              {eventSettings.queuePaused && (
                <div className="mx-auto mt-6 flex max-w-lg items-center justify-center gap-2.5 rounded-xl border border-amber-400/45 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-200">
                  <PauseCircle className="h-5 w-5 shrink-0 text-amber-400" />
                  <span>
                    Queue admissions are currently paused by the Hackathon Organizers. Please stay
                    on this screen — it will unlock automatically when resumed.
                  </span>
                </div>
              )}

              {actionError && (
                <div className="mx-auto mt-5 flex max-w-lg items-start gap-2.5 rounded-xl border border-rose-500/45 bg-rose-500/10 px-4 py-3 text-left text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="mt-8 flex flex-col items-center gap-3">
                <button
                  type="button"
                  disabled={joining || eventSettings.queuePaused || eventSettings.eventStatus === 'COMPLETED'}
                  onClick={handleJoinQueue}
                  className="btn-inno-primary px-10 py-4 text-sm sm:text-base min-w-[280px]"
                >
                  {joining ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      SECURING FIFO POSITION...
                    </>
                  ) : (
                    <>
                      <Zap className="h-5 w-5 fill-[#04101E]" />
                      JOIN THE DRAW QUEUE
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
                <span className="text-[11px] text-[#6B88A6]">
                  Strictly 1 queue entry &amp; 1 official spin per squad · Protected by Firestore atomic transactions
                </span>
              </div>
            </HudCard>
          </motion.div>
        )}

        {/* STATE 2: WAITING IN GLOBAL FIFO QUEUE */}
        {showWaitingStage && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <HudCard glow className="p-6 sm:p-9">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-center">
                {/* Left: Live Ticket & Progress */}
                <div className="lg:col-span-7">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/45 bg-amber-500/15 px-4 py-1.5 font-display text-[11px] font-bold tracking-[0.22em] text-amber-300 uppercase">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    WAITING FOR YOUR TURN
                  </div>

                  <h2 className="mt-4 font-display text-2xl sm:text-3xl font-extrabold tracking-wider text-white uppercase">
                    YOU ARE <span className="text-inno-gradient">#{queueMetrics.position}</span> IN THE LIVE QUEUE
                  </h2>

                  <p className="mt-2 text-sm text-[#8AA2BE] leading-relaxed">
                    Stay right here — your personal spinning wheel will activate automatically the instant
                    the {queueMetrics.aheadCount === 1 ? 'squad' : `${queueMetrics.aheadCount} squads`} ahead
                    of you complete {queueMetrics.aheadCount === 1 ? 'its' : 'their'} draw. Refreshing this
                    page will preserve your exact queue position.
                  </p>

                  {/* Queue Ticket Strip */}
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[#18385A] bg-[#06111F] p-4 text-center">
                      <div className="font-display text-[9px] tracking-[0.18em] text-[#6E8BA8] uppercase">
                        FIFO TICKET
                      </div>
                      <div className="mt-1 font-display text-2xl font-black text-[#00E1FF]">
                        #{team.queueNumber}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#18385A] bg-[#06111F] p-4 text-center">
                      <div className="font-display text-[9px] tracking-[0.18em] text-[#6E8BA8] uppercase">
                        LIVE POSITION
                      </div>
                      <div className="mt-1 font-display text-2xl font-black text-white">
                        #{queueMetrics.position}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#18385A] bg-[#06111F] p-4 text-center">
                      <div className="font-display text-[9px] tracking-[0.18em] text-[#6E8BA8] uppercase">
                        AHEAD OF YOU
                      </div>
                      <div className="mt-1 font-display text-2xl font-black text-amber-300">
                        {queueMetrics.aheadCount}
                      </div>
                    </div>
                  </div>

                  {/* Live Queue Progress Bar */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-display text-[10px] tracking-[0.18em] text-[#8AA2BE] uppercase">
                        LIVE QUEUE PROGRESSION
                      </span>
                      <span className="font-mono text-[#00E1FF]">{queueMetrics.progressPct}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-[#0D2138] border border-[#173657]">
                      <motion.div
                        initial={false}
                        animate={{ width: `${queueMetrics.progressPct}%` }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full bg-gradient-to-r from-[#197FFF] via-[#049FFF] to-[#00E1FF] shadow-cyanGlow"
                      />
                    </div>
                    {queueMetrics.activeEntry && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-[#8AA2BE]">
                        <Sparkles className="h-3.5 w-3.5 text-[#00E1FF] animate-pulse" />
                        <span>
                          Currently Spinning:{' '}
                          <strong className="font-display text-white">
                            {queueMetrics.activeEntry.teamId}
                          </strong>{' '}
                          (Ticket #{queueMetrics.activeEntry.sequenceNumber})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Locked Wheel Preview */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center rounded-2xl border border-[#142F4C] bg-[#06111F]/90 p-6 text-center">
                  <div className="relative flex h-36 w-36 items-center justify-center rounded-full border-2 border-dashed border-[#1B426B] bg-[#09182B]">
                    <div className="absolute inset-3 rounded-full border border-[#00E1FF]/25 animate-spin [animation-duration:18s]" />
                    <Lock className="h-10 w-10 text-[#00E1FF]/70" />
                  </div>
                  <div className="mt-4 font-display text-xs font-bold tracking-[0.2em] text-white uppercase">
                    SPINNING WHEEL LOCKED
                  </div>
                  <p className="mt-1.5 max-w-xs text-xs text-[#7390AE]">
                    Only the position #1 ACTIVE team leader can trigger the server draw. Your wheel
                    will unlock automatically when your turn begins.
                  </p>
                </div>
              </div>
            </HudCard>
          </motion.div>
        )}

        {/* STATE 3: YOUR TURN — ACTIVE INDIVIDUAL SPINNING INTERFACE */}
        {showSpinningStage && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <HudCard highlight className="p-6 sm:p-10">
              <SpinningWheel
                groups={groups}
                canSpin={team.queueStatus === 'ACTIVE' && !team.drawCompleted}
                teamId={team.teamId}
                teamName={team.teamName}
                studentId={team.studentId}
                queueNumber={team.queueNumber}
                onRequestSpin={handleRequestSpin}
                onSpinComplete={handleSpinRevealComplete}
              />
            </HudCard>
          </motion.div>
        )}

        {/* STATE 4: DRAW COMPLETED — PERMANENT ALLOCATION CERTIFICATE + DOWNLOADS */}
        {showCompletedStage && <AllocationCertificate team={team} />}
      </div>

      {/* ===================================================================== */}
      {/* LOWER ARENA MONITORS: GROUP CAPACITIES + LIVE FIFO QUEUE + RECENT     */}
      {/* ===================================================================== */}
      <div className="mt-10">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-white uppercase">
            LIVE GROUP ALLOCATION PROGRESS <span className="text-[#00E1FF]">(10 / 10 / 10)</span>
          </h3>
          <span className="font-mono text-xs text-[#7D97B4]">
            {eventSettings.completedDraws} of {eventSettings.totalTeams} Completed
          </span>
        </div>
        <GroupProgressPanel groups={groups} highlightGroup={team.assignedGroup} />
      </div>

      {/* Two-Column Live Queue & Recent Draws */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Global FIFO Queue Live Table */}
        <HudCard brackets={false} className="p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[#132B45] pb-3.5">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#00E1FF] animate-pulse" />
              <h3 className="font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-white uppercase">
                GLOBAL FIFO QUEUE ({activeQueue.length})
              </h3>
            </div>
            <span className="font-mono text-[10px] text-[#6E8CA8] uppercase">
              SERVER SEQUENCE ORDER
            </span>
          </div>

          {activeQueue.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B88A6]">
              No squads currently waiting in the active queue.
            </div>
          ) : (
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {activeQueue.map((entry, idx) => {
                const isMe = entry.teamId === team.teamId;
                const isActive = entry.status === 'ACTIVE';
                return (
                  <div
                    key={entry.queueEntryId}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition ${
                      isMe
                        ? 'border-[#00E1FF]/60 bg-[#00E1FF]/12 shadow-cyanGlow'
                        : isActive
                        ? 'border-emerald-400/35 bg-emerald-500/10'
                        : 'border-[#132B45] bg-[#06111F]/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-xs font-bold ${
                          isActive
                            ? 'bg-[#00E1FF] text-[#04101E]'
                            : 'bg-[#10253D] text-[#98B4D1]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-white truncate">
                            {entry.teamId}
                          </span>
                          {isMe && (
                            <span className="rounded bg-[#00E1FF]/20 px-1.5 py-0.5 font-display text-[9px] font-bold text-[#00E1FF]">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-[#6E8BA8]">
                          Ticket #{entry.sequenceNumber} · ID {entry.maskedStudentId}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-display text-[9px] font-bold tracking-wider uppercase ${
                        isActive
                          ? 'border-[#00E1FF]/50 bg-[#00E1FF]/15 text-[#00E1FF]'
                          : 'border-[#1B3A5B] bg-[#0B1C30] text-[#8AA2BE]'
                      }`}
                    >
                      {isActive ? (isMe ? 'YOUR TURN' : 'SPINNING') : 'WAITING'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </HudCard>

        {/* Recent Confirmed Draws Feed */}
        <HudCard brackets={false} className="p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[#132B45] pb-3.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-white uppercase">
                RECENT CONFIRMED DRAWS
              </h3>
            </div>
            <span className="font-mono text-[10px] text-[#6E8CA8] uppercase">PERMANENT LEDGER</span>
          </div>

          {recentDraws.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B88A6]">
              No draws completed yet. Be the first squad to lock in a group!
            </div>
          ) : (
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {recentDraws.map((draw) => {
                const isMe = draw.teamId === team.teamId;
                return (
                  <div
                    key={draw.drawId}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
                      isMe
                        ? 'border-[#00E1FF]/55 bg-[#00E1FF]/10'
                        : 'border-[#132B45] bg-[#06111F]/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-[#00E1FF]">
                          #{String(draw.drawOrder).padStart(2, '0')}
                        </span>
                        <span className="font-display font-bold text-white">{draw.teamId}</span>
                        {isMe && (
                          <span className="rounded bg-[#00E1FF]/20 px-1.5 py-0.5 font-display text-[9px] font-bold text-[#00E1FF]">
                            YOUR SQUAD
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-[#6885A4]">
                        {formatAllocationTimestamp(draw.timestamp)}
                      </div>
                    </div>

                    <span className="shrink-0 rounded-md border border-[#1B426B] bg-[#0B1E34] px-2.5 py-1 font-display text-[10px] font-bold tracking-wider text-white">
                      {draw.assignedGroupName.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </HudCard>
      </div>
    </div>
  );
};
