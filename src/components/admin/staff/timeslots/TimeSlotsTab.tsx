import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import {
  PlusIcon, PencilIcon, TrashIcon, ClockIcon,
  MagnifyingGlassIcon, UserGroupIcon, SparklesIcon,
  CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { TimeSlotDetailDialog } from "./TimeSlotDetailDialog";
import { TrainerSlotsDialog } from "./TrainerSlotsDialog";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

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
  /**
   * Optional fallback name resolver used when `trainers` (restricted by RLS)
   * doesn't contain a slot's trainer (e.g. staff viewing another trainer's slot
   * after RLS hides their staff row). Maps staff.id → full_name.
   */
  trainerNameMap?: Record<string, string>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const TimeSlotsTab = ({
  trainers,
  currentBranch,
  restrictedTrainerId = null,
  canCreate = true,
  canEditDelete = true,
  canViewMembers = true,
  trainerNameMap,
}: TimeSlotsTabProps) => {
  const isCompact = useIsTabletOrBelow();
  const { invalidatePtSubscriptions } = useInvalidateQueries();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [detailSlot, setDetailSlot] = useState<TimeSlot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Trainer-grouped dialog: opened when clicking a trainer card.
  const [activeTrainerId, setActiveTrainerId] = useState<string | null>(null);
  const [trainerDialogOpen, setTrainerDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Filters
  const [filterTrainer, setFilterTrainer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "available" | "full" | "empty">("all");
  const [filterTime, setFilterTime] = useState<"all" | "morning" | "afternoon" | "evening">("all");
  const [filterRecurring, setFilterRecurring] = useState<"all" | "recurring" | "one_time">("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    trainer_id: "",
    start_time: "06:00",
    end_time: "07:00",
    capacity: 10,
    is_recurring: false,
    recurring_days: [] as number[],
  });

  // React Query manages data fetching here so updates DON'T flip the panel
  // back to a full skeleton — `data` stays visible while `isFetching`
  // refreshes in the background (industry-standard stale-while-revalidate).
  // First-load only is gated by `isLoading` (no cached data yet).
  const trainersKey = useMemo(
    () => trainers.map((t) => t.id).sort().join(","),
    [trainers],
  );
  const trainerNameMapKey = useMemo(
    () => (trainerNameMap ? Object.keys(trainerNameMap).sort().join(",") : ""),
    [trainerNameMap],
  );

  const {
    data: slots = [],
    isLoading,
    isFetching,
    refetch: refetchSlots,
  } = useQuery<TimeSlot[]>({
    queryKey: [
      "trainer-time-slots",
      currentBranch?.id,
      restrictedTrainerId,
      trainersKey,
      trainerNameMapKey,
    ],
    queryFn: async (): Promise<TimeSlot[]> => {
      if (!currentBranch?.id) return [];

      let query = supabase
        .from("trainer_time_slots")
        .select("*")
        .eq("branch_id", currentBranch.id);
      if (restrictedTrainerId) query = query.eq("trainer_id", restrictedTrainerId);
      const { data: slotsData } = await query.order("start_time");
      if (!slotsData) return [];

      const slotIds = slotsData.map((s) => s.id);
      const memberCounts: Record<string, number> = {};
      if (slotIds.length > 0) {
        // Source of truth: pt_subscriptions (active + non-expired).
        // Same query the TimeSlotFilterDropdown uses, so counts stay
        // consistent across the app. The legacy time_slot_members
        // table can drift when PT subscriptions expire/cancel without
        // the join row being cleaned up.
        const today = new Date().toISOString().split("T")[0];
        const { data: ptRows } = await supabase
          .from("pt_subscriptions")
          .select("time_slot_id, member_id")
          .in("time_slot_id", slotIds)
          .eq("status", "active")
          .gte("end_date", today);

        if (ptRows) {
          const perSlot: Record<string, Set<string>> = {};
          for (const row of ptRows as any[]) {
            if (!row.time_slot_id) continue;
            (perSlot[row.time_slot_id] ||= new Set()).add(row.member_id);
          }
          for (const [sid, set] of Object.entries(perSlot)) {
            memberCounts[sid] = set.size;
          }
        }
      }

      return slotsData.map((slot) => ({
        ...slot,
        trainer_name:
          trainers.find((t) => t.id === slot.trainer_id)?.full_name ||
          trainerNameMap?.[slot.trainer_id] ||
          "Unknown",
        member_count: memberCounts[slot.id] || 0,
      })) as TimeSlot[];
    },
    enabled: !!currentBranch?.id,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev, // keep showing last data while refetching
  });

  // Refresh helper used after mutations — does NOT flip isLoading,
  // so the UI stays in place while data updates.
  const fetchSlots = () => { refetchSlots(); };

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
    if (!canViewMembers) return;
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
        // Defensive: explicitly null any pt_subscriptions still pointing at this slot.
        // The FK is ON DELETE SET NULL, but doing it client-side guarantees the
        // change is visible immediately to any cached query that reads
        // pt_subscriptions.time_slot_id (slot filters, assigned-member resolvers).
        await supabase
          .from("pt_subscriptions")
          .update({ time_slot_id: null } as any)
          .eq("time_slot_id", slot.id);

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
        // Slot deletion nulls pt_subscriptions.time_slot_id (FK SET NULL).
        // Refresh every dependent surface (filter dropdowns, members table,
        // assigned-member resolvers) so the UI matches reality immediately.
        invalidatePtSubscriptions();
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

  // Derived: filtered slots
  const filteredSlots = useMemo(() => {
    return slots.filter(s => {
      if (filterTrainer !== "all" && s.trainer_id !== filterTrainer) return false;
      const filled = s.member_count || 0;
      const isFull = filled >= s.capacity;
      if (filterStatus === "full" && !isFull) return false;
      if (filterStatus === "available" && isFull) return false;
      if (filterStatus === "empty" && filled !== 0) return false;
      if (filterRecurring === "recurring" && !s.is_recurring) return false;
      if (filterRecurring === "one_time" && s.is_recurring) return false;
      if (filterTime !== "all") {
        const startHour = parseInt(s.start_time.split(":")[0]);
        if (filterTime === "morning" && (startHour < 5 || startHour >= 12)) return false;
        if (filterTime === "afternoon" && (startHour < 12 || startHour >= 17)) return false;
        if (filterTime === "evening" && (startHour < 17 || startHour >= 23)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(s.trainer_name || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [slots, filterTrainer, filterStatus, filterRecurring, filterTime, search]);

  // Group filtered slots by trainer for the per-trainer card view.
  // Each trainer becomes a single card listing all of their slots; clicking it
  // opens the TrainerSlotsDialog where individual slots can be inspected.
  type TrainerGroup = {
    trainer_id: string;
    trainer_name: string;
    slots: TimeSlot[];
    totalCapacity: number;
    totalFilled: number;
    fullCount: number;
    fillPct: number;
  };
  const trainerGroups = useMemo<TrainerGroup[]>(() => {
    const map = new Map<string, TrainerGroup>();
    for (const s of filteredSlots) {
      const key = s.trainer_id;
      let g = map.get(key);
      if (!g) {
        g = {
          trainer_id: s.trainer_id,
          trainer_name: s.trainer_name || "Unknown",
          slots: [],
          totalCapacity: 0,
          totalFilled: 0,
          fullCount: 0,
          fillPct: 0,
        };
        map.set(key, g);
      }
      g.slots.push(s);
      g.totalCapacity += s.capacity;
      g.totalFilled += s.member_count || 0;
      if ((s.member_count || 0) >= s.capacity) g.fullCount += 1;
    }
    const arr = Array.from(map.values()).map((g) => ({
      ...g,
      // Sort slots within a trainer chronologically.
      slots: g.slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
      fillPct:
        g.totalCapacity > 0
          ? Math.min((g.totalFilled / g.totalCapacity) * 100, 100)
          : 0,
    }));
    // Stable trainer-name ordering.
    arr.sort((a, b) => a.trainer_name.localeCompare(b.trainer_name));
    return arr;
  }, [filteredSlots]);

  // Summary stats across all slots (not just filtered)
  const summary = useMemo(() => {
    const total = slots.length;
    const totalCapacity = slots.reduce((sum, s) => sum + s.capacity, 0);
    const totalFilled = slots.reduce((sum, s) => sum + (s.member_count || 0), 0);
    const fullSlots = slots.filter(s => (s.member_count || 0) >= s.capacity).length;
    const availableSeats = totalCapacity - totalFilled;
    const utilization = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;
    const trainersWithSlots = new Set(slots.map(s => s.trainer_id)).size;
    return { total, totalCapacity, totalFilled, fullSlots, availableSeats, utilization, trainersWithSlots };
  }, [slots]);

  // Skeleton component
  const SkeletonGrid = () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card
          key={i}
          className="border-0 shadow-sm animate-fade-in"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
        >
          <CardHeader className="p-3 lg:p-4 pb-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="p-3 lg:p-4 pt-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-8 rounded" />
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-7 flex-1 rounded-md" />
              <Skeleton className="h-7 w-9 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base lg:text-lg font-semibold flex items-center gap-2">
            Time Slots
            {/* Subtle background-refresh indicator: shown ONLY when revalidating
                with cached data already on screen — never causes a layout shift. */}
            {isFetching && !isLoading && (
              <ArrowPathIcon className="w-3.5 h-3.5 text-muted-foreground animate-spin" aria-label="Refreshing" />
            )}
          </h3>
          <p className="text-xs lg:text-sm text-muted-foreground">Manage trainer time slots and capacity</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={handleOpenCreate} className="gap-1">
            <PlusIcon className="w-4 h-4" /> Add Slot
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-full sm:w-64 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
          <SkeletonGrid />
        </>
      ) : slots.length === 0 ? (
        <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 via-background to-purple-500/5 animate-fade-in">
          <CardContent className="py-10 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
              <ClockIcon className="w-7 h-7 text-white" />
            </div>
            <p className="text-sm font-medium">No time slots created yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start by creating slots to organize trainer schedules</p>
            {canCreate && (
              <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={handleOpenCreate}>
                <SparklesIcon className="w-3.5 h-3.5" /> Create First Slot
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 animate-fade-in">
            <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/10 to-primary/5 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <ClockIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Slots</p>
                    <p className="text-lg font-bold leading-tight">{summary.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Seats</p>
                    <p className="text-lg font-bold leading-tight text-emerald-700">{summary.availableSeats}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-500/10 to-rose-500/5 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/15 flex items-center justify-center shrink-0">
                    <ExclamationCircleIcon className="w-5 h-5 text-rose-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Full Slots</p>
                    <p className="text-lg font-bold leading-tight text-rose-700">{summary.fullSlots}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-500/10 to-purple-500/5 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                    <UserGroupIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Utilization</p>
                    <p className="text-lg font-bold leading-tight text-purple-700">{summary.utilization}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center animate-fade-in">
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search trainer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            {!restrictedTrainerId && (
              <Select value={filterTrainer} onValueChange={setFilterTrainer}>
                <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trainers</SelectItem>
                  {trainers.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTime} onValueChange={(v) => setFilterTime(v as any)}>
              <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Times</SelectItem>
                <SelectItem value="morning">Morning (5–12)</SelectItem>
                <SelectItem value="afternoon">Afternoon (12–17)</SelectItem>
                <SelectItem value="evening">Evening (17–23)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRecurring} onValueChange={(v) => setFilterRecurring(v as any)}>
              <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
              </SelectContent>
            </Select>
            {(filterTrainer !== "all" || filterStatus !== "all" || filterTime !== "all" || filterRecurring !== "all" || search) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setFilterTrainer("all"); setFilterStatus("all"); setFilterTime("all"); setFilterRecurring("all"); setSearch("");
                }}
              >
                Clear
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredSlots.length}</span> of {slots.length}
            </div>
          </div>

          {/* Empty filtered state */}
          {filteredSlots.length === 0 ? (
            <Card className="border-0 shadow-sm animate-fade-in">
              <CardContent className="py-10 text-center">
                <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No slots match your filters</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting or clearing filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              {filteredSlots.map((slot, index) => {
                const filled = slot.member_count || 0;
                const isFull = filled >= slot.capacity;
                const isEmpty = filled === 0;
                const fillPct = Math.min((filled / slot.capacity) * 100, 100);

                // Status-driven palette:
                //  - Full       → strong danger (red/rose)
                //  - Filling    → warning (amber/orange)
                //  - Available  → neutral (slate) blends with background
                const accent = isFull
                  ? {
                      bar: "bg-red-500",
                      bg: "bg-red-50/80 dark:bg-red-950/30",
                      text: "text-red-700 dark:text-red-300",
                      icon: "text-red-600 dark:text-red-400",
                      numBg: "bg-red-100 dark:bg-red-900/40",
                      badge: "bg-red-500 text-white dark:bg-red-600",
                      border: "border-red-300/80 dark:border-red-800/60",
                      borderHover: "hover:border-red-400 dark:hover:border-red-700",
                      ring: "ring-red-200/50 dark:ring-red-900/40",
                    }
                  : fillPct >= 70
                  ? {
                      bar: "bg-amber-500",
                      bg: "bg-amber-50/70 dark:bg-amber-950/25",
                      text: "text-amber-800 dark:text-amber-300",
                      icon: "text-amber-600 dark:text-amber-400",
                      numBg: "bg-amber-100 dark:bg-amber-900/40",
                      badge: "bg-amber-500 text-white dark:bg-amber-600",
                      border: "border-amber-300/70 dark:border-amber-800/50",
                      borderHover: "hover:border-amber-400 dark:hover:border-amber-700",
                      ring: "ring-amber-200/50 dark:ring-amber-900/40",
                    }
                  : {
                      bar: "bg-emerald-500",
                      bg: "bg-card",
                      text: "text-foreground",
                      icon: "text-emerald-600 dark:text-emerald-400",
                      numBg: "bg-muted",
                      badge: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
                      border: "border-emerald-300 dark:border-emerald-800/70",
                      borderHover: "hover:border-emerald-400 dark:hover:border-emerald-700",
                      ring: "ring-emerald-200/50 dark:ring-emerald-900/40",
                    };

                const statusLabel = isFull ? "Full" : isEmpty ? "Empty" : fillPct >= 70 ? "Filling" : "Available";

                return (
                  <Card
                    key={slot.id}
                    className={cn(
                      "cursor-pointer transition-all duration-300 animate-fade-in group relative rounded-2xl",
                      "border-2 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_4px_16px_-4px_rgba(0,0,0,0.04)]",
                      "hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.12),0_4px_12px_-4px_rgba(0,0,0,0.06)] hover:-translate-y-1",
                      accent.bg,
                      accent.border,
                      accent.borderHover
                    )}
                    style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
                    onClick={() => handleCardClick(slot)}
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-lg font-semibold truncate flex items-center gap-1.5 text-foreground">
                            <UserGroupIcon className={cn("w-4 h-4 shrink-0", accent.icon)} />
                            {slot.trainer_name}
                          </CardTitle>
                          <CardDescription className="text-xs flex items-center gap-1 mt-1 text-muted-foreground">
                            <ClockIcon className="w-3 h-3 shrink-0" />
                            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                          </CardDescription>
                        </div>
                        <Badge className={cn("text-[10px] border-0 shrink-0 font-medium", accent.badge)}>
                          {statusLabel}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-2 space-y-3">
                      <div className="flex items-end justify-between">
                        <span className="text-xs text-muted-foreground">Capacity</span>
                        <div className="flex items-baseline gap-1">
                          <span className={cn("text-2xl font-bold tabular-nums leading-none", accent.text)}>{filled}</span>
                          <span className="text-sm text-muted-foreground font-normal">/{slot.capacity}</span>
                        </div>
                      </div>
                      <div className="w-full bg-white/60 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-700 ease-out", accent.bar)}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                      {slot.is_recurring && slot.recurring_days && slot.recurring_days.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {DAY_LABELS.map((label, d) => (
                            <span
                              key={d}
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors",
                                slot.recurring_days?.includes(d)
                                  ? cn(accent.numBg, accent.text)
                                  : "bg-white/50 dark:bg-white/5 text-muted-foreground/50"
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      {canEditDelete && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "flex-1 text-xs h-8 bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15",
                              accent.border,
                              accent.text
                            )}
                            onClick={(e) => handleOpenEdit(slot, e)}
                          >
                            <PencilIcon className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8 bg-white/80 dark:bg-white/10 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 hover:text-rose-600 border-rose-200 dark:border-rose-900/50"
                            onClick={(e) => handleDelete(slot, e)}
                          >
                            <TrashIcon className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
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
        canEditSlot={canEditDelete}
        canAssignMembers={canCreate || canEditDelete}
        canRemoveMembers={canEditDelete}
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
