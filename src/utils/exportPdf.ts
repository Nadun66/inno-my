import { jsPDF } from 'jspdf';
import autoTableImport from 'jspdf-autotable';
import type { AdminSnapshot, GroupId, TeamRecord } from '../types/portal';
import { formatAllocationTimestamp } from './exportCsv';

const autoTable: typeof autoTableImport =
  typeof autoTableImport === 'function'
    ? autoTableImport
    : (autoTableImport as unknown as { default: typeof autoTableImport }).default;

const COLORS = {
  navy: [7, 17, 31] as [number, number, number],
  navySurface: [11, 26, 44] as [number, number, number],
  cyan: [0, 225, 255] as [number, number, number],
  blue: [25, 127, 255] as [number, number, number],
  white: [244, 248, 255] as [number, number, number],
  slate: [138, 162, 190] as [number, number, number],
  darkText: [15, 28, 46] as [number, number, number],
  borderLight: [203, 218, 235] as [number, number, number],
  tint: [241, 247, 254] as [number, number, number],
};

function drawInnoHackLogoMark(doc: jsPDF, x: number, y: number, size: number): void {
  // Stylized geometric delta 'A' mark inspired by official INNOHACK logo
  doc.setFillColor(...COLORS.blue);
  doc.triangle(x + size * 0.5, y, x + size, y + size, x + size * 0.72, y + size, 'F');
  doc.setFillColor(...COLORS.cyan);
  doc.triangle(x + size * 0.5, y, x + size * 0.28, y + size, x, y + size, 'F');
  // Orbital swoosh
  doc.setDrawColor(...COLORS.cyan);
  doc.setLineWidth(0.9);
  doc.line(x + size * 0.08, y + size * 0.78, x + size * 0.96, y + size * 0.34);
  doc.setFillColor(...COLORS.cyan);
  doc.circle(x + size * 0.96, y + size * 0.34, 1.2, 'F');
}

function drawBrandedHeader(doc: jsPDF, subtitle: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Dark cyber navy top banner
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Electric cyan-blue accent strip
  doc.setFillColor(...COLORS.blue);
  doc.rect(0, 38, pageWidth * 0.5, 1.5, 'F');
  doc.setFillColor(...COLORS.cyan);
  doc.rect(pageWidth * 0.5, 38, pageWidth * 0.5, 1.5, 'F');

  // Vector logo mark
  drawInnoHackLogoMark(doc, 14, 10, 16);

  // Title text
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INNOHACK', 35, 18);

  doc.setTextColor(...COLORS.cyan);
  doc.setFontSize(8.5);
  doc.text('SEASON 2026  |  SLIIT KANDY UNI', 35, 24.5);

  doc.setTextColor(...COLORS.slate);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(subtitle, 35, 31);

  // Right-aligned metadata
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('OFFICIAL LIVE ALLOCATION RECORD', pageWidth - 14, 16, { align: 'right' });

  doc.setTextColor(...COLORS.slate);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Inter-University AI Hackathon · Faculty of Computing', pageWidth - 14, 22, { align: 'right' });
  doc.text('Kengolla, Kundasale, Kandy, Sri Lanka', pageWidth - 14, 27.5, { align: 'right' });
}

function drawFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = formatAllocationTimestamp(new Date().toISOString());

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 118, 140);
    doc.text(
      `INNOHACK Season 2026 · SLIIT Kandy Uni · Server-Authoritative FIFO Draw · Generated: ${generated}`,
      14,
      pageHeight - 9.5
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 9.5, { align: 'right' });
  }
}

/**
 * Team Leader Official Allocation Slip PDF
 */
