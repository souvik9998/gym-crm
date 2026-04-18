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
} from "recharts";
import type { PackageSalesData, PackageInfo } from "@/hooks/queries";
import {
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

interface PackageSalesChartProps {
  data: PackageSalesData[];
  packageList: PackageInfo[];
  isLoading?: boolean;
  granularity?: Granularity;
  intervalMeta?: Record<string, IntervalMeta>;
}

const PACKAGE_COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
];

const PackageSalesChart = memo(({ data, packageList, isLoading, granularity, intervalMeta }: PackageSalesChartProps) => {
  const isMobile = useIsMobile();

  const stats = useMemo(() => {
    if (!packageList?.length || !data?.length) return null;

    const totalsByPkg: Record<string, number> = {};
    let total = 0;

    for (const row of data) {
      for (const pkg of packageList) {
        const v = Number((row as any)[pkg.label]) || 0;
        totalsByPkg[pkg.label] = (totalsByPkg[pkg.label] ?? 0) + v;
        total += v;
      }
    }

    const ranked = packageList
      .map((p) => ({ ...p, total: totalsByPkg[p.label] ?? 0 }))
      .sort((a, b) => b.total - a.total);

    const top = ranked[0];
    return { totalsByPkg, total, ranked, top };
  }, [data, packageList]);

  if (isLoading) {
    return (
      <div className="h-[200px] sm:h-[clamp(240px,36vh,400px)] flex items-end gap-2 p-4">
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

  if (!packageList?.length || !data?.length || stats?.total === 0) {
    return <ChartEmpty message="No package sales for this period" />;
  }

  return (
    <div className="space-y-1">
      {stats && (
        <ChartSummary
          stats={[
            { label: "Total subscriptions", value: stats.total.toLocaleString("en-IN"), tone: "primary" },
            { label: "Top package", value: `${stats.top.label} · ${stats.top.total}` },
            { label: "Package types", value: `${packageList.length}` },
          ]}
        />
      )}
      <ChartContainer
        config={{ revenue: { label: "Sales", color: "hsl(var(--accent))" } }}
        className="h-[200px] sm:h-[clamp(240px,36vh,400px)] overflow-hidden"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: isMobile ? -16 : -8, bottom: 4 }}>
            <defs>
              {packageList.map((pkg, i) => (
                <linearGradient key={pkg.id} id={`pkgGrad-${pkg.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PACKAGE_COLORS[i % PACKAGE_COLORS.length]} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={PACKAGE_COLORS[i % PACKAGE_COLORS.length]} stopOpacity={0.7} />
                </linearGradient>
              ))}
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
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                const range = formatBucketRange(String(label ?? ""), intervalMeta?.[String(label ?? "")], granularity);
                return (
                  <div className="rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-lg px-3 py-2 min-w-[180px] animate-fade-in">
                    {range && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{range}</p>}
                    <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-border/50">
                      <p className="text-[11px] font-semibold">{label}</p>
                      <p className="text-[11px] font-bold tabular-nums">{total} sold</p>
                    </div>
                    <div className="space-y-1">
                      {payload
                        .filter((p) => Number(p.value) > 0)
                        .sort((a, b) => Number(b.value) - Number(a.value))
                        .map((p, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
                              <span className="text-muted-foreground truncate">{p.name}</span>
                            </div>
                            <span className="font-semibold tabular-nums">{p.value}</span>
                          </div>
                        ))}
                      {total === 0 && (
                        <p className="text-[11px] text-muted-foreground">No sales</p>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            {packageList.map((pkg, index) => (
              <Bar
                key={pkg.id}
                dataKey={pkg.label}
                stackId="packages"
                fill={`url(#pkgGrad-${pkg.id})`}
                radius={index === packageList.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={isMobile ? 22 : 44}
                animationDuration={600}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Legend with totals */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 justify-center">
        {(stats?.ranked ?? packageList).map((pkg, index) => {
          const colorIdx = packageList.findIndex((p) => p.id === pkg.id);
          const color = PACKAGE_COLORS[(colorIdx >= 0 ? colorIdx : index) % PACKAGE_COLORS.length];
          const total = stats?.totalsByPkg[pkg.label] ?? 0;
          return (
            <div key={pkg.id} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <span className="text-muted-foreground">{pkg.label}</span>
              <span className="font-semibold tabular-nums">· {total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

PackageSalesChart.displayName = "PackageSalesChart";

export default PackageSalesChart;
