import { cn } from "@/lib/utils";
import {
  ALL_BUCKET_OPTION,
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
  /**
   * Admin-configurable options. When omitted, the legacy built-in chip set
   * is used so existing call-sites keep rendering the same UI.
   */
  options?: TimeBucketOption[];
}

// Cycling palette used for admin-defined chips (no fixed mapping by bucket id).
const ACCENT_PALETTE: Array<{ active: string; idleAccent: string; idleHover: string }> = [
  {
    active:
      "bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 text-white border-amber-400 shadow-[0_8px_22px_-8px_hsl(28_95%_55%/0.6)]",
    idleAccent: "before:bg-amber-400",
    idleHover: "hover:border-amber-400/70 hover:bg-amber-50/60 dark:hover:bg-amber-950/20",
  },
  {
    active:
      "bg-gradient-to-br from-sky-400 via-cyan-400 to-cyan-500 text-white border-sky-400 shadow-[0_8px_22px_-8px_hsl(195_92%_50%/0.6)]",
    idleAccent: "before:bg-sky-400",
    idleHover: "hover:border-sky-400/70 hover:bg-sky-50/60 dark:hover:bg-sky-950/20",
  },
  {
    active:
      "bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white border-violet-400 shadow-[0_8px_22px_-8px_hsl(280_85%_55%/0.6)]",
    idleAccent: "before:bg-violet-500",
    idleHover: "hover:border-violet-400/70 hover:bg-violet-50/60 dark:hover:bg-violet-950/20",
  },
  {
    active:
      "bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white border-indigo-600 shadow-[0_8px_22px_-8px_hsl(230_60%_25%/0.7)]",
    idleAccent: "before:bg-indigo-600",
    idleHover: "hover:border-indigo-500/70 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20",
  },
  {
    active:
      "bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 text-white border-emerald-400 shadow-[0_8px_22px_-8px_hsl(165_75%_40%/0.6)]",
    idleAccent: "before:bg-emerald-500",
    idleHover: "hover:border-emerald-400/70 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20",
  },
  {
    active:
      "bg-gradient-to-br from-pink-400 via-rose-500 to-red-500 text-white border-pink-400 shadow-[0_8px_22px_-8px_hsl(340_85%_55%/0.6)]",
    idleAccent: "before:bg-pink-500",
    idleHover: "hover:border-pink-400/70 hover:bg-pink-50/60 dark:hover:bg-pink-950/20",
  },
];

const ALL_STYLE = {
  active:
    "bg-gradient-to-br from-slate-900 to-slate-700 text-white border-slate-900 shadow-[0_8px_22px_-8px_hsl(220_25%_15%/0.55)] dark:from-slate-100 dark:to-slate-300 dark:text-slate-900 dark:border-slate-100",
  idleAccent: "before:bg-foreground/40",
  idleHover: "hover:border-foreground/40",
};

const CUSTOM_STYLE = {
  active:
    "bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 text-white border-emerald-400 shadow-[0_8px_22px_-8px_hsl(165_75%_40%/0.6)]",
  idleAccent: "before:bg-emerald-500",
  idleHover: "hover:border-emerald-400/70 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20",
};

function styleFor(option: TimeBucketOption, indexAmongCustom: number) {
  if (option.value === "all") return ALL_STYLE;
  if (option.value === "custom") return CUSTOM_STYLE;
  return ACCENT_PALETTE[indexAmongCustom % ACCENT_PALETTE.length];
}

export const TimeBucketChips = ({
  value,
  onChange,
  compact = false,
  className,
  options,
}: TimeBucketChipsProps) => {
  const items = options && options.length > 0 ? options : TIME_BUCKET_OPTIONS;
  // Index is computed only over admin-defined chips so the "All" / "Custom"
  // bookends always keep their distinctive neutral / emerald styling.
  let customIdx = -1;
  return (
    <div
      className={cn(
        "flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1",
        className,
      )}
      role="tablist"
      aria-label="Time of day filter"
    >
      {items.map((option) => {
        if (option.value !== "all" && option.value !== "custom") customIdx += 1;
        const isActive = value === option.value;
        const style = styleFor(option, customIdx);
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
                ? cn("scale-[1.03]", style.active)
                : cn(
                    "overflow-hidden border-border/70 bg-card text-foreground/80",
                    "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[60%] before:w-[3px] before:rounded-r-full before:transition-opacity before:opacity-70",
                    "hover:shadow-md hover:-translate-y-0.5",
                    style.idleAccent,
                    style.idleHover,
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

// Re-export to keep historical imports working without churn.
export { ALL_BUCKET_OPTION };
