import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInDays, parseISO, subDays } from "date-fns";
import { PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";

// Long stale time for analytics (30 minutes)
const ANALYTICS_STALE_TIME = 1000 * 60 * 30;
const ANALYTICS_GC_TIME = 1000 * 60 * 60; // 1 hour cache

export interface BranchMetrics {
  branchId: string;
  branchName: string;
  revenue: number;
  expenses: number;
  profit: number;
  profitMargin: number;
  totalMembers: number;
  activeMembers: number;
  newMembers: number;
  churnedMembers: number;
  churnRate: number;
  conversionRate: number;
  ptSubscriptions: number;
  avgRevenuePerMember: number;
  staffCount: number;
  staffPerformance: number;
  marketingROI: number;
  previousPeriodRevenue: number;
  revenueGrowth: number;
  previousPeriodMembers: number;
  memberGrowth: number;
}

export interface Insight {
  type: "warning" | "success" | "info";
  title: string;
  description: string;
  branchId: string;
  branchName: string;
  metric: string;
  value: number;
}

export interface TimeSeriesData {
  date: string;
  [key: string]: string | number;
}

export interface TrainerMetrics {
  trainerId: string;
  trainerName: string;
  branchId: string;
  branchName: string;
  revenue: number;
  activeClients: number;
  totalClients: number;
  newClients: number;
  churnedClients: number;
  clientRetentionRate: number;
  avgRevenuePerClient: number;
  avgRevenuePerSession: number;
  totalSessions: number;
  renewalRate: number;
  clientGrowthRate: number;
  efficiencyScore: number;
  paymentCategory: string;
  percentageFee: number;
  sessionFee: number;
  monthlySalary: number;
  previousPeriodRevenue: number;
  revenueGrowth: number;
  previousPeriodClients: number;
  clientGrowth: number;
}

const fetchBranchMetrics = async (
  branchId: string,
  branchName: string,
  from: string,
  to: string
): Promise<BranchMetrics> => {
  const [
    { data: payments },
    { data: expenses },
    { count: totalMembers },
    { count: newMembersCount },
    { count: activeMembers },
    { count: churnedMembers },
    { count: ptSubscriptions },
    { count: staffCount },
    { data: marketingExpenses },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount", { count: "exact" })
      .eq("branch_id", branchId)
      .eq("status", "success")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("ledger_entries")
      .select("amount")
      .eq("branch_id", branchId)
      .eq("entry_type", "expense")
      .gte("entry_date", from)
      .lte("entry_date", to),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("status", "active"),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("status", "expired")
      .gte("end_date", from)
      .lte("end_date", to),
    supabase
      .from("pt_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("staff_branch_assignments")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId),
    supabase
      .from("ledger_entries")
      .select("amount")
      .eq("branch_id", branchId)
      .eq("entry_type", "expense")
      .ilike("category", "%marketing%")
      .gte("entry_date", from)
      .lte("entry_date", to),
  ]);

  const revenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
  const profit = revenue - totalExpenses;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const newMembers = newMembersCount || 0;
  const churnRate = (totalMembers || 0) > 0 ? ((churnedMembers || 0) / (totalMembers || 0)) * 100 : 0;
  const conversionRate = newMembers > 0 ? Math.min((newMembers / (newMembers + 10)) * 100, 100) : 0;
  const staffPerformance = (staffCount || 0) > 0 ? revenue / (staffCount || 1) : 0;
  const marketingExpense = marketingExpenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
  const marketingROI = marketingExpense > 0 ? ((revenue - marketingExpense) / marketingExpense) * 100 : 0;
  const avgRevenuePerMember = (totalMembers || 0) > 0 ? revenue / (totalMembers || 1) : 0;

  // Calculate previous period for growth
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const daysDiff = differenceInDays(toDate, fromDate);
  const previousFrom = format(subDays(fromDate, daysDiff + 1), "yyyy-MM-dd");
  const previousTo = format(subDays(fromDate, 1), "yyyy-MM-dd");

  const [
    { data: previousPayments },
    { count: previousMembersCount },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("branch_id", branchId)
      .eq("status", "success")
      .gte("created_at", `${previousFrom}T00:00:00`)
      .lte("created_at", `${previousTo}T23:59:59`),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .lt("created_at", `${from}T00:00:00`),
  ]);

  const previousPeriodRevenue = previousPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
  const previousPeriodMembers = previousMembersCount || 0;
  const revenueGrowth = previousPeriodRevenue > 0 ? ((revenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0;
  const memberGrowth = previousPeriodMembers > 0 ? ((totalMembers || 0) - previousPeriodMembers) / previousPeriodMembers * 100 : 0;

  return {
    branchId,
    branchName,
    revenue,
    expenses: totalExpenses,
    profit,
    profitMargin,
    totalMembers: totalMembers || 0,
    activeMembers: activeMembers || 0,
    newMembers,
    churnedMembers: churnedMembers || 0,
    churnRate,
    conversionRate,
    ptSubscriptions: ptSubscriptions || 0,
    avgRevenuePerMember,
    staffCount: staffCount || 0,
    staffPerformance,
    marketingROI,
    previousPeriodRevenue,
    revenueGrowth,
    previousPeriodMembers,
    memberGrowth,
  };
};

const generateTimeSeriesData = async (
  branchIds: string[],
  from: string,
  to: string
): Promise<TimeSeriesData[]> => {
  const startDate = parseISO(from);
  const endDate = parseISO(to);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const groupBy = days <= 30 ? "day" : days <= 90 ? "week" : "month";

  const paymentsPromises = branchIds.map((branchId) =>
    supabase
      .from("payments")
      .select("amount, created_at, status")
      .eq("branch_id", branchId)
      .eq("status", "success")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: true })
  );

  const paymentsResults = await Promise.all(paymentsPromises);
  const allPayments = paymentsResults.flatMap((result) => result.data || []);

  // Get branch names
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .in("id", branchIds);

  const branchMap = new Map(branches?.map((b) => [b.id, b.name]) || []);

  let intervals: { date: Date; label: string; key: string }[] = [];
  if (groupBy === "day") {
    intervals = eachDayOfInterval({ start: startDate, end: endDate }).map((date) => ({
      date,
      label: format(date, "dd MMM"),
      key: format(date, "yyyy-MM-dd"),
    }));
  } else if (groupBy === "week") {
    intervals = eachWeekOfInterval({ start: startDate, end: endDate }).map((date) => ({
      date,
      label: format(date, "dd MMM"),
      key: format(date, "yyyy-'W'ww"),
    }));
  } else {
    intervals = eachMonthOfInterval({ start: startDate, end: endDate }).map((date) => ({
      date,
      label: format(date, "MMM yy"),
      key: format(date, "yyyy-MM"),
    }));
  }

  const timeSeriesMap = new Map<string, Record<string, number>>();
  intervals.forEach((interval) => {
    timeSeriesMap.set(interval.key, {});
    branchIds.forEach((branchId) => {
      timeSeriesMap.get(interval.key)![branchId] = 0;
    });
  });

  allPayments.forEach((payment) => {
    const date = new Date(payment.created_at);
    let key: string;
    if (groupBy === "day") {
      key = format(date, "yyyy-MM-dd");
    } else if (groupBy === "week") {
      const weekStart = eachWeekOfInterval({ start: startDate, end: endDate })
        .find((w, i, arr) => {
          const nextWeek = arr[i + 1];
          return date >= w && (!nextWeek || date < nextWeek);
        });
      key = weekStart ? format(weekStart, "yyyy-'W'ww") : format(date, "yyyy-'W'ww");
    } else {
      key = format(date, "yyyy-MM");
    }

    if (timeSeriesMap.has(key)) {
      const branchId = payment.branch_id || "";
      const current = timeSeriesMap.get(key)![branchId] || 0;
      timeSeriesMap.get(key)![branchId] = current + Number(payment.amount || 0);
    }
  });

  return intervals.map((interval) => {
    const dataPoint: TimeSeriesData = { date: interval.label };
    branchIds.forEach((branchId) => {
      const branchName = branchMap.get(branchId) || branchId;
      dataPoint[branchName] = timeSeriesMap.get(interval.key)?.[branchId] || 0;
    });
    return dataPoint;
  });
};

