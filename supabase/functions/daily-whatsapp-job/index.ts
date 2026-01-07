import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WATI_API_KEY = Deno.env.get("WATI_API_KEY");
    const WATI_ENDPOINT = Deno.env.get("WATI_ENDPOINT");
    const ADMIN_WHATSAPP_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!WATI_API_KEY || !WATI_ENDPOINT) {
      throw new Error("WATI credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

    // Check if daily job already ran today (idempotency)
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: existingRun } = await supabase
      .from("admin_summary_log")
      .select("id")
      .eq("summary_type", "daily_expiring")
      .gte("sent_at", startOfDay.toISOString())
      .lte("sent_at", endOfDay.toISOString())
      .limit(1);

    if (existingRun && existingRun.length > 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Daily job already ran today", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh subscription statuses first
    await supabase.rpc("refresh_subscription_statuses");

    const results = {
      expiring7Days: { sent: 0, failed: 0 },
      expiringToday: { sent: 0, failed: 0 },
      adminSummary: { sent: false, error: null as string | null },
    };

    // 1. Get members expiring in 7 days
    const { data: expiring7DaysData } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, members!inner(id, name, phone)")
      .eq("end_date", sevenDaysStr)
      .not("status", "eq", "expired");

    // 2. Get members expiring today
    const { data: expiringTodayData } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, members!inner(id, name, phone)")
      .eq("end_date", todayStr)
      .not("status", "eq", "expired");

    // Get already notified members today
    const { data: todayNotifications } = await supabase
      .from("whatsapp_notifications")
      .select("member_id, notification_type")
      .gte("sent_at", startOfDay.toISOString())
      .lte("sent_at", endOfDay.toISOString());

    const notifiedToday = {
      expiring_7days: new Set(todayNotifications?.filter(n => n.notification_type === "expiring_7days").map(n => n.member_id) || []),
      expiring_today: new Set(todayNotifications?.filter(n => n.notification_type === "expiring_today").map(n => n.member_id) || []),
    };

    // Helper function to send WhatsApp message
    const sendWhatsApp = async (phone: string, message: string): Promise<boolean> => {
      let formattedPhone = phone.replace(/\D/g, "");
      if (formattedPhone.startsWith("91") && formattedPhone.length === 12) {
        formattedPhone = formattedPhone.substring(2);
      }
      if (formattedPhone.length !== 10) {
        throw new Error("Invalid phone number");
      }

      const response = await fetch(`${WATI_ENDPOINT}/api/v1/sendSessionMessage/91${formattedPhone}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WATI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageText: message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WATI API error: ${errorText}`);
      }
      return true;
    };

    // Send 7-day expiring notifications
    for (const sub of expiring7DaysData || []) {
      const member = sub.members as any;
      if (notifiedToday.expiring_7days.has(member.id)) continue;

      try {
        const endDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const message = `Hi ${member.name}! 🏋️\n\nYour Pro Plus Fitness membership is expiring on ${endDate} (in 7 days).\n\nRenew now to continue your fitness journey without interruption!\n\nVisit us or renew online today.`;
        
        await sendWhatsApp(member.phone, message);
        
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: "expiring_7days",
          status: "sent",
        });
        results.expiring7Days.sent++;
      } catch (error: any) {
        console.error(`Failed to send to ${member.name}:`, error);
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: "expiring_7days",
          status: "failed",
          error_message: error.message,
        });
        results.expiring7Days.failed++;
      }
    }

    // Send expiring today notifications
    for (const sub of expiringTodayData || []) {
      const member = sub.members as any;
      if (notifiedToday.expiring_today.has(member.id)) continue;

      try {
        const endDate = new Date(sub.end_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const message = `Hi ${member.name}! ⚠️\n\nYour Pro Plus Fitness membership expires TODAY (${endDate})!\n\nDon't miss a single workout - renew now to keep your membership active.\n\nWe're here to help you stay fit!`;
        
        await sendWhatsApp(member.phone, message);
        
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: "expiring_today",
          status: "sent",
        });
        results.expiringToday.sent++;
      } catch (error: any) {
        console.error(`Failed to send to ${member.name}:`, error);
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: "expiring_today",
          status: "failed",
          error_message: error.message,
        });
        results.expiringToday.failed++;
      }
    }

    // 3. Send admin summary
    if (ADMIN_WHATSAPP_NUMBER) {
      try {
        // Get expired members (check every 2 days to avoid duplicates)
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        const { data: lastExpiredSummary } = await supabase
          .from("admin_summary_log")
          .select("sent_at")
          .eq("summary_type", "expired_members")
          .order("sent_at", { ascending: false })
          .limit(1);

        const shouldSendExpiredSummary = !lastExpiredSummary || 
          lastExpiredSummary.length === 0 || 
          new Date(lastExpiredSummary[0].sent_at) < twoDaysAgo;

        // Collect expiring today names
        const expiringTodayNames = (expiringTodayData || []).map(s => (s.members as any).name);
        
        // Collect expired names if needed
        let expiredNames: string[] = [];
        if (shouldSendExpiredSummary) {
          const { data: expiredData } = await supabase
            .from("subscriptions")
            .select("member_id, members!inner(name)")
            .eq("status", "expired")
            .lt("end_date", todayStr);

          expiredNames = [...new Set((expiredData || []).map(s => (s.members as any).name))];
        }

        // Build admin summary message
        let adminMessage = `📊 *Pro Plus Fitness - Daily Summary*\n\n📅 ${today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}\n\n`;
        
        if (expiringTodayNames.length > 0) {
          adminMessage += `⚠️ *Expiring Today (${expiringTodayNames.length}):*\n${expiringTodayNames.map(n => `• ${n}`).join("\n")}\n\n`;
        } else {
          adminMessage += `✅ No memberships expiring today.\n\n`;
        }

        if (shouldSendExpiredSummary && expiredNames.length > 0) {
          adminMessage += `❌ *Expired Members (${expiredNames.length}):*\n${expiredNames.slice(0, 20).map(n => `• ${n}`).join("\n")}`;
          if (expiredNames.length > 20) {
            adminMessage += `\n...and ${expiredNames.length - 20} more`;
          }
        }

        await sendWhatsApp(ADMIN_WHATSAPP_NUMBER, adminMessage);
        results.adminSummary.sent = true;

        // Log admin summary
        await supabase.from("admin_summary_log").insert({
          summary_type: "daily_expiring",
          member_ids: (expiringTodayData || []).map(s => s.member_id),
        });

        if (shouldSendExpiredSummary && expiredNames.length > 0) {
          await supabase.from("admin_summary_log").insert({
            summary_type: "expired_members",
            member_ids: [],
          });
        }
      } catch (error: any) {
        console.error("Failed to send admin summary:", error);
        results.adminSummary.error = error.message;
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
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
