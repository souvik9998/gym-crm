import { createClient } from "npm:@supabase/supabase-js@2";
import { getGymRazorpayCredentials } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to create ledger entries
async function createLedgerEntry(
  supabase: any,
  params: {
    entryType: "income" | "expense";
    category: string;
    description: string;
    amount: number;
    memberId?: string;
    dailyPassUserId?: string;
    paymentId?: string;
    trainerId?: string;
    ptSubscriptionId?: string;
    branchId?: string;
  }
) {
  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("ledger_entries").insert({
    entry_type: params.entryType,
    category: params.category,
    description: params.description,
    amount: params.amount,
    entry_date: today,
    member_id: params.memberId || null,
    daily_pass_user_id: params.dailyPassUserId || null,
    payment_id: params.paymentId || null,
    trainer_id: params.trainerId || null,
    pt_subscription_id: params.ptSubscriptionId || null,
    branch_id: params.branchId || null,
    is_auto_generated: true,
  });

  if (error) {
    console.error("Error creating ledger entry:", error);
  }
  return { error };
}

// Helper to log user activity
async function logUserActivity(
  supabase: any,
  params: {
    activityType: "registration" | "renewal" | "pt_subscription" | "pt_extension" | "daily_pass";
    description: string;
    memberId?: string;
    dailyPassUserId?: string;
    subscriptionId?: string;
    ptSubscriptionId?: string;
    paymentId?: string;
    trainerId?: string;
    amount?: number;
    paymentMode?: string;
    packageName?: string;
    durationMonths?: number;
    durationDays?: number;
    memberName?: string;
    memberPhone?: string;
    trainerName?: string;
    startDate?: string;
    endDate?: string;
    metadata?: Record<string, any>;
    branchId?: string;
  }
) {
  const { error } = await supabase.from("user_activity_logs").insert({
    activity_type: params.activityType,
    description: params.description,
    member_id: params.memberId || null,
    daily_pass_user_id: params.dailyPassUserId || null,
    subscription_id: params.subscriptionId || null,
    pt_subscription_id: params.ptSubscriptionId || null,
    payment_id: params.paymentId || null,
    trainer_id: params.trainerId || null,
    amount: params.amount || null,
    payment_mode: params.paymentMode || "online",
    package_name: params.packageName || null,
    duration_months: params.durationMonths || null,
    duration_days: params.durationDays || null,
    member_name: params.memberName || null,
    member_phone: params.memberPhone || null,
    trainer_name: params.trainerName || null,
    start_date: params.startDate || null,
    end_date: params.endDate || null,
    metadata: params.metadata || null,
    branch_id: params.branchId || null,
  });

  if (error) {
    console.error("Error logging user activity:", error);
  } else {
    console.log(`Logged user activity: ${params.activityType} - ${params.description}`);
  }
  return { error };
}

