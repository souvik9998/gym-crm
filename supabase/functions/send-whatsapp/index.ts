import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendWhatsAppRequest {
  memberIds?: string[];
  type: "manual" | "expiring_7days" | "expiring_today" | "expired" | "test";
  customMessage?: string;
}

interface Member {
  id: string;
  name: string;
  phone: string;
  subscription?: {
    end_date: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WATI_API_KEY = Deno.env.get("WATI_API_KEY");
    const WATI_ENDPOINT = Deno.env.get("WATI_ENDPOINT");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!WATI_API_KEY || !WATI_ENDPOINT) {
      throw new Error("WATI credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { memberIds, type, customMessage } = await req.json() as SendWhatsAppRequest;

    // Get members to notify
    let members: Member[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    if (memberIds && memberIds.length > 0) {
      // Specific members selected
      const { data } = await supabase
        .from("members")
        .select("id, name, phone")
        .in("id", memberIds);
      
      // Get subscriptions for these members
      for (const member of data || []) {
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("end_date")
          .eq("member_id", member.id)
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        members.push({
          ...member,
          subscription: subData || undefined,
        });
      }
    } else if (type === "expiring_7days" || type === "expiring_today") {
      // Get members with expiring memberships
      const targetDate = new Date(today);
      if (type === "expiring_7days") {
        targetDate.setDate(targetDate.getDate() + 7);
      }
      const targetDateStr = targetDate.toISOString().split("T")[0];

      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("member_id, end_date")
        .eq("end_date", type === "expiring_today" ? todayStr : targetDateStr)
        .not("status", "eq", "expired");

      if (subsData) {
        const memberIdsFromSubs = [...new Set(subsData.map(s => s.member_id))];
        const { data: membersData } = await supabase
          .from("members")
          .select("id, name, phone")
          .in("id", memberIdsFromSubs);

        for (const member of membersData || []) {
          const sub = subsData.find(s => s.member_id === member.id);
          members.push({
            ...member,
            subscription: sub ? { end_date: sub.end_date } : undefined,
          });
        }
      }
    } else if (type === "expired") {
      // Get recently expired members
      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("member_id, end_date")
        .lt("end_date", todayStr)
        .eq("status", "expired");

      if (subsData) {
        const memberIdsFromSubs = [...new Set(subsData.map(s => s.member_id))];
        const { data: membersData } = await supabase
          .from("members")
          .select("id, name, phone")
          .in("id", memberIdsFromSubs);

        for (const member of membersData || []) {
          const sub = subsData.find(s => s.member_id === member.id);
          members.push({
            ...member,
            subscription: sub ? { end_date: sub.end_date } : undefined,
          });
        }
      }
    }

    // Check for already notified members today (idempotency)
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: existingNotifications } = await supabase
      .from("whatsapp_notifications")
      .select("member_id")
      .eq("notification_type", type)
      .gte("sent_at", startOfDay.toISOString())
      .lte("sent_at", endOfDay.toISOString());

    const alreadyNotifiedIds = new Set(existingNotifications?.map(n => n.member_id) || []);
    
    // Filter out already notified members (unless manual type)
    if (type !== "manual" && type !== "test") {
      members = members.filter(m => !alreadyNotifiedIds.has(m.id));
    }

    const results: { memberId: string; name: string; success: boolean; error?: string }[] = [];

    for (const member of members) {
      try {
        // Format phone number for WATI (remove +91 prefix if present, ensure 10 digits)
        let phone = member.phone.replace(/\D/g, "");
        if (phone.startsWith("91") && phone.length === 12) {
          phone = phone.substring(2);
        }
        if (phone.length !== 10) {
          throw new Error("Invalid phone number format");
        }

        // Compose message based on type
        let message = customMessage || "";
        if (!message) {
          const endDate = member.subscription?.end_date 
            ? new Date(member.subscription.end_date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "N/A";

          switch (type) {
            case "expiring_7days":
              message = `Hi ${member.name}! 🏋️\n\nYour Pro Plus Fitness membership is expiring on ${endDate} (in 7 days).\n\nRenew now to continue your fitness journey without interruption!\n\nVisit us or renew online today.`;
              break;
            case "expiring_today":
              message = `Hi ${member.name}! ⚠️\n\nYour Pro Plus Fitness membership expires TODAY (${endDate})!\n\nDon't miss a single workout - renew now to keep your membership active.\n\nWe're here to help you stay fit!`;
              break;
            case "expired":
              message = `Hi ${member.name}! 💪\n\nWe miss you at Pro Plus Fitness! Your membership expired on ${endDate}.\n\nRejoin now and get back on track with your fitness goals.\n\nSpecial offers may be available - visit us today!`;
              break;
            default:
              message = `Hi ${member.name}! This is a message from Pro Plus Fitness.`;
          }
        }

        // Send via WATI API
        const watiResponse = await fetch(`${WATI_ENDPOINT}/api/v1/sendSessionMessage/91${phone}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WATI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageText: message,
          }),
        });

        if (!watiResponse.ok) {
          const errorText = await watiResponse.text();
          throw new Error(`WATI API error: ${errorText}`);
        }

        // Log successful notification
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: type,
          status: "sent",
        });

        results.push({ memberId: member.id, name: member.name, success: true });
      } catch (error: any) {
        console.error(`Failed to send to ${member.name}:`, error);
        
        // Log failed notification
        await supabase.from("whatsapp_notifications").insert({
          member_id: member.id,
          notification_type: type,
          status: "failed",
          error_message: error.message,
        });

        results.push({ memberId: member.id, name: member.name, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
