import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useState } from "react";
import { Download, Search, IndianRupee, Users, UserPlus } from "lucide-react";
import { exportToExcel } from "@/utils/exportToExcel";
import { toast } from "@/components/ui/sonner";
import { AdminEventRegisterDialog } from "./AdminEventRegisterDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: any;
}

export function EventRegistrationsDialog({ open, onOpenChange, event }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [registerOpen, setRegisterOpen] = useState(false);

  const isMultiSelect = event?.selection_mode === "multiple";

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["event-registrations", event?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registrations")
        .select("*, event_pricing_options(name, price)")
        .eq("event_id", event.id)
        .order("registered_at", { ascending: false });
      if (error) throw error;

      if (data && data.length > 0) {
        const regIds = data.map((r: any) => r.id);
        const { data: items } = await supabase
          .from("event_registration_items")
          .select("*, event_pricing_options:pricing_option_id(name, price)")
          .in("registration_id", regIds);
        const itemsMap: Record<string, any[]> = {};
        (items || []).forEach((item: any) => {
          if (!itemsMap[item.registration_id]) itemsMap[item.registration_id] = [];
          itemsMap[item.registration_id].push(item);
        });
        return data.map((r: any) => ({ ...r, registration_items: itemsMap[r.id] || [] }));
      }

      return (data || []).map((r: any) => ({ ...r, registration_items: [] }));
    },
    enabled: !!event?.id && open,
  });

  const filtered = registrations.filter((r: any) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search);
    const matchStatus = statusFilter === "all" || r.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = registrations
    .filter((r: any) => r.payment_status === "success")
    .reduce((sum: number, r: any) => sum + Number(r.amount_paid || 0), 0);

  const handleExport = () => {
    if (filtered.length === 0) { toast.error("No data to export"); return; }
    const exportData = filtered.map((r: any) => {
      const itemNames = isMultiSelect && r.registration_items?.length > 0
        ? r.registration_items.map((i: any) => i.event_pricing_options?.name || "Item").join(", ")
        : r.event_pricing_options?.name || "-";
      return {
        Name: r.name,
        Phone: r.phone,
        Email: r.email || "-",
        [isMultiSelect ? "Selected Items" : "Pricing Option"]: itemNames,
        "Amount Paid": `₹${r.amount_paid}`,
        "Payment Status": r.payment_status,
        "Registered At": format(new Date(r.registered_at), "dd/MM/yyyy hh:mm a"),
      };
    });
    exportToExcel(exportData, `${event.title}_registrations`);
    toast.success("Exported successfully");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center justify-between">
            <span>{event.title} — Registrations</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 space-y-3">
          {/* Stats */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 text-accent">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">{registrations.filter((r: any) => r.payment_status === "success").length} Registered</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <IndianRupee className="w-4 h-4" />
              <span className="text-sm font-medium">₹{totalRevenue.toLocaleString()} Revenue</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/phone..." className="pl-9 rounded-xl h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 rounded-xl h-9"><SelectValue /></SelectTrigger>
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

        <ScrollArea className="max-h-[50vh] px-6 pb-6">
          {isLoading ? (
            <div className="animate-pulse space-y-2 py-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/50 rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No registrations found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>{isMultiSelect ? "Items" : "Pricing"}</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const itemNames = isMultiSelect && r.registration_items?.length > 0
                    ? r.registration_items.map((i: any) => i.event_pricing_options?.name || "Item").join(", ")
                    : r.event_pricing_options?.name || "-";
                  return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell className="max-w-[150px]">
                      <span className="text-xs truncate block" title={itemNames}>{itemNames}</span>
                    </TableCell>
                    <TableCell>₹{r.amount_paid}</TableCell>
                    <TableCell>
                      <Badge variant={r.payment_status === "success" ? "default" : r.payment_status === "pending" ? "secondary" : "destructive"} className="text-[10px]">
                        {r.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.registered_at), "dd MMM, hh:mm a")}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {registerOpen && (
          <AdminEventRegisterDialog
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            event={event}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
