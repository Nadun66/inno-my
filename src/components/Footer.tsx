import React from 'react';
import { KeyRound, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { InnoHackLogo } from './InnoHackLogo';
import { BACKEND_MODE_LABEL } from '../services/portalApi';

interface FooterProps {
  onOpenAdmin: () => void;
  onOpenTeamLogin: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin, onOpenTeamLogin }) => {
  return (
    <footer className="mt-20 border-t border-[#142C46] bg-[#050D19]/95">
      {/* Subtle electric cyan top accent glow */}
      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 5%, rgba(0,225,255,0.5) 50%, transparent 95%)',
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Brand Column */}
          <div>
            <InnoHackLogo compact />
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-[#7E98B5]">
              Inter-University AI Hackathon hosted by the Kandy UNI Students, Faculty of Computing.
              Official server-authoritative FIFO live group allocation portal for all 30 registered squads.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#142D48] bg-[#081423] px-2.5 py-1 text-[10px] font-mono text-[#7393B3]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00E1FF]" />
              {BACKEND_MODE_LABEL}
            </div>
          </div>

          {/* Navigation Column */}
          <div>
            <h4 className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase">
              Portal Access
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-[#8AA2BE]">
              <li>
                <button
                  type="button"
                  onClick={onOpenTeamLogin}
                  className="hover:text-[#00E1FF] transition"
                >
                  Team Leader Login &amp; Live Queue
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="hover:text-[#00E1FF] transition"
                >
                  Organizer Live Draw Command Center
                </button>
              </li>
              <li className="text-[#5E7A99]">
                Allocation Rule: 3 Groups · Exactly 10 Teams Each
              </li>
              <li className="text-[#5E7A99]">
                Grand Finals: 28 Nov 2026 · SLIIT Kandy Uni
              </li>
            </ul>
          </div>

          {/* Official Event Contact Column (matching reference image) */}
          <div>
            <h4 className="font-display text-xs font-bold tracking-[0.2em] text-white uppercase">
              Event Contacts
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-[#8AA2BE]">
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                <span>+94 71 436 4113 · Bimsara Bandara — Chairperson</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                <span>+94 77 201 6432 · Yasasri Ekanayake — Secretary</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                <span>+94 71 524 5420 · Rashmika Wickramaarachchi — Event Coordinator</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E1FF]" />
                <span>SLIIT Kandy Uni, Kengolla, Kundasale, Kandy, Sri Lanka</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal & Organizer Strip (matching reference footer) */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#10243A] pt-6 text-[11px] text-[#607B99] sm:flex-row">
          <p>© 2026 Kandy UNI Students, Faculty of Computing. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5 text-[#7CA0C2]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00E1FF]" />
              Secured FIFO Allocation
            </span>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 text-[#7CA0C2] hover:text-[#00E1FF] transition"
            >
              <KeyRound className="h-3.5 w-3.5 text-[#00E1FF]" />
              Organizer login
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
