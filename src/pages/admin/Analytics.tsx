import { Suspense, lazy, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowTrendingUpIcon,
  UsersIcon,
  CurrencyRupeeIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { PeriodSelector, PeriodType } from "@/components/admin/PeriodSelector";
import { useAnalyticsTotals, useAnalyticsRevenue, useAnalyticsMemberGrowth, useAnalyticsTrainerStats, useAnalyticsPackageSales } from "@/hooks/queries";
import { useAnalyticsStore } from "@/stores/analyticsStore";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load chart components
const RevenueChart = lazy(() => import("@/components/analytics/RevenueChart").then(m => ({ default: m.default })));
const MemberGrowthChart = lazy(() => import("@/components/analytics/MemberGrowthChart").then(m => ({ default: m.default })));
const NewMembersChart = lazy(() => import("@/components/analytics/NewMembersChart").then(m => ({ default: m.default })));
const TrainerPerformanceChart = lazy(() => import("@/components/analytics/TrainerPerformanceChart").then(m => ({ default: m.default })));
const PackageSalesChart = lazy(() => import("@/components/analytics/PackageSalesChart").then(m => ({ default: m.default })));

// Skeleton loaders
const StatCardSkeleton = () => (
  <Card className="hover-lift border-0 shadow-sm overflow-hidden">
    <CardContent className="p-2 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 sm:h-8 w-24 mb-2" />
          <Skeleton className="h-3 sm:h-4 w-20" />
        </div>
        <Skeleton className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl" />
      </div>
    </CardContent>
  </Card>
);

const ChartSkeleton = ({ height = "h-64" }: { height?: string }) => (
  <div className={`${height} flex items-center justify-center`}>
    <div className="w-full h-full flex flex-col gap-2 p-4">
      <div className="flex items-end justify-between h-full gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 60}%` }} />
        ))}
      </div>
    </div>
  </div>
);

// Overview Stats Section
const OverviewStats = () => {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { data: totals, isLoading } = useAnalyticsTotals(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    true // Always enabled for overview
  );

  if (isLoading && !totals) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!totals) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      <Card className="hover-lift border-0 shadow-sm overflow-hidden">
        <CardContent className="p-2 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-2xl font-bold text-accent truncate leading-tight">
                <AnimatedCounter 
                  value={totals.totalRevenue} 
                  prefix="₹" 
                  duration={1200}
                  formatValue={(v) => v.toLocaleString("en-IN")}
                />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">Total Revenue</p>
            </div>
            <div className="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:p-3 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
              <ArrowTrendingUpIcon className="w-4 h-4 sm:w-6 sm:h-6 text-accent" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-lift border-0 shadow-sm overflow-hidden">
        <CardContent className="p-2 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-2xl font-bold text-primary truncate leading-tight">
                <AnimatedCounter value={totals.totalMembers} duration={1000} />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Total Members</p>
            </div>
            <div className="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:p-3 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
              <UsersIcon className="w-4 h-4 sm:w-6 sm:h-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-lift border-0 shadow-sm overflow-hidden">
        <CardContent className="p-2 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-2xl font-bold text-success truncate leading-tight">
                <AnimatedCounter value={totals.activeMembers} duration={800} />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Active Members</p>
            </div>
            <div className="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:p-3 bg-success/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
              <CalendarIcon className="w-4 h-4 sm:w-6 sm:h-6 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-lift border-0 shadow-sm overflow-hidden">
        <CardContent className="p-2 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-2xl font-bold text-warning truncate leading-tight">
                <AnimatedCounter 
                  value={Math.round(totals.avgRevenue)} 
                  prefix="₹" 
                  duration={1000}
                  formatValue={(v) => v.toLocaleString("en-IN")}
                />
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Avg Monthly</p>
            </div>
            <div className="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:p-3 bg-warning/10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2">
              <CurrencyRupeeIcon className="w-4 h-4 sm:w-6 sm:h-6 text-warning" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Lazy-loaded Revenue Chart Section
