export type GroupId = 'GROUP_A' | 'GROUP_B' | 'GROUP_C';

export type QueueStatus = 'NOT_JOINED' | 'WAITING' | 'ACTIVE' | 'COMPLETED';

export type AuthStatus = 'NOT_AUTHENTICATED' | 'AUTHENTICATED';

export type EventStatus = 'LIVE' | 'COMPLETED';

export type QueueEntryStatus =
  | 'WAITING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'REQUEUED'
  | 'ABANDONED_RELEASED';

export interface TeamRecord {
  teamId: string;
  studentId: string;
  maskedRegistrationCode: string;
  teamName: string;
  teamLeader: string;
  authenticationStatus: AuthStatus;
  queueStatus: QueueStatus;
  queueNumber: number | null;
  activeQueueEntryId: string | null;
  assignedGroup: GroupId | null;
  assignedGroupName: string | null;
  drawCompleted: boolean;
  drawOrder: number | null;
  allocatedAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
}

export interface QueueEntry {
  queueEntryId: string;
  teamId: string;
  teamName: string;
  maskedStudentId: string;
  studentId?: string; // Included only for admin or own entry
  sequenceNumber: number;
  status: QueueEntryStatus;
  joinedAt: string;
  activatedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  assignedGroup?: GroupId | null;
}

export interface GroupRecord {
  groupId: GroupId;
  groupName: string;
  maxCapacity: number;
  teamCount: number;
  teamIds: string[];
}

export interface DrawHistoryEntry {
  drawId: string;
  teamId: string;
  teamName: string;
  studentId?: string; // Full for admin or own entry; masked otherwise
  maskedStudentId: string;
  maskedRegistrationCode: string;
  sequenceNumber: number;
  drawOrder: number;
  assignedGroup: GroupId;
  assignedGroupName: string;
  timestamp: string;
  status: 'CONFIRMED';
}

export interface EventSettings {
  eventStatus: EventStatus;
  queueStatus: 'IDLE' | 'ACTIVE' | 'COMPLETED';
  queuePaused: boolean;
  queuePausedAt: string | null;
  currentActiveTeamId: string | null;
  lastQueueSequence: number;
  totalTeams: number;
  completedDraws: number;
  initializedAt: string;
}

export interface AuditLogEntry {
  logId: string;
  action: string;
  actor: string;
  teamId: string | null;
  details: string;
  timestamp: string;
}

export interface PublicArenaStatus {
  eventStatus: EventStatus;
  queuePaused: boolean;
  totalTeams: number;
  completedDraws: number;
  activeQueueCount: number;
  groups: Array<{
    groupId: GroupId;
    groupName: string;
    teamCount: number;
    maxCapacity: number;
  }>;
}

export interface TeamLeaderSnapshot {
  team: TeamRecord;
  activeQueue: QueueEntry[]; // ACTIVE + WAITING ordered by sequenceNumber ASC
  groups: GroupRecord[];
  eventSettings: EventSettings;
  recentDraws: DrawHistoryEntry[];
  serverTime: string;
}

export interface AdminSnapshot {
  teams: TeamRecord[];
  queueEntries: QueueEntry[];
  groups: GroupRecord[];
  drawHistory: DrawHistoryEntry[];
  eventSettings: EventSettings;
  auditLogs: AuditLogEntry[];
  serverTime: string;
}

export interface SpinResult {
  drawId: string;
  teamId: string;
  assignedGroup: GroupId;
  assignedGroupName: string;
  drawOrder: number;
  sequenceNumber: number;
  allocatedAt: string;
}

export interface JoinQueueResult {
  queueEntryId: string;
  sequenceNumber: number;
  status: 'ACTIVE' | 'WAITING';
}

export interface SessionInfo {
  role: 'team_leader' | 'admin';
  token: string;
  teamId?: string;
  studentId?: string;
}
