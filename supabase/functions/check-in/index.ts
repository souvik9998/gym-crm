import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, errorResponse, successResponse, handleCorsRequest, createAuthClients, validateJWT, validateAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsRequest();

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "check-in";
    const branchId = url.searchParams.get("branch_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    switch (action) {
      case "check-in":
        return await handleCheckIn(req, serviceClient, branchId);
      case "member-check-in":
        return await handleMemberCheckIn(req, serviceClient, branchId);
      case "register-device":
        return await handleRegisterDevice(req, serviceClient);
      case "reset-device":
        return await handleResetDevice(req, serviceClient);
      case "attendance-logs":
        return await handleAttendanceLogs(req, serviceClient);
      case "attendance-insights":
        return await handleInsights(req, serviceClient);
      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err: any) {
    console.error("Check-in error:", err);
    return errorResponse(err.message || "Internal error", 500);
  }
});

// ─── Check-in for authenticated users (admin/staff with Supabase Auth) ───
async function handleCheckIn(req: Request, serviceClient: any, branchId: string | null) {
  const authHeader = req.headers.get("authorization");
  const body = await req.text().then(t => t ? JSON.parse(t) : {}).catch(() => ({}));
  const deviceFingerprint = body.device_fingerprint || null;
  const effectiveBranchId = branchId || body.branch_id;

  if (!effectiveBranchId) return errorResponse("branch_id is required", 400);

  // Validate JWT
  const { anonClient } = createAuthClients(authHeader);
  const jwtResult = await validateJWT(anonClient, authHeader);
  if (!jwtResult.valid || !jwtResult.userId) {
    return errorResponse("Authentication required", 401);
  }

  const userId = jwtResult.userId;

  // Detect role: check if this user is staff
  const { data: staffData } = await serviceClient
    .from("staff")
    .select("id, full_name, phone, is_active")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (staffData) {
    return await processCheckIn(serviceClient, {
      userType: "staff",
      staffId: staffData.id,
      memberId: null,
      branchId: effectiveBranchId,
      deviceFingerprint,
      userName: staffData.full_name,
      userPhone: staffData.phone,
    });
  }

  // Check if user is an admin (gym owner) — they don't check in
  return errorResponse("No member or staff profile found for this user", 404);
}

// ─── Check-in for members (phone-based, no Supabase Auth) ───
async function handleMemberCheckIn(req: Request, serviceClient: any, branchId: string | null) {
  const body = await req.text().then(t => t ? JSON.parse(t) : {}).catch(() => ({}));
  const { phone, device_fingerprint, session_token } = body;
  const effectiveBranchId = branchId || body.branch_id;

  if (!effectiveBranchId) return errorResponse("branch_id is required", 400);

  // If session_token provided, validate it
  if (session_token) {
    const { data: device } = await serviceClient
      .from("attendance_devices")
      .select("*, member_id")
      .eq("device_fingerprint", session_token)
      .eq("branch_id", effectiveBranchId)
      .eq("user_type", "member")
      .eq("is_active", true)
      .maybeSingle();

    if (!device || !device.member_id) {
      return successResponse({ status: "device_mismatch", message: "Device not recognized. Please login again." });
    }

    // Get member info
    const { data: member } = await serviceClient
      .from("members")
      .select("id, name, phone")
      .eq("id", device.member_id)
      .single();

    if (!member) return errorResponse("Member not found", 404);

    return await processCheckIn(serviceClient, {
      userType: "member",
      staffId: null,
      memberId: member.id,
      branchId: effectiveBranchId,
      deviceFingerprint: session_token,
      userName: member.name,
      userPhone: member.phone,
    });
  }

  // First-time: phone lookup
  if (!phone) return errorResponse("Phone number is required for first check-in", 400);

  const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "");
  const { data: member } = await serviceClient
    .from("members")
    .select("id, name, phone")
    .eq("phone", cleanPhone)
    .eq("branch_id", effectiveBranchId)
    .maybeSingle();

  if (!member) {
    return successResponse({ status: "not_found", message: "No member found with this phone number at this branch." });
  }

  // Check device binding
  if (device_fingerprint) {
    const { data: existingDevice } = await serviceClient
      .from("attendance_devices")
      .select("id, device_fingerprint, is_active")
      .eq("user_type", "member")
      .eq("member_id", member.id)
      .eq("branch_id", effectiveBranchId)
      .maybeSingle();

    if (existingDevice && existingDevice.is_active && existingDevice.device_fingerprint !== device_fingerprint) {
      return successResponse({
        status: "device_mismatch",
        message: "This account is registered on another device. Contact admin to reset.",
      });
    }

    // Register or update device
    if (!existingDevice) {
      await serviceClient.from("attendance_devices").insert({
        user_type: "member",
        member_id: member.id,
        branch_id: effectiveBranchId,
        device_fingerprint,
      });
    } else if (!existingDevice.is_active) {
      await serviceClient.from("attendance_devices").update({
        device_fingerprint,
        is_active: true,
        reset_at: null,
        reset_by: null,
      }).eq("id", existingDevice.id);
    }
  }

  // Process the check-in
  const result = await processCheckIn(serviceClient, {
    userType: "member",
    staffId: null,
    memberId: member.id,
    branchId: effectiveBranchId,
    deviceFingerprint: device_fingerprint,
    userName: member.name,
    userPhone: member.phone,
  });

  // Include session token for future visits
  const responseBody = await result.clone().json();
  responseBody.session_token = device_fingerprint;
  responseBody.member_name = member.name;

  return successResponse(responseBody);
}

