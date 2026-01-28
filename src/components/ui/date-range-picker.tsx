import * as React from "react";
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subQuarters,
  subYears,
  isSameDay,
  isToday,
  isYesterday,
  startOfToday,
  endOfToday,
} from "date-fns";
import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

type ComparisonPeriod =
  | "none"
  | "previous_period"
  | "previous_week"
  | "previous_month"
  | "previous_quarter"
  | "previous_year"
  | "previous_year_dow";

type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year";

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  className?: string;
}

export const DateRangePicker = ({ dateFrom, dateTo, onDateChange, className }: DateRangePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [tempDateFrom, setTempDateFrom] = React.useState<Date | undefined>(
    dateFrom ? new Date(dateFrom) : undefined
  );
  const [tempDateTo, setTempDateTo] = React.useState<Date | undefined>(
    dateTo ? new Date(dateTo) : undefined
  );
  const [comparisonPeriod, setComparisonPeriod] = React.useState<ComparisonPeriod>("none");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    if (dateFrom && dateTo) {
      return {
        from: new Date(dateFrom),
        to: new Date(dateTo),
      };
    }
    return undefined;
  });
  const [originalDateRange, setOriginalDateRange] = React.useState<DateRange | undefined>(undefined);
  const [comparisonDateRange, setComparisonDateRange] = React.useState<DateRange | undefined>(undefined);
  const [activeTab, setActiveTab] = React.useState<"presets" | "custom">("presets");

  // Update temp dates when props change
  React.useEffect(() => {
    if (dateFrom) {
      setTempDateFrom(new Date(dateFrom));
    } else {
      setTempDateFrom(undefined);
    }
    if (dateTo) {
      setTempDateTo(new Date(dateTo));
    } else {
      setTempDateTo(undefined);
    }
    if (dateFrom && dateTo) {
      setDateRange({
        from: new Date(dateFrom),
        to: new Date(dateTo),
      });
    } else {
      setDateRange(undefined);
    }
  }, [dateFrom, dateTo]);

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (range?.from) {
      setDateRange(range);
      setTempDateFrom(range.from);
      if (range.to) {
        setTempDateTo(range.to);
        // Reset comparison when manually selecting dates
        if (comparisonPeriod !== "none") {
          setComparisonPeriod("none");
          setComparisonDateRange(undefined);
        }
      } else {
        // If only from is selected, clear to date
        setTempDateTo(undefined);
      }
    } else {
      // Clear selection
      setDateRange(undefined);
      setTempDateFrom(undefined);
      setTempDateTo(undefined);
      setComparisonDateRange(undefined);
      setOriginalDateRange(undefined);
    }
  };

  const handlePresetSelect = (preset: DatePreset) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let from: Date;
    let to: Date = today;

    switch (preset) {
      case "today":
        from = startOfToday();
        to = endOfToday();
        break;
      case "yesterday":
        from = startOfToday();
        from.setDate(from.getDate() - 1);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;
      case "last_7_days":
        from = subDays(today, 6);
        from.setHours(0, 0, 0, 0);
        break;
      case "last_30_days":
        from = subDays(today, 29);
        from.setHours(0, 0, 0, 0);
        break;
      case "last_90_days":
        from = subDays(today, 89);
        from.setHours(0, 0, 0, 0);
        break;
      case "this_week":
        from = startOfWeek(today);
        to = endOfWeek(today);
        break;
      case "last_week":
        from = startOfWeek(subWeeks(today, 1));
        to = endOfWeek(subWeeks(today, 1));
        break;
      case "this_month":
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case "last_month":
        from = startOfMonth(subMonths(today, 1));
        to = endOfMonth(subMonths(today, 1));
        break;
      case "this_quarter":
        from = startOfQuarter(today);
        to = endOfQuarter(today);
        break;
      case "last_quarter":
        from = startOfQuarter(subQuarters(today, 1));
        to = endOfQuarter(subQuarters(today, 1));
        break;
      case "this_year":
        from = startOfYear(today);
        to = endOfYear(today);
        break;
      case "last_year":
        from = startOfYear(subYears(today, 1));
        to = endOfYear(subYears(today, 1));
        break;
      default:
        return;
    }

    setTempDateFrom(from);
    setTempDateTo(to);
    setDateRange({ from, to });
    setComparisonPeriod("none");
    setComparisonDateRange(undefined);
    setOriginalDateRange(undefined);
    setActiveTab("custom");
  };

  const handleApply = () => {
    if (tempDateFrom && tempDateTo) {
      // Ensure from is before to
      const from = tempDateFrom < tempDateTo ? tempDateFrom : tempDateTo;
      const to = tempDateFrom < tempDateTo ? tempDateTo : tempDateFrom;

      const fromStr = format(from, "yyyy-MM-dd");
      const toStr = format(to, "yyyy-MM-dd");
      onDateChange(fromStr, toStr);
      setDateRange({ from, to });
      setOpen(false);
    } else if (tempDateFrom) {
      // If only one date is selected, use it as both from and to
      const dateStr = format(tempDateFrom, "yyyy-MM-dd");
      onDateChange(dateStr, dateStr);
      setDateRange({ from: tempDateFrom, to: tempDateFrom });
      setOpen(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setTempDateFrom(dateFrom ? new Date(dateFrom) : undefined);
    setTempDateTo(dateTo ? new Date(dateTo) : undefined);
    if (dateFrom && dateTo) {
      setDateRange({
        from: new Date(dateFrom),
        to: new Date(dateTo),
      });
    } else {
      setDateRange(undefined);
    }
    setComparisonPeriod("none");
    setComparisonDateRange(undefined);
    setOriginalDateRange(undefined);
    setOpen(false);
  };

  const handleComparisonChange = (value: ComparisonPeriod) => {
    setComparisonPeriod(value);

    if (value === "none") {
      // Reset to original dates if comparison is removed
      if (originalDateRange) {
        setTempDateFrom(originalDateRange.from);
        setTempDateTo(originalDateRange.to);
        setDateRange(originalDateRange);
        setComparisonDateRange(undefined);
      } else if (dateFrom && dateTo) {
        setTempDateFrom(new Date(dateFrom));
        setTempDateTo(new Date(dateTo));
        setDateRange({ from: new Date(dateFrom), to: new Date(dateTo) });
        setComparisonDateRange(undefined);
      }
      return;
    }

    // Store original range if not already stored
    if (!originalDateRange && tempDateFrom && tempDateTo) {
      setOriginalDateRange({ from: tempDateFrom, to: tempDateTo });
    }

    // Need a date range to calculate comparison
    if (!tempDateFrom || !tempDateTo) {
      // If no date range selected, use current week/month/etc as base
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      let baseStart: Date;
      let baseEnd: Date;

      switch (value) {
        case "previous_week":
          baseStart = startOfWeek(subWeeks(today, 1));
          baseEnd = endOfWeek(subWeeks(today, 1));
          break;
        case "previous_month":
          baseStart = startOfMonth(subMonths(today, 1));
          baseEnd = endOfMonth(subMonths(today, 1));
          break;
        case "previous_quarter":
          baseStart = startOfQuarter(subQuarters(today, 1));
          baseEnd = endOfQuarter(subQuarters(today, 1));
          break;
        case "previous_year":
          baseStart = startOfYear(subYears(today, 1));
          baseEnd = endOfYear(subYears(today, 1));
          break;
        default:
          return;
      }

      setTempDateFrom(baseStart);
      setTempDateTo(baseEnd);
      setDateRange({ from: baseStart, to: baseEnd });
      setOriginalDateRange(undefined);
      setComparisonDateRange(undefined);
      return;
    }

    // Store current range as original if not already stored
    const currentRange = { from: tempDateFrom, to: tempDateTo };
    if (!originalDateRange) {
      setOriginalDateRange(currentRange);
    }

    // Use original range for calculation if available, otherwise use current
    const baseFrom = originalDateRange?.from || tempDateFrom;
    const baseTo = originalDateRange?.to || tempDateTo;

    let comparisonStart: Date;
    let comparisonEnd: Date;
    const rangeDays = Math.ceil((baseTo.getTime() - baseFrom.getTime()) / (1000 * 60 * 60 * 24));

    switch (value) {
      case "previous_period":
        comparisonEnd = new Date(baseFrom);
        comparisonEnd.setDate(comparisonEnd.getDate() - 1);
        comparisonEnd.setHours(23, 59, 59, 999);
        comparisonStart = new Date(comparisonEnd);
        comparisonStart.setDate(comparisonStart.getDate() - rangeDays);
        comparisonStart.setHours(0, 0, 0, 0);
        break;
      case "previous_week":
        // Get the week boundaries for the base range
        const baseWeekStart = startOfWeek(baseFrom);
        const baseWeekEnd = endOfWeek(baseTo);
        // Go back one week
        comparisonStart = startOfWeek(subWeeks(baseWeekStart, 1));
        comparisonEnd = endOfWeek(subWeeks(baseWeekEnd, 1));
        break;
      case "previous_month":
        // Get the month boundaries for the base range
        const baseMonthStart = startOfMonth(baseFrom);
        const baseMonthEnd = endOfMonth(baseTo);
        // Go back one month
        comparisonStart = startOfMonth(subMonths(baseMonthStart, 1));
        comparisonEnd = endOfMonth(subMonths(baseMonthEnd, 1));
        break;
      case "previous_quarter":
        comparisonStart = startOfQuarter(subQuarters(baseFrom, 1));
        comparisonEnd = endOfQuarter(subQuarters(baseTo, 1));
        break;
      case "previous_year":
        comparisonStart = startOfYear(subYears(baseFrom, 1));
        comparisonEnd = endOfYear(subYears(baseTo, 1));
        break;
      case "previous_year_dow":
        comparisonStart = new Date(baseFrom);
        comparisonStart.setFullYear(comparisonStart.getFullYear() - 1);
        comparisonEnd = new Date(baseTo);
        comparisonEnd.setFullYear(comparisonEnd.getFullYear() - 1);
        break;
      default:
        return;
    }

    // Set comparison range for visualization
    setComparisonDateRange({ from: comparisonStart, to: comparisonEnd });

    // Update the displayed dates to the comparison period (for applying)
    setTempDateFrom(comparisonStart);
    setTempDateTo(comparisonEnd);
    setDateRange({ from: comparisonStart, to: comparisonEnd });
  };

  const formatDisplayDate = (date: Date | undefined) => {
    if (!date) return "";
    return format(date, "dd MMM yyyy");
  };

  const getDisplayText = () => {
    if (dateFrom && dateTo) {
      const from = format(new Date(dateFrom), "dd MMM");
      const to = format(new Date(dateTo), "dd MMM yyyy");
      return `${from} - ${to}`;
    }
    return "Select date range";
  };

  const presetOptions: { value: DatePreset; label: string; description: string }[] = [
    { value: "today", label: "Today", description: format(startOfToday(), "MMM d, yyyy") },
    { value: "yesterday", label: "Yesterday", description: format(subDays(startOfToday(), 1), "MMM d, yyyy") },
    { value: "last_7_days", label: "Last 7 days", description: `${format(subDays(new Date(), 6), "MMM d")} - ${format(new Date(), "MMM d")}` },
    { value: "last_30_days", label: "Last 30 days", description: `${format(subDays(new Date(), 29), "MMM d")} - ${format(new Date(), "MMM d")}` },
    { value: "last_90_days", label: "Last 90 days", description: `${format(subDays(new Date(), 89), "MMM d")} - ${format(new Date(), "MMM d")}` },
    { value: "this_week", label: "This week", description: `${format(startOfWeek(new Date()), "MMM d")} - ${format(endOfWeek(new Date()), "MMM d")}` },
    { value: "last_week", label: "Last week", description: `${format(startOfWeek(subWeeks(new Date(), 1)), "MMM d")} - ${format(endOfWeek(subWeeks(new Date(), 1)), "MMM d")}` },
    { value: "this_month", label: "This month", description: format(new Date(), "MMMM yyyy") },
    { value: "last_month", label: "Last month", description: format(subMonths(new Date(), 1), "MMMM yyyy") },
    { value: "this_quarter", label: "This quarter", description: `${format(startOfQuarter(new Date()), "MMM d")} - ${format(endOfQuarter(new Date()), "MMM d")}` },
    { value: "last_quarter", label: "Last quarter", description: `${format(startOfQuarter(subQuarters(new Date(), 1)), "MMM d")} - ${format(endOfQuarter(subQuarters(new Date(), 1)), "MMM d")}` },
    { value: "this_year", label: "This year", description: format(new Date(), "yyyy") },
    { value: "last_year", label: "Last year", description: format(subYears(new Date(), 1), "yyyy") },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full sm:w-[280px] justify-start text-left font-normal text-xs sm:text-sm h-9 sm:h-10",
            !dateFrom && !dateTo && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="truncate">{getDisplayText()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[95vw] sm:w-auto p-0 max-w-[95vw] sm:max-w-none" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* Left Side - Presets and Comparison Period */}
          <div className="border-r border-b sm:border-b-0 p-3 sm:p-4 w-full sm:w-[280px] bg-muted/30 max-h-[60vh] sm:max-h-none overflow-y-auto">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "presets" | "custom")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="presets" className="text-xs">Presets</TabsTrigger>
                <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
              </TabsList>

              <TabsContent value="presets" className="mt-0 space-y-1 max-h-[400px] overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Quick Select</p>
                {presetOptions.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handlePresetSelect(preset.value)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm rounded-md transition-all hover:bg-accent hover:text-accent-foreground",
                      "flex flex-col gap-0.5 border border-transparent hover:border-accent-foreground/20"
                    )}
                  >
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-xs text-muted-foreground">{preset.description}</span>
                  </button>
                ))}
              </TabsContent>

              <TabsContent value="custom" className="mt-0">
                <p className="text-xs font-semibold text-muted-foreground mb-3 px-1">Comparison Period</p>
                <div className="space-y-1">
                  <button
                    onClick={() => handleComparisonChange("none")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "none"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>No comparison</span>
                    {comparisonPeriod === "none" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_period")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_period"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous period</span>
                    {comparisonPeriod === "previous_period" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_week")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_week"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous week</span>
                    {comparisonPeriod === "previous_week" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_month")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_month"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous month</span>
                    {comparisonPeriod === "previous_month" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_quarter")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_quarter"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous quarter</span>
                    {comparisonPeriod === "previous_quarter" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_year")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_year"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous year</span>
                    {comparisonPeriod === "previous_year" && <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleComparisonChange("previous_year_dow")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                      comparisonPeriod === "previous_year_dow"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span>Previous year (match day)</span>
                    {comparisonPeriod === "previous_year_dow" && <Check className="w-4 h-4" />}
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Side - Date Picker */}
          <div className="p-3 sm:p-5 w-full sm:min-w-[600px] max-h-[60vh] sm:max-h-none overflow-y-auto">
            {/* Date Inputs */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start Date</label>
                <Input
                  type="date"
                  value={tempDateFrom ? format(tempDateFrom, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const date = new Date(e.target.value + "T00:00:00");
                      setTempDateFrom(date);
                      if (tempDateTo && date > tempDateTo) {
                        setTempDateTo(undefined);
                        setDateRange({ from: date, to: undefined });
                      } else if (tempDateTo) {
                        setDateRange({ from: date, to: tempDateTo });
                      } else {
                        setDateRange({ from: date, to: undefined });
                      }
                    } else {
                      setTempDateFrom(undefined);
                      setDateRange(undefined);
                    }
                  }}
                  placeholder="Start date"
                  className="text-sm"
                />
              </div>
              <div className="hidden sm:block pt-6">
                <span className="text-muted-foreground text-lg">→</span>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">End Date</label>
                <Input
                  type="date"
                  value={tempDateTo ? format(tempDateTo, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const date = new Date(e.target.value + "T00:00:00");
                      if (tempDateFrom && date < tempDateFrom) {
                        setTempDateTo(tempDateFrom);
                        setTempDateFrom(date);
                        setDateRange({ from: date, to: tempDateFrom });
                      } else {
                        setTempDateTo(date);
                        if (tempDateFrom) {
                          setDateRange({ from: tempDateFrom, to: date });
                        } else {
                          setDateRange({ from: date, to: date });
                          setTempDateFrom(date);
                        }
                      }
                    } else {
                      setTempDateTo(undefined);
                      if (tempDateFrom) {
                        setDateRange({ from: tempDateFrom, to: undefined });
                      } else {
                        setDateRange(undefined);
                      }
                    }
                  }}
                  placeholder="End date"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Enhanced Calendar */}
            <div className="border rounded-lg p-2 sm:p-4 bg-background">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={isMobile ? 1 : 2}
                defaultMonth={tempDateFrom || new Date()}
                className="rounded-md"
                classNames={{
                  months: isMobile ? "flex flex-col space-y-6" : "flex flex-row space-x-6",
                  month: "space-y-4",
                  caption: "flex justify-center pt-1 relative items-center mb-2",
                  caption_label: "text-sm font-semibold",
                  nav: "space-x-1 flex items-center",
                  nav_button: cn(
                    "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 rounded-md border border-input hover:bg-accent"
                  ),
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex mb-2",
                  head_cell: cn(
                    "text-muted-foreground rounded-md font-medium text-xs",
                    isMobile ? "w-9" : "w-10"
                  ),
                  row: "flex w-full mt-1",
                  cell: cn(
                    "text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    isMobile ? "h-9 w-9" : "h-10 w-10"
                  ),
                  day: cn(
                    "p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent transition-colors",
                    isMobile ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm"
                  ),
                  day_range_end: "day-range-end",
                  day_selected:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-semibold",
                  day_today: "bg-accent text-accent-foreground font-semibold border border-primary/20",
                  day_outside:
                    "day-outside text-muted-foreground opacity-40 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                  day_disabled: "text-muted-foreground opacity-30",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                }}
                modifiers={{
                  comparison: comparisonDateRange && comparisonDateRange.from && comparisonDateRange.to
                    ? (date) => {
                        const d = new Date(date);
                        d.setHours(0, 0, 0, 0);
                        const from = new Date(comparisonDateRange.from);
                        from.setHours(0, 0, 0, 0);
                        const to = new Date(comparisonDateRange.to);
                        to.setHours(0, 0, 0, 0);
                        return d >= from && d <= to;
                      }
                    : undefined,
                }}
                modifiersClassNames={{
                  comparison: "bg-blue-100 text-blue-900 border-2 border-blue-400 font-medium",
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(23, 59, 59, 999);
                  return date > today;
                }}
              />
              {comparisonDateRange && originalDateRange && (
                <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-primary rounded border-2 border-primary/20"></div>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">Selected:</span> {format(originalDateRange.from, "MMM d")} - {format(originalDateRange.to, "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-100 border-2 border-blue-400 rounded"></div>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">Comparison:</span> {format(comparisonDateRange.from, "MMM d")} - {format(comparisonDateRange.to, "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-5 pt-4 border-t">
              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" className="w-full sm:w-auto" onClick={handleApply} disabled={!tempDateFrom || !tempDateTo}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
