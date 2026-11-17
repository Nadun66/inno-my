import React from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Hash,
  Lock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { HudCard } from './HudCard';
import type { TeamRecord } from '../types/portal';
import { downloadTeamAllocationPdf } from '../utils/exportPdf';
import { downloadTeamAllocationCsv, formatAllocationTimestamp } from '../utils/exportCsv';

interface AllocationCertificateProps {
  team: TeamRecord;
}

export const AllocationCertificate: React.FC<AllocationCertificateProps> = ({ team }) => {
  const groupLabel = (team.assignedGroupName || team.assignedGroup || 'UNASSIGNED').toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <HudCard highlight className="p-6 sm:p-8 overflow-hidden">
        {/* Top Verified Banner */}
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/45 bg-emerald-500/15 px-4 py-1.5 font-display text-[11px] font-bold tracking-[0.2em] text-emerald-300 uppercase">
            <CheckCircle2 className="h-3.5 w-3.5" />
            DRAW COMPLETED · PERMANENTLY SAVED
          </div>

          <p className="mt-5 font-display text-xs tracking-[0.26em] text-[#8AA2BE] uppercase">
            OFFICIAL INNOHACK 2026 ALLOCATION
          </p>

          <div className="mt-2 flex items-center justify-center gap-3">
            <Award className="h-9 w-9 sm:h-11 sm:w-11 text-[#00E1FF]" />
            <h2 className="font-display text-4xl sm:text-6xl font-black tracking-wider text-inno-gradient text-inno-glow">
              {groupLabel}
            </h2>
          </div>

          <p className="mt-2 max-w-lg text-xs sm:text-sm text-[#8AA2BE]">
            Your squad has been permanently assigned to <strong className="text-white">{groupLabel}</strong>{' '}
            for INNOHACK Season 2026 at SLIIT Kandy Uni. Download your official verification slip below.
          </p>
        </div>

        {/* Verified Metadata Grid */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#16324E] bg-[#06111F]/90 p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.18em] text-[#7D97B4] uppercase">
              <UserCheck className="h-3.5 w-3.5 text-[#00E1FF]" />
              Student ID
            </div>
            <div className="mt-1.5 font-mono text-sm font-bold text-white">{team.studentId}</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#6684A3]">{team.teamId}</div>
          </div>

          <div className="rounded-xl border border-[#16324E] bg-[#06111F]/90 p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.18em] text-[#7D97B4] uppercase">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00E1FF]" />
              Masked Reg Code
            </div>
            <div className="mt-1.5 font-mono text-sm font-bold text-[#00E1FF]">
              {team.maskedRegistrationCode}
            </div>
            <div className="mt-0.5 text-[11px] text-[#6684A3]">Verified &amp; Masked</div>
          </div>

          <div className="rounded-xl border border-[#16324E] bg-[#06111F]/90 p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.18em] text-[#7D97B4] uppercase">
              <Hash className="h-3.5 w-3.5 text-[#00E1FF]" />
              Draw Order
            </div>
            <div className="mt-1.5 font-display text-lg font-extrabold text-white">
              #{team.drawOrder ?? '-'} <span className="text-xs font-normal text-[#6684A3]">of 30</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#6684A3]">
              FIFO Queue #{team.queueNumber ?? '-'}
            </div>
          </div>

          <div className="rounded-xl border border-[#16324E] bg-[#06111F]/90 p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.18em] text-[#7D97B4] uppercase">
              <Clock className="h-3.5 w-3.5 text-[#00E1FF]" />
              Allocation Time
            </div>
            <div className="mt-1.5 font-mono text-xs font-semibold text-white">
              {formatAllocationTimestamp(team.allocatedAt)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-400">
              <Lock className="h-3 w-3" />
              Immutable Record
            </div>
          </div>
        </div>

        {/* Download CTA Row */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => downloadTeamAllocationPdf(team)}
            className="btn-inno-primary w-full sm:w-auto px-7 py-3.5 text-xs sm:text-sm"
          >
            <FileText className="h-4 w-4" />
            Download My Team Allocation – PDF
          </button>

          <button
            type="button"
            onClick={() => downloadTeamAllocationCsv(team)}
            className="btn-inno-secondary w-full sm:w-auto px-6 py-3.5 text-xs sm:text-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#00E1FF]" />
            Download My Team Allocation – CSV
          </button>
        </div>
      </HudCard>
    </motion.div>
  );
};
