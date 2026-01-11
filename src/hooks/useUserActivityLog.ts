import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export type UserActivityType = 
  | "registration"
  | "renewal"
  | "pt_subscription"
  | "pt_extension"
  | "daily_pass";

interface LogUserActivityParams {
  type: UserActivityType;
  description: string;
  memberId?: string;
  dailyPassUserId?: string;
  subscriptionId?: string;
  ptSubscriptionId?: string;
  paymentId?: string;
  trainerId?: string;
  amount?: number;
  paymentMode?: string;
  packageName?: string;
  durationMonths?: number;
  durationDays?: number;
  memberName?: string;
  memberPhone?: string;
  trainerName?: string;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
}

export const logUserActivity = async (params: LogUserActivityParams) => {
  try {
    const { error } = await supabase.from("user_activity_logs").insert({
      activity_type: params.type,
      description: params.description,
      member_id: params.memberId || null,
      daily_pass_user_id: params.dailyPassUserId || null,
      subscription_id: params.subscriptionId || null,
      pt_subscription_id: params.ptSubscriptionId || null,
      payment_id: params.paymentId || null,
      trainer_id: params.trainerId || null,
      amount: params.amount || null,
      payment_mode: params.paymentMode || null,
      package_name: params.packageName || null,
      duration_months: params.durationMonths || null,
      duration_days: params.durationDays || null,
      member_name: params.memberName || null,
      member_phone: params.memberPhone || null,
      trainer_name: params.trainerName || null,
      start_date: params.startDate ? format(params.startDate, "yyyy-MM-dd") : null,
      end_date: params.endDate ? format(params.endDate, "yyyy-MM-dd") : null,
      metadata: params.metadata || null,
    });

    if (error) {
      console.error("Failed to log user activity:", error);
    }
  } catch (err) {
    console.error("Error logging user activity:", err);
  }
};

export const useUserActivityLog = () => {
  return { logUserActivity };
};
