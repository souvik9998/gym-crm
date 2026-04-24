import * as React from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TimePicker12hProps {
  /** 24h "HH:mm" string */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

const PRESETS: Array<{ label: string; value: string }> = [
  { label: "6 AM", value: "06:00" },
  { label: "9 AM", value: "09:00" },
  { label: "12 PM", value: "12:00" },
  { label: "4 PM", value: "16:00" },
  { label: "6 PM", value: "18:00" },
  { label: "9 PM", value: "21:00" },
];

const ITEM_HEIGHT = 40; // px per row in the wheel
const VISIBLE_ROWS = 5; // odd number so center is highlighted

function parse24h(value: string): { hour12: number; minute: number; period: Period } {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) {
    return { hour12: 6, minute: 0, period: "AM" };
  }
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period: Period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: Math.max(0, Math.min(59, m || 0)), period };
}

function to24h(hour12: number, minute: number, period: Period): string {
  let h = hour12 % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatLabel(value: string): string {
  if (!value) return "--:-- --";
  const { hour12, minute, period } = parse24h(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** A snap-scroll wheel column. */
interface WheelProps<T> {
  items: T[];
  value: T;
  onChange: (next: T) => void;
  format?: (item: T) => string;
  ariaLabel: string;
}

function Wheel<T>({ items, value, onChange, format, ariaLabel }: WheelProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollTimer = React.useRef<number | null>(null);
  const wheelAccum = React.useRef(0);
  const isProgrammatic = React.useRef(false);

  const padCount = Math.floor(VISIBLE_ROWS / 2);
  const selectedIndex = items.indexOf(value);

  // Programmatically scroll to the selected item when value changes externally.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || selectedIndex < 0) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) < 1) return;
    isProgrammatic.current = true;
    el.scrollTo({ top: target, behavior: "smooth" });
    window.setTimeout(() => {
      isProgrammatic.current = false;
    }, 350);
  }, [selectedIndex]);

  const handleScroll = () => {
    if (isProgrammatic.current) return;
    const el = containerRef.current;
    if (!el) return;
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const target = clamped * ITEM_HEIGHT;
      el.scrollTo({ top: target, behavior: "smooth" });
      const next = items[clamped];
      if (next !== value) onChange(next);
    }, 80);
  };

  // Native wheel handler — works reliably inside Radix Popover on desktop.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      wheelAccum.current += e.deltaY;
      const threshold = 30; // pixels of wheel travel per step
      if (Math.abs(wheelAccum.current) < threshold) return;
      const step = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      const nextIdx = Math.max(0, Math.min(items.length - 1, selectedIndex + step));
      if (nextIdx !== selectedIndex) {
        onChange(items[nextIdx]);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items, selectedIndex, onChange]);

  const handleItemClick = (item: T, idx: number) => {
    onChange(item);
    const el = containerRef.current;
    if (el) {
      isProgrammatic.current = true;
      el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
      window.setTimeout(() => {
        isProgrammatic.current = false;
      }, 350);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(items.length - 1, selectedIndex + 1);
      if (next !== selectedIndex) onChange(items[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, selectedIndex - 1);
      if (next !== selectedIndex) onChange(items[next]);
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label={ariaLabel}
      className={cn(
        "relative flex-1 overflow-y-auto overscroll-contain outline-none",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        "snap-y snap-mandatory scroll-smooth",
      )}
      style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}
    >
      {/* top spacer */}
      <div style={{ height: ITEM_HEIGHT * padCount }} aria-hidden />

      {items.map((item, idx) => {
        const distance = Math.abs(idx - selectedIndex);
        const isActive = idx === selectedIndex;
        const opacity = isActive ? 1 : Math.max(0.25, 1 - distance * 0.28);
        const scale = isActive ? 1 : Math.max(0.85, 1 - distance * 0.06);
        return (
          <button
            key={String(item)}
            type="button"
            onClick={() => handleItemClick(item, idx)}
            className={cn(
              "flex w-full snap-center items-center justify-center text-base tabular-nums transition-[color,font-weight] duration-150",
              isActive ? "font-semibold text-foreground" : "font-normal text-foreground",
            )}
            style={{
              height: ITEM_HEIGHT,
              opacity,
              transform: `scale(${scale})`,
              transition: "opacity 150ms ease, transform 150ms ease, color 150ms ease",
            }}
            aria-selected={isActive}
            role="option"
          >
            {format ? format(item) : String(item)}
          </button>
        );
      })}

      {/* bottom spacer */}
      <div style={{ height: ITEM_HEIGHT * padCount }} aria-hidden />
    </div>
  );
}

export const TimePicker12h = React.forwardRef<HTMLButtonElement, TimePicker12hProps>(
  ({ value, onChange, className, placeholder = "Select time", disabled, size = "sm" }, ref) => {
    const [open, setOpen] = React.useState(false);
    const { hour12, minute, period } = parse24h(value);

    const update = (next: Partial<{ hour12: number; minute: number; period: Period }>) => {
      const merged = {
        hour12: next.hour12 ?? hour12,
        minute: next.minute ?? minute,
        period: next.period ?? period,
      };
      onChange(to24h(merged.hour12, merged.minute, merged.period));
    };

    const heightCls = size === "md" ? "h-10" : "h-9";

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              "group flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-all duration-200",
              "hover:border-muted-foreground/50 hover:bg-accent/30",
              "focus:outline-none focus:border-foreground/30",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "data-[state=open]:border-foreground/40 data-[state=open]:ring-2 data-[state=open]:ring-foreground/10",
              heightCls,
              className,
            )}
          >
            <span className={cn("tabular-nums", !value && "text-muted-foreground")}>
              {value ? formatLabel(value) : placeholder}
            </span>
            <Clock className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:scale-110 group-data-[state=open]:rotate-12" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[300px] p-0 overflow-hidden border-border/70 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Time
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatLabel(value)}
            </span>
          </div>

          {/* Wheels */}
          <div className="relative px-2 pt-2">
            {/* Center selection band */}
            <div
              className="pointer-events-none absolute inset-x-2 z-0 rounded-lg bg-muted/60"
              style={{
                top: `calc(50% - ${ITEM_HEIGHT / 2}px + 8px)`,
                height: ITEM_HEIGHT,
              }}
              aria-hidden
            />
            {/* Top/bottom fade masks */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-popover to-transparent" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-popover to-transparent" aria-hidden />

            <div className="relative z-[5] flex items-stretch gap-1">
              <Wheel
                items={HOURS_12}
                value={hour12}
                onChange={(h) => update({ hour12: h })}
                format={(n) => String(n).padStart(2, "0")}
                ariaLabel="Hour"
              />
              <div
                className="flex items-center justify-center text-base font-semibold text-foreground"
                aria-hidden
              >
                :
              </div>
              <Wheel
                items={[...MINUTES]}
                value={minute}
                onChange={(m) => update({ minute: m })}
                format={(n) => String(n).padStart(2, "0")}
                ariaLabel="Minute"
              />
              <Wheel
                items={[...PERIODS]}
                value={period}
                onChange={(p) => update({ period: p })}
                ariaLabel="AM or PM"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="border-t border-border/60 px-3 pt-2.5 pb-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Presets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => {
                const active = value === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onChange(preset.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150 active:scale-95",
                      active
                        ? "border-foreground bg-foreground text-background shadow-sm"
                        : "border-border bg-background text-foreground/80 hover:border-foreground/40 hover:bg-accent",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
            >
              Done
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
TimePicker12h.displayName = "TimePicker12h";