export function downloadTeamAllocationPdf(team: TeamRecord): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandedHeader(doc, 'TEAM LEADER LIVE GROUP ALLOCATION CERTIFICATE');

  // Big Group Highlight Card
  doc.setFillColor(...COLORS.navySurface);
  doc.roundedRect(14, 48, pageWidth - 28, 44, 3, 3, 'F');
  doc.setDrawColor(...COLORS.cyan);
  doc.setLineWidth(0.7);
  doc.roundedRect(14, 48, pageWidth - 28, 44, 3, 3, 'S');

  doc.setTextColor(...COLORS.cyan);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CONFIRMED GROUP ALLOCATION', pageWidth / 2, 58, { align: 'center' });

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(30);
  doc.text((team.assignedGroupName || team.assignedGroup || 'PENDING').toUpperCase(), pageWidth / 2, 74, {
    align: 'center',
  });

  doc.setTextColor(...COLORS.slate);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Draw Order #${team.drawOrder ?? '-'} of 30  ·  Status: ${
      team.drawCompleted ? 'PERMANENTLY RECORDED' : 'PENDING'
    }`,
    pageWidth / 2,
    84,
    { align: 'center' }
  );

  // Team Credentials & Allocation Table
  doc.setTextColor(...COLORS.darkText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('OFFICIAL SQUAD ALLOCATION DETAILS', 14, 105);

  autoTable(doc, {
    startY: 110,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.navy,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: COLORS.darkText,
      cellPadding: 4.5,
    },
    alternateRowStyles: {
      fillColor: COLORS.tint,
    },
    head: [['Field', 'Verified Allocation Record']],
    body: [
      ['Event Name', 'INNOHACK Season 2026 — SLIIT Kandy Uni Inter-University Hackathon'],
      ['Team Identifier', `${team.teamId} (${team.teamName})`],
      ['Team Leader Student ID', team.studentId],
      ['Registration Code (Masked)', team.maskedRegistrationCode],
      ['Assigned Group', (team.assignedGroupName || team.assignedGroup || 'Unassigned').toUpperCase()],
      ['Draw Completion Status', team.drawCompleted ? 'CONFIRMED & LOCKED (PERMANENT)' : 'PENDING'],
      ['FIFO Queue Sequence #', team.queueNumber ? `#${team.queueNumber}` : 'N/A'],
      ['Official Draw Order', team.drawOrder ? `#${team.drawOrder} of 30` : 'N/A'],
      ['Allocation Date & Time', formatAllocationTimestamp(team.allocatedAt)],
    ],
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 210;

  // Official Notice Box
  doc.setFillColor(...COLORS.tint);
  doc.setDrawColor(...COLORS.blue);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, finalY + 10, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setTextColor(...COLORS.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('AUTHENTICITY & FAIR-DRAW NOTICE', 19, finalY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(45, 65, 90);
  doc.text(
    'This group assignment was generated using server-authoritative cryptographic randomization across',
    19,
    finalY + 24.5
  );
  doc.text(
    'remaining open groups (max 10 teams per group) in strict FIFO queue order and permanently stored',
    19,
    finalY + 29.5
  );
  doc.text(
    'in the official INNOHACK 2026 database. Present this slip alongside your Student ID at check-in.',
    19,
    finalY + 34.5
  );

  drawFooter(doc);
  doc.save(`INNOHACK2026_${team.teamId}_${team.studentId}_Allocation.pdf`);
}

/**
 * Admin Complete Group Allocation PDF Report (All 3 Groups + Summary)
 */
export function downloadAdminCompletePdf(snapshot: AdminSnapshot): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawBrandedHeader(doc, 'COMPLETE GROUP ALLOCATION MASTER REPORT (ALL 30 TEAMS)');

  const groupMap = Object.fromEntries(snapshot.groups.map((g) => [g.groupId, g]));
  const countA = groupMap.GROUP_A?.teamCount ?? 0;
  const countB = groupMap.GROUP_B?.teamCount ?? 0;
  const countC = groupMap.GROUP_C?.teamCount ?? 0;

  // Executive Summary Cards Row
  const cards = [
    { label: 'TOTAL TEAMS', value: String(snapshot.eventSettings.totalTeams) },
    { label: 'COMPLETED DRAWS', value: `${snapshot.eventSettings.completedDraws} / 30` },
    { label: 'GROUP A', value: `${countA} / 10` },
    { label: 'GROUP B', value: `${countB} / 10` },
    { label: 'GROUP C', value: `${countC} / 10` },
  ];

  const cardW = (pageWidth - 28 - 12) / 5;
  cards.forEach((c, idx) => {
    const cx = 14 + idx * (cardW + 3);
    doc.setFillColor(...COLORS.navySurface);
    doc.roundedRect(cx, 46, cardW, 20, 2, 2, 'F');
    doc.setDrawColor(...COLORS.cyan);
    doc.setLineWidth(0.35);
    doc.roundedRect(cx, 46, cardW, 20, 2, 2, 'S');

    doc.setTextColor(...COLORS.cyan);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(c.label, cx + cardW / 2, 52.5, { align: 'center' });

    doc.setTextColor(...COLORS.white);
    doc.setFontSize(11.5);
    doc.text(c.value, cx + cardW / 2, 61.5, { align: 'center' });
  });

  // Draw Completion Summary strip
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.darkText);
  doc.text(
    `Event Status: ${snapshot.eventSettings.eventStatus}   |   Remaining Undrawn Teams: ${
      snapshot.eventSettings.totalTeams - snapshot.eventSettings.completedDraws
    }   |   Distribution Target: 10 / 10 / 10`,
    14,
    73
  );

  let cursorY = 80;

  const groupIds: GroupId[] = ['GROUP_A', 'GROUP_B', 'GROUP_C'];
  for (const gid of groupIds) {
    const g = groupMap[gid];
    const assignedTeams = snapshot.teams
      .filter((t) => t.assignedGroup === gid)
      .sort((a, b) => (a.drawOrder ?? 999) - (b.drawOrder ?? 999));

    if (cursorY > 235) {
      doc.addPage();
      drawBrandedHeader(doc, 'COMPLETE GROUP ALLOCATION MASTER REPORT (CONT.)');
      cursorY = 48;
    }

    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(14, cursorY, pageWidth - 28, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...COLORS.cyan);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${(g?.groupName || gid).toUpperCase()}`, 18, cursorY + 5.5);

    doc.setTextColor(...COLORS.white);
    doc.setFontSize(8.5);
    doc.text(
      `${assignedTeams.length} / ${g?.maxCapacity ?? 10} Teams Assigned`,
      pageWidth - 18,
      cursorY + 5.5,
      { align: 'right' }
    );

    autoTable(doc, {
      startY: cursorY + 10,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: {
        fillColor: [18, 42, 68],
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.darkText,
        cellPadding: 2.8,
      },
      alternateRowStyles: { fillColor: COLORS.tint },
      head: [
        ['#', 'Draw Order', 'Team ID', 'Team Leader Student ID', 'Masked Reg Code', 'Allocation Timestamp'],
      ],
      body:
        assignedTeams.length > 0
          ? assignedTeams.map((t, idx) => [
              String(idx + 1),
              t.drawOrder ? `#${t.drawOrder}` : '-',
              t.teamId,
              t.studentId,
              t.maskedRegistrationCode,
              formatAllocationTimestamp(t.allocatedAt),
            ])
          : [['-', '-', 'No teams assigned to this group yet', '-', '-', '-']],
    });

    cursorY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY + 30) +
      8;
  }

  // If any teams are still pending, summarize them cleanly
  const pendingTeams = snapshot.teams.filter((t) => !t.drawCompleted);
  if (pendingTeams.length > 0) {
    if (cursorY > 235) {
      doc.addPage();
      drawBrandedHeader(doc, 'PENDING TEAMS SUMMARY');
      cursorY = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.darkText);
    doc.text(`UNALLOCATED / PENDING TEAMS (${pendingTeams.length})`, 14, cursorY);

    autoTable(doc, {
      startY: cursorY + 3,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: { fillColor: [60, 78, 98], textColor: COLORS.white, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      head: [['Team ID', 'Student ID', 'Masked Reg Code', 'Auth Status', 'Queue Status', 'Queue #']],
      body: pendingTeams.map((t) => [
        t.teamId,
        t.studentId,
        t.maskedRegistrationCode,
        t.authenticationStatus,
        t.queueStatus,
        t.queueNumber ? `#${t.queueNumber}` : '-',
      ]),
    });
  }

  drawFooter(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`INNOHACK2026_Complete_Group_Allocation_${stamp}.pdf`);
}
