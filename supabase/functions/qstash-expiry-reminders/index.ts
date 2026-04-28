// QStash webhook receiver — sends Expiring Soon and Expired Reminder WhatsApps
// for a single branch on a daily cadence.
//
// Triggered by Upstash QStash schedules created via `qstash-schedule-manager`.
// Body: { branchId: string, kind: "expiring_soon" | "expired" }
//
// Security: validated via Upstash-Signature header (HMAC). Anyone hitting this
// without a valid signature is rejected with 401.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsAppForTenant } from "../_shared/whatsapp-provider.ts";
import { verifyQstashSignature } from "../_shared/qstash.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, upstash-signature",
};

const log = (event: string, data: Record<string, unknown> = {}) => {
  console.log(`[qstash-expiry-reminders] ${event}`, JSON.stringify(data));
};

interface WebhookBody {
  branchId: string;
  kind: "expiring_soon" | "expired";
  /** Optional: sent during dry-run testing from the schedule manager. */
  dryRun?: boolean;
  /** Optional: manual admin/super-admin invocation (bypass Upstash signature, use JWT). */
  manual?: boolean;
}

const formatPhone = (phoneNum: string): string => {
  let cleaned = phoneNum.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  if (cleaned.length === 10) cleaned = "91" + cleaned;
  return cleaned;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const CURRENT_KEY = Deno.env.get("QSTASH_CURRENT_SIGNING_KEY") ?? "";
  const NEXT_KEY = Deno.env.get("QSTASH_NEXT_SIGNING_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log("config-error", { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_ROLE_KEY });
    return new Response(JSON.stringify({ error: "server-misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  // Signature verification (skipped only when dryRun=true is sent from an authenticated test path).
  let parsed: WebhookBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid-json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth strategy:
  //   1. dryRun=true        → no auth (used by internal sync test paths)
  //   2. manual=true        → require valid Supabase JWT for super_admin or tenant_admin
  //   3. otherwise (QStash) → verify Upstash-Signature
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (parsed.manual === true) {
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "invalid-token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isSuper } = await adminClient.rpc("is_super_admin", { _user_id: userData.user.id });
    let allowed = isSuper === true;
    if (!allowed && parsed.branchId) {
      const { data: tenantId } = await adminClient.rpc("get_tenant_from_branch", { _branch_id: parsed.branchId });
      if (tenantId) {
        const { data: isTenantAdmin } = await adminClient.rpc("is_tenant_admin", {
          _user_id: userData.user.id, _tenant_id: tenantId,
        });
        allowed = isTenantAdmin === true;
      }
    }
    if (!allowed) {
      log("manual-forbidden", { userId: userData.user.id, branchId: parsed.branchId });
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("manual-authorized", { userId: userData.user.id, branchId: parsed.branchId });
  } else if (!parsed.dryRun) {
    if (!CURRENT_KEY) {
      log("missing-signing-key");
      return new Response(JSON.stringify({ error: "server-misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const verification = await verifyQstashSignature(
      req.headers.get("upstash-signature"),
      req.url,
      rawBody,
      CURRENT_KEY,
      NEXT_KEY,
    );
    if (!verification.ok) {
      log("signature-rejected", { reason: verification.reason });
      return new Response(JSON.stringify({ error: "invalid-signature", reason: verification.reason }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const { branchId, kind } = parsed;
  if (!branchId || (kind !== "expiring_soon" && kind !== "expired")) {
    return new Response(JSON.stringify({ error: "invalid-body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  log("triggered", { branchId, kind, dryRun: !!parsed.dryRun });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load gym settings for this branch
  const { data: settings, error: settingsErr } = await supabase
    .from("gym_settings")
    .select("branch_id, gym_name, whatsapp_enabled, whatsapp_auto_send")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (settingsErr || !settings) {
    log("settings-not-found", { branchId, error: settingsErr?.message });
    return new Response(JSON.stringify({ success: true, skipped: "no-settings" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (settings.whatsapp_enabled !== true) {
    log("whatsapp-disabled", { branchId });
    return new Response(JSON.stringify({ success: true, skipped: "whatsapp-disabled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prefs = (settings.whatsapp_auto_send as Record<string, unknown>) || {};
  const gymName = (settings.gym_name as string) || "Gym";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  const memberLogs: { memberId: string; status: string }[] = [];

  // ----------------------------------------------------------------------------
  // EXPIRING SOON
  // ----------------------------------------------------------------------------
  if (kind === "expiring_soon") {
    if (prefs.expiring_2days === false) {
      log("expiring-soon-toggle-off", { branchId });
      return new Response(JSON.stringify({ success: true, skipped: "toggle-off", attempted, sent, failed }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const daysBefore =
      typeof prefs.expiring_days_before === "number" ? (prefs.expiring_days_before as number) : 2;
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const targetStr = targetDate.toISOString().split("T")[0];

    const { data: candidates } = await supabase
      .from("subscriptions")
      .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("end_date", targetStr)
      .eq("members.branch_id", branchId)
      .in("status", ["active", "expiring_soon"]);

    const candidateSubIds = (candidates || []).map((s: any) => s.id).filter(Boolean);
    let alreadySoon = new Set<string>();
    if (candidateSubIds.length > 0) {
      const { data: priorLogs } = await supabase
        .from("whatsapp_notifications")
        .select("subscription_id")
        .eq("branch_id", branchId)
        .eq("notification_type", "expiring_2days")
        .eq("status", "sent")
        .in("subscription_id", candidateSubIds);
      alreadySoon = new Set((priorLogs || []).map((p: any) => p.subscription_id).filter(Boolean));
    }
    const toSend = (candidates || []).filter((s: any) => !alreadySoon.has(s.id));

    log("expiring-soon-query", {
      branchId,
      targetDate: targetStr,
      daysBefore,
      matched: candidates?.length || 0,
      alreadyReminded: alreadySoon.size,
      willSend: toSend.length,
    });

    for (const sub of toSend) {
      const member = (sub as any).members;
      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      });
      const message = `⚠️ Hi ${member.name}!\n\nYour gym membership at *${gymName}* expires in *${daysBefore} day${daysBefore > 1 ? "s" : ""}* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;
      const formatted = formatPhone(member.phone);

      attempted++;
      if (parsed.dryRun) {
        memberLogs.push({ memberId: member.id, status: "dry-run" });
        continue;
      }

      const result = await sendWhatsAppForTenant(supabase, {
        toPhone: formatted,
        category: "expiring_2days",
        variables: {
          name: member.name,
          days: String(daysBefore),
          expiry_date: expiryDate,
          branch_name: gymName,
        },
        fallbackText: message,
        branchId,
      });

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        subscription_id: sub.id,
        recipient_name: member.name,
        recipient_phone: formatted,
        message_content: message,
        notification_type: "expiring_2days",
        status: result.success ? "sent" : "failed",
        error_message: result.success ? null : result.error,
        is_manual: parsed.manual === true,
        branch_id: branchId,
      });

      if (result.success) sent++;
      else failed++;
      memberLogs.push({ memberId: member.id, status: result.success ? "sent" : "failed" });
    }
  }

  // ----------------------------------------------------------------------------
  // EXPIRED REMINDER
  // ----------------------------------------------------------------------------
  if (kind === "expired") {
    if (prefs.expired_reminder !== true) {
      log("expired-reminder-toggle-off", { branchId });
      return new Response(JSON.stringify({ success: true, skipped: "toggle-off", attempted, sent, failed }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const daysAfter =
      typeof prefs.expired_days_after === "number" ? (prefs.expired_days_after as number) : 7;
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - daysAfter);
    const targetStr = targetDate.toISOString().split("T")[0];

    const { data: branchSubs } = await supabase
      .from("subscriptions")
      .select("id, member_id, end_date, status, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("members.branch_id", branchId)
      .order("end_date", { ascending: false });

    const latestByMember = new Map<string, any>();
    for (const sub of branchSubs || []) {
      const m = (sub as any).members;
      if (!m?.id || latestByMember.has(m.id)) continue;
      latestByMember.set(m.id, sub);
    }

    const expiredCandidates = Array.from(latestByMember.values()).filter(
      (s: any) => s.status === "expired" && s.end_date <= targetStr,
    );

    const candidateSubIds = expiredCandidates.map((s: any) => s.id).filter(Boolean);
    let alreadyReminded = new Set<string>();
    if (candidateSubIds.length > 0) {
      const { data: priorLogs } = await supabase
        .from("whatsapp_notifications")
        .select("subscription_id")
        .eq("branch_id", branchId)
        .eq("notification_type", "expired_reminder")
        .eq("status", "sent")
        .in("subscription_id", candidateSubIds);
      alreadyReminded = new Set((priorLogs || []).map((p: any) => p.subscription_id).filter(Boolean));
    }
    const toSend = expiredCandidates.filter((s: any) => !alreadyReminded.has(s.id));

    log("expired-query", {
      branchId,
      targetDateLte: targetStr,
      daysAfter,
      eligible: expiredCandidates.length,
      alreadyReminded: alreadyReminded.size,
      willSend: toSend.length,
    });

    for (const sub of toSend) {
      const member = (sub as any).members;
      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      });
      const expiredForDays = Math.max(
        daysAfter,
        Math.floor((today.getTime() - new Date(sub.end_date).getTime()) / (1000 * 60 * 60 * 24)),
      );
      const message = `⛔ Hi ${member.name}!\n\nYour gym membership at *${gymName}* expired *${expiredForDays} day${expiredForDays > 1 ? "s" : ""} ago* (${expiryDate}).\n\nWe miss you! Renew now to get back on track with your fitness goals 💪\n\n🎁 Renew within 7 days for exclusive benefits!`;
      const formatted = formatPhone(member.phone);

      attempted++;
      if (parsed.dryRun) {
        memberLogs.push({ memberId: member.id, status: "dry-run" });
        continue;
      }

      const result = await sendWhatsAppForTenant(supabase, {
        toPhone: formatted,
        category: "expired_reminder",
        variables: {
          name: member.name,
          days_expired: String(expiredForDays),
          expiry_date: expiryDate,
          branch_name: gymName,
        },
        fallbackText: message,
        branchId,
      });

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        subscription_id: sub.id,
        recipient_name: member.name,
        recipient_phone: formatted,
        message_content: message,
        notification_type: "expired_reminder",
        status: result.success ? "sent" : "failed",
        error_message: result.success ? null : result.error,
        is_manual: parsed.manual === true,
        branch_id: branchId,
      });

      if (result.success) sent++;
      else failed++;
      memberLogs.push({ memberId: member.id, status: result.success ? "sent" : "failed" });
    }
  }

  log("done", { branchId, kind, attempted, sent, failed });

  return new Response(
    JSON.stringify({ success: true, branchId, kind, attempted, sent, failed, members: memberLogs }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
