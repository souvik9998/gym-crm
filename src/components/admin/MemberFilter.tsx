import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, ChevronDown, UserX, Users, Dumbbell, Filter, CalendarClock, CalendarDays, CalendarRange, AlertTriangle, History, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { TimeBucketDropdown } from "@/components/admin/TimeBucketDropdown";
import type { TimeBucket, TimeBucketOption } from "@/components/admin/staff/timeslots/timeSlotUtils";
import { useCloseOnRouteChange } from "@/hooks/use-close-on-route-change";

// Per-option metadata for the rich sub-filter dropdowns. Mirrors the
// trainer/time-slot dropdown style: icon + title + description + check badge.
type SubFilterMeta = {
  icon: React.ReactNode;
  description: string;
};

const subFilterMeta: Record<MemberFilterValue, SubFilterMeta> = {
  all: { icon: <Users className="w-3.5 h-3.5" />, description: "Every member in this branch" },
  active: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, description: "All members with active subscriptions" },
  expiring_soon: { icon: <CalendarRange className="w-3.5 h-3.5" />, description: "Expiring within the next 7 days" },
  expiring_today: { icon: <AlertTriangle className="w-3.5 h-3.5" />, description: "Subscription ends today" },
  expiring_2days: { icon: <CalendarClock className="w-3.5 h-3.5" />, description: "Ends in the next 2 days" },
  expiring_7days: { icon: <CalendarDays className="w-3.5 h-3.5" />, description: "Ends in the next 7 days" },
  expired: { icon: <XCircle className="w-3.5 h-3.5" />, description: "All expired memberships" },
  expired_recent: { icon: <History className="w-3.5 h-3.5" />, description: "Expired within the last 7 days" },
  inactive: { icon: <UserX className="w-3.5 h-3.5" />, description: "Members never subscribed" },
};

// Per-category color tokens for the rich dropdown panel (matches Trainer dropdown).
const categoryPalette: Record<string, {
  iconBg: string; iconText: string;
  activeBg: string; activeBorder: string; activeRing: string; activeText: string;
  badgeBg: string;
}> = {
  expiring_soon: {
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    iconText: "text-amber-600 dark:text-amber-400",
    activeBg: "bg-amber-100/80 dark:bg-amber-900/40",
    activeBorder: "border-amber-300 dark:border-amber-700",
    activeRing: "ring-amber-300/50",
    activeText: "text-amber-800 dark:text-amber-200",
    badgeBg: "bg-amber-500",
  },
  expired: {
    iconBg: "bg-rose-50 dark:bg-rose-950/40",
    iconText: "text-rose-600 dark:text-rose-400",
    activeBg: "bg-rose-100/80 dark:bg-rose-900/40",
    activeBorder: "border-rose-300 dark:border-rose-700",
    activeRing: "ring-rose-300/50",
    activeText: "text-rose-800 dark:text-rose-200",
    badgeBg: "bg-rose-500",
  },
  active: {
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
    iconText: "text-emerald-600 dark:text-emerald-400",
    activeBg: "bg-emerald-100/80 dark:bg-emerald-900/40",
    activeBorder: "border-emerald-300 dark:border-emerald-700",
    activeRing: "ring-emerald-300/50",
    activeText: "text-emerald-800 dark:text-emerald-200",
    badgeBg: "bg-emerald-500",
  },
  inactive: {
    iconBg: "bg-slate-100 dark:bg-slate-900/50",
    iconText: "text-slate-600 dark:text-slate-400",
    activeBg: "bg-slate-100/80 dark:bg-slate-800/40",
    activeBorder: "border-slate-300 dark:border-slate-700",
    activeRing: "ring-slate-300/50",
    activeText: "text-slate-800 dark:text-slate-200",
    badgeBg: "bg-slate-500",
  },
  all: {
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    iconText: "text-blue-600 dark:text-blue-400",
    activeBg: "bg-blue-100/80 dark:bg-blue-900/40",
    activeBorder: "border-blue-300 dark:border-blue-700",
    activeRing: "ring-blue-300/50",
    activeText: "text-blue-800 dark:text-blue-200",
    badgeBg: "bg-blue-500",
  },
};

export type MemberFilterCategory = "all" | "active" | "expired" | "inactive" | "expiring_soon" | "pt";

export type MemberFilterValue = 
  | "all"
  | "active"
  | "expired"
  | "inactive"
  | "expiring_soon"
  | "expiring_today"
  | "expiring_2days"
  | "expiring_7days"
  | "expired_recent";

