/**
 * Aggregated Analytics Query Hook
 * Single API call to fetch all analytics data from the edge function
 */
import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";
import { format, differenceInDays, parseISO, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from "date-fns";

const ANALYTICS_STALE_TIME = 1000 * 60 * 30;
const ANALYTICS_GC_TIME = 1000 * 60 * 60;

interface RawAnalyticsResponse {
  payments: Array<{ amount: number; created_at: string }>;
  membersInRange: Array<{ created_at: string }>;
  membersBefore: number;
  totalMembers: number;
  activeMembers: number;
  trainers: Array<{ id: string; name: string }>;
  ptSubscriptions: Array<{ personal_trainer_id: string; member_id: string; total_fee: number; created_at: string; status: string }>;
  monthlyPackages: Array<{ id: string; months: number; price: number }>;
  subscriptionsInRange: Array<{ plan_months: number; created_at: string; is_custom_package: boolean }>;
}

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

export interface AnalyticsData {
  revenueData: MonthlyRevenue[];
  memberGrowth: MemberGrowth[];
  trainerStats: TrainerStats[];
  packageSalesData: PackageSalesData[];
  packageList: PackageInfo[];
  totals: AnalyticsTotals;
}

const getTimeIntervals = (dateFrom: Date, dateTo: Date) => {
  const daysDiff = differenceInDays(dateTo, dateFrom);
  if (daysDiff <= 14) {
    return eachDayOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
      date, label: format(date, "dd MMM"), key: format(date, "yyyy-MM-dd"),
    }));
  } else if (daysDiff <= 90) {
    return eachWeekOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
      date, label: format(date, "dd MMM"), key: format(date, "yyyy-'W'ww"),
    }));
  } else {
    return eachMonthOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
      date, label: format(date, "MMM yy"), key: format(date, "yyyy-MM"),
    }));
  }
};

function processAnalyticsData(raw: RawAnalyticsResponse, dateFrom: Date, dateTo: Date): AnalyticsData {
  const intervals = getTimeIntervals(dateFrom, dateTo);
  const daysDiff = differenceInDays(dateTo, dateFrom);

  const getLabel = (date: Date) => {
    if (daysDiff <= 14) return format(date, "dd MMM");
    if (daysDiff <= 90) {
      const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
        .find((w, i, arr) => { const next = arr[i + 1]; return date >= w && (!next || date < next); });
      return weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
    }
    return format(date, "MMM yy");
  };

  // Revenue data
  const revenueByInterval: Record<string, { revenue: number; payments: number }> = {};
  intervals.forEach(i => { revenueByInterval[i.label] = { revenue: 0, payments: 0 }; });
  raw.payments.forEach(p => {
    const label = getLabel(new Date(p.created_at));
    if (revenueByInterval[label]) { revenueByInterval[label].revenue += Number(p.amount); revenueByInterval[label].payments += 1; }
  });
  const revenueData = intervals.map(i => ({ month: i.label, revenue: revenueByInterval[i.label]?.revenue || 0, payments: revenueByInterval[i.label]?.payments || 0 }));

  // Member growth
  const membersByInterval: Record<string, number> = {};
  intervals.forEach(i => { membersByInterval[i.label] = 0; });
  raw.membersInRange.forEach(m => {
    const label = getLabel(new Date(m.created_at));
    if (membersByInterval[label] !== undefined) membersByInterval[label] += 1;
  });
  let cumulative = raw.membersBefore;
  const memberGrowth = intervals.map(i => {
    cumulative += membersByInterval[i.label] || 0;
    return { month: i.label, members: cumulative, newMembers: membersByInterval[i.label] || 0 };
  });

  // Totals
  const totalRevenue = raw.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const periodDays = Math.max(1, daysDiff);
  const totals: AnalyticsTotals = {
    totalRevenue, totalMembers: raw.totalMembers, activeMembers: raw.activeMembers,
    avgRevenue: (totalRevenue / periodDays) * 30,
  };

  // Trainer stats
  let trainerStats: TrainerStats[] = [];
  if (raw.trainers.length > 0 && raw.ptSubscriptions.length > 0) {
    trainerStats = raw.trainers.map(trainer => {
      const subs = raw.ptSubscriptions.filter(s => s.personal_trainer_id === trainer.id);
      const uniqueMembers = new Set(subs.map(s => s.member_id)).size;
      const revenue = subs.reduce((sum, s) => sum + Number(s.total_fee || 0), 0);
      const trainerRevenue: Record<string, number> = {};
      intervals.forEach(i => { trainerRevenue[i.label] = 0; });
      subs.forEach(s => {
        const label = getLabel(new Date(s.created_at));
        if (trainerRevenue[label] !== undefined) trainerRevenue[label] += Number(s.total_fee || 0);
      });
      return {
        id: trainer.id, name: trainer.name, members: uniqueMembers, revenue,
        monthlyRevenue: intervals.map(i => ({ month: i.label, revenue: trainerRevenue[i.label] || 0, payments: 0 })),
      };
    }).filter(t => t.members > 0 || t.revenue > 0);
  }

  // Package sales
  let packageSalesData: PackageSalesData[] = [];
  const packageList: PackageInfo[] = raw.monthlyPackages.map(pkg => ({
    id: pkg.id, label: `${pkg.months} Month${pkg.months > 1 ? "s" : ""}`, months: pkg.months,
  }));
  if (packageList.length > 0) {
    const packageSales: Record<string, Record<number, number>> = {};
    intervals.forEach(i => { packageSales[i.label] = {}; packageList.forEach(p => { packageSales[i.label][p.months] = 0; }); });
    raw.subscriptionsInRange.filter(s => !s.is_custom_package).forEach(s => {
      const label = getLabel(new Date(s.created_at));
      if (packageSales[label]?.[s.plan_months] !== undefined) packageSales[label][s.plan_months] += 1;
    });
    packageSalesData = intervals.map(i => {
      const dp: PackageSalesData = { month: i.label };
      packageList.forEach(p => { dp[p.label] = packageSales[i.label][p.months] || 0; });
      return dp;
    });
  }

  return { revenueData, memberGrowth, trainerStats, packageSalesData, packageList, totals };
}

export const useAggregatedAnalyticsQuery = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { currentBranch } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);
  const dateFrom = parseISO(dateFromStr);
  const dateTo = parseISO(dateToStr);

  return useQuery<AnalyticsData>({
    queryKey: ["analytics-aggregated", currentBranch?.id, period, customDateFrom, customDateTo],
    queryFn: async () => {
      const raw = await protectedFetch<RawAnalyticsResponse>({
        action: "analytics-data",
        params: { branchId: currentBranch?.id, dateFrom: dateFromStr, dateTo: dateToStr },
      });
      return processAnalyticsData(raw, dateFrom, dateTo);
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
  return { ...query, data: query.data?.revenueData };
};

export const useAggregatedAnalyticsMemberGrowth = (
  period: PeriodType, customDateFrom: string, customDateTo: string, enabled = true
) => {
  const query = useAggregatedAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return { ...query, data: query.data?.memberGrowth };
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
  return { ...query, data: { packageSalesData: query.data?.packageSalesData, packageList: query.data?.packageList } };
};
