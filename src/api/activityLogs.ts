/**
 * Activity Logs API Layer
 * All Supabase queries for activity logs (admin, user, staff, whatsapp)
 */
import { supabase } from "@/lib/supabase";

// ============ Admin Activity Logs ============

export interface AdminActivityLog {
  id: string;
  admin_user_id: string | null;
  activity_category: string;
  activity_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  branch_id: string | null;
}

export interface PaginatedAdminLogsResponse {
  data: AdminActivityLog[];
  nextCursor: number | null;
  totalCount: number;
}

export async function fetchAdminActivityLogsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25,
  filters?: {
    categoryFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<PaginatedAdminLogsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Build count query
  let countQuery = supabase
    .from("admin_activity_logs")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .not("admin_user_id", "is", null);

  // Build data query
  let dataQuery = supabase
    .from("admin_activity_logs")
    .select("*")
    .eq("branch_id", branchId)
    .not("admin_user_id", "is", null)
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters?.categoryFilter && filters.categoryFilter !== "all") {
    countQuery = countQuery.eq("activity_category", filters.categoryFilter);
    dataQuery = dataQuery.eq("activity_category", filters.categoryFilter);
  }
  if (filters?.dateFrom) {
    countQuery = countQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
    dataQuery = dataQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
  }
  if (filters?.dateTo) {
    countQuery = countQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
    dataQuery = dataQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const { data, error } = await dataQuery.range(cursor, cursor + limit - 1);
  if (error) throw error;

  const totalCount = count || 0;
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: (data as AdminActivityLog[]) || [],
    nextCursor,
    totalCount,
  };
}

// ============ User Activity Logs ============

export interface UserActivityLog {
  id: string;
  activity_type: string;
  description: string;
  member_id: string | null;
  daily_pass_user_id: string | null;
  subscription_id: string | null;
  pt_subscription_id: string | null;
  payment_id: string | null;
  trainer_id: string | null;
  amount: number | null;
  payment_mode: string | null;
  package_name: string | null;
  duration_months: number | null;
  duration_days: number | null;
  member_name: string | null;
  member_phone: string | null;
  trainer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata: any;
  created_at: string;
  branch_id: string | null;
}

export interface PaginatedUserLogsResponse {
  data: UserActivityLog[];
  nextCursor: number | null;
  totalCount: number;
}

export async function fetchUserActivityLogsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25,
  filters?: {
    typeFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<PaginatedUserLogsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Build count query
  let countQuery = supabase
    .from("user_activity_logs")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);

  // Build data query
  let dataQuery = supabase
    .from("user_activity_logs")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters?.typeFilter && filters.typeFilter !== "all") {
    countQuery = countQuery.eq("activity_type", filters.typeFilter);
    dataQuery = dataQuery.eq("activity_type", filters.typeFilter);
  }
  if (filters?.dateFrom) {
    countQuery = countQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
    dataQuery = dataQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
  }
  if (filters?.dateTo) {
    countQuery = countQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
    dataQuery = dataQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const { data, error } = await dataQuery.range(cursor, cursor + limit - 1);
  if (error) throw error;

  const totalCount = count || 0;
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: (data as UserActivityLog[]) || [],
    nextCursor,
    totalCount,
  };
}

// ============ Staff Activity Logs ============

export interface StaffActivityLog {
  id: string;
  admin_user_id: string | null;
  activity_category: string;
  activity_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  branch_id: string | null;
}

export interface PaginatedStaffLogsResponse {
  data: StaffActivityLog[];
  nextCursor: number | null;
  totalCount: number;
}

export async function fetchStaffActivityLogsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25,
  filters?: {
    typeFilter?: string;
    staffFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<PaginatedStaffLogsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Build count query - staff activities have admin_user_id = null
  let countQuery = supabase
    .from("admin_activity_logs")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .is("admin_user_id", null);

  // Build data query
  let dataQuery = supabase
    .from("admin_activity_logs")
    .select("*")
    .eq("branch_id", branchId)
    .is("admin_user_id", null)
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters?.typeFilter && filters.typeFilter !== "all") {
    countQuery = countQuery.eq("activity_type", filters.typeFilter);
    dataQuery = dataQuery.eq("activity_type", filters.typeFilter);
  }
  if (filters?.dateFrom) {
    countQuery = countQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
    dataQuery = dataQuery.gte("created_at", filters.dateFrom + "T00:00:00Z");
  }
  if (filters?.dateTo) {
    countQuery = countQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
    dataQuery = dataQuery.lte("created_at", filters.dateTo + "T23:59:59Z");
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  let { data, error } = await dataQuery.range(cursor, cursor + limit - 1);
  if (error) throw error;

  // Filter by staff if selected (staff_id is in metadata) - done in memory
  let filteredData = (data as StaffActivityLog[]) || [];
  if (filters?.staffFilter && filters.staffFilter !== "all") {
    filteredData = filteredData.filter((log) => {
      const metadata = log.metadata as any;
      return metadata?.staff_id === filters.staffFilter;
    });
  }

  const totalCount = count || 0;
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: filteredData,
    nextCursor,
    totalCount,
  };
}