// ─── Core check-in/out logic ───
async function processCheckIn(serviceClient: any, params: {
  userType: string;
  staffId: string | null;
  memberId: string | null;
  branchId: string;
  deviceFingerprint: string | null;
  userName: string;
  userPhone: string;
}) {
  const { userType, staffId, memberId, branchId, deviceFingerprint, userName, userPhone } = params;
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Check subscription status for members
  let subscriptionStatus = "active";
  if (userType === "member" && memberId) {
    const { data: latestSub } = await serviceClient
      .from("subscriptions")
      .select("status, end_date")
      .eq("member_id", memberId)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestSub) {
      subscriptionStatus = "no_subscription";
    } else if (latestSub.status === "expired" || latestSub.status === "inactive" || new Date(latestSub.end_date) < new Date(today)) {
      subscriptionStatus = "expired";
    } else if (latestSub.status === "expiring_soon") {
      subscriptionStatus = "expiring_soon";
    }
  }

  // Check for existing open attendance today
  const matchFilter: any = {
    branch_id: branchId,
    user_type: userType,
    date: today,
  };
  if (memberId) matchFilter.member_id = memberId;
  if (staffId) matchFilter.staff_id = staffId;

  let query = serviceClient.from("attendance_logs").select("*").match(matchFilter).order("check_in_at", { ascending: false }).limit(1);
  const { data: existingLogs } = await query;
  const existingLog = existingLogs?.[0];

  // Anti-passback: prevent duplicate within 10 minutes
  if (existingLog) {
    const lastTime = new Date(existingLog.check_out_at || existingLog.check_in_at);
    const diffMinutes = (Date.now() - lastTime.getTime()) / (1000 * 60);

    if (diffMinutes < 10) {
      return successResponse({
        status: "duplicate",
        message: `Please wait ${Math.ceil(10 - diffMinutes)} minutes before scanning again.`,
        check_in_at: existingLog.check_in_at,
        name: userName,
      });
    }

    // If checked in and no check-out, mark check-out
    if (existingLog.status === "checked_in" || existingLog.status === "expired") {
      const checkInTime = new Date(existingLog.check_in_at);
      const totalHours = Math.round(((Date.now() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;

      await serviceClient.from("attendance_logs").update({
        check_out_at: now,
        total_hours: totalHours,
        status: "checked_out",
      }).eq("id", existingLog.id);

      return successResponse({
        status: "checked_out",
        message: `Checked out successfully. Total: ${totalHours} hours.`,
        check_in_at: existingLog.check_in_at,
        check_out_at: now,
        total_hours: totalHours,
        name: userName,
        subscription_status: subscriptionStatus,
      });
    }
  }

  // New check-in
  const logStatus = subscriptionStatus === "expired" || subscriptionStatus === "no_subscription" ? "expired" : "checked_in";

  const { data: newLog, error: insertError } = await serviceClient.from("attendance_logs").insert({
    branch_id: branchId,
    user_type: userType,
    member_id: memberId,
    staff_id: staffId,
    check_in_at: now,
    date: today,
    device_fingerprint: deviceFingerprint,
    status: logStatus,
  }).select().single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return errorResponse("Failed to log attendance", 500);
  }

  const response: any = {
    status: logStatus === "expired" ? "expired" : "checked_in",
    message: logStatus === "expired"
      ? `Checked in. Your membership has expired. Please renew.`
      : `Welcome ${userName}! Checked in successfully.`,
    check_in_at: now,
    name: userName,
    subscription_status: subscriptionStatus,
    attendance_id: newLog.id,
  };

  if (logStatus === "expired") {
    response.redirect = `/b/${branchId}/renew`;

    // Send WhatsApp notification to admin
    try {
      const adminPhone = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
      const periskopeKey = Deno.env.get("PERISKOPE_API_KEY");
      const periskopePhone = Deno.env.get("PERISKOPE_PHONE");

      if (adminPhone && periskopeKey && periskopePhone) {
        const { data: branch } = await serviceClient
          .from("branches")
          .select("name")
          .eq("id", branchId)
          .single();

        const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        const message = `⚠️ *Expired Member Check-in*\n\n` +
          `👤 *Name:* ${userName}\n` +
          `📱 *Phone:* ${userPhone}\n` +
          `📍 *Branch:* ${branch?.name || branchId}\n` +
          `🕐 *Time:* ${timeStr}\n\n` +
          `The member has been redirected to the renewal page.`;

        let formattedAdmin = adminPhone.replace(/\D/g, "");
        if (formattedAdmin.length === 10) formattedAdmin = "91" + formattedAdmin;

        await fetch("https://api.periskope.app/v1/message/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${periskopeKey}`,
            "x-phone": periskopePhone,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: `${formattedAdmin}@c.us`, message }),
        });
      }
    } catch (e) {
      console.warn("Failed to send expired member WhatsApp notification:", e);
    }
  }

  return successResponse(response);
}

