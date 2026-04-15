import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, errorResponse, successResponse, handleCorsRequest, validateAuth } from "../_shared/auth.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

// ─── Helper: Check if a tenant feature is enabled for a branch ───
async function isTenantFeatureEnabled(serviceClient: any, branchId: string, featureKey: string): Promise<boolean> {
  const { data: branch } = await serviceClient
    .from("branches")
    .select("tenant_id")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch?.tenant_id) return true;

  const { data: limits } = await serviceClient
    .from("tenant_limits")
    .select("features")
    .eq("tenant_id", branch.tenant_id)
    .maybeSingle();

  if (!limits?.features) return true;
  const features = limits.features as Record<string, boolean>;
  return features[featureKey] !== false;
}

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

    // For enroll action, check biometric permission using branch_id from body
    if (action === "enroll") {
      // We'll check inside handleEnroll since body isn't parsed yet
    }

    switch (action) {
      case "sync":
        return await handleSync(req, serviceClient);
      case "enroll":
        return await handleEnroll(req, serviceClient);
      case "poll-enrollments":
        return await handlePollEnrollments(req, serviceClient);
      case "complete-enrollment":
        return await handleCompleteEnrollment(req, serviceClient);
      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err: any) {
    console.error("Biometric sync error:", err);
    return errorResponse(err.message || "Internal error", 500);
  }
});

// ─── Types ───

interface PunchLog {
  biometric_user_id: string;
  timestamp: string;
  biometric_user_name?: string;
  punch_type?: "in" | "out";
}

// ─── Enroll: Create enrollment request (authenticated admin) ───

async function handleEnroll(req: Request, serviceClient: any) {
  if (req.method !== "POST") return errorResponse("POST required", 405);

  const authHeader = req.headers.get("Authorization");
  const auth = await validateAuth(authHeader);
  if (!auth.valid || (!auth.isAdmin && !auth.isStaff)) {
    return errorResponse("Authentication required", 401);
  }

  const bodyText = await req.text();
  let body: any;
  try { body = JSON.parse(bodyText); } catch { return errorResponse("Invalid JSON", 400); }

  const { branch_id, member_id, device_id, enrollment_type } = body as {
    branch_id?: string;
    member_id?: string;
    device_id?: string;
    enrollment_type?: string;
  };

  if (!branch_id || !member_id || !device_id) {
    return errorResponse("branch_id, member_id, and device_id are required", 400);
  }

  const validTypes = ["fingerprint", "rfid", "face"];
  const type = validTypes.includes(enrollment_type || "") ? enrollment_type : "fingerprint";

  // Validate device exists and belongs to branch
  const { data: device, error: deviceErr } = await serviceClient
    .from("biometric_devices")
    .select("id, is_active")
    .eq("id", device_id)
    .eq("branch_id", branch_id)
    .eq("is_active", true)
    .maybeSingle();

  if (deviceErr || !device) {
    return errorResponse("Device not found or inactive", 404);
  }

  // Validate member exists and belongs to branch
  const { data: member, error: memberErr } = await serviceClient
    .from("members")
    .select("id")
    .eq("id", member_id)
    .eq("branch_id", branch_id)
    .maybeSingle();

  if (memberErr || !member) {
    return errorResponse("Member not found in this branch", 404);
  }

  // Cancel any existing pending enrollments for this member
  await serviceClient
    .from("biometric_enrollment_requests")
    .update({ status: "timeout", updated_at: new Date().toISOString() })
    .eq("member_id", member_id)
    .in("status", ["pending", "in_progress"]);

  // Create enrollment request
  const { data: enrollment, error: enrollErr } = await serviceClient
    .from("biometric_enrollment_requests")
    .insert({
      branch_id,
      member_id,
      device_id,
      enrollment_type: type,
      status: "pending",
      requested_by: auth.userId,
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (enrollErr) {
    console.error("Enrollment insert error:", enrollErr);
    return errorResponse("Failed to create enrollment request", 500);
  }

  return successResponse({ status: "pending", enrollment_id: enrollment.id });
}

// ─── Poll Enrollments: Agent fetches pending requests (api_key auth) ───

async function handlePollEnrollments(req: Request, serviceClient: any) {
  if (req.method !== "GET" && req.method !== "POST") return errorResponse("GET or POST required", 405);

  let device_serial: string | null = null;
  let branch_id: string | null = null;
  let api_key: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    device_serial = url.searchParams.get("device_serial");
    branch_id = url.searchParams.get("branch_id");
    api_key = url.searchParams.get("api_key");
  } else {
    const bodyText = await req.text();
    try {
      const body = JSON.parse(bodyText);
      device_serial = body.device_serial;
      branch_id = body.branch_id;
      api_key = body.api_key;
    } catch { return errorResponse("Invalid JSON", 400); }
  }

  if (!device_serial || !branch_id || !api_key) {
    return errorResponse("device_serial, branch_id, and api_key are required", 400);
  }

  // Validate device credentials
  const { data: device, error: deviceErr } = await serviceClient
    .from("biometric_devices")
    .select("id, is_active")
    .eq("device_serial", device_serial)
    .eq("branch_id", branch_id)
    .eq("api_key", api_key)
    .maybeSingle();

  if (deviceErr || !device) {
    return errorResponse("Invalid device credentials", 403);
  }
  if (!device.is_active) {
    return errorResponse("Device is inactive", 403);
  }

  // Timeout expired requests
  await serviceClient
    .from("biometric_enrollment_requests")
    .update({ status: "timeout", updated_at: new Date().toISOString() })
    .eq("device_id", device.id)
    .in("status", ["pending", "in_progress"])
    .lt("expires_at", new Date().toISOString());

  // Get pending enrollment requests for this device
  const { data: enrollments, error: enrollErr } = await serviceClient
    .from("biometric_enrollment_requests")
    .select("id, member_id, enrollment_type, status, created_at, members(name, phone)")
    .eq("device_id", device.id)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: true });

  if (enrollErr) {
    return errorResponse("Failed to fetch enrollments", 500);
  }

  // Mark pending as in_progress
  for (const e of (enrollments || [])) {
    if (e.status === "pending") {
      await serviceClient
        .from("biometric_enrollment_requests")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", e.id);
    }
  }

  return successResponse({ enrollments: enrollments || [] });
}

