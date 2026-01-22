import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StaffSession {
  staff_id: string;
  is_revoked: boolean;
  expires_at: string;
}

interface StaffPermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
}

interface StaffBranchAssignment {
  branch_id: string;
  is_primary: boolean;
}

// Validate staff session and return staff details
async function validateStaffSession(
  supabase: any,
  token: string
): Promise<{ valid: boolean; staffId?: string; error?: string }> {
  if (!token) {
    return { valid: false, error: "No session token provided" };
  }

  const { data: session, error } = await supabase
    .from("staff_sessions")
    .select("staff_id, is_revoked, expires_at")
    .eq("session_token", token)
    .single();

  if (error || !session) {
    return { valid: false, error: "Invalid session token" };
  }

  if (session.is_revoked) {
    return { valid: false, error: "Session has been revoked" };
  }

  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, error: "Session has expired" };
  }

  return { valid: true, staffId: session.staff_id };
}

// Check if staff has specific permission
async function checkStaffPermission(
  supabase: any,
  staffId: string,
  permission: keyof StaffPermissions
): Promise<boolean> {
  const { data: permissions, error } = await supabase
    .from("staff_permissions")
    .select("*")
    .eq("staff_id", staffId)
    .single();

  if (error || !permissions) {
    return false;
  }

  return permissions[permission] === true;
}

// Check if staff is assigned to a branch
async function checkStaffBranchAccess(
  supabase: any,
  staffId: string,
  branchId: string
): Promise<boolean> {
  const { data: assignment, error } = await supabase
    .from("staff_branch_assignments")
    .select("branch_id")
    .eq("staff_id", staffId)
    .eq("branch_id", branchId)
    .single();

  return !error && !!assignment;
}

// Get staff details for logging
async function getStaffDetails(supabase: any, staffId: string) {
  const { data: staff, error } = await supabase
    .from("staff")
    .select("full_name, phone, role")
    .eq("id", staffId)
    .single();

  return staff || { full_name: "Unknown", phone: "Unknown", role: "unknown" };
}

// Log staff activity
async function logStaffActivity(
  supabase: any,
  params: {
    staffId: string;
    staffName: string;
    staffPhone: string;
    category: string;
    type: string;
    description: string;
    branchId?: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    oldValue?: any;
    newValue?: any;
    metadata?: any;
  }
) {
  await supabase.from("admin_activity_logs").insert({
    admin_user_id: null, // NULL indicates staff action
    activity_category: params.category,
    activity_type: params.type,
    description: params.description,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    entity_name: params.entityName || null,
    old_value: params.oldValue || null,
    new_value: params.newValue || null,
    branch_id: params.branchId || null,
    metadata: {
      performed_by: "staff",
      staff_id: params.staffId,
      staff_name: params.staffName,
      staff_phone: params.staffPhone,
      ...(params.metadata || {}),
    },
  });
}

// Action handlers
async function handleUpdateGymSettings(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { settingsId, branchId, gymName, gymPhone, gymAddress, whatsappEnabled } = body;

  // Check permission
  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  // Check branch access
  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get old values for logging
  const { data: oldSettings } = await supabase
    .from("gym_settings")
    .select("gym_name, gym_phone, gym_address, whatsapp_enabled")
    .eq("id", settingsId)
    .single();

  // Prepare update data
  const updateData: any = { updated_at: new Date().toISOString() };
  if (gymName !== undefined) updateData.gym_name = gymName;
  if (gymPhone !== undefined) updateData.gym_phone = gymPhone;
  if (gymAddress !== undefined) updateData.gym_address = gymAddress;
  if (whatsappEnabled !== undefined) updateData.whatsapp_enabled = whatsappEnabled;

  // Update settings
  const { data, error } = await supabase
    .from("gym_settings")
    .update(updateData)
    .eq("id", settingsId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  // Log activity
  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "gym_info_updated",
    description: `Staff "${staffDetails.full_name}" updated gym settings`,
    branchId,
    entityType: "gym_settings",
    entityId: settingsId,
    oldValue: oldSettings,
    newValue: updateData,
  });

  return { data, status: 200 };
}

