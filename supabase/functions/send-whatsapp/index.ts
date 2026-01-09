import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendWhatsAppRequest {
  memberIds?: string[];
  type?: "expiring_2days" | "expiring_today" | "manual" | "renewal" | "pt_extension";
  customMessage?: string;
  // For direct send without member lookup
  phone?: string;
  name?: string;
  endDate?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PERISKOPE_API_KEY || !PERISKOPE_PHONE) {
      throw new Error("Periskope API credentials not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      memberIds,
      type = "manual",
      customMessage,
      phone,
      name,
      endDate,
    } = (await req.json()) as SendWhatsAppRequest;

    // Format phone number for Periskope (should be like 919876543210)
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

    // Generate message based on type
    const generateMessage = (memberName: string, expiryDate: string, msgType: string): string => {
      const formattedDate = new Date(expiryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      switch (msgType) {
        case "renewal":
          return `🎉 Hi ${memberName}!\n\nYour gym membership has been renewed until *${formattedDate}*.\n\nKeep crushing your fitness goals! 💪`;
        case "pt_extension":
          return `🎉 Hi ${memberName}!\n\nYour Personal Training has been extended until *${formattedDate}*.\n\nSee you at the gym! 🏋️`;
        case "expiring_2days":
          return `⚠️ Hi ${memberName}!\n\nYour gym membership expires in *2 days* (${formattedDate}).\n\nRenew now to avoid any interruption! 🏃`;
        case "expiring_today":
          return `🚨 Hi ${memberName}!\n\nYour gym membership expires *TODAY*!\n\nPlease renew immediately to continue your fitness journey. 💪`;
        default:
          return customMessage || `Hi ${memberName}, this is a reminder from your gym!`;
      }
    };

    // Send message via Periskope
    const sendPeriskopeMessage = async (
      chatId: string,
      message: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        console.log(`Sending to ${chatId}: ${message.substring(0, 50)}...`);

        const response = await fetch("https://api.periskope.app/v1/message/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERISKOPE_API_KEY}`,
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

        if (!response.ok) {
          return { success: false, error: `Periskope API error: ${response.status} - ${responseText}` };
        }

        return { success: true };
      } catch (error: any) {
        console.error("Error sending Periskope message:", error);
        return { success: false, error: error.message };
      }
    };

    // If direct send (phone, name, endDate provided)
    if (phone && name && endDate) {
      const formattedPhone = formatPhone(phone);
      const message = generateMessage(name, endDate, type);
      const result = await sendPeriskopeMessage(formattedPhone, message);

      // Log notification if we have a member ID
      if (memberIds && memberIds.length > 0) {
        await supabase.from("whatsapp_notifications").insert({
          member_id: memberIds[0],
          notification_type: type,
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
        });
      }

      return new Response(JSON.stringify({ success: result.success, error: result.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If memberIds provided, fetch members and send
    if (!memberIds || memberIds.length === 0) {
      return new Response(JSON.stringify({ error: "No member IDs or phone provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch members with their subscription data
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("id, name, phone")
      .in("id", memberIds);

    if (membersError) {
      throw membersError;
    }

    // Fetch subscription data for each member
    const membersWithSubs = [];
    for (const member of members || []) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      membersWithSubs.push({
        ...member,
        end_date: subData?.end_date || new Date().toISOString(),
      });
    }

    const results: { memberId: string; success: boolean; error?: string }[] = [];

    for (const member of membersWithSubs) {
      const formattedPhone = formatPhone(member.phone);
      const message = customMessage || generateMessage(member.name, member.end_date, type);
      const result = await sendPeriskopeMessage(formattedPhone, message);

      // Log notification
      await supabase.from("whatsapp_notifications").insert({
        member_id: member.id,
        notification_type: type,
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
      });

      results.push({
        memberId: member.id,
        success: result.success,
        error: result.error,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp function:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
