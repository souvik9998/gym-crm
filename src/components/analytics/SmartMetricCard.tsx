import { ReactNode, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { cn } from "@/lib/utils";

export type MetricTone = "primary" | "accent" | "success" | "warning";

interface SmartMetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  tone?: MetricTone;
  icon: ReactNode;
  sparkline?: number[];
  delta?: number | null; // % change vs previous period
  isLoading?: boolean;
  formatValue?: (v: number) => string;
}

const toneMap: Record<
  MetricTone,
  { text: string; bg: string; ring: string; spark: string; gradient: string }
> = {
  primary: {
    text: "text-primary",
    bg: "bg-primary/10",
    ring: "ring-primary/20",
    spark: "hsl(var(--primary))",
    gradient: "from-primary/8 via-primary/3 to-transparent",
  },
  accent: {
    text: "text-accent",
    bg: "bg-accent/10",
    ring: "ring-accent/20",
    spark: "hsl(var(--accent))",
    gradient: "from-accent/8 via-accent/3 to-transparent",
  },
  success: {
    text: "text-success",
    bg: "bg-success/10",
    ring: "ring-success/20",
    spark: "hsl(var(--success))",
    gradient: "from-success/8 via-success/3 to-transparent",
  },
  warning: {
    text: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/20",
    spark: "hsl(var(--warning))",
    gradient: "from-warning/8 via-warning/3 to-transparent",
  },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return null;
    const w = 100;
    const h = 28;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = w / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return [x, y] as const;
    });
    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area };
  }, [data]);

  if (!path) return <div className="h-7" />;

  const gid = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7 overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gid})`} />
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="[stroke-dasharray:200] [stroke-dashoffset:200] animate-[spark-draw_900ms_ease-out_forwards]"
      />
      <style>{`@keyframes spark-draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

function DeltaPill({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined || !isFinite(delta)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
        <Minus className="w-2.5 h-2.5" />
        —
      </span>
    );
  }
  const positive = delta >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors",
        positive
          ? "text-success bg-success/10"
          : "text-destructive bg-destructive/10"
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function SmartMetricCard({
  label,
  value,
  prefix,
  tone = "primary",
  icon,
  sparkline,
  delta,
  isLoading,
  formatValue,
}: SmartMetricCardProps) {
  const t = toneMap[tone];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="w-9 h-9 rounded-xl" />
        </div>
        <Skeleton className="h-7 w-28 mb-2" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-3 sm:p-5 shadow-sm",
        "transition-all duration-300 ease-out",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-border",
        "animate-fade-in"
      )}
    >
      {/* Soft gradient wash */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 group-hover:opacity-100 transition-opacity duration-500",
          t.gradient
        )}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground tracking-wide">
            {label}
          </p>
          <div
            className={cn(
              "w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ring-1 transition-transform duration-300 group-hover:scale-110",
              t.bg,
              t.ring,
              t.text
            )}
          >
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <p className={cn("text-xl sm:text-2xl font-bold tracking-tight", t.text)}>
            <AnimatedCounter
              value={value}
              prefix={prefix}
              duration={900}
              formatValue={formatValue ?? ((v) => v.toLocaleString("en-IN"))}
            />
          </p>
          <DeltaPill delta={delta} />
        </div>

        <div className="-mx-1">
          <Sparkline data={sparkline ?? []} color={t.spark} />
        </div>
      </div>
    </div>
  );
}
