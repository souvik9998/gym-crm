import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

interface DobInputProps {
  value?: string; // yyyy-MM-dd
  onChange: (dateStr: string | undefined) => void;
  className?: string;
}

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (m: number, y: number) => {
  if (!m) return 31;
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && y && isLeapYear(y)) return 29;
  return days[m] || 31;
};

export const DobInput = ({ value, onChange, className }: DobInputProps) => {
  const parseValue = (v?: string) => {
    if (!v) return { day: "", month: "", year: "" };
    const [y, m, d] = v.split("-");
    return { day: d || "", month: m || "", year: y || "" };
  };

  const [parts, setParts] = useState(parseValue(value));
  const [focused, setFocused] = useState<string | null>(null);

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setParts(parseValue(value));
  }, [value]);

  const emitChange = useCallback(
    (d: string, m: string, y: string) => {
      const day = parseInt(d, 10);
      const month = parseInt(m, 10);
      const year = parseInt(y, 10);
      if (d.length === 2 && m.length === 2 && y.length === 4) {
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1925 && year <= new Date().getFullYear() - 10) {
          const maxDay = daysInMonth(month, year);
          const clampedDay = Math.min(day, maxDay);
          const dateStr = `${y}-${m.padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
          onChange(dateStr);
          return;
        }
      }
      if (!d && !m && !y) onChange(undefined);
    },
    [onChange]
  );

  const handleDayChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(clean, 10);
    if (clean.length === 2 && (num < 1 || num > 31)) return;
    const next = { ...parts, day: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
    if (clean.length === 2) monthRef.current?.focus();
  };

  const handleMonthChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(clean, 10);
    if (clean.length === 2 && (num < 1 || num > 12)) return;
    const next = { ...parts, month: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
    if (clean.length === 2) yearRef.current?.focus();
  };

  const handleYearChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 4);
    const next = { ...parts, year: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: "day" | "month" | "year"
  ) => {
    if (e.key === "Backspace") {
      const current = parts[field];
      if (current === "" || current.length === 0) {
        e.preventDefault();
        if (field === "month") dayRef.current?.focus();
        if (field === "year") monthRef.current?.focus();
      }
    }
    if (e.key === "ArrowRight") {
      if (field === "day") monthRef.current?.focus();
      if (field === "month") yearRef.current?.focus();
    }
    if (e.key === "ArrowLeft") {
      if (field === "month") dayRef.current?.focus();
      if (field === "year") monthRef.current?.focus();
    }
  };

  const isComplete = parts.day.length === 2 && parts.month.length === 2 && parts.year.length === 4;
  const hasValue = parts.day || parts.month || parts.year;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-xl border-2 bg-card px-3 py-2.5 transition-all duration-200",
          focused
            ? "border-accent shadow-sm shadow-accent/10"
            : hasValue
            ? "border-accent/30"
            : "border-border",
          isComplete && "border-accent/40 bg-accent/5"
        )}
      >
        <CalendarDays className="w-4 h-4 text-accent shrink-0" />

        {/* Day */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Day</span>
          <input
            ref={dayRef}
            type="text"
            inputMode="numeric"
            placeholder="DD"
            value={parts.day}
            onChange={(e) => handleDayChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "day")}
            onFocus={() => setFocused("day")}
            onBlur={() => setFocused(null)}
            className={cn(
              "w-10 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              focused === "day" ? "text-accent" : "text-foreground"
            )}
            maxLength={2}
            autoComplete="off"
          />
        </div>

        <span className="text-muted-foreground/40 text-lg font-light">/</span>

        {/* Month */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Month</span>
          <input
            ref={monthRef}
            type="text"
            inputMode="numeric"
            placeholder="MM"
            value={parts.month}
            onChange={(e) => handleMonthChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "month")}
            onFocus={() => setFocused("month")}
            onBlur={() => setFocused(null)}
            className={cn(
              "w-10 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              focused === "month" ? "text-accent" : "text-foreground"
            )}
            maxLength={2}
            autoComplete="off"
          />
        </div>

        <span className="text-muted-foreground/40 text-lg font-light">/</span>

        {/* Year */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Year</span>
          <input
            ref={yearRef}
            type="text"
            inputMode="numeric"
            placeholder="YYYY"
            value={parts.year}
            onChange={(e) => handleYearChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "year")}
            onFocus={() => setFocused("year")}
            onBlur={() => setFocused(null)}
            className={cn(
              "w-14 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              focused === "year" ? "text-accent" : "text-foreground"
            )}
            maxLength={4}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
};
