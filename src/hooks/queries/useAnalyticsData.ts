/**
 * Aggregated Analytics Query Hook
 * Single API call - edge function returns fully computed chart-ready data
 */
import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";

const ANALYTICS_STALE_TIME = 1000 * 60 * 30;
const ANALYTICS_GC_TIME = 1000 * 60 * 60;

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  payments: number;
}

export interface MemberGrowth {
  month: string;
  members: number;
  newMembers: number;
}

export interface TrainerStats {
  name: string;
  id: string;
  members: number;
  revenue: number;
  monthlyRevenue: MonthlyRevenue[];
}

export interface PackageSalesData {
  month: string;
  [key: string]: number | string;
}

export interface PackageInfo {
  id: string;
  label: string;
  months: number;
}

export interface AnalyticsTotals {
  totalRevenue: number;
  totalMembers: number;
  activeMembers: number;
  avgRevenue: number;
}

export type AnalyticsGranularity = "day" | "week" | "month";

export interface IntervalMeta {
  startISO: string;
  endISO: string;
}

export interface AnalyticsData {
  revenueData: MonthlyRevenue[];
  memberGrowth: MemberGrowth[];
  trainerStats: TrainerStats[];
  packageSalesData: PackageSalesData[];
  packageList: PackageInfo[];
  totals: AnalyticsTotals;
  granularity?: AnalyticsGranularity;
  intervalMeta?: Record<string, IntervalMeta>;
}

export const useAggregatedAnalyticsQuery = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { currentBranch } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);

  return useQuery<AnalyticsData>({
    queryKey: ["analytics-aggregated", currentBranch?.id, period, customDateFrom, customDateTo],
    queryFn: async () => {
      // Edge function now returns fully computed chart-ready data
      return await protectedFetch<AnalyticsData>({
        action: "analytics-data",
        params: { branchId: currentBranch?.id, dateFrom: dateFromStr, dateTo: dateToStr },
      });
    },
    enabled: enabled && !!currentBranch?.id,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Derived hooks for individual sections (all share one query)
export const useAggregatedAnalyticsTotals = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return { ...query, data: query.data?.totals };
};

export const useAggregatedAnalyticsRevenue = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.revenueData,
    granularity: query.data?.granularity,
    intervalMeta: query.data?.intervalMeta,
  };
};

export const useAggregatedAnalyticsMemberGrowth = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.memberGrowth,
    granularity: query.data?.granularity,
    intervalMeta: query.data?.intervalMeta,
  };
};

export const useAggregatedAnalyticsTrainerStats = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return { ...query, data: query.data?.trainerStats };
};

export const useAggregatedAnalyticsPackageSales = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: { packageSalesData: query.data?.packageSalesData, packageList: query.data?.packageList },
    granularity: query.data?.granularity,
    intervalMeta: query.data?.intervalMeta,
  };
};