async function handleToggleWhatsApp(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { settingsId, branchId, enabled } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data, error } = await supabase
    .from("gym_settings")
    .update({ whatsapp_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", settingsId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "whatsapp_toggled",
    description: `Staff "${staffDetails.full_name}" ${enabled ? "enabled" : "disabled"} WhatsApp notifications`,
    branchId,
    entityType: "gym_settings",
    entityId: settingsId,
    newValue: { whatsapp_enabled: enabled },
  });

  return { data, status: 200 };
}

async function handleAddMonthlyPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, months, price, joiningFee } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data, error } = await supabase
    .from("monthly_packages")
    .insert({
      branch_id: branchId,
      months,
      price,
      joining_fee: joiningFee || 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "package_added",
    description: `Staff "${staffDetails.full_name}" added ${months}-month package at ₹${price}`,
    branchId,
    entityType: "monthly_packages",
    entityId: data.id,
    entityName: `${months} Month Package`,
    newValue: { months, price, joining_fee: joiningFee },
  });

  return { data, status: 200 };
}

async function handleUpdateMonthlyPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { packageId, branchId, months, price, joiningFee, isActive } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get old values
  const { data: oldPackage } = await supabase
    .from("monthly_packages")
    .select("*")
    .eq("id", packageId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  if (months !== undefined) updateData.months = months;
  if (price !== undefined) updateData.price = price;
  if (joiningFee !== undefined) updateData.joining_fee = joiningFee;
  if (isActive !== undefined) updateData.is_active = isActive;

  const { data, error } = await supabase
    .from("monthly_packages")
    .update(updateData)
    .eq("id", packageId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "package_updated",
    description: `Staff "${staffDetails.full_name}" updated ${months || oldPackage?.months}-month package`,
    branchId,
    entityType: "monthly_packages",
    entityId: packageId,
    oldValue: oldPackage,
    newValue: updateData,
  });

  return { data, status: 200 };
}

async function handleDeleteMonthlyPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { packageId, branchId } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get package for logging
  const { data: oldPackage } = await supabase
    .from("monthly_packages")
    .select("*")
    .eq("id", packageId)
    .single();

  const { error } = await supabase
    .from("monthly_packages")
    .delete()
    .eq("id", packageId);

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "package_deleted",
    description: `Staff "${staffDetails.full_name}" deleted ${oldPackage?.months}-month package`,
    branchId,
    entityType: "monthly_packages",
    entityId: packageId,
    oldValue: oldPackage,
  });

  return { data: { success: true }, status: 200 };
}

async function handleAddCustomPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, name, durationDays, price } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data, error } = await supabase
    .from("custom_packages")
    .insert({
      branch_id: branchId,
      name,
      duration_days: durationDays,
      price,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "custom_package_added",
    description: `Staff "${staffDetails.full_name}" added custom package "${name}"`,
    branchId,
    entityType: "custom_packages",
    entityId: data.id,
    entityName: name,
    newValue: { name, duration_days: durationDays, price },
  });

  return { data, status: 200 };
}

async function handleUpdateCustomPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { packageId, branchId, name, durationDays, price, isActive } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data: oldPackage } = await supabase
    .from("custom_packages")
    .select("*")
    .eq("id", packageId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  if (name !== undefined) updateData.name = name;
  if (durationDays !== undefined) updateData.duration_days = durationDays;
  if (price !== undefined) updateData.price = price;
  if (isActive !== undefined) updateData.is_active = isActive;

  const { data, error } = await supabase
    .from("custom_packages")
    .update(updateData)
    .eq("id", packageId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "custom_package_updated",
    description: `Staff "${staffDetails.full_name}" updated custom package "${name || oldPackage?.name}"`,
    branchId,
    entityType: "custom_packages",
    entityId: packageId,
    oldValue: oldPackage,
    newValue: updateData,
  });

  return { data, status: 200 };
}

