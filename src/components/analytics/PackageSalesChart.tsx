import { memo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
} from "recharts";
import type { PackageSalesData, PackageInfo } from "@/hooks/queries";

interface PackageSalesChartProps {
  data: PackageSalesData[];
  packageList: PackageInfo[];
  isLoading?: boolean;
}

const PACKAGE_COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))", 
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(142, 76%, 36%)",
  "hsl(262, 83%, 58%)",
];

const PackageSalesChart = memo(({ data, packageList, isLoading }: PackageSalesChartProps) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="h-[clamp(220px,34vh,380px)] md:h-[clamp(260px,34vh,440px)] flex items-center justify-center">
        <div className="w-full h-full flex flex-col gap-2 p-4">
          <div className="flex items-end justify-between h-full gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-muted animate-pulse rounded-t"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (packageList.length === 0) return null;

  const chartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--accent))" },
  };

  return (
    <>
      <ChartContainer
        config={chartConfig}
        className="h-[clamp(220px,34vh,380px)] md:h-[clamp(260px,34vh,440px)] overflow-hidden"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={isMobile ? { top: 8, right: 32, left: 0, bottom: 8 } : undefined}
          >
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={isMobile ? { fontSize: 10, textAnchor: "end" } : undefined}
              minTickGap={isMobile ? 24 : undefined}
              interval={isMobile ? "preserveStartEnd" : undefined}
              tickMargin={isMobile ? 8 : undefined}
              padding={isMobile ? { left: 4, right: 16 } : undefined}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={isMobile ? { fontSize: 10 } : undefined}
              width={isMobile ? 30 : undefined}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {packageList.map((pkg, index) => (
              <Bar
                key={pkg.id}
                dataKey={pkg.label}
                stackId="packages"
                fill={PACKAGE_COLORS[index % PACKAGE_COLORS.length]}
                radius={index === packageList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {packageList.map((pkg, index) => (
          <div key={pkg.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: PACKAGE_COLORS[index % PACKAGE_COLORS.length] }}
            />
            <span className="text-xs sm:text-sm text-muted-foreground">{pkg.label}</span>
          </div>
        ))}
      </div>
    </>
  );
});

PackageSalesChart.displayName = "PackageSalesChart";

export default PackageSalesChart;
