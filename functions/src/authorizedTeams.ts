/**
 * SERVER-ONLY AUTHORIZED TEAM CREDENTIAL SEED LIST
 * -----------------------------------------------------------------------------
 * Exactly 30 registered INNOHACK Season 2026 team leaders.
 * NEVER import this module into any frontend (src/) bundle.
 * During Firestore seeding, registration codes are hashed with HMAC-SHA256
 * and stored ONLY in the client-inaccessible `teamCredentials` collection.
 */

export interface AuthorizedTeamSeed {
  teamId: string;
  teamName: string;
  studentId: string;
  registrationCode: string;
}

export const AUTHORIZED_TEAMS: AuthorizedTeamSeed[] = [
  { teamId: 'TEAM-01', teamName: 'InnoHack Squad 01', registrationCode: 'IH26-Y8J8-CLAE', studentId: '200426604486' },
  { teamId: 'TEAM-02', teamName: 'InnoHack Squad 02', registrationCode: 'IH26-8KMN-LNNE', studentId: '200266702029' },
  { teamId: 'TEAM-03', teamName: 'InnoHack Squad 03', registrationCode: 'IH26-8FHM-DHQW', studentId: '200422003799' },
  { teamId: 'TEAM-04', teamName: 'InnoHack Squad 04', registrationCode: 'IH26-X2QU-Z9AV', studentId: '200218702100' },
  { teamId: 'TEAM-05', teamName: 'InnoHack Squad 05', registrationCode: 'IH26-X9EZ-26RK', studentId: '200327311137' },
  { teamId: 'TEAM-06', teamName: 'InnoHack Squad 06', registrationCode: 'IH26-TKQW-CSGH', studentId: '200320700472' },
  { teamId: 'TEAM-07', teamName: 'InnoHack Squad 07', registrationCode: 'IH26-NJAV-S74Y', studentId: '200623602435' },
  { teamId: 'TEAM-08', teamName: 'InnoHack Squad 08', registrationCode: 'IH26-DMPC-WN98', studentId: '200328013405' },
  { teamId: 'TEAM-09', teamName: 'InnoHack Squad 09', registrationCode: 'IH26-5G8E-YJFN', studentId: '200334412686' },
  { teamId: 'TEAM-10', teamName: 'InnoHack Squad 10', registrationCode: 'IH26-JLCG-FKTG', studentId: '200420003773' },
  { teamId: 'TEAM-11', teamName: 'InnoHack Squad 11', registrationCode: 'IH26-VG3P-Z9UL', studentId: '200666903134' },
  { teamId: 'TEAM-12', teamName: 'InnoHack Squad 12', registrationCode: 'IH26-ZV5N-ZYPA', studentId: '200035300936' },
  { teamId: 'TEAM-13', teamName: 'InnoHack Squad 13', registrationCode: 'IH26-6TRJ-ZJ5Q', studentId: '200274101253' },
  { teamId: 'TEAM-14', teamName: 'InnoHack Squad 14', registrationCode: 'IH26-EJHA-EHD4', studentId: '200913504204' },
  { teamId: 'TEAM-15', teamName: 'InnoHack Squad 15', registrationCode: 'IH26-LULP-3QMT', studentId: '200422302861' },
  { teamId: 'TEAM-16', teamName: 'InnoHack Squad 16', registrationCode: 'IH26-P759-SLEQ', studentId: '200466900961' },
  { teamId: 'TEAM-17', teamName: 'InnoHack Squad 17', registrationCode: 'IH26-QHLN-UMSP', studentId: '200534004109' },
  { teamId: 'TEAM-18', teamName: 'InnoHack Squad 18', registrationCode: 'IH26-MBJK-JDDJ', studentId: '200213300090' },
  { teamId: 'TEAM-19', teamName: 'InnoHack Squad 19', registrationCode: 'IH26-H3QQ-EY2K', studentId: '200510302760' },
  { teamId: 'TEAM-20', teamName: 'InnoHack Squad 20', registrationCode: 'IH26-8TAU-G6K4', studentId: '200224101763' },
  { teamId: 'TEAM-21', teamName: 'InnoHack Squad 21', registrationCode: 'IH26-KDCR-PK2Q', studentId: '200510901170' },
  { teamId: 'TEAM-22', teamName: 'InnoHack Squad 22', registrationCode: 'IH26-6JJ5-U66J', studentId: '200484803220' },
  { teamId: 'TEAM-23', teamName: 'InnoHack Squad 23', registrationCode: 'IH26-N9UR-LNKX', studentId: '200425903589' },
  { teamId: 'TEAM-24', teamName: 'InnoHack Squad 24', registrationCode: 'IH26-23C9-WPNG', studentId: '200260201400' },
  { teamId: 'TEAM-25', teamName: 'InnoHack Squad 25', registrationCode: 'IH26-J6MB-7A2H', studentId: '200522803731' },
  { teamId: 'TEAM-26', teamName: 'InnoHack Squad 26', registrationCode: 'IH26-V2LC-ZE2N', studentId: '200315010280' },
  { teamId: 'TEAM-27', teamName: 'InnoHack Squad 27', registrationCode: 'IH26-5F5M-MCE7', studentId: '200618102950' },
  { teamId: 'TEAM-28', teamName: 'InnoHack Squad 28', registrationCode: 'IH26-8G3C-6XEX', studentId: '200330213004' },
  { teamId: 'TEAM-29', teamName: 'InnoHack Squad 29', registrationCode: 'IH26-JCNV-25CX', studentId: '200208401740' },
  { teamId: 'TEAM-30', teamName: 'InnoHack Squad 30', registrationCode: 'IH26-P8HU-75TR', studentId: '200602101081' },
];
