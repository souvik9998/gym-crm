/**
 * Daily Pass API Layer
 * All Supabase queries for daily pass users and subscriptions
 */
import { supabase } from "@/lib/supabase";

export interface DailyPassUserWithSubscription {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  created_at: string;
  subscription?: {
    id: string;
    package_name: string;
    duration_days: number;
    start_date: string;
    end_date: string;
    price: number;
    trainer_fee: number;
    status: string;
    personal_trainer_id: string | null;
    trainer?: {
      name: string;
    };
  };
}

/**
 * Fetch all daily pass users with their subscriptions
 */
export async function fetchDailyPassUsers(branchId?: string): Promise<DailyPassUserWithSubscription[]> {
  if (!branchId) return [];

  const { data: usersData, error: usersError } = await supabase
    .from("daily_pass_users")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (usersError) throw usersError;

  const usersWithSubs = await Promise.all(
    (usersData || []).map(async (user) => {
      const { data: subData, error: subError } = await supabase
        .from("daily_pass_subscriptions")
        .select(`*, personal_trainers:personal_trainer_id (name)`)
        .eq("daily_pass_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;

      return {
        ...user,
        subscription: subData
          ? {
              ...subData,
              trainer: subData.personal_trainers || undefined,
            }
          : undefined,
      };
    })
  );

  return usersWithSubs;
}

export interface PaginatedDailyPassResponse {
  data: DailyPassUserWithSubscription[];
  nextCursor: number | null;
  totalCount: number;
}

/**
 * Fetch daily pass users with pagination (cursor-based using offset)
 */
export async function fetchDailyPassUsersPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25
): Promise<PaginatedDailyPassResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Get total count for the branch
  const { count, error: countError } = await supabase
    .from("daily_pass_users")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);

  if (countError) throw countError;

  // Fetch paginated users
  const { data: usersData, error: usersError } = await supabase
    .from("daily_pass_users")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  if (usersError) throw usersError;

  // Fetch subscriptions for these users
  const usersWithSubs = await Promise.all(
    (usersData || []).map(async (user) => {
      const { data: subData, error: subError } = await supabase
        .from("daily_pass_subscriptions")
        .select(`*, personal_trainers:personal_trainer_id (name)`)
        .eq("daily_pass_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;

      return {
        ...user,
        subscription: subData
          ? {
              ...subData,
              trainer: subData.personal_trainers || undefined,
            }
          : undefined,
      };
    })
  );

  const totalCount = count || 0;
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: usersWithSubs,
    nextCursor,
    totalCount,
  };
}

/**
 * Fetch a single daily pass user by ID
 */
export async function fetchDailyPassUserById(userId: string) {
  const { data, error } = await supabase
    .from("daily_pass_users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new daily pass user
 */
export async function createDailyPassUser(user: {
  name: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  branch_id: string;
  photo_id_type?: string | null;
  photo_id_number?: string | null;
  address?: string | null;
}) {
  const { data, error } = await supabase
    .from("daily_pass_users")
    .insert(user)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a daily pass user and all related records
 */
export async function deleteDailyPassUser(userId: string) {
  // Delete in correct order to avoid FK constraints

  // 1. Delete user activity logs
  const { error: activityError } = await supabase
    .from("user_activity_logs")
    .delete()
    .eq("daily_pass_user_id", userId);
  if (activityError) throw activityError;

  // 2. Delete WhatsApp notifications
  const { error: whatsappError } = await supabase
    .from("whatsapp_notifications")
    .delete()
    .eq("daily_pass_user_id", userId);
  if (whatsappError) throw whatsappError;

  // 3. Delete ledger entries
  const { error: ledgerError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("daily_pass_user_id", userId);
  if (ledgerError) throw ledgerError;

  // 4. Delete payments
  const { error: paymentsError } = await supabase
    .from("payments")
    .delete()
    .eq("daily_pass_user_id", userId);
  if (paymentsError) throw paymentsError;

  // 5. Delete subscriptions
  const { error: subsError } = await supabase
    .from("daily_pass_subscriptions")
    .delete()
    .eq("daily_pass_user_id", userId);
  if (subsError) throw subsError;

  // 6. Delete the user
  const { error } = await supabase
    .from("daily_pass_users")
    .delete()
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Check if daily pass user exists by phone
 */
export async function checkDailyPassUserByPhone(phone: string, branchId: string) {
  const { data, error } = await supabase
    .from("daily_pass_users")
    .select("id, name")
    .eq("phone", phone)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
