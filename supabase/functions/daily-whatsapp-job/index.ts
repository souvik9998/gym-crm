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

    // Fetch all branch WhatsApp settings
    const { data: branchSettings } = await supabase
      .from("gym_settings")
      .select("branch_id, whatsapp_enabled");

    // Create a map of branch_id to whatsapp_enabled status
    const branchWhatsAppMap = new Map<string, boolean>();
    if (branchSettings) {
      branchSettings.forEach((setting) => {
        if (setting.branch_id) {
          branchWhatsAppMap.set(setting.branch_id, setting.whatsapp_enabled === true);
        }
      });
    }

    // Helper function to check if WhatsApp is enabled for a branch
    const isWhatsAppEnabledForBranch = (branchId: string | null): boolean => {
      if (!branchId) return false;
      return branchWhatsAppMap.get(branchId) ?? false;
    };

    // Get today's date and 2 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const todayStr = today.toISOString().split("T")[0];
    const twoDaysStr = twoDaysFromNow.toISOString().split("T")[0];

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

    // Fetch members expiring in 2 days (with branch_id)
    const { data: expiringIn2Days } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("end_date", twoDaysStr)
      .neq("status", "expired");

    // Fetch members expiring today (with branch_id)
    const { data: expiringToday } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("end_date", todayStr)
      .neq("status", "expired");

    // Fetch expired members (for admin summary - last 7 days) (with branch_id)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const { data: expiredMembers } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, branch_id, members!inner(id, name, phone, branch_id)")
      .eq("status", "expired")
      .gte("end_date", sevenDaysAgoStr)
      .lt("end_date", todayStr);

    const sentMemberIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    // Send notifications to members expiring in 2 days
    for (const sub of expiringIn2Days || []) {
      const member = sub.members as any;
      const branchId = sub.branch_id || member.branch_id;
      
      // Skip if WhatsApp is disabled for this branch
      if (!isWhatsAppEnabledForBranch(branchId)) {
        continue;
      }
      
      const formattedPhone = formatPhone(member.phone);
      const expiryDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const message = `⚠️ Hi ${member.name}!\n\nYour gym membership expires in *2 days* (${expiryDate}).\n\nRenew now to avoid any interruption! 🏃`;

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
      
      // Skip if WhatsApp is disabled for this branch
      if (!isWhatsAppEnabledForBranch(branchId)) {
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

    // Send admin daily summary
    if (ADMIN_WHATSAPP_NUMBER) {
      const adminPhone = formatPhone(ADMIN_WHATSAPP_NUMBER);

      let summaryMessage = `📊 *Daily Gym Summary*\n\n`;

      // Expiring in 2 days
      summaryMessage += `⚠️ *Expiring in 2 Days (${expiringIn2Days?.length || 0}):*\n`;
      if (expiringIn2Days && expiringIn2Days.length > 0) {
        expiringIn2Days.forEach((s) => {
          const m = s.members as any;
          summaryMessage += `• ${m.name} (${m.phone})\n`;
        });
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
        expiringIn2Days: expiringIn2Days?.length || 0,
        expiringToday: expiringToday?.length || 0,
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
