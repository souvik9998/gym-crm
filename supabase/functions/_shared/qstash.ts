// Shared helpers for Upstash QStash:
// - verifyQstashSignature(): validates incoming Upstash-Signature on webhook calls
// - upsertSchedule() / deleteSchedule(): manage QStash schedules via REST API
//
// Docs: https://upstash.com/docs/qstash/features/security
//       https://upstash.com/docs/qstash/api/schedules/create

const QSTASH_BASE = "https://qstash.upstash.io/v2";

// -----------------------------------------------------------------------------
// Signature verification (HMAC-SHA256 JWT format used by QStash)
// -----------------------------------------------------------------------------

interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: string;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwt(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: parts[2],
    };
  } catch {
    return null;
  }
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return new Uint8Array(sig);
}

async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let binary = "";
  const view = new Uint8Array(digest);
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Verify the `Upstash-Signature` header on an incoming QStash request.
 * Tries both current and next signing keys (rotation grace period).
 *
 * @param signatureHeader value of `Upstash-Signature`
 * @param url full request URL exactly as Upstash signed it (the public function URL)
 * @param rawBody raw request body string
 * @param currentKey QSTASH_CURRENT_SIGNING_KEY
 * @param nextKey QSTASH_NEXT_SIGNING_KEY (may be empty)
 */
export async function verifyQstashSignature(
  signatureHeader: string | null,
  url: string,
  rawBody: string,
  currentKey: string,
  nextKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!signatureHeader) return { ok: false, reason: "missing-signature-header" };
  const jwt = decodeJwt(signatureHeader);
  if (!jwt) return { ok: false, reason: "invalid-jwt-format" };

  const { payload, signingInput, signature } = jwt;
  const now = Math.floor(Date.now() / 1000);

  // Standard JWT claims
  if (typeof payload.exp === "number" && payload.exp < now) {
    return { ok: false, reason: "signature-expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 10) {
    return { ok: false, reason: "signature-not-yet-valid" };
  }
  if (typeof payload.sub === "string" && payload.sub !== url) {
    return { ok: false, reason: `subject-mismatch:${payload.sub}` };
  }

  // Body hash claim
  if (typeof payload.body === "string") {
    const expectedBodyHash = await sha256Base64Url(rawBody);
    if (!timingSafeEqual(payload.body, expectedBodyHash)) {
      return { ok: false, reason: "body-hash-mismatch" };
    }
  }

  // Verify HMAC against current then next key
  const tryKey = async (key: string): Promise<boolean> => {
    if (!key) return false;
    const expected = bytesToBase64Url(await hmacSha256(key, signingInput));
    return timingSafeEqual(expected, signature);
  };

  if (await tryKey(currentKey)) return { ok: true };
  if (await tryKey(nextKey)) return { ok: true };
  return { ok: false, reason: "signature-mismatch" };
}

// -----------------------------------------------------------------------------
// Schedule management (QStash REST API)
// -----------------------------------------------------------------------------

export interface UpsertScheduleArgs {
  qstashToken: string;
  /** Stable schedule id used as Upstash-Schedule-Id (idempotent upsert). */
  scheduleId: string;
  /** Public URL the schedule should POST to (your edge function). */
  destinationUrl: string;
  /** Cron expression in UTC. */
  cron: string;
  /** JSON body delivered on each fire. */
  body: Record<string, unknown>;
}

export async function upsertQstashSchedule(args: UpsertScheduleArgs): Promise<string> {
  // Endpoint: POST /v2/schedules/{destination}
  // Per Upstash docs, the destination URL is appended to the path as-is (NOT URL-encoded).
  const res = await fetch(`${QSTASH_BASE}/schedules/${args.destinationUrl}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${args.qstashToken}`,
      "Content-Type": "application/json",
      "Upstash-Cron": args.cron,
      "Upstash-Schedule-Id": args.scheduleId,
      "Upstash-Method": "POST",
      "Upstash-Retries": "3",
    },
    body: JSON.stringify(args.body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`qstash-upsert-failed [${res.status}]: ${text}`);
  }
  try {
    const json = JSON.parse(text);
    return (json.scheduleId as string) || args.scheduleId;
  } catch {
    return args.scheduleId;
  }
}

export async function deleteQstashSchedule(qstashToken: string, scheduleId: string): Promise<void> {
  const res = await fetch(`${QSTASH_BASE}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${qstashToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`qstash-delete-failed [${res.status}]: ${text}`);
  }
}
