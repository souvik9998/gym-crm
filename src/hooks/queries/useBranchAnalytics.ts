import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { format, parseISO, differenceInDays, subDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from "date-fns";
import { PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";

const ANALYTICS_STALE_TIME = 1000 * 60 * 30;
const ANALYTICS_GC_TIME = 1000 * 60 * 60;

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

interface BranchAnalyticsResponse {
  branchMetrics: BranchMetrics[];
  trainerMetrics: TrainerMetrics[];
}

const generateInsights = (metrics: BranchMetrics[]): Insight[] => {
  const insights: Insight[] = [];
  metrics.forEach((metric) => {
    if (metric.previousPeriodRevenue > 0 && metric.revenueGrowth < -10) {
      insights.push({ type: "warning", title: "Revenue Drop Detected", description: `Revenue decreased by ${Math.abs(metric.revenueGrowth).toFixed(1)}% compared to previous period.`, branchId: metric.branchId, branchName: metric.branchName, metric: "revenue", value: metric.revenueGrowth });
    }
    if (metric.churnRate > 15) {
      insights.push({ type: "warning", title: "High Churn Rate", description: `Churn rate is ${metric.churnRate.toFixed(1)}%, above the 15% threshold.`, branchId: metric.branchId, branchName: metric.branchName, metric: "churn", value: metric.churnRate });
    }
    if (metric.newMembers > 0 && metric.conversionRate < 20) {
      insights.push({ type: "warning", title: "Low Conversion Rate", description: `Conversion rate is ${metric.conversionRate.toFixed(1)}%.`, branchId: metric.branchId, branchName: metric.branchName, metric: "conversion", value: metric.conversionRate });
    }
    if (metric.revenue > 0 && metric.profitMargin < 0) {
      insights.push({ type: "warning", title: "Negative Profit Margin", description: `Operating at a loss with ${Math.abs(metric.profitMargin).toFixed(1)}% negative margin.`, branchId: metric.branchId, branchName: metric.branchName, metric: "profit", value: metric.profitMargin });
    }
    if (metric.previousPeriodRevenue > 0 && metric.revenueGrowth > 20) {
      insights.push({ type: "success", title: "Strong Revenue Growth", description: `Revenue increased by ${metric.revenueGrowth.toFixed(1)}% compared to previous period.`, branchId: metric.branchId, branchName: metric.branchName, metric: "revenue", value: metric.revenueGrowth });
    }
    if (metric.churnRate < 5 && metric.churnRate > 0) {
      insights.push({ type: "success", title: "Excellent Retention", description: `Churn rate is only ${metric.churnRate.toFixed(1)}%.`, branchId: metric.branchId, branchName: metric.branchName, metric: "churn", value: metric.churnRate });
    }
  });
  return insights.sort((a, b) => {
    const priority = { warning: 3, info: 2, success: 1 };
    return priority[b.type] - priority[a.type];
  });
};

/**
 * Primary hook: fetches all branch + trainer metrics via single edge function call
 */
export function useBranchAnalyticsData(
  dateFrom: string,
  dateTo: string,
  prevFrom: string,
  prevTo: string,
  enabled: boolean
) {
  return useQuery<BranchAnalyticsResponse & { insights: Insight[] }>({
    queryKey: ["branch-analytics-data", dateFrom, dateTo, prevFrom, prevTo],
    queryFn: async () => {
      const data = await protectedFetch<BranchAnalyticsResponse>({
        action: "branch-analytics-data",
        params: { dateFrom, dateTo, prevFrom, prevTo },
      });
      const insights = generateInsights(data.branchMetrics);
      return { ...data, insights };
    },
    enabled,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Time series data - still fetched client-side since it needs per-payment granularity
 */
export const useBranchTimeSeriesQuery = (
  dateFrom: string,
  dateTo: string,
  enabled: boolean = true
) => {
  const { allBranches } = useBranch();

  return useQuery({
    queryKey: ["branch-timeseries", dateFrom, dateTo],
    queryFn: async () => {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      const branchIds = activeBranches.map((b) => b.id);
      if (branchIds.length === 0) return [];

      const startDate = parseISO(dateFrom);
      const endDate = parseISO(dateTo);
      const days = differenceInDays(endDate, startDate);
      const groupBy = days <= 30 ? "day" : days <= 90 ? "week" : "month";

      const paymentsResults = await Promise.all(
        branchIds.map((branchId) =>
          supabase
            .from("payments")
            .select("amount, created_at, branch_id")
            .eq("branch_id", branchId)
            .eq("status", "success")
            .gte("created_at", `${dateFrom}T00:00:00`)
            .lte("created_at", `${dateTo}T23:59:59`)
            .order("created_at", { ascending: true })
        )
      );

      const branchNameMap: Record<string, string> = {};
      activeBranches.forEach((b) => { branchNameMap[b.id] = b.name; });

      const branchData: Record<string, Record<string, number>> = {};
      branchIds.forEach((id) => { branchData[id] = {}; });

      paymentsResults.forEach(({ data: payments }, index) => {
        const branchId = branchIds[index];
        payments?.forEach((payment) => {
          const date = new Date(payment.created_at);
          const key = groupBy === "day" ? format(date, "MMM dd") : groupBy === "week" ? `Week ${format(date, "w")}` : format(date, "MMM yyyy");
          branchData[branchId][key] = (branchData[branchId][key] || 0) + Number(payment.amount || 0);
        });
      });

      const allDates = new Set<string>();
      Object.values(branchData).forEach((data) => Object.keys(data).forEach((d) => allDates.add(d)));

      return Array.from(allDates).sort().map((date) => {
        const dataPoint: TimeSeriesData = { date };
        activeBranches.forEach((branch) => {
          dataPoint[branch.name] = branchData[branch.id][date] || 0;
        });
        return dataPoint;
      });
    },
    enabled: enabled && (allBranches?.length || 0) > 0,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
  });
};