async function handleDeleteCustomPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { packageId, branchId } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data: oldPackage } = await supabase
    .from("custom_packages")
    .select("*")
    .eq("id", packageId)
    .single();

  const { error } = await supabase
    .from("custom_packages")
    .delete()
    .eq("id", packageId);

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "custom_package_deleted",
    description: `Staff "${staffDetails.full_name}" deleted custom package "${oldPackage?.name}"`,
    branchId,
    entityType: "custom_packages",
    entityId: packageId,
    oldValue: oldPackage,
  });

  return { data: { success: true }, status: 200 };
}

// ============= MEMBER OPERATIONS =============

// Add a cash payment (requires can_manage_members)
async function handleAddCashPayment(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, memberId, amount, notes, paymentType } = body;

  // Can manage members permission allows recording cash payments
  const hasPermission = await checkStaffPermission(supabase, staffId, "can_manage_members");
  if (!hasPermission) {
    return { error: "You don't have permission to record payments", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get member info for logging
  const { data: member } = await supabase
    .from("members")
    .select("name, phone")
    .eq("id", memberId)
    .single();

  // Insert payment
  const { data, error } = await supabase
    .from("payments")
    .insert({
      member_id: memberId,
      branch_id: branchId,
      amount,
      payment_mode: "cash",
      status: "success",
      payment_type: paymentType || "gym_membership",
      notes: notes || "Cash payment recorded by staff",
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  // Add ledger entry for the income
  await supabase.from("ledger_entries").insert({
    branch_id: branchId,
    entry_type: "income",
    category: "gym_membership",
    amount,
    description: `Cash payment from ${member?.name || "Member"}`,
    payment_id: data.id,
    member_id: memberId,
    is_auto_generated: true,
  });

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "payment",
    type: "cash_payment_recorded",
    description: `Staff "${staffDetails.full_name}" recorded cash payment of ₹${amount} for ${member?.name || "member"}`,
    branchId,
    entityType: "payments",
    entityId: data.id,
    entityName: member?.name,
    newValue: { amount, payment_type: paymentType },
    metadata: { member_phone: member?.phone },
  });

  return { data, status: 200 };
}

// Add ledger entry (requires can_access_ledger)
async function handleAddLedgerEntry(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, entryType, category, amount, description, notes, entryDate } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_access_ledger");
  if (!hasPermission) {
    return { error: "You don't have permission to access the ledger", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      branch_id: branchId,
      entry_type: entryType,
      category,
      amount,
      description,
      notes,
      entry_date: entryDate || new Date().toISOString().split("T")[0],
      is_auto_generated: false,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "ledger",
    type: "ledger_entry_added",
    description: `Staff "${staffDetails.full_name}" added ${entryType} entry: ${description}`,
    branchId,
    entityType: "ledger_entries",
    entityId: data.id,
    newValue: { entry_type: entryType, category, amount, description },
  });

  return { data, status: 200 };
}

// Delete ledger entry (requires can_access_ledger)
async function handleDeleteLedgerEntry(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, entryId } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_access_ledger");
  if (!hasPermission) {
    return { error: "You don't have permission to access the ledger", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get entry for logging
  const { data: oldEntry } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("id", entryId)
    .single();

  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("id", entryId);

  if (error) {
    return { error: error.message, status: 500 };
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "ledger",
    type: "ledger_entry_deleted",
    description: `Staff "${staffDetails.full_name}" deleted ledger entry: ${oldEntry?.description}`,
    branchId,
    entityType: "ledger_entries",
    entityId: entryId,
    oldValue: oldEntry,
  });

  return { data: { success: true }, status: 200 };
}

