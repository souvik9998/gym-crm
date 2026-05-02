import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { SendWhatsAppSchema, validateInput } from "../_shared/validation.ts";
import {
  sendWhatsAppForTenant,
  type MessageCategory,
} from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 20 requests per minute per IP
  const rateLimited = enforceRateLimit(req, "send-whatsapp", 20, 60, corsHeaders);
  if (rateLimited) return rateLimited;

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

    // Parse and validate input
    const rawBody = await req.json().catch(() => ({}));
    const validation = validateInput(SendWhatsAppSchema, rawBody);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Validation failed: ${validation.error}`,
          details: validation.details?.map(d => ({ path: d.path.join("."), message: d.message }))
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      memberIds,
      dailyPassUserIds,
      dailyPassUserId,
      type = "manual",
      customMessage,
      isManual = false,
      adminUserId,
      branchId,
      branchName: rawBranchName,
      phone,
      name,
      endDate,
      staffCredentials,
      eventDetails,
      holidayDetails,
    } = validation.data!;

    // Resolve branch name: use provided name, or look up from DB
    let branchName = rawBranchName;
    if (!branchName && branchId) {
      const { data: branchData } = await supabase
        .from("branches")
        .select("name")
        .eq("id", branchId)
        .maybeSingle();
      if (branchData?.name) {
        branchName = branchData.name;
      }
    }

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

    // Get admin user ID from request body or authorization header
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

    // Always check staff WhatsApp permission for any message type
    if (finalAdminUserId) {
      const { data: staffRecord } = await supabase
        .from("staff")
        .select("id")
        .eq("auth_user_id", finalAdminUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (staffRecord) {
        const { data: perms } = await supabase
          .from("staff_permissions")
          .select("can_send_whatsapp")
          .eq("staff_id", staffRecord.id)
          .maybeSingle();

        if (perms && !perms.can_send_whatsapp) {
          console.log("Staff WhatsApp permission denied for staff_id:", staffRecord.id);
          return new Response(
            JSON.stringify({ success: false, error: "You do not have permission to send WhatsApp messages" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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
      provider?: string | null;
      provider_message_id?: string | null;
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
          provider: logData.provider ?? null,
          provider_message_id: logData.provider_message_id ?? null,
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

    // Phone formatter with validation
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
      actualBranchName?: string | null
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
        .replace(/\{branch_name\}/gi, actualBranchName || "Your Gym");

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
      msgBranchName?: string | null,
      requestBranchName?: string | null
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

      const actualBranchName = requestBranchName || msgBranchName;
      const gymDisplayName = actualBranchName || "Your Gym";
      const teamName = `Team ${gymDisplayName}`;

      if (msgType === "custom" && customMessage) {
        return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, actualBranchName);
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
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, actualBranchName);
          }
          return (
            `🎉 *Special Offer for You!*\n\n` +
            `Hi ${memberName}, 👋\n\n` +
            `We have exciting offers waiting for you at ${gymDisplayName}! 💪\n\n` +
            `Visit us today or reply to this message to know more about our exclusive deals.\n\n` +
            `Stay fit, stay strong! 🔥\n— ${teamName}`
          );

        case "expiry_reminder":
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, actualBranchName);
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
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, actualBranchName);
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
          if (customMessage) {
            return replacePlaceholders(customMessage, memberName, expiryDate, diffDays, paymentInfo, actualBranchName);
          }
          return `Hi ${memberName}, 👋\n\nThis is a message from your gym.\n\n— ${teamName}`;
      }
    };

    // ---------------------------------------------------------------
    // USAGE TRACKING — increment tenant_usage on every successful send.
    // Resolves tenant from branch_id once per request and caches it.
    // ---------------------------------------------------------------
    // -----------------------------------------------------------------
    // Provider-agnostic send. Routes through Periskope or Zavu based on
    // tenant_messaging_config (resolved per branch). Usage tracking is
    // handled inside sendWhatsAppForTenant().
    // -----------------------------------------------------------------
    const sendMessage = async (
      toPhone: string,
      fallbackText: string,
      category: MessageCategory,
      variables: Record<string, string>,
      bId?: string | null,
    ): Promise<{ success: boolean; error?: string; provider?: string; providerMessageId?: string }> => {
      const result = await sendWhatsAppForTenant(supabase, {
        toPhone,
        category,
        variables,
        fallbackText,
        branchId: bId ?? null,
      });
      return {
        success: result.success,
        error: result.error,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      };
    };

    // Build the variable map for a member-style message.
    const buildMemberVariables = (
      memberName: string,
      expiryDate: string,
      actualBranchName: string | null | undefined,
      paymentInfo?: { amount: number; date: string; mode: string } | null,
    ): Record<string, string> => {
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

      const vars: Record<string, string> = {
        name: memberName,
        expiry_date: formattedDate,
        days: String(Math.max(0, diffDays)),
        days_expired: String(Math.abs(Math.min(0, diffDays))),
        branch_name: actualBranchName || "Your Gym",
      };
      if (paymentInfo) {
        vars.amount = String(paymentInfo.amount);
        vars.payment_date = new Date(paymentInfo.date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        vars.payment_mode = paymentInfo.mode;
      }
      return vars;
    };

    // Map the legacy `type` string used by callers to a MessageCategory.
    // Unknown / custom / promotional fall back to "promotional".
    // IMPORTANT: each reminder variant must use its own approved template so
    // members get the correct copy (expiring soon vs today vs already expired).
    const categoryFor = (t: string): MessageCategory => {
      switch (t) {
        case "new_registration":
        case "new_member":
          return "new_registration";
        case "renewal": return "renewal";
        case "daily_pass": return "daily_pass";
        case "pt_extension": return "pt_extension";
        case "expiring_2days":
        case "expiry_reminder":
          return "expiring_2days";
        case "expiring_today":
          return "expiring_today";
        case "expired_reminder":
          return "expired_reminder";
        case "payment_details": return "payment_details";
        case "admin_add_member": return "admin_add_member";
        case "staff_credentials": return "staff_credentials";
        case "event_registration":
        case "event_confirmation":
          return "event_confirmation";
        case "holiday_notification":
          return "holiday_notification";
        case "promotional":
        case "custom":
        case "manual":
        default:
          return "promotional";
      }
    };

    // When a manual "Send Expiry Reminder" comes in as the generic
    // "expiry_reminder" type, pick the right per-member variant based on
    // the member's actual subscription end date so the correct WhatsApp
    // template is used (expiring_today / expiring_2days / expired_reminder).
    const resolveReminderType = (requested: string, endDate: string): string => {
      if (requested !== "expiry_reminder") return requested;
      if (!endDate) return "expiring_2days";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) return "expired_reminder";
      if (diff === 0) return "expiring_today";
      return "expiring_2days";
    };


    if (type === "staff_credentials" && staffCredentials) {
      const { staffName, staffPhone, password, role, branches } = staffCredentials;
      const formattedPhone = formatPhone(staffPhone);
      
      const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Staff";
      const branchList = branches && branches.length > 0 ? branches.join(", ") : branchName || "All Branches";
      const gymDisplayName = branchName || "Pro Plus Fitness";
      
      let message = `🔐 *Staff Login Credentials*\n\n`;
      message += `Hi ${staffName}, 👋\n\n`;
      message += `Your login credentials for *${gymDisplayName}* Admin Portal:\n\n`;
      message += `📱 *Phone:* ${staffPhone}\n`;
      if (password) {
        message += `🔑 *Password:* ${password}\n`;
      }
      message += `👤 *Role:* ${roleLabel}\n`;
      message += `📍 *Branch(es):* ${branchList}\n\n`;
      message += `🔗 *Login URL:* Access the admin portal and use the Staff Login tab.\n\n`;
      message += `⚠️ Please keep your credentials secure and do not share them with others.\n\n`;
      message += `— Team ${gymDisplayName}`;
      
      const result = await sendMessage(
        formattedPhone,
        message,
        "staff_credentials",
        {
          name: staffName,
          phone: staffPhone,
          password: password ?? "",
          role: roleLabel,
          branches: branchList,
          branch_name: gymDisplayName,
        },
        branchId || null,
      );

      await logWhatsAppMessage({
        recipient_phone: staffPhone,
        recipient_name: staffName,
        notification_type: "staff_credentials",
        message_content: message.replace(/🔑 \*Password:\* .+\n/, "🔑 *Password:* [REDACTED]\n"),
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        is_manual: true,
        admin_user_id: finalAdminUserId,
        branch_id: branchId || null,
        provider: result.provider ?? null,
        provider_message_id: result.providerMessageId ?? null,
      });

      return new Response(
        JSON.stringify({
          success: result.success,
          message: result.success ? "Staff credentials sent successfully" : "Failed to send credentials",
          error: result.error,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DIRECT SEND (for registration pages, etc.)
    if (phone && name) {
      const formattedPhone = formatPhone(phone);
      const memberEndDate = endDate || new Date().toISOString().split("T")[0];
      const directMemberId = memberIds?.[0] ?? null;
      const directDailyPassUserId = dailyPassUserId ?? dailyPassUserIds?.[0] ?? null;

      let paymentInfo: { amount: number; date: string; mode: string } | null = null;
      if (type === "payment_details") {
        if (directMemberId) {
          const { data: latestPayment } = await supabase
            .from("payments")
            .select("amount, created_at, payment_mode")
            .eq("member_id", directMemberId)
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestPayment) {
            paymentInfo = {
              amount: latestPayment.amount,
              date: latestPayment.created_at,
              mode: latestPayment.payment_mode,
            };
          }
        } else if (directDailyPassUserId) {
          const { data: latestPayment } = await supabase
            .from("payments")
            .select("amount, created_at, payment_mode")
            .eq("daily_pass_user_id", directDailyPassUserId)
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestPayment) {
            paymentInfo = {
              amount: latestPayment.amount,
              date: latestPayment.created_at,
              mode: latestPayment.payment_mode,
            };
          }
        }
      }

      // Pick correct reminder template variant based on actual expiry
      const effectiveType = resolveReminderType(type, memberEndDate);
      const message = generateMessage(name, memberEndDate, effectiveType, paymentInfo, null, branchName);
      let variables = buildMemberVariables(name, memberEndDate, branchName, paymentInfo);
      if ((type === "event_registration" || type === "event_confirmation") && eventDetails) {
        variables = {
          name,
          event_title: eventDetails.title,
          event_date: eventDetails.date,
          event_time: eventDetails.time,
          venue: eventDetails.venue,
          amount: String(eventDetails.amount),
          branch_name: branchName || "",
        };
      }
      const result = await sendMessage(formattedPhone, message, categoryFor(effectiveType), variables, branchId || null);

      await logWhatsAppMessage({
        member_id: directMemberId,
        daily_pass_user_id: directDailyPassUserId,
        recipient_phone: phone,
        recipient_name: name,
        notification_type: effectiveType,
        message_content: message,
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        is_manual: isManual,
        admin_user_id: finalAdminUserId,
        branch_id: branchId || null,
        provider: result.provider ?? null,
        provider_message_id: result.providerMessageId ?? null,
      });

      return new Response(
        JSON.stringify({
          success: result.success,
          results: [{
            name,
            phone,
            success: result.success,
            error: result.error,
          }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DAILY PASS USER SEND
    if (dailyPassUserId || (dailyPassUserIds && dailyPassUserIds.length > 0)) {
      const userIds = dailyPassUserId ? [dailyPassUserId] : dailyPassUserIds!;
      
      const { data: users, error: usersError } = await supabase
        .from("daily_pass_users")
        .select(`
          id,
          name,
          phone,
          branch_id,
          branches(name),
          daily_pass_subscriptions(end_date, status)
        `)
        .in("id", userIds);

      if (usersError || !users?.length) {
        return new Response(
          JSON.stringify({ success: false, error: "Daily pass users not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = [];

      for (const user of users) {
        const formattedPhone = formatPhone(user.phone);
        const activeSubscription = user.daily_pass_subscriptions?.find(
          (s: any) => s.status === "active"
        );
        const userEndDate = activeSubscription?.end_date || new Date().toISOString().split("T")[0];
        const userBranchName = (user.branches as any)?.name;
        
        const message = generateMessage(user.name, userEndDate, type, null, userBranchName, branchName);
        const variables = buildMemberVariables(user.name, userEndDate, userBranchName || branchName, null);
        const result = await sendMessage(
          formattedPhone,
          message,
          categoryFor(type),
          variables,
          user.branch_id || branchId || null,
        );

        await logWhatsAppMessage({
          daily_pass_user_id: user.id,
          recipient_phone: user.phone,
          recipient_name: user.name,
          notification_type: type,
          message_content: message,
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
          is_manual: isManual,
          admin_user_id: finalAdminUserId,
          branch_id: user.branch_id || branchId || null,
          provider: result.provider ?? null,
          provider_message_id: result.providerMessageId ?? null,
        });

        results.push({
          id: user.id,
          name: user.name,
          phone: user.phone,
          success: result.success,
          error: result.error,
        });
      }

      return new Response(
        JSON.stringify({
          success: results.every(r => r.success),
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MEMBER SEND
    if (!memberIds || memberIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No member IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get members with subscription info
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select(`
        id,
        name,
        phone,
        branch_id,
        branches(name),
        subscriptions(end_date, status)
      `)
      .in("id", memberIds);

    if (membersError || !members?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Members not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get last payment for payment_details type
    let paymentsMap: Record<string, { amount: number; date: string; mode: string }> = {};
    if (type === "payment_details") {
      const { data: payments } = await supabase
        .from("payments")
        .select("member_id, amount, created_at, payment_mode")
        .in("member_id", memberIds)
        .eq("status", "success")
        .order("created_at", { ascending: false });

      if (payments) {
        for (const payment of payments) {
          if (!paymentsMap[payment.member_id]) {
            paymentsMap[payment.member_id] = {
              amount: payment.amount,
              date: payment.created_at,
              mode: payment.payment_mode,
            };
          }
        }
      }
    }

    const results = [];

    for (const member of members) {
      const formattedPhone = formatPhone(member.phone);
      
      // Get active or most recent subscription
      const activeSubscription = member.subscriptions?.find(
        (s: any) => s.status === "active" || s.status === "expiring_soon"
      ) || member.subscriptions?.[0];
      
      const memberEndDate = activeSubscription?.end_date || new Date().toISOString().split("T")[0];
      const paymentInfo = paymentsMap[member.id] || null;
      const memberBranchName = (member.branches as any)?.name;

      // Resolve generic "expiry_reminder" to per-member variant so the
      // correct WhatsApp template is selected for each recipient
      // (expiring_today vs expiring_2days vs expired_reminder).
      const effectiveType = resolveReminderType(type, memberEndDate);

      const message = generateMessage(member.name, memberEndDate, effectiveType, paymentInfo, memberBranchName, branchName);
      const variables = buildMemberVariables(member.name, memberEndDate, memberBranchName || branchName, paymentInfo);
      const result = await sendMessage(
        formattedPhone,
        message,
        categoryFor(effectiveType),
        variables,
        member.branch_id || branchId || null,
      );

      await logWhatsAppMessage({
        member_id: member.id,
        recipient_phone: member.phone,
        recipient_name: member.name,
        notification_type: effectiveType,
        message_content: message,
        status: result.success ? "sent" : "failed",
        error_message: result.error || null,
        is_manual: isManual,
        admin_user_id: finalAdminUserId,
        branch_id: member.branch_id || branchId || null,
        provider: result.provider ?? null,
        provider_message_id: result.providerMessageId ?? null,
      });

      results.push({
        id: member.id,
        name: member.name,
        phone: member.phone,
        success: result.success,
        error: result.error,
      });
    }

    return new Response(
      JSON.stringify({
        success: results.every(r => r.success),
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("WhatsApp send error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
