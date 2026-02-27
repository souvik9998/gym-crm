/**
 * Public Data Edge Function
 * 
 * Serves ONLY the minimum safe data required for public registration flows.
 * No authentication required, but data is strictly limited and read-only.
 * 
 * Endpoints:
 * - GET ?action=packages&branchId=xxx - Get active packages
 * - GET ?action=trainers&branchId=xxx - Get active trainers
 * - GET ?action=branch&branchId=xxx - Get branch info
 * - GET ?action=default-branch - Get default branch
 * - GET ?action=check-phone&phone=xxx&branchId=xxx - Check if phone exists
 * - GET ?action=subscription-info&memberId=xxx - Get member subscription info
 * - GET ?action=member-subscriptions&memberId=xxx - Get active subscriptions and PT subscriptions
 * - GET ?action=gym-settings&branchId=xxx - Get WhatsApp auto-send settings
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_REGEX = /^[6-9][0-9]{9}$/;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const branchId = url.searchParams.get("branchId");

    if (branchId && !UUID_REGEX.test(branchId)) {
      return jsonResponse({ error: "Invalid branch ID format" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      case "packages": {
        let monthlyQuery = supabase
          .from("monthly_packages")
          .select("id, months, price, joining_fee")
          .eq("is_active", true);
        if (branchId) monthlyQuery = monthlyQuery.eq("branch_id", branchId);
        const { data: monthlyPackages, error: monthlyError } = await monthlyQuery.order("months");
        if (monthlyError) throw new Error("Failed to fetch packages");

        let customQuery = supabase
          .from("custom_packages")
          .select("id, name, duration_days, price")
          .eq("is_active", true);
        if (branchId) customQuery = customQuery.eq("branch_id", branchId);
        const { data: customPackages, error: customError } = await customQuery.order("duration_days");
        if (customError) throw new Error("Failed to fetch packages");

        return jsonResponse({
          monthlyPackages: monthlyPackages || [],
          customPackages: customPackages || [],
        });
      }

      case "trainers": {
        let trainersQuery = supabase
          .from("personal_trainers")
          .select("id, name, monthly_fee")
          .eq("is_active", true);
        if (branchId) trainersQuery = trainersQuery.eq("branch_id", branchId);
        const { data: trainers, error: trainersError } = await trainersQuery;
        if (trainersError) throw new Error("Failed to fetch trainers");

        const safeTrainers = (trainers || []).map(t => ({
          id: t.id,
          name: t.name,
          monthly_fee: t.monthly_fee,
        }));

        return jsonResponse({ trainers: safeTrainers });
      }

      case "branch": {
        if (!branchId) {
          return jsonResponse({ error: "Branch ID required" }, 400);
        }

        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .select("id, name")
          .eq("id", branchId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (branchError) throw new Error("Failed to fetch branch info");
        if (!branch) return jsonResponse({ error: "Branch not found" }, 404);

        return jsonResponse({ branch: { id: branch.id, name: branch.name } });
      }

      case "default-branch": {
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .select("id, name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (branchError) throw new Error("Failed to fetch default branch");
        if (!branch) return jsonResponse({ error: "No active branch found" }, 404);

        return jsonResponse({ branch: { id: branch.id, name: branch.name } });
      }

      case "check-phone": {
        const phone = url.searchParams.get("phone");
        if (!phone || !PHONE_REGEX.test(phone)) {
          return jsonResponse({ error: "Invalid phone number" }, 400);
        }

        const { data, error } = await supabase.rpc("check_phone_exists", {
          phone_number: phone,
          p_branch_id: branchId || null,
        });

        if (error) {
          console.error("check_phone_exists error:", error);
          throw new Error("Failed to check phone");
        }

        return jsonResponse({ result: data?.[0] || { member_exists: false } });
      }

      case "subscription-info": {
        const memberId = url.searchParams.get("memberId");
        if (!memberId || !UUID_REGEX.test(memberId)) {
          return jsonResponse({ error: "Invalid member ID" }, 400);
        }

        const { data, error } = await supabase.rpc("get_member_subscription_info", {
          p_member_id: memberId,
        });

        if (error) {
          console.error("get_member_subscription_info error:", error);
          throw new Error("Failed to fetch subscription info");
        }

        return jsonResponse({ subscription: data?.[0] || null });
      }

      case "member-subscriptions": {
        const memberId = url.searchParams.get("memberId");
        if (!memberId || !UUID_REGEX.test(memberId)) {
          return jsonResponse({ error: "Invalid member ID" }, 400);
        }

        const today = new Date().toISOString().split("T")[0];

        // Fetch active gym subscription
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("end_date")
          .eq("member_id", memberId)
          .eq("status", "active")
          .gte("end_date", today)
          .order("end_date", { ascending: false })
          .limit(1);

        // Fetch active PT subscription
        const { data: ptSubs } = await supabase
          .from("pt_subscriptions")
          .select("end_date")
          .eq("member_id", memberId)
          .gte("end_date", today)
          .order("end_date", { ascending: false })
          .limit(1);

        return jsonResponse({
          gymSubscription: subs?.[0] || null,
          ptSubscription: ptSubs?.[0] || null,
        });
      }

      case "gym-settings": {
        if (!branchId) {
          return jsonResponse({ error: "Branch ID required" }, 400);
        }

        const { data: settings } = await supabase
          .from("gym_settings")
          .select("whatsapp_auto_send")
          .eq("branch_id", branchId)
          .limit(1)
          .maybeSingle();

        return jsonResponse({
          whatsapp_auto_send: settings?.whatsapp_auto_send || null,
        });
      }

      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (error) {
    console.error("Public data error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
