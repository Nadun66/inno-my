import React from 'react';

interface HudCardProps {
  children: React.ReactNode;
  className?: string;
  brackets?: boolean;
  glow?: boolean;
  highlight?: boolean;
}

/**
 * Official INNOHACK corner-bracketed glass HUD container
 * matching the Mission Brief & Stage Select panels in the reference branding.
 */
export const HudCard: React.FC<HudCardProps> = ({
  children,
  className = '',
  brackets = true,
  glow = false,
  highlight = false,
}) => {
  return (
    <div
      className={`relative rounded-xl bg-[#091625]/90 backdrop-blur-md border transition-all duration-300 ${
        highlight
          ? 'border-[#00E1FF]/55 shadow-cyanStrong'
          : glow
          ? 'border-[#163454] shadow-cyanGlow'
          : 'border-[#142C46] shadow-hud'
      } ${className}`}
    >
      {/* Top specular cyan accent hairline */}
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{
          background: highlight
            ? 'linear-gradient(90deg, transparent, #00E1FF, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(0,225,255,0.35), transparent)',
        }}
      />

      {brackets && (
        <>
          <span className="pointer-events-none absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-[#00E1FF] rounded-tl-sm" />
          <span className="pointer-events-none absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-[#00E1FF] rounded-tr-sm" />
          <span className="pointer-events-none absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-[#00E1FF] rounded-bl-sm" />
          <span className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-[#00E1FF] rounded-br-sm" />
        </>
      )}

      {children}
    </div>
  );
};
