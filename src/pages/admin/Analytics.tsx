import { Suspense, lazy, useMemo, ReactNode } from "react";
import { useInView } from "react-intersection-observer";
import {
  ArrowTrendingUpIcon,
  UsersIcon,
  CurrencyRupeeIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";
import { LineChart, BarChart3, Users2, Package, Sparkles } from "lucide-react";
import { PeriodSelector } from "@/components/admin/PeriodSelector";
import {
  useAggregatedAnalyticsTotals,
  useAggregatedAnalyticsRevenue,
  useAggregatedAnalyticsMemberGrowth,
  useAggregatedAnalyticsTrainerStats,
  useAggregatedAnalyticsPackageSales,
} from "@/hooks/queries";
import { useAnalyticsStore } from "@/stores/analyticsStore";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartMetricCard } from "@/components/analytics/SmartMetricCard";
import { InsightsPanel, Insight } from "@/components/analytics/InsightsPanel";
import { cn } from "@/lib/utils";

// Lazy load chart components
const RevenueChart = lazy(() => import("@/components/analytics/RevenueChart").then((m) => ({ default: m.default })));
const MemberGrowthChart = lazy(() => import("@/components/analytics/MemberGrowthChart").then((m) => ({ default: m.default })));
const NewMembersChart = lazy(() => import("@/components/analytics/NewMembersChart").then((m) => ({ default: m.default })));
const TrainerPerformanceChart = lazy(() => import("@/components/analytics/TrainerPerformanceChart").then((m) => ({ default: m.default })));
const PackageSalesChart = lazy(() => import("@/components/analytics/PackageSalesChart").then((m) => ({ default: m.default })));

// ============= Premium section wrapper =============
interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  innerRef?: (node?: Element | null) => void;
  accent?: "primary" | "accent" | "success" | "warning";
}

const accentMap = {
  primary: "bg-primary/10 text-primary ring-primary/20",
  accent: "bg-accent/10 text-accent ring-accent/20",
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/20",
};

function SectionCard({ title, description, icon, children, className, innerRef, accent = "primary" }: SectionCardProps) {
  return (
    <div
      ref={innerRef as any}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm",
        "transition-all duration-300 hover:shadow-md hover:border-border",
        "animate-fade-in",
        className
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:p-6 pb-2 sm:pb-3">
        {icon && (
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 transition-transform duration-300 group-hover:scale-105",
              accentMap[accent]
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
          )}
        </div>
      </div>
      <div className="p-3 sm:p-6 pt-0 sm:pt-0">{children}</div>
    </div>
  );
}

// ============= Skeletons =============
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

// ============= Helpers =============
const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
};

