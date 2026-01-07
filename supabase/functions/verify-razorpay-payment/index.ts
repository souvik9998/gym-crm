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
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      memberId,
      memberName,
      memberPhone,
      amount,
      months,
      customDays,
      trainerId,
      trainerFee,
      gymFee,
      ptStartDate,
      gymStartDate, // For renewals: the day after existing membership ends
      isNewMember,
    } = await req.json();

    console.log("Verifying payment:", { razorpay_order_id, razorpay_payment_id, memberId, isNewMember, trainerId, months, customDays, ptStartDate, gymStartDate });

    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!RAZORPAY_KEY_SECRET) {
      throw new Error("Payment gateway not configured");
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(RAZORPAY_KEY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSignature !== razorpay_signature) {
      console.error("Signature verification failed");
      throw new Error("Payment verification failed");
    }

    console.log("Payment signature verified successfully");

    // Initialize Supabase client with service role
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let finalMemberId = memberId;

    // If new member, create member record
    if (isNewMember && !memberId) {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name: memberName, phone: memberPhone })
        .select()
        .single();

      if (memberError) {
        console.error("Error creating member:", memberError);
        throw new Error("Failed to create member record");
      }
      finalMemberId = member.id;
      console.log("Created new member:", finalMemberId);
    }

    // Determine gym start date: for renewals, use gymStartDate (day after existing end); otherwise today
    const startDate = gymStartDate ? new Date(gymStartDate) : new Date();
    startDate.setHours(0, 0, 0, 0);

    // Determine if this is PT-only (extension) or includes gym membership
    const isPTOnlyPurchase = trainerId && customDays && customDays > 0 && (!months || months === 0);
    const isGymWithPT = trainerId && customDays && customDays > 0 && months && months > 0;
    const isGymOnly = (!trainerId || !customDays) && months && months > 0;

    console.log("Payment type:", { isPTOnlyPurchase, isGymWithPT, isGymOnly });

    // ---- PT-only purchase/extension (no gym membership) ----
    if (isPTOnlyPurchase) {
      // Fetch trainer monthly fee for recordkeeping
      const { data: trainer, error: trainerError } = await supabase
        .from("personal_trainers")
        .select("monthly_fee")
        .eq("id", trainerId)
        .single();

      if (trainerError || !trainer) {
        console.error("Error fetching trainer:", trainerError);
        throw new Error("Failed to verify trainer");
      }

      // Use provided ptStartDate or default to today
      const ptStart = ptStartDate ? new Date(ptStartDate) : startDate;
      const endDate = new Date(ptStart);
      endDate.setDate(endDate.getDate() + customDays);

      const totalFee = typeof trainerFee === "number" ? trainerFee : amount;

      const { data: ptSub, error: ptError } = await supabase
        .from("pt_subscriptions")
        .insert({
          member_id: finalMemberId,
          personal_trainer_id: trainerId,
          start_date: ptStart.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          monthly_fee: trainer.monthly_fee,
          total_fee: totalFee,
          status: "active",
        })
        .select()
        .single();

      if (ptError) {
        console.error("Error creating PT subscription:", ptError);
        throw new Error("Failed to create PT subscription");
      }

      // Record payment for PT only
      const { error: paymentError } = await supabase.from("payments").insert({
        member_id: finalMemberId,
        amount: amount,
        payment_mode: "online",
        status: "success",
        payment_type: "pt",
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
      });

      if (paymentError) {
        console.error("Error creating payment:", paymentError);
        throw new Error("Failed to record payment");
      }

      console.log("PT subscription + payment recorded successfully");

      return new Response(
        JSON.stringify({
          success: true,
          memberId: finalMemberId,
          subscriptionId: ptSub.id,
          endDate: endDate.toISOString().split("T")[0],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ---- Gym membership with optional PT ----
    if (!months || months <= 0) {
      console.error("Invalid months for membership payment", { months, trainerId, customDays });
      throw new Error("Invalid membership duration");
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    // Create gym subscription
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .insert({
        member_id: finalMemberId,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        plan_months: months,
        status: "active",
      })
      .select()
      .single();

    if (subError) {
      console.error("Error creating subscription:", subError);
      throw new Error("Failed to create subscription");
    }

    console.log("Created subscription:", subscription.id);

    // If also has PT (Gym + PT), create PT subscription
    let ptSubscriptionId: string | null = null;
    if (isGymWithPT) {
      // Fetch trainer monthly fee for recordkeeping
      const { data: trainer, error: trainerError } = await supabase
        .from("personal_trainers")
        .select("monthly_fee")
        .eq("id", trainerId)
        .single();

      if (trainerError || !trainer) {
        console.error("Error fetching trainer:", trainerError);
        throw new Error("Failed to verify trainer");
      }

      // Use provided ptStartDate or default to gym start date
      const ptStart = ptStartDate ? new Date(ptStartDate) : startDate;
      ptStart.setHours(0, 0, 0, 0);
      
      const ptEndDate = new Date(ptStart);
      ptEndDate.setDate(ptEndDate.getDate() + customDays);

      const totalPTFee = typeof trainerFee === "number" ? trainerFee : 0;

      console.log("Creating PT subscription:", { ptStart: ptStart.toISOString().split("T")[0], ptEndDate: ptEndDate.toISOString().split("T")[0], customDays });

      const { data: ptSub, error: ptError } = await supabase
        .from("pt_subscriptions")
        .insert({
          member_id: finalMemberId,
          personal_trainer_id: trainerId,
          start_date: ptStart.toISOString().split("T")[0],
          end_date: ptEndDate.toISOString().split("T")[0],
          monthly_fee: trainer.monthly_fee,
          total_fee: totalPTFee,
          status: "active",
        })
        .select()
        .single();

      if (ptError) {
        console.error("Error creating PT subscription:", ptError);
        throw new Error("Failed to create PT subscription");
      }

      ptSubscriptionId = ptSub.id;
      console.log("Created PT subscription:", ptSubscriptionId);
    }

    // Determine payment type
    const paymentType = isGymWithPT ? "gym_and_pt" : "membership";

    // Record payment
    const { error: paymentError } = await supabase.from("payments").insert({
      member_id: finalMemberId,
      subscription_id: subscription.id,
      amount: amount,
      payment_mode: "online",
      status: "success",
      payment_type: paymentType,
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
    });

    if (paymentError) {
      console.error("Error creating payment:", paymentError);
      throw new Error("Failed to record payment");
    }

    console.log("Membership payment recorded successfully, type:", paymentType);

    return new Response(
      JSON.stringify({
        success: true,
        memberId: finalMemberId,
        subscriptionId: subscription.id,
        ptSubscriptionId: ptSubscriptionId,
        endDate: endDate.toISOString().split("T")[0],
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error verifying payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Payment verification failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
