/**
 * Dashboard API Layer
 * Uses optimized database function for fast stats
 * Falls back to direct queries if needed
 */
import { supabase } from "@/lib/supabase";
import { protectedFetch } from "./authenticatedFetch";

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  expiringSoon: number;
  expiredMembers: number;
  inactiveMembers: number;
  monthlyRevenue: number;
  withPT: number;
  dailyPassUsers: number;
}

/**
 * Fetch dashboard statistics via optimized database function
 * Uses single RPC call for all stats instead of multiple queries
 */
export async function fetchDashboardStats(branchId?: string): Promise<DashboardStats> {
  try {
    // Try optimized RPC function first (single query for all stats)
    const { data, error } = await supabase.rpc("get_dashboard_stats", {
      _branch_id: branchId || null,
    });

    if (error) {
      console.warn("RPC failed, falling back to protected fetch:", error.message);
      throw error;
    }

    if (data && data.length > 0) {
      const stats = data[0];
      return {
        totalMembers: Number(stats.total_members) || 0,
        activeMembers: Number(stats.active_members) || 0,
        expiringSoon: Number(stats.expiring_soon) || 0,
        expiredMembers: Number(stats.expired_members) || 0,
        inactiveMembers: Number(stats.inactive_members) || 0,
        monthlyRevenue: Number(stats.monthly_revenue) || 0,
        withPT: Number(stats.with_pt) || 0,
        dailyPassUsers: Number(stats.daily_pass_users) || 0,
      };
    }

    throw new Error("No data returned from RPC");
  } catch (rpcError) {
    // Fallback to protected edge function
    try {
      return await protectedFetch<DashboardStats>({
        action: "dashboard-stats",
        params: { branchId },
      });
    } catch (error) {
      console.warn("Protected fetch failed, falling back to direct query:", error);
      return fetchDashboardStatsDirect(branchId);
    }
  }
}

/**
 * Direct RLS-based dashboard stats (final fallback)
 */
async function fetchDashboardStatsDirect(branchId?: string): Promise<DashboardStats> {
  // Refresh subscription statuses first
  await supabase.rpc("refresh_subscription_statuses");

  // Build base query with branch filter
  let membersQuery = supabase.from("members").select("*", { count: "exact", head: true });
  if (branchId) {
    membersQuery = membersQuery.eq("branch_id", branchId);
  }
  const { count: totalMembers, error: membersCountError } = await membersQuery;
  if (membersCountError) throw membersCountError;

  // Get all members with their latest subscription
  let memberDataQuery = supabase.from("members").select("id");
  if (branchId) {
    memberDataQuery = memberDataQuery.eq("branch_id", branchId);
  }
  const { data: membersData, error: membersDataError } = await memberDataQuery;
  if (membersDataError) throw membersDataError;

  // Get subscriptions for status calculations
  let subscriptionsQuery = supabase
    .from("subscriptions")
    .select("member_id, status, end_date")
    .order("end_date", { ascending: false });
  if (branchId) {
    subscriptionsQuery = subscriptionsQuery.eq("branch_id", branchId);
  }
  const { data: allSubscriptions, error: subsError } = await subscriptionsQuery;
  if (subsError) throw subsError;

  // Group subscriptions by member (latest first)
  const memberSubscriptions = new Map<string, { status: string; end_date: string }>();
  if (allSubscriptions) {
    for (const sub of allSubscriptions) {
      if (!memberSubscriptions.has(sub.member_id)) {
        memberSubscriptions.set(sub.member_id, { status: sub.status || 'inactive', end_date: sub.end_date });
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let activeCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let inactiveCount = 0;

  // Calculate status based on actual dates
  if (membersData) {
    for (const member of membersData) {
      const sub = memberSubscriptions.get(member.id);
      
      if (!sub) {
        continue;
      }

      // If explicitly marked as inactive, count as inactive
      if (sub.status === "inactive") {
        inactiveCount++;
        continue;
      }

      // Calculate based on actual end_date
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = diffDays < 0;
      const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

      if (isExpired) {
        expiredCount++;
      } else if (isExpiringSoon) {
        expiringSoonCount++;
      } else {
        activeCount++;
      }
    }
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let paymentsQuery = supabase
    .from("payments")
    .select("amount")
    .eq("status", "success")
    .gte("created_at", startOfMonth.toISOString());
  if (branchId) {
    paymentsQuery = paymentsQuery.eq("branch_id", branchId);
  }
  const { data: payments, error: paymentsError } = await paymentsQuery;
  if (paymentsError) throw paymentsError;

  const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  // Get active PT subscriptions count
  const todayStr = new Date().toISOString().split("T")[0];
  let ptQuery = supabase
    .from("pt_subscriptions")
    .select("member_id")
    .eq("status", "active")
    .gte("end_date", todayStr);
  if (branchId) {
    ptQuery = ptQuery.eq("branch_id", branchId);
  }
  const { data: activePTData, error: ptError } = await ptQuery;
  if (ptError) throw ptError;

  const uniquePTMembers = new Set(activePTData?.map((pt) => pt.member_id) || []).size;

  // Get daily pass users count
  let dailyPassQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
  if (branchId) {
    dailyPassQuery = dailyPassQuery.eq("branch_id", branchId);
  }
  const { count: dailyPassCount, error: dailyPassError } = await dailyPassQuery;
  if (dailyPassError) throw dailyPassError;

  return {
    totalMembers: totalMembers || 0,
    activeMembers: activeCount,
    expiringSoon: expiringSoonCount,
    expiredMembers: expiredCount,
    inactiveMembers: inactiveCount,
    monthlyRevenue,
    withPT: uniquePTMembers,
    dailyPassUsers: dailyPassCount || 0,
  };
}
