import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Loader2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { GroupId, GroupRecord, SpinResult } from '../types/portal';
import { soundFx } from '../utils/soundFx';

interface WheelSlice {
  index: number;
  groupId: GroupId;
  shortLabel: string;
  fullLabel: string;
  fillStart: string;
  fillEnd: string;
  accent: string;
}

const SLICE_PALETTE: Record<
  GroupId,
  { shortLabel: string; fullLabel: string; fillStart: string; fillEnd: string; accent: string }
> = {
  GROUP_A: {
    shortLabel: 'GRP A',
    fullLabel: 'GROUP A',
    fillStart: '#083354',
    fillEnd: '#0099CC',
    accent: '#00E1FF',
  },
  GROUP_B: {
    shortLabel: 'GRP B',
    fullLabel: 'GROUP B',
    fillStart: '#0D255C',
    fillEnd: '#197FFF',
    accent: '#6CB4FF',
  },
  GROUP_C: {
    shortLabel: 'GRP C',
    fullLabel: 'GROUP C',
    fillStart: '#073B3A',
    fillEnd: '#0EA57A',
    accent: '#34D399',
  },
};

function buildTwelveSlices(eligibleGroupIds: GroupId[]): WheelSlice[] {
  const pool: GroupId[] =
    eligibleGroupIds.length > 0 ? eligibleGroupIds : ['GROUP_A', 'GROUP_B', 'GROUP_C'];
  const slices: WheelSlice[] = [];
  for (let i = 0; i < 12; i++) {
    const gid = pool[i % pool.length];
    const p = SLICE_PALETTE[gid];
    slices.push({
      index: i,
      groupId: gid,
      ...p,
    });
  }
  return slices;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  // 0 deg = 12 o'clock (top), increasing clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeWedge(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

interface SpinningWheelProps {
  groups: GroupRecord[];
  canSpin: boolean;
  teamId: string;
  teamName: string;
  studentId: string;
  queueNumber: number | null;
  onRequestSpin: () => Promise<SpinResult>;
  onSpinComplete: (result: SpinResult) => void;
}

export const SpinningWheel: React.FC<SpinningWheelProps> = ({
  groups,
  canSpin,
  teamId,
  teamName,
  studentId,
  queueNumber,
  onRequestSpin,
  onSpinComplete,
}) => {
  const [phase, setPhase] = useState<'READY' | 'REQUESTING' | 'DECELERATING' | 'REVEALED'>('READY');
  const [rotation, setRotation] = useState(0);
  const [pointerKick, setPointerKick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedResult, setRevealedResult] = useState<SpinResult | null>(null);
  const [frozenEligible, setFrozenEligible] = useState<GroupId[] | null>(null);

  const rafRef = useRef<number | null>(null);
  const rotRef = useRef<number>(0);
  const lastSliceIndexRef = useRef<number>(-1);
  const revealTimeoutRef = useRef<number | null>(null);

  const liveEligibleIds = useMemo<GroupId[]>(() => {
    return groups.filter((g) => g.teamCount < g.maxCapacity).map((g) => g.groupId);
  }, [groups]);

  const activePool = frozenEligible ?? liveEligibleIds;
  const slices = useMemo(() => buildTwelveSlices(activePool), [activePool]);
  const sliceAngle = 360 / slices.length; // 30 degrees

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (revealTimeoutRef.current !== null) clearTimeout(revealTimeoutRef.current);
    };
  }, []);

  const triggerTickIfCrossed = (deg: number, speedFactor: number) => {
    const pointerAngle = ((360 - (deg % 360)) + 360) % 360;
    const currentSliceIdx = Math.floor(pointerAngle / sliceAngle) % slices.length;
    if (currentSliceIdx !== lastSliceIndexRef.current) {
      lastSliceIndexRef.current = currentSliceIdx;
      soundFx.playTick(0.85 + Math.min(0.6, speedFactor * 0.5));
      setPointerKick(true);
      window.setTimeout(() => setPointerKick(false), 70);
    }
  };

  const handleStartSpin = async () => {
    if (!canSpin || phase !== 'READY') return;

    setError(null);
    const snapshotEligible = [...liveEligibleIds];
    setFrozenEligible(snapshotEligible);
    setPhase('REQUESTING');

    // Start smooth continuous acceleration while server validates & picks group
    let spinningFast = true;
    let lastTs = performance.now();
    const warmupLoop = (ts: number) => {
      if (!spinningFast) return;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;
      rotRef.current += dt * 0.85; // ~850 deg/sec exciting spin
      setRotation(rotRef.current);
      triggerTickIfCrossed(rotRef.current, 1);
      rafRef.current = requestAnimationFrame(warmupLoop);
    };
    rafRef.current = requestAnimationFrame(warmupLoop);

    try {
      // Server-authoritative cryptographic group selection + permanent Firestore/DB lock
      const result = await onRequestSpin();

      // Ensure at least 700ms of high-speed suspense before starting deceleration
      await new Promise((r) => setTimeout(r, 700));
      spinningFast = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      // Compute exact target slice matching server-confirmed assignedGroup
      const currentSlices = buildTwelveSlices(snapshotEligible);
      const matchingIndices = currentSlices
        .filter((s) => s.groupId === result.assignedGroup)
        .map((s) => s.index);

      const chosenSliceIndex =
        matchingIndices.length > 0
          ? matchingIndices[Math.floor(Math.random() * matchingIndices.length)]
          : 0;

      // Safe visual offset inside the 30-degree wedge (+/- 8 degrees from wedge center)
      const safeJitter = (Math.random() - 0.5) * 16;
      const targetPointerAngle = chosenSliceIndex * sliceAngle + sliceAngle / 2 + safeJitter;
      const desiredMod = ((360 - targetPointerAngle) % 360 + 360) % 360;
      const currentMod = ((rotRef.current % 360) + 360) % 360;
      const deltaMod = (desiredMod - currentMod + 360) % 360;

      const startRot = rotRef.current;
      const totalDelta = 6 * 360 + deltaMod; // 6 crisp decelerating full turns
      const durationMs = 4600;
      const startTime = performance.now();

      setPhase('DECELERATING');

      const decelerate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        // Smooth quartic ease-out
        const eased = 1 - Math.pow(1 - t, 4.1);
        const currentRot = startRot + totalDelta * eased;
        rotRef.current = currentRot;
        setRotation(currentRot);
        triggerTickIfCrossed(currentRot, 1 - t);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(decelerate);
        } else {
          soundFx.playRevealFanfare();
          setRevealedResult(result);
          setPhase('REVEALED');
          revealTimeoutRef.current = window.setTimeout(() => {
            onSpinComplete(result);
          }, 1900);
        }
      };

      rafRef.current = requestAnimationFrame(decelerate);
    } catch (err) {
      spinningFast = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      setFrozenEligible(null);
      setPhase('READY');
      setError(err instanceof Error ? err.message : 'Unable to execute spin. Please try again.');
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Turn Banner */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#00E1FF]/50 bg-[#00E1FF]/15 px-4 py-1.5 font-display text-[11px] font-bold tracking-[0.22em] text-[#00E1FF] uppercase shadow-cyanGlow">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          CONGRATULATIONS · YOUR TURN HAS ARRIVED
        </div>
        <h2 className="mt-3 font-display text-2xl sm:text-3xl font-extrabold tracking-wider text-white uppercase">
          LIVE GROUP <span className="text-inno-gradient">ALLOCATION SPIN</span>
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-[#8AA2BE]">
          <span className="font-mono text-white">{teamId}</span> ({teamName}) · Student ID{' '}
          <span className="font-mono text-[#00E1FF]">{studentId}</span>
          {queueNumber ? ` · FIFO Queue #${queueNumber}` : ''}
        </p>
      </div>

      {/* Wheel Stage */}
      <div className="relative flex items-center justify-center my-2">
        {/* Outer Ambient Pulsing Halo */}
        <div
          className={`pointer-events-none absolute -inset-6 rounded-full blur-2xl transition-opacity duration-500 ${
            phase === 'DECELERATING' || phase === 'REQUESTING'
              ? 'opacity-80'
              : phase === 'REVEALED'
              ? 'opacity-100'
              : 'opacity-45'
          }`}
          style={{
            background:
              'radial-gradient(circle, rgba(0,225,255,0.28) 0%, rgba(25,127,255,0.12) 55%, transparent 72%)',
          }}
        />

        {/* Neon Top Pointer Indicator */}
        <div
          className="absolute -top-4 left-1/2 z-30 -translate-x-1/2 transition-transform duration-75"
          style={{
            transform: `translateX(-50%) rotate(${pointerKick ? -14 : 0}deg)`,
            transformOrigin: '50% 20%',
          }}
        >
          <svg width="42" height="46" viewBox="0 0 42 46" fill="none">
            <defs>
              <linearGradient id="ptrGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="45%" stopColor="#00E1FF" />
                <stop offset="100%" stopColor="#197FFF" />
              </linearGradient>
              <filter id="ptrGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M21 43 L6 12 C4 7 7 3 12 3 H30 C35 3 38 7 36 12 Z"
              fill="url(#ptrGrad)"
              stroke="#07111F"
              strokeWidth="2.5"
              filter="url(#ptrGlow)"
            />
            <circle cx="21" cy="13" r="4" fill="#07111F" />
          </svg>
        </div>

        {/* Main Rotating SVG Wheel */}
        <div className="relative h-[300px] w-[300px] sm:h-[380px] sm:w-[380px]">
          <svg
            viewBox="0 0 400 400"
            className="h-full w-full drop-shadow-[0_0_30px_rgba(0,225,255,0.25)]"
          >
            <defs>
              {slices.map((s) => (
                <linearGradient
                  key={`grad-${s.index}`}
                  id={`sliceGrad-${s.index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={s.fillStart} />
                  <stop offset="100%" stopColor={s.fillEnd} />
                </linearGradient>
              ))}
              <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#102944" />
                <stop offset="100%" stopColor="#050D19" />
              </radialGradient>
            </defs>

            {/* Static Outer Cyber Bezel Ring */}
            <circle
              cx="200"
              cy="200"
              r="196"
              fill="#06101E"
              stroke="#00E1FF"
              strokeOpacity="0.45"
              strokeWidth="2.5"
            />
            <circle
              cx="200"
              cy="200"
              r="188"
              fill="none"
              stroke="#197FFF"
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />

            {/* Rotating Wheel Disc */}
            <g transform={`rotate(${rotation} 200 200)`}>
              {slices.map((slice) => {
                const startA = slice.index * sliceAngle;
                const endA = startA + sliceAngle;
                const midA = startA + sliceAngle / 2;
                const labelPos = polarToCartesian(200, 200, 128, midA);
                const pegPos = polarToCartesian(200, 200, 179, startA);

                return (
                  <g key={slice.index}>
                    <path
                      d={describeWedge(200, 200, 182, startA, endA)}
                      fill={`url(#sliceGrad-${slice.index})`}
                      stroke="#07111F"
                      strokeWidth="2"
                    />
                    {/* Inner accent rim arc */}
                    <path
                      d={describeWedge(200, 200, 182, startA, endA)}
                      fill="none"
                      stroke={slice.accent}
                      strokeOpacity="0.35"
                      strokeWidth="1"
                    />
                    {/* Group Label */}
                    <text
                      x={labelPos.x}
                      y={labelPos.y}
                      fill="#F4F8FF"
                      fontSize="11.5"
                      fontWeight="800"
                      fontFamily="Orbitron, sans-serif"
                      letterSpacing="0.08em"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${midA} ${labelPos.x} ${labelPos.y})`}
                    >
                      {slice.shortLabel}
                    </text>
                    {/* Metallic Rim Stud */}
                    <circle
                      cx={pegPos.x}
                      cy={pegPos.y}
                      r="3"
                      fill="#00E1FF"
                      stroke="#07111F"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}
            </g>

            {/* Static Center Core Hub with INNOHACK Delta Mark */}
            <circle
              cx="200"
              cy="200"
              r="46"
              fill="url(#hubGrad)"
              stroke="#00E1FF"
              strokeWidth="2.5"
            />
            <circle
              cx="200"
              cy="200"
              r="38"
              fill="none"
              stroke="#197FFF"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
            <path d="M200 176 L216 214 L208 214 L200 194 L192 214 L184 214 Z" fill="#00E1FF" />
            <path
              d="M182 208 Q200 193 219 191"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="219" cy="191" r="2.5" fill="#7DF9FF" />
          </svg>

          {/* Dramatic Post-Stop Reveal Overlay */}
          <AnimatePresence>
            {phase === 'REVEALED' && revealedResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.78 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-full bg-[#07111F]/92 backdrop-blur-md border-2 border-[#00E1FF] shadow-cyanStrong p-6 text-center"
              >
                <span className="font-display text-[11px] font-bold tracking-[0.26em] text-[#00E1FF] uppercase">
                  SERVER CONFIRMED
                </span>
                <span className="mt-2 font-display text-4xl sm:text-5xl font-black tracking-wider text-white text-inno-glow">
                  {revealedResult.assignedGroupName.toUpperCase()}
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 font-mono text-[11px] text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  LOCKED · DRAW #{revealedResult.drawOrder} OF 30
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Eligible Group Pool Legend */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs">
        {groups.map((g) => {
          const isFull = g.teamCount >= g.maxCapacity;
          return (
            <div
              key={g.groupId}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-display text-[11px] tracking-wider ${
                isFull
                  ? 'border-slate-700/70 bg-slate-900/50 text-slate-500 line-through'
                  : 'border-[#18385A] bg-[#0B1B2E] text-white'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: isFull ? '#475569' : SLICE_PALETTE[g.groupId].accent,
                }}
              />
              {g.groupName} ({g.teamCount}/10)
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 flex max-w-md items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Spin Trigger */}
      <div className="mt-6 flex flex-col items-center gap-2.5">
        <button
          type="button"
          disabled={!canSpin || phase !== 'READY'}
          onClick={handleStartSpin}
          className="btn-inno-primary px-10 py-4 text-sm sm:text-base min-w-[260px]"
        >
          {phase === 'READY' && (
            <>
              <Zap className="h-5 w-5 fill-[#04101E]" />
              START SPIN
            </>
          )}
          {phase === 'REQUESTING' && (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              LOCKING SERVER DRAW...
            </>
          )}
          {phase === 'DECELERATING' && (
            <>
              <Sparkles className="h-5 w-5 animate-pulse" />
              REVEALING GROUP...
            </>
          )}
          {phase === 'REVEALED' && (
            <>
              <ShieldCheck className="h-5 w-5" />
              ALLOCATION SAVED
            </>
          )}
        </button>

        <p className="text-[11px] text-[#6E8AA8] text-center max-w-md">
          Result is cryptographically generated &amp; permanently committed on the server across remaining open groups with equal probability.
        </p>
      </div>
    </div>
  );
};
