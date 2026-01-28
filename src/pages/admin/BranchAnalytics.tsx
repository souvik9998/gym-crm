import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch, type Branch } from "@/contexts/BranchContext";
import { useDebounce } from "@/hooks/useDebounce";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
} from "recharts";
import {
  BuildingOffice2Icon,
  CurrencyRupeeIcon,
  UsersIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChartBarIcon,
  UserGroupIcon,
  SparklesIcon,
  AcademicCapIcon,
  TrophyIcon,
  FireIcon,
} from "@heroicons/react/24/outline";
import { format, subDays, startOfMonth, endOfMonth, parseISO, startOfWeek, endOfWeek, subMonths } from "date-fns";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector, PeriodType, getPeriodDates, getPeriodLabel } from "@/components/admin/PeriodSelector";

interface BranchMetrics {
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

interface Insight {
  type: "warning" | "success" | "info";
  title: string;
  description: string;
  branchId: string;
  branchName: string;
  metric: string;
  value: number;
}

interface TimeSeriesData {
  date: string;
  [key: string]: string | number;
}

interface TrainerMetrics {
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

const COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(262, 83%, 58%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 72%, 51%)",
  "hsl(217, 91%, 60%)",
];

const BranchAnalytics = () => {
  const { allBranches } = useBranch();
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  // Period selection state
  const [period, setPeriod] = useState<PeriodType>("this_month");
  const [customDateFrom, setCustomDateFrom] = useState<string>(
    format(subDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [customDateTo, setCustomDateTo] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  
  // Calculate actual dates based on period selection
  const { from: dateFrom, to: dateTo } = getPeriodDates(period, customDateFrom, customDateTo);
  
  const [branchMetrics, setBranchMetrics] = useState<BranchMetrics[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailBranch, setDetailBranch] = useState<BranchMetrics | null>(null);
  const [trainerMetrics, setTrainerMetrics] = useState<TrainerMetrics[]>([]);
  const [selectedBranchForTrainers, setSelectedBranchForTrainers] = useState<string | "all">("all");
  const [isTrainerDetailOpen, setIsTrainerDetailOpen] = useState(false);
  const [detailTrainer, setDetailTrainer] = useState<TrainerMetrics | null>(null);
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(false);

  // Debounce date changes to avoid excessive API calls
  const debouncedDateFrom = useDebounce(dateFrom, 500);
  const debouncedDateTo = useDebounce(dateTo, 500);

  // Define fetchBranchMetrics first (used by fetchAllBranchMetrics)
  const fetchBranchMetrics = useCallback(async (
    branchId: string,
    branchName: string,
    from: string,
    to: string
  ): Promise<BranchMetrics> => {
    // Execute all queries in parallel for maximum performance
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
      // Revenue - use aggregation if possible, otherwise fetch and sum
      supabase
        .from("payments")
        .select("amount", { count: "exact" })
        .eq("branch_id", branchId)
        .eq("status", "success")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`),
      
      // Expenses
      supabase
        .from("ledger_entries")
        .select("amount")
        .eq("branch_id", branchId)
        .eq("entry_type", "expense")
        .gte("entry_date", from)
        .lte("entry_date", to),
      
      // Total members count (optimized)
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId),
      
      // New members count (optimized)
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`),
      
      // Active subscriptions count (optimized)
      supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("status", "active"),
      
      // Churned members count (optimized)
      supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("status", "expired")
        .gte("end_date", from)
        .lte("end_date", to),
      
      // PT subscriptions count (optimized)
      supabase
        .from("pt_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`),
      
      // Staff count (optimized)
      supabase
        .from("staff_branch_assignments")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", branchId),
      
      // Marketing expenses
      supabase
        .from("ledger_entries")
        .select("amount")
        .eq("branch_id", branchId)
        .eq("entry_type", "expense")
        .ilike("category", "%marketing%")
        .gte("entry_date", from)
        .lte("entry_date", to),
    ]);

    // Calculate revenue from payments
    const revenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    
    // Calculate expenses
    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
    const profit = revenue - totalExpenses;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Use count results
    const newMembers = newMembersCount || 0;
    const churnRate = (totalMembers || 0) > 0 ? ((churnedMembers || 0) / (totalMembers || 0)) * 100 : 0;
    const conversionRate = newMembers > 0 ? Math.min((newMembers / (newMembers + 10)) * 100, 100) : 0;

    // Calculate staff performance
    const staffPerformance = (staffCount || 0) > 0 ? revenue / (staffCount || 1) : 0;

    // Calculate marketing ROI
    const marketingExpense = marketingExpenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
    const marketingROI = marketingExpense > 0 ? ((revenue - marketingExpense) / marketingExpense) * 100 : 0;

    const avgRevenuePerMember = (totalMembers || 0) > 0 ? revenue / (totalMembers || 1) : 0;

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
      previousPeriodRevenue: 0,
      revenueGrowth: 0,
      previousPeriodMembers: 0,
      memberGrowth: 0,
    };
  }, []);

  // Define generateTimeSeriesData (used by fetchAllBranchMetrics)
  const generateTimeSeriesData = useCallback(async () => {
    try {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      if (activeBranches.length === 0) {
        setTimeSeriesData([]);
        return;
      }

      const startDate = new Date(debouncedDateFrom);
      const endDate = new Date(debouncedDateTo);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const groupBy = days <= 30 ? "day" : days <= 90 ? "week" : "month";

      // Fetch all payments for all branches in parallel
      const branchIds = activeBranches.map((b) => b.id);
      const paymentsPromises = branchIds.map((branchId) =>
        supabase
          .from("payments")
          .select("amount, created_at, status")
          .eq("branch_id", branchId)
          .eq("status", "success")
          .gte("created_at", `${debouncedDateFrom}T00:00:00`)
          .lte("created_at", `${debouncedDateTo}T23:59:59`)
          .order("created_at", { ascending: true })
      );

      const paymentsResults = await Promise.all(paymentsPromises);

      const timeSeries: TimeSeriesData[] = [];
      const branchData: Record<string, Record<string, number>> = {};

      // Initialize branch data structure
      branchIds.forEach((branchId) => {
        branchData[branchId] = {};
      });

      // Process payments for each branch
      paymentsResults.forEach(({ data: payments }, index) => {
        const branchId = branchIds[index];
        payments?.forEach((payment) => {
          const date = new Date(payment.created_at);
          const key =
            groupBy === "day"
              ? format(date, "MMM dd")
              : groupBy === "week"
              ? `Week ${format(date, "w")}`
              : format(date, "MMM yyyy");

          if (!branchData[branchId][key]) {
            branchData[branchId][key] = 0;
          }
          branchData[branchId][key] += Number(payment.amount || 0);
        });
      });

      // Get all unique dates
      const allDates = new Set<string>();
      Object.keys(branchData).forEach((branchId) => {
        Object.keys(branchData[branchId]).forEach((date) => allDates.add(date));
      });

      // Create time series data
      Array.from(allDates)
        .sort()
        .forEach((date) => {
          const dataPoint: TimeSeriesData = { date };
          activeBranches.forEach((branch) => {
            dataPoint[branch.name] = branchData[branch.id][date] || 0;
          });
          timeSeries.push(dataPoint);
        });

      setTimeSeriesData(timeSeries);
    } catch (error) {
      console.error("Error generating time series data:", error);
    }
  }, [allBranches, debouncedDateFrom, debouncedDateTo]);

