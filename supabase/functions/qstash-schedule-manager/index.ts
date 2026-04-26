// Authenticated admin/super-admin endpoint that creates, updates, lists or
// deletes Upstash QStash schedules for a branch's expiry reminders.
//
// Actions (query string `?action=`):
//   - `upsert`     : body { branchId } → creates/refreshes both reminder schedules for that branch
//   - `delete`     : body { branchId } → removes both reminder schedules for that branch
//   - `list`       : body { branchId } → returns rows from `qstash_schedules` for that branch
//   - `sync-tenant`: body { tenantId } → upserts schedules for every WhatsApp-enabled branch in the tenant
//
// Auth: requires a Supabase JWT. The user must be either super_admin or
// tenant_admin for the target branch's tenant.

import { createClient } from "npm:@supabase/supabase-js@2";
import { upsertQstashSchedule, deleteQstashSchedule } from "../_shared/qstash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (event: string, data: Record<string, unknown> = {}) => {
  console.log(`[qstash-schedule-manager] ${event}`, JSON.stringify(data));
};

// 09:00 IST = 03:30 UTC, every day. Keep parity with the legacy pg_cron schedule.
const REMINDER_CRON_UTC = "30 3 * * *";

const KINDS: ("expiring_soon" | "expired")[] = ["expiring_soon", "expired"];

const stableScheduleId = (branchId: string, kind: string) =>
  `gymkloud-${kind}-${branchId}`;

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
}

