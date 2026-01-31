import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  UpdateGymSettingsSchema,
  ToggleWhatsAppSchema,
  AddMonthlyPackageSchema,
  UpdateMonthlyPackageSchema,
  DeleteMonthlyPackageSchema,
  AddCustomPackageSchema,
  UpdateCustomPackageSchema,
  DeleteCustomPackageSchema,
  UpdateBranchSchema,
  AddCashPaymentSchema,
  UpdateMemberSchema,
  AddLedgerEntrySchema,
  DeleteLedgerEntrySchema,
  validateInput,
  validationErrorResponse,
} from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StaffPermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
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

// Helper to get only changed fields between old and new values
function getChangedFields(oldVal: any, newVal: any): { oldValue: any; newValue: any } | null {
  if (!oldVal && !newVal) return null;
  if (!oldVal) return { oldValue: null, newValue: newVal };
  
  const changedOld: any = {};
  const changedNew: any = {};
  
  const excludeKeys = ['updated_at', 'created_at', 'id', 'branch_id', 'is_active'];
  
  const allKeys = new Set([
    ...Object.keys(oldVal || {}),
    ...Object.keys(newVal || {}),
  ]);
  
  for (const key of allKeys) {
    if (excludeKeys.includes(key)) continue;
    
    const oldValue = oldVal?.[key];
    const newValue = newVal?.[key];
    
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedOld[key] = oldValue ?? null;
      changedNew[key] = newValue ?? null;
    }
  }
  
  if (Object.keys(changedOld).length === 0 && Object.keys(changedNew).length === 0) {
    return null;
  }
  
  return { oldValue: changedOld, newValue: changedNew };
}

// ============================================================================
// Action Handlers with Validation
// ============================================================================

async function handleUpdateGymSettings(supabase: any, body: any, staffId: string, staffDetails: any) {
  // Validate input
  const validation = validateInput(UpdateGymSettingsSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { settingsId, branchId, gymName, gymPhone, gymAddress, whatsappEnabled } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data: oldSettings } = await supabase
    .from("gym_settings")
    .select("gym_name, gym_phone, gym_address, whatsapp_enabled")
    .eq("id", settingsId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  const newSettingsForCompare: any = {};
  
  if (gymName !== undefined) {
    updateData.gym_name = gymName;
    newSettingsForCompare.gym_name = gymName;
  }
  if (gymPhone !== undefined) {
    updateData.gym_phone = gymPhone;
    newSettingsForCompare.gym_phone = gymPhone;
  }
  if (gymAddress !== undefined) {
    updateData.gym_address = gymAddress;
    newSettingsForCompare.gym_address = gymAddress;
  }
  if (whatsappEnabled !== undefined) {
    updateData.whatsapp_enabled = whatsappEnabled;
    newSettingsForCompare.whatsapp_enabled = whatsappEnabled;
  }

  const { data, error } = await supabase
    .from("gym_settings")
    .update(updateData)
    .eq("id", settingsId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  const changes = getChangedFields(oldSettings, newSettingsForCompare);
  const changedFieldNames = changes ? Object.keys(changes.newValue).map(k => k.replace(/_/g, ' ')).join(', ') : 'settings';

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "gym_info_updated",
    description: `Staff "${staffDetails.full_name}" updated ${changedFieldNames}`,
    branchId,
    entityType: "gym_settings",
    entityId: settingsId,
    oldValue: changes?.oldValue || null,
    newValue: changes?.newValue || null,
  });

  return { data, status: 200 };
}