// ============ WhatsApp Logs ============

export interface WhatsAppLog {
  id: string;
  member_id: string | null;
  daily_pass_user_id: string | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  notification_type: string;
  message_content: string | null;
  status: string;
  error_message: string | null;
  is_manual: boolean;
  admin_user_id: string | null;
  sent_at: string;
  member?: { name: string; phone: string } | null;
  daily_pass_user?: { name: string; phone: string } | null;
}

export interface PaginatedWhatsAppLogsResponse {
  data: WhatsAppLog[];
  nextCursor: number | null;
  totalCount: number;
}

export async function fetchWhatsAppLogsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25,
  filters?: {
    typeFilter?: string;
    statusFilter?: string;
    manualFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<PaginatedWhatsAppLogsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Build count query
  let countQuery = supabase
    .from("whatsapp_notifications")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);

  // Build data query
  let dataQuery = supabase
    .from("whatsapp_notifications")
    .select("*")
    .eq("branch_id", branchId)
    .order("sent_at", { ascending: false });

  // Apply filters
  if (filters?.typeFilter && filters.typeFilter !== "all") {
    countQuery = countQuery.eq("notification_type", filters.typeFilter);
    dataQuery = dataQuery.eq("notification_type", filters.typeFilter);
  }
  if (filters?.statusFilter && filters.statusFilter !== "all") {
    countQuery = countQuery.eq("status", filters.statusFilter);
    dataQuery = dataQuery.eq("status", filters.statusFilter);
  }
  if (filters?.manualFilter && filters.manualFilter !== "all") {
    const isManual = filters.manualFilter === "manual";
    countQuery = countQuery.eq("is_manual", isManual);
    dataQuery = dataQuery.eq("is_manual", isManual);
  }
  if (filters?.dateFrom) {
    countQuery = countQuery.gte("sent_at", filters.dateFrom + "T00:00:00Z");
    dataQuery = dataQuery.gte("sent_at", filters.dateFrom + "T00:00:00Z");
  }
  if (filters?.dateTo) {
    countQuery = countQuery.lte("sent_at", filters.dateTo + "T23:59:59Z");
    dataQuery = dataQuery.lte("sent_at", filters.dateTo + "T23:59:59Z");
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const { data, error } = await dataQuery.range(cursor, cursor + limit - 1);
  if (error) throw error;

  if (!data || data.length === 0) {
    return { data: [], nextCursor: null, totalCount: count || 0 };
  }

  // Get unique member IDs and daily pass user IDs for batch lookup
  const memberIds = [...new Set(data.map((log) => log.member_id).filter(Boolean))] as string[];
  const dailyPassUserIds = [...new Set(data.map((log) => log.daily_pass_user_id).filter(Boolean))] as string[];

  // Fetch member data
  let membersMap: Record<string, { name: string; phone: string }> = {};
  if (memberIds.length > 0) {
    try {
      const { data: membersData } = await supabase
        .from("members")
        .select("id, name, phone")
        .in("id", memberIds);
      if (membersData) {
        membersMap = membersData.reduce((acc, m) => {
          acc[m.id] = { name: m.name, phone: m.phone };
          return acc;
        }, {} as Record<string, { name: string; phone: string }>);
      }
    } catch (e) {
      console.warn("Error fetching members:", e);
    }
  }

  // Fetch daily pass user data
  let dailyPassUsersMap: Record<string, { name: string; phone: string }> = {};
  if (dailyPassUserIds.length > 0) {
    try {
      const { data: dailyPassUsersData } = await supabase
        .from("daily_pass_users")
        .select("id, name, phone")
        .in("id", dailyPassUserIds);
      if (dailyPassUsersData) {
        dailyPassUsersMap = dailyPassUsersData.reduce((acc, u) => {
          acc[u.id] = { name: u.name, phone: u.phone };
          return acc;
        }, {} as Record<string, { name: string; phone: string }>);
      }
    } catch (e) {
      console.warn("Error fetching daily pass users:", e);
    }
  }

  // Process logs with fetched data
  const processedLogs = data.map((log) => ({
    ...log,
    is_manual: log.is_manual ?? false,
    daily_pass_user_id: log.daily_pass_user_id ?? null,
    recipient_phone: log.recipient_phone ?? null,
    recipient_name: log.recipient_name ?? null,
    message_content: log.message_content ?? null,
    admin_user_id: log.admin_user_id ?? null,
    member: log.member_id ? membersMap[log.member_id] || null : null,
    daily_pass_user: log.daily_pass_user_id ? dailyPassUsersMap[log.daily_pass_user_id] || null : null,
  }));

  const totalCount = count || 0;
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: processedLogs as WhatsAppLog[],
    nextCursor,
    totalCount,
  };
}