// ─── Register device ───
async function handleRegisterDevice(req: Request, serviceClient: any) {
  const body = await req.text().then(t => t ? JSON.parse(t) : {}).catch(() => ({}));
  const { user_type, member_id, staff_id, branch_id, device_fingerprint } = body;

  if (!branch_id || !device_fingerprint || !user_type) {
    return errorResponse("Missing required fields", 400);
  }

  const insertData: any = {
    user_type,
    branch_id,
    device_fingerprint,
  };
  if (user_type === "member") insertData.member_id = member_id;
  if (user_type === "staff") insertData.staff_id = staff_id;

  const { error } = await serviceClient.from("attendance_devices").upsert(insertData, {
    onConflict: user_type === "member" ? "user_type,member_id,branch_id" : "user_type,staff_id,branch_id",
  });

  if (error) return errorResponse("Failed to register device: " + error.message, 500);
  return successResponse({ success: true });
}

// ─── Reset device (admin only) ───
async function handleResetDevice(req: Request, serviceClient: any) {
  const auth = await validateAuth(req.headers.get("authorization"));
  if (!auth.valid || !auth.isAdmin) return errorResponse("Admin access required", 403);

  const body = await req.text().then(t => t ? JSON.parse(t) : {}).catch(() => ({}));
  const { device_id, member_id, staff_id, user_type, branch_id } = body;

  let query = serviceClient.from("attendance_devices").update({
    is_active: false,
    reset_by: auth.userId,
    reset_at: new Date().toISOString(),
  });

  if (device_id) {
    query = query.eq("id", device_id);
  } else if (member_id) {
    query = query.eq("member_id", member_id).eq("branch_id", branch_id);
  } else if (staff_id) {
    query = query.eq("staff_id", staff_id).eq("branch_id", branch_id);
  } else {
    return errorResponse("Provide device_id, member_id, or staff_id", 400);
  }

  const { error } = await query;
  if (error) return errorResponse("Failed to reset device", 500);
  return successResponse({ success: true });
}

