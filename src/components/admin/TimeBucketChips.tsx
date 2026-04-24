import { cn } from "@/lib/utils";
import {
  TIME_BUCKET_OPTIONS,
  type TimeBucket,
  type TimeBucketOption,
} from "@/components/admin/staff/timeslots/timeSlotUtils";

interface TimeBucketChipsProps {
  value: TimeBucket;
  onChange: (next: TimeBucket) => void;
  /**
   * Compact variant trims spacing but still keeps the time-range visible —
   * the time window is the whole point of these chips, so it's never hidden.
   */
  compact?: boolean;
  className?: string;
}

// Each bucket gets its own gradient + accent so the active state is unmistakable
// without relying on the user remembering which colour means which time of day.
const ACTIVE_STYLES: Record<TimeBucket, string> = {
  all:
    "bg-gradient-to-br from-slate-900 to-slate-700 text-white border-slate-900 shadow-[0_8px_22px_-8px_hsl(220_25%_15%/0.55)] dark:from-slate-100 dark:to-slate-300 dark:text-slate-900 dark:border-slate-100",
  morning:
    "bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 text-white border-amber-400 shadow-[0_8px_22px_-8px_hsl(28_95%_55%/0.6)]",
  afternoon:
    "bg-gradient-to-br from-sky-400 via-cyan-400 to-cyan-500 text-white border-sky-400 shadow-[0_8px_22px_-8px_hsl(195_92%_50%/0.6)]",
  evening:
    "bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white border-violet-400 shadow-[0_8px_22px_-8px_hsl(280_85%_55%/0.6)]",
  night:
    "bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white border-indigo-600 shadow-[0_8px_22px_-8px_hsl(230_60%_25%/0.7)]",
  custom:
    "bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 text-white border-emerald-400 shadow-[0_8px_22px_-8px_hsl(165_75%_40%/0.6)]",
};

// Subtle idle accents — a thin colored bar on the left edge of each chip
// so users can scan the row and learn the colour-coding even before clicking.
const IDLE_ACCENT: Record<TimeBucket, string> = {
  all: "before:bg-foreground/40",
  morning: "before:bg-amber-400",
  afternoon: "before:bg-sky-400",
  evening: "before:bg-violet-500",
  night: "before:bg-indigo-600",
  custom: "before:bg-emerald-500",
};

const IDLE_HOVER: Record<TimeBucket, string> = {
  all: "hover:border-foreground/40",
  morning: "hover:border-amber-400/70 hover:bg-amber-50/60 dark:hover:bg-amber-950/20",
  afternoon: "hover:border-sky-400/70 hover:bg-sky-50/60 dark:hover:bg-sky-950/20",
  evening: "hover:border-violet-400/70 hover:bg-violet-50/60 dark:hover:bg-violet-950/20",
  night: "hover:border-indigo-500/70 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20",
  custom: "hover:border-emerald-400/70 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20",
};

export const TimeBucketChips = ({
  value,
  onChange,
  compact = false,
  className,
}: TimeBucketChipsProps) => {
  return (
    <div
      className={cn(
        "flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1",
        className,
      )}
      role="tablist"
      aria-label="Time of day filter"
    >
      {TIME_BUCKET_OPTIONS.map((option: TimeBucketOption) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            title={`${option.label} · ${option.range}`}
            className={cn(
              "group relative shrink-0 inline-flex items-center gap-2.5 rounded-2xl border-2 transition-all duration-300 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.97]",
              compact ? "px-3 py-2" : "px-4 py-2.5",
              isActive
                ? cn("scale-[1.03]", ACTIVE_STYLES[option.value])
                : cn(
                    "overflow-hidden border-border/70 bg-card text-foreground/80",
                    "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[60%] before:w-[3px] before:rounded-r-full before:transition-opacity before:opacity-70",
                    "hover:shadow-md hover:-translate-y-0.5",
                    IDLE_ACCENT[option.value],
                    IDLE_HOVER[option.value],
                  ),
            )}
          >
            <span
              aria-hidden
              className={cn(
                "text-lg leading-none transition-transform duration-300 shrink-0",
                isActive ? "scale-110" : "group-hover:scale-110",
              )}
            >
              {option.emoji}
            </span>
            <span className="flex flex-col items-start leading-tight gap-0.5 min-w-0">
              <span
                className={cn(
                  "font-semibold whitespace-nowrap tracking-tight",
                  compact ? "text-[12px]" : "text-[13px]",
                )}
              >
                {option.label}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap tabular-nums tracking-tight font-medium",
                  compact ? "text-[10px]" : "text-[11px]",
                  isActive ? "opacity-95" : "opacity-70",
                )}
              >
                {option.range}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
