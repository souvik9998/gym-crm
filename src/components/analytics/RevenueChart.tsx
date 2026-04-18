import { memo, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { MonthlyRevenue } from "@/hooks/queries";
import {
  formatINR,
  formatINRFull,
  PremiumTooltip,
  ChartSummary,
  ChartEmpty,
  axisTickStyle,
  axisTickStyleMobile,
  gridProps,
  formatBucketRange,
  granularityLabel,
  type Granularity,
  type IntervalMeta,
} from "./chartUtils";

interface RevenueChartProps {
  data: MonthlyRevenue[];
  isLoading?: boolean;
  granularity?: Granularity;
  intervalMeta?: Record<string, IntervalMeta>;
}

const RevenueChart = memo(({ data, isLoading, granularity, intervalMeta }: RevenueChartProps) => {
  const isMobile = useIsMobile();

  const stats = useMemo(() => {
    if (!data?.length) return null;
    const values = data.map((d) => Number(d.revenue) || 0);
    const total = values.reduce((s, v) => s + v, 0);
    const totalPayments = data.reduce((s, d) => s + (Number(d.payments) || 0), 0);
    const peak = Math.max(...values);
    const peakIdx = values.indexOf(peak);
    const peakLabel = data[peakIdx]?.month;
    const peakRange = formatBucketRange(peakLabel ?? "", intervalMeta?.[peakLabel ?? ""], granularity);
    const nonZero = values.filter((v) => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    return { total, totalPayments, peak, peakLabel, peakRange, avg, count: nonZero.length };
  }, [data, intervalMeta, granularity]);

  if (isLoading) {
    return (
      <div className="h-[200px] sm:h-[clamp(240px,36vh,380px)] md:h-[clamp(280px,36vh,440px)] flex items-end gap-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-muted animate-pulse rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    );
  }

  if (!data?.length || stats?.total === 0) {
    return <ChartEmpty message="No revenue recorded for this period" />;
  }

  const peakValue = stats?.peak ?? 0;

  return (
    <div className="space-y-1">
      {stats && (
        <ChartSummary
          stats={[
            { label: "Total revenue", value: formatINRFull(stats.total), tone: "accent" },
            { label: "Payments", value: stats.totalPayments.toLocaleString("en-IN") },
            { label: `Peak ${granularityLabel(granularity)}`, value: `${formatINR(stats.peak)} · ${stats.peakRange ?? stats.peakLabel ?? "-"}` },
            { label: `Avg / ${granularityLabel(granularity)}`, value: formatINR(stats.avg) },
          ]}
        />
      )}
      <ChartContainer
        config={{ revenue: { label: "Revenue", color: "hsl(var(--accent))" } }}
        className="h-[200px] sm:h-[clamp(240px,36vh,380px)] md:h-[clamp(280px,36vh,440px)] overflow-hidden"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: isMobile ? -12 : 0, bottom: 4 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="revenuePeakGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps()} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={isMobile ? axisTickStyleMobile : axisTickStyle}
              minTickGap={isMobile ? 24 : 8}
              interval={isMobile ? "preserveStartEnd" : 0}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={isMobile ? axisTickStyleMobile : axisTickStyle}
              width={isMobile ? 38 : 56}
              tickFormatter={(v) => formatINR(Number(v)).replace("₹", "₹")}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              content={
                <PremiumTooltip
                  formatter={(v) => formatINRFull(v)}
                />
              }
            />
            <Bar
              dataKey="revenue"
              radius={[6, 6, 0, 0]}
              maxBarSize={isMobile ? 22 : 44}
              animationDuration={600}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={Number(entry.revenue) === peakValue ? "url(#revenuePeakGrad)" : "url(#revenueGrad)"}
                />
              ))}
            </Bar>
            {/* Trend line over bars for context */}
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="hsl(var(--accent))"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
});

RevenueChart.displayName = "RevenueChart";

export default RevenueChart;
