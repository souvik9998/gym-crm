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
const LOWER = "abcdefghjkmnpqrstuvwxyz";   // no l (lowercase L)
const DIGITS = "23456789";                  // no 0, 1
const ALL = UPPER + LOWER + DIGITS;

const STAFF_PASSWORD_LENGTH = 10;

const pickRandom = (chars: string): string => {
  // crypto.getRandomValues is supported in all modern browsers + Deno;
  // fall back to Math.random only if unavailable (e.g. very old runtimes).
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

/**
 * Generate a staff login password that is guaranteed to satisfy the
 * platform-wide password complexity rule. Length defaults to 10.
 */
export const generateStaffPassword = (length: number = STAFF_PASSWORD_LENGTH): string => {
  const safeLength = Math.max(8, length);

  // Guarantee one of each required class first.
  const required = [pickRandom(UPPER), pickRandom(LOWER), pickRandom(DIGITS)];

  // Fill the remaining slots from the full pool.
  const remaining: string[] = [];
  for (let i = required.length; i < safeLength; i++) {
    remaining.push(pickRandom(ALL));
  }

  return shuffle([...required, ...remaining].join(""));
};

/** Human-readable description of the password rule, shown under inputs. */
export const STAFF_PASSWORD_RULE_TEXT =
  "Min 8 characters with at least 1 uppercase, 1 lowercase, and 1 number.";
