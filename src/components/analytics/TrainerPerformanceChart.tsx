import { memo, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { TrainerStats } from "@/hooks/queries";
import {
  formatINR,
  formatINRFull,
  PremiumTooltip,
  ChartEmpty,
  axisTickStyle,
  axisTickStyleMobile,
  gridProps,
  formatCompact,
} from "./chartUtils";

interface TrainerPerformanceChartProps {
  data: TrainerStats[];
  isLoading?: boolean;
}

const PALETTE = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
];

const TrainerPerformanceChart = memo(({ data, isLoading }: TrainerPerformanceChartProps) => {
  const isMobile = useIsMobile();

  // Sort by revenue desc for consistent palette + ranking
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => Number(b.revenue) - Number(a.revenue)),
    [data]
  );

  const totalRevenue = useMemo(
    () => sorted.reduce((s, t) => s + (Number(t.revenue) || 0), 0),
    [sorted]
  );
  const totalClients = useMemo(
    () => sorted.reduce((s, t) => s + (Number(t.members) || 0), 0),
    [sorted]
  );

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-[200px] flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="h-[200px] flex items-end gap-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 bg-muted animate-pulse rounded" style={{ height: `${30 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!sorted.length || totalRevenue === 0) {
    return <ChartEmpty message="No trainer revenue recorded for this period" />;
  }

  // Pie data with explicit color so legend + slices match
  const pieData = sorted.map((t, i) => ({
    ...t,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="space-y-5">
      {/* Top summary chips */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pb-3 border-b border-border/50">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            PT Revenue
          </span>
          <span className="text-sm font-semibold tabular-nums text-warning">
            {formatINRFull(totalRevenue)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Trainers
          </span>
          <span className="text-sm font-semibold tabular-nums">{sorted.length}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Total clients
          </span>
          <span className="text-sm font-semibold tabular-nums">{totalClients}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Top earner
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {sorted[0].name} · {formatINR(Number(sorted[0].revenue))}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Donut */}
        <div className="overflow-hidden">
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            Revenue Share
          </h4>
          <div className="relative h-[220px] sm:h-[260px]">
            <ChartContainer
              config={{ revenue: { label: "Revenue", color: "hsl(var(--accent))" } }}
              className="h-full overflow-hidden"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 50 : 60}
                    outerRadius={isMobile ? 80 : 95}
                    paddingAngle={2}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const t = payload[0].payload as TrainerStats & { color: string };
                      const pct = totalRevenue > 0 ? (Number(t.revenue) / totalRevenue) * 100 : 0;
                      return (
                        <div className="rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-lg px-3 py-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />
                            <p className="text-[12px] font-semibold">{t.name}</p>
                          </div>
                          <div className="space-y-0.5 text-[11px]">
                            <p className="text-muted-foreground">
                              Revenue: <span className="font-semibold text-foreground">{formatINRFull(Number(t.revenue))}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Share: <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
                            </p>
                            <p className="text-muted-foreground">
                              Clients: <span className="font-semibold text-foreground">{t.members}</span>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            {/* Centered total */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-base font-bold tabular-nums">{formatINR(totalRevenue)}</span>
            </div>
          </div>

          {/* Legend with values */}
          <div className="mt-3 space-y-1.5">
            {pieData.map((t) => {
              const pct = totalRevenue > 0 ? (Number(t.revenue) / totalRevenue) * 100 : 0;
              return (
                <div key={t.name} className="flex items-center justify-between text-[11px] gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: t.color }} />
                    <span className="truncate text-muted-foreground">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums flex-shrink-0">
                    <span className="font-semibold">{formatINR(Number(t.revenue))}</span>
                    <span className="text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Horizontal bars: clients */}
        <div className="overflow-hidden">
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            Active Clients
          </h4>
          <ChartContainer
            config={{ members: { label: "Clients", color: "hsl(var(--primary))" } }}
            className="h-[220px] sm:h-[260px] overflow-hidden"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pieData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="trainerClientsGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={isMobile ? axisTickStyleMobile : axisTickStyle}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={isMobile ? 60 : 90}
                  tick={isMobile ? axisTickStyleMobile : axisTickStyle}
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  content={
                    <PremiumTooltip formatter={(v) => `${v} clients`} />
                  }
                />
                <Bar
                  dataKey="members"
                  fill="url(#trainerClientsGrad)"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={28}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
});

TrainerPerformanceChart.displayName = "TrainerPerformanceChart";

export default TrainerPerformanceChart;