// ============= Overview (Smart cards + insights) =============
function OverviewSection() {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { data: totals, isLoading: totalsLoading } = useAggregatedAnalyticsTotals(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    true
  );
  const { data: revenue } = useAggregatedAnalyticsRevenue(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    true
  );
  const { data: growth } = useAggregatedAnalyticsMemberGrowth(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    true
  );

  const sparks = useMemo(() => {
    const rev = revenue ?? [];
    const grw = growth ?? [];
    return {
      revenue: rev.map((r) => Number(r.revenue) || 0),
      payments: rev.map((r) => Number(r.payments) || 0),
      members: grw.map((g) => Number(g.members) || 0),
      newMembers: grw.map((g) => Number(g.newMembers) || 0),
    };
  }, [revenue, growth]);

  const deltas = useMemo(() => {
    const half = (arr: number[]) => {
      if (!arr.length) return { prev: 0, curr: 0 };
      const mid = Math.floor(arr.length / 2);
      const prev = arr.slice(0, mid).reduce((s, v) => s + v, 0);
      const curr = arr.slice(mid).reduce((s, v) => s + v, 0);
      return { prev, curr };
    };
    const r = half(sparks.revenue);
    const nm = half(sparks.newMembers);
    return {
      revenue: pctChange(r.curr, r.prev),
      newMembers: pctChange(nm.curr, nm.prev),
    };
  }, [sparks]);

  const insights = useMemo<Insight[]>(() => {
    if (!totals) return [];
    const out: Insight[] = [];

    if (deltas.revenue !== null) {
      const positive = deltas.revenue >= 0;
      out.push({
        id: "rev-trend",
        tone: positive ? "positive" : "negative",
        icon: positive ? "up" : "down",
        title: positive ? "Revenue is trending up" : "Revenue is slowing down",
        detail: `${Math.abs(deltas.revenue).toFixed(1)}% change vs the earlier half of this period.`,
      });
    }

    if (sparks.revenue.length) {
      const peakIdx = sparks.revenue.indexOf(Math.max(...sparks.revenue));
      const peakLabel = revenue?.[peakIdx]?.month;
      const peakVal = sparks.revenue[peakIdx];
      if (peakLabel && peakVal > 0) {
        out.push({
          id: "rev-peak",
          tone: "neutral",
          icon: "award",
          title: `Peak revenue in ${peakLabel}`,
          detail: `₹${peakVal.toLocaleString("en-IN")} earned in your best interval.`,
        });
      }
    }

    if (deltas.newMembers !== null) {
      const positive = deltas.newMembers >= 0;
      out.push({
        id: "members-trend",
        tone: positive ? "positive" : "negative",
        icon: positive ? "up" : "down",
        title: positive ? "Member acquisition is rising" : "Fewer new sign-ups recently",
        detail: `${Math.abs(deltas.newMembers).toFixed(1)}% change in new members vs earlier in this period.`,
      });
    }

    if (totals.totalMembers > 0) {
      const activeRate = (totals.activeMembers / totals.totalMembers) * 100;
      out.push({
        id: "active-rate",
        tone: activeRate >= 50 ? "positive" : activeRate >= 25 ? "neutral" : "negative",
        icon: "target",
        title: `${activeRate.toFixed(0)}% of members are active`,
        detail: `${totals.activeMembers.toLocaleString("en-IN")} active out of ${totals.totalMembers.toLocaleString("en-IN")} total.`,
      });
    }

    return out.slice(0, 4);
  }, [totals, deltas, sparks, revenue]);

  if (totalsLoading && !totals) {
    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SmartMetricCard
              key={i}
              label=""
              value={0}
              icon={null}
              isLoading
            />
          ))}
        </div>
      </>
    );
  }

  if (!totals) return null;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SmartMetricCard
          label="Total Revenue"
          value={totals.totalRevenue}
          prefix="₹"
          tone="accent"
          icon={<ArrowTrendingUpIcon className="w-4 h-4" />}
          sparkline={sparks.revenue}
          delta={deltas.revenue}
          formatValue={(v) => v.toLocaleString("en-IN")}
        />
        <SmartMetricCard
          label="Total Members"
          value={totals.totalMembers}
          tone="primary"
          icon={<UsersIcon className="w-4 h-4" />}
          sparkline={sparks.members}
        />
        <SmartMetricCard
          label="Active Members"
          value={totals.activeMembers}
          tone="success"
          icon={<CalendarIcon className="w-4 h-4" />}
          sparkline={sparks.members}
        />
        <SmartMetricCard
          label="Avg Monthly"
          value={Math.round(totals.avgRevenue)}
          prefix="₹"
          tone="warning"
          icon={<CurrencyRupeeIcon className="w-4 h-4" />}
          sparkline={sparks.payments}
          formatValue={(v) => v.toLocaleString("en-IN")}
        />
      </div>

      <InsightsPanel insights={insights} />
    </>
  );
}