  const fetchAllBranchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      if (activeBranches.length === 0) {
        setBranchMetrics([]);
        setInsights([]);
        setIsLoading(false);
        return;
      }

      // Calculate previous period for comparison
      const currentStart = new Date(debouncedDateFrom);
      const currentEnd = new Date(debouncedDateTo);
      const periodDays = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - periodDays - 1);
      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);

      const previousFrom = format(previousStart, "yyyy-MM-dd");
      const previousTo = format(previousEnd, "yyyy-MM-dd");

      // Fetch all branch metrics in parallel for current period
      const currentMetricsPromises = activeBranches.map((branch) =>
        fetchBranchMetrics(branch.id, branch.name, debouncedDateFrom, debouncedDateTo)
      );

      // Fetch all branch metrics in parallel for previous period
      const previousMetricsPromises = activeBranches.map((branch) =>
        fetchBranchMetrics(branch.id, branch.name, previousFrom, previousTo)
      );

      // Execute both periods in parallel
      const [currentMetricsResults, previousMetricsResults] = await Promise.all([
        Promise.all(currentMetricsPromises),
        Promise.all(previousMetricsPromises),
      ]);

      // Process results and generate insights
      const metrics: BranchMetrics[] = [];
      const allInsights: Insight[] = [];

      for (let i = 0; i < activeBranches.length; i++) {
        const currentMetrics = currentMetricsResults[i];
        const previousMetrics = previousMetricsResults[i];

        const revenueGrowth =
          previousMetrics.revenue > 0
            ? ((currentMetrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) * 100
            : currentMetrics.revenue > 0
            ? 100
            : 0;

        const memberGrowth =
          previousMetrics.totalMembers > 0
            ? ((currentMetrics.totalMembers - previousMetrics.totalMembers) / previousMetrics.totalMembers) * 100
            : currentMetrics.totalMembers > 0
            ? 100
            : 0;

        const metric: BranchMetrics = {
          ...currentMetrics,
          previousPeriodRevenue: previousMetrics.revenue,
          revenueGrowth,
          previousPeriodMembers: previousMetrics.totalMembers,
          memberGrowth,
        };

        metrics.push(metric);

        // Generate insights
        const branchInsights = generateInsights(metric);
        allInsights.push(...branchInsights);
      }

      setBranchMetrics(metrics);
      setInsights(
        allInsights.sort((a, b) => {
          const priority = { warning: 3, info: 2, success: 1 };
          return priority[b.type] - priority[a.type];
        })
      );

      // Generate time series data in parallel (non-blocking)
      generateTimeSeriesData();
    } catch (error) {
      console.error("Error fetching branch metrics:", error);
    } finally {
      setIsLoading(false);
    }
  }, [allBranches, debouncedDateFrom, debouncedDateTo, fetchBranchMetrics, generateTimeSeriesData]);

  useEffect(() => {
    if (allBranches && allBranches.length > 0) {
      fetchAllBranchMetrics();
      fetchTrainerMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBranches, debouncedDateFrom, debouncedDateTo]);

  const generateInsights = (metric: BranchMetrics): Insight[] => {
    const insights: Insight[] = [];

    // Revenue drop alert - only show if there was previous revenue
    if (metric.previousPeriodRevenue > 0 && metric.revenueGrowth < -10) {
      insights.push({
        type: "warning",
        title: "Revenue Drop Detected",
        description: `Revenue decreased by ${Math.abs(metric.revenueGrowth).toFixed(1)}% compared to previous period.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "revenue",
        value: metric.revenueGrowth,
      });
    }

    // High churn rate alert
    if (metric.churnRate > 15) {
      insights.push({
        type: "warning",
        title: "High Churn Rate",
        description: `Churn rate is ${metric.churnRate.toFixed(1)}%, which is above the healthy threshold of 15%.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "churn",
        value: metric.churnRate,
      });
    }

    // Low conversion rate alert - only show if there are leads
    if (metric.newMembers > 0 && metric.conversionRate < 20) {
      insights.push({
        type: "warning",
        title: "Low Conversion Rate",
        description: `Conversion rate is ${metric.conversionRate.toFixed(1)}%, indicating potential issues with lead quality or sales process.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "conversion",
        value: metric.conversionRate,
      });
    }

    // Negative profit margin - only show if there's revenue
    if (metric.revenue > 0 && metric.profitMargin < 0) {
      insights.push({
        type: "warning",
        title: "Negative Profit Margin",
        description: `Branch is operating at a loss with ${Math.abs(metric.profitMargin).toFixed(1)}% negative margin.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "profit",
        value: metric.profitMargin,
      });
    }

    // Positive growth - only show if there was previous revenue (not just new revenue)
    if (metric.previousPeriodRevenue > 0 && metric.revenueGrowth > 20) {
      insights.push({
        type: "success",
        title: "Strong Revenue Growth",
        description: `Revenue increased by ${metric.revenueGrowth.toFixed(1)}% compared to previous period.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "revenue",
        value: metric.revenueGrowth,
      });
    }

    // Low churn rate success
    if (metric.churnRate < 5 && metric.churnRate > 0) {
      insights.push({
        type: "success",
        title: "Excellent Retention",
        description: `Churn rate is only ${metric.churnRate.toFixed(1)}%, indicating strong member retention.`,
        branchId: metric.branchId,
        branchName: metric.branchName,
        metric: "churn",
        value: metric.churnRate,
      });
    }

    return insights;
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString("en-IN")}`;
  };

  // Memoize expensive calculations
  const bestPerformer = useMemo(() => {
    if (branchMetrics.length === 0) return null;
    return branchMetrics.reduce((best, current) =>
      current.revenue > best.revenue ? current : best
    );
  }, [branchMetrics]);

  const worstPerformer = useMemo(() => {
    if (branchMetrics.length === 0) return null;
    return branchMetrics.reduce((worst, current) =>
      current.revenue < worst.revenue ? current : worst
    );
  }, [branchMetrics]);

  const fetchTrainerMetrics = useCallback(async () => {
    setIsLoadingTrainers(true);
    try {
      const activeBranches = (allBranches || []).filter((b) => b.is_active && !b.deleted_at);
      if (activeBranches.length === 0) {
        setTrainerMetrics([]);
        setIsLoadingTrainers(false);
        return;
      }

      // Calculate previous period for comparison
      const currentStart = new Date(debouncedDateFrom);
      const currentEnd = new Date(debouncedDateTo);
      const periodDays = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - periodDays - 1);
      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);

      const previousFrom = format(previousStart, "yyyy-MM-dd");
      const previousTo = format(previousEnd, "yyyy-MM-dd");
      const branchIds = activeBranches.map((b) => b.id);

      // Fetch all trainers from active branches in one query
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name, branch_id, payment_category, percentage_fee, session_fee, monthly_salary")
        .eq("is_active", true)
        .in("branch_id", branchIds);

      if (!trainers || trainers.length === 0) {
        setTrainerMetrics([]);
        setIsLoadingTrainers(false);
        return;
      }

      // Fetch all trainer data in parallel batches
      const trainerMetricsPromises = trainers.map(async (trainer) => {
        const branch = activeBranches.find((b) => b.id === trainer.branch_id);
        if (!branch) return null;

        // Fetch all trainer data in parallel
        const [
          { data: currentPtSubs },
          { data: allPtSubs },
          { data: previousPtSubs },
        ] = await Promise.all([
          supabase
            .from("pt_subscriptions")
            .select("id, member_id, total_fee, created_at, status, start_date, end_date")
            .eq("personal_trainer_id", trainer.id)
            .eq("branch_id", trainer.branch_id)
            .gte("created_at", `${debouncedDateFrom}T00:00:00`)
            .lte("created_at", `${debouncedDateTo}T23:59:59`),
          
          supabase
            .from("pt_subscriptions")
            .select("id, member_id, total_fee, created_at, status, start_date, end_date")
            .eq("personal_trainer_id", trainer.id)
            .eq("branch_id", trainer.branch_id),
          
          supabase
            .from("pt_subscriptions")
            .select("id, member_id, total_fee, created_at")
            .eq("personal_trainer_id", trainer.id)
            .eq("branch_id", trainer.branch_id)
            .gte("created_at", `${previousFrom}T00:00:00`)
            .lte("created_at", `${previousTo}T23:59:59`),
        ]);

        const currentRevenue = currentPtSubs?.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0) || 0;
        const previousRevenue = previousPtSubs?.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0) || 0;
        const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : currentRevenue > 0 ? 100 : 0;

        const uniqueCurrentClients = new Set(currentPtSubs?.map((sub) => sub.member_id) || []).size;
        const uniqueAllClients = new Set(allPtSubs?.map((sub) => sub.member_id) || []).size;
        const uniquePreviousClients = new Set(previousPtSubs?.map((sub) => sub.member_id) || []).size;
        const clientGrowth = uniquePreviousClients > 0 ? ((uniqueCurrentClients - uniquePreviousClients) / uniquePreviousClients) * 100 : uniqueCurrentClients > 0 ? 100 : 0;

        // Calculate active clients (subscriptions with active status)
        const activeSubs = allPtSubs?.filter((sub) => sub.status === "active") || [];
        const activeClients = new Set(activeSubs.map((sub) => sub.member_id)).size;

        // Calculate new clients in current period
        const newClients = uniqueCurrentClients;

        // Calculate churned clients (expired subscriptions in current period)
        const churnedSubs = allPtSubs?.filter(
          (sub) =>
            sub.status === "expired" &&
            new Date(sub.end_date) >= new Date(debouncedDateFrom) &&
            new Date(sub.end_date) <= new Date(debouncedDateTo)
        ) || [];
        const churnedClients = churnedSubs.length;

        // Calculate client retention rate
        const retentionRate =
          uniqueAllClients > 0
            ? ((uniqueAllClients - churnedClients) / uniqueAllClients) * 100
            : 100;

        // Calculate renewal rate (simplified - based on active subscriptions)
        const renewalRate = uniqueAllClients > 0 ? (activeClients / uniqueAllClients) * 100 : 0;

        // Calculate average revenue per client
        const avgRevenuePerClient = uniqueCurrentClients > 0 ? currentRevenue / uniqueCurrentClients : 0;

        // Calculate total sessions (number of subscriptions)
        const totalSessions = currentPtSubs?.length || 0;
        const avgRevenuePerSession = totalSessions > 0 ? currentRevenue / totalSessions : 0;

        // Calculate efficiency score (composite metric: revenue + retention + growth)
        const efficiencyScore =
          (revenueGrowth * 0.4 + retentionRate * 0.3 + (clientGrowth > 0 ? clientGrowth : 0) * 0.3) / 100;

        return {
          trainerId: trainer.id,
          trainerName: trainer.name,
          branchId: trainer.branch_id || "",
          branchName: branch.name,
          revenue: currentRevenue,
          activeClients,
          totalClients: uniqueAllClients,
          newClients,
          churnedClients,
          clientRetentionRate: retentionRate,
          avgRevenuePerClient,
          avgRevenuePerSession,
          totalSessions,
          renewalRate,
          clientGrowthRate: clientGrowth,
          efficiencyScore: efficiencyScore * 100,
          paymentCategory: trainer.payment_category || "monthly_percentage",
          percentageFee: trainer.percentage_fee || 0,
          sessionFee: trainer.session_fee || 0,
          monthlySalary: trainer.monthly_salary || 0,
          previousPeriodRevenue: previousRevenue,
          revenueGrowth,
          previousPeriodClients: uniquePreviousClients,
          clientGrowth,
        };
      });

      // Wait for all trainer metrics to be calculated in parallel
      const metricsResults = await Promise.all(trainerMetricsPromises);
      const metrics = metricsResults.filter((m): m is TrainerMetrics => m !== null);

      // Sort by efficiency score descending
      metrics.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
      setTrainerMetrics(metrics);
    } catch (error) {
      console.error("Error fetching trainer metrics:", error);
    } finally {
      setIsLoadingTrainers(false);
    }
  }, [allBranches, debouncedDateFrom, debouncedDateTo]);

  const openBranchDetail = (branch: BranchMetrics) => {
    setDetailBranch(branch);
    setIsDetailOpen(true);
  };

  const openTrainerDetail = (trainer: TrainerMetrics) => {
    setDetailTrainer(trainer);
    setIsTrainerDetailOpen(true);
  };

  // Memoize filtered trainer metrics
  const filteredTrainerMetrics = useMemo(() => {
    return selectedBranchForTrainers === "all"
      ? trainerMetrics
      : trainerMetrics.filter((t) => t.branchId === selectedBranchForTrainers);
  }, [trainerMetrics, selectedBranchForTrainers]);

  // Memoize best/worst trainers - only show worst if different from best
  const bestTrainer = useMemo(() => {
    if (filteredTrainerMetrics.length === 0) return null;
    return filteredTrainerMetrics.reduce((best, current) =>
      current.efficiencyScore > best.efficiencyScore ? current : best
    );
  }, [filteredTrainerMetrics]);

  const worstTrainer = useMemo(() => {
    // Only show worst trainer if there are at least 2 trainers and the worst is different from best
    if (filteredTrainerMetrics.length < 2) return null;
    const worst = filteredTrainerMetrics.reduce((worst, current) =>
      current.efficiencyScore < worst.efficiencyScore ? current : worst
    );
    // Don't show worst if it's the same as best (same efficiency score)
    if (bestTrainer && worst.trainerId === bestTrainer.trainerId) return null;
    return worst;
  }, [filteredTrainerMetrics, bestTrainer]);

  return (
    <AdminLayout title="Branch Analytics" subtitle="Comprehensive multi-branch performance insights">
      <div className="space-y-6">
        {/* Header with Period Selector */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">Branch Performance Dashboard</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Compare branches, track trends, and identify opportunities
            </p>
          </div>
          <div className="w-full sm:w-auto flex flex-wrap items-center gap-3">
            <PeriodSelector
              period={period}
              onPeriodChange={setPeriod}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              onCustomDateChange={(from, to) => {
                setCustomDateFrom(from);
                setCustomDateTo(to);
              }}
            />
            <span className="text-sm text-muted-foreground">
              {format(new Date(dateFrom), "dd MMM yyyy")} - {format(new Date(dateTo), "dd MMM yyyy")}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {/* Loading Skeleton for Smart Insights */}
            <Card className="border-l-4 border-l-warning">
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-4 rounded-lg border">
                      <div className="flex items-start gap-3">
                        <Skeleton className="w-5 h-5 rounded-full" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-5 w-24 rounded-full" />
                          </div>
                          <Skeleton className="h-4 w-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Loading Skeleton for Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-32" />
                      </div>
                      <Skeleton className="w-8 h-8 rounded-xl" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Loading Skeleton for Best & Worst Performers */}
            <div className="grid md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="border-l-4">
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-7 w-48 mb-2" />
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j}>
                          <Skeleton className="h-3 w-20 mb-2" />
                          <Skeleton className="h-5 w-24" />
                        </div>
                      ))}
                    </div>
                    <Skeleton className="h-9 w-full mt-4" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Loading Skeleton for Revenue Trend Chart */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[400px] w-full rounded-lg" />
              </CardContent>
            </Card>

            {/* Loading Skeleton for Branch Comparison Table */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="rounded-lg border">
                    <div className="p-3 border-b">
                      <div className="flex gap-3">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <Skeleton key={i} className="h-4 w-20" />
                        ))}
                      </div>
                    </div>
                    {Array.from({ length: 5 }).map((_, rowIndex) => (
                      <div key={rowIndex} className="p-3 border-b flex gap-3">
                        {Array.from({ length: 10 }).map((_, colIndex) => (
                          <Skeleton key={colIndex} className="h-4 w-20" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Loading Skeleton for Additional Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-40 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[300px] w-full rounded-lg" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Loading Spinner */}
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading branch analytics...</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Smart Insights & Alerts */}
            {insights.length > 0 && (
          <Card className="border-l-4 border-l-warning">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5" />
                Smart Insights & Alerts
              </CardTitle>
              <CardDescription>Automated insights based on performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.slice(0, 5).map((insight, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-4 rounded-lg border",
                      insight.type === "warning" && "bg-warning/5 border-warning/20",
                      insight.type === "success" && "bg-success/5 border-success/20",
                      insight.type === "info" && "bg-primary/5 border-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {insight.type === "warning" && (
                        <ExclamationTriangleIcon className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                      )}
                      {insight.type === "success" && (
                        <CheckCircleIcon className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold">{insight.title}</p>
                          <Badge variant="outline" className="text-xs">
                            {insight.branchName}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold mt-1">
                    <AnimatedCounter
                      value={branchMetrics.reduce((sum, m) => sum + m.revenue, 0)}
                      prefix="₹"
                      duration={1200}
                      formatValue={(v) => v.toLocaleString("en-IN")}
                    />
                  </p>
                </div>
                <CurrencyRupeeIcon className="w-8 h-8 text-accent opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Profit</p>
                  <p className="text-2xl font-bold mt-1">
                    <AnimatedCounter
                      value={branchMetrics.reduce((sum, m) => sum + m.profit, 0)}
                      prefix="₹"
                      duration={1200}
                      formatValue={(v) => v.toLocaleString("en-IN")}
                    />
                  </p>
                </div>
                <ChartBarIcon className="w-8 h-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold mt-1">
                    <AnimatedCounter
                      value={branchMetrics.reduce((sum, m) => sum + m.totalMembers, 0)}
                      duration={1000}
                    />
                  </p>
                </div>
                <UsersIcon className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Churn Rate</p>
                  <p className="text-2xl font-bold mt-1">
                    <AnimatedCounter
                      value={
                        branchMetrics.length > 0
                          ? branchMetrics.reduce((sum, m) => sum + m.churnRate, 0) / branchMetrics.length
                          : 0
                      }
                      suffix="%"
                      duration={1000}
                      formatValue={(v) => v.toFixed(1)}
                    />
                  </p>
                </div>
                <ArrowTrendingDownIcon className="w-8 h-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Best & Worst Performers */}
        {(bestPerformer || worstPerformer) && (
          <div className="grid md:grid-cols-2 gap-4">
            {bestPerformer && (
              <Card className="border-l-4 border-l-success">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-success" />
                    Best Performer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold">{bestPerformer.branchName}</p>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Revenue</p>
                        <p className="text-lg font-semibold">{formatCurrency(bestPerformer.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Profit</p>
                        <p className="text-lg font-semibold text-success">
                          {formatCurrency(bestPerformer.profit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Members</p>
                        <p className="text-lg font-semibold">{bestPerformer.totalMembers}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Growth</p>
                        <p className="text-lg font-semibold text-success">
                          {bestPerformer.revenueGrowth > 0 ? "+" : ""}
                          {bestPerformer.revenueGrowth.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      onClick={() => openBranchDetail(bestPerformer)}
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {worstPerformer && (
              <Card className="border-l-4 border-l-warning">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-warning" />
                    Needs Attention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold">{worstPerformer.branchName}</p>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Revenue</p>
                        <p className="text-lg font-semibold">{formatCurrency(worstPerformer.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Profit</p>
                        <p
                          className={cn(
                            "text-lg font-semibold",
                            worstPerformer.profit >= 0 ? "text-success" : "text-red-600"
                          )}
                        >
                          {formatCurrency(worstPerformer.profit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Members</p>
                        <p className="text-lg font-semibold">{worstPerformer.totalMembers}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Growth</p>
                        <p
                          className={cn(
                            "text-lg font-semibold",
                            worstPerformer.revenueGrowth >= 0 ? "text-success" : "text-red-600"
                          )}
                        >
                          {worstPerformer.revenueGrowth > 0 ? "+" : ""}
                          {worstPerformer.revenueGrowth.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      onClick={() => openBranchDetail(worstPerformer)}
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Revenue Trend Comparison */}
        {timeSeriesData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend Comparison</CardTitle>
              <CardDescription>Revenue over time across all branches</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                }}
                className="h-[300px] sm:h-[400px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      {allBranches?.map((branch, index) => (
                        <linearGradient
                          key={branch.id}
                          id={`color${branch.id}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8} />
                          <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                              {payload.map((entry, index) => (
                                <p key={index} className="font-medium">
                                  {entry.name}: {formatCurrency(Number(entry.value || 0))}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    {allBranches?.map((branch, index) => {
                      if (!branch.is_active || branch.deleted_at) return null;
                      return (
                        <Area
                          key={branch.id}
                          type="monotone"
                          dataKey={branch.name}
                          stroke={COLORS[index % COLORS.length]}
                          fill={`url(#color${branch.id})`}
                          strokeWidth={2}
                        />
                      );
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Branch Comparison Table */}
        <Card>
          <CardHeader>
            <CardTitle>Branch Performance Comparison</CardTitle>
            <CardDescription>Click on any branch to view detailed analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <div className="min-w-[800px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm">Branch</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Revenue</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Profit</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Margin</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Members</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Growth</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Churn</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Conversion</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">ROI</th>
                      <th className="text-center p-2 sm:p-3 font-medium text-xs sm:text-sm">Action</th>
                    </tr>
                  </thead>
                <tbody>
                  {branchMetrics
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((metric) => (
                      <tr
                        key={metric.branchId}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => openBranchDetail(metric)}
                      >
                        <td className="p-2 sm:p-3 font-medium text-xs sm:text-sm">{metric.branchName}</td>
                        <td className="p-2 sm:p-3 text-right text-xs sm:text-sm">{formatCurrency(metric.revenue)}</td>
                        <td
                          className={cn(
                            "p-3 text-right font-medium",
                            metric.profit >= 0 ? "text-success" : "text-red-600"
                          )}
                        >
                          {formatCurrency(metric.profit)}
                        </td>
                        <td className="p-3 text-right">{metric.profitMargin.toFixed(1)}%</td>
                        <td className="p-3 text-right">{metric.totalMembers}</td>
                        <td
                          className={cn(
                            "p-3 text-right",
                            metric.revenueGrowth >= 0 ? "text-success" : "text-red-600"
                          )}
                        >
                          {metric.revenueGrowth > 0 ? "+" : ""}
                          {metric.revenueGrowth.toFixed(1)}%
                        </td>
                        <td
                          className={cn(
                            "p-3 text-right",
                            metric.churnRate > 15 ? "text-red-600" : "text-muted-foreground"
                          )}
                        >
                          {metric.churnRate.toFixed(1)}%
                        </td>
                        <td className="p-3 text-right">{metric.conversionRate.toFixed(1)}%</td>
                        <td className="p-3 text-right">{metric.marketingROI.toFixed(1)}%</td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trainer Analytics Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AcademicCapIcon className="w-5 h-5" />
                  Branch-Wise Trainer Analytics
                </CardTitle>
                <CardDescription>Advanced trainer performance insights and comparisons</CardDescription>
              </div>
              <Select
                value={selectedBranchForTrainers}
                onValueChange={(value) => setSelectedBranchForTrainers(value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {allBranches?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingTrainers ? (
              <div className="space-y-6">
                {/* Loading Skeleton for Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-20" />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Loading Skeleton for Best/Worst Performers */}
                <div className="grid md:grid-cols-2 gap-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Card key={i} className="border-l-4">
                      <CardHeader>
                        <Skeleton className="h-6 w-32" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-6 w-40 mb-2" />
                        <Skeleton className="h-4 w-32 mb-4" />
                        <div className="grid grid-cols-2 gap-4">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j}>
                              <Skeleton className="h-3 w-20 mb-2" />
                              <Skeleton className="h-5 w-24" />
                            </div>
                          ))}
                        </div>
                        <Skeleton className="h-9 w-full mt-4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Loading Skeleton for Table */}
                <div className="overflow-x-auto">
                  <div className="rounded-lg border">
                    <div className="p-3 border-b">
                      <div className="flex gap-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <Skeleton key={i} className="h-4 w-20" />
                        ))}
                      </div>
                    </div>
                    {Array.from({ length: 5 }).map((_, rowIndex) => (
                      <div key={rowIndex} className="p-3 border-b flex gap-3">
                        {Array.from({ length: 9 }).map((_, colIndex) => (
                          <Skeleton key={colIndex} className="h-4 w-20" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Loading Spinner */}
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading trainer analytics...</p>
                  </div>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="comparison">Comparison</TabsTrigger>
                  <TabsTrigger value="insights">Insights</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                {/* Trainer Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Total Trainers</p>
                      <p className="text-2xl font-bold mt-1">{filteredTrainerMetrics.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold mt-1">
                        {formatCurrency(filteredTrainerMetrics.reduce((sum, t) => sum + t.revenue, 0))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Total Clients</p>
                      <p className="text-2xl font-bold mt-1">
                        {filteredTrainerMetrics.reduce((sum, t) => sum + t.totalClients, 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                      <p className="text-2xl font-bold mt-1">
                        {filteredTrainerMetrics.length > 0
                          ? (
                              filteredTrainerMetrics.reduce((sum, t) => sum + t.efficiencyScore, 0) /
                              filteredTrainerMetrics.length
                            ).toFixed(1)
                          : "0"}
                        %
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Best & Worst Trainers */}
                {(bestTrainer || worstTrainer) && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {bestTrainer && (
                      <Card className="border-l-4 border-l-success">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <TrophyIcon className="w-5 h-5 text-success" />
                            Top Performer
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <p className="text-xl font-bold">{bestTrainer.trainerName}</p>
                            <p className="text-sm text-muted-foreground">{bestTrainer.branchName}</p>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Revenue</p>
                                <p className="text-lg font-semibold">{formatCurrency(bestTrainer.revenue)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Clients</p>
                                <p className="text-lg font-semibold">{bestTrainer.totalClients}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Efficiency</p>
                                <p className="text-lg font-semibold text-success">
                                  {bestTrainer.efficiencyScore.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Retention</p>
                                <p className="text-lg font-semibold">{bestTrainer.clientRetentionRate.toFixed(1)}%</p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-4"
                              onClick={() => openTrainerDetail(bestTrainer)}
                            >
                              View Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {worstTrainer && (
                      <Card className="border-l-4 border-l-warning">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-5 h-5 text-warning" />
                            Needs Improvement
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <p className="text-xl font-bold">{worstTrainer.trainerName}</p>
                            <p className="text-sm text-muted-foreground">{worstTrainer.branchName}</p>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Revenue</p>
                                <p className="text-lg font-semibold">{formatCurrency(worstTrainer.revenue)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Clients</p>
                                <p className="text-lg font-semibold">{worstTrainer.totalClients}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Efficiency</p>
                                <p className="text-lg font-semibold text-warning">
                                  {worstTrainer.efficiencyScore.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Retention</p>
                                <p className="text-lg font-semibold">{worstTrainer.clientRetentionRate.toFixed(1)}%</p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-4"
                              onClick={() => openTrainerDetail(worstTrainer)}
                            >
                              View Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Trainer Performance Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">Trainer</th>
                        <th className="text-left p-3 font-medium">Branch</th>
                        <th className="text-right p-3 font-medium">Revenue</th>
                        <th className="text-right p-3 font-medium">Clients</th>
                        <th className="text-right p-3 font-medium">Active</th>
                        <th className="text-right p-3 font-medium">Retention</th>
                        <th className="text-right p-3 font-medium">Efficiency</th>
                        <th className="text-right p-3 font-medium">Growth</th>
                        <th className="text-center p-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrainerMetrics.map((trainer) => (
                        <tr
                          key={trainer.trainerId}
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => openTrainerDetail(trainer)}
                        >
                          <td className="p-3 font-medium">{trainer.trainerName}</td>
                          <td className="p-3 text-muted-foreground">{trainer.branchName}</td>
                          <td className="p-3 text-right">{formatCurrency(trainer.revenue)}</td>
                          <td className="p-3 text-right">{trainer.totalClients}</td>
                          <td className="p-3 text-right">{trainer.activeClients}</td>
                          <td
                            className={cn(
                              "p-3 text-right",
                              trainer.clientRetentionRate >= 80 ? "text-success" : "text-warning"
                            )}
                          >
                            {trainer.clientRetentionRate.toFixed(1)}%
                          </td>
                          <td
                            className={cn(
                              "p-3 text-right font-medium",
                              trainer.efficiencyScore >= 70 ? "text-success" : trainer.efficiencyScore >= 50 ? "text-warning" : "text-red-600"
                            )}
                          >
                            {trainer.efficiencyScore.toFixed(1)}%
                          </td>
                          <td
                            className={cn(
                              "p-3 text-right",
                              trainer.revenueGrowth >= 0 ? "text-success" : "text-red-600"
                            )}
                          >
                            {trainer.revenueGrowth > 0 ? "+" : ""}
                            {trainer.revenueGrowth.toFixed(1)}%
                          </td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-6">
                {/* Revenue Distribution by Trainer */}
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Distribution</CardTitle>
                    <CardDescription>Revenue share by trainer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                      }}
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filteredTrainerMetrics
                            .sort((a, b) => b.revenue - a.revenue)
                            .slice(0, 10)}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="trainerName" angle={-45} textAnchor="end" height={100} />
                          <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload as TrainerMetrics;
                                return (
                                  <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                    <p className="font-medium">{data.trainerName}</p>
                                    <p>Branch: {data.branchName}</p>
                                    <p>Revenue: {formatCurrency(data.revenue)}</p>
                                    <p>Clients: {data.totalClients}</p>
                                    <p>Efficiency: {data.efficiencyScore.toFixed(1)}%</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Efficiency Score Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Efficiency Score Comparison</CardTitle>
                    <CardDescription>Composite performance metric</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        efficiency: { label: "Efficiency", color: "hsl(var(--success))" },
                      }}
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filteredTrainerMetrics
                            .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
                            .slice(0, 10)}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="trainerName" angle={-45} textAnchor="end" height={100} />
                          <YAxis domain={[0, 100]} />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload as TrainerMetrics;
                                return (
                                  <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                    <p className="font-medium">{data.trainerName}</p>
                                    <p>Efficiency: {data.efficiencyScore.toFixed(1)}%</p>
                                    <p>Revenue Growth: {data.revenueGrowth.toFixed(1)}%</p>
                                    <p>Retention: {data.clientRetentionRate.toFixed(1)}%</p>
                                    <p>Client Growth: {data.clientGrowth.toFixed(1)}%</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="efficiencyScore" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-6">
                {/* Branch-wise Trainer Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle>Branch-Wise Trainer Performance</CardTitle>
                    <CardDescription>Compare trainers across branches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                      }}
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={allBranches
                            ?.filter((b) => b.is_active && !b.deleted_at)
                            .map((branch) => {
                              const branchTrainers = filteredTrainerMetrics.filter(
                                (t) => t.branchId === branch.id
                              );
                              return {
                                branch: branch.name,
                                avgRevenue: branchTrainers.length > 0
                                  ? branchTrainers.reduce((sum, t) => sum + t.revenue, 0) / branchTrainers.length
                                  : 0,
                                totalRevenue: branchTrainers.reduce((sum, t) => sum + t.revenue, 0),
                                trainerCount: branchTrainers.length,
                                avgEfficiency: branchTrainers.length > 0
                                  ? branchTrainers.reduce((sum, t) => sum + t.efficiencyScore, 0) / branchTrainers.length
                                  : 0,
                              };
                            }) || []}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="branch" />
                          <YAxis yAxisId="left" tickFormatter={(v) => `₹${v / 1000}k`} />
                          <YAxis yAxisId="right" orientation="right" />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                    {payload.map((entry, index) => (
                                      <p key={index} className="font-medium">
                                        {entry.name}: {typeof entry.value === "number" && typeof entry.name === "string" && entry.name.includes("Revenue")
                                          ? formatCurrency(entry.value)
                                          : entry.value}
                                      </p>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar yAxisId="left" dataKey="totalRevenue" fill="hsl(var(--accent))" />
                          <Line yAxisId="right" type="monotone" dataKey="avgEfficiency" stroke="hsl(var(--success))" strokeWidth={2} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Trainer Performance Radar */}
                {filteredTrainerMetrics.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Trainers Performance Radar</CardTitle>
                      <CardDescription>Multi-metric comparison (normalized)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{
                          revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                        }}
                        className="h-[400px]"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart
                            data={filteredTrainerMetrics
                              .slice(0, 5)
                              .map((t) => {
                                const maxRevenue = Math.max(...filteredTrainerMetrics.map((tr) => tr.revenue), 1);
                                const maxClients = Math.max(...filteredTrainerMetrics.map((tr) => tr.totalClients), 1);
                                return {
                                  trainer: t.trainerName,
                                  Revenue: (t.revenue / maxRevenue) * 100,
                                  Clients: (t.totalClients / maxClients) * 100,
                                  Retention: t.clientRetentionRate,
                                  Efficiency: t.efficiencyScore,
                                };
                              })}
                          >
                            <PolarGrid />
                            <PolarAngleAxis dataKey="trainer" />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} />
                            {filteredTrainerMetrics.slice(0, 5).map((trainer, index) => (
                              <Radar
                                key={trainer.trainerId}
                                name={trainer.trainerName}
                                dataKey="Revenue"
                                stroke={COLORS[index % COLORS.length]}
                                fill={COLORS[index % COLORS.length]}
                                fillOpacity={0.6}
                              />
                            ))}
                            <Legend />
                          </RadarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="insights" className="space-y-6">
                {/* Trainer Insights */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* High Performers */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FireIcon className="w-5 h-5 text-success" />
                        High Performers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {filteredTrainerMetrics
                          .filter((t) => t.efficiencyScore >= 70)
                          .slice(0, 5)
                          .map((trainer) => (
                            <div key={trainer.trainerId} className="p-3 bg-success/5 rounded-lg border border-success/20">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold">{trainer.trainerName}</p>
                                <Badge className="bg-success">{trainer.efficiencyScore.toFixed(1)}%</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{trainer.branchName}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Revenue: </span>
                                  <span className="font-medium">{formatCurrency(trainer.revenue)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Clients: </span>
                                  <span className="font-medium">{trainer.totalClients}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Underperformers */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 text-warning" />
                        Needs Attention
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {filteredTrainerMetrics
                          .filter((t) => t.efficiencyScore < 50)
                          .slice(0, 5)
                          .map((trainer) => (
                            <div key={trainer.trainerId} className="p-3 bg-warning/5 rounded-lg border border-warning/20">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold">{trainer.trainerName}</p>
                                <Badge variant="outline" className="border-warning text-warning">
                                  {trainer.efficiencyScore.toFixed(1)}%
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{trainer.branchName}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Revenue: </span>
                                  <span className="font-medium">{formatCurrency(trainer.revenue)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Retention: </span>
                                  <span className="font-medium">{trainer.clientRetentionRate.toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Key Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle>Key Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {filteredTrainerMetrics.length > 0 && (
                        <>
                          <div className="p-4 bg-primary/5 rounded-lg">
                            <p className="font-semibold mb-2">Average Performance</p>
                            <p className="text-sm text-muted-foreground">
                              Average efficiency score:{" "}
                              {(
                                filteredTrainerMetrics.reduce((sum, t) => sum + t.efficiencyScore, 0) /
                                filteredTrainerMetrics.length
                              ).toFixed(1)}
                              %. Average revenue per trainer:{" "}
                              {formatCurrency(
                                filteredTrainerMetrics.reduce((sum, t) => sum + t.revenue, 0) /
                                  filteredTrainerMetrics.length
                              )}
                              .
                            </p>
                          </div>
                          <div className="p-4 bg-success/5 rounded-lg">
                            <p className="font-semibold mb-2">Top Revenue Generator</p>
                            <p className="text-sm text-muted-foreground">
                              {filteredTrainerMetrics.sort((a, b) => b.revenue - a.revenue)[0]?.trainerName} from{" "}
                              {filteredTrainerMetrics.sort((a, b) => b.revenue - a.revenue)[0]?.branchName} generated{" "}
                              {formatCurrency(
                                filteredTrainerMetrics.sort((a, b) => b.revenue - a.revenue)[0]?.revenue || 0
                              )}{" "}
                              in revenue.
                            </p>
                          </div>
                          <div className="p-4 bg-warning/5 rounded-lg">
                            <p className="font-semibold mb-2">Retention Leaders</p>
                            <p className="text-sm text-muted-foreground">
                              Trainers with highest retention:{" "}
                              {filteredTrainerMetrics
                                .sort((a, b) => b.clientRetentionRate - a.clientRetentionRate)
                                .slice(0, 3)
                                .map((t) => `${t.trainerName} (${t.clientRetentionRate.toFixed(1)}%)`)
                                .join(", ")}
                              .
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>

            {/* Additional Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Revenue Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Distribution</CardTitle>
                  <CardDescription>Revenue share by branch</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={branchMetrics}
                          dataKey="revenue"
                          nameKey="branchName"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ branchName, percent }) => `${branchName}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {branchMetrics.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as BranchMetrics;
                              return (
                                <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                  <p className="font-medium">{data.branchName}</p>
                                  <p>Revenue: {formatCurrency(data.revenue)}</p>
                                  <p>Profit: {formatCurrency(data.profit)}</p>
                                  <p>Members: {data.totalMembers}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Performance Radar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Radar</CardTitle>
                  <CardDescription>Multi-metric comparison (normalized)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={branchMetrics.slice(0, 3).map((m) => {
                        const maxRevenue = Math.max(...branchMetrics.map(b => b.revenue), 1);
                        const maxProfit = Math.max(...branchMetrics.map(b => Math.abs(b.profit)), 1);
                        const maxMembers = Math.max(...branchMetrics.map(b => b.totalMembers), 1);
                        return {
                          branch: m.branchName,
                          Revenue: (m.revenue / maxRevenue) * 100,
                          Profit: Math.max(0, (m.profit / maxProfit) * 100),
                          Members: (m.totalMembers / maxMembers) * 100,
                          Growth: Math.max(0, Math.min(m.revenueGrowth + 50, 100)),
                        };
                      })}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="branch" />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} />
                        {branchMetrics.slice(0, 3).map((metric, index) => (
                          <Radar
                            key={metric.branchId}
                            name={metric.branchName}
                            dataKey="Revenue"
                            stroke={COLORS[index % COLORS.length]}
                            fill={COLORS[index % COLORS.length]}
                            fillOpacity={0.6}
                          />
                        ))}
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Branch Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailBranch?.branchName} - Detailed Analytics</DialogTitle>
          </DialogHeader>
          {detailBranch && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold mt-1">{formatCurrency(detailBranch.revenue)}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Profit</p>
                  <p className="text-xl font-bold mt-1 text-success">
                    {formatCurrency(detailBranch.profit)}
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Members</p>
                  <p className="text-xl font-bold mt-1">{detailBranch.totalMembers}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Churn Rate</p>
                  <p className="text-xl font-bold mt-1">{detailBranch.churnRate.toFixed(1)}%</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Key Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active Members:</span>
                      <span className="font-medium">{detailBranch.activeMembers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Members:</span>
                      <span className="font-medium">{detailBranch.newMembers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Churned Members:</span>
                      <span className="font-medium text-red-600">{detailBranch.churnedMembers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PT Subscriptions:</span>
                      <span className="font-medium">{detailBranch.ptSubscriptions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Staff Count:</span>
                      <span className="font-medium">{detailBranch.staffCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Revenue/Member:</span>
                      <span className="font-medium">{formatCurrency(detailBranch.avgRevenuePerMember)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Performance Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profit Margin:</span>
                      <span className="font-medium">{detailBranch.profitMargin.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conversion Rate:</span>
                      <span className="font-medium">{detailBranch.conversionRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue Growth:</span>
                      <span
                        className={cn(
                          "font-medium",
                          detailBranch.revenueGrowth >= 0 ? "text-success" : "text-red-600"
                        )}
                      >
                        {detailBranch.revenueGrowth > 0 ? "+" : ""}
                        {detailBranch.revenueGrowth.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Member Growth:</span>
                      <span
                        className={cn(
                          "font-medium",
                          detailBranch.memberGrowth >= 0 ? "text-success" : "text-red-600"
                        )}
                      >
                        {detailBranch.memberGrowth > 0 ? "+" : ""}
                        {detailBranch.memberGrowth.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Staff Performance:</span>
                      <span className="font-medium">{formatCurrency(detailBranch.staffPerformance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Marketing ROI:</span>
                      <span className="font-medium">{detailBranch.marketingROI.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Trainer Detail Dialog */}
      <Dialog open={isTrainerDetailOpen} onOpenChange={setIsTrainerDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailTrainer?.trainerName} - Detailed Trainer Analytics</DialogTitle>
          </DialogHeader>
          {detailTrainer && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold mt-1">{formatCurrency(detailTrainer.revenue)}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Clients</p>
                  <p className="text-xl font-bold mt-1">{detailTrainer.totalClients}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                  <p className="text-xl font-bold mt-1 text-success">{detailTrainer.activeClients}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Efficiency Score</p>
                  <p className="text-xl font-bold mt-1">{detailTrainer.efficiencyScore.toFixed(1)}%</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Client Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Clients:</span>
                      <span className="font-medium">{detailTrainer.newClients}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Churned Clients:</span>
                      <span className="font-medium text-red-600">{detailTrainer.churnedClients}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client Retention Rate:</span>
                      <span
                        className={cn(
                          "font-medium",
                          detailTrainer.clientRetentionRate >= 80 ? "text-success" : "text-warning"
                        )}
                      >
                        {detailTrainer.clientRetentionRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Renewal Rate:</span>
                      <span className="font-medium">{detailTrainer.renewalRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client Growth:</span>
                      <span
                        className={cn(
                          "font-medium",
                          detailTrainer.clientGrowth >= 0 ? "text-success" : "text-red-600"
                        )}
                      >
                        {detailTrainer.clientGrowth > 0 ? "+" : ""}
                        {detailTrainer.clientGrowth.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-3">Revenue Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Revenue/Client:</span>
                      <span className="font-medium">{formatCurrency(detailTrainer.avgRevenuePerClient)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Revenue/Session:</span>
                      <span className="font-medium">{formatCurrency(detailTrainer.avgRevenuePerSession)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Sessions:</span>
                      <span className="font-medium">{detailTrainer.totalSessions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue Growth:</span>
                      <span
                        className={cn(
                          "font-medium",
                          detailTrainer.revenueGrowth >= 0 ? "text-success" : "text-red-600"
                        )}
                      >
                        {detailTrainer.revenueGrowth > 0 ? "+" : ""}
                        {detailTrainer.revenueGrowth.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Previous Period Revenue:</span>
                      <span className="font-medium">{formatCurrency(detailTrainer.previousPeriodRevenue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Payment Structure</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Category:</span>
                      <span className="font-medium capitalize">
                        {detailTrainer.paymentCategory.replace(/_/g, " ")}
                      </span>
                    </div>
                    {detailTrainer.percentageFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Percentage Fee:</span>
                        <span className="font-medium">{detailTrainer.percentageFee}%</span>
                      </div>
                    )}
                    {detailTrainer.sessionFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Session Fee:</span>
                        <span className="font-medium">{formatCurrency(detailTrainer.sessionFee)}</span>
                      </div>
                    )}
                    {detailTrainer.monthlySalary > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monthly Salary:</span>
                        <span className="font-medium">{formatCurrency(detailTrainer.monthlySalary)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-3">Performance Summary</h4>
                  <div className="p-4 bg-primary/5 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">Efficiency Score Breakdown</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Revenue Growth Weight:</span>
                        <span>40%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Retention Rate Weight:</span>
                        <span>30%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Client Growth Weight:</span>
                        <span>30%</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Overall Score:</span>
                        <span
                          className={cn(
                            "text-lg font-bold",
                            detailTrainer.efficiencyScore >= 70
                              ? "text-success"
                              : detailTrainer.efficiencyScore >= 50
                              ? "text-warning"
                              : "text-red-600"
                          )}
                        >
                          {detailTrainer.efficiencyScore.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default BranchAnalytics;
