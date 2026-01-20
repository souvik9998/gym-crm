import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendWhatsAppRequest {
  memberIds?: string[];
  dailyPassUserIds?: string[];
  dailyPassUserId?: string; // Single daily pass user ID for direct send
  type?: "expiring_2days" | "expiring_today" | "manual" | "renewal" | "pt_extension" | "promotional" | "expiry_reminder" | "expired_reminder" | "payment_details" | "custom" | "new_member" | "new_registration" | "daily_pass";
  customMessage?: string;
  isManual?: boolean;
  adminUserId?: string;
  branchId?: string;
  branchName?: string;

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

    const {
      memberIds,
      dailyPassUserIds,
      dailyPassUserId,
      type = "manual",
      customMessage,
      isManual = false,
      adminUserId,
      branchId,
      branchName,
      phone,
      name,
      endDate,
    } = (await req.json()) as SendWhatsAppRequest;

    // Check if WhatsApp is enabled for the specific branch
    if (branchId) {
      const { data: settings } = await supabase
        .from("gym_settings")
        .select("whatsapp_enabled")
        .eq("branch_id", branchId)
        .limit(1)
        .maybeSingle();

      if (settings?.whatsapp_enabled === false) {
        return new Response(
          JSON.stringify({ success: false, error: "WhatsApp messaging is disabled for this branch" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Fallback: Check if WhatsApp is enabled globally (for backward compatibility)
      const { data: settings } = await supabase
        .from("gym_settings")
        .select("whatsapp_enabled")
        .is("branch_id", null)
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
    }

    // Get admin user ID from request body if provided
    let finalAdminUserId = adminUserId || null;
    
    // For manual messages, try to extract from authorization header if not provided
    if (!finalAdminUserId && (isManual || type === "manual" || type === "custom")) {
      try {
        const authHeader = req.headers.get("authorization");
        if (authHeader) {
          const token = authHeader.replace("Bearer ", "").trim();
          const userSupabase = createClient(SUPABASE_URL!, token, {
            auth: { persistSession: false },
          });
          const { data: { user }, error: userError } = await userSupabase.auth.getUser();
          if (!userError && user) {
            finalAdminUserId = user.id;
            console.log("Extracted admin user ID from token:", finalAdminUserId);
          }
        }
      } catch (e) {
        console.warn("Could not extract admin user ID from token:", e);
      }
    }
    
    // Helper function to log WhatsApp message
    const logWhatsAppMessage = async (logData: {
      member_id?: string | null;
      daily_pass_user_id?: string | null;
      recipient_phone: string;
      recipient_name: string;
      notification_type: string;
      message_content: string;
      status: string;
      error_message?: string | null;
      is_manual: boolean;
      admin_user_id?: string | null;
      branch_id?: string | null;
    }) => {
      try {
        const insertData: any = {
          recipient_phone: logData.recipient_phone || null,
          recipient_name: logData.recipient_name || null,
          notification_type: logData.notification_type,
          message_content: (logData.message_content || "").substring(0, 500),
          status: logData.status,
          error_message: logData.error_message || null,
          is_manual: logData.is_manual,
          admin_user_id: logData.admin_user_id || null,
          branch_id: logData.branch_id || null,
        };

        if (logData.member_id) {
          insertData.member_id = logData.member_id;
        }
        if (logData.daily_pass_user_id) {
          insertData.daily_pass_user_id = logData.daily_pass_user_id;
        }

        const { error: insertError } = await supabase
          .from("whatsapp_notifications")
          .insert(insertData);

        if (insertError) {
          console.error("Error logging WhatsApp message:", insertError);
        } else {
          console.log("Successfully logged WhatsApp message:", {
            type: logData.notification_type,
            status: logData.status,
            recipient: logData.recipient_name,
          });
        }
      } catch (error: any) {
        console.error("Exception while logging WhatsApp message:", error);
      }
    };

    // Phone formatter
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

    // Replace template placeholders with actual values
    const replacePlaceholders = (
      template: string,
      memberName: string,
      expiryDate: string,
      diffDays: number,
      paymentInfo?: { amount: number; date: string; mode: string } | null,
      branchName?: string | null
    ): string => {
      const formattedDate = new Date(expiryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      let message = template
        .replace(/\{name\}/gi, memberName)
        .replace(/\{expiry_date\}/gi, formattedDate)
        .replace(/\{days\}/gi, Math.abs(diffDays).toString())
        .replace(/\{branch_name\}/gi, branchName || "Pro Plus Fitness");

      if (paymentInfo) {
        const paymentDate = new Date(paymentInfo.date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        message = message
          .replace(/\{amount\}/gi, `₹${paymentInfo.amount}`)
          .replace(/\{payment_date\}/gi, paymentDate);
      }

      return message;
    };

    // MESSAGE GENERATOR
    const generateMessage = (
      memberName: string, 
      expiryDate: string, 
      msgType: string,
      paymentInfo?: { amount: number; date: string; mode: string } | null,
      msgBranchName?: string | null
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

      // Use branch name if provided, otherwise default gym name
      const gymDisplayName = msgBranchName ? `Pro Plus Fitness - ${msgBranchName}` : "Pro Plus Fitness";
      const teamName = msgBranchName ? `Team Pro Plus Fitness (${msgBranchName})` : "Team Pro Plus Fitness";

      // For custom messages with placeholders, replace them
      if (msgType === "custom" && customMessage) {
        return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, msgBranchName);
      }

      switch (msgType) {
        case "new_registration":
          return (
            `🎉 *Welcome to ${gymDisplayName}!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Congratulations on starting your fitness journey! 🏋️\n\n` +
            `Your membership is now *active till ${formattedDate}*.\n\n` +
            `We're excited to have you on board. Let's crush those fitness goals together 💪🔥\n\n` +
            `See you at the gym!\n— ${teamName}`
          );

        case "daily_pass":
          return (
            `🎟️ *Daily Pass Activated at ${gymDisplayName}!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your daily pass is now *active till ${formattedDate}*.\n\n` +
            `Make the most of your session today! 💪🔥\n\n` +
            `See you at the gym!\n— ${teamName}`
          );

        case "renewal":
        case "new_member":
          return (
            `✅ *Membership Renewed Successfully!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership has been *renewed till ${formattedDate}*.\n\n` +
            `Let's stay consistent and keep pushing towards your fitness goals 💪🔥\n\n` +
            `See you at the gym!\n— ${teamName}`
          );

        case "pt_extension":
          return (
            `🏋️ *Personal Training Extended!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your Personal Training sessions are now extended till *${formattedDate}*.\n\n` +
            `Get ready to level up your performance with focused training 🔥\n\n` +
            `Train hard!\n— ${teamName}`
          );

        case "expiring_2days":
          return (
            `⏳ *Membership Expiring Soon*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership will expire in *2 days* on *${formattedDate}*.\n\n` +
            `Renew on time to avoid any break in your workouts 💪\n\n` +
            `Reply to this message or visit the gym to renew.\n— ${teamName}`
          );

        case "expiring_today":
          return (
            `🚨 *Membership Expires Today*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership expires *today (${formattedDate})*.\n\n` +
            `Renew now to continue your fitness journey without interruption 🔥\n\n` +
            `Contact us or visit the gym today.\n— ${teamName}`
          );

        case "promotional":
          // Check for saved template and replace placeholders
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, msgBranchName);
          }
          return (
            `🎉 *Special Offer for You!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `We have exciting offers waiting for you at ${gymDisplayName}! 💪\n\n` +
            `Visit us today or reply to this message to know more about our exclusive deals.\n\n` +
            `Stay fit, stay strong! 🔥\n— ${teamName}`
          );

        case "expiry_reminder":
          // Check for saved template and replace placeholders
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, msgBranchName);
          }
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
            `Visit the gym or reply to renew.\n— ${teamName}`
          );

        case "expired_reminder":
          // Check for saved template and replace placeholders
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, msgBranchName);
          }
          const expiredDays = Math.abs(diffDays);
          return (
            `⛔ *Membership Expired*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your gym membership expired ${expiredDays} days ago on ${formattedDate}.\n\n` +
            `We miss seeing you at the gym! 💔 Renew now and get back on track with your fitness goals.\n\n` +
            `🎁 *Special Renewal Offer* - Renew within 7 days and get exclusive benefits!\n\n` +
            `Visit us or reply to renew today.\n— ${teamName}`
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
              `Thank you for being with us! 🙏\n— ${teamName}`
            );
          }
          return (
            `🧾 *Payment Information*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `Your current membership is valid till *${formattedDate}*.\n\n` +
            `For detailed payment history, please visit the gym or contact us.\n\n` +
            `Thank you! 🙏\n— ${teamName}`
          );

        default:
          // For manual or custom messages with templates
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, msgBranchName);
          }
          return `Hi ${memberName}, 👋\n\nThis is a message from your gym.\n\n— ${teamName}`;
      }
    };

    // SEND VIA PERISKOPE
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

    // DIRECT SEND (NO MEMBER LOOKUP)
    if (phone && name && endDate) {
      const formattedPhone = formatPhone(phone);
      const message = generateMessage(name, endDate, type, null, branchName);

      const result = await sendPeriskopeMessage(formattedPhone, message);

      const isManualMessage = isManual || type === "manual" || type === "custom";
      
      await logWhatsAppMessage({
        member_id: memberIds && memberIds.length > 0 ? memberIds[0] : null,
        daily_pass_user_id: dailyPassUserId || null,
        recipient_phone: phone,
        recipient_name: name,
        notification_type: type,
        message_content: message,
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        is_manual: isManualMessage,
        admin_user_id: isManualMessage ? finalAdminUserId : null,
        branch_id: branchId || null,
      });

      return new Response(JSON.stringify(result), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // MEMBER/DAILY PASS USER BASED SEND
    if ((!memberIds || memberIds.length === 0) && (!dailyPassUserIds || dailyPassUserIds.length === 0)) {
      return new Response(JSON.stringify({ error: "No member IDs, daily pass user IDs, or phone provided" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // Fetch members if provided
    let members: Array<{ id: string; name: string; phone: string }> = [];
    if (memberIds && memberIds.length > 0) {
      const { data: membersData, error: membersError } = await supabase.from("members").select("id, name, phone").in("id", memberIds);
      if (membersError) throw membersError;
      members = membersData || [];
    }

    // Fetch daily pass users if provided
    let dailyPassUsers: Array<{ id: string; name: string; phone: string }> = [];
    if (dailyPassUserIds && dailyPassUserIds.length > 0) {
      const { data: dailyPassUsersData, error: dailyPassUsersError } = await supabase
        .from("daily_pass_users")
        .select("id, name, phone")
        .in("id", dailyPassUserIds);
      if (dailyPassUsersError) throw dailyPassUsersError;
      dailyPassUsers = dailyPassUsersData || [];
    }

    const recipientsWithData = [];

    // Process members
    for (const member of members) {
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

      recipientsWithData.push({
        ...member,
        isMember: true,
        end_date: sub?.end_date || new Date().toISOString(),
        paymentInfo,
      });
    }

    // Process daily pass users
    for (const dailyPassUser of dailyPassUsers) {
      const { data: purchase } = await supabase
        .from("daily_pass_subscriptions")
        .select("end_date")
        .eq("daily_pass_user_id", dailyPassUser.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      recipientsWithData.push({
        ...dailyPassUser,
        isMember: false,
        end_date: purchase?.end_date || new Date().toISOString(),
        paymentInfo: null,
      });
    }

    const results = [];

    for (const recipient of recipientsWithData) {
      const formattedPhone = formatPhone(recipient.phone);
      const message = generateMessage(recipient.name, recipient.end_date, type, recipient.paymentInfo);

      const result = await sendPeriskopeMessage(formattedPhone, message);

      const isManualMessage = isManual || type === "manual" || type === "custom";
      
      await logWhatsAppMessage({
        member_id: recipient.isMember ? recipient.id : null,
        daily_pass_user_id: recipient.isMember ? null : recipient.id,
        recipient_phone: recipient.phone,
        recipient_name: recipient.name,
        notification_type: type,
        message_content: message,
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        is_manual: isManualMessage,
        admin_user_id: isManualMessage ? finalAdminUserId : null,
        branch_id: branchId || null,
      });

      results.push({
        memberId: recipient.isMember ? recipient.id : undefined,
        dailyPassUserId: recipient.isMember ? undefined : recipient.id,
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
      }
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
