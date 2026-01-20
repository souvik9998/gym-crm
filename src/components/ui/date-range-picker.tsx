import * as React from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subWeeks, subMonths, subQuarters, subYears, isSameDay } from "date-fns";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

type ComparisonPeriod = 
  | "none"
  | "previous_period"
  | "previous_week"
  | "previous_month"
  | "previous_quarter"
  | "previous_year"
  | "previous_year_dow";

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  className?: string;
}

export const DateRangePicker = ({ dateFrom, dateTo, onDateChange, className }: DateRangePickerProps) => {
  const [open, setOpen] = React.useState(false);
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
      } else {
        // If only from is selected, clear to date
        setTempDateTo(undefined);
      }
    } else {
      // Clear selection
      setDateRange(undefined);
      setTempDateFrom(undefined);
      setTempDateTo(undefined);
    }
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
    setOpen(false);
  };

  const handleComparisonChange = (value: ComparisonPeriod) => {
    setComparisonPeriod(value);
    
    if (value === "none") {
      // Reset to original dates if comparison is removed
      if (dateFrom && dateTo) {
        setTempDateFrom(new Date(dateFrom));
        setTempDateTo(new Date(dateTo));
        setDateRange({ from: new Date(dateFrom), to: new Date(dateTo) });
      }
      return;
    }

    // Need a date range to calculate comparison
    if (!tempDateFrom || !tempDateTo) {
      return;
    }

    let comparisonStart: Date;
    let comparisonEnd: Date;
    const rangeDays = Math.ceil((tempDateTo.getTime() - tempDateFrom.getTime()) / (1000 * 60 * 60 * 24));
    
    switch (value) {
      case "previous_period":
        comparisonEnd = new Date(tempDateFrom);
        comparisonEnd.setDate(comparisonEnd.getDate() - 1);
        comparisonEnd.setHours(23, 59, 59, 999);
        comparisonStart = new Date(comparisonEnd);
        comparisonStart.setDate(comparisonStart.getDate() - rangeDays);
        comparisonStart.setHours(0, 0, 0, 0);
        break;
      case "previous_week":
        comparisonStart = startOfWeek(subWeeks(tempDateFrom, 1));
        comparisonEnd = endOfWeek(subWeeks(tempDateTo, 1));
        break;
      case "previous_month":
        comparisonStart = startOfMonth(subMonths(tempDateFrom, 1));
        comparisonEnd = endOfMonth(subMonths(tempDateTo, 1));
        break;
      case "previous_quarter":
        comparisonStart = startOfQuarter(subQuarters(tempDateFrom, 1));
        comparisonEnd = endOfQuarter(subQuarters(tempDateTo, 1));
        break;
      case "previous_year":
        comparisonStart = startOfYear(subYears(tempDateFrom, 1));
        comparisonEnd = endOfYear(subYears(tempDateTo, 1));
        break;
      case "previous_year_dow":
        comparisonStart = new Date(tempDateFrom);
        comparisonStart.setFullYear(comparisonStart.getFullYear() - 1);
        comparisonEnd = new Date(tempDateTo);
        comparisonEnd.setFullYear(comparisonEnd.getFullYear() - 1);
        break;
      default:
        return;
    }

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[240px] justify-start text-left font-normal",
            !dateFrom && !dateTo && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Left Side - Comparison Period List */}
          <div className="border-r p-4 w-[240px]">
            <p className="text-sm font-medium mb-3">Comparison Period</p>
            <div className="space-y-1">
              <button
                onClick={() => handleComparisonChange("none")}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between",
                  comparisonPeriod === "none"
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
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
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
              >
                <span>Previous year (match day of week)</span>
                {comparisonPeriod === "previous_year_dow" && <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Right Side - Date Picker */}
          <div className="p-4">
            {/* Date Inputs */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1">
                <Input
                  type="date"
                  value={tempDateFrom ? format(tempDateFrom, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const date = new Date(e.target.value + "T00:00:00");
                      setTempDateFrom(date);
                      if (tempDateTo && date > tempDateTo) {
                        // If from date is after to date, clear to date
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
              <span className="text-muted-foreground">→</span>
              <div className="flex-1">
                <Input
                  type="date"
                  value={tempDateTo ? format(tempDateTo, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const date = new Date(e.target.value + "T00:00:00");
                      if (tempDateFrom && date < tempDateFrom) {
                        // If to date is before from date, swap them
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

            {/* Dual Calendar - Smaller */}
            <div className="scale-90 origin-top-left w-fit">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
                defaultMonth={tempDateFrom || new Date()}
                className="rounded-md border-0"
                classNames={{
                  months: "flex flex-row space-x-4",
                  month: "space-y-3",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  caption_dropdowns: "hidden",
                  dropdown: "hidden",
                  dropdown_month: "hidden",
                  dropdown_year: "hidden",
                }}
                disabled={(date) => {
                  // Disable future dates
                  const today = new Date();
                  today.setHours(23, 59, 59, 999);
                  return date > today;
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApply} disabled={!tempDateFrom}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
