import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, errorResponse, successResponse, handleCorsRequest } from "../_shared/auth.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsRequest();

  const rateLimited = enforceRateLimit(req, "biometric-sync", 60, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "sync";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    switch (action) {
      case "sync":
        return await handleSync(req, serviceClient);
      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err: any) {
    console.error("Biometric sync error:", err);
    return errorResponse(err.message || "Internal error", 500);
  }
});

interface PunchLog {
  biometric_user_id: string;
  timestamp: string;
  biometric_user_name?: string;
  punch_type?: "in" | "out";
}

async function handleSync(req: Request, serviceClient: any) {
  if (req.method !== "POST") return errorResponse("POST required", 405);

  const bodyText = await req.text();
  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { device_serial, branch_id, api_key, punch_logs } = body as {
    device_serial?: string;
    branch_id?: string;
    api_key?: string;
    punch_logs?: PunchLog[];
  };

  if (!device_serial || !branch_id || !api_key) {
    return errorResponse("device_serial, branch_id, and api_key are required", 400);
  }
  if (!punch_logs || !Array.isArray(punch_logs) || punch_logs.length === 0) {
    return errorResponse("punch_logs array is required and must not be empty", 400);
  }
  if (punch_logs.length > 500) {
    return errorResponse("Maximum 500 logs per sync request", 400);
  }

  // Validate device
  const { data: device, error: deviceErr } = await serviceClient
    .from("biometric_devices")
    .select("id, branch_id, is_sync_enabled, is_active")
    .eq("device_serial", device_serial)
    .eq("branch_id", branch_id)
    .eq("api_key", api_key)
    .maybeSingle();

  if (deviceErr || !device) {
    return errorResponse("Invalid device credentials", 403);
  }
  if (!device.is_active || !device.is_sync_enabled) {
    return errorResponse("Device sync is disabled", 403);
  }

  let processed = 0;
  let duplicated = 0;
  let unmapped = 0;

  for (const log of punch_logs) {
    if (!log.biometric_user_id || !log.timestamp) {
      continue;
    }

    const punchTime = new Date(log.timestamp);
    if (isNaN(punchTime.getTime())) continue;

    const punchDate = punchTime.toISOString().split("T")[0];

    // Check duplicate: same biometric_user_id + same timestamp (within 1 minute)
    const minBefore = new Date(punchTime.getTime() - 60000).toISOString();
    const minAfter = new Date(punchTime.getTime() + 60000).toISOString();

    const { data: existing } = await serviceClient
      .from("attendance_logs")
      .select("id")
      .eq("branch_id", branch_id)
      .eq("device_fingerprint", `bio_${device_serial}_${log.biometric_user_id}`)
      .gte("check_in_at", minBefore)
      .lte("check_in_at", minAfter)
      .limit(1);

    if (existing && existing.length > 0) {
      duplicated++;
      continue;
    }

    // Ensure biometric user mapping exists
    const { data: mapping } = await serviceClient
      .from("biometric_member_mappings")
      .select("id, member_id, is_mapped")
      .eq("branch_id", branch_id)
      .eq("biometric_user_id", log.biometric_user_id)
      .maybeSingle();

    let memberId: string | null = null;

    if (!mapping) {
      // Create unmapped entry
      await serviceClient.from("biometric_member_mappings").insert({
        branch_id,
        biometric_user_id: log.biometric_user_id,
        biometric_user_name: log.biometric_user_name || null,
        is_mapped: false,
      });
      unmapped++;
    } else if (mapping.is_mapped && mapping.member_id) {
      memberId = mapping.member_id;
    } else {
      unmapped++;
    }

    // Get subscription status if member is mapped
    let subscriptionStatus = "unknown";
    if (memberId) {
      const { data: sub } = await serviceClient
        .from("subscriptions")
        .select("status, end_date")
        .eq("member_id", memberId)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) subscriptionStatus = "no_subscription";
      else if (sub.status === "expired" || sub.status === "inactive" || new Date(sub.end_date) < new Date(punchDate)) subscriptionStatus = "expired";
      else if (sub.status === "expiring_soon") subscriptionStatus = "expiring_soon";
      else subscriptionStatus = "active";
    }

    // Determine check-in vs check-out
    const deviceFp = `bio_${device_serial}_${log.biometric_user_id}`;

    if (log.punch_type === "out" && memberId) {
      // Try to find open check-in for today
      const { data: openLog } = await serviceClient
        .from("attendance_logs")
        .select("id, check_in_at")
        .eq("branch_id", branch_id)
        .eq("member_id", memberId)
        .eq("date", punchDate)
        .eq("status", "checked_in")
        .order("check_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openLog) {
        const checkInTime = new Date(openLog.check_in_at);
        const totalHours = Math.round(((punchTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
        await serviceClient.from("attendance_logs").update({
          check_out_at: punchTime.toISOString(),
          total_hours: totalHours,
          status: "checked_out",
        }).eq("id", openLog.id);
        processed++;
        continue;
      }
    }

    // Insert as check-in
    await serviceClient.from("attendance_logs").insert({
      branch_id,
      user_type: "member",
      member_id: memberId,
      staff_id: null,
      check_in_at: punchTime.toISOString(),
      date: punchDate,
      device_fingerprint: deviceFp,
      status: memberId ? "checked_in" : "checked_in",
      subscription_status: memberId ? subscriptionStatus : null,
    });
    processed++;
  }

  // Update device stats
  await serviceClient.from("biometric_devices").update({
    last_sync_at: new Date().toISOString(),
    total_logs_received: device.total_logs_received + punch_logs.length,
  }).eq("id", device.id);

  // Log sync
  await serviceClient.from("biometric_sync_logs").insert({
    device_id: device.id,
    branch_id,
    sync_status: "success",
    logs_received: punch_logs.length,
    logs_processed: processed,
    logs_duplicated: duplicated,
    logs_unmapped: unmapped,
  });

  return successResponse({
    status: "success",
    received: punch_logs.length,
    processed,
    duplicated,
    unmapped,
  });
}
