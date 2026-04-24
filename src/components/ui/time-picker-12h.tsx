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
  /** Compact size, defaults to "sm" (h-9). Use "md" for h-10. */
  size?: "sm" | "md";
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59
const PERIODS = ["AM", "PM"] as const;

function parse24h(value: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!value || !/^\d{1,2}:\d{2}/.test(value)) {
    return { hour12: 6, minute: 0, period: "AM" };
  }
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: Math.max(0, Math.min(59, m || 0)), period };
}

function to24h(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatLabel(value: string): string {
  if (!value) return "--:-- --";
  const { hour12, minute, period } = parse24h(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * 12-hour AM/PM time picker with smooth scroll columns.
 * Emits values in 24h "HH:mm" format for compatibility with existing logic.
 */
export const TimePicker12h = React.forwardRef<HTMLButtonElement, TimePicker12hProps>(
  ({ value, onChange, className, placeholder = "Select time", disabled, size = "sm" }, ref) => {
    const [open, setOpen] = React.useState(false);
    const { hour12, minute, period } = parse24h(value);

    const hourRef = React.useRef<HTMLDivElement>(null);
    const minuteRef = React.useRef<HTMLDivElement>(null);

    const scrollIntoView = React.useCallback((container: HTMLDivElement | null, selector: string) => {
      if (!container) return;
      const el = container.querySelector<HTMLElement>(selector);
      if (el) {
        container.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
      }
    }, []);

    React.useEffect(() => {
      if (!open) return;
      // Defer to next frame so popover content is mounted
      const id = requestAnimationFrame(() => {
        scrollIntoView(hourRef.current, `[data-hour="${hour12}"]`);
        scrollIntoView(minuteRef.current, `[data-minute="${minute}"]`);
      });
      return () => cancelAnimationFrame(id);
    }, [open, hour12, minute, scrollIntoView]);

    const update = (next: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => {
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
          className="w-[240px] p-0 overflow-hidden border-border/70 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="flex items-stretch divide-x divide-border/60">
            {/* Hours */}
            <ScrollColumn ref={hourRef} label="Hour">
              {HOURS_12.map((h) => {
                const active = h === hour12;
                return (
                  <ColumnItem
                    key={h}
                    active={active}
                    data-hour={h}
                    onClick={() => update({ hour12: h })}
                  >
                    {String(h).padStart(2, "0")}
                  </ColumnItem>
                );
              })}
            </ScrollColumn>

            {/* Minutes */}
            <ScrollColumn ref={minuteRef} label="Min">
              {MINUTES.map((m) => {
                const active = m === minute;
                return (
                  <ColumnItem
                    key={m}
                    active={active}
                    data-minute={m}
                    onClick={() => update({ minute: m })}
                  >
                    {String(m).padStart(2, "0")}
                  </ColumnItem>
                );
              })}
            </ScrollColumn>

            {/* Period */}
            <div className="flex flex-col">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AM/PM
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                {PERIODS.map((p) => {
                  const active = p === period;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => update({ period: p })}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
                        "hover:bg-accent active:scale-[0.97]",
                        active
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground",
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatLabel(value)}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
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

const ScrollColumn = React.forwardRef<
  HTMLDivElement,
  { label: string; children: React.ReactNode }
>(({ label, children }, ref) => (
  <div className="flex flex-1 flex-col">
    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div
      ref={ref}
      className="h-[180px] overflow-y-auto scroll-smooth p-1.5 [scrollbar-width:thin]"
    >
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  </div>
));
ScrollColumn.displayName = "ScrollColumn";

interface ColumnItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}
const ColumnItem = ({ active, className, children, ...props }: ColumnItemProps) => (
  <button
    type="button"
    className={cn(
      "rounded-md px-3 py-1.5 text-sm tabular-nums transition-all duration-150",
      "hover:bg-accent active:scale-[0.97]",
      active
        ? "bg-foreground text-background shadow-sm"
        : "text-foreground/80",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
