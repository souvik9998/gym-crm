import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useTenantPrimaryDomain } from "@/hooks/useTenantPrimaryDomain";
import { buildPublicUrl } from "@/lib/publicUrl";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { Plus, Search, Calendar, MapPin, Users, IndianRupee, Eye, Edit2, Trash2, QrCode, Copy, UserPlus } from "lucide-react";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";
import { EventQRDialog } from "@/components/admin/events/EventQRDialog";
import { AdminEventRegisterDialog } from "@/components/admin/events/AdminEventRegisterDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function Events() {
  const isLegacyPlaceholderOption = (option: any, allOptions: any[]) => {
    if (allOptions.length <= 1) return false;
    const normalizedName = String(option?.name || "").trim().toLowerCase();
    if (normalizedName !== "general") return false;

    return allOptions.some((other) =>
      other?.id !== option?.id &&
      other?.price === option?.price &&
      other?.capacity_limit === option?.capacity_limit
    );
  };
  const { currentBranch } = useBranch();
  const { data: customDomain } = useTenantPrimaryDomain(currentBranch?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<any>(null);
  const [qrEvent, setQrEvent] = useState<any>(null);
  const [deleteEvent, setDeleteEvent] = useState<any>(null);
  const [registerEvent, setRegisterEvent] = useState<any>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      const { data, error } = await supabase
        .from("events")
        .select("*, event_pricing_options(*), event_custom_fields(*), event_registrations(id, payment_status)")
        .eq("branch_id", currentBranch.id)
        .order("event_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentBranch?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      // Get event name before deletion for logging
      const eventToDelete = events.find((e: any) => e.id === eventId);
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
      return eventToDelete;
    },
    onSuccess: (deletedEvent: any) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted");
      setDeleteEvent(null);

      const desc = `${isStaffLoggedIn ? `Staff "${staffUser?.fullName}"` : "Admin"} deleted event "${deletedEvent?.title || "Unknown"}"`;
      if (isStaffLoggedIn && staffUser) {
        logStaffActivity({
          category: "events", type: "event_deleted", description: desc,
          entityType: "events", entityName: deletedEvent?.title,
          branchId: currentBranch?.id, staffId: staffUser.id, staffName: staffUser.fullName, staffPhone: staffUser.phone,
        });
      } else if (isAdmin) {
        logAdminActivity({
          category: "events", type: "event_deleted", description: desc,
          entityType: "events", entityName: deletedEvent?.title, branchId: currentBranch?.id,
        });
      }
    },
    onError: (err: any) => toast.error("Failed to delete", { description: err.message }),
  });

  const filtered = events.filter((e: any) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const getEventStats = (event: any) => {
    const regs = event.event_registrations || [];
    const visiblePricingOptions = (event.event_pricing_options || []).filter(
      (p: any) => !isLegacyPlaceholderOption(p, event.event_pricing_options || [])
    );
    const totalRegs = regs.length;
    const paidRegs = regs.filter((r: any) => r.payment_status === "success").length;
    const totalCapacity = visiblePricingOptions.reduce(
      (sum: number, p: any) => sum + (p.capacity_limit || 0), 0
    );
    return { totalRegs, paidRegs, totalCapacity, visiblePricingOptions };
  };

  const copyEventLink = (event: any) => {
    const slug = event.slug || event.id;
    const url = buildPublicUrl(`/event/${slug}`, customDomain?.hostname);
    navigator.clipboard.writeText(url);
    toast.success("Event link copied!");
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Events</h1>
          <p className="text-sm text-muted-foreground">Create and manage gym events</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-xl gap-2">
          <Plus className="w-4 h-4" /> Create Event
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border border-border/40">
              <CardContent className="p-5">
                <div className="animate-pulse space-y-3">
                  <div className="h-32 bg-muted/50 rounded-xl" />
                  <div className="h-5 bg-muted/50 rounded w-3/4" />
                  <div className="h-4 bg-muted/50 rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-border/40">
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No events yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first event to get started</p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="rounded-xl gap-2">
              <Plus className="w-4 h-4" /> Create Event
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((event: any) => {
            const { paidRegs, totalCapacity, visiblePricingOptions } = getEventStats(event);
            return (
              <Card
                key={event.id}
                className="border border-border/40 hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                onClick={() => navigate(`/admin/events/${event.id}`)}
              >
                {event.banner_image_url && (
                  <div className="h-36 overflow-hidden">
                    <img
                      src={event.banner_image_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground line-clamp-1">{event.title}</h3>
                    <Badge className={`text-[10px] px-2 py-0.5 ${statusColors[event.status]}`}>
                      {event.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{format(new Date(event.event_date), "dd MMM yyyy, hh:mm a")}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{paidRegs} registered</span>
                        {totalCapacity > 0 && <span className="text-xs">/ {totalCapacity}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IndianRupee className="w-3.5 h-3.5" />
                          <span>
                            {visiblePricingOptions
                              .map((p: any) => `₹${p.price}`)
                              .join(" / ") || "Free"}
                          </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/40 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setRegisterEvent(event)}>
                      <UserPlus className="w-3.5 h-3.5" /> Register
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/admin/events/${event.id}`)}>
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setEditEvent(event)}>
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setQrEvent(event)}>
                      <QrCode className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => copyEventLink(event)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => setDeleteEvent(event)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateEventDialog
        open={createOpen || !!editEvent}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setEditEvent(null); }
        }}
        editEvent={editEvent}
      />


      {qrEvent && (
        <EventQRDialog
          open={!!qrEvent}
          onOpenChange={() => setQrEvent(null)}
          event={qrEvent}
        />
      )}

      <ConfirmDialog
        open={!!deleteEvent}
        onOpenChange={() => setDeleteEvent(null)}
        title="Delete Event"
        description={`Are you sure you want to delete "${deleteEvent?.title}"? This will also delete all registrations.`}
        onConfirm={() => deleteEvent && deleteMutation.mutate(deleteEvent.id)}
        confirmText="Delete"
        variant="destructive"
      />

      {registerEvent && (
        <AdminEventRegisterDialog
          open={!!registerEvent}
          onOpenChange={() => setRegisterEvent(null)}
          event={registerEvent}
        />
      )}
    </div>
  );
}
