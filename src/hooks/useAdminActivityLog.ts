import { supabase } from "@/integrations/supabase/client";

export type ActivityCategory = 
  | "members"
  | "payments"
  | "packages"
  | "trainers"
  | "settings"
  | "whatsapp"
  | "subscriptions"
  | "ledger"
  | "branch";

export type ActivityType = 
  // Members
  | "member_added"
  | "member_updated"
  | "member_deleted"
  | "member_status_changed"
  // Payments
  | "cash_payment_added"
  | "online_payment_received"
  | "payment_deleted"
  // Packages
  | "monthly_package_added"
  | "monthly_package_updated"
  | "monthly_package_deleted"
  | "monthly_package_toggled"
  | "custom_package_added"
  | "custom_package_updated"
  | "custom_package_deleted"
  | "custom_package_toggled"
  // Trainers
  | "trainer_added"
  | "trainer_updated"
  | "trainer_deleted"
  | "trainer_toggled"
  // Settings
  | "gym_info_updated"
  | "whatsapp_toggled"
  | "whatsapp_template_saved"
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
  // Branch
  | "branch_created"
  | "branch_updated"
  | "branch_deleted"
  | "branch_default_changed";

interface LogActivityParams {
  category: ActivityCategory;
  type: ActivityType;
  description: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  branchId?: string;
}

export const logAdminActivity = async (params: LogActivityParams) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const adminUserId = session?.user?.id || null;

    const { error } = await supabase.from("admin_activity_logs").insert({
      admin_user_id: adminUserId,
      activity_category: params.category,
      activity_type: params.type,
      description: params.description,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      entity_name: params.entityName || null,
      old_value: params.oldValue || null,
      new_value: params.newValue || null,
      metadata: params.metadata || null,
    });

    if (error) {
      console.error("Failed to log admin activity:", error);
    }
  } catch (err) {
    console.error("Error logging admin activity:", err);
  }
};

// Hook for components
export const useAdminActivityLog = () => {
  return { logAdminActivity };
};
