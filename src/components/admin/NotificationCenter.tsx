import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, AlertCircle, Info, ChevronRight, Send, CreditCard, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  if (type === "danger") return (
    <div className="h-9 w-9 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
      <AlertCircle className="h-[18px] w-[18px] text-destructive" />
    </div>
  );
  if (type === "warning") return (
    <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
      <AlertTriangle className="h-[18px] w-[18px] text-accent-foreground" />
    </div>
  );
  return (
    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
      <Info className="h-[18px] w-[18px] text-primary" />
    </div>
  );
}

function NotificationBadge({ type }: { type: AdminNotification["type"] }) {
  if (type === "danger") return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-destructive/10 text-destructive tracking-wide uppercase">
      Urgent
    </span>
  );
  if (type === "warning") return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-accent text-accent-foreground tracking-wide uppercase">
      Warning
    </span>
  );
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
      setOpen(false);
      setPlanDialog({ open: true, notification: n });
    } else if (n.category === "member") {
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error("Please log in to send reminders");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/daily-whatsapp-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
            className="relative text-muted-foreground hover:text-foreground hover:bg-muted/60 h-8 w-8 md:h-9 md:w-9 rounded-xl transition-all duration-200"
            title="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {dangerCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 animate-in zoom-in-50 duration-300 border-2 border-card">
                {dangerCount > 9 ? "9+" : dangerCount}
              </span>
            )}
            {dangerCount === 0 && totalCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1 animate-in zoom-in-50 duration-300 border-2 border-card">
                {totalCount > 9 ? "9+" : totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[340px] md:w-[400px] p-0 bg-card/80 backdrop-blur-2xl border border-border/40 shadow-2xl shadow-foreground/5 rounded-2xl overflow-hidden"
          sideOffset={10}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Notifications</h3>
            </div>
            {totalCount > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-muted text-muted-foreground tabular-nums">
                {totalCount} alert{totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 px-4 pb-3">
            {categoryFilters.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg transition-all duration-200 font-medium",
                  filter === cat
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {categoryLabels[cat]}
                {filterCounts[cat] > 0 && (
                  <span className={cn(
                    "ml-1.5 text-[10px] font-bold tabular-nums",
                    filter === cat ? "opacity-70" : "text-muted-foreground"
                  )}>
                    {filterCounts[cat]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="h-px bg-border/40 mx-4" />

          {/* Notification List */}
          <ScrollArea className="max-h-[340px]">
            {filtered.length === 0 ? (
              <div className="py-14 text-center">
                <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-5 h-5 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">No notifications right now</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filtered.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-3 text-left transition-all duration-200 group rounded-xl",
                      n.type === "danger"
                        ? "bg-destructive/5 hover:bg-destructive/8"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <NotificationIcon type={n.type} />
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{n.title}</p>
                        <NotificationBadge type={n.type} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{n.description}</p>
                      {n.category === "member" && (
                        <p className="text-[11px] text-primary mt-1.5 font-medium group-hover:underline">Tap to send reminder →</p>
                      )}
                      {n.category === "plan" && (
                        <p className="text-[11px] text-primary mt-1.5 font-medium group-hover:underline">Tap to view options →</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mt-2.5 group-hover:text-foreground/60 group-hover:translate-x-0.5 transition-all duration-200" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Plan Expiry Dialog */}
      <Dialog open={planDialog.open} onOpenChange={(o) => setPlanDialog({ open: o, notification: o ? planDialog.notification : null })}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl",
                planDialog.notification?.type === "danger" ? "bg-destructive/10" : "bg-accent"
              )}>
                {planDialog.notification?.type === "danger" 
                  ? <AlertCircle className="h-6 w-6 text-destructive" />
                  : <AlertTriangle className="h-6 w-6 text-accent-foreground" />
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
              className="flex flex-col items-center gap-2 h-auto py-4 rounded-xl hover:bg-muted/80"
              onClick={() => {
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
              className="flex flex-col items-center gap-2 h-auto py-4 rounded-xl"
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
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground rounded-xl" onClick={() => setPlanDialog({ open: false, notification: null })}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Expiry Reminder Dialog */}
      <Dialog open={memberDialog.open} onOpenChange={(o) => setMemberDialog({ open: o, notification: o ? memberDialog.notification : null })}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl",
                memberDialog.notification?.type === "danger" ? "bg-destructive/10" : "bg-accent"
              )}>
                {memberDialog.notification?.type === "danger"
                  ? <AlertCircle className="h-6 w-6 text-destructive" />
                  : <AlertTriangle className="h-6 w-6 text-accent-foreground" />
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
              className="flex flex-col items-center gap-2 h-auto py-4 rounded-xl hover:bg-muted/80"
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
              className="flex flex-col items-center gap-2 h-auto py-4 rounded-xl"
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
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground rounded-xl" onClick={() => setMemberDialog({ open: false, notification: null })}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