const generateInsights = (metrics: BranchMetrics[]): Insight[] => {
  const insights: Insight[] = [];

  metrics.forEach((metric) => {
    if (metric.churnRate > 10) {
      insights.push({
        type: "warning",
        title: "High Churn Rate",
        description: `${metric.branchName} has a churn rate of ${metric.churnRate.toFixed(1)}%`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "churnRate",
        value: metric.churnRate,
      });
    }

    if (metric.profitMargin < 0) {
      insights.push({
        type: "warning",
        title: "Negative Profit Margin",
        description: `${metric.branchName} is operating at a loss`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "profitMargin",
        value: metric.profitMargin,
      });
    }

    if (metric.revenueGrowth > 20) {
      insights.push({
        type: "success",
        title: "Strong Revenue Growth",
        description: `${metric.branchName} shows ${metric.revenueGrowth.toFixed(1)}% revenue growth`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "revenueGrowth",
        value: metric.revenueGrowth,
      });
    }
  });

  return insights;
};

export const useBranchMetricsQuery = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { allBranches } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);
  const dateFrom = dateFromStr;
  const dateTo = dateToStr;

  return useQuery({
    queryKey: ["branch-metrics", period, customDateFrom, customDateTo],
    queryFn: async () => {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      const metrics = await Promise.all(
        activeBranches.map((branch) =>
          fetchBranchMetrics(branch.id, branch.name, dateFrom, dateTo)
        )
      );
      const insights = generateInsights(metrics);
      return { metrics, insights };
    },
    enabled: enabled && (allBranches?.length || 0) > 0,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useBranchTimeSeriesQuery = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { allBranches } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);

  return useQuery({
    queryKey: ["branch-timeseries", period, customDateFrom, customDateTo],
    queryFn: async () => {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      const branchIds = activeBranches.map((b) => b.id);
      return generateTimeSeriesData(branchIds, dateFromStr, dateToStr);
    },
    enabled: enabled && (allBranches?.length || 0) > 0,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useBranchTrainerMetricsQuery = (
  branchId: string | "all",
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { allBranches } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);

  return useQuery({
    queryKey: ["branch-trainer-metrics", branchId, period, customDateFrom, customDateTo],
    queryFn: async () => {
      // Implementation for trainer metrics - simplified for now
      // This would need the full trainer metrics logic from BranchAnalytics
      return [] as TrainerMetrics[];
    },
    enabled: enabled && branchId !== null,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};