// ============= Chart sections =============
function RevenueChartSection() {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const { data, isLoading, granularity, intervalMeta } = useAggregatedAnalyticsRevenue(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  return (
    <SectionCard
      innerRef={ref}
      title="Revenue Trend"
      description="Revenue performance across the selected period"
      icon={<LineChart className="w-4 h-4" />}
      accent="accent"
    >
      <Suspense fallback={<ChartSkeleton height="h-[200px] sm:h-[clamp(240px,36vh,380px)] md:h-[clamp(280px,36vh,440px)]" />}>
        <RevenueChart data={data || []} isLoading={isLoading} granularity={granularity} intervalMeta={intervalMeta} />
      </Suspense>
    </SectionCard>
  );
}

function MemberGrowthSection() {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const { data, isLoading } = useAggregatedAnalyticsMemberGrowth(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  return (
    <div className="grid lg:grid-cols-2 gap-3 sm:gap-4" ref={ref as any}>
      <SectionCard
        title="Member Growth"
        description="Cumulative members over time"
        icon={<Users2 className="w-4 h-4" />}
        accent="primary"
      >
        <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(220px,32vh,340px)]" />}>
          <MemberGrowthChart data={data || []} isLoading={isLoading} />
        </Suspense>
      </SectionCard>

      <SectionCard
        title="New Members"
        description="New registrations per interval"
        icon={<BarChart3 className="w-4 h-4" />}
        accent="success"
      >
        <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(220px,32vh,340px)]" />}>
          <NewMembersChart data={data || []} isLoading={isLoading} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

function TrainerPerformanceSection() {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const { data, isLoading } = useAggregatedAnalyticsTrainerStats(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  if (!inView && !data) return <div ref={ref} className="h-1" />;
  if (data && data.length === 0) return null;

  return (
    <SectionCard
      innerRef={ref}
      title="Trainer Performance"
      description="Revenue and client distribution by trainer"
      icon={<Sparkles className="w-4 h-4" />}
      accent="warning"
    >
      <Suspense fallback={<ChartSkeleton height="h-[180px] sm:h-[clamp(220px,30vh,320px)]" />}>
        <TrainerPerformanceChart data={data || []} isLoading={isLoading} />
      </Suspense>
    </SectionCard>
  );
}

function PackageSalesSection() {
  const { analyticsPeriod, analyticsCustomDateFrom, analyticsCustomDateTo } = useAnalyticsStore();
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const { data, isLoading } = useAggregatedAnalyticsPackageSales(
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    inView
  );

  if (!inView && !data) return <div ref={ref} className="h-1" />;
  if (data && data.packageList && data.packageList.length === 0) return null;

  return (
    <SectionCard
      innerRef={ref}
      title="Package Sales Distribution"
      description="Subscription sales by package type"
      icon={<Package className="w-4 h-4" />}
      accent="primary"
    >
      <Suspense fallback={<ChartSkeleton height="h-[200px] sm:h-[clamp(240px,36vh,400px)]" />}>
        <PackageSalesChart
          data={data?.packageSalesData || []}
          packageList={data?.packageList || []}
          isLoading={isLoading}
        />
      </Suspense>
    </SectionCard>
  );
}

// ============= Page =============
const AdminAnalytics = () => {
  const {
    analyticsPeriod,
    analyticsCustomDateFrom,
    analyticsCustomDateTo,
    setAnalyticsPeriod,
    setAnalyticsCustomDates,
  } = useAnalyticsStore();

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 sm:py-0 bg-background/80 backdrop-blur-md sm:bg-transparent sm:backdrop-blur-0">
        <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-sm p-2.5 sm:p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">Analytics</p>
              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                Live insights into your gym performance
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <PeriodSelector
              period={analyticsPeriod}
              onPeriodChange={setAnalyticsPeriod}
              customDateFrom={analyticsCustomDateFrom}
              customDateTo={analyticsCustomDateTo}
              onCustomDateChange={(f, t) => setAnalyticsCustomDates(f, t)}
              compact
            />
          </div>
        </div>
      </div>

      {/* Smart cards + insights */}
      <OverviewSection />

      {/* Main revenue chart */}
      <RevenueChartSection />

      {/* Secondary analytics grid */}
      <MemberGrowthSection />

      {/* Performance grids */}
      <TrainerPerformanceSection />
      <PackageSalesSection />
    </div>
  );
};

export default AdminAnalytics;