// Update member details (requires can_manage_members)
async function handleUpdateMember(supabase: any, body: any, staffId: string, staffDetails: any) {
  const { branchId, memberId, name, email, phone, address, gender, photoIdType, photoIdNumber, dateOfBirth } = body;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_manage_members");
  if (!hasPermission) {
    return { error: "You don't have permission to manage members", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get old values
  const { data: oldMember } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();

  // Update member table
  const memberUpdate: any = { updated_at: new Date().toISOString() };
  if (name !== undefined) memberUpdate.name = name;
  if (email !== undefined) memberUpdate.email = email;
  if (phone !== undefined) memberUpdate.phone = phone;

  const { error: memberError } = await supabase
    .from("members")
    .update(memberUpdate)
    .eq("id", memberId);

  if (memberError) {
    return { error: memberError.message, status: 500 };
  }

  // Update member_details table if applicable
  if (address !== undefined || gender !== undefined || photoIdType !== undefined || photoIdNumber !== undefined || dateOfBirth !== undefined) {
    const detailsUpdate: any = { updated_at: new Date().toISOString() };
    if (address !== undefined) detailsUpdate.address = address;
    if (gender !== undefined) detailsUpdate.gender = gender;
    if (photoIdType !== undefined) detailsUpdate.photo_id_type = photoIdType;
    if (photoIdNumber !== undefined) detailsUpdate.photo_id_number = photoIdNumber;
    if (dateOfBirth !== undefined) detailsUpdate.date_of_birth = dateOfBirth;

    await supabase
      .from("member_details")
      .update(detailsUpdate)
      .eq("member_id", memberId);
  }

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "members",
    type: "member_updated",
    description: `Staff "${staffDetails.full_name}" updated member "${name || oldMember?.name}"`,
    branchId,
    entityType: "members",
    entityId: memberId,
    entityName: name || oldMember?.name,
    oldValue: oldMember,
    newValue: memberUpdate,
  });

  return { data: { success: true }, status: 200 };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Action parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get session token from Authorization header
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    // Create Supabase client with service role for bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate session
    const sessionResult = await validateStaffSession(supabase, token || "");
    if (!sessionResult.valid) {
      return new Response(
        JSON.stringify({ error: sessionResult.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffId = sessionResult.staffId!;
    const staffDetails = await getStaffDetails(supabase, staffId);

    // Parse request body
    const body = await req.json().catch(() => ({}));

    let result: { data?: any; error?: string; status: number };

    // Route to appropriate handler
    switch (action) {
      case "update-gym-settings":
        result = await handleUpdateGymSettings(supabase, body, staffId, staffDetails);
        break;
      case "toggle-whatsapp":
        result = await handleToggleWhatsApp(supabase, body, staffId, staffDetails);
        break;
      case "add-monthly-package":
        result = await handleAddMonthlyPackage(supabase, body, staffId, staffDetails);
        break;
      case "update-monthly-package":
        result = await handleUpdateMonthlyPackage(supabase, body, staffId, staffDetails);
        break;
      case "delete-monthly-package":
        result = await handleDeleteMonthlyPackage(supabase, body, staffId, staffDetails);
        break;
      case "add-custom-package":
        result = await handleAddCustomPackage(supabase, body, staffId, staffDetails);
        break;
      case "update-custom-package":
        result = await handleUpdateCustomPackage(supabase, body, staffId, staffDetails);
        break;
      case "delete-custom-package":
        result = await handleDeleteCustomPackage(supabase, body, staffId, staffDetails);
        break;
      // Member operations
      case "add-cash-payment":
        result = await handleAddCashPayment(supabase, body, staffId, staffDetails);
        break;
      case "update-member":
        result = await handleUpdateMember(supabase, body, staffId, staffDetails);
        break;
      // Ledger operations
      case "add-ledger-entry":
        result = await handleAddLedgerEntry(supabase, body, staffId, staffDetails);
        break;
      case "delete-ledger-entry":
        result = await handleDeleteLedgerEntry(supabase, body, staffId, staffDetails);
        break;
      default:
        result = { error: `Unknown action: ${action}`, status: 400 };
    }

    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ data: result.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Staff operations error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