// ─── Complete Enrollment: Agent sends back biometric_user_id ───

async function handleCompleteEnrollment(req: Request, serviceClient: any) {
  if (req.method !== "POST") return errorResponse("POST required", 405);

  const bodyText = await req.text();
  let body: any;
  try { body = JSON.parse(bodyText); } catch { return errorResponse("Invalid JSON", 400); }

  const { device_serial, branch_id, api_key, enrollment_id, biometric_user_id, success, error_message } = body as {
    device_serial?: string;
    branch_id?: string;
    api_key?: string;
    enrollment_id?: string;
    biometric_user_id?: string;
    success?: boolean;
    error_message?: string;
  };

  if (!device_serial || !branch_id || !api_key || !enrollment_id) {
    return errorResponse("device_serial, branch_id, api_key, and enrollment_id are required", 400);
  }

  // Validate device credentials
  const { data: device, error: deviceErr } = await serviceClient
    .from("biometric_devices")
    .select("id")
    .eq("device_serial", device_serial)
    .eq("branch_id", branch_id)
    .eq("api_key", api_key)
    .maybeSingle();

  if (deviceErr || !device) {
    return errorResponse("Invalid device credentials", 403);
  }

  // Get the enrollment request
  const { data: enrollment, error: enrollErr } = await serviceClient
    .from("biometric_enrollment_requests")
    .select("id, member_id, branch_id, status")
    .eq("id", enrollment_id)
    .eq("device_id", device.id)
    .maybeSingle();

  if (enrollErr || !enrollment) {
    return errorResponse("Enrollment request not found", 404);
  }

  if (enrollment.status !== "pending" && enrollment.status !== "in_progress") {
    return errorResponse(`Enrollment already ${enrollment.status}`, 400);
  }

  if (success && biometric_user_id) {
    // Check for duplicate biometric_user_id in this branch
    const { data: existingMapping } = await serviceClient
      .from("biometric_member_mappings")
      .select("id, member_id")
      .eq("branch_id", enrollment.branch_id)
      .eq("biometric_user_id", biometric_user_id)
      .maybeSingle();

    if (existingMapping && existingMapping.member_id && existingMapping.member_id !== enrollment.member_id) {
      // Update enrollment as failed due to duplicate
      await serviceClient
        .from("biometric_enrollment_requests")
        .update({
          status: "failed",
          error_message: "Biometric ID already assigned to another member",
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrollment_id);

      return errorResponse("Biometric ID already assigned to another member", 409);
    }

    // Create or update biometric_member_mappings
    if (existingMapping) {
      await serviceClient
        .from("biometric_member_mappings")
        .update({
          member_id: enrollment.member_id,
          is_mapped: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMapping.id);
    } else {
      await serviceClient
        .from("biometric_member_mappings")
        .insert({
          branch_id: enrollment.branch_id,
          biometric_user_id,
          member_id: enrollment.member_id,
          is_mapped: true,
        });
    }

    // Mark enrollment as completed
    await serviceClient
      .from("biometric_enrollment_requests")
      .update({
        status: "completed",
        biometric_user_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enrollment_id);

    return successResponse({ status: "completed", biometric_user_id });
  } else {
    // Mark as failed
    await serviceClient
      .from("biometric_enrollment_requests")
      .update({
        status: "failed",
        error_message: error_message || "Enrollment failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", enrollment_id);

    return successResponse({ status: "failed", error_message: error_message || "Enrollment failed" });
  }
}

// ─── Sync: Receive punch logs from local agent ───

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
    .select("id, branch_id, is_sync_enabled, is_active, total_logs_received")
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

    // Check duplicate
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
      status: "checked_in",
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
