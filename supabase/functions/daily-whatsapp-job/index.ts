import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
    const ADMIN_WHATSAPP_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    try {
      const body = await req.json();
      isManualTrigger = body?.manual === true;
      manualBranchId = body?.branchId || null;
    } catch {
      // No body = scheduled run
    }

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

    // Check if already ran today (skip for manual triggers)
    if (!isManualTrigger) {
      const { data: existingLog } = await supabase
        .from("admin_summary_log")
        .select("id")
        .eq("summary_type", "daily_periskope")
        .gte("sent_at", startOfDay.toISOString())
        .lte("sent_at", endOfDay.toISOString())
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        console.log("Daily job already ran today, skipping");
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: "Daily job already ran today" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch branch WhatsApp settings
    let settingsQuery = supabase
      .from("gym_settings")
      .select("branch_id, whatsapp_enabled, whatsapp_auto_send, gym_name");

    // For manual trigger with branchId, only fetch that branch's settings
    if (manualBranchId) {
      settingsQuery = settingsQuery.eq("branch_id", manualBranchId);
    }

    const { data: branchSettings } = await settingsQuery;

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

    // If manual trigger with branchId but branch has WhatsApp disabled, return early
    if (manualBranchId) {
      const branchConfig = branchConfigMap.get(manualBranchId);
      if (!branchConfig || !branchConfig.enabled) {
        return new Response(
          JSON.stringify({ success: false, error: "WhatsApp is disabled for this branch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get list of branch IDs to process
    const branchIdsToProcess = Array.from(branchConfigMap.entries())
      .filter(([_, config]) => config.enabled)
      .map(([id]) => id);

    if (branchIdsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No branches with WhatsApp enabled", notificationsSent: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number for Periskope
    const formatPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/\D/g, "");
      if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
      if (cleaned.length === 10) cleaned = "91" + cleaned;
      return cleaned;
    };

    // Send message with retry
    const sendMessageWithRetry = async (chatId: string, message: string): Promise<boolean> => {
      const attempt = async (): Promise<boolean> => {
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
          console.log(`Periskope response for ${chatId}: ${response.status} - ${responseText}`);
          return response.ok;
        } catch (error) {
          console.error(`Error sending message to ${chatId}:`, error);
          return false;
        }
      };

      let success = await attempt();
      if (!success) {
        console.log(`Retrying message to ${chatId}...`);
        await new Promise(r => setTimeout(r, 2000));
        success = await attempt();
      }
      return success;
    };

    const sentMemberIds: string[] = [];
    let successCount = 0;
    let failCount = 0;
    const logs: { memberId: string; memberName: string; branchId: string; type: string; status: string }[] = [];

    // Track per-branch stats for admin summary
    const branchStats = new Map<string, {
      gymName: string;
      expiringSoon: any[];
      expiringToday: any[];
      expired: any[];
      sent: number;
      failed: number;
    }>();

    // Initialize stats for each branch
    for (const branchId of branchIdsToProcess) {
      const config = branchConfigMap.get(branchId)!;
      branchStats.set(branchId, {
        gymName: config.gymName,
        expiringSoon: [],
        expiringToday: [],
        expired: [],
        sent: 0,
        failed: 0,
      });
    }

    // Process each branch independently
    for (const branchId of branchIdsToProcess) {
      const config = branchConfigMap.get(branchId)!;
      const prefs = config.autoSend;
      const stats = branchStats.get(branchId)!;

      // --- EXPIRING SOON ---
      if (prefs.expiring_2days !== false) {
        const daysBefore = prefs.expiring_days_before ?? 2;
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetStr = targetDate.toISOString().split("T")[0];

        // Query subscriptions for THIS branch only, joining members to get branch-correct data
        const { data: expiringSubs } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("end_date", targetStr)
          .eq("members.branch_id", branchId)
          .in("status", ["active", "expiring_soon"]);

        if (expiringSubs && expiringSubs.length > 0) {
          stats.expiringSoon = expiringSubs;

          for (const sub of expiringSubs) {
            const member = sub.members as any;
            const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric",
            });
            const message = `⚠️ Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expires in *${daysBefore} day${daysBefore > 1 ? "s" : ""}* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;

            const formattedPhone = formatPhone(member.phone);
            const success = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              notification_type: "expiring_2days",
              status: success ? "sent" : "failed",
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expiring_soon", status: success ? "sent" : "failed" });

            if (success) {
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
      }

      // --- EXPIRING TODAY ---
      if (prefs.expiring_today !== false) {
        const { data: expiringTodaySubs } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("end_date", todayStr)
          .eq("members.branch_id", branchId)
          .in("status", ["active", "expiring_soon"]);

        if (expiringTodaySubs && expiringTodaySubs.length > 0) {
          stats.expiringToday = expiringTodaySubs;

          for (const sub of expiringTodaySubs) {
            const member = sub.members as any;
            const message = `🚨 Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expires *TODAY*!\n\nPlease renew immediately to continue your fitness journey. 💪`;

            const formattedPhone = formatPhone(member.phone);
            const success = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              notification_type: "expiring_today",
              status: success ? "sent" : "failed",
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expiring_today", status: success ? "sent" : "failed" });

            if (success) {
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
      }

      // --- EXPIRED REMINDER ---
      if (prefs.expired_reminder === true) {
        const daysAfter = prefs.expired_days_after ?? 7;
        const targetExpiredDate = new Date(today);
        targetExpiredDate.setDate(targetExpiredDate.getDate() - daysAfter);
        const targetExpiredStr = targetExpiredDate.toISOString().split("T")[0];

        const { data: expiredSubs } = await supabase
          .from("subscriptions")
          .select("id, member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
          .eq("end_date", targetExpiredStr)
          .eq("members.branch_id", branchId)
          .eq("status", "expired");

        if (expiredSubs && expiredSubs.length > 0) {
          stats.expired = expiredSubs;

          for (const sub of expiredSubs) {
            const member = sub.members as any;
            const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric",
            });
            const message = `⛔ Hi ${member.name}!\n\nYour gym membership at *${config.gymName}* expired *${daysAfter} day${daysAfter > 1 ? "s" : ""} ago* (${expiryDate}).\n\nWe miss you! Renew now to get back on track with your fitness goals 💪\n\n🎁 Renew within 7 days for exclusive benefits!`;

            const formattedPhone = formatPhone(member.phone);
            const success = await sendMessageWithRetry(formattedPhone, message);

            await supabase.from("whatsapp_notifications").insert({
              member_id: member.id,
              notification_type: "expired_reminder",
              status: success ? "sent" : "failed",
              branch_id: branchId,
            });

            logs.push({ memberId: member.id, memberName: member.name, branchId, type: "expired_reminder", status: success ? "sent" : "failed" });

            if (success) {
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
      }
    }

    // Send admin daily summary (only for scheduled runs, not manual)
    if (ADMIN_WHATSAPP_NUMBER && !isManualTrigger) {
      const adminPhone = formatPhone(ADMIN_WHATSAPP_NUMBER);

      // Build per-branch summary
      let summaryMessage = `📊 *Daily Expiry Summary*\n`;
      let totalExpiringSoon = 0;
      let totalExpiringToday = 0;
      let totalExpired = 0;

      for (const [branchId, stats] of branchStats) {
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

    // Log the run
    console.log(`[daily-whatsapp-job] Completed: ${successCount} sent, ${failCount} failed, ${isManualTrigger ? 'MANUAL' : 'SCHEDULED'}, branches: ${branchIdsToProcess.join(",")}`);
    console.log(`[daily-whatsapp-job] Details:`, JSON.stringify(logs));

    await supabase.from("admin_summary_log").insert({
      summary_type: "daily_periskope",
      member_ids: sentMemberIds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        manual: isManualTrigger,
        branchId: manualBranchId,
        branchesProcessed: branchIdsToProcess.length,
        expiringSoon: logs.filter(l => l.type === "expiring_soon").length,
        expiringToday: logs.filter(l => l.type === "expiring_today").length,
        expiredReminders: logs.filter(l => l.type === "expired_reminder").length,
        notificationsSent: successCount,
        failed: failCount,
        logs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[daily-whatsapp-job] ERROR:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