const RevenueChartSection = () => {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const { data, isLoading } = useAnalyticsRevenue(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  return (
    <Card className="border-0 shadow-sm overflow-hidden" ref={ref}>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-xl">Monthly Revenue</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Revenue trend over the selected period</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden p-3 pt-0 sm:p-6 sm:pt-0">
        <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(220px,34vh,360px)] md:h-[clamp(260px,34vh,420px)]" />}>
          <RevenueChart data={data || []} isLoading={isLoading} />
        </Suspense>
      </CardContent>
    </Card>
  );
};

// Lazy-loaded Member Growth Section
const MemberGrowthSection = () => {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const { data, isLoading } = useAnalyticsMemberGrowth(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  return (
    <div className="grid md:grid-cols-2 gap-3 sm:gap-6" ref={ref}>
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-xl">Member Growth</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Total members over time</CardDescription>
        </CardHeader>
        <CardContent className="overflow-hidden p-3 pt-0 sm:p-6 sm:pt-0">
          <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(210px,30vh,320px)] md:h-[clamp(230px,30vh,360px)]" />}>
            <MemberGrowthChart data={data || []} isLoading={isLoading} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-xl">New Members</CardTitle>
          <CardDescription className="text-xs sm:text-sm">New registrations per period</CardDescription>
        </CardHeader>
        <CardContent className="overflow-hidden p-3 pt-0 sm:p-6 sm:pt-0">
          <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(210px,30vh,320px)] md:h-[clamp(230px,30vh,360px)]" />}>
            <NewMembersChart data={data || []} isLoading={isLoading} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
};

// Lazy-loaded Trainer Performance Section
const TrainerPerformanceSection = () => {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const { data, isLoading } = useAnalyticsTrainerStats(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  if (!inView && !data) return null;
  if (data && data.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm overflow-hidden" ref={ref}>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-xl">Trainer Performance</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Revenue and client distribution by trainer</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 overflow-hidden">
        <Suspense fallback={<ChartSkeleton height="h-[160px] sm:h-[clamp(200px,28vh,300px)] md:h-[clamp(220px,26vh,320px)]" />}>
          <TrainerPerformanceChart data={data || []} isLoading={isLoading} />
        </Suspense>
      </CardContent>
    </Card>
  );
};

// Lazy-loaded Package Sales Section
const PackageSalesSection = () => {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const { data, isLoading } = useAnalyticsPackageSales(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  if (!inView && !data) return null;
  if (data && data.packageList && data.packageList.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm overflow-hidden" ref={ref}>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-xl">Package Sales Distribution</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Subscription sales by package type</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden p-3 pt-0 sm:p-6 sm:pt-0">
        <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(220px,34vh,380px)] md:h-[clamp(260px,34vh,440px)]" />}>
          <PackageSalesChart 
            data={data?.packageSalesData || []} 
            packageList={data?.packageList || []} 
            isLoading={isLoading} 
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

const AdminAnalytics = () => {
  const {
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    setAnalyticsPeriod,
    setAnalyticsCustomDates,
  } = useAnalyticsStore();

  const handleCustomDateChange = (from: string, to: string) => {
    setAnalyticsCustomDates(from, to);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-3 sm:space-y-6">
      {/* Overview Stats - Always loaded */}
      <OverviewStats />

      {/* Period Selector */}
      <Card className="border-0 shadow-sm p-3 sm:p-4">
        <div className="flex justify-start">
          <PeriodSelector
            period={analyticsPeriod}
            onPeriodChange={setAnalyticsPeriod}
            customDateFrom={analyticsCustomDateFrom}
            customDateTo={analyticsCustomDateTo}
            onCustomDateChange={handleCustomDateChange}
            compact
          />
        </div>
      </Card>

      {/* Lazy-loaded sections */}
      <RevenueChartSection />
      <MemberGrowthSection />
      <TrainerPerformanceSection />
      <PackageSalesSection />
    </div>
  );
};

export default AdminAnalytics;
