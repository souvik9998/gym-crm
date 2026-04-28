// Authenticated admin/super-admin endpoint that creates, updates, lists or
// deletes Upstash QStash schedules for a branch's expiry reminders.
//
// Actions (query string `?action=`):
//   - `upsert`     : body { branchId } → creates/refreshes both reminder schedules for that branch
//   - `delete`     : body { branchId } → removes both reminder schedules for that branch
//   - `list`       : body { branchId } → returns rows from `qstash_schedules` for that branch
//   - `sync-tenant`: body { tenantId } → upserts schedules for every WhatsApp-enabled branch in the tenant
//
// Each branch chooses its own reminder_time (gym_settings.reminder_time, IST).
// The tenant-wide kill switch lives at tenant_messaging_config.qstash_scheduler_enabled.

import { createClient } from "npm:@supabase/supabase-js@2";
import { upsertQstashSchedule, deleteQstashSchedule } from "../_shared/qstash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (event: string, data: Record<string, unknown> = {}) => {
  console.log(`[qstash-schedule-manager] ${event}`, JSON.stringify(data));
};

const KINDS: ("expiring_soon" | "expired")[] = ["expiring_soon", "expired"];
const DEFAULT_REMINDER_TIME = "09:00:00";

const stableScheduleId = (branchId: string, kind: string) =>
  `gymkloud-${kind}-${branchId}`;

/**
 * Convert an IST time string (HH:MM or HH:MM:SS) to a UTC daily cron expression.
 * IST is UTC+5:30, so we subtract 5h30m and wrap modulo 24h.
 * Example: "09:00" IST → "30 3 * * *"  (03:30 UTC daily).
 */
const istTimeToUtcCron = (istTime: string | null | undefined): string => {
  const safe = (istTime || DEFAULT_REMINDER_TIME).trim();
  const parts = safe.split(":");
  const h = Math.max(0, Math.min(23, parseInt(parts[0] || "9", 10) || 9));
  const m = Math.max(0, Math.min(59, parseInt(parts[1] || "0", 10) || 0));
  // Subtract 5h30m
  let totalMin = h * 60 + m - (5 * 60 + 30);
  if (totalMin < 0) totalMin += 24 * 60;
  const utcH = Math.floor(totalMin / 60);
  const utcM = totalMin % 60;
  return `${utcM} ${utcH} * * *`;
};

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
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const reminderUrl = `${SUPABASE_URL}/functions/v1/qstash-expiry-reminders`;

  // -------- Helpers --------
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

  /**
   * Returns true if the tenant has the QStash scheduler enabled.
   * Defaults to TRUE when no messaging config row exists yet.
   */
  const isTenantSchedulerEnabled = async (tenantId: string): Promise<boolean> => {
    const { data } = await admin
      .from("tenant_messaging_config")
      .select("qstash_scheduler_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return true;
    return data.qstash_scheduler_enabled !== false;
  };

  /**
   * Wipe all QStash schedules + rows for a branch.
   */
  const purgeBranchSchedules = async (branchId: string): Promise<void> => {
    const { data: existing } = await admin
      .from("qstash_schedules")
      .select("schedule_id")
      .eq("branch_id", branchId);
    for (const row of existing || []) {
      try {
        await deleteQstashSchedule(QSTASH_TOKEN, row.schedule_id);
      } catch (err) {
        log("purge-delete-failed", { branchId, scheduleId: row.schedule_id, error: String(err) });
      }
    }
    await admin.from("qstash_schedules").delete().eq("branch_id", branchId);
  };

  /**
   * Upsert both schedules for one branch using its configured reminder_time.
   */
  const upsertBranchSchedules = async (branchId: string): Promise<Record<string, unknown>> => {
    const { data: settings } = await admin
      .from("gym_settings")
      .select("reminder_time")
      .eq("branch_id", branchId)
      .maybeSingle();

    const cron = istTimeToUtcCron(settings?.reminder_time as string | null | undefined);
    const results: Record<string, unknown> = { cron };

    for (const kind of KINDS) {
      const scheduleId = stableScheduleId(branchId, kind);
      try {
        const upstreamId = await upsertQstashSchedule({
          qstashToken: QSTASH_TOKEN,
          scheduleId,
          destinationUrl: reminderUrl,
          cron,
          body: { branchId, kind },
        });
        await admin.from("qstash_schedules").upsert(
          {
            branch_id: branchId,
            kind,
            schedule_id: upstreamId,
            cron_expression: cron,
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
    return results;
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

    // Tenant kill switch: if scheduler is disabled for this tenant, treat as a delete.
    const { data: tenantId } = await admin.rpc("get_tenant_from_branch", { _branch_id: branchId });
    if (tenantId && !(await isTenantSchedulerEnabled(tenantId as string))) {
      await purgeBranchSchedules(branchId);
      return json({
        status: 200,
        body: { branchId, skipped: "tenant-scheduler-disabled" },
      });
    }

    const results = await upsertBranchSchedules(branchId);
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

    // Tenant kill switch: wipe everything if disabled.
    const schedulerOn = await isTenantSchedulerEnabled(tenantId);

    const { data: branches } = await admin
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .is("deleted_at", null);

    const branchIds = (branches || []).map((b) => b.id as string);
    const summary: Record<string, unknown> = {};

    if (!schedulerOn) {
      for (const branchId of branchIds) {
        await purgeBranchSchedules(branchId);
        summary[branchId] = { skipped: "tenant-scheduler-disabled" };
      }
      return json({
        status: 200,
        body: { tenantId, schedulerEnabled: false, branches: summary },
      });
    }

    for (const branchId of branchIds) {
      const { data: settings } = await admin
        .from("gym_settings")
        .select("whatsapp_enabled, whatsapp_auto_send")
        .eq("branch_id", branchId)
        .maybeSingle();

      const enabled = settings?.whatsapp_enabled === true;
      const prefs = (settings?.whatsapp_auto_send as Record<string, unknown>) || {};
      const wantsAny =
        enabled &&
        (prefs.expiring_2days !== false ||
          prefs.expiring_today !== false ||
          prefs.expired_reminder === true);

      if (!wantsAny) {
        await purgeBranchSchedules(branchId);
        summary[branchId] = { skipped: "branch-disabled" };
        continue;
      }

      summary[branchId] = await upsertBranchSchedules(branchId);
    }

    return json({
      status: 200,
      body: { tenantId, schedulerEnabled: true, branches: summary },
    });
  }

  return json({ status: 400, body: { error: "unknown-action", action } });
});
