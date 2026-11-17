import React from 'react';
import { Zap } from 'lucide-react';

export const CyberBackground: React.FC = () => {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#07111F]">
      {/* Subtle tactical grid */}
      <div className="absolute inset-0 cyber-grid-bg opacity-80" />

      {/* Top arena spotlight glow */}
      <div
        className="absolute -top-48 left-1/2 h-[540px] w-[1080px] -translate-x-1/2 rounded-full opacity-55 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(25,127,255,0.28) 0%, rgba(0,225,255,0.12) 45%, transparent 72%)',
        }}
      />

      {/* Diagonal esports stage beams */}
      <div
        className="absolute -top-24 left-[12%] h-[620px] w-[180px] rotate-[22deg] opacity-[0.07] blur-2xl"
        style={{
          background: 'linear-gradient(180deg, #00E1FF 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute -top-24 right-[12%] h-[620px] w-[180px] -rotate-[22deg] opacity-[0.07] blur-2xl"
        style={{
          background: 'linear-gradient(180deg, #197FFF 0%, transparent 100%)',
        }}
      />

      {/* Bottom ambient deep glow */}
      <div
        className="absolute -bottom-48 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full opacity-35 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,196,255,0.16) 0%, transparent 70%)',
        }}
      />
    </div>
  );
};

export const ArenaTicker: React.FC = () => {
  const items = [
    'TEAM LEADER PORTAL',
    'SLIIT KANDY UNI',
    'LIVE FIFO DRAW QUEUE',
    '30 SQUADS · 3 GROUPS · 10 PER GROUP',
    'SERVER-AUTHORITATIVE SPIN',
    'INTER-UNIVERSITY AI HACKATHON',
    'GRAND FINALS · 28 NOV 2026',
    'LOCK IN YOUR GROUP',
  ];

  return (
    <div className="relative overflow-hidden border-y border-[#00E1FF]/20 bg-[#050E1B]/95 py-2.5 select-none">
      <div className="flex w-max animate-marquee items-center gap-8">
        {[...items, ...items].map((label, idx) => (
          <div key={idx} className="inline-flex items-center gap-8 shrink-0">
            <span
              className={`font-display text-[11px] font-semibold tracking-[0.22em] uppercase ${
                idx % 2 === 0 ? 'text-[#00E1FF]' : 'text-[#D6E6F9]'
              }`}
            >
              {label}
            </span>
            <Zap className="h-3.5 w-3.5 text-[#00E1FF] fill-[#00E1FF]" />
          </div>
        ))}
      </div>
    </div>
  );
};
