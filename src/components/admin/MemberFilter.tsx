import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, UserX, Users } from "lucide-react";

export type MemberFilterCategory = "all" | "active" | "expired" | "inactive" | "expiring_soon";

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
  };
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
    label: "Active Members",
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
    label: "Expiring Soon",
    icon: <Clock className="w-5 h-5" />,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    internalFilters: [
      { value: "expiring_soon", label: "All Expiring" },
      { value: "expiring_2days", label: "Expiring in 2 Days" },
      { value: "expiring_7days", label: "Expiring in 7 Days" },
    ],
  },
  {
    category: "expired",
    label: "Expired Members",
    icon: <XCircle className="w-5 h-5" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    internalFilters: [
      { value: "expired", label: "All Expired" },
      { value: "expired_recent", label: "Recently Expired" },
    ],
  },
  {
    category: "inactive",
    label: "Inactive Members",
    icon: <UserX className="w-5 h-5" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
    internalFilters: [
      { value: "inactive", label: "All Inactive" },
    ],
  },
];

export const MemberFilter = ({ value, onChange, counts }: MemberFilterProps) => {
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

  const currentCategory = getCategoryFromValue(value);

  return (
    <div className="space-y-3">
      {/* Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {filterCategories.map((category) => {
          const isExpanded = expandedCategory === category.category;
          const isActive = currentCategory === category.category;

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
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-lg", category.bgColor, category.color)}>
                      {category.icon}
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-sm block">{category.label}</span>
                      {counts && (
                        <span className={cn("text-xs font-medium mt-0.5 block", category.color)}>
                          {category.category === "all" && counts.all !== undefined && `${counts.all} members`}
                          {category.category === "active" && counts.active !== undefined && `${counts.active} members`}
                          {category.category === "expiring_soon" && counts.expiring_soon !== undefined && `${counts.expiring_soon} members`}
                          {category.category === "expired" && counts.expired !== undefined && `${counts.expired} members`}
                          {category.category === "inactive" && counts.inactive !== undefined && `${counts.inactive} members`}
                        </span>
                      )}
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

                {/* Internal Filters */}
                {isExpanded && category.internalFilters && category.internalFilters.length > 1 && (
                  <div className="mt-3 pt-3 border-t space-y-1.5">
                    {category.internalFilters.map((filter) => {
                      const isSelected = value === filter.value;
                      return (
                        <Button
                          key={filter.value}
                          variant={isSelected ? "default" : "ghost"}
                          size="sm"
                          className={cn(
                            "w-full justify-start text-xs h-8 font-medium",
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
      </div>
    </div>
  );
};
