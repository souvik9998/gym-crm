/**
 * Lightweight fuzzy search utilities for member/user lists.
 *
 * Goals:
 * - Forgiving: surface results even when the query has typos, partial words,
 *   transposed characters, or matches across non-adjacent tokens.
 * - Ranked: exact > prefix > word-prefix > substring > fuzzy subsequence > typo.
 * - Cheap: pure JS, no deps, safe to run on a few hundred items per keystroke.
 */

export interface FuzzyTarget {
  name: string;
  phone: string;
  email?: string | null;
}

/**
 * Normalize a string for matching: lowercase, strip diacritics & punctuation.
 */
const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s@.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Strip everything except digits — used for phone matching.
 */
const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/**
 * Levenshtein distance with an early-exit threshold. Returns Infinity when the
 * distance exceeds `max` so we can skip far-off matches cheaply.
 */
const boundedLevenshtein = (a: string, b: string, max: number): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return Infinity;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/**
 * True if every char of `query` appears in `text` in order (subsequence match).
 */
const isSubsequence = (query: string, text: string): boolean => {
  let i = 0;
  for (let j = 0; j < text.length && i < query.length; j++) {
    if (query[i] === text[j]) i++;
  }
  return i === query.length;
};

/**
 * Score a single target against a normalized query. Higher = more relevant.
 * Returns 0 when the item should be hidden entirely.
 */
const scoreTarget = (target: FuzzyTarget, rawQuery: string): number => {
  const query = normalize(rawQuery);
  if (!query) return 1; // no query → keep everything

  const name = normalize(target.name);
  const phone = digitsOnly(target.phone);
  const email = target.email ? normalize(target.email) : "";
  const queryDigits = digitsOnly(rawQuery);

  let best = 0;

  // --- Phone matches (only when query has digits) ------------------------
  // Tiered so the FIRST digit always wins over a mid-number substring match:
  //   exact > starts-with > word-boundary > contains.
  if (queryDigits.length > 0) {
    if (phone === queryDigits) best = Math.max(best, 1000);
    else if (phone.startsWith(queryDigits)) best = Math.max(best, 980);
    // Common case: stored as "+91XXXXXXXXXX" but user types the local 10-digit
    // number. Treat trailing-match as a strong "starts with" signal too.
    else if (phone.endsWith(queryDigits) && queryDigits.length >= 6) {
      best = Math.max(best, 960);
    }
    else if (phone.includes(queryDigits)) best = Math.max(best, 600);
  }

  // --- Exact / prefix / substring on name --------------------------------
  // Highest priority: the name's FIRST letter matches the query's first letter.
  // This guarantees that typing "A" lists every "A…" name above any name
  // where "a" only appears later (e.g. "Ayush" before "Raj" before "Mahesh").
  const tokens = name.split(" ").filter(Boolean);

  if (name === query) best = Math.max(best, 1000);
  else if (name.startsWith(query)) best = Math.max(best, 980);
  // Single-letter query: if the FIRST char of the full name matches, treat it
  // as a top-tier hit even before considering other word tokens.
  else if (query.length === 1 && name.length > 0 && name[0] === query[0]) {
    best = Math.max(best, 970);
  }

  // Word-prefix: any whitespace-separated token (after the first word) starts
  // with the query. Ranked BELOW full-name first-letter matches so that
  // "S" surfaces "Smith John" after "Sara" but still above mid-word hits.
  if (best < 900 && tokens.some((t) => t.startsWith(query))) {
    best = Math.max(best, 880);
  }

  // Weaker tier: query appears somewhere inside the name/email but not at the
  // start of any word. Capped well below the prefix tier so prefix wins.
  if (best < 880 && name.includes(query)) best = Math.max(best, 500);
  if (best < 880 && email && email.includes(query)) best = Math.max(best, 450);

  // --- Multi-token AND match ---------------------------------------------
  // e.g. "joh smi" → matches "John Smith" even out of order.
  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length > 1) {
    const haystack = `${name} ${email}`;
    if (queryTokens.every((qt) => haystack.includes(qt))) {
      best = Math.max(best, 550);
    }
  }

  // --- Subsequence match (e.g. "jhn" → "john") ---------------------------
  if (best < 400 && query.length >= 2 && isSubsequence(query, name)) {
    best = Math.max(best, 350);
  }

  // --- Typo tolerance via bounded Levenshtein ----------------------------
  // Allow ~1 edit per 4 chars, capped at 2 edits.
  if (best < 300 && query.length >= 3) {
    const maxEdits = Math.min(2, Math.floor(query.length / 4) + 1);
    for (const token of tokens) {
      if (Math.abs(token.length - query.length) > maxEdits) continue;
      const dist = boundedLevenshtein(query, token, maxEdits);
      if (dist !== Infinity) {
        // Closer matches get higher scores (300 → 250).
        best = Math.max(best, 300 - dist * 25);
        break;
      }
    }
  }

  return best;
};

/**
 * Filter + rank a list of items by a query. Items scoring 0 are dropped.
 * Stable ordering for items with equal scores is preserved via index tiebreak.
 */
export function fuzzySearch<T extends FuzzyTarget>(
  items: T[],
  query: string,
): T[] {
  if (!query.trim()) return items;

  const scored: Array<{ item: T; score: number; index: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const score = scoreTarget(items[i], query);
    if (score > 0) scored.push({ item: items[i], score, index: i });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((s) => s.item);
}