// ─── Attendance logs (admin/staff) ───
async function handleAttendanceLogs(req: Request, serviceClient: any) {
  const auth = await validateAuth(req.headers.get("authorization"));
  if (!auth.valid) return errorResponse("Authentication required", 401);

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const dateFrom = url.searchParams.get("date_from") || new Date().toISOString().split("T")[0];
  const dateTo = url.searchParams.get("date_to") || dateFrom;
  const userType = url.searchParams.get("user_type");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  let query = serviceClient
    .from("attendance_logs")
    .select("*, members(name, phone), staff(full_name, phone, role)", { count: "exact" })
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("check_in_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (branchId) query = query.eq("branch_id", branchId);
  if (userType) query = query.eq("user_type", userType);

  // Scope to allowed branches
  if (auth.isStaff && auth.branchIds?.length) {
    query = query.in("branch_id", auth.branchIds);
  }

  const { data, error, count } = await query;
  if (error) return errorResponse("Failed to fetch logs: " + error.message, 500);

  return successResponse({ data, total: count, page, limit });
}

// ─── Attendance insights ───
async function handleInsights(req: Request, serviceClient: any) {
  const auth = await validateAuth(req.headers.get("authorization"));
  if (!auth.valid) return errorResponse("Authentication required", 401);

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const dateFrom = url.searchParams.get("date_from") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = url.searchParams.get("date_to") || new Date().toISOString().split("T")[0];

  let logsQuery = serviceClient
    .from("attendance_logs")
    .select("*")
    .gte("date", dateFrom)
    .lte("date", dateTo);

  if (branchId) logsQuery = logsQuery.eq("branch_id", branchId);
  if (auth.isStaff && auth.branchIds?.length) logsQuery = logsQuery.in("branch_id", auth.branchIds);

  const { data: logs, error } = await logsQuery;
  if (error) return errorResponse("Failed to fetch insights", 500);

  // Compute insights
  const allLogs = logs || [];
  const memberLogs = allLogs.filter((l: any) => l.user_type === "member");
  const staffLogs = allLogs.filter((l: any) => l.user_type === "staff");

  // Daily footfall
  const dailyFootfall: Record<string, number> = {};
  for (const log of memberLogs) {
    dailyFootfall[log.date] = (dailyFootfall[log.date] || 0) + 1;
  }

  // Peak hours
  const hourCounts: Record<number, number> = {};
  for (const log of allLogs) {
    const hour = new Date(log.check_in_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  // Average visit duration (members with total_hours)
  const completedVisits = memberLogs.filter((l: any) => l.total_hours);
  const avgDuration = completedVisits.length > 0
    ? Math.round((completedVisits.reduce((sum: number, l: any) => sum + Number(l.total_hours), 0) / completedVisits.length) * 100) / 100
    : 0;

  // Staff working hours
  const staffHours: Record<string, number> = {};
  for (const log of staffLogs) {
    const key = log.staff_id;
    if (key && log.total_hours) {
      staffHours[key] = (staffHours[key] || 0) + Number(log.total_hours);
    }
  }

  // Total unique visitors
  const uniqueMembers = new Set(memberLogs.map((l: any) => l.member_id)).size;
  const totalCheckIns = allLogs.length;

  return successResponse({
    daily_footfall: Object.entries(dailyFootfall).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    peak_hours: Object.entries(hourCounts).map(([hour, count]) => ({ hour: parseInt(hour), count })).sort((a, b) => a.hour - b.hour),
    avg_visit_duration: avgDuration,
    staff_working_hours: staffHours,
    unique_members: uniqueMembers,
    total_check_ins: totalCheckIns,
    period: { from: dateFrom, to: dateTo },
  });
}
