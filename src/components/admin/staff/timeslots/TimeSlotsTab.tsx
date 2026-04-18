import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { PlusIcon, PencilIcon, TrashIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { TimeSlotDetailDialog } from "./TimeSlotDetailDialog";

interface TimeSlot {
  id: string;
  trainer_id: string;
  branch_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  is_recurring: boolean;
  recurring_days: number[] | null;
  status: string;
  created_at: string;
  trainer_name?: string;
  member_count?: number;
}

interface TimeSlotsTabProps {
  trainers: Staff[];
  currentBranch: any;
  /** Restrict listing to a single trainer (staff.id). Used for "assigned only" trainers. */
  restrictedTrainerId?: string | null;
  /** Permission flags (defaults true → admin behaviour). */
  canCreate?: boolean;
  canEditDelete?: boolean;
  canViewMembers?: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const TimeSlotsTab = ({
  trainers,
  currentBranch,
  restrictedTrainerId = null,
  canCreate = true,
  canEditDelete = true,
  canViewMembers = true,
}: TimeSlotsTabProps) => {
  const isCompact = useIsTabletOrBelow();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [detailSlot, setDetailSlot] = useState<TimeSlot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const [form, setForm] = useState({
    trainer_id: "",
    start_time: "06:00",
    end_time: "07:00",
    capacity: 10,
    is_recurring: false,
    recurring_days: [] as number[],
  });

  const fetchSlots = async () => {
    if (!currentBranch?.id) return;
    setIsLoading(true);
    try {
      const { data: slotsData } = await supabase
        .from("trainer_time_slots")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .order("start_time");

      if (slotsData) {
        const slotIds = slotsData.map(s => s.id);
        let memberCounts: Record<string, number> = {};
        if (slotIds.length > 0) {
          const { data: members } = await supabase
            .from("time_slot_members")
            .select("time_slot_id")
            .in("time_slot_id", slotIds);
          if (members) {
            members.forEach(m => {
              memberCounts[m.time_slot_id] = (memberCounts[m.time_slot_id] || 0) + 1;
            });
          }
        }

        const enriched = slotsData.map(slot => ({
          ...slot,
          trainer_name: trainers.find(t => t.id === slot.trainer_id)?.full_name || "Unknown",
          member_count: memberCounts[slot.id] || 0,
        }));
        setSlots(enriched);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSlots(); }, [currentBranch?.id, trainers]);

  const resetForm = () => {
    setForm({ trainer_id: "", start_time: "06:00", end_time: "07:00", capacity: 10, is_recurring: false, recurring_days: [] });
    setEditingSlot(null);
  };

  const handleOpenCreate = () => { resetForm(); setDialogOpen(true); };

  const handleOpenEdit = (slot: TimeSlot, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSlot(slot);
    setForm({
      trainer_id: slot.trainer_id,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      capacity: slot.capacity,
      is_recurring: slot.is_recurring,
      recurring_days: slot.recurring_days || [],
    });
    setDialogOpen(true);
  };

  const handleCardClick = (slot: TimeSlot) => {
    setDetailSlot(slot);
    setDetailOpen(true);
  };

  const handleSave = async () => {
    if (!form.trainer_id) { toast.error("Please select a trainer"); return; }
    if (!currentBranch?.id) return;

    const payload = {
      trainer_id: form.trainer_id,
      branch_id: currentBranch.id,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: form.capacity,
      is_recurring: form.is_recurring,
      recurring_days: form.is_recurring ? form.recurring_days : null,
    };

    const trainerName = trainers.find(t => t.id === form.trainer_id)?.full_name || "Unknown";

    if (editingSlot) {
      const { error } = await supabase.from("trainer_time_slots").update(payload).eq("id", editingSlot.id);
      if (error) { toast.error("Failed to update", { description: error.message }); return; }
      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_updated",
        description: `Updated time slot for ${trainerName} (${form.start_time} - ${form.end_time})`,
        entityType: "time_slot",
        entityId: editingSlot.id,
        entityName: trainerName,
        newValue: payload,
        branchId: currentBranch.id,
      });
      toast.success("Time slot updated");
    } else {
      const { data: inserted, error } = await supabase.from("trainer_time_slots").insert(payload).select("id").single();
      if (error) { toast.error("Failed to create", { description: error.message }); return; }
      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_created",
        description: `Created time slot for ${trainerName} (${form.start_time} - ${form.end_time}, capacity: ${form.capacity})`,
        entityType: "time_slot",
        entityId: inserted?.id,
        entityName: trainerName,
        newValue: payload,
        branchId: currentBranch.id,
      });
      toast.success("Time slot created");
    }

    setDialogOpen(false);
    resetForm();
    fetchSlots();
  };

  const handleDelete = (slot: TimeSlot, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      open: true,
      title: "Delete Time Slot",
      description: `Delete ${slot.trainer_name}'s slot (${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)})? This will also remove all member assignments.`,
      onConfirm: async () => {
        await supabase.from("trainer_time_slots").delete().eq("id", slot.id);
        await logAdminActivity({
          category: "time_slots",
          type: "time_slot_deleted",
          description: `Deleted time slot for ${slot.trainer_name} (${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)})`,
          entityType: "time_slot",
          entityId: slot.id,
          entityName: slot.trainer_name,
          branchId: currentBranch?.id,
        });
        toast.success("Time slot deleted");
        fetchSlots();
      },
    });
  };

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      recurring_days: prev.recurring_days.includes(day)
        ? prev.recurring_days.filter(d => d !== day)
        : [...prev.recurring_days, day],
    }));
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base lg:text-lg font-semibold">Time Slots</h3>
          <p className="text-xs lg:text-sm text-muted-foreground">Manage trainer time slots and capacity</p>
        </div>
        <Button size="sm" onClick={handleOpenCreate} className="gap-1">
          <PlusIcon className="w-4 h-4" /> Add Slot
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
      ) : slots.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8 text-center">
            <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No time slots created yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleOpenCreate}>Create First Slot</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, index) => {
            const isFull = (slot.member_count || 0) >= slot.capacity;
            return (
              <Card
                key={slot.id}
                className="border-0 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200 animate-fade-in"
                style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
                onClick={() => handleCardClick(slot)}
              >
                <CardHeader className="p-3 lg:p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm lg:text-base">{slot.trainer_name}</CardTitle>
                      <CardDescription className="text-xs">
                        {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      </CardDescription>
                    </div>
                    <Badge className={isFull
                      ? "bg-destructive/10 text-destructive text-[10px]"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"
                    }>
                      {isFull ? "Full" : "Available"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 lg:p-4 pt-0 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Capacity</span>
                    <span className="font-medium">{slot.member_count}/{slot.capacity}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${isFull ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${Math.min(((slot.member_count || 0) / slot.capacity) * 100, 100)}%` }}
                    />
                  </div>
                  {slot.is_recurring && slot.recurring_days && (
                    <div className="flex flex-wrap gap-1">
                      {slot.recurring_days.sort().map(d => (
                        <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0">{DAY_LABELS[d]}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={(e) => handleOpenEdit(slot, e)}>
                      <PencilIcon className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 text-destructive hover:text-destructive" onClick={(e) => handleDelete(slot, e)}>
                      <TrashIcon className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <TimeSlotDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        slot={detailSlot ? {
          id: detailSlot.id,
          trainer_id: detailSlot.trainer_id,
          trainer_name: detailSlot.trainer_name || "Unknown",
          start_time: detailSlot.start_time,
          end_time: detailSlot.end_time,
          capacity: detailSlot.capacity,
          is_recurring: detailSlot.is_recurring,
          recurring_days: detailSlot.recurring_days,
          member_count: detailSlot.member_count || 0,
        } : null}
        branchId={currentBranch?.id || ""}
        onUpdated={fetchSlots}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="text-base">{editingSlot ? "Edit Time Slot" : "Create Time Slot"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Trainer *</Label>
              <Select value={form.trainer_id} onValueChange={v => setForm({ ...form, trainer_id: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select trainer" /></SelectTrigger>
                <SelectContent>
                  {trainers.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Time *</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time *</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacity</Label>
              <Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} className="h-9 text-sm" />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm font-medium">Recurring</p>
                <p className="text-xs text-muted-foreground">Repeat on specific days</p>
              </div>
              <Switch checked={form.is_recurring} onCheckedChange={v => setForm({ ...form, is_recurring: v })} />
            </div>
            {form.is_recurring && (
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((day, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={form.recurring_days.includes(i) ? "default" : "outline"}
                    className="h-7 text-xs px-2.5"
                    onClick={() => toggleDay(i)}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>{editingSlot ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="destructive"
      />
    </div>
  );
};
