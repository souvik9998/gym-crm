import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import {
  ArrowLeft, Calendar, MapPin, Users, IndianRupee, Download, Search,
  UserPlus, Edit2, Trash2, QrCode, Copy, Eye,
} from "lucide-react";
import { exportToExcel } from "@/utils/exportToExcel";
import { AdminEventRegisterDialog } from "@/components/admin/events/AdminEventRegisterDialog";
import { EventQRDialog } from "@/components/admin/events/EventQRDialog";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteReg, setDeleteReg] = useState<any>(null);
  const [editReg, setEditReg] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_pricing_options(*), event_custom_fields(*)")
        .eq("id", eventId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: ["event-registrations", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registrations")
        .select("*, event_pricing_options(name, price)")
        .eq("event_id", eventId!)
        .order("registered_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (regId: string) => {
      const { error } = await supabase.from("event_registrations").delete().eq("id", regId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-registrations", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Registration removed");
      setDeleteReg(null);
    },
    onError: (err: any) => toast.error("Failed to remove", { description: err.message }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editReg) return;
      const { error } = await supabase
        .from("event_registrations")
        .update({
          name: editName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || null,
        })
        .eq("id", editReg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-registrations", eventId] });
      toast.success("Registration updated");
      setEditReg(null);
    },
    onError: (err: any) => toast.error("Failed to update", { description: err.message }),
  });

  const openEditDialog = (reg: any) => {
    setEditReg(reg);
    setEditName(reg.name);
    setEditPhone(reg.phone);
    setEditEmail(reg.email || "");
  };

  const filtered = registrations.filter((r: any) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search);
    const matchStatus = statusFilter === "all" || r.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = registrations
    .filter((r: any) => r.payment_status === "success")
    .reduce((sum: number, r: any) => sum + Number(r.amount_paid || 0), 0);

  const paidCount = registrations.filter((r: any) => r.payment_status === "success").length;

  const totalCapacity = (event?.event_pricing_options || []).reduce(
    (sum: number, p: any) => sum + (p.capacity_limit || 0), 0
  );

  const handleExport = () => {
    if (filtered.length === 0) { toast.error("No data to export"); return; }
    const exportData = filtered.map((r: any) => ({
      Name: r.name,
      Phone: r.phone,
      Email: r.email || "-",
      "Pricing Option": r.event_pricing_options?.name || "-",
      "Amount Paid": `₹${r.amount_paid}`,
      "Payment Status": r.payment_status,
      "Registered At": format(new Date(r.registered_at), "dd/MM/yyyy hh:mm a"),
    }));
    exportToExcel(exportData, `${event?.title}_registrations`);
    toast.success("Exported successfully");
  };

  const copyEventLink = () => {
    if (!eventId) return;
    navigator.clipboard.writeText(`${window.location.origin}/event/${eventId}`);
    toast.success("Event link copied!");
  };

  if (eventLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted/50 rounded animate-pulse" />
        <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin/events")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Events
        </Button>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Event not found</CardContent></Card>
      </div>
    );
  }

  const isCompleted = event.status === "completed";
  const eventDate = new Date(event.event_date);
  const isPast = eventDate < new Date();

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/events")} className="gap-1.5 rounded-xl">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>

      {/* Event Info Card */}
      <Card className="border border-border/40 overflow-hidden">
        {event.banner_image_url && (
          <div className="h-40 lg:h-56 overflow-hidden">
            <img src={event.banner_image_url} alt={event.title} className="w-full h-full object-cover" />
          </div>
        )}
        <CardContent className="p-4 lg:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl lg:text-2xl font-bold text-foreground">{event.title}</h1>
                <Badge className={`text-xs px-2 py-0.5 ${statusColors[event.status]}`}>{event.status}</Badge>
                {isPast && event.status !== "completed" && (
                  <Badge variant="secondary" className="text-xs">Past</Badge>
                )}
              </div>
              {event.description && <p className="text-sm text-muted-foreground max-w-2xl">{event.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5 rounded-xl h-8 text-xs">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQrOpen(true)} className="gap-1.5 rounded-xl h-8 text-xs">
                <QrCode className="w-3.5 h-3.5" /> QR
              </Button>
              <Button size="sm" variant="outline" onClick={copyEventLink} className="gap-1.5 rounded-xl h-8 text-xs">
                <Copy className="w-3.5 h-3.5" /> Copy Link
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{format(eventDate, "dd MMM yyyy, hh:mm a")}</span>
              {event.event_end_date && <span>— {format(new Date(event.event_end_date), "dd MMM yyyy, hh:mm a")}</span>}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> <span>{event.location}</span>
              </div>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 text-accent">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">{paidCount} Registered{totalCapacity > 0 ? ` / ${totalCapacity}` : ""}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <IndianRupee className="w-4 h-4" />
              <span className="text-sm font-medium">₹{totalRevenue.toLocaleString()} Revenue</span>
            </div>
            {(event.event_pricing_options || []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 text-muted-foreground text-xs">
                <span className="font-medium">{p.name}</span>
                <span>₹{p.price}</span>
                {p.capacity_limit > 0 && <span>({p.slots_filled}/{p.capacity_limit})</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Registrations Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {isCompleted || isPast ? "Event Members" : "Registrations"}
          </h2>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/phone..." className="pl-9 rounded-xl h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 rounded-xl h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleExport} className="h-9 rounded-xl gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button size="sm" onClick={() => setRegisterOpen(true)} className="h-9 rounded-xl gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Register
            </Button>
          </div>
        </div>

        <Card className="border border-border/40">
          <CardContent className="p-0">
            {regsLoading ? (
              <div className="animate-pulse space-y-2 p-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/50 rounded" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                {registrations.length === 0 ? "No registrations yet" : "No matching registrations"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead>Pricing</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.phone}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{r.email || "-"}</TableCell>
                        <TableCell>{r.event_pricing_options?.name || "-"}</TableCell>
                        <TableCell>₹{r.amount_paid}</TableCell>
                        <TableCell>
                          <Badge
                            variant={r.payment_status === "success" ? "default" : r.payment_status === "pending" ? "secondary" : "destructive"}
                            className="text-[10px]"
                          >
                            {r.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.registered_at), "dd MMM, hh:mm a")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditDialog(r)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteReg(r)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Registration Dialog */}
      <Dialog open={!!editReg} onOpenChange={(open) => !open && setEditReg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Registration</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="rounded-xl mt-1" maxLength={10} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="rounded-xl mt-1" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReg(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editName.trim() || !editPhone.trim()}
              className="rounded-xl"
            >
              {editMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteReg}
        onOpenChange={() => setDeleteReg(null)}
        title="Remove Registration"
        description={`Remove "${deleteReg?.name}" from this event? This action cannot be undone.`}
        onConfirm={() => deleteReg && deleteMutation.mutate(deleteReg.id)}
        confirmText="Remove"
        variant="destructive"
      />

      {/* Register Dialog */}
      {registerOpen && event && (
        <AdminEventRegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} event={event} />
      )}

      {/* QR Dialog */}
      {qrOpen && event && (
        <EventQRDialog open={qrOpen} onOpenChange={() => setQrOpen(false)} event={event} />
      )}

      {/* Edit Event Dialog */}
      <CreateEventDialog
        open={editOpen}
        onOpenChange={(open) => !open && setEditOpen(false)}
        editEvent={editOpen ? event : null}
      />
    </div>
  );
}
