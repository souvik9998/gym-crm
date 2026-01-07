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
    /* =======================
       ENV VARIABLES
    ======================= */
    const WATI_API_KEY = Deno.env.get("WATI_API_KEY"); // MUST include "Bearer ..."
    const WATI_ENDPOINT = Deno.env.get("WATI_ENDPOINT"); // https://app-server.wati.io
    const ADMIN_WHATSAPP_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!WATI_API_KEY || !WATI_ENDPOINT || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    /* =======================
       DATE HELPERS
    ======================= */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStr = today.toISOString().split("T")[0];

    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenDaysStr = sevenDays.toISOString().split("T")[0];

    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    /* =======================
       WATI TEMPLATE SENDER
    ======================= */
    const sendTemplateMessage = async (phone: string, templateName: string, parameters: Record<string, string>) => {
      let formattedPhone = phone.replace(/\D/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`;
      }
      if (formattedPhone.length !== 12) {
        throw new Error("Invalid phone number format");
      }

      const res = await fetch(`${WATI_ENDPOINT}/api/v1/sendTemplateMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // IMPORTANT: token already has Bearer
          Authorization: WATI_API_KEY,
        },
        body: JSON.stringify({
          phone: formattedPhone,
          template_name: templateName,
          parameters,
        }),
      });

      const data = await res.json();
      console.log("WATI RESPONSE:", data);

      if (!res.ok || data.result === false) {
        throw new Error(data.message || "WATI send failed");
      }
    };

    /* =======================
       PREVENT DUPLICATE DAILY RUN
    ======================= */
    const { data: alreadyRun } = await supabase
      .from("admin_summary_log")
      .select("id")
      .eq("summary_type", "daily_expiring")
      .gte("sent_at", startOfDay.toISOString())
      .lte("sent_at", endOfDay.toISOString())
      .limit(1);

    if (alreadyRun && alreadyRun.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: "Already ran today",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* =======================
       FETCH MEMBERS
    ======================= */
    const { data: expiring7Days } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, members!inner(id, name, phone)")
      .eq("end_date", sevenDaysStr)
      .neq("status", "expired");

    const { data: expiringToday } = await supabase
      .from("subscriptions")
      .select("member_id, end_date, members!inner(id, name, phone)")
      .eq("end_date", todayStr)
      .neq("status", "expired");

    /* =======================
       SEND MEMBER MESSAGES
    ======================= */
    for (const sub of expiring7Days || []) {
      const member = sub.members as any;
      await sendTemplateMessage(member.phone, "member_expiring", {
        name: member.name,
        days: "7",
      });

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: "expiring_7days",
        status: "sent",
      });
    }

    for (const sub of expiringToday || []) {
      const member = sub.members as any;
      await sendTemplateMessage(member.phone, "member_expired", {
        name: member.name,
      });

      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: "expiring_today",
        status: "sent",
      });
    }

    /* =======================
       ADMIN SUMMARY
    ======================= */
    if (ADMIN_WHATSAPP_NUMBER) {
      const expiringNames = expiringToday?.map((s) => (s.members as any).name) || [];

      const { data: expiredData } = await supabase
        .from("subscriptions")
        .select("members!inner(name)")
        .eq("status", "expired")
        .lt("end_date", todayStr);

      const expiredNames = [...new Set((expiredData || []).map((s) => (s.members as any).name))];

      await sendTemplateMessage(ADMIN_WHATSAPP_NUMBER, "admin_daily_summary", {
        expiring_list: expiringNames.join(", ") || "None",
        expired_list: expiredNames.join(", ") || "None",
      });

      await supabase.from("admin_summary_log").insert({
        summary_type: "daily_expiring",
        member_ids: expiringToday?.map((s) => s.member_id) || [],
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("EDGE FUNCTION ERROR:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
