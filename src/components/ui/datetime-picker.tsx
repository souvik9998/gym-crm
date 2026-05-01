import { useState, useMemo, useRef, useEffect } from "react";
import { format, parse, isValid, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateTimePickerProps {
  /** ISO-like value used by <input type="datetime-local"> e.g. "2026-05-01T18:30" */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Optional minimum date-time (also datetime-local format) */
  min?: string;
  disabled?: boolean;
  /** When true, allows clearing the value via an inline X button */
  clearable?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59 (every minute)

function parseValue(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  return isValid(d) ? d : undefined;
}

function formatValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  min,
  disabled,
  clearable,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const date = useMemo(() => parseValue(value), [value]);
  const minDate = useMemo(() => (min ? parseValue(min) : undefined), [min]);

  const hour24 = date?.getHours() ?? 9;
  const minute = date?.getMinutes() ?? 0;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";

  const commit = (next: Date) => {
    onChange(formatValue(next));
  };

  const handleDateSelect = (d: Date | undefined) => {
    if (!d) return;
    const base = date ?? setMinutes(setHours(new Date(), 9), 0);
    const next = new Date(d);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    commit(next);
  };

  const handleHourChange = (h12: number) => {
    const base = date ?? new Date();
    const newHour24 = period === "AM" ? (h12 % 12) : (h12 % 12) + 12;
    const next = new Date(base);
    next.setHours(newHour24, minute, 0, 0);
    commit(next);
  };

  const handleMinuteChange = (m: number) => {
    const base = date ?? new Date();
    const next = new Date(base);
    next.setHours(hour24, m, 0, 0);
    commit(next);
  };

  const handlePeriodChange = (p: "AM" | "PM") => {
    if (p === period) return;
    const base = date ?? new Date();
    const newHour24 = p === "AM" ? hour24 - 12 : hour24 + 12;
    const next = new Date(base);
    next.setHours(((newHour24 % 24) + 24) % 24, minute, 0, 0);
    commit(next);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const display = date ? format(date, "dd MMM yyyy · h:mm a") : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-11 lg:h-12 w-full justify-start text-left font-normal rounded-xl px-3 lg:px-4",
            "border-input bg-background hover:bg-muted/40 hover:border-foreground/30",
            "transition-all duration-200 group",
            !date && "text-muted-foreground",
            open && "border-foreground/40 ring-2 ring-foreground/5",
            className,
          )}
        >
          <div className={cn(
            "flex items-center justify-center w-7 h-7 rounded-lg mr-2.5 shrink-0 transition-all duration-200",
            date
              ? "bg-primary/10 text-primary group-hover:bg-primary/15"
              : "bg-muted text-muted-foreground group-hover:bg-muted/80",
          )}>
            <CalendarIcon className="h-3.5 w-3.5" />
          </div>
          <span className="flex-1 truncate text-sm">
            {display || placeholder}
          </span>
          {clearable && date && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as any);
                }
              }}
              className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Clear date"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="p-0 rounded-2xl border-border/60 shadow-2xl overflow-hidden w-auto animate-scale-in"
      >
        <div className="flex flex-col sm:flex-row">
          {/* Calendar */}
          <div className="p-2 sm:border-r border-border/40">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={minDate ? (d) => d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : undefined}
              initialFocus
              className="p-2 pointer-events-auto"
            />
          </div>

          {/* Time picker */}
          <div className="flex flex-col w-full sm:w-[220px] border-t sm:border-t-0 border-border/40 bg-muted/20">
            <div className="px-3 py-2.5 border-b border-border/40 flex items-center gap-2 bg-background/60 backdrop-blur-sm">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Time</span>
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {date ? format(date, "h:mm a") : "--:--"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-2 h-[260px]">
              <TimeColumn
                items={HOURS}
                value={hour12}
                onChange={handleHourChange}
                pad={false}
              />
              <TimeColumn
                items={MINUTES}
                value={minute}
                onChange={handleMinuteChange}
                pad
              />
              <div className="flex flex-col gap-1 overflow-hidden">
                {(["AM", "PM"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePeriodChange(p)}
                    className={cn(
                      "flex-1 rounded-lg text-xs font-semibold transition-all duration-200",
                      "active:scale-95",
                      period === p
                        ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                        : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-2 border-t border-border/40 flex gap-1.5 bg-background/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs rounded-lg"
                onClick={() => {
                  const now = new Date();
                  now.setSeconds(0, 0);
                  commit(now);
                }}
              >
                Now
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 h-8 text-xs rounded-lg"
                onClick={() => setOpen(false)}
                disabled={!date}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TimeColumnProps {
  items: number[];
  value: number;
  onChange: (n: number) => void;
  pad: boolean;
}

function TimeColumn({ items, value, onChange, pad }: TimeColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Smoothly center the selected item when value changes
    if (activeRef.current && ref.current) {
      const container = ref.current;
      const el = activeRef.current;
      const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [value]);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-0.5 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-border [scrollbar-width:thin] pr-1"
    >
      {items.map((n) => {
        const selected = n === value;
        return (
          <button
            key={n}
            ref={selected ? activeRef : undefined}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "h-8 rounded-md text-xs font-medium tabular-nums transition-all duration-150 shrink-0",
              "active:scale-95",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {pad ? String(n).padStart(2, "0") : n}
          </button>
        );
      })}
    </div>
  );
}
