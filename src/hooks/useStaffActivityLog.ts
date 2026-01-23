import { supabase } from "@/integrations/supabase/client";

export type StaffActivityCategory = 
  | "members"
  | "payments"
  | "settings"
  | "subscriptions"
  | "ledger"
  | "staff"
  | "whatsapp";

export type StaffActivityType = 
  // Members
  | "member_viewed"
  | "member_added"
  | "member_updated"
  | "member_deleted"
  | "member_status_changed"
  | "member_moved_to_active"
  | "member_moved_to_inactive"
  // Payments
  | "cash_payment_added"
  | "online_payment_received"
  | "payment_deleted"
  // Subscriptions
  | "subscription_created"
  | "subscription_renewed"
  | "subscription_extended"
  | "pt_subscription_added"
  | "pt_subscription_extended"
  // Ledger
  | "expense_added"
  | "expense_deleted"
  | "income_added"
  // Settings
  | "gym_info_updated"
  | "whatsapp_toggled"
  | "package_added"
  | "package_updated"
  | "package_deleted"
  | "custom_package_added"
  | "custom_package_updated"
  | "custom_package_deleted"
  | "branch_updated"
  // WhatsApp messages
  | "whatsapp_message_sent"
  | "whatsapp_promotional_sent"
  | "whatsapp_expiry_reminder_sent"
  | "whatsapp_expired_reminder_sent"
  | "whatsapp_payment_details_sent"
  | "whatsapp_bulk_message_sent"
  // Staff specific actions (by staff themselves)
  | "staff_logged_in"
  | "staff_logged_out"
  | "staff_password_changed"
  | "staff_viewed_dashboard"
  | "staff_viewed_members"
  | "staff_viewed_analytics"
  | "staff_viewed_ledger"
  | "staff_viewed_payments";

interface LogStaffActivityParams {
  category: StaffActivityCategory;
  type: StaffActivityType;
  description: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  branchId?: string;
  staffId?: string;
  staffName?: string;
  staffPhone?: string;
}

/**
 * Log staff activity - this is for actions performed BY staff members (not admin)
 * The key difference from admin activity log is:
 * - admin_user_id is NULL (to indicate it's a staff action, not admin)
 * - metadata contains staff details (staffId, staffName, staffPhone)
 */
export const logStaffActivity = async (params: LogStaffActivityParams) => {
  try {
    // Staff activities are logged with admin_user_id = NULL
    // This differentiates them from admin activities
    const { data, error } = await supabase.from("admin_activity_logs").insert({
      admin_user_id: null, // NULL indicates this is a staff action, not admin
      activity_category: params.category,
      activity_type: params.type,
      description: params.description,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      entity_name: params.entityName || null,
      old_value: params.oldValue || null,
      new_value: params.newValue || null,
      metadata: {
        ...(params.metadata || {}),
        performed_by: "staff",
        staff_id: params.staffId || null,
        staff_name: params.staffName || null,
        staff_phone: params.staffPhone || null,
      },
      branch_id: params.branchId || null,
    }).select();

    if (error) {
      console.error("Failed to log staff activity:", error);
      console.error("Staff activity log params:", params);
    } else {
      console.log("Staff activity logged successfully:", data?.[0]?.id);
    }
  } catch (err) {
    console.error("Error logging staff activity:", err);
    console.error("Staff activity log params:", params);
  }
};

/**
 * Create a staff activity logger with pre-filled staff context
 * Use this when you have staff auth context available
 */
export const createStaffActivityLogger = (staffContext: {
  staffId: string;
  staffName: string;
  staffPhone: string;
  branchId?: string;
}) => {
  return async (params: Omit<LogStaffActivityParams, 'staffId' | 'staffName' | 'staffPhone' | 'branchId'> & { branchId?: string }) => {
    return logStaffActivity({
      ...params,
      staffId: staffContext.staffId,
      staffName: staffContext.staffName,
      staffPhone: staffContext.staffPhone,
      branchId: params.branchId || staffContext.branchId,
    });
  };
};

// Hook for components - includes staff context
export const useStaffActivityLog = () => {
  return { logStaffActivity, createStaffActivityLogger };
};
