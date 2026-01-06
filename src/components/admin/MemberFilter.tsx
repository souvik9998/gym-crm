import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, UserX, Users, Dumbbell } from "lucide-react";

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
  borderColor: string;
  internalFilters?: { value: MemberFilterValue; label: string }[];
}[] = [
  {
    category: "all",
    label: "All Members",
    icon: <Users className="w-5 h-5" />,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    internalFilters: [
      { value: "all", label: "All Members" },
    ],
  },
  {
    category: "active",
    label: "Active",
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/30",
    internalFilters: [
      { value: "active", label: "All Active" },
    ],
  },
  {
    category: "expiring_soon",
    label: "Expiring",
    icon: <Clock className="w-5 h-5" />,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    internalFilters: [
      { value: "expiring_soon", label: "All Expiring" },
      { value: "expiring_2days", label: "In 2 Days" },
      { value: "expiring_7days", label: "In 7 Days" },
    ],
  },
  {
    category: "expired",
    label: "Expired",
    icon: <XCircle className="w-5 h-5" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    internalFilters: [
      { value: "expired", label: "All Expired" },
      { value: "expired_recent", label: "Recent" },
    ],
  },
  {
    category: "inactive",
    label: "Inactive",
    icon: <UserX className="w-5 h-5" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
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

  const [expandedCategory, setExpandedCategory] = useState<MemberFilterCategory | null>(() => {
    return getCategoryFromValue(value);
  });

  // Update expanded category when value changes externally
  useEffect(() => {
    const category = getCategoryFromValue(value);
    if (category && category !== expandedCategory) {
      setExpandedCategory(category);
    }
  }, [value, expandedCategory]);

  const handleCategoryClick = (category: MemberFilterCategory | "all") => {
    if (category === "pt") return; // PT is handled separately
    
    if (expandedCategory === category) {
      setExpandedCategory(null);
      onChange("all");
    } else {
      setExpandedCategory(category as MemberFilterCategory);
      // Set to first internal filter or category default
      const categoryData = filterCategories.find((c) => c.category === category);
      if (categoryData?.internalFilters && categoryData.internalFilters.length > 0) {
        onChange(categoryData.internalFilters[0].value);
      } else if (category === "all") {
        onChange("all");
      } else {
        onChange(category as MemberFilterValue);
      }
    }
  };

  const handleInternalFilterClick = (filterValue: MemberFilterValue) => {
    onChange(filterValue);
  };

  const handlePtClick = () => {
    if (onPtFilterChange) {
      onPtFilterChange(!ptFilterActive);
      if (!ptFilterActive) {
        onChange("all");
      }
    }
  };

  const currentCategory = getCategoryFromValue(value);

  return (
    <div className="space-y-3">
      {/* Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {filterCategories.map((category) => {
          const isExpanded = expandedCategory === category.category;
          const isActive = currentCategory === category.category && !ptFilterActive;

          return (
            <Card
              key={category.category}
              className={cn(
                "border transition-all cursor-pointer hover:shadow-md",
                isActive && category.borderColor,
                isExpanded && "border-2 shadow-sm",
                isActive && "shadow-sm"
              )}
              onClick={() => handleCategoryClick(category.category)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", category.bgColor, category.color)}>
                      {category.icon}
                    </div>
                  </div>
                  {category.internalFilters && category.internalFilters.length > 1 && (
                    isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )
                  )}
                </div>
                <div>
                  <span className="font-semibold text-xs block">{category.label}</span>
                  {counts && (
                    <span className={cn("text-xs font-medium", category.color)}>
                      {category.category === "all" && counts.all !== undefined && `${counts.all}`}
                      {category.category === "active" && counts.active !== undefined && `${counts.active}`}
                      {category.category === "expiring_soon" && counts.expiring_soon !== undefined && `${counts.expiring_soon}`}
                      {category.category === "expired" && counts.expired !== undefined && `${counts.expired}`}
                      {category.category === "inactive" && counts.inactive !== undefined && `${counts.inactive}`}
                    </span>
                  )}
                </div>

                {/* Internal Filters */}
                {isExpanded && category.internalFilters && category.internalFilters.length > 1 && (
                  <div className="mt-2 pt-2 border-t space-y-1">
                    {category.internalFilters.map((filter) => {
                      const isSelected = value === filter.value;
                      return (
                        <Button
                          key={filter.value}
                          variant={isSelected ? "default" : "ghost"}
                          size="sm"
                          className={cn(
                            "w-full justify-start text-xs h-7 font-medium",
                            isSelected && "bg-primary text-primary-foreground shadow-sm"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInternalFilterClick(filter.value);
                          }}
                        >
                          {filter.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* PT Filter Card */}
        <Card
          className={cn(
            "border transition-all cursor-pointer hover:shadow-md",
            ptFilterActive && "border-warning/50 border-2 shadow-sm bg-warning/5"
          )}
          onClick={handlePtClick}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "p-1.5 rounded-lg",
                ptFilterActive ? "bg-warning text-warning-foreground" : "bg-warning/10 text-warning"
              )}>
                <Dumbbell className="w-5 h-5" />
              </div>
            </div>
            <div>
              <span className="font-semibold text-xs block">Personal Training</span>
              {counts && (
                <span className="text-xs font-medium text-warning">
                  {counts.with_pt || 0} with PT
                </span>
              )}
            </div>
            {ptFilterActive && (
              <div className="mt-2 pt-2 border-t space-y-1">
                <Button
                  variant={value === "active" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("active");
                  }}
                >
                  With PT
                </Button>
                <Button
                  variant={value === "inactive" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("inactive");
                  }}
                >
                  Without PT
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
