import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, AlertCircle, Info, ChevronRight, Send, CreditCard, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminNotifications, type AdminNotification } from "@/hooks/useAdminNotifications";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

const categoryFilters = ["all", "plan", "limit", "member"] as const;
type CategoryFilter = (typeof categoryFilters)[number];

const categoryLabels: Record<CategoryFilter, string> = {
  all: "All",
  plan: "Plan",
  limit: "Limits",
  member: "Members",
};

function NotificationIcon({ type }: { type: AdminNotification["type"] }) {
  if (type === "danger") return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />;
  if (type === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  return <Info className="h-4 w-4 text-primary flex-shrink-0" />;
}

function NotificationBadge({ type }: { type: AdminNotification["type"] }) {
  if (type === "danger") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Urgent</Badge>;
  if (type === "warning") return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-400 text-amber-600">Warning</Badge>;
  return null;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, dangerCount, totalCount } = useAdminNotifications();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [open, setOpen] = useState(false);
  const [planDialog, setPlanDialog] = useState<{ open: boolean; notification: AdminNotification | null }>({ open: false, notification: null });
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; notification: AdminNotification | null }>({ open: false, notification: null });
  const [sendingReminder, setSendingReminder] = useState(false);

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
    if (n.category === "plan") {
      // Show plan expiry dialog
      setOpen(false);
      setPlanDialog({ open: true, notification: n });
    } else if (n.category === "member") {
      // Show member reminder dialog
      setOpen(false);
      setMemberDialog({ open: true, notification: n });
    } else if (n.actionRoute) {
      navigate(n.actionRoute);
      setOpen(false);
    }
  };

  const handleSendReminder = async () => {
    setSendingReminder(true);
    try {
      // Trigger manual WhatsApp reminder via the daily-whatsapp-job
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Please log in to send reminders");
        return;
      }

      const { getEdgeFunctionUrl, SUPABASE_ANON_KEY } = await import("@/lib/supabaseConfig");
      const response = await fetch(getEdgeFunctionUrl("daily-whatsapp-job"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ manual: true }),
      });

      if (response.ok) {
        toast.success("Reminders sent", { description: "WhatsApp reminders have been queued for expiring/expired members." });
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error("Failed to send reminders", { description: errorData?.error || "Please try again later." });
      }
    } catch (error) {
      toast.error("Failed to send reminders", { description: "Please try again later." });
    } finally {
      setSendingReminder(false);
      setMemberDialog({ open: false, notification: null });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground hover:bg-muted h-7 w-7 md:h-9 md:w-9"
            title="Notifications"
          >
            <Bell className="w-4 h-4 md:w-5 md:h-5" />
            {dangerCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 ring-2 ring-card">
                {dangerCount > 9 ? "9+" : dangerCount}
              </span>
            )}
            {dangerCount === 0 && totalCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1 ring-2 ring-card">
                {totalCount > 9 ? "9+" : totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 md:w-96 p-0 bg-card border shadow-xl rounded-xl overflow-hidden"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
            </div>
            {totalCount > 0 && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                {totalCount} alert{totalCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 px-3 py-2 bg-muted/20">
            {categoryFilters.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-all font-medium",
                  filter === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {categoryLabels[cat]}
                {filterCounts[cat] > 0 && (
                  <span className={cn(
                    "ml-1.5 text-[10px] font-bold",
                    filter === cat ? "opacity-80" : "text-muted-foreground"
                  )}>
                    {filterCounts[cat]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <Separator />

          {/* Notification List */}
          <ScrollArea className="max-h-80">
            {filtered.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors group",
                      n.type === "danger"
                        ? "bg-destructive/5 hover:bg-destructive/10"
                        : n.type === "warning"
                        ? "hover:bg-amber-50 dark:hover:bg-amber-950/10"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="mt-0.5 p-1.5 rounded-full bg-muted/50 group-hover:bg-muted">
                      <NotificationIcon type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-foreground leading-tight truncate">{n.title}</p>
                        <NotificationBadge type={n.type} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{n.description}</p>
                      {n.category === "member" && (
                        <p className="text-[11px] text-primary mt-1 font-medium">Tap to send reminder →</p>
                      )}
                      {n.category === "plan" && (
                        <p className="text-[11px] text-primary mt-1 font-medium">Tap to view options →</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-1 group-hover:text-foreground transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Plan Expiry Dialog */}
      <Dialog open={planDialog.open} onOpenChange={(o) => setPlanDialog({ open: o, notification: o ? planDialog.notification : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                planDialog.notification?.type === "danger" ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/20"
              )}>
                {planDialog.notification?.type === "danger" 
                  ? <AlertCircle className="h-6 w-6 text-destructive" />
                  : <AlertTriangle className="h-6 w-6 text-amber-500" />
                }
              </div>
              <div>
                <DialogTitle className="text-lg">{planDialog.notification?.title}</DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              {planDialog.notification?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-muted/80"
              onClick={() => {
                // Open WhatsApp or email to super admin
                window.open("mailto:support@example.com", "_blank");
              }}
            >
              <Phone className="h-5 w-5 text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Contact Admin</p>
                <p className="text-[10px] text-muted-foreground">Request renewal</p>
              </div>
            </Button>
            <Button
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setPlanDialog({ open: false, notification: null });
                navigate("/admin/settings?tab=plan");
              }}
            >
              <CreditCard className="h-5 w-5" />
              <div className="text-center">
                <p className="text-sm font-medium">View Plan</p>
                <p className="text-[10px] opacity-80">See details & usage</p>
              </div>
            </Button>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setPlanDialog({ open: false, notification: null })}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Expiry Reminder Dialog */}
      <Dialog open={memberDialog.open} onOpenChange={(o) => setMemberDialog({ open: o, notification: o ? memberDialog.notification : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                memberDialog.notification?.type === "danger" ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/20"
              )}>
                {memberDialog.notification?.type === "danger"
                  ? <AlertCircle className="h-6 w-6 text-destructive" />
                  : <AlertTriangle className="h-6 w-6 text-amber-500" />
                }
              </div>
              <div>
                <DialogTitle className="text-lg">{memberDialog.notification?.title}</DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              {memberDialog.notification?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-muted/80"
              onClick={() => {
                setMemberDialog({ open: false, notification: null });
                navigate("/admin/dashboard");
              }}
            >
              <Info className="h-5 w-5 text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">View Members</p>
                <p className="text-[10px] text-muted-foreground">See who's expiring</p>
              </div>
            </Button>
            <Button
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={handleSendReminder}
              disabled={sendingReminder}
            >
              <Send className="h-5 w-5" />
              <div className="text-center">
                <p className="text-sm font-medium">{sendingReminder ? "Sending..." : "Send Reminder"}</p>
                <p className="text-[10px] opacity-80">Via WhatsApp</p>
              </div>
            </Button>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setMemberDialog({ open: false, notification: null })}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
