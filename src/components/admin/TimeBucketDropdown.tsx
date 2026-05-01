import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, Check } from "lucide-react";
import {
  TIME_BUCKET_OPTIONS,
  type TimeBucket,
  type TimeBucketOption,
} from "@/components/admin/staff/timeslots/timeSlotUtils";
import { useCloseOnRouteChange } from "@/hooks/use-close-on-route-change";

interface TimeBucketDropdownProps {
  value: TimeBucket;
  onChange: (next: TimeBucket) => void;
  className?: string;
  /** Admin-configurable options. Falls back to defaults when omitted. */
  options?: TimeBucketOption[];
  /**
   * When true, render only the clock icon (no label / chevron). Used in tight
   * mobile action rows where the trigger needs to fit beside other icon
   * buttons. Default: false.
   */
  iconOnly?: boolean;
}

// Small cycling palette for the inline dot next to each option.
const DOT_PALETTE = [
  "bg-amber-400",
  "bg-sky-400",
  "bg-violet-500",
  "bg-indigo-600",
  "bg-emerald-500",
  "bg-pink-500",
];

/**
 * Mobile-only dropdown variant of TimeBucketChips. Visually aligned with
 * TrainerFilterDropdown / TimeSlotFilterDropdown so all three filter pills
 * sit on a single row on small screens without overflowing.
 */
export const TimeBucketDropdown = ({
  value,
  onChange,
  className,
  options,
  iconOnly = false,
}: TimeBucketDropdownProps) => {
  const [open, setOpen] = useState(false);
  const items = options && options.length > 0 ? options : TIME_BUCKET_OPTIONS;
  const isActive = value !== "all";
  const selected = items.find((o) => o.value === value) ?? items[0];

  if (iconOnly) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            title={selected?.label}
            aria-label={`Time of day: ${selected?.label ?? "All times"}`}
            className={cn(
              "h-9 w-9 rounded-xl border shadow-sm relative shrink-0",
              "transition-all duration-200 ease-out active:scale-95",
              "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
              isActive
                ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                : "bg-card border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              className,
            )}
            onClick={(e) => e.currentTarget.blur()}
          >
            <Clock className="w-4 h-4" />
            {isActive && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden w-[min(20rem,calc(100vw-2rem))]"
        >
          <TimeBucketPopoverBody
            items={items}
            value={value}
            onChange={onChange}
            isActive={isActive}
            setOpen={setOpen}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 w-full justify-between px-3 rounded-xl border shadow-sm",
            "transition-all duration-200 ease-out",
            "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
            "active:scale-[0.98]",
            isActive
              ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 shadow-md"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-300 hover:shadow-md hover:scale-[1.02]",
            className,
          )}
          onClick={(e) => e.currentTarget.blur()}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Clock
              className={cn(
                "w-3.5 h-3.5 transition-colors shrink-0",
                isActive
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-amber-600 dark:text-amber-400",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium truncate text-left",
                isActive
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-amber-700 dark:text-amber-300",
              )}
            >
              {selected?.label}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "w-3 h-3 ml-1 shrink-0 transition-transform duration-200",
              open && "rotate-180",
              isActive
                ? "text-amber-700 dark:text-amber-300"
                : "text-amber-600 dark:text-amber-400",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden w-[min(20rem,calc(100vw-2rem))]"
      >
        <TimeBucketPopoverBody
          items={items}
          value={value}
          onChange={onChange}
          isActive={isActive}
          setOpen={setOpen}
        />
      </PopoverContent>
    </Popover>
  );
};

interface TimeBucketPopoverBodyProps {
  items: TimeBucketOption[];
  value: TimeBucket;
  onChange: (next: TimeBucket) => void;
  isActive: boolean;
  setOpen: (v: boolean) => void;
}

function TimeBucketPopoverBody({
  items,
  value,
  onChange,
  isActive,
  setOpen,
}: TimeBucketPopoverBodyProps) {
  return (
    <>
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/40 px-4 py-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Time of day</p>
        {isActive && (
          <button
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
          >
            Reset
          </button>
        )}
      </div>
      <div className="p-1.5 space-y-0.5 max-h-[min(60vh,360px)] overflow-y-auto overscroll-contain">
        {(() => {
          let customIdx = -1;
          return items.map((option, idx) => {
            if (option.value !== "all" && option.value !== "custom") customIdx += 1;
            const dot =
              option.value === "all"
                ? "bg-foreground/60"
                : option.value === "custom"
                  ? "bg-emerald-500"
                  : DOT_PALETTE[customIdx % DOT_PALETTE.length];
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200",
                  "hover:scale-[1.01] active:scale-[0.99] animate-fade-in",
                  isSelected
                    ? "bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 shadow-sm ring-1 ring-amber-300/50"
                    : "border border-transparent hover:bg-muted/50",
                )}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <span aria-hidden className="text-base leading-none shrink-0">
                  {option.emoji}
                </span>
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className={cn(
                      "text-xs font-semibold truncate flex items-center gap-2",
                      isSelected ? "text-amber-800 dark:text-amber-200" : "text-foreground",
                    )}
                  >
                    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dot)} />
                    {option.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {option.range}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center animate-scale-in shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            );
          });
        })()}
      </div>
    </>
  );
}

