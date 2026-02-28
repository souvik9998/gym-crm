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
import type { MemberGrowth } from "@/hooks/queries";

interface NewMembersChartProps {
  data: MemberGrowth[];
  isLoading?: boolean;
}

const NewMembersChart = memo(({ data, isLoading }: NewMembersChartProps) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="h-[180px] sm:h-[clamp(210px,30vh,320px)] md:h-[clamp(230px,30vh,360px)] flex items-center justify-center">
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

  const chartConfig = {
    newMembers: { label: "New Members", color: "hsl(var(--success))" },
  };

  return (
    <ChartContainer
      config={chartConfig}
      className="h-[180px] sm:h-[clamp(210px,30vh,320px)] md:h-[clamp(230px,30vh,360px)] overflow-hidden"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={isMobile ? { top: 4, right: 8, left: -10, bottom: 4 } : undefined}
        >
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={isMobile ? { fontSize: 9, textAnchor: "end" } : undefined}
            minTickGap={isMobile ? 24 : undefined}
            interval={isMobile ? "preserveStartEnd" : undefined}
            tickMargin={isMobile ? 8 : undefined}
            padding={isMobile ? { left: 4, right: 16 } : undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={isMobile ? { fontSize: 9 } : undefined}
            width={isMobile ? 24 : undefined}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="newMembers" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 20 : 40} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
});

NewMembersChart.displayName = "NewMembersChart";

export default NewMembersChart;
