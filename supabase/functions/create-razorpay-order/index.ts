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
