import { passwordSchema } from "@/lib/validation";

/**
 * Single source of truth for staff password generation + rules.
 *
 * Rules (must match `passwordSchema` in src/lib/validation.ts AND the server
 * `SetPasswordSchema` in supabase/functions/_shared/validation.ts):
 *   - At least 8 characters
 *   - At least 1 uppercase letter
 *   - At least 1 lowercase letter
 *   - At least 1 digit
 *
 * Generator excludes visually ambiguous characters (I, O, l, 0, 1) so that
 * staff reading their password from a WhatsApp message can type it back
 * without confusion.
 */

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const LOWER = "abcdefghjkmnpqrstuvwxyz"; // no l (lowercase L)
const DIGITS = "23456789"; // no 0, 1
const ALL = UPPER + LOWER + DIGITS;

const STAFF_PASSWORD_LENGTH = 10;
const WEAK_NUMBER_SUFFIXES = ["12", "123", "1234", "12345", "2024", "2025", "2026"];
const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "admin123",
  "welcome123",
  "qwerty123",
  "gym12345",
  "abc12345",
]);

const pickRandom = (chars: string): string => {
  const cryptoObj = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(1);
    cryptoObj.getRandomValues(arr);
    return chars.charAt(arr[0] % chars.length);
  }
  return chars.charAt(Math.floor(Math.random() * chars.length));
};

const shuffle = (input: string): string => {
  const arr = input.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
};

const normalizeComparable = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const getNameTokens = (fullName?: string): string[] =>
  (fullName || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

const getPhoneDigits = (phone?: string): string => (phone || "").replace(/\D/g, "");

/**
 * Generate a staff login password that is guaranteed to satisfy the
 * platform-wide password complexity rule. Length defaults to 10.
 */
export const generateStaffPassword = (length: number = STAFF_PASSWORD_LENGTH): string => {
  const safeLength = Math.max(8, length);
  const required = [pickRandom(UPPER), pickRandom(LOWER), pickRandom(DIGITS)];
  const remaining: string[] = [];

  for (let i = required.length; i < safeLength; i++) {
    remaining.push(pickRandom(ALL));
  }

  return shuffle([...required, ...remaining].join(""));
};

export const STAFF_PASSWORD_RULE_TEXT =
  "Min 8 characters with at least 1 uppercase, 1 lowercase, and 1 number. Avoid names and easy number patterns.";

export const STAFF_PASSWORD_COMMON_PATTERN_MESSAGE =
  "Avoid using the staff member's name or easy number patterns like 123. Please choose a more unique password or use Generate.";

export const validateStaffPassword = (
  password: string,
  options?: { fullName?: string; phone?: string }
): { valid: true } | { valid: false; error: string } => {
  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    return {
      valid: false,
      error: result.error.errors[0]?.message || "Invalid password",
    };
  }

  const normalized = normalizeComparable(password);
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return { valid: false, error: STAFF_PASSWORD_COMMON_PATTERN_MESSAGE };
  }

  const nameTokens = getNameTokens(options?.fullName);
  const phoneDigits = getPhoneDigits(options?.phone);
  const hasOnlyLettersAndDigits = /^[A-Za-z0-9]+$/.test(password);
  const containsNameToken = nameTokens.some((token) => normalized.includes(token));
  const endsWithWeakSuffix = WEAK_NUMBER_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
  const includesPhoneTail = phoneDigits.length >= 4 && normalized.includes(phoneDigits.slice(-4));

  if (hasOnlyLettersAndDigits && containsNameToken && (endsWithWeakSuffix || includesPhoneTail)) {
    return { valid: false, error: STAFF_PASSWORD_COMMON_PATTERN_MESSAGE };
  }

  return { valid: true };
};
