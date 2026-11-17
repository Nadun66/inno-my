import type { AdminSnapshot, TeamRecord } from '../types/portal';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  // UTF-8 BOM ensures clean display in Excel & Google Sheets
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatAllocationTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Pending';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d) + ' SLST';
  } catch {
    return iso;
  }
}

/**
 * Team Leader CSV Export — contains ONLY the authenticated team leader's own allocation.
 */
export function downloadTeamAllocationCsv(team: TeamRecord): void {
  const headers = [
    'Event',
    'Team ID',
    'Team Name',
    'Team Leader Student ID',
    'Registration Reference (Masked)',
    'Queue Number',
    'Draw Order',
    'Assigned Group',
    'Draw Completion Status',
    'Allocation Timestamp (SLST)',
  ];

  const rows = [
    [
      'INNOHACK Season 2026 — SLIIT Kandy Uni',
      team.teamId,
      team.teamName,
      team.studentId,
      team.maskedRegistrationCode,
      team.queueNumber ?? 'N/A',
      team.drawOrder ?? 'N/A',
      team.assignedGroupName ?? team.assignedGroup ?? 'Unassigned',
      team.drawCompleted ? 'COMPLETED' : 'PENDING',
      formatAllocationTimestamp(team.allocatedAt),
    ],
  ];

  triggerCsvDownload(
    `INNOHACK2026_${team.teamId}_${team.studentId}_Allocation.csv`,
    headers,
    rows
  );
}

/**
 * Admin Complete Group Allocation CSV Export — all 30 registered teams from live backend data.
 */
export function downloadAdminCompleteCsv(snapshot: AdminSnapshot): void {
  const headers = [
    'Team ID',
    'Team Leader Student ID',
    'Registration Reference (Masked)',
    'Queue Number',
    'Draw Order',
    'Assigned Group',
    'Allocation Status',
    'Allocation Timestamp',
  ];

  const rows = snapshot.teams
    .slice()
    .sort((a, b) => a.teamId.localeCompare(b.teamId))
    .map((t) => [
      t.teamId,
      t.studentId,
      t.maskedRegistrationCode,
      t.queueNumber ?? '',
      t.drawOrder ?? '',
      t.assignedGroupName ?? t.assignedGroup ?? 'UNASSIGNED',
      t.drawCompleted ? 'COMPLETED' : t.queueStatus,
      t.allocatedAt ? formatAllocationTimestamp(t.allocatedAt) : '',
    ]);

  const stamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`INNOHACK2026_Complete_Group_Allocation_${stamp}.csv`, headers, rows);
}
