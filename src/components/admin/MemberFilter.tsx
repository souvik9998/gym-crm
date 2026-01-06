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
  internalFilters?: { value: MemberFilterValue; label: string }[];
}[] = [
  {
    category: "all",
    label: "All Members",
    icon: <Users className="w-4 h-4" />,
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    hoverColor: "hover:bg-blue-100 dark:hover:bg-blue-950/50",
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
    hoverColor: "hover:bg-green-100 dark:hover:bg-green-950/50",
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
    hoverColor: "hover:bg-amber-100 dark:hover:bg-amber-950/50",
    internalFilters: [
      { value: "expiring_soon", label: "All Expiring" },
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
    hoverColor: "hover:bg-red-100 dark:hover:bg-red-950/50",
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
    hoverColor: "hover:bg-slate-100 dark:hover:bg-slate-950/50",
    internalFilters: [
      { value: "inactive", label: "All Inactive" },
    ],
  },
];

export const MemberFilter = ({ value, onChange, counts, ptFilterActive, onPtFilterChange }: MemberFilterProps) => {
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
    <div className="flex flex-wrap items-center gap-2">
      {/* Filter Chips with Dropdowns */}
      {filterCategories.map((category) => {
        const isActive = currentCategory === category.category && !ptFilterActive;
        const hasSubFilters = category.internalFilters && category.internalFilters.length > 1;

        return (
          <DropdownMenu key={category.category}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 px-3 rounded-full border transition-all",
                  category.bgColor,
                  category.color,
                  category.hoverColor,
                  isActive && "ring-2 ring-offset-2",
                  isActive && category.color.replace("text-", "ring-").replace("-700", "-500").replace("-400", "-500")
                )}
                onClick={() => !hasSubFilters && handleCategoryClick(category.category)}
              >
                <div className="flex items-center gap-2">
                  {category.icon}
                  <span className="text-sm font-medium">{category.label}</span>
                  {counts && (
                    <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded-full", category.bgColor, category.color)}>
                      {category.category === "all" && counts.all !== undefined && counts.all}
                      {category.category === "active" && counts.active !== undefined && counts.active}
                      {category.category === "expiring_soon" && counts.expiring_soon !== undefined && counts.expiring_soon}
                      {category.category === "expired" && counts.expired !== undefined && counts.expired}
                      {category.category === "inactive" && counts.inactive !== undefined && counts.inactive}
                    </span>
                  )}
                  {hasSubFilters && <ChevronDown className="w-3 h-3 ml-1" />}
                </div>
              </Button>
            </DropdownMenuTrigger>
            {hasSubFilters && (
              <DropdownMenuContent align="start" className="w-48">
                {category.internalFilters?.map((filter) => {
                  const isSelected = value === filter.value;
                  return (
                    <DropdownMenuItem
                      key={filter.value}
                      onClick={() => {
                        onChange(filter.value);
                        if (category.category === "all" && ptFilterActive && onPtFilterChange) {
                          onPtFilterChange(false);
                        }
                      }}
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-accent"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{filter.label}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-accent-foreground" />}
                      </div>
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
              "h-9 px-3 rounded-full border transition-all bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30",
              ptFilterActive 
                ? "ring-2 ring-purple-400/50 border-purple-400/50 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40"
                : "border-purple-200/50 dark:border-purple-800/50 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30"
            )}
            onClick={handlePtClick}
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Personal Training</span>
              {counts && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                  {counts.with_pt || 0}
                </span>
              )}
              <ChevronDown className="w-3 h-3 ml-1 text-purple-600 dark:text-purple-400" />
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
