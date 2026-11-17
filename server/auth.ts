import crypto from 'crypto';

const AUTH_PEPPER =
  process.env.INNOHACK_AUTH_PEPPER ||
  'innohack-2026-sliit-kandy-change-in-production';

const SESSION_SECRET =
  process.env.INNOHACK_SESSION_SECRET ||
  'innohack-2026-session-secret-change-in-production';

export const ADMIN_PASSCODE =
  process.env.INNOHACK_ADMIN_PASSCODE || 'INNOHACK-ADMIN-2026';

export function hashRegistrationCode(
  studentId: string,
  registrationCode: string,
  salt: string
): string {
  return crypto
    .createHmac('sha256', `${AUTH_PEPPER}:${salt}`)
    .update(`${studentId.trim()}::${registrationCode.trim().toUpperCase()}`)
    .digest('hex');
}

export function verifyRegistrationCode(
  studentId: string,
  submittedCode: string,
  salt: string,
  storedHash: string
): boolean {
  const computed = hashRegistrationCode(studentId, submittedCode, salt);
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function safeStringEqual(input: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function maskRegistrationCode(code: string): string {
  const clean = code.trim().toUpperCase();
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-****-${parts[2]}`;
  }
  return 'IH26-****-****';
}

export function maskStudentId(studentId: string): string {
  const s = studentId.trim();
  if (s.length <= 4) return '****';
  return `${'•'.repeat(s.length - 4)}${s.slice(-4)}`;
}

export interface TokenPayload {
  role: 'team_leader' | 'admin';
  teamId?: string;
  studentId?: string;
  iat: number;
  exp: number;
}

export function signSessionToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 12, // 12 hours (full hackathon event day)
  };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function pickUniformGroup<T>(eligible: T[]): T {
  if (eligible.length === 0) {
    throw new Error('No eligible groups remaining.');
  }
  return eligible[crypto.randomInt(0, eligible.length)];
}
