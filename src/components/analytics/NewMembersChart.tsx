import { memo, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { MemberGrowth } from "@/hooks/queries";
import {
  PremiumTooltip,
  ChartSummary,
  ChartEmpty,
  axisTickStyle,
  axisTickStyleMobile,
  gridProps,
  formatCompact,
  formatBucketRange,
  granularityLabel,
  type Granularity,
  type IntervalMeta,
} from "./chartUtils";

interface NewMembersChartProps {
  data: MemberGrowth[];
  isLoading?: boolean;
  granularity?: Granularity;
  intervalMeta?: Record<string, IntervalMeta>;
}

const NewMembersChart = memo(({ data, isLoading, granularity, intervalMeta }: NewMembersChartProps) => {
  const isMobile = useIsMobile();

  const stats = useMemo(() => {
    if (!data?.length) return null;
    const values = data.map((d) => Number(d.newMembers) || 0);
    const total = values.reduce((s, v) => s + v, 0);
    const peak = Math.max(...values);
    const peakIdx = values.indexOf(peak);
    const peakLabel = data[peakIdx]?.month;
    const peakRange = formatBucketRange(peakLabel ?? "", intervalMeta?.[peakLabel ?? ""], granularity);
    const nonZero = values.filter((v) => v > 0);
    const avg = nonZero.length ? total / nonZero.length : 0;
    return { total, peak, peakLabel, peakRange, avg };
  }, [data, intervalMeta, granularity]);

  if (isLoading) {
    return (
      <div className="h-[180px] sm:h-[clamp(220px,32vh,340px)] flex items-end gap-2 p-4">
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
    return <ChartEmpty message="No new sign-ups in this period" />;
  }

  const peakValue = stats?.peak ?? 0;

  return (
    <div className="space-y-1">
      {stats && (
        <ChartSummary
          stats={[
            { label: "Total joined", value: stats.total.toLocaleString("en-IN"), tone: "success" },
            { label: `Best ${granularityLabel(granularity)}`, value: `${stats.peak} · ${stats.peakRange ?? stats.peakLabel ?? "-"}` },
            { label: `Avg / ${granularityLabel(granularity)}`, value: stats.avg.toFixed(1) },
          ]}
        />
      )}
      <ChartContainer
        config={{ newMembers: { label: "New Members", color: "hsl(var(--success))" } }}
        className="h-[180px] sm:h-[clamp(220px,32vh,340px)] overflow-hidden"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: isMobile ? -16 : -8, bottom: 4 }}>
            <defs>
              <linearGradient id="newMembersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="newMembersPeakGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.7} />
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
              width={isMobile ? 30 : 44}
              tickFormatter={(v) => formatCompact(Number(v))}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              content={<PremiumTooltip formatter={(v) => `${v.toLocaleString("en-IN")} new`} />}
            />
            <Bar
              dataKey="newMembers"
              radius={[6, 6, 0, 0]}
              maxBarSize={isMobile ? 22 : 44}
              animationDuration={600}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={Number(entry.newMembers) === peakValue && peakValue > 0 ? "url(#newMembersPeakGrad)" : "url(#newMembersGrad)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
});

NewMembersChart.displayName = "NewMembersChart";

export default NewMembersChart;
