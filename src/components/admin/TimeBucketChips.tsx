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
   * Compact variant hides the time-range subtitle and shrinks the chip,
   * useful for dense filter rows (e.g. attendance history header).
   */
  compact?: boolean;
  className?: string;
}

const ACTIVE_STYLES: Record<TimeBucket, string> = {
  all:
    "bg-gradient-to-br from-foreground to-foreground/85 text-background border-foreground shadow-[0_6px_18px_-6px_hsl(var(--foreground)/0.45)]",
  morning:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-400/70 shadow-[0_6px_18px_-6px_hsl(35_92%_55%/0.55)]",
  afternoon:
    "bg-gradient-to-br from-sky-400 to-cyan-500 text-white border-sky-400/70 shadow-[0_6px_18px_-6px_hsl(200_92%_55%/0.55)]",
  evening:
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white border-violet-400/70 shadow-[0_6px_18px_-6px_hsl(280_85%_60%/0.55)]",
  night:
    "bg-gradient-to-br from-indigo-600 to-slate-800 text-white border-indigo-500/70 shadow-[0_6px_18px_-6px_hsl(230_60%_30%/0.6)]",
  custom:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white border-emerald-400/70 shadow-[0_6px_18px_-6px_hsl(160_70%_45%/0.55)]",
};

const IDLE_TONE: Record<TimeBucket, string> = {
  all: "hover:border-foreground/40 hover:text-foreground",
  morning: "hover:border-amber-400/60 hover:text-amber-700 dark:hover:text-amber-300",
  afternoon: "hover:border-sky-400/60 hover:text-sky-700 dark:hover:text-sky-300",
  evening: "hover:border-violet-400/60 hover:text-violet-700 dark:hover:text-violet-300",
  night: "hover:border-indigo-500/60 hover:text-indigo-700 dark:hover:text-indigo-300",
  custom: "hover:border-emerald-400/60 hover:text-emerald-700 dark:hover:text-emerald-300",
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
        "flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1",
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
              "group shrink-0 inline-flex items-center gap-2 rounded-full border transition-all duration-300 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "active:scale-[0.97]",
              compact ? "px-3 py-1.5" : "px-4 py-2",
              isActive
                ? cn("scale-[1.02]", ACTIVE_STYLES[option.value])
                : cn(
                    "border-border/60 bg-background/70 text-muted-foreground backdrop-blur-sm",
                    "hover:bg-background hover:shadow-sm hover:-translate-y-0.5",
                    IDLE_TONE[option.value],
                  ),
            )}
          >
            <span
              aria-hidden
              className={cn(
                "text-base leading-none transition-transform duration-300",
                isActive ? "scale-110" : "group-hover:scale-110",
              )}
            >
              {option.emoji}
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className={cn("font-semibold whitespace-nowrap", compact ? "text-[11px]" : "text-xs")}>
                {option.label}
              </span>
              {!compact && (
                <span
                  className={cn(
                    "text-[10px] whitespace-nowrap tabular-nums tracking-tight transition-opacity",
                    isActive ? "opacity-90" : "opacity-60",
                  )}
                >
                  {option.range}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
