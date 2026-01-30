import { memo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { TrainerStats } from "@/hooks/queries";

interface TrainerPerformanceChartProps {
  data: TrainerStats[];
  isLoading?: boolean;
}

const COLORS = ["hsl(var(--accent))", "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))"];

const TrainerPerformanceChart = memo(({ data, isLoading }: TrainerPerformanceChartProps) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-[clamp(200px,28vh,300px)] md:h-[clamp(220px,26vh,320px)] flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="h-[clamp(200px,28vh,300px)] md:h-[clamp(220px,26vh,320px)] flex items-center justify-center">
          <div className="w-full h-full flex flex-col gap-2 p-4">
            <div className="flex items-end justify-between h-full gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-muted animate-pulse rounded"
                  style={{ height: `${30 + Math.random() * 60}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  const chartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--accent))" },
    members: { label: "Members", color: "hsl(var(--primary))" },
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="overflow-hidden">
        <h4 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4 text-center">Revenue Distribution</h4>
        <ChartContainer
          config={chartConfig}
          className="h-[clamp(200px,28vh,300px)] md:h-[clamp(220px,26vh,320px)] overflow-hidden"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={isMobile ? "70%" : 80}
                label={isMobile ? undefined : ({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const trainerData = payload[0].payload as TrainerStats;
                    return (
                      <div className="bg-popover p-2 rounded-md shadow-md border text-sm">
                        <p className="font-medium">{trainerData.name}</p>
                        <p>Revenue: ₹{trainerData.revenue.toLocaleString("en-IN")}</p>
                        <p>Clients: {trainerData.members}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <div className="overflow-hidden">
        <h4 className="text-xs sm:text-sm font-medium mb-3 sm:mb-4 text-center">Client Count</h4>
        <ChartContainer
          config={chartConfig}
          className="h-[clamp(200px,28vh,300px)] md:h-[clamp(220px,26vh,320px)] overflow-hidden"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={isMobile ? { top: 8, right: 24, left: 0, bottom: 8 } : undefined}
            >
              <XAxis type="number" tickLine={false} axisLine={false} tick={isMobile ? { fontSize: 10 } : undefined} />
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={isMobile ? 60 : 80} tick={isMobile ? { fontSize: 10 } : undefined} />
              <ChartTooltip />
              <Bar dataKey="members" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
});

TrainerPerformanceChart.displayName = "TrainerPerformanceChart";

export default TrainerPerformanceChart;
