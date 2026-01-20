import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, ChevronDown, UserX, Users, Dumbbell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export const MemberFilter = ({ value, onChange, counts, ptFilterActive, onPtFilterChange }: MemberFilterProps) => {
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
  const hoverTimeoutRef = React.useRef<Record<string, NodeJS.Timeout | null>>({});

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
    
    // Detoggle PT filter when "All Members" is clicked
    if (category === "all" && ptFilterActive && onPtFilterChange) {
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
      if (!ptFilterActive) {
        onChange("all");
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
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
                  "h-8 px-2.5 rounded-lg border transition-all duration-200 shadow-sm",
                  "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                  "focus:ring-0 focus:ring-offset-0 focus:outline-none",
                  category.bgColor,
                  category.color,
                  category.hoverColor,
                  category.hoverTextColor,
                  category.hoverBorderColor,
                  "hover:shadow-md hover:scale-[1.02]",
                  // Active state - same as hover state
                  isActive && category.hoverColor,
                  isActive && category.hoverTextColor,
                  isActive && category.hoverBorderColor,
                  isActive && "shadow-md"
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
                <div className="flex items-center gap-1.5">
                  <span className={cn("transition-colors", category.color, category.hoverTextColor)}>
                    {category.icon}
                  </span>
                  <span className={cn("text-xs font-medium transition-colors", category.color, category.hoverTextColor)}>
                    {category.label}
                  </span>
                  {counts && (
                    <span className={cn(
                      "text-xs font-semibold px-1.5 py-0.5 rounded-md transition-colors",
                      category.bgColor,
                      category.color,
                      category.hoverTextColor,
                      "hover:bg-opacity-80"
                    )}>
                      {category.category === "all" && counts.all !== undefined && counts.all}
                      {category.category === "active" && counts.active !== undefined && counts.active}
                      {category.category === "expiring_soon" && counts.expiring_soon !== undefined && counts.expiring_soon}
                      {category.category === "expired" && counts.expired !== undefined && counts.expired}
                      {category.category === "inactive" && counts.inactive !== undefined && counts.inactive}
                    </span>
                  )}
                  {hasSubFilters && (
                    <ChevronDown className={cn("w-3 h-3 ml-0.5 transition-colors", category.color, category.hoverTextColor)} />
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            {hasSubFilters && (
              <DropdownMenuContent 
                align="start" 
                className="w-56 p-1.5 transition-all duration-200 shadow-lg border bg-white dark:bg-gray-950 rounded-lg"
                sideOffset={4}
                onMouseEnter={() => {
                  // Clear any pending close timeout for this category
                  if (hoverTimeoutRef.current[category.category]) {
                    clearTimeout(hoverTimeoutRef.current[category.category]!);
                    hoverTimeoutRef.current[category.category] = null;
                  }
                  // Only set if not already open to prevent flickering
                  if (openDropdown !== category.category) {
                    setOpenDropdown(category.category);
                  }
                }}
                onMouseLeave={() => {
                  // Delay closing when leaving dropdown
                  hoverTimeoutRef.current[category.category] = setTimeout(() => {
                    setOpenDropdown((prev) => {
                      if (prev === category.category) {
                        return null;
                      }
                      return prev;
                    });
                    hoverTimeoutRef.current[category.category] = null;
                  }, 300);
                }}
              >
                {category.internalFilters?.map((filter) => {
                  const isSelected = value === filter.value;
                  
                  // Get accent colors based on category for hover states
                  const hoverBg = category.category === "expiring_soon"
                    ? "hover:bg-amber-50 dark:hover:bg-amber-950/20"
                    : category.category === "expired"
                    ? "hover:bg-red-50 dark:hover:bg-red-950/20"
                    : category.category === "active"
                    ? "hover:bg-green-100 dark:hover:bg-green-900/30"
                    : category.category === "inactive"
                    ? "hover:bg-slate-50 dark:hover:bg-slate-950/20"
                    : "hover:bg-blue-50 dark:hover:bg-blue-950/20";
                  
                  const selectedBg = category.category === "expiring_soon"
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : category.category === "expired"
                    ? "bg-red-100 dark:bg-red-900/30"
                    : category.category === "active"
                    ? "bg-green-200 dark:bg-green-800/40"
                    : category.category === "inactive"
                    ? "bg-slate-100 dark:bg-slate-900/30"
                    : "bg-blue-100 dark:bg-blue-900/30";
                  
                  const textColor = category.category === "expiring_soon"
                    ? "text-gray-900 dark:text-gray-100"
                    : category.category === "expired"
                    ? "text-gray-900 dark:text-gray-100"
                    : category.category === "active"
                    ? "text-green-800 dark:text-green-200"
                    : category.category === "inactive"
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-900 dark:text-gray-100";
                  
                  const checkmarkColor = category.category === "expiring_soon"
                    ? "text-amber-600 dark:text-amber-400"
                    : category.category === "expired"
                    ? "text-red-600 dark:text-red-400"
                    : category.category === "active"
                    ? "text-green-700 dark:text-green-300"
                    : category.category === "inactive"
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-blue-600 dark:text-blue-400";
                  
                  return (
                    <DropdownMenuItem
                      key={filter.value}
                      onClick={() => {
                        onChange(filter.value);
                        setOpenDropdown(null);
                        // Clear timeout for this category
                        if (hoverTimeoutRef.current[category.category]) {
                          clearTimeout(hoverTimeoutRef.current[category.category]!);
                          hoverTimeoutRef.current[category.category] = null;
                        }
                        if (category.category === "all" && ptFilterActive && onPtFilterChange) {
                          onPtFilterChange(false);
                        }
                      }}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none transition-all duration-150",
                        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                        "focus:outline-none focus:ring-0",
                        hoverBg,
                        isSelected && selectedBg,
                        isSelected && "font-semibold",
                        textColor
                      )}
                    >
                      <span className="flex-1">{filter.label}</span>
                      {isSelected && (
                        <CheckCircle2 className={cn("w-4 h-4 ml-2 flex-shrink-0", checkmarkColor)} />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        );
      })}

      {/* PT Filter Chip */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-8 px-2.5 rounded-lg border transition-all duration-200 shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30",
              "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
              "focus:ring-0 focus:ring-offset-0 focus:outline-none",
              ptFilterActive 
                ? "bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 border-purple-300 dark:border-purple-700 shadow-md"
                : "border-purple-200/50 dark:border-purple-800/50 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/40 dark:hover:to-pink-900/40 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md hover:scale-[1.02]"
            )}
            onClick={(e) => {
              e.currentTarget.blur(); // Remove focus to prevent blue border
              handlePtClick();
            }}
          >
            <div className="flex items-center gap-1.5">
              <Dumbbell className={cn(
                "w-4 h-4 transition-colors",
                ptFilterActive 
                  ? "text-purple-700 dark:text-purple-300"
                  : "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              )} />
              <span className={cn(
                "text-xs font-medium transition-colors",
                ptFilterActive 
                  ? "text-purple-800 dark:text-purple-200"
                  : "text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200"
              )}>
                Personal Training
              </span>
              {counts && (
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded-md transition-colors",
                  ptFilterActive
                    ? "bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200"
                    : "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 hover:text-purple-800 dark:hover:text-purple-200"
                )}>
                  {counts.with_pt || 0}
                </span>
              )}
              <ChevronDown className={cn(
                "w-3 h-3 ml-0.5 transition-colors",
                ptFilterActive 
                  ? "text-purple-700 dark:text-purple-300"
                  : "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              )} />
            </div>
          </Button>
        </DropdownMenuTrigger>
        {ptFilterActive && (
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onClick={() => onChange("active")}
              className={cn(
                "cursor-pointer",
                value === "active" && "bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span>Active PT</span>
                {value === "active" && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange("expiring_soon")}
              className={cn(
                "cursor-pointer",
                value === "expiring_soon" && "bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span>Expiring PT</span>
                {value === "expiring_soon" && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange("expired")}
              className={cn(
                "cursor-pointer",
                value === "expired" && "bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span>Expired PT</span>
                {value === "expired" && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange("inactive")}
              className={cn(
                "cursor-pointer",
                value === "inactive" && "bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span>No PT</span>
                {value === "inactive" && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  );
};
