import crypto from 'crypto';

const DEFAULT_PEPPER =
  process.env.INNOHACK_AUTH_PEPPER ||
  'innohack-2026-sliit-kandy-change-in-production';

/**
 * Generates a per-team HMAC-SHA256 hash of a registration code.
 * Plaintext registration codes are NEVER stored in Firestore.
 */
export function hashRegistrationCode(
  studentId: string,
  registrationCode: string,
  salt: string
): string {
  const normalizedStudent = studentId.trim();
  const normalizedCode = registrationCode.trim().toUpperCase();
  return crypto
    .createHmac('sha256', `${DEFAULT_PEPPER}:${salt}`)
    .update(`${normalizedStudent}::${normalizedCode}`)
    .digest('hex');
}

/**
 * Timing-safe verification of a submitted registration code against stored hash.
 */
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

/**
 * Timing-safe string comparison for admin passcode verification.
 */
export function safeStringEqual(input: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Masks a registration code for UI/PDF/CSV display (e.g. IH26-Y8J8-CLAE -> IH26-****-CLAE).
 */
export function maskRegistrationCode(code: string): string {
  const clean = code.trim().toUpperCase();
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-****-${parts[2]}`;
  }
  if (clean.length <= 4) return '****';
  return `${clean.slice(0, 2)}${'*'.repeat(clean.length - 4)}${clean.slice(-2)}`;
}

/**
 * Cryptographically uniform random selection from eligible groups.
 */
export function pickUniformGroup<T>(eligible: T[]): T {
  if (eligible.length === 0) {
    throw new Error('No eligible groups remaining with open slots.');
  }
  const idx = crypto.randomInt(0, eligible.length);
  return eligible[idx];
}