interface MemberFilterProps {
  value: MemberFilterValue;
  onChange: (value: MemberFilterValue) => void;
  counts?: {
    all?: number;
    active?: number;
    expiring_soon?: number;
    expired?: number;
    inactive?: number;
    with_pt?: number;
    without_pt?: number;
  };
  ptFilterActive?: boolean;
  onPtFilterChange?: (active: boolean) => void;
  mobileMode?: boolean;
  trainerFilter?: string | null;
  onTrainerFilterChange?: (value: string | null) => void;
  timeSlotFilter?: string | null;
  onTimeSlotFilterChange?: (value: string | null) => void;
  timeBucketFilter?: TimeBucket;
  onTimeBucketFilterChange?: (value: TimeBucket) => void;
  timeBucketOptions?: TimeBucketOption[];
}

const filterCategories: {
  category: MemberFilterCategory | "all";
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
  hoverTextColor: string;
  hoverBorderColor: string;
  internalFilters?: { value: MemberFilterValue; label: string }[];
}[] = [
  {
    category: "all",
    label: "All Members",
    icon: <Users className="w-4 h-4" />,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    hoverColor: "hover:bg-blue-100 dark:hover:bg-blue-900/40",
    hoverTextColor: "hover:text-blue-800 dark:hover:text-blue-300",
    hoverBorderColor: "hover:border-blue-300 dark:hover:border-blue-700",
    internalFilters: [
      { value: "all", label: "All Members" },
    ],
  },
  {
    category: "active",
    label: "Active",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    hoverColor: "hover:bg-green-200 dark:hover:bg-green-800/50",
    hoverTextColor: "hover:text-green-900 dark:hover:text-green-100",
    hoverBorderColor: "hover:border-green-400 dark:hover:border-green-600",
    internalFilters: [
      { value: "active", label: "All Active" },
    ],
  },
  {
    category: "expiring_soon",
    label: "Expiring",
    icon: <Clock className="w-4 h-4" />,
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    hoverColor: "hover:bg-amber-100 dark:hover:bg-amber-900/40",
    hoverTextColor: "hover:text-amber-800 dark:hover:text-amber-300",
    hoverBorderColor: "hover:border-amber-300 dark:hover:border-amber-700",
    internalFilters: [
      { value: "expiring_soon", label: "All Expiring" },
      { value: "expiring_today", label: "Expiring Today" },
      { value: "expiring_2days", label: "In 2 Days" },
      { value: "expiring_7days", label: "In 7 Days" },
    ],
  },
  {
    category: "expired",
    label: "Expired",
    icon: <XCircle className="w-4 h-4" />,
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    hoverColor: "hover:bg-red-100 dark:hover:bg-red-900/40",
    hoverTextColor: "hover:text-red-800 dark:hover:text-red-300",
    hoverBorderColor: "hover:border-red-300 dark:hover:border-red-700",
    internalFilters: [
      { value: "expired", label: "All Expired" },
      { value: "expired_recent", label: "Recent" },
    ],
  },
  {
    category: "inactive",
    label: "Inactive",
    icon: <UserX className="w-4 h-4" />,
    color: "text-slate-700 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950/30",
    hoverColor: "hover:bg-slate-100 dark:hover:bg-slate-800/40",
    hoverTextColor: "hover:text-slate-800 dark:hover:text-slate-300",
    hoverBorderColor: "hover:border-slate-300 dark:hover:border-slate-700",
    internalFilters: [
      { value: "inactive", label: "All Inactive" },
    ],
  },
];

