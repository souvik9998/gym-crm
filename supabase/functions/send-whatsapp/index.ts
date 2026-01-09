import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendWhatsAppRequest {
  memberIds?: string[];
  type?: "expiring_2days" | "expiring_today" | "manual" | "renewal" | "pt_extension" | "promotional" | "expiry_reminder" | "payment_details" | "custom";
  customMessage?: string;

  // Direct send
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

    // Check if WhatsApp is enabled
    const { data: settings } = await supabase
      .from("gym_settings")
      .select("whatsapp_enabled")
      .limit(1)
      .maybeSingle();

    if (settings?.whatsapp_enabled === false) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp messaging is disabled" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const {
      memberIds,
      type = "manual",
      customMessage,
      phone,
      name,
      endDate,
    } = (await req.json()) as SendWhatsAppRequest;

    // ---------------------------
    // Phone formatter
    // ---------------------------
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

    // ---------------------------
    // MESSAGE GENERATOR
    // ---------------------------
    const generateMessage = (
      memberName: string, 
      expiryDate: string, 
      msgType: string,
      paymentInfo?: { amount: number; date: string; mode: string } | null
    ): string => {
      const formattedDate = new Date(expiryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDateObj = new Date(expiryDate);
      endDateObj.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      switch (msgType) {
        case "renewal":
          return (
            `✅ *Membership Renewed Successfully!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership has been *renewed till ${formattedDate}*.\n\n` +
            `Let's stay consistent and keep pushing towards your fitness goals 💪🔥\n\n` +
            `See you at the gym!\n— Team Pro Plus Fitness`
          );

        case "pt_extension":
          return (
            `🏋️ *Personal Training Extended!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your Personal Training sessions are now extended till *${formattedDate}*.\n\n` +
            `Get ready to level up your performance with focused training 🔥\n\n` +
            `Train hard!\n— Team Pro Plus Fitness`
          );

        case "expiring_2days":
          return (
            `⏳ *Membership Expiring Soon*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership will expire in *2 days* on *${formattedDate}*.\n\n` +
            `Renew on time to avoid any break in your workouts 💪\n\n` +
            `Reply to this message or visit the gym to renew.\n— Team Pro Plus Fitness`
          );

        case "expiring_today":
          return (
            `🚨 *Membership Expires Today*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership expires *today (${formattedDate})*.\n\n` +
            `Renew now to continue your fitness journey without interruption 🔥\n\n` +
            `Contact us or visit the gym today.\n— Team Pro Plus Fitness`
          );

        case "promotional":
          return (
            `🎉 *Special Offer for You!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `We have exciting offers waiting for you at Pro Plus Fitness! 💪\n\n` +
            `Visit us today or reply to this message to know more about our exclusive deals.\n\n` +
            `Stay fit, stay strong! 🔥\n— Team Pro Plus Fitness`
          );

        case "expiry_reminder":
          const daysText = diffDays === 0 
            ? "expires *today*" 
            : diffDays < 0 
              ? `expired *${Math.abs(diffDays)} days ago*`
              : `expires in *${diffDays} days*`;
          return (
            `⚠️ *Subscription Expiry Reminder*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership ${daysText} (${formattedDate}).\n\n` +
            `Don't let your fitness journey pause! Renew now to continue your progress 💪\n\n` +
            `Visit the gym or reply to renew.\n— Team Pro Plus Fitness`
          );

        case "payment_details":
          if (paymentInfo) {
            const paymentDate = new Date(paymentInfo.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });
            return (
              `🧾 *Payment Receipt*\n\n` +
              `Hi ${memberName}, 👋\n\n` +
              `Here are your last payment details:\n\n` +
              `💰 *Amount:* ₹${paymentInfo.amount}\n` +
              `📅 *Date:* ${paymentDate}\n` +
              `💳 *Mode:* ${paymentInfo.mode.charAt(0).toUpperCase() + paymentInfo.mode.slice(1)}\n\n` +
              `Your membership is valid till *${formattedDate}*.\n\n` +
              `Thank you for being with us! 🙏\n— Team Pro Plus Fitness`
            );
          }
          return (
            `🧾 *Payment Information*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your current membership is valid till *${formattedDate}*.\n\n` +
            `For detailed payment history, please visit the gym or contact us.\n\n` +
            `Thank you! 🙏\n— Team Pro Plus Fitness`
          );

        case "custom":
          return customMessage || `Hi ${memberName}, 👋\n\nThis is a message from Pro Plus Fitness.\n\n— Team Pro Plus Fitness`;

        default:
          return customMessage || `Hi ${memberName}, 👋\n\nThis is a message from your gym.\n\n— Team Pro Plus Fitness`;
      }
    };

    // ---------------------------
    // SEND VIA PERISKOPE
    // ---------------------------
    const sendPeriskopeMessage = async (
      chatId: string,
      message: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch("https://api.periskope.app/v1/message/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERISKOPE_API_KEY}`,
            "x-phone": PERISKOPE_PHONE,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: `${chatId}@c.us`,
            message,
          }),
        });

        const responseText = await response.text();

        if (!response.ok) {
          return {
            success: false,
            error: `${response.status} - ${responseText}`,
          };
        }

        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    };

    // ---------------------------
    // DIRECT SEND (NO MEMBER LOOKUP)
    // ---------------------------
    if (phone && name && endDate) {
      const formattedPhone = formatPhone(phone);
      const message = customMessage || generateMessage(name, endDate, type);

      const result = await sendPeriskopeMessage(formattedPhone, message);

      if (memberIds && memberIds.length > 0) {
        await supabase.from("whatsapp_notifications").insert({
          member_id: memberIds[0],
          notification_type: type,
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
        });
      }

      return new Response(JSON.stringify(result), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // ---------------------------
    // MEMBER BASED SEND
    // ---------------------------
    if (!memberIds || memberIds.length === 0) {
      return new Response(JSON.stringify({ error: "No member IDs or phone provided" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const { data: members, error } = await supabase.from("members").select("id, name, phone").in("id", memberIds);

    if (error) throw error;

    const membersWithData = [];

    for (const member of members || []) {
      // Get subscription
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get last payment for payment_details type
      let paymentInfo = null;
      if (type === "payment_details") {
        const { data: payment } = await supabase
          .from("payments")
          .select("amount, created_at, payment_mode")
          .eq("member_id", member.id)
          .eq("status", "success")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (payment) {
          paymentInfo = {
            amount: payment.amount,
            date: payment.created_at,
            mode: payment.payment_mode,
          };
        }
      }

      membersWithData.push({
        ...member,
        end_date: sub?.end_date || new Date().toISOString(),
        paymentInfo,
      });
    }

    const results = [];

    for (const member of membersWithData) {
      const formattedPhone = formatPhone(member.phone);
      const message = customMessage || generateMessage(member.name, member.end_date, type, member.paymentInfo);

      const result = await sendPeriskopeMessage(formattedPhone, message);

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

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
