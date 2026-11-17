import React from 'react';
import { Lock, Users } from 'lucide-react';
import type { GroupId, GroupRecord } from '../types/portal';

const GROUP_STYLES: Record<
  GroupId,
  { accent: string; bar: string; badge: string; border: string }
> = {
  GROUP_A: {
    accent: 'text-[#00E1FF]',
    bar: 'from-[#00A8FF] to-[#00E1FF]',
    badge: 'bg-[#00E1FF]/15 text-[#00E1FF] border-[#00E1FF]/35',
    border: 'border-[#00E1FF]/25',
  },
  GROUP_B: {
    accent: 'text-[#5CA4FF]',
    bar: 'from-[#197FFF] to-[#5CA4FF]',
    badge: 'bg-[#197FFF]/15 text-[#70B2FF] border-[#197FFF]/40',
    border: 'border-[#197FFF]/30',
  },
  GROUP_C: {
    accent: 'text-emerald-400',
    bar: 'from-teal-500 to-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35',
    border: 'border-emerald-500/25',
  },
};

interface GroupProgressPanelProps {
  groups: Array<Pick<GroupRecord, 'groupId' | 'groupName' | 'teamCount' | 'maxCapacity'>>;
  highlightGroup?: GroupId | null;
  compact?: boolean;
}

export const GroupProgressPanel: React.FC<GroupProgressPanelProps> = ({
  groups,
  highlightGroup = null,
  compact = false,
}) => {
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
      {groups.map((g) => {
        const style = GROUP_STYLES[g.groupId];
        const isFull = g.teamCount >= g.maxCapacity;
        const pct = Math.min(100, Math.round((g.teamCount / g.maxCapacity) * 100));
        const isMine = highlightGroup === g.groupId;

        return (
          <div
            key={g.groupId}
            className={`relative rounded-xl border bg-[#081424]/90 p-4 transition-all ${
              isMine
                ? 'border-[#00E1FF] shadow-cyanGlow'
                : isFull
                ? 'border-slate-700/70 opacity-80'
                : style.border
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className={`h-4 w-4 ${style.accent}`} />
                <span className="font-display text-sm font-bold tracking-wider text-white uppercase">
                  {g.groupName}
                </span>
              </div>
              {isFull ? (
                <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-rose-300">
                  <Lock className="h-2.5 w-2.5" />
                  FULL
                </span>
              ) : (
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 font-display text-[10px] font-bold tracking-wider ${style.badge}`}
                >
                  {g.maxCapacity - g.teamCount} LEFT
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className={`font-display text-2xl font-extrabold ${style.accent}`}>
                {g.teamCount}
                <span className="text-sm font-semibold text-[#5E7B9C]"> / {g.maxCapacity}</span>
              </span>
              <span className="font-mono text-[11px] text-[#7F99B6]">{pct}% filled</span>
            </div>

            {/* 10 discrete team slot cells */}
            <div className="mt-3 grid grid-cols-10 gap-1">
              {Array.from({ length: g.maxCapacity }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-[2px] transition-all duration-500 ${
                    idx < g.teamCount
                      ? `bg-gradient-to-r ${style.bar} shadow-[0_0_8px_rgba(0,225,255,0.3)]`
                      : 'bg-[#10243C]'
                  }`}
                />
              ))}
            </div>

            {isMine && (
              <div className="mt-2.5 text-center font-display text-[10px] font-bold tracking-[0.2em] text-[#00E1FF] uppercase">
                ★ YOUR ASSIGNED GROUP
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
