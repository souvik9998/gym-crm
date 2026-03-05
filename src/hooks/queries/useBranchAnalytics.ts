/**
 * Branch Analytics Query Hook
 * Single API call returns branch metrics, trainer metrics, AND time series
 */
import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";

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
  timeSeries: TimeSeriesData[];
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
 * Primary hook: fetches ALL branch analytics in a single edge function call
 * Returns branch metrics, trainer metrics, time series, and computed insights
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
 * @deprecated Use useBranchAnalyticsData which now includes timeSeries
 */
export const useBranchTimeSeriesQuery = (
  dateFrom: string,
  dateTo: string,
  enabled: boolean = true
) => {
  // This is now a no-op that returns empty data
  // Time series is included in useBranchAnalyticsData response
  return useQuery<TimeSeriesData[]>({
    queryKey: ["branch-timeseries-deprecated", dateFrom, dateTo],
    queryFn: async () => [],
    enabled: false, // Never actually fetches
    staleTime: Infinity,
  });
};