// Helper to calculate and create trainer percentage expense
async function calculateTrainerPercentageExpense(
  supabase: any,
  trainerId: string,
  ptFeeAmount: number,
  memberId?: string,
  dailyPassUserId?: string,
  ptSubscriptionId?: string,
  memberName?: string,
  branchId?: string
) {
  // Fetch trainer info
  const { data: trainer, error: trainerError } = await supabase
    .from("personal_trainers")
    .select("name, payment_category, percentage_fee")
    .eq("id", trainerId)
    .single();

  if (trainerError || !trainer) {
    console.error("Error fetching trainer for expense calculation:", trainerError);
    return;
  }

  // Only create expense if trainer is on monthly + percentage basis
  if (trainer.payment_category === "monthly_percentage" && trainer.percentage_fee > 0) {
    const percentageAmount = (ptFeeAmount * trainer.percentage_fee) / 100;
    
    if (percentageAmount > 0) {
      await createLedgerEntry(supabase, {
        entryType: "expense",
        category: "trainer_percentage",
        description: `${trainer.name} - ${trainer.percentage_fee}% of PT fee${memberName ? ` for ${memberName}` : ""}`,
        amount: percentageAmount,
        memberId,
        dailyPassUserId,
        trainerId,
        ptSubscriptionId,
        branchId,
      });
      console.log(`Created trainer percentage expense: ₹${percentageAmount} for ${trainer.name}`);
    }
  }
}

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
      isDailyPass, // New flag to indicate daily pass purchase
      memberDetails, // Contains gender, photo_id_type, photo_id_number, address
      customPackage, // Contains id, name, duration_days, price
      joiningFee, // Joining fee amount if applicable
      branchId, // Branch ID for multi-branch support
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

    console.log("Verifying payment:", { razorpay_order_id, razorpay_payment_id, memberId, isNewMember, isDailyPass, trainerId, months, customDays, ptStartDate, gymStartDate, branchId });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Resolve Razorpay key secret: per-gym first, then env fallback
    let RAZORPAY_KEY_SECRET: string | undefined;

    if (branchId) {
      const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      const gymCreds = await getGymRazorpayCredentials(serviceClient, branchId);
      if (gymCreds) {
        RAZORPAY_KEY_SECRET = gymCreds.keySecret;
        console.log("Using per-gym Razorpay secret for verification");
      }
    }

    // Fallback to global env var
    if (!RAZORPAY_KEY_SECRET) {
      RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
      if (RAZORPAY_KEY_SECRET) {
        console.log("Using global Razorpay secret for verification (fallback)");
      }
    }

    if (!RAZORPAY_KEY_SECRET) {
      throw new Error("Payment gateway not configured for this gym");
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

    // ============ DAILY PASS HANDLING ============
    if (isDailyPass) {
      console.log("Processing daily pass purchase");
      
      // Create daily pass user
      const { data: dailyPassUser, error: userError } = await supabase
        .from("daily_pass_users")
        .insert({
          name: memberName,
          phone: memberPhone,
          gender: memberDetails?.gender || null,
          photo_id_type: memberDetails?.photoIdType || null,
          photo_id_number: memberDetails?.photoIdNumber || null,
          address: memberDetails?.address || null,
          branch_id: branchId || null,
        })
        .select()
        .single();

      if (userError) {
        console.error("Error creating daily pass user:", userError);
        throw new Error("Failed to create daily pass user");
      }

      console.log("Created daily pass user:", dailyPassUser.id);

      // Calculate end date
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (customPackage?.duration_days || customDays));

      // Create daily pass subscription
      const { data: subscription, error: subError } = await supabase
        .from("daily_pass_subscriptions")
        .insert({
          daily_pass_user_id: dailyPassUser.id,
          package_id: customPackage?.id || null,
          package_name: customPackage?.name || `${customDays} Day Pass`,
          duration_days: customPackage?.duration_days || customDays,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          price: customPackage?.price || gymFee,
          personal_trainer_id: trainerId || null,
          trainer_fee: trainerFee || 0,
          status: "active",
          branch_id: branchId || null,
        })
        .select()
        .single();

      if (subError) {
        console.error("Error creating daily pass subscription:", subError);
        throw new Error("Failed to create daily pass subscription");
      }

      console.log("Created daily pass subscription:", subscription.id);

      // Determine payment type
      const paymentType = trainerId ? "gym_and_pt" : "gym_membership";

      // Record payment linked to daily pass user
      const { data: paymentData, error: paymentError } = await supabase.from("payments").insert({
        daily_pass_user_id: dailyPassUser.id,
        daily_pass_subscription_id: subscription.id,
        amount: amount,
        payment_mode: "online",
        status: "success",
        payment_type: paymentType,
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        branch_id: branchId || null,
      }).select().single();

      if (paymentError) {
        console.error("Error creating payment:", paymentError);
        throw new Error("Failed to record payment");
      }

      console.log("Daily pass payment recorded successfully");

      // ===== CREATE LEDGER ENTRIES FOR DAILY PASS =====
      const dailyPassFee = customPackage?.price || gymFee || 0;
      
      // Income: Daily pass fee
      await createLedgerEntry(supabase, {
        entryType: "income",
        category: "daily_pass",
        description: `Daily Pass - ${memberName} (${customPackage?.name || `${customDays} Day Pass`})`,
        amount: dailyPassFee,
        dailyPassUserId: dailyPassUser.id,
        paymentId: paymentData?.id,
        branchId: branchId || undefined,
      });
      console.log(`Created ledger income entry for daily pass: ₹${dailyPassFee}`);

      // If has PT, add PT income and calculate trainer expense
      if (trainerId && trainerFee > 0) {
        await createLedgerEntry(supabase, {
          entryType: "income",
          category: "pt_subscription",
          description: `PT Subscription - ${memberName} (Daily Pass)`,
          amount: trainerFee,
          dailyPassUserId: dailyPassUser.id,
          trainerId,
          paymentId: paymentData?.id,
          branchId: branchId || undefined,
        });
        console.log(`Created ledger income entry for daily pass PT: ₹${trainerFee}`);

        // Calculate trainer percentage expense
        await calculateTrainerPercentageExpense(
          supabase,
          trainerId,
          trainerFee,
          undefined,
          dailyPassUser.id,
          undefined,
          memberName,
          branchId || undefined
        );
      }

      // ===== LOG USER ACTIVITY FOR DAILY PASS =====
      await logUserActivity(supabase, {
        activityType: "daily_pass",
        description: `Daily Pass purchased - ${memberName} (${customPackage?.name || `${customDays} Day Pass`})`,
        dailyPassUserId: dailyPassUser.id,
        paymentId: paymentData?.id,
        trainerId: trainerId || undefined,
        amount,
        paymentMode: "online",
        packageName: customPackage?.name || `${customDays} Day Pass`,
        durationDays: customPackage?.duration_days || customDays,
        memberName,
        memberPhone,
        trainerName: trainerId ? undefined : undefined, // Will be fetched if needed
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        metadata: {
          hasTrainer: !!trainerId,
          trainerFee: trainerFee || 0,
          packagePrice: customPackage?.price || gymFee,
        },
        branchId: branchId || undefined,
      });

      return new Response(
        JSON.stringify({
          success: true,
          isDailyPass: true,
          dailyPassUserId: dailyPassUser.id,
          subscriptionId: subscription.id,
          endDate: endDate.toISOString().split("T")[0],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ============ REGULAR MEMBER HANDLING ============
    let finalMemberId = memberId;

    // If new member, create member record
    if (isNewMember && !memberId) {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name: memberName, phone: memberPhone, branch_id: branchId || null })
        .select()
        .single();

      if (memberError) {
        console.error("Error creating member:", memberError);
        throw new Error("Failed to create member record");
      }
      finalMemberId = member.id;
      console.log("Created new member:", finalMemberId);

      // Also create member_details if provided
      if (memberDetails) {
        const { error: detailsError } = await supabase
          .from("member_details")
          .insert({
            member_id: finalMemberId,
            gender: memberDetails.gender || null,
            photo_id_type: memberDetails.photoIdType || null,
            photo_id_number: memberDetails.photoIdNumber || null,
            address: memberDetails.address || null,
            date_of_birth: memberDetails.dateOfBirth || null,
          });

        if (detailsError) {
          console.error("Error creating member details:", detailsError);
          // Non-fatal, continue
        }
      }
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
        .select("monthly_fee, name")
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
          branch_id: branchId || null,
        })
        .select()
        .single();

      if (ptError) {
        console.error("Error creating PT subscription:", ptError);
        throw new Error("Failed to create PT subscription");
      }

      // Record payment for PT only
      const { data: paymentData, error: paymentError } = await supabase.from("payments").insert({
        member_id: finalMemberId,
        amount: amount,
        payment_mode: "online",
        status: "success",
        payment_type: "pt",
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        branch_id: branchId || null,
      }).select().single();

      if (paymentError) {
        console.error("Error creating payment:", paymentError);
        throw new Error("Failed to record payment");
      }

      console.log("PT subscription + payment recorded successfully");

      // ===== CREATE LEDGER ENTRIES FOR PT-ONLY =====
      await createLedgerEntry(supabase, {
        entryType: "income",
        category: "pt_subscription",
        description: `PT Subscription - ${memberName} with ${trainer.name}`,
        amount: totalFee,
        memberId: finalMemberId,
        trainerId,
        ptSubscriptionId: ptSub.id,
        paymentId: paymentData?.id,
        branchId: branchId || undefined,
      });
      console.log(`Created ledger income entry for PT subscription: ₹${totalFee}`);

      // Calculate trainer percentage expense
      await calculateTrainerPercentageExpense(
        supabase,
        trainerId,
        totalFee,
        finalMemberId,
        undefined,
        ptSub.id,
        memberName,
        branchId || undefined
      );

      // ===== LOG USER ACTIVITY FOR PT EXTENSION =====
      await logUserActivity(supabase, {
        activityType: "pt_extension",
        description: `PT Extended - ${memberName} with ${trainer.name} (${customDays} days)`,
        memberId: finalMemberId,
        ptSubscriptionId: ptSub.id,
        paymentId: paymentData?.id,
        trainerId,
        amount,
        paymentMode: "online",
        packageName: `PT - ${customDays} days`,
        durationDays: customDays,
        memberName,
        memberPhone,
        trainerName: trainer.name,
        startDate: ptStart.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        metadata: {
          trainerMonthlyFee: trainer.monthly_fee,
          totalFee: totalFee,
        },
        branchId: branchId || undefined,
      });

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
        branch_id: branchId || null,
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
    let trainerName: string | null = null;
    if (isGymWithPT) {
      // Fetch trainer monthly fee for recordkeeping
      const { data: trainer, error: trainerError } = await supabase
        .from("personal_trainers")
        .select("monthly_fee, name")
        .eq("id", trainerId)
        .single();

      if (trainerError || !trainer) {
        console.error("Error fetching trainer:", trainerError);
        throw new Error("Failed to verify trainer");
      }

      trainerName = trainer.name;

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
          branch_id: branchId || null,
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
    const { data: paymentData, error: paymentError } = await supabase.from("payments").insert({
      member_id: finalMemberId,
      subscription_id: subscription.id,
      amount: amount,
      payment_mode: "online",
      status: "success",
      payment_type: paymentType,
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      branch_id: branchId || null,
    }).select().single();

    if (paymentError) {
      console.error("Error creating payment:", paymentError);
      throw new Error("Failed to record payment");
    }

    console.log("Membership payment recorded successfully, type:", paymentType);

    // ===== CREATE LEDGER ENTRIES FOR GYM MEMBERSHIP =====
    const gymSubscriptionAmount = gymFee || 0;
    const actualJoiningFee = joiningFee || 0;

    // Income: Gym membership/renewal
    const incomeCategory = isNewMember ? "gym_membership" : "gym_renewal";
    const gymIncomeAmount = gymSubscriptionAmount - actualJoiningFee; // Gym fee minus joining fee
    
    if (gymIncomeAmount > 0) {
      await createLedgerEntry(supabase, {
        entryType: "income",
        category: incomeCategory,
        description: `${isNewMember ? "New Membership" : "Renewal"} - ${memberName} (${months} month${months > 1 ? "s" : ""})`,
        amount: gymIncomeAmount,
        memberId: finalMemberId,
        paymentId: paymentData?.id,
        branchId: branchId || undefined,
      });
      console.log(`Created ledger income entry for gym ${incomeCategory}: ₹${gymIncomeAmount}`);
    }

    // Income: Joining fee (if applicable for new members)
    if (actualJoiningFee > 0) {
      await createLedgerEntry(supabase, {
        entryType: "income",
        category: "joining_fee",
        description: `Joining Fee - ${memberName}`,
        amount: actualJoiningFee,
        memberId: finalMemberId,
        paymentId: paymentData?.id,
        branchId: branchId || undefined,
      });
      console.log(`Created ledger income entry for joining fee: ₹${actualJoiningFee}`);
    }

    // If has PT, add PT income and calculate trainer expense
    if (isGymWithPT && trainerId && trainerFee > 0) {
      await createLedgerEntry(supabase, {
        entryType: "income",
        category: "pt_subscription",
        description: `PT Subscription - ${memberName}${trainerName ? ` with ${trainerName}` : ""}`,
        amount: trainerFee,
        memberId: finalMemberId,
        trainerId,
        ptSubscriptionId: ptSubscriptionId || undefined,
        paymentId: paymentData?.id,
        branchId: branchId || undefined,
      });
      console.log(`Created ledger income entry for PT subscription: ₹${trainerFee}`);

      // Calculate trainer percentage expense
      await calculateTrainerPercentageExpense(
        supabase,
        trainerId,
        trainerFee,
        finalMemberId,
        undefined,
        ptSubscriptionId || undefined,
        memberName,
        branchId || undefined
      );
    }

    // ===== LOG USER ACTIVITY FOR REGISTRATION/RENEWAL =====
    const activityType = isNewMember ? "registration" : "renewal";
    const activityDescription = isNewMember
      ? `New Member Registration - ${memberName} (${months} month${months > 1 ? "s" : ""}${isGymWithPT ? " + PT" : ""})`
      : `Membership Renewed - ${memberName} (${months} month${months > 1 ? "s" : ""}${isGymWithPT ? " + PT" : ""})`;

    await logUserActivity(supabase, {
      activityType,
      description: activityDescription,
      memberId: finalMemberId,
      subscriptionId: subscription.id,
      ptSubscriptionId: ptSubscriptionId || undefined,
      paymentId: paymentData?.id,
      trainerId: trainerId || undefined,
      amount,
      paymentMode: "online",
      packageName: `${months} Month${months > 1 ? "s" : ""} Gym${isGymWithPT ? " + PT" : ""}`,
      durationMonths: months,
      durationDays: isGymWithPT ? customDays : undefined,
      memberName,
      memberPhone,
      trainerName: trainerName || undefined,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      metadata: {
        isNewMember,
        hasTrainer: isGymWithPT,
        gymFee: gymFee || 0,
        trainerFee: trainerFee || 0,
        joiningFee: joiningFee || 0,
      },
      branchId: branchId || undefined,
    });

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
