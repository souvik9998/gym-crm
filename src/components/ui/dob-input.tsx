import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, AlertCircle } from "lucide-react";

interface DobInputProps {
  value?: string; // yyyy-MM-dd
  onChange: (dateStr: string | undefined) => void;
  className?: string;
  /** Externally controlled error (e.g. from form validation). */
  error?: string;
  /** Notify parent when input is partial/invalid so it can block submit. */
  onValidityChange?: (isValid: boolean, isEmpty: boolean) => void;
}

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (m: number, y: number) => {
  if (!m) return 31;
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && y && isLeapYear(y)) return 29;
  return days[m] || 31;
};

const MIN_YEAR = 1925;
const MAX_YEAR = new Date().getFullYear() - 10;

export const DobInput = ({ value, onChange, className, error, onValidityChange }: DobInputProps) => {
  const parseValue = (v?: string) => {
    if (!v) return { day: "", month: "", year: "" };
    const [y, m, d] = v.split("-");
    return { day: d || "", month: m || "", year: y || "" };
  };

  const [parts, setParts] = useState(parseValue(value));
  const [focused, setFocused] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [internalError, setInternalError] = useState<string | undefined>();

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setParts(parseValue(value));
  }, [value]);

  const validateParts = useCallback((d: string, m: string, y: string): string | undefined => {
    const isEmpty = !d && !m && !y;
    if (isEmpty) return undefined;

    // Any field partially filled
    if (d.length !== 2) return "Day must be 2 digits (e.g. 02)";
    if (m.length !== 2) return "Month must be 2 digits (e.g. 03)";
    if (y.length !== 4) return "Year must be 4 digits (e.g. 1995)";

    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);

    if (isNaN(day) || day < 1 || day > 31) return "Day must be between 01 and 31";
    if (isNaN(month) || month < 1 || month > 12) return "Month must be between 01 and 12";
    if (isNaN(year) || year < MIN_YEAR) return `Year must be ${MIN_YEAR} or later`;
    if (year > MAX_YEAR) return `You must be at least 10 years old`;

    const maxDay = daysInMonth(month, year);
    if (day > maxDay) return `${m}/${y} only has ${maxDay} days`;

    return undefined;
  }, []);

  const emitChange = useCallback(
    (d: string, m: string, y: string) => {
      const validationError = validateParts(d, m, y);
      const isEmpty = !d && !m && !y;
      const isValid = !validationError && !isEmpty;

      onValidityChange?.(isValid || isEmpty, isEmpty);

      if (isValid) {
        const dateStr = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        onChange(dateStr);
      } else {
        onChange(undefined);
      }
    },
    [onChange, onValidityChange, validateParts]
  );

  const handleDayChange = (val: string) => {
    let clean = val.replace(/\D/g, "").slice(0, 2);
    // Block out-of-range day entries (max 31). If first digit > 3, ignore.
    if (clean.length === 1 && parseInt(clean, 10) > 3) {
      // Allow only single digits 0-3 as a tens place; reject anything that would exceed 31
      // But still allow 4-9 as a complete single-digit day (e.g. "5" => 5). Pad on blur.
    }
    if (clean.length === 2 && parseInt(clean, 10) > 31) {
      clean = clean.slice(0, 1);
    }
    const next = { ...parts, day: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
    // Auto-advance when 2 valid digits entered
    if (clean.length === 2) {
      const num = parseInt(clean, 10);
      if (num >= 1 && num <= 31) monthRef.current?.focus();
    }
  };

  const handleMonthChange = (val: string) => {
    let clean = val.replace(/\D/g, "").slice(0, 2);
    // Hard block: month cannot exceed 12. Reject any keystroke that pushes value past 12.
    if (clean.length === 2 && parseInt(clean, 10) > 12) {
      clean = clean.slice(0, 1);
    }
    const next = { ...parts, month: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
    if (clean.length === 2) {
      const num = parseInt(clean, 10);
      if (num >= 1 && num <= 12) yearRef.current?.focus();
    }
  };

  const handleYearChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 4);
    const next = { ...parts, year: clean };
    setParts(next);
    emitChange(next.day, next.month, next.year);
  };

  const getCurrentParts = useCallback(
    () => ({
      day: dayRef.current?.value.replace(/\D/g, "").slice(0, 2) ?? parts.day,
      month: monthRef.current?.value.replace(/\D/g, "").slice(0, 2) ?? parts.month,
      year: yearRef.current?.value.replace(/\D/g, "").slice(0, 4) ?? parts.year,
    }),
    [parts.day, parts.month, parts.year]
  );

  const padField = (field: "day" | "month") => {
    const liveParts = getCurrentParts();
    const current = liveParts[field];
    if (current.length === 1) {
      const padded = current.padStart(2, "0");
      const num = parseInt(padded, 10);
      const upperBound = field === "day" ? 31 : 12;
      if (num >= 1 && num <= upperBound) {
        const next = { ...liveParts, [field]: padded };
        setParts(next);
        emitChange(next.day, next.month, next.year);
        return next;
      }
    }
    return liveParts;
  };

  const handleBlur = (field: "day" | "month" | "year") => {
    setFocused(null);
    if (field === "day" || field === "month") {
      padField(field);
    }
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
  const displayedError = error || internalError;
  const hasError = !!displayedError;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-xl border-2 bg-card px-3 py-2.5 transition-all duration-200",
          hasError
            ? "border-destructive shadow-sm shadow-destructive/10"
            : focused
            ? "border-accent shadow-sm shadow-accent/10"
            : hasValue
            ? "border-accent/30"
            : "border-border",
          isComplete && !hasError && "border-accent/40 bg-accent/5"
        )}
      >
        <CalendarDays
          className={cn("w-4 h-4 shrink-0", hasError ? "text-destructive" : "text-accent")}
        />

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
            onBlur={() => handleBlur("day")}
            className={cn(
              "w-10 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              hasError ? "text-destructive" : focused === "day" ? "text-accent" : "text-foreground"
            )}
            maxLength={2}
            autoComplete="off"
            aria-invalid={hasError}
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
            onBlur={() => handleBlur("month")}
            className={cn(
              "w-10 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              hasError ? "text-destructive" : focused === "month" ? "text-accent" : "text-foreground"
            )}
            maxLength={2}
            autoComplete="off"
            aria-invalid={hasError}
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
            onBlur={() => handleBlur("year")}
            className={cn(
              "w-14 text-center text-lg font-semibold bg-transparent outline-none transition-colors duration-150",
              "placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-base",
              hasError ? "text-destructive" : focused === "year" ? "text-accent" : "text-foreground"
            )}
            maxLength={4}
            autoComplete="off"
            aria-invalid={hasError}
          />
        </div>
      </div>

      {displayedError && (
        <div className="flex items-start gap-1.5 text-xs text-destructive animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{displayedError}</span>
        </div>
      )}
    </div>
  );
};