export const MemberFilter = ({ value, onChange, counts, ptFilterActive, onPtFilterChange, mobileMode = false, trainerFilter, onTrainerFilterChange, timeSlotFilter, onTimeSlotFilterChange, timeBucketFilter, onTimeBucketFilterChange, timeBucketOptions }: MemberFilterProps) => {
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
  const [mobileDropdownOpen, setMobileDropdownOpen] = React.useState(false);
  const hoverTimeoutRef = React.useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  useCloseOnRouteChange(mobileDropdownOpen, setMobileDropdownOpen);
  useCloseOnRouteChange(openDropdown !== null, () => setOpenDropdown(null));

  const getCategoryFromValue = (val: MemberFilterValue): MemberFilterCategory | null => {
    if (val === "all") return "all";
    if (val.startsWith("expiring")) return "expiring_soon";
    if (val.startsWith("expired")) return "expired";
    if (val === "active") return "active";
    if (val === "inactive") return "inactive";
    return null;
  };

  const currentCategory = getCategoryFromValue(value);
  const getCurrentLabel = () => {
    if (ptFilterActive) {
      switch (value) {
        case "active": return "Active PT";
        case "expiring_soon": return "Expiring PT";
        case "expired": return "Expired PT";
        case "inactive": return "No PT";
        default: return "All PT";
      }
    }
    const category = filterCategories.find((c) => c.category === currentCategory);
    if (category) {
      const selectedFilter = category.internalFilters?.find((f) => f.value === value);
      return selectedFilter?.label || category.label;
    }
    return "All Members";
  };

  const handleCategoryClick = (category: MemberFilterCategory | "all") => {
    if (category === "pt") return; // PT is handled separately
    
    // Deactivate PT filter when any regular filter is clicked
    if (ptFilterActive && onPtFilterChange) {
      onPtFilterChange(false);
    }
    
    // Set to first internal filter or category default
    const categoryData = filterCategories.find((c) => c.category === category);
    if (categoryData?.internalFilters && categoryData.internalFilters.length > 0) {
      onChange(categoryData.internalFilters[0].value);
    } else if (category === "all") {
      onChange("all");
    } else {
      onChange(category as MemberFilterValue);
    }
  };

  const handlePtClick = () => {
    if (onPtFilterChange) {
      onPtFilterChange(!ptFilterActive);
    }
  };

  // Mobile Mode: Single Dropdown
  if (mobileMode) {
    const currentCount = ptFilterActive 
      ? (counts?.with_pt || 0)
      : currentCategory === "all" ? counts?.all
      : currentCategory === "active" ? counts?.active
      : currentCategory === "expiring_soon" ? counts?.expiring_soon
      : currentCategory === "expired" ? counts?.expired
      : currentCategory === "inactive" ? counts?.inactive
      : 0;

    return (
      <DropdownMenu open={mobileDropdownOpen} onOpenChange={setMobileDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-9 text-xs px-3 rounded-xl border-border/50 bg-card hover:bg-muted/60 transition-all duration-200 active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5">
              <span className="[&>svg]:w-4 [&>svg]:h-4 text-muted-foreground">
                {ptFilterActive ? (
                  <Dumbbell className="w-4 h-4" />
                ) : (
                  filterCategories.find((c) => c.category === currentCategory)?.icon || <Users className="w-4 h-4" />
                )}
              </span>
              <span className="font-medium truncate">{getCurrentLabel()}</span>
              {currentCount !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {currentCount}
                </span>
              )}
            </span>
            <ChevronDown className={cn(
              "w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200",
              mobileDropdownOpen && "rotate-180"
            )} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="start" 
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px] rounded-xl border-border/50 shadow-lg p-1.5 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* All Members */}
          <DropdownMenuItem
            onClick={() => {
              onChange("all");
              if (ptFilterActive && onPtFilterChange) onPtFilterChange(false);
              setMobileDropdownOpen(false);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150",
              value === "all" && !ptFilterActive && "bg-muted"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">All Members</span>
              </span>
              {counts?.all !== undefined && (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts.all}</span>
              )}
            </div>
          </DropdownMenuItem>
          
          {/* Active */}
          <DropdownMenuItem
            onClick={() => {
              onChange("active");
              if (ptFilterActive && onPtFilterChange) onPtFilterChange(false);
              setMobileDropdownOpen(false);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150",
              value === "active" && !ptFilterActive && "bg-green-50 dark:bg-green-950/20"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Active</span>
              </span>
              {counts?.active !== undefined && (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts.active}</span>
              )}
            </div>
          </DropdownMenuItem>
          
          {/* Expiring Soon */}
          <DropdownMenuItem
            onClick={() => {
              onChange("expiring_soon");
              if (ptFilterActive && onPtFilterChange) onPtFilterChange(false);
              setMobileDropdownOpen(false);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150",
              (value === "expiring_soon" || value.startsWith("expiring")) && !ptFilterActive && "bg-amber-50 dark:bg-amber-950/20"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">Expiring Soon</span>
              </span>
              {counts?.expiring_soon !== undefined && (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts.expiring_soon}</span>
              )}
            </div>
          </DropdownMenuItem>
          
          {/* Expired */}
          <DropdownMenuItem
            onClick={() => {
              onChange("expired");
              if (ptFilterActive && onPtFilterChange) onPtFilterChange(false);
              setMobileDropdownOpen(false);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150",
              (value === "expired" || value === "expired_recent") && !ptFilterActive && "bg-red-50 dark:bg-red-950/20"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2.5">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium">Expired</span>
              </span>
              {counts?.expired !== undefined && (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts.expired}</span>
              )}
            </div>
          </DropdownMenuItem>
          
          {/* Inactive */}
          <DropdownMenuItem
            onClick={() => {
              onChange("inactive");
              if (ptFilterActive && onPtFilterChange) onPtFilterChange(false);
              setMobileDropdownOpen(false);
            }}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150",
              value === "inactive" && !ptFilterActive && "bg-muted"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2.5">
                <UserX className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Inactive</span>
              </span>
              {counts?.inactive !== undefined && (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts.inactive}</span>
              )}
            </div>
          </DropdownMenuItem>
          
          {/* Trainer & Slot Filters - inside dropdown */}
          {(onTrainerFilterChange || onTimeSlotFilterChange || onTimeBucketFilterChange) && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <div className="px-2 py-1.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Filters</p>
                {onTrainerFilterChange && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <TrainerFilterDropdown
                      value={trainerFilter || null}
                      onChange={onTrainerFilterChange}
                      compact={false}
                    />
                  </div>
                )}
                {onTimeSlotFilterChange && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <TimeSlotFilterDropdown
                      value={timeSlotFilter || null}
                      onChange={onTimeSlotFilterChange}
                      trainerFilter={trainerFilter}
                      compact={false}
                    />
                  </div>
                )}
                {onTimeBucketFilterChange && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <TimeBucketDropdown
                      value={timeBucketFilter ?? "all"}
                      onChange={onTimeBucketFilterChange}
                      options={timeBucketOptions}
                      className="w-full justify-between h-9 text-xs px-3 rounded-xl"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Desktop Mode: Filter Chips
  return (
    <div className="flex flex-wrap items-center gap-2 lg:gap-3">
      {/* Filter Chips with Dropdowns */}
      {filterCategories.map((category) => {
        const isActive = currentCategory === category.category && !ptFilterActive;
        const hasSubFilters = category.internalFilters && category.internalFilters.length > 1;

        return (
          <DropdownMenu 
            key={category.category}
            open={openDropdown === category.category}
            modal={false}
            onOpenChange={() => {
              // Completely ignore - we control open state via hover only
              // This prevents any conflicts with Radix's internal state management
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "relative h-7 lg:h-8 px-1.5 rounded-lg border transition-all duration-200 shadow-sm",
                  "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                  "focus:ring-0 focus:ring-offset-0 focus:outline-none",
                  category.bgColor,
                  category.color,
                  category.hoverColor,
                  category.hoverTextColor,
                  category.hoverBorderColor,
                  "hover:shadow-md hover:scale-[1.02]",
                  // Active state — distinct from hover: bolder border, ring, slight scale, persistent shadow
                  isActive && [
                    category.hoverColor,
                    category.hoverTextColor,
                    "border-2 ring-1 ring-offset-0 shadow-sm scale-[1.01] font-semibold",
                    category.category === "all" && "border-blue-500 ring-blue-400/20 dark:border-blue-400 dark:ring-blue-500/15",
                    category.category === "active" && "border-green-500 ring-green-400/20 dark:border-green-400 dark:ring-green-500/15",
                    category.category === "expiring_soon" && "border-amber-500 ring-amber-400/20 dark:border-amber-400 dark:ring-amber-500/15",
                    category.category === "expired" && "border-red-500 ring-red-400/20 dark:border-red-400 dark:ring-red-500/15",
                    category.category === "inactive" && "border-slate-500 ring-slate-400/20 dark:border-slate-400 dark:ring-slate-500/15",
                  ],
                  !isActive && "border"
                )}
                onMouseEnter={() => {
                  if (hasSubFilters) {
                    // Clear any pending close timeout for this category
                    if (hoverTimeoutRef.current[category.category]) {
                      clearTimeout(hoverTimeoutRef.current[category.category]!);
                      hoverTimeoutRef.current[category.category] = null;
                    }
                    // Only set if not already open to prevent flickering
                    if (openDropdown !== category.category) {
                      setOpenDropdown(category.category);
                    }
                  }
                }}
                onMouseLeave={() => {
                  if (hasSubFilters) {
                    // Delay closing to allow moving to dropdown
                    hoverTimeoutRef.current[category.category] = setTimeout(() => {
                      setOpenDropdown((prev) => {
                        if (prev === category.category) {
                          return null;
                        }
                        return prev;
                      });
                      hoverTimeoutRef.current[category.category] = null;
                    }, 300);
                  }
                }}
                onClick={(e) => {
                  e.currentTarget.blur(); // Remove focus to prevent blue border
                  if (hasSubFilters) {
                    // When clicking a chip with dropdown, immediately select the first option
                    const categoryData = filterCategories.find((c) => c.category === category.category);
                    if (categoryData?.internalFilters && categoryData.internalFilters.length > 0) {
                      onChange(categoryData.internalFilters[0].value);
                    }
                  } else {
                    handleCategoryClick(category.category);
                  }
                }}
              >
                <div className="flex items-center gap-1 lg:gap-1.5">
                  <span className={cn("transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 lg:[&>svg]:w-4 lg:[&>svg]:h-4", category.color, category.hoverTextColor)}>
                  {category.icon}
                  </span>
                  <span className={cn("text-[10px] lg:text-xs font-medium transition-colors", category.color, category.hoverTextColor)}>
                    {category.label}
                  </span>
                  {counts && (
                    <span className={cn(
                      "text-[10px] lg:text-xs font-semibold px-1 lg:px-1.5 py-0.5 rounded-md transition-colors",
                      category.bgColor,
                      category.color,
                      category.hoverTextColor,
                      "hover:bg-opacity-80",
                      isActive && "bg-background/70 dark:bg-background/40 shadow-inner"
                    )}>
                      {category.category === "all" && counts.all !== undefined && counts.all}
                      {category.category === "active" && counts.active !== undefined && counts.active}
                      {category.category === "expiring_soon" && counts.expiring_soon !== undefined && counts.expiring_soon}
                      {category.category === "expired" && counts.expired !== undefined && counts.expired}
                      {category.category === "inactive" && counts.inactive !== undefined && counts.inactive}
                    </span>
                  )}
                  {hasSubFilters && (
                    <ChevronDown className={cn("w-3 h-3 ml-0.5 transition-colors", category.color, category.hoverTextColor, isActive && "rotate-180")} />
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            {hasSubFilters && (
              <DropdownMenuContent
                align="start"
                className="w-[260px] p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden"
                sideOffset={6}
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current[category.category]) {
                    clearTimeout(hoverTimeoutRef.current[category.category]!);
                    hoverTimeoutRef.current[category.category] = null;
                  }
                  if (openDropdown !== category.category) {
                    setOpenDropdown(category.category);
                  }
                }}
                onMouseLeave={() => {
                  hoverTimeoutRef.current[category.category] = setTimeout(() => {
                    setOpenDropdown((prev) => (prev === category.category ? null : prev));
                    hoverTimeoutRef.current[category.category] = null;
                  }, 300);
                }}
              >
                {/* Header strip — mirrors Trainer/TimeSlot dropdowns */}
                <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/40 px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">
                      {category.category === "expiring_soon" ? "Filter Expiring" :
                       category.category === "expired" ? "Filter Expired" :
                       `Filter ${category.label}`}
                    </p>
                    {isActive && (
                      <button
                        onClick={() => {
                          onChange("all");
                          setOpenDropdown(null);
                          if (hoverTimeoutRef.current[category.category]) {
                            clearTimeout(hoverTimeoutRef.current[category.category]!);
                            hoverTimeoutRef.current[category.category] = null;
                          }
                        }}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Option list */}
                <div className="p-1.5 space-y-0.5 max-h-[360px] overflow-y-auto">
                  {category.internalFilters?.map((filter, idx) => {
                    const isSelected = value === filter.value;
                    const palette = categoryPalette[category.category] || categoryPalette.all;
                    const meta = subFilterMeta[filter.value];

                    return (
                      <button
                        key={filter.value}
                        onClick={() => {
                          onChange(filter.value);
                          setOpenDropdown(null);
                          if (hoverTimeoutRef.current[category.category]) {
                            clearTimeout(hoverTimeoutRef.current[category.category]!);
                            hoverTimeoutRef.current[category.category] = null;
                          }
                          if (category.category === "all" && ptFilterActive && onPtFilterChange) {
                            onPtFilterChange(false);
                          }
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 text-left",
                          "hover:scale-[1.01] active:scale-[0.99] animate-fade-in",
                          isSelected
                            ? cn(palette.activeBg, palette.activeBorder, "border shadow-sm ring-1", palette.activeRing)
                            : "border border-transparent hover:bg-muted/50"
                        )}
                        style={{ animationDelay: `${idx * 40}ms`, animationDuration: "220ms" }}
                      >
                        {/* Icon tile */}
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center ring-2 ring-background shadow-sm flex-shrink-0",
                          palette.iconBg, palette.iconText
                        )}>
                          {meta?.icon}
                        </div>

                        {/* Label + description */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-xs font-semibold truncate",
                            isSelected ? palette.activeText : "text-foreground"
                          )}>
                            {filter.label}
                          </p>
                          {meta?.description && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {meta.description}
                            </p>
                          )}
                        </div>

                        {/* Selected check badge */}
                        {isSelected && (
                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center animate-scale-in flex-shrink-0",
                            palette.badgeBg
                          )}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        );
      })}

    </div>
  );
};
