import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { CalendarIcon } from "lucide-react";

export type PeriodType = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "last_30_days" | "last_90_days" | "custom";

interface PeriodSelectorProps {
  period: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  customDateFrom?: string;
  customDateTo?: string;
  onCustomDateChange?: (from: string, to: string) => void;
  showCustomDatePicker?: boolean;
  className?: string;
  compact?: boolean;
}

export const getPeriodDates = (period: PeriodType, customFrom?: string, customTo?: string): { from: string; to: string } => {
  const today = new Date();
  const yesterday = subDays(today, 1);
  
  switch (period) {
    case "today":
      return {
        from: format(today, "yyyy-MM-dd"),
        to: format(today, "yyyy-MM-dd"),
      };
    case "yesterday":
      return {
        from: format(yesterday, "yyyy-MM-dd"),
        to: format(yesterday, "yyyy-MM-dd"),
      };
    case "this_week":
      return {
        from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "last_week":
      const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
      return {
        from: format(lastWeekStart, "yyyy-MM-dd"),
        to: format(lastWeekEnd, "yyyy-MM-dd"),
      };
    case "this_month":
      return {
        from: format(startOfMonth(today), "yyyy-MM-dd"),
        to: format(endOfMonth(today), "yyyy-MM-dd"),
      };
    case "last_month":
      const lastMonth = subMonths(today, 1);
      return {
        from: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        to: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
      };
    case "last_30_days":
      return {
        from: format(subDays(today, 30), "yyyy-MM-dd"),
        to: format(today, "yyyy-MM-dd"),
      };
    case "last_90_days":
      return {
        from: format(subDays(today, 90), "yyyy-MM-dd"),
        to: format(today, "yyyy-MM-dd"),
      };
    case "custom":
      return {
        from: customFrom || format(subDays(today, 30), "yyyy-MM-dd"),
        to: customTo || format(today, "yyyy-MM-dd"),
      };
    default:
      return {
        from: format(subDays(today, 30), "yyyy-MM-dd"),
        to: format(today, "yyyy-MM-dd"),
      };
  }
};

export const getPeriodLabel = (period: PeriodType): string => {
  switch (period) {
    case "today": return "Today";
    case "yesterday": return "Yesterday";
    case "this_week": return "This Week";
    case "last_week": return "Last Week";
    case "this_month": return "This Month";
    case "last_month": return "Last Month";
    case "last_30_days": return "Last 30 Days";
    case "last_90_days": return "Last 90 Days";
    case "custom": return "Custom Range";
    default: return "Select Period";
  }
};

export const PeriodSelector = ({
  period,
  onPeriodChange,
  customDateFrom,
  customDateTo,
  onCustomDateChange,
  showCustomDatePicker = true,
  className = "",
  compact = false,
}: PeriodSelectorProps) => {
  const isCustom = period === "custom";

  return (
    <div className={`flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto ${className}`}>
      <Select value={period} onValueChange={(value) => onPeriodChange(value as PeriodType)}>
        <SelectTrigger className={compact ? "w-full sm:w-[140px] text-xs sm:text-sm h-9 sm:h-10" : "w-full sm:w-[160px]"}>
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="last_week">Last Week</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="last_30_days">Last 30 Days</SelectItem>
          <SelectItem value="last_90_days">Last 90 Days</SelectItem>
          {showCustomDatePicker && <SelectItem value="custom">Custom Range</SelectItem>}
        </SelectContent>
      </Select>

      {isCustom && showCustomDatePicker && onCustomDateChange && (
        <DateRangePicker
          dateFrom={customDateFrom || ""}
          dateTo={customDateTo || ""}
          onDateChange={onCustomDateChange}
        />
      )}
    </div>
  );
};

// Preset buttons for quick period selection
interface PeriodPresetButtonsProps {
  currentPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  showWeekly?: boolean;
  showMonthly?: boolean;
  showCustom?: boolean;
  className?: string;
}

export const PeriodPresetButtons = ({
  currentPeriod,
  onPeriodChange,
  showWeekly = true,
  showMonthly = true,
  showCustom = true,
  className = "",
}: PeriodPresetButtonsProps) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {showWeekly && (
        <>
          <Button
            variant={currentPeriod === "this_week" ? "default" : "outline"}
            size="sm"
            onClick={() => onPeriodChange("this_week")}
          >
            This Week
          </Button>
          <Button
            variant={currentPeriod === "last_week" ? "default" : "outline"}
            size="sm"
            onClick={() => onPeriodChange("last_week")}
          >
            Last Week
          </Button>
        </>
      )}
      {showMonthly && (
        <>
          <Button
            variant={currentPeriod === "this_month" ? "default" : "outline"}
            size="sm"
            onClick={() => onPeriodChange("this_month")}
          >
            This Month
          </Button>
          <Button
            variant={currentPeriod === "last_month" ? "default" : "outline"}
            size="sm"
            onClick={() => onPeriodChange("last_month")}
          >
            Last Month
          </Button>
        </>
      )}
      {showCustom && (
        <Button
          variant={currentPeriod === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => onPeriodChange("custom")}
        >
          <CalendarIcon className="w-4 h-4 mr-1" />
          Custom
        </Button>
      )}
    </div>
  );
};

export default PeriodSelector;
