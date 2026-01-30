import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInDays, parseISO } from "date-fns";
import { PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";

// Long stale time for analytics (30 minutes) - analytics data doesn't change frequently
const ANALYTICS_STALE_TIME = 1000 * 60 * 30;
const ANALYTICS_GC_TIME = 1000 * 60 * 60; // 1 hour cache

interface MonthlyRevenue {
  month: string;
  revenue: number;
  payments: number;
}

interface MemberGrowth {
  month: string;
  members: number;
  newMembers: number;
}

interface TrainerStats {
  name: string;
  id: string;
  members: number;
  revenue: number;
  monthlyRevenue: MonthlyRevenue[];
}

interface PackageSalesData {
  month: string;
  [key: string]: number | string;
}

interface PackageInfo {
  id: string;
  label: string;
  months: number;
}

interface AnalyticsTotals {
  totalRevenue: number;
  totalMembers: number;
  activeMembers: number;
  avgRevenue: number;
}

interface AnalyticsData {
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
      date,
      label: format(date, "dd MMM"),
      key: format(date, "yyyy-MM-dd")
    }));
  } else if (daysDiff <= 90) {
    return eachWeekOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
      date,
      label: format(date, "dd MMM"),
      key: format(date, "yyyy-'W'ww")
    }));
  } else {
    return eachMonthOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
      date,
      label: format(date, "MMM yy"),
      key: format(date, "yyyy-MM")
    }));
  }
};

