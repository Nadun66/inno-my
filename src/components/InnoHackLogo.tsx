import React from 'react';

interface InnoHackLogoProps {
  compact?: boolean;
  showUniBadge?: boolean;
}

export const InnoHackLogo: React.FC<InnoHackLogoProps> = ({
  compact = false,
  showUniBadge = true,
}) => {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      {/* Official INNOHACK Delta-Orbit Mark */}
      <svg
        viewBox="0 0 64 58"
        className={compact ? 'h-8 w-8 shrink-0' : 'h-10 w-10 shrink-0'}
        fill="none"
        aria-label="INNOHACK Logo"
      >
        <defs>
          <linearGradient id="innoDeltaLeft" x1="0%" y1="100%" x2="80%" y2="0%">
            <stop offset="0%" stopColor="#0D4DFF" />
            <stop offset="55%" stopColor="#00A3FF" />
            <stop offset="100%" stopColor="#00E8FF" />
          </linearGradient>
          <linearGradient id="innoDeltaRight" x1="20%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E1FF" />
            <stop offset="55%" stopColor="#197FFF" />
            <stop offset="100%" stopColor="#00D4FF" />
          </linearGradient>
          <linearGradient id="innoOrbit" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#197FFF" />
            <stop offset="55%" stopColor="#00E1FF" />
            <stop offset="100%" stopColor="#7DF9FF" />
          </linearGradient>
          <filter id="innoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Left blade of 'A' */}
        <path
          d="M32 4 L19 52 L8 52 L28 6 Z"
          fill="url(#innoDeltaLeft)"
          filter="url(#innoGlow)"
        />
        {/* Right blade of 'A' */}
        <path
          d="M32 4 L56 52 L44 52 L31 24 L25 36 L19 36 Z"
          fill="url(#innoDeltaRight)"
        />
        {/* Sweeping orbital energy arc */}
        <path
          d="M8 46 C 14 31, 34 21, 55 18"
          stroke="url(#innoOrbit)"
          strokeWidth="3.2"
          strokeLinecap="round"
          filter="url(#innoGlow)"
        />
        <path
          d="M14 48 C 21 37, 36 28, 53 20"
          stroke="#00E1FF"
          strokeOpacity="0.45"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Orbiting node */}
        <circle cx="55.5" cy="18" r="3.4" fill="#7DF9FF" filter="url(#innoGlow)" />
      </svg>

      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold tracking-[0.12em] text-white ${
            compact ? 'text-sm' : 'text-base sm:text-lg'
          }`}
        >
          INNOHACK
        </span>
        <span className="font-display text-[9px] sm:text-[10px] tracking-[0.26em] text-[#7D97B4] mt-1">
          SEASON 2026
        </span>
      </div>

      {/* SLIIT Kandy Uni Co-Branding (matching official header) */}
      {showUniBadge && (
        <>
          <div className="hidden sm:block h-7 w-px bg-[#1B3553] mx-1" />
          <div className="hidden sm:flex items-center gap-2">
            {/* Minimal Crest Shield */}
            <svg viewBox="0 0 32 36" className="h-7 w-6 text-[#D8E7F8]" fill="none">
              <path
                d="M3 4 H29 V19 C29 27.5 16 33 16 33 C16 33 3 27.5 3 19 V4 Z"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="rgba(25,127,255,0.12)"
              />
              <line x1="3" y1="12" x2="29" y2="12" stroke="currentColor" strokeWidth="1.2" />
              <line x1="3" y1="22" x2="29" y2="22" stroke="currentColor" strokeWidth="1.2" />
              <text
                x="16"
                y="19.5"
                textAnchor="middle"
                fill="currentColor"
                fontSize="7.5"
                fontWeight="700"
                fontFamily="serif"
              >
                SLIIT
              </text>
            </svg>
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold tracking-[0.06em] text-xs sm:text-sm text-white">
                KANDY UNI
              </span>
              <span className="text-[8px] tracking-[0.12em] text-[#7D97B4] mt-0.5">
                Educate | Empower | Elevate
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
