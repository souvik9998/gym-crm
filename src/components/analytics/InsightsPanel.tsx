import { TrendingUp, TrendingDown, Sparkles, Award, Target, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral";
  icon: "up" | "down" | "spark" | "award" | "target" | "activity";
  title: string;
  detail: string;
}

const iconMap = {
  up: TrendingUp,
  down: TrendingDown,
  spark: Sparkles,
  award: Award,
  target: Target,
  activity: Activity,
};

interface Props {
  insights: Insight[];
  isLoading?: boolean;
}

export function InsightsPanel({ insights, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6 shadow-sm">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!insights.length) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6 shadow-sm overflow-hidden relative">
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold tracking-tight">Smart Insights</h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground">Auto-generated from your data</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5 sm:gap-3">
          {insights.map((insight, idx) => {
            const Icon = iconMap[insight.icon];
            const toneClass =
              insight.tone === "positive"
                ? "border-success/20 bg-success/5"
                : insight.tone === "negative"
                  ? "border-destructive/20 bg-destructive/5"
                  : "border-border/60 bg-muted/30";
            const iconClass =
              insight.tone === "positive"
                ? "bg-success/15 text-success"
                : insight.tone === "negative"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground";
            return (
              <div
                key={insight.id}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-3 transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5",
                  toneClass,
                  "animate-fade-in"
                )}
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110",
                    iconClass
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-semibold leading-tight">{insight.title}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
                    {insight.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