const fetchAnalyticsData = async (
  branchId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<AnalyticsData> => {
  const intervals = getTimeIntervals(dateFrom, dateTo);
  const daysDiff = differenceInDays(dateTo, dateFrom);

  // Fetch payments
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, created_at, status")
    .eq("branch_id", branchId)
    .eq("status", "success")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString())
    .order("created_at", { ascending: true });

  // Build revenue data
  const revenueByInterval: Record<string, { revenue: number; payments: number }> = {};
  intervals.forEach(interval => {
    revenueByInterval[interval.label] = { revenue: 0, payments: 0 };
  });

  payments?.forEach((payment) => {
    const date = new Date(payment.created_at);
    let label: string;
    
    if (daysDiff <= 14) {
      label = format(date, "dd MMM");
    } else if (daysDiff <= 90) {
      const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
        .find((w, i, arr) => {
          const nextWeek = arr[i + 1];
          return date >= w && (!nextWeek || date < nextWeek);
        });
      label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
    } else {
      label = format(date, "MMM yy");
    }
    
    if (revenueByInterval[label]) {
      revenueByInterval[label].revenue += Number(payment.amount);
      revenueByInterval[label].payments += 1;
    }
  });

  const revenueData = intervals.map((interval) => ({
    month: interval.label,
    revenue: revenueByInterval[interval.label]?.revenue || 0,
    payments: revenueByInterval[interval.label]?.payments || 0,
  }));

  // Fetch members
  const { data: members } = await supabase
    .from("members")
    .select("created_at")
    .eq("branch_id", branchId)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString())
    .order("created_at", { ascending: true });

  const { count: membersBefore } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .lt("created_at", dateFrom.toISOString());

  const membersByInterval: Record<string, number> = {};
  intervals.forEach((interval) => (membersByInterval[interval.label] = 0));

  members?.forEach((member) => {
    const date = new Date(member.created_at);
    let label: string;
    
    if (daysDiff <= 14) {
      label = format(date, "dd MMM");
    } else if (daysDiff <= 90) {
      const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
        .find((w, i, arr) => {
          const nextWeek = arr[i + 1];
          return date >= w && (!nextWeek || date < nextWeek);
        });
      label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
    } else {
      label = format(date, "MMM yy");
    }
    
    if (membersByInterval[label] !== undefined) {
      membersByInterval[label] += 1;
    }
  });

  let cumulative = membersBefore || 0;
  const memberGrowth = intervals.map((interval) => {
    cumulative += membersByInterval[interval.label] || 0;
    return {
      month: interval.label,
      members: cumulative,
      newMembers: membersByInterval[interval.label] || 0,
    };
  });

  // Calculate totals
  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const { count: totalMembers } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);
  const { count: activeMembers } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId)
    .eq("status", "active");

  const periodDays = Math.max(1, daysDiff);
  const avgDailyRevenue = totalRevenue / periodDays;

  const totals: AnalyticsTotals = {
    totalRevenue,
    totalMembers: totalMembers || 0,
    activeMembers: activeMembers || 0,
    avgRevenue: avgDailyRevenue * 30,
  };

  // Fetch trainer stats
  const { data: trainers } = await supabase
    .from("personal_trainers")
    .select("id, name")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  const { data: ptSubscriptions } = await supabase
    .from("pt_subscriptions")
    .select("personal_trainer_id, member_id, total_fee, created_at, status")
    .eq("branch_id", branchId)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  let trainerStats: TrainerStats[] = [];
  if (trainers && ptSubscriptions) {
    trainerStats = trainers.map((trainer) => {
      const trainerSubs = ptSubscriptions.filter(
        (sub) => sub.personal_trainer_id === trainer.id
      );
      const uniqueMembers = new Set(trainerSubs.map((sub) => sub.member_id)).size;
      const trainerRevenue = trainerSubs.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0);

      const trainerIntervalRevenue: Record<string, number> = {};
      intervals.forEach((interval) => (trainerIntervalRevenue[interval.label] = 0));

      trainerSubs.forEach((sub) => {
        const date = new Date(sub.created_at);
        let label: string;
        
        if (daysDiff <= 14) {
          label = format(date, "dd MMM");
        } else if (daysDiff <= 90) {
          const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
            .find((w, i, arr) => {
              const nextWeek = arr[i + 1];
              return date >= w && (!nextWeek || date < nextWeek);
            });
          label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
        } else {
          label = format(date, "MMM yy");
        }
        
        if (trainerIntervalRevenue[label] !== undefined) {
          trainerIntervalRevenue[label] += Number(sub.total_fee || 0);
        }
      });

      return {
        id: trainer.id,
        name: trainer.name,
        members: uniqueMembers,
        revenue: trainerRevenue,
        monthlyRevenue: intervals.map((interval) => ({
          month: interval.label,
          revenue: trainerIntervalRevenue[interval.label] || 0,
          payments: 0,
        })),
      };
    }).filter((t) => t.members > 0 || t.revenue > 0);
  }

  // Fetch package sales
  const { data: monthlyPackages } = await supabase
    .from("monthly_packages")
    .select("id, months, price")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("months", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("plan_months, created_at, is_custom_package")
    .eq("branch_id", branchId)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  let packageSalesData: PackageSalesData[] = [];
  let packageList: PackageInfo[] = [];
  
  if (monthlyPackages && subscriptions) {
    packageList = monthlyPackages.map((pkg) => ({
      id: pkg.id,
      label: `${pkg.months} Month${pkg.months > 1 ? "s" : ""}`,
      months: pkg.months,
    }));

    const packageSales: Record<string, Record<number, number>> = {};
    intervals.forEach((interval) => {
      packageSales[interval.label] = {};
      packageList.forEach((pkg) => {
        packageSales[interval.label][pkg.months] = 0;
      });
    });

    subscriptions
      .filter((sub) => !sub.is_custom_package)
      .forEach((sub) => {
        const date = new Date(sub.created_at);
        let label: string;
        
        if (daysDiff <= 14) {
          label = format(date, "dd MMM");
        } else if (daysDiff <= 90) {
          const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
            .find((w, i, arr) => {
              const nextWeek = arr[i + 1];
              return date >= w && (!nextWeek || date < nextWeek);
            });
          label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
        } else {
          label = format(date, "MMM yy");
        }
        
        if (packageSales[label] && packageSales[label][sub.plan_months] !== undefined) {
          packageSales[label][sub.plan_months] += 1;
        }
      });

    packageSalesData = intervals.map((interval) => {
      const dataPoint: PackageSalesData = { month: interval.label };
      packageList.forEach((pkg) => {
        dataPoint[pkg.label] = packageSales[interval.label][pkg.months] || 0;
      });
      return dataPoint;
    });
  }

  return {
    revenueData,
    memberGrowth,
    trainerStats,
    packageSalesData,
    packageList,
    totals,
  };
};

export const useAnalyticsQuery = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const { currentBranch } = useBranch();
  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);
  const dateFrom = parseISO(dateFromStr);
  const dateTo = parseISO(dateToStr);

  return useQuery({
    queryKey: ["analytics", currentBranch?.id, period, customDateFrom, customDateTo],
    queryFn: () => fetchAnalyticsData(currentBranch!.id, dateFrom, dateTo),
    enabled: enabled && !!currentBranch?.id,
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Separate hooks for individual sections
export const useAnalyticsTotals = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const query = useAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.totals,
  };
};

export const useAnalyticsRevenue = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const query = useAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.revenueData,
  };
};

export const useAnalyticsMemberGrowth = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const query = useAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.memberGrowth,
  };
};

export const useAnalyticsTrainerStats = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const query = useAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: query.data?.trainerStats,
  };
};

export const useAnalyticsPackageSales = (
  period: PeriodType,
  customDateFrom: string,
  customDateTo: string,
  enabled: boolean = true
) => {
  const query = useAnalyticsQuery(period, customDateFrom, customDateTo, enabled);
  return {
    ...query,
    data: {
      packageSalesData: query.data?.packageSalesData,
      packageList: query.data?.packageList,
    },
  };
};

export type {
  AnalyticsData,
  AnalyticsTotals,
  MonthlyRevenue,
  MemberGrowth,
  TrainerStats,
  PackageSalesData,
  PackageInfo,
};
