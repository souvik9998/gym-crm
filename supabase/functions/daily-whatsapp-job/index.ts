import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Structured logger — every line is greppable in Supabase Edge Logs
const log = (event: string, data: Record<string, unknown> = {}) => {
  console.log(`[daily-whatsapp-job] ${event}`, JSON.stringify(data));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const triggeredAt = new Date().toISOString();
  log("triggered", { at: triggeredAt, method: req.method });

  try {
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
    const ADMIN_WHATSAPP_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    log("env-check", {
      hasPeriskopeKey: !!PERISKOPE_API_KEY,
      hasPeriskopePhone: !!PERISKOPE_PHONE,
      hasAdminWhatsApp: !!ADMIN_WHATSAPP_NUMBER,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    });

    if (!PERISKOPE_API_KEY || !PERISKOPE_PHONE) {
      throw new Error("Periskope API credentials not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    let isManualTrigger = false;
    let manualBranchId: string | null = null;
    let testMode = false;
    let testPhone: string | null = null;
    try {
      const body = await req.json();
      isManualTrigger = body?.manual === true;
      manualBranchId = body?.branchId || null;
      testMode = body?.test_mode === true;
      testPhone = body?.test_phone || null;
    } catch {
      // No body = scheduled run
    }

    log("body-parsed", { isManualTrigger, manualBranchId, testMode, testPhone });

    // ---------- TEST MODE: send a single WhatsApp message unconditionally ----------
    if (testMode) {
      const targetPhone = testPhone || ADMIN_WHATSAPP_NUMBER;
      if (!targetPhone) {
        return new Response(
          JSON.stringify({ success: false, error: "No test_phone provided and ADMIN_WHATSAPP_NUMBER not set" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const formatPhone = (phoneNum: string): string => {
        let cleaned = phoneNum.replace(/\D/g, "");
        if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
        if (cleaned.length === 10) cleaned = "91" + cleaned;
        return cleaned;
      };

      const formatted = formatPhone(targetPhone);
      const msg = `🧪 *GymKloud Test Message*\n\nThis is a test from the daily automation cron.\nTime: ${new Date().toISOString()}\n\nIf you received this, the WhatsApp pipeline is working ✅`;

      log("test-mode-sending", { targetPhone: formatted });

      try {
        const response = await fetch("https://api.periskope.app/v1/message/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
            "x-phone": PERISKOPE_PHONE,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: `${formatted}@c.us`, message: msg }),
        });

        const responseText = await response.text();
        log("test-mode-result", { status: response.status, ok: response.ok, body: responseText });

        return new Response(
          JSON.stringify({
            success: response.ok,
            test_mode: true,
            target_phone: formatted,
            periskope_status: response.status,
            periskope_response: responseText,
          }),
          { status: response.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err: any) {
        log("test-mode-error", { error: err?.message || String(err) });
        return new Response(
          JSON.stringify({ success: false, test_mode: true, error: err?.message || String(err) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ---------- NORMAL FLOW ----------

    // IST timezone date handling
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const today = new Date(istNow);
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    log("date-context", {
      utcNow: now.toISOString(),
      istNow: istNow.toISOString(),
      todayStrIST: todayStr,
      startOfDayUTC: startOfDay.toISOString(),
      endOfDayUTC: endOfDay.toISOString(),
    });

    // Check if already ran today (skip for manual triggers)
    if (!isManualTrigger) {
      const { data: existingLog } = await supabase
        .from("admin_summary_log")
        .select("id, sent_at")
        .eq("summary_type", "daily_periskope")
        .gte("sent_at", startOfDay.toISOString())
        .lte("sent_at", endOfDay.toISOString())
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        log("idempotency-skip", { existingLogId: existingLog[0].id, sentAt: existingLog[0].sent_at });
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "Daily job already ran today" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Fetch branch WhatsApp settings
    let settingsQuery = supabase
      .from("gym_settings")
      .select("branch_id, whatsapp_enabled, whatsapp_auto_send, gym_name");

    if (manualBranchId) {
      settingsQuery = settingsQuery.eq("branch_id", manualBranchId);
    }

    const { data: branchSettings, error: settingsError } = await settingsQuery;

    if (settingsError) {
      log("settings-fetch-error", { error: settingsError.message });
      throw new Error(`Failed to fetch gym settings: ${settingsError.message}`);
    }

    log("settings-fetched", {
      totalRows: branchSettings?.length || 0,
      branches: (branchSettings || []).map((s: any) => ({
        branch_id: s.branch_id,
        gym_name: s.gym_name,
        whatsapp_enabled: s.whatsapp_enabled,
        expiring_soon_enabled: s.whatsapp_auto_send?.expiring_2days !== false,
        expiring_soon_days_before: s.whatsapp_auto_send?.expiring_days_before ?? 2,
        expiring_today_enabled: s.whatsapp_auto_send?.expiring_today !== false,
        expired_enabled: s.whatsapp_auto_send?.expired_reminder === true,
        expired_days_after: s.whatsapp_auto_send?.expired_days_after ?? 7,
      })),
    });

    // Build per-branch config maps
    const branchConfigMap = new Map<string, {
      enabled: boolean;
      autoSend: Record<string, any>;
      gymName: string;
    }>();

    if (branchSettings) {
      branchSettings.forEach((setting: any) => {
        if (setting.branch_id) {
          branchConfigMap.set(setting.branch_id, {
            enabled: setting.whatsapp_enabled === true,
            autoSend: setting.whatsapp_auto_send || {},
            gymName: setting.gym_name || "Gym",
          });
        }
      });
    }

    if (manualBranchId) {
      const branchConfig = branchConfigMap.get(manualBranchId);
      if (!branchConfig || !branchConfig.enabled) {
        log("manual-branch-disabled", { manualBranchId });
        return new Response(
          JSON.stringify({ success: false, error: "WhatsApp is disabled for this branch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const branchIdsToProcess = Array.from(branchConfigMap.entries())
      .filter(([_, config]) => config.enabled)
      .map(([id]) => id);

    log("branches-to-process", { count: branchIdsToProcess.length, ids: branchIdsToProcess });

    if (branchIdsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No branches with WhatsApp enabled", notificationsSent: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const formatPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/\D/g, "");
      if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
      if (cleaned.length === 10) cleaned = "91" + cleaned;
      return cleaned;
    };

    const sendMessageWithRetry = async (chatId: string, message: string): Promise<{ ok: boolean; status: number; body: string }> => {
      const attempt = async (): Promise<{ ok: boolean; status: number; body: string }> => {
        try {
          const response = await fetch("https://api.periskope.app/v1/message/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
              "x-phone": PERISKOPE_PHONE!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ chat_id: `${chatId}@c.us`, message }),
          });
          const responseText = await response.text();
          return { ok: response.ok, status: response.status, body: responseText };
        } catch (error: any) {
          return { ok: false, status: 0, body: error?.message || String(error) };
        }
      };

      let result = await attempt();
      if (!result.ok) {
        log("periskope-retry", { chatId, firstStatus: result.status, firstBody: result.body });
        await new Promise((r) => setTimeout(r, 2000));
        result = await attempt();
      }
      log("periskope-result", { chatId, status: result.status, ok: result.ok, body: result.body.slice(0, 300) });
      return result;
    };

    const sentMemberIds: string[] = [];
    let successCount = 0;
    let failCount = 0;
    let attemptedCount = 0;
    const logs: { memberId: string; memberName: string; branchId: string; type: string; status: string; periskopeStatus?: number }[] = [];

    const branchStats = new Map<string, {
      gymName: string;
      expiringSoon: any[];
      expiringToday: any[];
      expired: any[];
      sent: number;
      failed: number;
      attempted: number;
    }>();

    for (const branchId of branchIdsToProcess) {
      const config = branchConfigMap.get(branchId)!;
      branchStats.set(branchId, {
        gymName: config.gymName,
        expiringSoon: [],
        expiringToday: [],
        expired: [],
        sent: 0,
        failed: 0,
        attempted: 0,
      });
    }

    // Process each branch independently
    for (const branchId of branchIdsToProcess) {
      const config = branchConfigMap.get(branchId)!;
      const prefs = config.autoSend;
      const stats = branchStats.get(branchId)!;

      log("branch-start", {
        branchId,
        gymName: config.gymName,
        prefs: {
          expiring_2days: prefs.expiring_2days,
          expiring_days_before: prefs.expiring_days_before,
          expiring_today: prefs.expiring_today,
          expired_reminder: prefs.expired_reminder,
          expired_days_after: prefs.expired_days_after,
        },
      });

      // --- EXPIRING SOON --- (sent ONCE per subscription cycle)
      if (prefs.expiring_2days !== false) {
        const daysBefore = prefs.expiring_days_before ?? 2;
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetStr = targetDate.toISOString().split("T")[0];

        const { data: expiringSubsRaw, error: expSoonErr } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("end_date", targetStr)
          .eq("members.branch_id", branchId)
          .in("status", ["active", "expiring_soon"]);

        // Dedup: skip subscriptions that already received an expiring_2days reminder
        const candidateSubIds = (expiringSubsRaw || []).map((s: any) => s.id).filter(Boolean);
        let alreadySoonSubIds = new Set<string>();
        if (candidateSubIds.length > 0) {
          const { data: priorLogs } = await supabase
            .from("whatsapp_notifications")
            .select("subscription_id")
            .eq("branch_id", branchId)
            .eq("notification_type", "expiring_2days")
            .eq("status", "sent")
            .in("subscription_id", candidateSubIds);
          alreadySoonSubIds = new Set((priorLogs || []).map((p: any) => p.subscription_id).filter(Boolean));
        }

        const expiringSubs = (expiringSubsRaw || []).filter((s: any) => !alreadySoonSubIds.has(s.id));

        log("expiring-soon-query", {
          branchId,
          targetDate: targetStr,
          daysBefore,
          matchedRaw: expiringSubsRaw?.length || 0,
          alreadyReminded: alreadySoonSubIds.size,
          willSend: expiringSubs.length,
          error: expSoonErr?.message,
        });

        if (expiringSubs.length > 0) {
          stats.expiringSoon = expiringSubs;

          for (const sub of expiringSubs) {
            const member = sub.members as any;
            const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric",
            });
            const message = `⚠️ Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expires in *${daysBefore} day${daysBefore > 1 ? "s" : ""}* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;

            const formattedPhone = formatPhone(member.phone);
            attemptedCount++;
            stats.attempted++;
            const result = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              subscription_id: sub.id,
              recipient_name: member.name,
              recipient_phone: formattedPhone,
              message_content: message,
              notification_type: "expiring_2days",
              status: result.ok ? "sent" : "failed",
              error_message: result.ok ? null : result.body,
              is_manual: isManualTrigger,
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expiring_soon", status: result.ok ? "sent" : "failed", periskopeStatus: result.status });

            if (result.ok) {
              successCount++;
              stats.sent++;
              sentMemberIds.push(member.id);
              const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: branchId });
              if (tenantId) await supabase.rpc("increment_whatsapp_usage", { _tenant_id: tenantId });
            } else {
              failCount++;
              stats.failed++;
            }
          }
        }
      } else {
        log("expiring-soon-disabled", { branchId });
      }

      // --- EXPIRING TODAY ---
      if (prefs.expiring_today !== false) {
        const { data: expiringTodaySubs, error: expTodayErr } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("end_date", todayStr)
          .eq("members.branch_id", branchId)
          .in("status", ["active", "expiring_soon"]);

        log("expiring-today-query", {
          branchId,
          targetDate: todayStr,
          matched: expiringTodaySubs?.length || 0,
          error: expTodayErr?.message,
        });

        if (expiringTodaySubs && expiringTodaySubs.length > 0) {
          stats.expiringToday = expiringTodaySubs;

          for (const sub of expiringTodaySubs) {
            const member = sub.members as any;
            const message = `🚨 Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expires *TODAY*!\n\nPlease renew immediately to continue your fitness journey. 💪`;

            const formattedPhone = formatPhone(member.phone);
            attemptedCount++;
            stats.attempted++;
            const result = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              notification_type: "expiring_today",
              status: result.ok ? "sent" : "failed",
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expiring_today", status: result.ok ? "sent" : "failed", periskopeStatus: result.status });

            if (result.ok) {
              successCount++;
              stats.sent++;
              sentMemberIds.push(member.id);
              const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: branchId });
              if (tenantId) await supabase.rpc("increment_whatsapp_usage", { _tenant_id: tenantId });
            } else {
              failCount++;
              stats.failed++;
            }
          }
        }
      } else {
        log("expiring-today-disabled", { branchId });
      }

      // --- EXPIRED REMINDER ---
      if (prefs.expired_reminder === true) {
        const daysAfter = prefs.expired_days_after ?? 7;
        const targetExpiredDate = new Date(today);
        targetExpiredDate.setDate(targetExpiredDate.getDate() - daysAfter);
        const targetExpiredStr = targetExpiredDate.toISOString().split("T")[0];

        const { data: branchSubscriptions, error: expErr } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, status, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("members.branch_id", branchId)
          .order("end_date", { ascending: false });

        const latestSubscriptionByMember = new Map<string, any>();
        for (const subscription of branchSubscriptions || []) {
          const member = subscription.members as any;
          if (!member?.id || latestSubscriptionByMember.has(member.id)) continue;
          latestSubscriptionByMember.set(member.id, subscription);
        }

        const expiredCandidates = Array.from(latestSubscriptionByMember.values()).filter((subscription: any) => {
          return subscription.status === "expired" && subscription.end_date <= targetExpiredStr;
        });

        const candidateMemberIds = expiredCandidates.map((subscription: any) => subscription.member_id).filter(Boolean);
        let alreadyRemindedMemberIds = new Set<string>();

        // Dedup PER SUBSCRIPTION (not per member) — so renewed-then-expired members can be reminded again for the new cycle
        const candidateSubIds = expiredCandidates.map((s: any) => s.id).filter(Boolean);
        let alreadyRemindedSubIds = new Set<string>();

        if (candidateSubIds.length > 0) {
          const { data: sentReminderLogs, error: sentLogErr } = await supabase
            .from("whatsapp_notifications")
            .select("subscription_id")
            .eq("branch_id", branchId)
            .eq("notification_type", "expired_reminder")
            .eq("status", "sent")
            .in("subscription_id", candidateSubIds);

          if (sentLogErr) {
            log("expired-reminder-log-fetch-error", { branchId, error: sentLogErr.message });
          } else {
            alreadyRemindedSubIds = new Set(
              (sentReminderLogs || [])
                .map((entry: any) => entry.subscription_id)
                .filter(Boolean),
            );
          }
        }

        const expiredSubs = expiredCandidates.filter(
          (subscription: any) => !alreadyRemindedSubIds.has(subscription.id),
        );

        log("expired-query", {
          branchId,
          targetDateLte: targetExpiredStr,
          daysAfter,
          totalSubscriptionsFetched: branchSubscriptions?.length || 0,
          latestExpiredEligible: expiredCandidates.length,
          alreadyReminded: alreadyRemindedMemberIds.size,
          matched: expiredSubs.length,
          error: expErr?.message,
        });

        if (expiredSubs.length > 0) {
          stats.expired = expiredSubs;

          for (const sub of expiredSubs) {
            const member = sub.members as any;
            const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric",
            });
            const expiredForDays = Math.max(
              daysAfter,
              Math.floor((today.getTime() - new Date(sub.end_date).getTime()) / (1000 * 60 * 60 * 24)),
            );
            const message = `⛔ Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expired *${expiredForDays} day${expiredForDays > 1 ? "s" : ""} ago* (${expiryDate}).\n\nWe miss you! Renew now to get back on track with your fitness goals 💪\n\n🎁 Renew within 7 days for exclusive benefits!`;

            const formattedPhone = formatPhone(member.phone);
            attemptedCount++;
            stats.attempted++;
            const result = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              subscription_id: sub.id,
              recipient_name: member.name,
              recipient_phone: formattedPhone,
              message_content: message,
              notification_type: "expired_reminder",
              status: result.ok ? "sent" : "failed",
              error_message: result.ok ? null : result.body,
              is_manual: isManualTrigger,
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expired_reminder", status: result.ok ? "sent" : "failed", periskopeStatus: result.status });

            if (result.ok) {
              successCount++;
              stats.sent++;
              sentMemberIds.push(member.id);
              const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: branchId });
              if (tenantId) await supabase.rpc("increment_whatsapp_usage", { _tenant_id: tenantId });
            } else {
              failCount++;
              stats.failed++;
            }
          }
        }
      } else {
        log("expired-disabled", { branchId });
      }

      log("branch-done", {
        branchId,
        attempted: stats.attempted,
        sent: stats.sent,
        failed: stats.failed,
        expiringSoonCount: stats.expiringSoon.length,
        expiringTodayCount: stats.expiringToday.length,
        expiredCount: stats.expired.length,
      });
    }

    // Send admin daily summary (only for scheduled runs, not manual)
    if (ADMIN_WHATSAPP_NUMBER && !isManualTrigger) {
      const adminPhone = formatPhone(ADMIN_WHATSAPP_NUMBER);

      let summaryMessage = `📊 *Daily Expiry Summary*\n`;
      let totalExpiringSoon = 0;
      let totalExpiringToday = 0;
      let totalExpired = 0;

      for (const [, stats] of branchStats) {
        const hasData = stats.expiringSoon.length > 0 || stats.expiringToday.length > 0 || stats.expired.length > 0;
        if (!hasData) continue;

        summaryMessage += `\n🏢 *${stats.gymName}*\n`;

        if (stats.expiringSoon.length > 0) {
          totalExpiringSoon += stats.expiringSoon.length;
          summaryMessage += `⚠️ Expiring Soon (${stats.expiringSoon.length}):\n`;
          stats.expiringSoon.slice(0, 5).forEach((s: any) => {
            const m = s.members as any;
            summaryMessage += `• ${m.name} (${m.phone})\n`;
          });
          if (stats.expiringSoon.length > 5) summaryMessage += `_...and ${stats.expiringSoon.length - 5} more_\n`;
        }

        if (stats.expiringToday.length > 0) {
          totalExpiringToday += stats.expiringToday.length;
          summaryMessage += `🔴 Expiring Today (${stats.expiringToday.length}):\n`;
          stats.expiringToday.slice(0, 5).forEach((s: any) => {
            const m = s.members as any;
            summaryMessage += `• ${m.name} (${m.phone})\n`;
          });
          if (stats.expiringToday.length > 5) summaryMessage += `_...and ${stats.expiringToday.length - 5} more_\n`;
        }

        if (stats.expired.length > 0) {
          totalExpired += stats.expired.length;
          summaryMessage += `❌ Expired (${stats.expired.length}):\n`;
          stats.expired.slice(0, 5).forEach((s: any) => {
            const m = s.members as any;
            summaryMessage += `• ${m.name} (${m.phone})\n`;
          });
          if (stats.expired.length > 5) summaryMessage += `_...and ${stats.expired.length - 5} more_\n`;
        }
      }

      if (totalExpiringSoon === 0 && totalExpiringToday === 0 && totalExpired === 0) {
        summaryMessage += `\n_No expiry notifications today._\n`;
      }

      summaryMessage += `\n✅ *Notifications Sent: ${successCount}*`;
      if (failCount > 0) summaryMessage += `\n❌ *Failed: ${failCount}*`;

      await sendMessageWithRetry(adminPhone, summaryMessage);
    }

    log("completed", {
      attempted: attemptedCount,
      sent: successCount,
      failed: failCount,
      isManualTrigger,
      branches: branchIdsToProcess.length,
    });

    await supabase.from("admin_summary_log").insert({
      summary_type: "daily_periskope",
      member_ids: sentMemberIds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        triggeredAt,
        finishedAt: new Date().toISOString(),
        manual: isManualTrigger,
        branchId: manualBranchId,
        branchesProcessed: branchIdsToProcess.length,
        attempted: attemptedCount,
        expiringSoon: logs.filter((l) => l.type === "expiring_soon").length,
        expiringToday: logs.filter((l) => l.type === "expiring_today").length,
        expiredReminders: logs.filter((l) => l.type === "expired_reminder").length,
        notificationsSent: successCount,
        failed: failCount,
        logs,
        branchStats: Array.from(branchStats.entries()).map(([branchId, s]) => ({
          branchId,
          gymName: s.gymName,
          attempted: s.attempted,
          sent: s.sent,
          failed: s.failed,
          expiringSoonCount: s.expiringSoon.length,
          expiringTodayCount: s.expiringToday.length,
          expiredCount: s.expired.length,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    log("ERROR", { message: error?.message, stack: error?.stack });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
