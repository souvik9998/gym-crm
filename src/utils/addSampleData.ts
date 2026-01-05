import { supabase } from "@/integrations/supabase/client";

/**
 * Adds sample data to the database:
 * 1. An expired member
 * 2. A member expiring in 2 days
 */
export async function addSampleData() {
  try {
    // Calculate dates
    const today = new Date();
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);
    
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);

    // 1. Add expired member
    const { data: expiredMember, error: expiredMemberError } = await supabase
      .from("members")
      .insert({
        name: "Rajesh Kumar",
        phone: "9876543210",
        email: "rajesh.kumar@example.com",
        join_date: thirtyDaysAgo.toISOString().split("T")[0],
      })
      .select()
      .single();

    let expiredMemberId: string | null = null;

    if (expiredMemberError) {
      // Member might already exist, try to find by phone
      const { data: existingExpired } = await supabase
        .from("members")
        .select("id")
        .eq("phone", "9876543210")
        .maybeSingle();

      if (existingExpired) {
        expiredMemberId = existingExpired.id;
      }
    } else if (expiredMember) {
      expiredMemberId = expiredMember.id;
    }

    if (expiredMemberId) {
      // Check if subscription already exists
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("member_id", expiredMemberId)
        .eq("end_date", tenDaysAgo.toISOString().split("T")[0])
        .maybeSingle();

      if (!existingSub) {
        // Add expired subscription
        const { error: expiredSubError } = await supabase
          .from("subscriptions")
          .insert({
            member_id: expiredMemberId,
            start_date: thirtyDaysAgo.toISOString().split("T")[0],
            end_date: tenDaysAgo.toISOString().split("T")[0], // Expired 10 days ago
            plan_months: 1,
            status: "expired",
          });

        if (expiredSubError) {
          console.error("Error adding expired subscription:", expiredSubError);
        } else {
          console.log("✅ Added expired member: Rajesh Kumar");
        }
      } else {
        console.log("ℹ️ Expired subscription already exists for this member");
      }
    }

    // 2. Add member expiring in 2 days
    const { data: expiringMember, error: expiringMemberError } = await supabase
      .from("members")
      .insert({
        name: "Priya Sharma",
        phone: "9876543211",
        email: "priya.sharma@example.com",
        join_date: today.toISOString().split("T")[0],
      })
      .select()
      .single();

    let expiringMemberId: string | null = null;

    if (expiringMemberError) {
      // Member might already exist, try to find by phone
      const { data: existingExpiring } = await supabase
        .from("members")
        .select("id")
        .eq("phone", "9876543211")
        .maybeSingle();

      if (existingExpiring) {
        expiringMemberId = existingExpiring.id;
      }
    } else if (expiringMember) {
      expiringMemberId = expiringMember.id;
    }

    if (expiringMemberId) {
      const startDate = new Date(twoDaysFromNow);
      startDate.setDate(twoDaysFromNow.getDate() - 28); // Started 28 days ago
      const endDateStr = twoDaysFromNow.toISOString().split("T")[0];

      // Check if subscription already exists
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("member_id", expiringMemberId)
        .eq("end_date", endDateStr)
        .maybeSingle();

      if (!existingSub) {
        // Add expiring subscription
        const { error: expiringSubError } = await supabase
          .from("subscriptions")
          .insert({
            member_id: expiringMemberId,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDateStr, // Expires in 2 days
            plan_months: 1,
            status: "expiring_soon",
          });

        if (expiringSubError) {
          console.error("Error adding expiring subscription:", expiringSubError);
        } else {
          console.log("✅ Added member expiring in 2 days: Priya Sharma");
        }
      } else {
        console.log("ℹ️ Expiring subscription already exists for this member");
      }
    }

    // Refresh subscription statuses to ensure they're correct
    await supabase.rpc("refresh_subscription_statuses");

    return {
      success: true,
      message: "Sample data added successfully",
    };
  } catch (error: any) {
    console.error("Error adding sample data:", error);
    return {
      success: false,
      message: error.message || "Failed to add sample data",
    };
  }
}
