import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Radio,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { ArenaTicker } from '../components/CyberBackground';
import { HudCard } from '../components/HudCard';
import { GroupProgressPanel } from '../components/GroupProgressPanel';
import { portalApi } from '../services/portalApi';
import type { PublicArenaStatus, SessionInfo, TeamLeaderSnapshot } from '../types/portal';

interface LoginPageProps {
  onLoginSuccess: (session: SessionInfo, snapshot?: TeamLeaderSnapshot) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [studentId, setStudentId] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicStatus, setPublicStatus] = useState<PublicArenaStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadStatus = () => {
      portalApi
        .getPublicStatus()
        .then((s) => {
          if (mounted) setPublicStatus(s);
        })
        .catch(() => {
          // Graceful fallback if backend is starting
        });
    };
    loadStatus();
    const interval = window.setInterval(loadStatus, 10000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedStudent = studentId.trim();
    const trimmedCode = registrationCode.trim().toUpperCase();

    if (!trimmedStudent || !trimmedCode) {
      setError('Both Student ID Number and Unique Registration Code are required to log in.');
      return;
    }

    setLoading(true);
    try {
      const { session, snapshot } = await portalApi.teamLeaderLogin(trimmedStudent, trimmedCode);
      onLoginSuccess(session, snapshot);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid credentials. Please check your Student ID and Registration Code.'
      );
    } finally {
      setLoading(false);
    }
  };

  const completedDraws = publicStatus?.completedDraws ?? 0;
  const totalTeams = publicStatus?.totalTeams ?? 30;
  const remainingTeams = Math.max(0, totalTeams - completedDraws);

  return (
    <div className="flex flex-col">
      {/* Hero Banner Header matching official INNOHACK landing atmosphere */}
      <section className="relative pt-10 pb-10 sm:pt-14 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#00E1FF]/35 bg-[#091A2E]/90 px-4 py-1.5 font-display text-[10px] sm:text-[11px] font-semibold tracking-[0.22em] text-[#00E1FF] uppercase shadow-cyanGlow"
          >
            <span className="h-2 w-2 rounded-full bg-[#00E1FF] animate-pulse" />
            OFFICIAL LIVE GROUP ALLOCATION · SLIIT KANDY UNI
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mt-5 font-display text-4xl sm:text-6xl lg:text-[64px] font-black tracking-[0.09em] text-white uppercase leading-none text-inno-glow"
          >
            INNOHACK
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-2 font-display text-lg sm:text-2xl font-bold tracking-[0.16em] uppercase"
          >
            <span className="text-white">TEAM LEADER </span>
            <span className="text-inno-gradient">LIVE SPIN PORTAL</span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-[#8AA2BE] leading-relaxed"
          >
            Authorized portal for the <strong className="text-white">30 registered squad leaders</strong> of
            INNOHACK Season 2026. Authenticate with your dual credentials to enter the global FIFO queue and
            spin for your official competition group.
          </motion.p>

          {/* Compact Arena Telemetry Strip (matching Hero bottom stats bar in reference) */}
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Users, label: 'AUTHORIZED SQUADS', value: `${totalTeams} Teams` },
              { icon: Layers, label: 'GROUP STRUCTURE', value: '3 × 10 Slots' },
              {
                icon: Radio,
                label: 'LIVE FIFO QUEUE',
                value: `${publicStatus?.activeQueueCount ?? 0} Active`,
              },
              {
                icon: CheckCircle2,
                label: 'REMAINING DRAWS',
                value: `${remainingTeams} / ${totalTeams}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-xl border border-[#142D48] bg-[#081526]/90 px-4 py-3 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#00E1FF]/25 bg-[#00E1FF]/10 text-[#00E1FF]">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[9px] tracking-[0.18em] text-[#6D8AA8] uppercase truncate">
                    {item.label}
                  </div>
                  <div className="font-display text-sm font-bold text-white truncate">
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signature INNOHACK Neon Marquee Strip */}
      <ArenaTicker />

      {/* Main Stage Select / Dual-Column Login Section (mirroring reference Stage Select layout) */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <span className="section-kicker">STAGE SELECT · SQUAD AUTHENTICATION</span>
          <h2 className="mt-3 font-display text-2xl sm:text-4xl font-extrabold tracking-wider text-white uppercase">
            AUTHENTICATE YOUR <span className="text-inno-gradient">SQUAD</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* LEFT: Official Login Card (Primary Action, 7 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-7"
          >
            <HudCard highlight className="p-6 sm:p-9">
              <div className="flex items-center justify-between gap-4 border-b border-[#142D48] pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#00E1FF]/40 bg-gradient-to-br from-[#197FFF]/25 to-[#00E1FF]/15 text-[#00E1FF] shadow-cyanGlow">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-wider text-white uppercase">
                      TEAM LEADER LOGIN
                    </h3>
                    <p className="text-xs text-[#7D97B4]">
                      Both credentials must match the same registered squad record
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[#00E1FF]/30 bg-[#00E1FF]/10 px-2.5 py-1 font-mono text-[10px] text-[#00E1FF]">
                  DUAL-FACTOR ID
                </span>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
                {/* Student ID Input */}
                <div>
                  <label
                    htmlFor="studentId"
                    className="block font-display text-[11px] font-semibold tracking-[0.18em] text-[#A4BCD6] uppercase mb-2"
                  >
                    1. Team Leader Student ID Number
                  </label>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#00E1FF]" />
                    <input
                      id="studentId"
                      name="studentId"
                      type="text"
                      inputMode="numeric"
                      autoComplete="username"
                      value={studentId}
                      onChange={(e) => {
                        setStudentId(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter your 12-digit Student ID (e.g. 200426604486)"
                      className="w-full rounded-xl border border-[#183556] bg-[#06101E] py-3.5 pl-11 pr-4 font-mono text-sm text-white placeholder-[#4C6887] outline-none transition focus:border-[#00E1FF] focus:ring-2 focus:ring-[#00E1FF]/20"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                {/* Unique Registration Code Input */}
                <div>
                  <label
                    htmlFor="registrationCode"
                    className="block font-display text-[11px] font-semibold tracking-[0.18em] text-[#A4BCD6] uppercase mb-2"
                  >
                    2. Unique Registration Code
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#00E1FF]" />
                    <input
                      id="registrationCode"
                      name="registrationCode"
                      type={showCode ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={registrationCode}
                      onChange={(e) => {
                        setRegistrationCode(e.target.value.toUpperCase());
                        if (error) setError(null);
                      }}
                      placeholder="IH26-XXXX-XXXX"
                      className="w-full rounded-xl border border-[#183556] bg-[#06101E] py-3.5 pl-11 pr-12 font-mono text-sm tracking-wider text-white placeholder-[#4C6887] uppercase outline-none transition focus:border-[#00E1FF] focus:ring-2 focus:ring-[#00E1FF]/20"
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((v) => !v)}
                      aria-label={showCode ? 'Hide registration code' : 'Show registration code'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#6D8AA8] hover:text-[#00E1FF] transition"
                    >
                      {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Error Feedback Alert */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-rose-500/45 bg-rose-500/10 px-4 py-3.5 text-xs sm:text-sm text-rose-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <div>
                      <div className="font-display text-[11px] font-bold tracking-wider text-rose-300 uppercase">
                        Authentication Denied
                      </div>
                      <p className="mt-0.5 leading-relaxed">{error}</p>
                    </div>
                  </motion.div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-inno-primary w-full py-4 text-sm sm:text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      VERIFYING CREDENTIALS...
                    </>
                  ) : (
                    <>
                      LOGIN TO LIVE DRAW PORTAL
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>

              {/* Access Policy Notice */}
              <div className="mt-6 rounded-xl border border-[#122A44] bg-[#06111F]/80 p-4 text-xs text-[#7E99B6]">
                <div className="flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.18em] text-[#00E1FF] uppercase">
                  <ShieldCheck className="h-4 w-4" />
                  RESTRICTED EVENT ACCESS
                </div>
                <p className="mt-1.5 leading-relaxed">
                  Only the <strong className="text-white">30 pre-registered INNOHACK Season 2026</strong>{' '}
                  team leader accounts are authorized. Public account registration is disabled. All
                  registration codes are cryptographically hashed and verified exclusively on the backend.
                </p>
              </div>
            </HudCard>
          </motion.div>

          {/* RIGHT: Mission Brief & Security Guarantees (5 cols — matching reference cards) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="lg:col-span-5 space-y-6"
          >
            {/* What You'll Need Card (mirroring reference Register section left card) */}
            <HudCard className="p-6">
              <div className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase">
                HOW THE LIVE FIFO DRAW WORKS
              </div>
              <ul className="mt-4 space-y-3.5 text-xs sm:text-sm text-[#95AEC9]">
                {[
                  {
                    step: '01',
                    title: 'Verify Both Credentials',
                    desc: 'Sign in using your registered Student ID and unique IH26 registration code.',
                  },
                  {
                    step: '02',
                    title: 'Enter Global FIFO Queue',
                    desc: 'Server transactions assign strictly ordered queue numbers — no skipping.',
                  },
                  {
                    step: '03',
                    title: 'Wait & Auto-Activate',
                    desc: 'Watch live positions update in real time. Position #1 automatically unlocks the wheel.',
                  },
                  {
                    step: '04',
                    title: 'Spin & Download Slip',
                    desc: 'Server selects an open group (10/10/10 fair split) and generates your official PDF & CSV.',
                  },
                ].map((row) => (
                  <li key={row.step} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#00E1FF]/35 bg-[#00E1FF]/10 font-display text-[11px] font-bold text-[#00E1FF]">
                      {row.step}
                    </span>
                    <div>
                      <div className="font-semibold text-white">{row.title}</div>
                      <p className="mt-0.5 text-xs text-[#7D97B4] leading-relaxed">{row.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </HudCard>

            {/* Your Data Is Protected Card (mirroring reference How It Works right card) */}
            <HudCard brackets={false} className="p-6 border-[#00E1FF]/25">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00E1FF]/35 bg-[#00E1FF]/10 text-[#00E1FF]">
                  <Zap className="h-4 w-4" />
                </div>
                <h4 className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase">
                  FAIRNESS &amp; SECURITY GUARANTEED
                </h4>
              </div>

              <ul className="mt-4 space-y-2.5 text-xs text-[#8AA2BE]">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                  HMAC-SHA256 hashed credentials — zero plaintext storage
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                  Atomic server transactions prevent duplicate joins &amp; spins
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                  Refresh &amp; disconnect safe — active turn is never silently lost
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                  Final balanced distribution guaranteed: 10 / 10 / 10
                </li>
              </ul>
            </HudCard>
          </motion.div>
        </div>

        {/* Live Group Capacity Overview */}
        {publicStatus && (
          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-[0.2em] text-[#8AA2BE] uppercase">
                LIVE GROUP CAPACITY MONITOR
              </span>
              <span className="font-mono text-xs text-[#00E1FF]">
                {completedDraws} / {totalTeams} Teams Allocated
              </span>
            </div>
            <GroupProgressPanel groups={publicStatus.groups} compact />
          </div>
        )}
      </section>
    </div>
  );
};
