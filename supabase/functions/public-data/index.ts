/**
 * Public Data Edge Function
 * 
 * Serves ONLY the minimum safe data required for public registration flows.
 * No authentication required, but data is strictly limited and read-only.
 * 
 * Endpoints:
 * - GET ?action=packages&branchId=xxx - Get active packages (name, price, duration only)
 * - GET ?action=trainers&branchId=xxx - Get active trainers (name only, no phone/specialization)
 * - GET ?action=branch&branchId=xxx - Get branch info (name only)
 */

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

  // Only allow GET requests for public data
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const branchId = url.searchParams.get("branchId");

    // Validate branchId format if provided (UUID format)
    if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
      return new Response(
        JSON.stringify({ error: "Invalid branch ID format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      case "packages": {
        // Get monthly packages - only safe fields
        let monthlyQuery = supabase
          .from("monthly_packages")
          .select("id, months, price, joining_fee")
          .eq("is_active", true);

        if (branchId) {
          monthlyQuery = monthlyQuery.eq("branch_id", branchId);
        }

        const { data: monthlyPackages, error: monthlyError } = await monthlyQuery.order("months");

        if (monthlyError) {
          console.error("Error fetching monthly packages:", monthlyError);
          throw new Error("Failed to fetch packages");
        }

        // Get custom packages - only safe fields
        let customQuery = supabase
          .from("custom_packages")
          .select("id, name, duration_days, price")
          .eq("is_active", true);

        if (branchId) {
          customQuery = customQuery.eq("branch_id", branchId);
        }

        const { data: customPackages, error: customError } = await customQuery.order("duration_days");

        if (customError) {
          console.error("Error fetching custom packages:", customError);
          throw new Error("Failed to fetch packages");
        }

        return new Response(
          JSON.stringify({
            monthlyPackages: monthlyPackages || [],
            customPackages: customPackages || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "trainers": {
        // Get trainers - ONLY name, id, and monthly_fee for public registration
        // NO phone, specialization, or other sensitive info
        let trainersQuery = supabase
          .from("personal_trainers")
          .select("id, name, monthly_fee")
          .eq("is_active", true);

        if (branchId) {
          trainersQuery = trainersQuery.eq("branch_id", branchId);
        }

        const { data: trainers, error: trainersError } = await trainersQuery;

        if (trainersError) {
          console.error("Error fetching trainers:", trainersError);
          throw new Error("Failed to fetch trainers");
        }

        // Return sanitized trainer data
        const safeTrainers = (trainers || []).map(t => ({
          id: t.id,
          name: t.name,
          monthly_fee: t.monthly_fee,
        }));

        return new Response(
          JSON.stringify({ trainers: safeTrainers }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "branch": {
        if (!branchId) {
          return new Response(
            JSON.stringify({ error: "Branch ID required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Get branch info - ONLY name for public display
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .select("id, name, logo_url")
          .eq("id", branchId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();

        if (branchError) {
          console.error("Error fetching branch:", branchError);
          throw new Error("Failed to fetch branch info");
        }

        if (!branch) {
          return new Response(
            JSON.stringify({ error: "Branch not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }

        return new Response(
          JSON.stringify({ branch: { id: branch.id, name: branch.name, logo_url: branch.logo_url } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "default-branch": {
        // Get the default branch for redirects
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .select("id, name, logo_url")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (branchError) {
          console.error("Error fetching default branch:", branchError);
          throw new Error("Failed to fetch default branch");
        }

        if (!branch) {
          return new Response(
            JSON.stringify({ error: "No active branch found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }

        return new Response(
          JSON.stringify({ branch: { id: branch.id, name: branch.name, logo_url: branch.logo_url } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
  } catch (error) {
    console.error("Public data error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
