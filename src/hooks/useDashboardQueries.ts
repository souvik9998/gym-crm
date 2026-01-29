import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { CACHE_KEYS, STALE_TIMES, GC_TIME } from "./useQueryCache";

// Types
export interface MemberWithSubscription {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  join_date: string | null;
  branch_id: string;
  subscription?: {
    id: string;
    status: string;
    end_date: string;
    start_date: string;
  };
  activePT?: {
    trainer_name: string;
    end_date: string;
  } | null;
}

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

export interface PaymentWithDetails {
  id: string;
  amount: number;
  payment_mode: "online" | "cash";
  status: "pending" | "success" | "failed" | null;
  created_at: string | null;
  notes: string | null;
  payment_type: string | null;
  member_id: string | null;
  daily_pass_user_id: string | null;
  member: {
    name: string;
    phone: string;
  } | null;
  daily_pass_user: {
    name: string;
    phone: string;
  } | null;
}

// Fetch functions
async function fetchMembersWithSubscriptions(branchId?: string): Promise<MemberWithSubscription[]> {
  let query = supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data: membersData, error: membersError } = await query;
  if (membersError) throw membersError;

  const today = new Date().toISOString().split("T")[0];

  // Get latest subscription and PT for each member
  const membersWithData = await Promise.all(
    (membersData || []).map(async (member) => {
      // Get subscription
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("id, status, end_date, start_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get active PT subscription
      const { data: ptData } = await supabase
        .from("pt_subscriptions")
        .select("end_date, personal_trainer:personal_trainers(name)")
        .eq("member_id", member.id)
        .eq("status", "active")
        .gte("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...member,
        subscription: subData || undefined,
        activePT: ptData
          ? {
              trainer_name: (ptData.personal_trainer as any)?.name || "Unknown",
              end_date: ptData.end_date,
            }
          : null,
      };
    })
  );

  return membersWithData;
}

async function fetchDailyPassUsers(branchId?: string): Promise<DailyPassUserWithSubscription[]> {
  if (!branchId) return [];

  const { data: usersData, error: usersError } = await supabase
    .from("daily_pass_users")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (usersError) throw usersError;

  const usersWithSubs = await Promise.all(
    (usersData || []).map(async (user) => {
      const { data: subData } = await supabase
        .from("daily_pass_subscriptions")
        .select(`*, personal_trainers:personal_trainer_id (name)`)
        .eq("daily_pass_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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

async function fetchPayments(branchId?: string): Promise<PaymentWithDetails[]> {
  let query = supabase
    .from("payments")
    .select(`
      id,
      amount,
      payment_mode,
      status,
      created_at,
      notes,
      payment_type,
      member_id,
      daily_pass_user_id,
      member:members(name, phone),
      daily_pass_user:daily_pass_users(name, phone)
    `)
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as PaymentWithDetails[];
}

// Hooks
export function useMembersQuery() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery({
    queryKey: [CACHE_KEYS.MEMBERS, branchId || "all"],
    queryFn: () => fetchMembersWithSubscriptions(branchId),
    staleTime: STALE_TIMES.DYNAMIC, // 5 minutes
    gcTime: GC_TIME, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: true, // Always enabled, will fetch for "all" if no branch
  });
}

export function useDailyPassQuery() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery({
    queryKey: [CACHE_KEYS.DAILY_PASS_USERS, branchId || "all"],
    queryFn: () => fetchDailyPassUsers(branchId),
    staleTime: STALE_TIMES.DYNAMIC, // 5 minutes
    gcTime: GC_TIME, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: !!branchId, // Only fetch when branch is selected
  });
}

export function usePaymentsQuery() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery({
    queryKey: [CACHE_KEYS.PAYMENTS, branchId || "all"],
    queryFn: () => fetchPayments(branchId),
    staleTime: STALE_TIMES.DYNAMIC, // 5 minutes
    gcTime: GC_TIME, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: true,
  });
}
