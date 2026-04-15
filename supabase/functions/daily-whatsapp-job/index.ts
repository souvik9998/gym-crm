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

    // Check if manual trigger or scheduled
    let isManualTrigger = false;
    try {
      const body = await req.json();
      isManualTrigger = body?.manual === true;
    } catch {
      // No body = scheduled run
    }

    // Fetch all branch WhatsApp settings
    const { data: branchSettings } = await supabase
      .from("gym_settings")
      .select("branch_id, whatsapp_enabled, whatsapp_auto_send");

    const branchWhatsAppMap = new Map<string, boolean>();
    const branchAutoSendMap = new Map<string, Record<string, any>>();
    if (branchSettings) {
      branchSettings.forEach((setting: any) => {
        if (setting.branch_id) {
          branchWhatsAppMap.set(setting.branch_id, setting.whatsapp_enabled === true);
          if (setting.whatsapp_auto_send) {
            branchAutoSendMap.set(setting.branch_id, setting.whatsapp_auto_send);
          }
        }
      });
    }

    const isWhatsAppEnabledForBranch = (branchId: string | null): boolean => {
      if (!branchId) return false;
      return branchWhatsAppMap.get(branchId) ?? false;
    };

    const isAutoSendEnabled = (branchId: string | null, type: string): boolean => {
      if (!branchId) return true;
      const prefs = branchAutoSendMap.get(branchId);
      if (!prefs) return true;
      return prefs[type] ?? true;
    };

    const getExpiringDaysBefore = (branchId: string | null): number => {
      if (!branchId) return 2;
      const prefs = branchAutoSendMap.get(branchId);
      return prefs?.expiring_days_before ?? 2;
    };

    const getExpiredDaysAfter = (branchId: string | null): number => {
      if (!branchId) return 7;
      const prefs = branchAutoSendMap.get(branchId);
      return prefs?.expired_days_after ?? 7;
    };

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

    // Format phone number for Periskope
    const formatPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/\D/g, "");
      if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
      if (cleaned.length === 10) cleaned = "91" + cleaned;
      return cleaned;
    };

    // Send message with retry (1 retry on failure)
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
            body: JSON.stringify({
              chat_id: `${chatId}@c.us`,
              message: message,
            }),
          });

          const responseText = await response.text();
          console.log(`Periskope response for ${chatId}: ${response.status} - ${responseText}`);
          return response.ok;
        } catch (error) {
          console.error(`Error sending message to ${chatId}:`, error);
          return false;
        }
      };

      // First attempt
      let success = await attempt();
      
      // Retry once on failure
      if (!success) {
        console.log(`Retrying message to ${chatId}...`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
        success = await attempt();
        if (!success) {
          console.error(`FAILED after retry: ${chatId}`);
        }
      }
      
      return success;
    };

    // Collect all unique expiring day values
    const allExpiringDays = new Set<number>();
    const allExpiredDays = new Set<number>();

    if (branchSettings) {
      branchSettings.forEach((setting: any) => {
        if (setting.branch_id && setting.whatsapp_enabled) {
          const prefs = setting.whatsapp_auto_send || {};
          if (prefs.expiring_2days !== false) {
            allExpiringDays.add(prefs.expiring_days_before ?? 2);
          }
          if (prefs.expired_reminder === true) {
            allExpiredDays.add(prefs.expired_days_after ?? 7);
          }
        }
      });
    }
    if (allExpiringDays.size === 0) allExpiringDays.add(2);

    // Fetch subscriptions for all relevant expiring dates
    const expiringSubscriptions: any[] = [];
    for (const days of allExpiringDays) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + days);
      const targetStr = targetDate.toISOString().split("T")[0];

      const { data } = await supabase
        .from("subscriptions")
        .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
        .eq("end_date", targetStr)
        .neq("status", "expired");

      if (data) expiringSubscriptions.push(...data);
    }

    // Fetch members expiring today
    const { data: expiringToday } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("end_date", todayStr)
      .neq("status", "expired");

    // Fetch expired members
    const maxExpiredDays = allExpiredDays.size > 0 ? Math.max(...allExpiredDays) : 7;
    const expiredDateLimit = new Date(today);
    expiredDateLimit.setDate(expiredDateLimit.getDate() - maxExpiredDays);
    const expiredDateStr = expiredDateLimit.toISOString().split("T")[0];

    const { data: expiredMembers } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("status", "expired")
      .gte("end_date", expiredDateStr)
      .lt("end_date", todayStr);

    const sentMemberIds: string[] = [];
    let successCount = 0;
    let failCount = 0;
    const logs: { memberId: string; type: string; status: string; error?: string }[] = [];

    // Helper to process a notification
    const processNotification = async (
      member: any,
      branchId: string,
      notificationType: string,
      message: string
    ) => {
      const formattedPhone = formatPhone(member.phone);
      const success = await sendMessageWithRetry(formattedPhone, message);

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: notificationType,
        status: success ? "sent" : "failed",
        branch_id: branchId,
      });

      logs.push({
        memberId: member.id,
        type: notificationType,
        status: success ? "sent" : "failed",
      });

      if (success) {
        successCount++;
        sentMemberIds.push(member.id);
        const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: branchId });
        if (tenantId) {
          await supabase.rpc("increment_whatsapp_usage", { _tenant_id: tenantId });
        }
      } else {
        failCount++;
      }
    };

    // Send notifications to members expiring soon
    for (const sub of expiringSubscriptions || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;

      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expiring_2days")) continue;

      const branchDaysBefore = getExpiringDaysBefore(branchId);
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry !== branchDaysBefore) continue;

      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      });

      const message = `⚠️ Hi ${member.name}!\n\nYour gym membership expires in *${branchDaysBefore} day${branchDaysBefore > 1 ? "s" : ""}* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;
      await processNotification(member, branchId, "expiring_2days", message);
    }

    // Send notifications to members expiring today
    for (const sub of expiringToday || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;

      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expiring_today")) continue;

      const message = `🚨 Hi ${member.name}!\n\nYour gym membership expires *TODAY*!\n\nPlease renew immediately to continue your fitness journey. 💪`;
      await processNotification(member, branchId, "expiring_today", message);
    }

    // Send expired reminders
    for (const sub of expiredMembers || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;

      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expired_reminder")) continue;

      const branchDaysAfter = getExpiredDaysAfter(branchId);
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const daysSinceExpiry = Math.ceil((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceExpiry !== branchDaysAfter) continue;

      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      });

      const message = `⛔ Hi ${member.name}!\n\nYour gym membership expired *${branchDaysAfter} day${branchDaysAfter > 1 ? "s" : ""} ago* (${expiryDate}).\n\nWe miss you! Renew now to get back on track with your fitness goals 💪\n\n🎁 Renew within 7 days for exclusive benefits!`;
      await processNotification(member, branchId, "expired_reminder", message);
    }

    // Send admin daily summary
    if (ADMIN_WHATSAPP_NUMBER) {
      const adminPhone = formatPhone(ADMIN_WHATSAPP_NUMBER);

      let summaryMessage = `📊 *Daily Gym Summary*\n\n`;

      summaryMessage += `⚠️ *Expiring Soon (${expiringSubscriptions?.length || 0}):*\n`;
      if (expiringSubscriptions && expiringSubscriptions.length > 0) {
        expiringSubscriptions.slice(0, 10).forEach((s) => {
          const m = s.members as any;
          summaryMessage += `• ${m.name} (${m.phone})\n`;
        });
        if (expiringSubscriptions.length > 10) {
          summaryMessage += `_...and ${expiringSubscriptions.length - 10} more_\n`;
        }
      } else {
        summaryMessage += `_None_\n`;
      }

      summaryMessage += `\n🔴 *Expiring Today (${expiringToday?.length || 0}):*\n`;
      if (expiringToday && expiringToday.length > 0) {
        expiringToday.forEach((s) => {
          const m = s.members as any;
          summaryMessage += `• ${m.name} (${m.phone})\n`;
        });
      } else {
        summaryMessage += `_None_\n`;
      }

      summaryMessage += `\n❌ *Recently Expired (${expiredMembers?.length || 0}):*\n`;
      if (expiredMembers && expiredMembers.length > 0) {
        const uniqueExpired = new Map<string, { name: string; end_date: string }>();
        expiredMembers.forEach((s) => {
          const m = s.members as any;
          if (!uniqueExpired.has(m.id)) {
            uniqueExpired.set(m.id, { name: m.name, end_date: s.end_date });
          }
        });

        Array.from(uniqueExpired.values()).slice(0, 10).forEach((m) => {
          const daysAgo = Math.floor(
            (today.getTime() - new Date(m.end_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          summaryMessage += `• ${m.name} (expired ${daysAgo} days ago)\n`;
        });
        if (uniqueExpired.size > 10) {
          summaryMessage += `_...and ${uniqueExpired.size - 10} more_\n`;
        }
      } else {
        summaryMessage += `_None_\n`;
      }

      summaryMessage += `\n✅ *Notifications Sent: ${successCount}*`;
      if (failCount > 0) {
        summaryMessage += `\n❌ *Failed: ${failCount}*`;
      }

      await sendMessageWithRetry(adminPhone, summaryMessage);
    }

    // Log the run
    console.log(`[daily-whatsapp-job] Completed: ${successCount} sent, ${failCount} failed, ${isManualTrigger ? 'MANUAL' : 'SCHEDULED'}`);
    console.log(`[daily-whatsapp-job] Details:`, JSON.stringify(logs));

    await supabase.from("admin_summary_log").insert({
      summary_type: "daily_periskope",
      member_ids: sentMemberIds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        manual: isManualTrigger,
        expiringSoon: expiringSubscriptions?.length || 0,
        expiringToday: expiringToday?.length || 0,
        expiredReminders: expiredMembers?.length || 0,
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