const json = (r: JsonResponse): Response =>
  new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const QSTASH_TOKEN = Deno.env.get("QSTASH_TOKEN");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return json({ status: 500, body: { error: "server-misconfigured" } });
  }
  if (!QSTASH_TOKEN) {
    return json({ status: 500, body: { error: "qstash-token-missing" } });
  }

  // -------- Authenticate caller --------
  const authHeader = req.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ status: 401, body: { error: "unauthenticated" } });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    log("auth-failed", { error: userErr?.message });
    return json({ status: 401, body: { error: "invalid-token" } });
  }
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: isSuperData } = await admin.rpc("is_super_admin", { _user_id: userId });
  const isSuper = isSuperData === true;

  // -------- Parse request --------
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const reminderUrl = `${SUPABASE_URL}/functions/v1/qstash-expiry-reminders`;

  // -------- Authorization helper --------
  const ensureBranchAccess = async (branchId: string): Promise<boolean> => {
    if (isSuper) return true;
    const { data: tenantId } = await admin.rpc("get_tenant_from_branch", { _branch_id: branchId });
    if (!tenantId) return false;
    const { data: isAdminForTenant } = await admin.rpc("is_tenant_admin", {
      _user_id: userId,
      _tenant_id: tenantId,
    });
    return isAdminForTenant === true;
  };

  // -------- Action handlers --------

  if (action === "list") {
    const branchId = body.branchId as string;
    if (!branchId) return json({ status: 400, body: { error: "branchId-required" } });
    if (!(await ensureBranchAccess(branchId))) {
      return json({ status: 403, body: { error: "forbidden" } });
    }
    const { data, error } = await admin
      .from("qstash_schedules")
      .select("*")
      .eq("branch_id", branchId);
    if (error) return json({ status: 500, body: { error: error.message } });
    return json({ status: 200, body: { schedules: data || [] } });
  }

  if (action === "upsert") {
    const branchId = body.branchId as string;
    if (!branchId) return json({ status: 400, body: { error: "branchId-required" } });
    if (!(await ensureBranchAccess(branchId))) {
      return json({ status: 403, body: { error: "forbidden" } });
    }

    const results: Record<string, unknown> = {};
    for (const kind of KINDS) {
      const scheduleId = stableScheduleId(branchId, kind);
      try {
        const upstreamId = await upsertQstashSchedule({
          qstashToken: QSTASH_TOKEN,
          scheduleId,
          destinationUrl: reminderUrl,
          cron: REMINDER_CRON_UTC,
          body: { branchId, kind },
        });
        await admin.from("qstash_schedules").upsert(
          {
            branch_id: branchId,
            kind,
            schedule_id: upstreamId,
            cron_expression: REMINDER_CRON_UTC,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "branch_id,kind" },
        );
        results[kind] = { ok: true, scheduleId: upstreamId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("upsert-failed", { branchId, kind, error: message });
        results[kind] = { ok: false, error: message };
      }
    }
    return json({ status: 200, body: { branchId, results } });
  }

  if (action === "delete") {
    const branchId = body.branchId as string;
    if (!branchId) return json({ status: 400, body: { error: "branchId-required" } });
    if (!(await ensureBranchAccess(branchId))) {
      return json({ status: 403, body: { error: "forbidden" } });
    }

    const { data: existing } = await admin
      .from("qstash_schedules")
      .select("schedule_id, kind")
      .eq("branch_id", branchId);

    const results: Record<string, unknown> = {};
    for (const row of existing || []) {
      try {
        await deleteQstashSchedule(QSTASH_TOKEN, row.schedule_id);
        results[row.kind] = { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("delete-failed", { branchId, kind: row.kind, error: message });
        results[row.kind] = { ok: false, error: message };
      }
    }
    await admin.from("qstash_schedules").delete().eq("branch_id", branchId);
    return json({ status: 200, body: { branchId, deleted: results } });
  }

  if (action === "sync-tenant") {
    const tenantId = body.tenantId as string;
    if (!tenantId) return json({ status: 400, body: { error: "tenantId-required" } });
    if (!isSuper) {
      const { data: isAdminForTenant } = await admin.rpc("is_tenant_admin", {
        _user_id: userId,
        _tenant_id: tenantId,
      });
      if (isAdminForTenant !== true) {
        return json({ status: 403, body: { error: "forbidden" } });
      }
    }

    // Find branches with WhatsApp enabled and at least one expiry toggle on
    const { data: branches } = await admin
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .is("deleted_at", null);

    const branchIds = (branches || []).map((b) => b.id as string);
    const summary: Record<string, unknown> = {};

    for (const branchId of branchIds) {
      const { data: settings } = await admin
        .from("gym_settings")
        .select("whatsapp_enabled, whatsapp_auto_send")
        .eq("branch_id", branchId)
        .maybeSingle();

      const enabled = settings?.whatsapp_enabled === true;
      const prefs = (settings?.whatsapp_auto_send as Record<string, unknown>) || {};
      const wantsAny = enabled && (prefs.expiring_2days !== false || prefs.expired_reminder === true);

      if (!wantsAny) {
        // Cleanup any stale schedule for this branch
        const { data: existing } = await admin
          .from("qstash_schedules")
          .select("schedule_id")
          .eq("branch_id", branchId);
        for (const row of existing || []) {
          try {
            await deleteQstashSchedule(QSTASH_TOKEN, row.schedule_id);
          } catch (err) {
            log("sync-cleanup-failed", { branchId, error: String(err) });
          }
        }
        await admin.from("qstash_schedules").delete().eq("branch_id", branchId);
        summary[branchId] = { skipped: "disabled" };
        continue;
      }

      const branchResults: Record<string, unknown> = {};
      for (const kind of KINDS) {
        const scheduleId = stableScheduleId(branchId, kind);
        try {
          const upstreamId = await upsertQstashSchedule({
            qstashToken: QSTASH_TOKEN,
            scheduleId,
            destinationUrl: reminderUrl,
            cron: REMINDER_CRON_UTC,
            body: { branchId, kind },
          });
          await admin.from("qstash_schedules").upsert(
            {
              branch_id: branchId,
              kind,
              schedule_id: upstreamId,
              cron_expression: REMINDER_CRON_UTC,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "branch_id,kind" },
          );
          branchResults[kind] = { ok: true };
        } catch (err) {
          branchResults[kind] = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
      summary[branchId] = branchResults;
    }

    return json({ status: 200, body: { tenantId, branches: summary } });
  }

  return json({ status: 400, body: { error: "unknown-action", action } });
});
