import { useNavigate } from "react-router-dom";
import { BellIcon } from "@heroicons/react/24/outline";
import { AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAdminNotifications, type AdminNotification } from "@/hooks/useAdminNotifications";
import { cn } from "@/lib/utils";
import { useState } from "react";

const categoryFilters = ["all", "plan", "limit", "member"] as const;
type CategoryFilter = (typeof categoryFilters)[number];

const categoryLabels: Record<CategoryFilter, string> = {
  all: "View all",
  plan: "Plan",
  limit: "Limits",
  member: "Members",
};

function NotificationIcon({ type }: { type: AdminNotification["type"] }) {
  if (type === "danger") return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />;
  if (type === "warning") return <AlertTriangle className="h-4 w-4 text-accent-foreground flex-shrink-0" />;
  return <Info className="h-4 w-4 text-primary flex-shrink-0" />;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, dangerCount, totalCount } = useAdminNotifications();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [open, setOpen] = useState(false);

  const filtered = filter === "all"
    ? notifications
    : notifications.filter(n => n.category === filter);

  const filterCounts: Record<CategoryFilter, number> = {
    all: totalCount,
    plan: notifications.filter(n => n.category === "plan").length,
    limit: notifications.filter(n => n.category === "limit").length,
    member: notifications.filter(n => n.category === "member").length,
  };

  const handleClick = (n: AdminNotification) => {
    if (n.actionRoute) {
      navigate(n.actionRoute);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground hover:bg-muted h-7 w-7 md:h-9 md:w-9"
          title="Notifications"
        >
          <BellIcon className="w-4 h-4 md:w-5 md:h-5" />
          {dangerCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {dangerCount > 9 ? "9+" : dangerCount}
            </span>
          )}
          {dangerCount === 0 && totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 md:w-96 p-0 bg-card border shadow-xl rounded-xl"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {categoryFilters.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full transition-colors font-medium",
                filter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {categoryLabels[cat]}
              {filterCounts[cat] > 0 && (
                <span className="ml-1 text-[10px]">{filterCounts[cat]}</span>
              )}
            </button>
          ))}
        </div>

        <Separator />

        {/* Notification List */}
        <ScrollArea className="max-h-80">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors",
                    n.type === "danger" && "bg-destructive/5"
                  )}
                >
                  <div className="mt-0.5">
                    <NotificationIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.description}</p>
                  </div>
                  {n.actionRoute && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
