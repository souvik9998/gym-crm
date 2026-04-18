import { memo, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
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
  dateAxisProps,
  type Granularity,
  type IntervalMeta,
} from "./chartUtils";

interface MemberGrowthChartProps {
  data: MemberGrowth[];
  isLoading?: boolean;
  granularity?: Granularity;
  intervalMeta?: Record<string, IntervalMeta>;
}

const MemberGrowthChart = memo(({ data, isLoading, granularity, intervalMeta }: MemberGrowthChartProps) => {
  const isMobile = useIsMobile();

  const stats = useMemo(() => {
    if (!data?.length) return null;
    const values = data.map((d) => Number(d.members) || 0);
    const start = values[0] ?? 0;
    const end = values[values.length - 1] ?? 0;
    const growth = end - start;
    const growthPct = start > 0 ? (growth / start) * 100 : null;
    return { current: end, start, growth, growthPct };
  }, [data]);

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

  if (!data?.length) {
    return <ChartEmpty message="No member data available" />;
  }

  return (
    <div className="space-y-1">
      {stats && (
        <ChartSummary
          stats={[
            { label: "Current total", value: stats.current.toLocaleString("en-IN"), tone: "primary" },
            { label: "Period start", value: stats.start.toLocaleString("en-IN") },
            {
              label: "Net change",
              value: `${stats.growth >= 0 ? "+" : ""}${stats.growth.toLocaleString("en-IN")}${stats.growthPct !== null ? ` (${stats.growthPct >= 0 ? "+" : ""}${stats.growthPct.toFixed(1)}%)` : ""}`,
              tone: stats.growth >= 0 ? "success" : "warning",
            },
          ]}
        />
      )}
      <ChartContainer
        config={{ members: { label: "Members", color: "hsl(var(--primary))" } }}
        className="h-[180px] sm:h-[clamp(220px,32vh,340px)] overflow-hidden"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: isMobile ? -16 : -8, bottom: 4 }}>
            <defs>
              <linearGradient id="memberGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps()} />
            <XAxis
              dataKey="month"
              {...dateAxisProps({ isMobile, granularity, dataLength: data.length })}
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
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeOpacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as MemberGrowth;
                const range = formatBucketRange(String(label ?? ""), intervalMeta?.[String(label ?? "")], granularity);
                return (
                  <div className="rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-lg px-3 py-2 min-w-[180px] animate-fade-in">
                    {range && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{range}</p>}
                    <p className="text-[11px] font-semibold mb-1.5">{label}</p>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm bg-primary" />
                          <span className="text-muted-foreground">Total members</span>
                        </div>
                        <span className="font-semibold tabular-nums">{Number(row.members).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground pl-3.5">New this {granularityLabel(granularity)}</span>
                        <span className="font-semibold tabular-nums">{Number(row.newMembers) || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="members"
              stroke="hsl(var(--primary))"
              strokeWidth={2.25}
              fill="url(#memberGrowthGrad)"
              dot={{ r: 2.5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
});

MemberGrowthChart.displayName = "MemberGrowthChart";

export default MemberGrowthChart;
