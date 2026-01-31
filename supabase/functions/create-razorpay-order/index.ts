import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      amount,
      memberId,
      memberName,
      memberPhone,
      isNewMember,
      months,
      customDays,
      trainerId,
      trainerFee,
      subscriptionId,
    } = await req.json();

    // === SERVER-SIDE INPUT VALIDATION ===
    // Validate member name
    if (!memberName || typeof memberName !== 'string' || memberName.length < 2 || memberName.length > 100) {
      throw new Error('Invalid member name: must be 2-100 characters');
    }
    if (!/^[a-zA-Z\s.'\-]+$/.test(memberName)) {
      throw new Error('Invalid member name: only letters, spaces, dots, hyphens, and apostrophes allowed');
    }

    // Validate phone number (Indian format)
    if (!memberPhone || !/^[6-9]\d{9}$/.test(memberPhone)) {
      throw new Error('Invalid phone number: must be valid 10-digit Indian mobile number');
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
      throw new Error('Invalid amount: must be positive and ≤₹1,000,000');
    }

    // Validate months if provided
    if (months !== undefined && months !== null) {
      if (typeof months !== 'number' || months < 1 || months > 24) {
        throw new Error('Invalid months: must be between 1 and 24');
      }
    }

    // Validate customDays if provided
    if (customDays !== undefined && customDays !== null) {
      if (typeof customDays !== 'number' || customDays < 1 || customDays > 365) {
        throw new Error('Invalid custom days: must be between 1 and 365');
      }
    }

    // Validate trainer fee if provided
    if (trainerFee !== undefined && trainerFee !== null) {
      if (typeof trainerFee !== 'number' || trainerFee < 0 || trainerFee > 500000) {
        throw new Error('Invalid trainer fee: must be ≥0 and ≤₹500,000');
      }
    }
    // === END VALIDATION ===

    console.log("Creating Razorpay order:", {
      amount,
      memberId,
      memberName,
      isNewMember,
      months,
      customDays,
      trainerId,
    });

    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("Razorpay credentials not configured");
      throw new Error("Payment gateway not configured");
    }

    // Create Razorpay order
    const orderData = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        member_id: memberId || "new",
        member_name: memberName,
        member_phone: memberPhone,
        is_new_member: String(isNewMember),
        months: String(months),
        custom_days: customDays ? String(customDays) : "",
        trainer_id: trainerId || "",
        trainer_fee: trainerFee ? String(trainerFee) : "",
        subscription_id: subscriptionId || "",
      },
    };

    console.log("Razorpay order data:", orderData);

    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!razorpayResponse.ok) {
      const errorText = await razorpayResponse.text();
      console.error("Razorpay error:", errorText);
      throw new Error("Failed to create payment order");
    }

    const order = await razorpayResponse.json();
    console.log("Razorpay order created:", order.id);

    return new Response(
      JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: RAZORPAY_KEY_ID,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error creating order:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create order";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