async function handleToggleWhatsApp(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(ToggleWhatsAppSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { settingsId, branchId, enabled } = validation.data!;

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
  const validation = validateInput(AddMonthlyPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, months, price, joiningFee } = validation.data!;

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
  const validation = validateInput(UpdateMonthlyPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { packageId, branchId, months, price, joiningFee, isActive } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data: oldPackage } = await supabase
    .from("monthly_packages")
    .select("months, price, joining_fee")
    .eq("id", packageId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  const newValuesForCompare: any = {};
  
  if (months !== undefined) {
    updateData.months = months;
    newValuesForCompare.months = months;
  }
  if (price !== undefined) {
    updateData.price = price;
    newValuesForCompare.price = price;
  }
  if (joiningFee !== undefined) {
    updateData.joining_fee = joiningFee;
    newValuesForCompare.joining_fee = joiningFee;
  }
  if (isActive !== undefined) {
    updateData.is_active = isActive;
  }

  const { data, error } = await supabase
    .from("monthly_packages")
    .update(updateData)
    .eq("id", packageId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  const changes = getChangedFields(oldPackage, newValuesForCompare);
  const changedFieldNames = changes ? Object.keys(changes.newValue).map(k => k.replace(/_/g, ' ')).join(', ') : 'package';

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "package_updated",
    description: `Staff "${staffDetails.full_name}" updated ${months || oldPackage?.months}-month package (${changedFieldNames})`,
    branchId,
    entityType: "monthly_packages",
    entityId: packageId,
    entityName: `${months || oldPackage?.months} Month Package`,
    oldValue: changes?.oldValue || null,
    newValue: changes?.newValue || null,
  });

  return { data, status: 200 };
}

async function handleDeleteMonthlyPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(DeleteMonthlyPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { packageId, branchId } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

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
  const validation = validateInput(AddCustomPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, name, durationDays, price } = validation.data!;

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
  const validation = validateInput(UpdateCustomPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { packageId, branchId, name, durationDays, price, isActive } = validation.data!;

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
    .select("name, duration_days, price")
    .eq("id", packageId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  const newValuesForCompare: any = {};
  
  if (name !== undefined) {
    updateData.name = name;
    newValuesForCompare.name = name;
  }
  if (durationDays !== undefined) {
    updateData.duration_days = durationDays;
    newValuesForCompare.duration_days = durationDays;
  }
  if (price !== undefined) {
    updateData.price = price;
    newValuesForCompare.price = price;
  }
  if (isActive !== undefined) {
    updateData.is_active = isActive;
  }

  const { data, error } = await supabase
    .from("custom_packages")
    .update(updateData)
    .eq("id", packageId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  const changes = getChangedFields(oldPackage, newValuesForCompare);

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
    entityName: name || oldPackage?.name,
    oldValue: changes?.oldValue || null,
    newValue: changes?.newValue || null,
  });

  return { data, status: 200 };
}

async function handleDeleteCustomPackage(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(DeleteCustomPackageSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { packageId, branchId } = validation.data!;

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

async function handleUpdateBranch(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(UpdateBranchSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, name, address, phone, email } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_change_settings");
  if (!hasPermission) {
    return { error: "You don't have permission to change settings", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data: oldBranch } = await supabase
    .from("branches")
    .select("name, address, phone, email")
    .eq("id", branchId)
    .single();

  const updateData: any = { updated_at: new Date().toISOString() };
  const newValuesForCompare: any = {};
  
  if (name !== undefined) {
    updateData.name = name;
    newValuesForCompare.name = name;
  }
  if (address !== undefined) {
    updateData.address = address;
    newValuesForCompare.address = address;
  }
  if (phone !== undefined) {
    updateData.phone = phone;
    newValuesForCompare.phone = phone;
  }
  if (email !== undefined) {
    updateData.email = email;
    newValuesForCompare.email = email;
  }

  const { data, error } = await supabase
    .from("branches")
    .update(updateData)
    .eq("id", branchId)
    .select()
    .single();

  if (error) {
    return { error: error.message, status: 500 };
  }

  const changes = getChangedFields(oldBranch, newValuesForCompare);

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "settings",
    type: "branch_updated",
    description: `Staff "${staffDetails.full_name}" updated branch "${name || oldBranch?.name}"`,
    branchId,
    entityType: "branches",
    entityId: branchId,
    entityName: name || oldBranch?.name,
    oldValue: changes?.oldValue || null,
    newValue: changes?.newValue || null,
  });

  return { data, status: 200 };
}

async function handleAddCashPayment(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(AddCashPaymentSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, memberId, amount, notes, paymentType } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_manage_members");
  if (!hasPermission) {
    return { error: "You don't have permission to add payments", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get member details
  const { data: member } = await supabase
    .from("members")
    .select("name, phone")
    .eq("id", memberId)
    .single();

  // Create payment record
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      member_id: memberId,
      amount,
      payment_mode: "cash",
      status: "success",
      notes,
      payment_type: paymentType || "gym_membership",
      branch_id: branchId,
    })
    .select()
    .single();

  if (paymentError) {
    return { error: paymentError.message, status: 500 };
  }

  // Create ledger entry for the payment
  await supabase.from("ledger_entries").insert({
    entry_type: "income",
    category: "membership_payment",
    amount,
    description: `Cash payment from ${member?.name || "Member"} - ${paymentType || "gym_membership"}`,
    notes,
    member_id: memberId,
    payment_id: payment.id,
    is_auto_generated: true,
    branch_id: branchId,
    created_by: null, // Staff action
  });

  // Log activity
  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "member",
    type: "cash_payment_added",
    description: `Staff "${staffDetails.full_name}" added ₹${amount} cash payment for ${member?.name || "member"}`,
    branchId,
    entityType: "payments",
    entityId: payment.id,
    entityName: member?.name,
    newValue: { amount, payment_type: paymentType, notes },
  });

  // Log user activity
  await supabase.from("user_activity_logs").insert({
    activity_type: "cash_payment",
    description: `Cash payment of ₹${amount} recorded by staff`,
    member_id: memberId,
    member_name: member?.name,
    member_phone: member?.phone,
    payment_id: payment.id,
    payment_mode: "cash",
    amount,
    branch_id: branchId,
    metadata: {
      recorded_by_staff: staffDetails.full_name,
      payment_type: paymentType,
    },
  });

  return { data: payment, status: 200 };
}

async function handleUpdateMember(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(UpdateMemberSchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, memberId, name, email, phone, address, gender, photoIdType, photoIdNumber, dateOfBirth } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_manage_members");
  if (!hasPermission) {
    return { error: "You don't have permission to update members", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  // Get old values
  const { data: oldMember } = await supabase
    .from("members")
    .select("name, email, phone")
    .eq("id", memberId)
    .single();

  const { data: oldDetails } = await supabase
    .from("member_details")
    .select("address, gender, photo_id_type, photo_id_number, date_of_birth")
    .eq("member_id", memberId)
    .single();

  // Update member basic info
  const memberUpdateData: any = { updated_at: new Date().toISOString() };
  if (name !== undefined) memberUpdateData.name = name;
  if (email !== undefined) memberUpdateData.email = email;
  if (phone !== undefined) memberUpdateData.phone = phone;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .update(memberUpdateData)
    .eq("id", memberId)
    .select()
    .single();

  if (memberError) {
    return { error: memberError.message, status: 500 };
  }

  // Update member details
  const detailsUpdateData: any = { updated_at: new Date().toISOString() };
  if (address !== undefined) detailsUpdateData.address = address;
  if (gender !== undefined) detailsUpdateData.gender = gender;
  if (photoIdType !== undefined) detailsUpdateData.photo_id_type = photoIdType;
  if (photoIdNumber !== undefined) detailsUpdateData.photo_id_number = photoIdNumber;
  if (dateOfBirth !== undefined) detailsUpdateData.date_of_birth = dateOfBirth;

  await supabase
    .from("member_details")
    .update(detailsUpdateData)
    .eq("member_id", memberId);

  // Log activity
  const memberChanges = getChangedFields(oldMember, { name, email, phone });
  const detailChanges = getChangedFields(oldDetails, { address, gender, photo_id_type: photoIdType, photo_id_number: photoIdNumber, date_of_birth: dateOfBirth });

  await logStaffActivity(supabase, {
    staffId,
    staffName: staffDetails.full_name,
    staffPhone: staffDetails.phone,
    category: "member",
    type: "member_updated",
    description: `Staff "${staffDetails.full_name}" updated member "${name || oldMember?.name}"`,
    branchId,
    entityType: "members",
    entityId: memberId,
    entityName: name || oldMember?.name,
    oldValue: { ...memberChanges?.oldValue, ...detailChanges?.oldValue },
    newValue: { ...memberChanges?.newValue, ...detailChanges?.newValue },
  });

  return { data: member, status: 200 };
}

async function handleAddLedgerEntry(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(AddLedgerEntrySchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, entryType, category, amount, description, notes, entryDate } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_access_ledger");
  if (!hasPermission) {
    return { error: "You don't have permission to access ledger", status: 403 };
  }

  const hasBranchAccess = await checkStaffBranchAccess(supabase, staffId, branchId);
  if (!hasBranchAccess) {
    return { error: "You don't have access to this branch", status: 403 };
  }

  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      entry_type: entryType,
      category,
      amount,
      description,
      notes,
      entry_date: entryDate || new Date().toISOString().split("T")[0],
      is_auto_generated: false,
      branch_id: branchId,
      created_by: null, // Staff action
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
    description: `Staff "${staffDetails.full_name}" added ${entryType} of ₹${amount} (${category})`,
    branchId,
    entityType: "ledger_entries",
    entityId: data.id,
    newValue: { entry_type: entryType, category, amount, description },
  });

  return { data, status: 200 };
}

async function handleDeleteLedgerEntry(supabase: any, body: any, staffId: string, staffDetails: any) {
  const validation = validateInput(DeleteLedgerEntrySchema, body);
  if (!validation.success) {
    return { error: `Validation failed: ${validation.error}`, status: 400, details: validation.details };
  }
  
  const { branchId, entryId } = validation.data!;

  const hasPermission = await checkStaffPermission(supabase, staffId, "can_access_ledger");
  if (!hasPermission) {
    return { error: "You don't have permission to access ledger", status: 403 };
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

  // Check if it's auto-generated (shouldn't be deleted)
  if (oldEntry?.is_auto_generated) {
    return { error: "Cannot delete auto-generated entries", status: 403 };
  }

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
    description: `Staff "${staffDetails.full_name}" deleted ${oldEntry?.entry_type} of ₹${oldEntry?.amount}`,
    branchId,
    entityType: "ledger_entries",
    entityId: entryId,
    oldValue: oldEntry,
  });

  return { data: { success: true }, status: 200 };
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get action from query params
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Action is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate staff session
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const sessionResult = await validateStaffSession(supabase, token);

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

    // Route to appropriate handler
    let result: { data?: any; error?: string; status: number; details?: any };

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
      case "update-branch":
        result = await handleUpdateBranch(supabase, body, staffId, staffDetails);
        break;
      case "add-cash-payment":
        result = await handleAddCashPayment(supabase, body, staffId, staffDetails);
        break;
      case "update-member":
        result = await handleUpdateMember(supabase, body, staffId, staffDetails);
        break;
      case "add-ledger-entry":
        result = await handleAddLedgerEntry(supabase, body, staffId, staffDetails);
        break;
      case "delete-ledger-entry":
        result = await handleDeleteLedgerEntry(supabase, body, staffId, staffDetails);
        break;
      default:
        result = { error: "Invalid action", status: 400 };
    }

    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error, details: result.details }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ data: result.data }),
      { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Staff operations error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
