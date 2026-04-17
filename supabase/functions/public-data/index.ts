/**
 * Public Data Edge Function
 * 
 * Serves ONLY the minimum safe data required for public registration flows.
 * No authentication required, but data is strictly limited and read-only.
 * 
 * Endpoints:
 * - GET ?action=packages&branchId=xxx - Get active packages (supports slug or UUID)
 * - GET ?action=trainers&branchId=xxx - Get active trainers (supports slug or UUID)
 * - GET ?action=branch&branchId=xxx - Get branch info + public registration settings (supports slug or UUID)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(value: string | null): value is string {
  return !!value && UUID_REGEX.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = enforceRateLimit(req, "public-data", 30, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const branchRef = url.searchParams.get("branchId") || url.searchParams.get("branch") || url.searchParams.get("identifier");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const resolveBranch = async (identifier: string) => {
      const column = isUUID(identifier) ? "id" : "slug";
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, logo_url, slug")
        .eq(column, identifier)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        console.error("Error resolving branch:", error);
        throw new Error("Failed to resolve branch");
      }

      return data;
    };

    const getBranchSettings = async (branchId: string) => {
      const { data, error } = await supabase
        .from("gym_settings")
        .select("invoice_tax_rate, invoice_show_gst, gym_gst, registration_field_settings")
        .eq("branch_id", branchId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching gym settings:", error);
        throw new Error("Failed to fetch branch settings");
      }

      const registrationFieldSettings = data?.registration_field_settings && typeof data.registration_field_settings === "object"
        ? data.registration_field_settings
        : {};

      return {
        taxRate: data?.invoice_tax_rate || 0,
        taxEnabled: data?.invoice_show_gst === true && (data?.invoice_tax_rate || 0) > 0,
        gymGst: data?.gym_gst || "",
        registrationFieldSettings,
        allowSelfSelectTrainer: registrationFieldSettings?.self_select_trainer?.enabled !== false,
        allowDailyPass: registrationFieldSettings?.daily_pass_enabled?.enabled !== false,
      };
    };

    const resolvedBranch = branchRef ? await resolveBranch(branchRef).catch(() => null) : null;
    const resolvedBranchId = resolvedBranch?.id || (isUUID(branchRef) ? branchRef : null);

    switch (action) {
      case "bootstrap": {
        // Unified endpoint for registration flow — returns branch + packages + trainers + settings
        // in ONE round trip instead of 3 separate calls. Used by PackageSelectionForm and Register.
        if (!branchRef || !resolvedBranch) {
          return new Response(
            JSON.stringify({ error: "Branch not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }

        const branchId = resolvedBranch.id;

        const [monthlyRes, customRes, trainersRes, settings] = await Promise.all([
          supabase
            .from("monthly_packages")
            .select("id, months, price, joining_fee")
            .eq("is_active", true)
            .eq("branch_id", branchId)
            .order("months"),
          supabase
            .from("custom_packages")
            .select("id, name, duration_days, price")
            .eq("is_active", true)
            .eq("branch_id", branchId)
            .order("duration_days"),
          supabase
            .from("personal_trainers")
            .select("id, name, monthly_fee")
            .eq("is_active", true)
            .eq("branch_id", branchId),
          getBranchSettings(branchId),
        ]);

        if (monthlyRes.error || customRes.error || trainersRes.error) {
          console.error("Bootstrap query error:", monthlyRes.error || customRes.error || trainersRes.error);
          throw new Error("Failed to fetch registration data");
        }

        return new Response(
          JSON.stringify({
            branch: {
              id: branchId,
              name: resolvedBranch.name,
              logo_url: resolvedBranch.logo_url,
              slug: resolvedBranch.slug,
              registrationFieldSettings: settings.registrationFieldSettings,
              allowSelfSelectTrainer: settings.allowSelfSelectTrainer,
              allowDailyPass: settings.allowDailyPass,
            },
            monthlyPackages: monthlyRes.data || [],
            customPackages: customRes.data || [],
            trainers: trainersRes.data || [],
            taxSettings: {
              taxRate: settings.taxRate,
              taxEnabled: settings.taxEnabled,
              gymGst: settings.gymGst,
            },
            allowSelfSelectTrainer: settings.allowSelfSelectTrainer,
            allowDailyPass: settings.allowDailyPass,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "packages": {
        if (!resolvedBranchId) {
          return new Response(
            JSON.stringify({ error: "Valid branch identifier required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const { data: monthlyPackages, error: monthlyError } = await supabase
          .from("monthly_packages")
          .select("id, months, price, joining_fee")
          .eq("is_active", true)
          .eq("branch_id", resolvedBranchId)
          .order("months");

        if (monthlyError) {
          console.error("Error fetching monthly packages:", monthlyError);
          throw new Error("Failed to fetch packages");
        }

        const { data: customPackages, error: customError } = await supabase
          .from("custom_packages")
          .select("id, name, duration_days, price")
          .eq("is_active", true)
          .eq("branch_id", resolvedBranchId)
          .order("duration_days");

        if (customError) {
          console.error("Error fetching custom packages:", customError);
          throw new Error("Failed to fetch packages");
        }

        const settings = await getBranchSettings(resolvedBranchId);

        return new Response(
          JSON.stringify({
            monthlyPackages: monthlyPackages || [],
            customPackages: customPackages || [],
            taxSettings: {
              taxRate: settings.taxRate,
              taxEnabled: settings.taxEnabled,
              gymGst: settings.gymGst,
            },
            allowSelfSelectTrainer: settings.allowSelfSelectTrainer,
            allowDailyPass: settings.allowDailyPass,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tax-settings": {
        if (!resolvedBranchId) {
          return new Response(
            JSON.stringify({ taxSettings: { taxRate: 0, taxEnabled: false, gymGst: "" } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const settings = await getBranchSettings(resolvedBranchId);

        return new Response(
          JSON.stringify({
            taxSettings: {
              taxRate: settings.taxRate,
              taxEnabled: settings.taxEnabled,
              gymGst: settings.gymGst,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "trainers": {
        if (!resolvedBranchId) {
          return new Response(
            JSON.stringify({ error: "Valid branch identifier required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        const { data: trainers, error: trainersError } = await supabase
          .from("personal_trainers")
          .select("id, name, monthly_fee")
          .eq("is_active", true)
          .eq("branch_id", resolvedBranchId);

        if (trainersError) {
          console.error("Error fetching trainers:", trainersError);
          throw new Error("Failed to fetch trainers");
        }

        const safeTrainers = (trainers || []).map((t) => ({
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
        if (!branchRef || !resolvedBranch) {
          return new Response(
            JSON.stringify({ error: "Branch not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }

        const settings = await getBranchSettings(resolvedBranch.id);

        return new Response(
          JSON.stringify({
            branch: {
              id: resolvedBranch.id,
              name: resolvedBranch.name,
              logo_url: resolvedBranch.logo_url,
              slug: resolvedBranch.slug,
              registrationFieldSettings: settings.registrationFieldSettings,
              allowSelfSelectTrainer: settings.allowSelfSelectTrainer,
              allowDailyPass: settings.allowDailyPass,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "default-branch": {
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .select("id, name, logo_url, slug")
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
          JSON.stringify({ branch: { id: branch.id, name: branch.name, logo_url: branch.logo_url, slug: branch.slug } }),
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