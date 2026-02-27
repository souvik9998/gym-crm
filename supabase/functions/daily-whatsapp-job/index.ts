import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // Fetch all branch WhatsApp settings (including auto-send preferences)
    const { data: branchSettings } = await supabase
      .from("gym_settings")
      .select("branch_id, whatsapp_enabled, whatsapp_auto_send");

    // Create maps for branch settings
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

    // Helper function to check if WhatsApp is enabled for a branch
    const isWhatsAppEnabledForBranch = (branchId: string | null): boolean => {
      if (!branchId) return false;
      return branchWhatsAppMap.get(branchId) ?? false;
    };

    // Helper to check auto-send preference for a specific type
    const isAutoSendEnabled = (branchId: string | null, type: string): boolean => {
      if (!branchId) return true;
      const prefs = branchAutoSendMap.get(branchId);
      if (!prefs) return true;
      return prefs[type] ?? true;
    };

    // Helper to get configurable days for expiring/expired reminders
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

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if we already ran today
    const { data: existingLog } = await supabase
      .from("admin_summary_log")
      .select("id")
      .eq("summary_type", "daily_periskope")
      .gte("sent_at", startOfDay.toISOString())
      .lte("sent_at", endOfDay.toISOString())
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: "Daily job already ran today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number for Periskope
    const formatPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/\D/g, "");
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
      }
      if (cleaned.length === 10) {
        cleaned = "91" + cleaned;
      }
      return cleaned;
    };

    // Send message via Periskope
    const sendMessage = async (chatId: string, message: string): Promise<boolean> => {
      try {
        console.log(`Sending to ${chatId}`);
        
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
        console.log(`Periskope response: ${response.status} - ${responseText}`);

        return response.ok;
      } catch (error) {
        console.error("Error sending message:", error);
        return false;
      }
    };

    // Collect all unique expiring day values across branches to fetch relevant subscriptions
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
    // Default if no branches configured
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

    // Fetch expired members based on max expired_days_after across branches
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

    // Send notifications to members expiring soon (configurable days before)
    for (const sub of expiringSubscriptions || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;
      
      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expiring_2days")) {
        continue;
      }

      const branchDaysBefore = getExpiringDaysBefore(branchId);
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only send if this subscription matches the branch's configured days
      if (daysUntilExpiry !== branchDaysBefore) continue;
      
      const formattedPhone = formatPhone(member.phone);
      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const message = `⚠️ Hi ${member.name}!\n\nYour gym membership expires in *${branchDaysBefore} day${branchDaysBefore > 1 ? "s" : ""}* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;

      const success = await sendMessage(formattedPhone, message);

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: "expiring_2days",
        status: success ? "sent" : "failed",
        branch_id: branchId,
      });

      if (success) {
        successCount++;
        sentMemberIds.push(member.id);
      } else {
        failCount++;
      }
    }

    // Send notifications to members expiring today
    for (const sub of expiringToday || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;
      
      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expiring_today")) {
        continue;
      }
      
      const formattedPhone = formatPhone(member.phone);

      const message = `🚨 Hi ${member.name}!\n\nYour gym membership expires *TODAY*!\n\nPlease renew immediately to continue your fitness journey. 💪`;

      const success = await sendMessage(formattedPhone, message);

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: "expiring_today",
        status: success ? "sent" : "failed",
        branch_id: branchId,
      });

      if (success) {
        successCount++;
        sentMemberIds.push(member.id);
      } else {
        failCount++;
      }
    }

    // Send expired reminders (configurable days after expiry)
    for (const sub of expiredMembers || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;
      
      if (!isWhatsAppEnabledForBranch(branchId) || !isAutoSendEnabled(branchId, "expired_reminder")) {
        continue;
      }

      const branchDaysAfter = getExpiredDaysAfter(branchId);
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const daysSinceExpiry = Math.ceil((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only send on the exact configured day
      if (daysSinceExpiry !== branchDaysAfter) continue;

      const formattedPhone = formatPhone(member.phone);
      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const message = `⛔ Hi ${member.name}!\n\nYour gym membership expired *${branchDaysAfter} day${branchDaysAfter > 1 ? "s" : ""} ago* (${expiryDate}).\n\nWe miss you! Renew now to get back on track with your fitness goals 💪\n\n🎁 Renew within 7 days for exclusive benefits!`;

      const success = await sendMessage(formattedPhone, message);

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: "expired_reminder",
        status: success ? "sent" : "failed",
        branch_id: branchId,
      });

      if (success) {
        successCount++;
        sentMemberIds.push(member.id);
      } else {
        failCount++;
      }
    }

    // Send admin daily summary
    if (ADMIN_WHATSAPP_NUMBER) {
      const adminPhone = formatPhone(ADMIN_WHATSAPP_NUMBER);

      let summaryMessage = `📊 *Daily Gym Summary*\n\n`;

      // Expiring soon
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

      await sendMessage(adminPhone, summaryMessage);
    }

    // Log the daily summary
    await supabase.from("admin_summary_log").insert({
      summary_type: "daily_periskope",
      member_ids: sentMemberIds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        expiringSoon: expiringSubscriptions?.length || 0,
        expiringToday: expiringToday?.length || 0,
        expiredReminders: expiredMembers?.length || 0,
        notificationsSent: successCount,
        failed: failCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in daily-whatsapp-job:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
