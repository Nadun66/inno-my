import React from 'react';
import { LogOut, Radio, ShieldCheck, UserCheck, Volume2, VolumeX } from 'lucide-react';
import { InnoHackLogo } from './InnoHackLogo';
import type { EventStatus } from '../types/portal';

interface NavbarProps {
  route: 'login' | 'dashboard' | 'admin';
  onNavigate: (route: 'login' | 'dashboard' | 'admin') => void;
  teamLabel?: string | null;
  studentId?: string | null;
  isAdmin?: boolean;
  eventStatus?: EventStatus;
  queuePaused?: boolean;
  connected?: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  route,
  onNavigate,
  teamLabel,
  studentId,
  isAdmin = false,
  eventStatus = 'LIVE',
  queuePaused = false,
  connected = true,
  soundEnabled = true,
  onToggleSound,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#142C46]/90 bg-[#07111F]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Official INNOHACK + SLIIT Kandy Uni Branding */}
        <button
          type="button"
          onClick={() => onNavigate(teamLabel ? 'dashboard' : 'login')}
          className="text-left focus:outline-none group"
        >
          <InnoHackLogo />
        </button>

        {/* Center Status Indicator */}
        <div className="hidden lg:flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-display tracking-[0.16em] uppercase ${
              eventStatus === 'COMPLETED'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : queuePaused
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                : 'border-[#00E1FF]/35 bg-[#00E1FF]/10 text-[#00E1FF]'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                eventStatus === 'COMPLETED'
                  ? 'bg-emerald-400'
                  : queuePaused
                  ? 'bg-amber-400'
                  : 'bg-[#00E1FF] animate-pulse'
              }`}
            />
            {eventStatus === 'COMPLETED'
              ? 'ALL 30 DRAWS COMPLETED'
              : queuePaused
              ? 'QUEUE ADMISSIONS PAUSED'
              : 'LIVE FIFO DRAW ACTIVE'}
          </div>

          {(route === 'dashboard' || route === 'admin') && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase ${
                connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300 animate-pulse'
              }`}
            >
              <Radio className="h-3 w-3" />
              {connected ? 'REAL-TIME SYNC' : 'RECONNECTING...'}
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {route === 'dashboard' && onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#183453] bg-[#0B1A2C] text-[#8AA2BE] hover:border-[#00E1FF]/50 hover:text-[#00E1FF] transition"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          )}

          {teamLabel && route === 'dashboard' && (
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-[#173657] bg-[#0A1829] px-3 py-1.5">
              <UserCheck className="h-4 w-4 text-[#00E1FF]" />
              <div className="leading-tight">
                <div className="font-display text-[11px] font-bold text-white tracking-wider">
                  {teamLabel}
                </div>
                {studentId && (
                  <div className="font-mono text-[10px] text-[#7E99B6]">{studentId}</div>
                )}
              </div>
            </div>
          )}

          {isAdmin && route === 'admin' && (
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-[#00E1FF]/35 bg-[#00E1FF]/10 px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-[#00E1FF]" />
              <span className="font-display text-[11px] font-bold tracking-wider text-[#00E1FF]">
                ORGANIZER COMMAND
              </span>
            </div>
          )}

          {route === 'login' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="btn-inno-secondary px-3.5 py-2 text-[11px]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#00E1FF]" />
              <span className="hidden sm:inline">Organizer Login</span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}

          {route === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="btn-inno-secondary px-3 py-2 text-[11px]"
            >
              Team Portal
            </button>
          )}

          {onLogout && (route === 'dashboard' || (route === 'admin' && isAdmin)) && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-display text-[11px] font-semibold tracking-wider text-rose-200 hover:bg-rose-500/20 hover:border-rose-400/60 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">LOGOUT</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
