// Reconcile WhatsApp delivery status with the provider.
//
// Some providers (notably Zavu) accept a template send synchronously but
// later mark it as failed when WhatsApp itself rejects delivery. The send
// edge function records the row as "sent" because the API call succeeded,
// so the dashboard ends up out of sync with reality.
//
// This function pulls recent rows from `whatsapp_notifications` that:
//   - have a provider message id (so we can look them up)
//   - are still marked as "sent"
//   - were sent within the lookback window (default 24h)
//   - belong to the caller's branch (RLS scope is enforced via the user JWT
//     for the SELECT, then a service-role client performs the UPDATE so we
//     can patch rows without granting write access at the RLS layer).
//
// For each row we ask the provider for the latest status. If the provider
// reports "failed" (or any error code/message), we flip the local row to
// "failed" and copy the provider's reason into `error_message`. We always
// stamp `status_checked_at` so we don't keep re-polling the same row.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ZavuStatusResult {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: string;
}

async function fetchZavuMessageStatus(
  apiKey: string,
  messageId: string,
): Promise<ZavuStatusResult | null> {
  try {
    const res = await fetch(
      `https://api.zavu.dev/v1/messages/${encodeURIComponent(messageId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const rawText = await res.text().catch(() => "");
    if (!res.ok) return { raw: `HTTP ${res.status} - ${rawText.substring(0, 300)}` };
    let body: { message?: Record<string, unknown> } | null = null;
    try {
      body = JSON.parse(rawText);
    } catch {
      /* noop */
    }
    const m = body?.message as Record<string, unknown> | undefined;
    if (!m) return { raw: rawText.substring(0, 300) };
    const errObj = (m.error ?? m.failure ?? null) as
      | Record<string, unknown>
      | null;
    return {
      status: typeof m.status === "string" ? m.status : undefined,
      errorCode:
        typeof m.errorCode === "string"
          ? m.errorCode
          : errObj && typeof errObj.code === "string"
            ? errObj.code
            : undefined,
      errorMessage:
        typeof m.errorMessage === "string"
          ? m.errorMessage
          : typeof m.failureReason === "string"
            ? (m.failureReason as string)
            : errObj && typeof errObj.message === "string"
              ? errObj.message
              : undefined,
      raw: rawText.substring(0, 400),
    };
  } catch (e) {
    return { raw: `fetch-error: ${(e as Error).message}` };
  }
}

// Decrypt the per-tenant Zavu API key using the same AES-GCM scheme as the
// shared whatsapp-provider module (RAZORPAY_ENCRYPTION_KEY env var).
async function decrypt(
  encrypted: string,
  iv: string,
  keyB64: string,
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    cipherBytes,
  );
  return new TextDecoder().decode(plain);
}

interface PendingRow {
  id: string;
  provider: string | null;
  provider_message_id: string | null;
  branch_id: string | null;
}

async function loadZavuKeyForBranch(
  service: SupabaseClient,
  branchId: string,
  encKey: string,
): Promise<string | null> {
  // Resolve the tenant for this branch, then the messaging config row.
  const { data: branch } = await service
    .from("branches")
    .select("tenant_id")
    .eq("id", branchId)
    .maybeSingle();
  const tenantId = (branch as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return null;

  const { data: cfg } = await service
    .from("messaging_provider_configs")
    .select("zavu_api_key_encrypted, zavu_api_key_iv, active_provider")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const c = cfg as
    | {
        zavu_api_key_encrypted?: string;
        zavu_api_key_iv?: string;
        active_provider?: string;
      }
    | null;
  if (!c?.zavu_api_key_encrypted || !c?.zavu_api_key_iv) return null;
  try {
    return await decrypt(c.zavu_api_key_encrypted, c.zavu_api_key_iv, encKey);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const encKey = Deno.env.get("RAZORPAY_ENCRYPTION_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { error: "server_misconfigured" });
  }
  if (!encKey) {
    return json(500, { error: "encryption_key_missing" });
  }

  // Parse args. `branchId` scopes the reconcile to a single branch (matches
  // the dashboard's branch selector). `lookbackMinutes` defaults to 24h.
  let body: { branchId?: string; lookbackMinutes?: number; limit?: number } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    /* allow empty body */
  }
  const branchId = typeof body.branchId === "string" ? body.branchId : null;
  const lookbackMinutes =
    typeof body.lookbackMinutes === "number" && body.lookbackMinutes > 0
      ? Math.min(body.lookbackMinutes, 60 * 24 * 7)
      : 60 * 24;
  const limit =
    typeof body.limit === "number" && body.limit > 0
      ? Math.min(body.limit, 200)
      : 100;

  // Auth: require a logged-in user. We use the user's JWT to read with RLS,
  // then the service client to update.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json(401, { error: "unauthorized" });
  }

  const service = createClient(supabaseUrl, serviceRoleKey);

  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  // Pull recent "sent" rows that have a Zavu message id. We use the user
  // client so RLS automatically scopes to branches/tenants the caller owns.
  let q = userClient
    .from("whatsapp_notifications")
    .select("id, provider, provider_message_id, branch_id")
    .eq("status", "sent")
    .eq("provider", "zavu")
    .not("provider_message_id", "is", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (branchId) q = q.eq("branch_id", branchId);

  const { data: rows, error: selErr } = await q;
  if (selErr) {
    return json(500, { error: "select_failed", detail: selErr.message });
  }
  const pending = (rows ?? []) as PendingRow[];

  // Cache decrypted Zavu keys per branch so we hit messaging_provider_configs
  // at most once per branch in this run.
  const branchKeyCache = new Map<string, string | null>();
  let checked = 0;
  let updated = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const row of pending) {
    if (!row.provider_message_id || !row.branch_id) continue;
    let apiKey = branchKeyCache.get(row.branch_id) ?? null;
    if (!branchKeyCache.has(row.branch_id)) {
      apiKey = await loadZavuKeyForBranch(service, row.branch_id, encKey);
      branchKeyCache.set(row.branch_id, apiKey);
    }
    if (!apiKey) continue;

    checked++;
    const status = await fetchZavuMessageStatus(apiKey, row.provider_message_id);
    if (!status) continue;

    const s = (status.status ?? "").toLowerCase();
    const isFailed =
      s === "failed" ||
      s === "rejected" ||
      s === "undelivered" ||
      Boolean(status.errorCode) ||
      Boolean(status.errorMessage);

    // Only act once we have a definitive verdict. Pending/queued are skipped
    // so the next reconcile pass picks them up.
    const isDefinitive =
      isFailed ||
      s === "delivered" ||
      s === "read" ||
      s === "sent" ||
      s === "completed";

    if (!isDefinitive) {
      // Stamp the check time so we don't loop on the same row forever, but
      // leave status untouched.
      await service
        .from("whatsapp_notifications")
        .update({ status_checked_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    if (isFailed) {
      const detail =
        status.errorMessage ||
        status.errorCode ||
        (status.raw
          ? `status=${s || "unknown"} | raw=${status.raw}`
          : `status=${s || "unknown"}`);
      const { error: updErr } = await service
        .from("whatsapp_notifications")
        .update({
          status: "failed",
          error_message: `Zavu delivery failed: ${detail}`,
          status_checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updErr) {
        failures.push({ id: row.id, reason: updErr.message });
      } else {
        updated++;
      }
    } else {
      // Still successfully delivered — just stamp the check time.
      await service
        .from("whatsapp_notifications")
        .update({ status_checked_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return json(200, {
    ok: true,
    scanned: pending.length,
    checked,
    updated,
    failures,
  });
});
