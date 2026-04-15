import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { getGymRazorpayCredentials } from "../_shared/encryption.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FinalizeEventPaymentSchema = z.object({
  eventId: z.string().uuid(),
  pricingOptionId: z.string().uuid(),
  branchId: z.string().uuid(),
  memberId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  amount: z.number().positive().max(1000000),
  customResponses: z.record(z.string(), z.string()).optional().nullable(),
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100).optional(),
  razorpaySignature: z.string().min(1).max(200).optional(),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveRazorpayCredentials(branchId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let keyId: string | undefined;
  let keySecret: string | undefined;

  const gymCreds = await getGymRazorpayCredentials(serviceClient, branchId);
  if (gymCreds) {
    keyId = gymCreds.keyId;
    keySecret = gymCreds.keySecret;
    console.log("Using per-gym Razorpay credentials for event payment finalization");
  }

  if (!keyId || !keySecret) {
    keyId = Deno.env.get("RAZORPAY_KEY_ID");
    keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (keyId && keySecret) {
      console.log("Using global Razorpay credentials for event payment finalization (fallback)");
    }
  }

  if (!keyId || !keySecret) {
    throw new Error("Payment gateway not configured for this gym");
  }

  return { keyId, keySecret };
}

async function verifySignature(orderId: string, paymentId: string, signature: string, keySecret: string) {
  const payload = `${orderId}|${paymentId}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSignature = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSignature !== signature) {
    throw new Error("Payment verification failed");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = enforceRateLimit(req, "finalize-event-payment", 20, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  try {
    const rawBody = await req.json();
    const parsed = FinalizeEventPaymentSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonResponse({
        error: parsed.error.issues[0]?.message || "Invalid request body",
        details: parsed.error.issues,
      }, 400);
    }

    const {
      eventId,
      pricingOptionId,
      branchId,
      memberId,
      name,
      phone,
      email,
      amount,
      customResponses,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = parsed.data;

    if (!razorpayPaymentId || !razorpaySignature) {
      return jsonResponse({ error: "Missing payment verification details" }, 400);
    }

    const { keySecret } = await resolveRazorpayCredentials(branchId);
    await verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, keySecret);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let paymentRecordId: string;

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id")
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("razorpay_payment_id", razorpayPaymentId)
      .eq("payment_type", "event_registration")
      .maybeSingle();

    if (existingPaymentError) {
      console.error("Error checking existing event payment:", existingPaymentError);
      throw new Error("Failed to finalize payment");
    }

    if (existingPayment?.id) {
      paymentRecordId = existingPayment.id;
    } else {
      const { data: createdPayment, error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          amount,
          payment_mode: "online",
          status: "success",
          payment_type: "event_registration",
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          branch_id: branchId,
          member_id: memberId || null,
        })
        .select("id")
        .single();

      if (paymentInsertError || !createdPayment) {
        console.error("Error creating event payment record:", paymentInsertError);
        throw new Error("Failed to record payment");
      }

      paymentRecordId = createdPayment.id;
    }

    const { data: registrationByPayment, error: registrationByPaymentError } = await supabase
      .from("event_registrations")
      .select("id, payment_status")
      .eq("event_id", eventId)
      .eq("payment_id", paymentRecordId)
      .maybeSingle();

    if (registrationByPaymentError) {
      console.error("Error checking registration by payment:", registrationByPaymentError);
      throw new Error("Failed to finalize registration");
    }

    if (registrationByPayment?.id && registrationByPayment.payment_status === "success") {
      return jsonResponse({
        success: true,
        registrationId: registrationByPayment.id,
        paymentId: paymentRecordId,
      });
    }

    let registrationId: string;
    let shouldIncrementSlots = false;

    if (registrationByPayment?.id) {
      const { data: updatedRegistration, error: updateError } = await supabase
        .from("event_registrations")
        .update({
          pricing_option_id: pricingOptionId,
          member_id: memberId || null,
          name,
          phone,
          email: email || null,
          amount_paid: amount,
          payment_status: "success",
          payment_id: paymentRecordId,
          custom_field_responses: customResponses && Object.keys(customResponses).length > 0 ? customResponses : null,
        })
        .eq("id", registrationByPayment.id)
        .select("id")
        .single();

      if (updateError || !updatedRegistration) {
        console.error("Error updating event registration by payment:", updateError);
        throw new Error("Failed to finalize registration");
      }

      registrationId = updatedRegistration.id;
      shouldIncrementSlots = registrationByPayment.payment_status !== "success";
    } else {
      const { data: existingRegistration, error: existingRegistrationError } = await supabase
        .from("event_registrations")
        .select("id, payment_status")
        .eq("event_id", eventId)
        .eq("pricing_option_id", pricingOptionId)
        .eq("phone", phone)
        .order("registered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRegistrationError) {
        console.error("Error checking existing registration:", existingRegistrationError);
        throw new Error("Failed to finalize registration");
      }

      if (existingRegistration?.id) {
        const { data: updatedRegistration, error: updateError } = await supabase
          .from("event_registrations")
          .update({
            member_id: memberId || null,
            name,
            phone,
            email: email || null,
            amount_paid: amount,
            payment_status: "success",
            payment_id: paymentRecordId,
            custom_field_responses: customResponses && Object.keys(customResponses).length > 0 ? customResponses : null,
          })
          .eq("id", existingRegistration.id)
          .select("id")
          .single();

        if (updateError || !updatedRegistration) {
          console.error("Error updating existing event registration:", updateError);
          throw new Error("Failed to finalize registration");
        }

        registrationId = updatedRegistration.id;
        shouldIncrementSlots = existingRegistration.payment_status !== "success";
      } else {
        const { data: createdRegistration, error: registrationInsertError } = await supabase
          .from("event_registrations")
          .insert({
            event_id: eventId,
            pricing_option_id: pricingOptionId,
            member_id: memberId || null,
            name,
            phone,
            email: email || null,
            amount_paid: amount,
            payment_status: "success",
            payment_id: paymentRecordId,
            custom_field_responses: customResponses && Object.keys(customResponses).length > 0 ? customResponses : null,
          })
          .select("id")
          .single();

        if (registrationInsertError || !createdRegistration) {
          console.error("Error creating event registration:", registrationInsertError);
          throw new Error("Failed to create event registration");
        }

        registrationId = createdRegistration.id;
        shouldIncrementSlots = true;
      }
    }

    if (shouldIncrementSlots) {
      const { data: pricingOption, error: pricingError } = await supabase
        .from("event_pricing_options")
        .select("slots_filled")
        .eq("id", pricingOptionId)
        .maybeSingle();

      if (pricingError) {
        console.error("Error fetching event pricing option for slot update:", pricingError);
      } else if (pricingOption) {
        const { error: slotUpdateError } = await supabase
          .from("event_pricing_options")
          .update({ slots_filled: (pricingOption.slots_filled || 0) + 1 })
          .eq("id", pricingOptionId);

        if (slotUpdateError) {
          console.error("Error updating event slots:", slotUpdateError);
        }
      }
    }

    // Send WhatsApp notification if event has whatsapp_notify_on_register enabled
    try {
      const { data: eventData } = await supabase
        .from("events")
        .select("title, whatsapp_notify_on_register, event_date, location, branch_id, branches(name)")
        .eq("id", eventId)
        .single();

      if (eventData?.whatsapp_notify_on_register) {
        const eventDate = new Date(eventData.event_date).toLocaleDateString("en-IN", {
          day: "numeric", month: "long", year: "numeric",
        });
        const eventTime = new Date(eventData.event_date).toLocaleTimeString("en-IN", {
          hour: "2-digit", minute: "2-digit",
        });
        const branchDisplayName = (eventData.branches as any)?.name || "the gym";
        const locationText = eventData.location ? `\n📍 *Venue:* ${eventData.location}` : "";

        const message =
          `🎉 *Event Registration Confirmed!*\n\n` +
          `Hi ${name}, 👋\n\n` +
          `You've been successfully registered for *${eventData.title}*!\n\n` +
          `📅 *Date:* ${eventDate}\n` +
          `🕐 *Time:* ${eventTime}${locationText}\n` +
          `💰 *Amount Paid:* ₹${amount}\n\n` +
          `We look forward to seeing you there! 🔥\n\n` +
          `— Team ${branchDisplayName}`;

        const formattedPhone = phone.length === 10 ? `91${phone}` : phone;

        const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
        const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");

        if (PERISKOPE_API_KEY && PERISKOPE_PHONE) {
          const waResponse = await fetch("https://api.periskope.app/api/v1/message/sendMessage", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${PERISKOPE_API_KEY}`,
            },
            body: JSON.stringify({
              chatId: `${formattedPhone}@s.whatsapp.net`,
              fromMe: PERISKOPE_PHONE,
              message,
            }),
          });

          console.log("WhatsApp event registration notification sent:", waResponse.status);

          // Log the notification
          await supabase.from("whatsapp_notifications").insert({
            recipient_phone: formattedPhone,
            recipient_name: name,
            notification_type: "event_registration",
            message_content: message.substring(0, 500),
            status: waResponse.ok ? "sent" : "failed",
            is_manual: false,
            branch_id: branchId,
            member_id: memberId || null,
          });
        }
      }
    } catch (waError) {
      console.error("WhatsApp notification error (non-critical):", waError);
    }

    return jsonResponse({
      success: true,
      registrationId,
      paymentId: paymentRecordId,
      razorpayPaymentId,
    });
  } catch (error) {
    console.error("Error finalizing event payment:", error);
    const message = error instanceof Error ? error.message : "Failed to finalize event payment";
    return jsonResponse({ error: message }, 500);
  }
});