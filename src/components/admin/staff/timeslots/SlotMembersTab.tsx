import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { PlusIcon, XMarkIcon, MagnifyingGlassIcon, UserGroupIcon, ExclamationTriangleIcon, ClockIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TransferSlotDialog } from "./TransferSlotDialog";

interface SlotMembersTabProps {
  trainers: Staff[];
  currentBranch: any;
  /** Restrict trainer dropdown to a single staff trainer ID. */
  restrictedTrainerId?: string | null;
  /** Permission flag — show "Assign Members" button. */
  canAssign?: boolean;
  /** Permission flag — show "Remove" button. */
  canRemove?: boolean;
}

interface TimeSlot {
  id: string;
  trainer_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
}

interface SlotMember {
  id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  pt_status: string;
  pt_end_date: string | null;
  subscription_status: string | null;
  /** The member's CURRENT active PT trainer id, regardless of this slot. */
  current_pt_trainer_id: string | null;
  current_pt_trainer_name: string | null;
  /** True when slot's trainer != member's current active PT trainer. */
  is_trainer_replaced: boolean;
}

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
  subscription_end_date: string | null;
  subscription_status: string | null;
  pt_status: "same_trainer" | "other_trainer" | "no_pt";
  existing_trainer_name: string | null;
  existing_trainer_id: string | null;
  pt_subscription_id: string | null;
}

export const SlotMembersTab = ({
  trainers,
  currentBranch,
  restrictedTrainerId = null,
  canAssign = true,
  canRemove = true,
}: SlotMembersTabProps) => {
  const [selectedTrainer, setSelectedTrainer] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [members, setMembers] = useState<SlotMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [slotCapacity, setSlotCapacity] = useState(0);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string; memberId: string } | null>(null);
  const [trainerPtId, setTrainerPtId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState("");

  // Transfer state
  const [transferConfirm, setTransferConfirm] = useState<{ memberId: string; name: string; fromTrainer: string; fromTrainerId: string; ptSubId: string } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const { invalidatePtSubscriptions } = useInvalidateQueries();

  // Auto-select & lock trainer when restricted (staff with assigned-only access).
  useEffect(() => {
    if (restrictedTrainerId) setSelectedTrainer(restrictedTrainerId);
  }, [restrictedTrainerId]);

  const resolveTrainerPtId = useCallback(async (staffId: string) => {
    const { data: staffRec } = await supabase
      .from("staff" as any)
      .select("phone, full_name")
      .eq("id", staffId)
      .maybeSingle();
    
    const staff = staffRec as any;
    if (!staff?.phone) { setTrainerPtId(null); return; }
    setTrainerName(staff.full_name || "");
    
    const { data: ptProfile } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("phone", staff.phone)
      .eq("branch_id", currentBranch.id)
      .eq("is_active", true)
      .maybeSingle();
    
    setTrainerPtId(ptProfile?.id || null);
  }, [currentBranch?.id]);

  useEffect(() => {
    if (!selectedTrainer || !currentBranch?.id) { setSlots([]); setSelectedSlot(""); setTrainerPtId(null); return; }
    resolveTrainerPtId(selectedTrainer);
    (async () => {
      const { data } = await supabase
        .from("trainer_time_slots")
        .select("id, trainer_id, start_time, end_time, capacity")
        .eq("trainer_id", selectedTrainer)
        .eq("branch_id", currentBranch.id)
        .order("start_time");
      setSlots(data || []);
      setSelectedSlot("");
    })();
  }, [selectedTrainer, currentBranch?.id, resolveTrainerPtId]);

  useEffect(() => {
    if (!selectedSlot) { setMembers([]); return; }
    const slot = slots.find(s => s.id === selectedSlot);
    setSlotCapacity(slot?.capacity || 0);
    fetchSlotMembers();
  }, [selectedSlot]);

  const fetchSlotMembers = async () => {
    if (!selectedSlot) return;
    setIsLoading(true);
    try {
      const { data: tsmData } = await supabase
        .from("time_slot_members")
        .select("id, member_id, members(name, phone)")
        .eq("time_slot_id", selectedSlot);

      if (!tsmData || tsmData.length === 0) { setMembers([]); return; }

      const memberIds = tsmData.map((d: any) => d.member_id);

      // Fetch:
      //  - PT row LINKED to this slot (status/end_date for badge)
      //  - The member's CURRENT active PT trainer (regardless of slot)
      //  - Latest gym subscription
      const [ptSlotRes, ptCurrentRes, subRes] = await Promise.all([
        supabase
          .from("pt_subscriptions")
          .select("member_id, status, end_date")
          .eq("time_slot_id", selectedSlot)
          .in("member_id", memberIds),
        supabase
          .from("pt_subscriptions")
          .select("member_id, personal_trainer_id, personal_trainers(name)")
          .in("member_id", memberIds)
          .eq("status", "active"),
        supabase
          .from("subscriptions")
          .select("member_id, status, end_date")
          .in("member_id", memberIds)
          .in("status", ["active", "expiring_soon", "expired"])
          .order("end_date", { ascending: false }),
      ]);

      const ptSlotMap = new Map<string, { status: string; end_date: string | null }>();
      ptSlotRes.data?.forEach((p: any) => { if (!ptSlotMap.has(p.member_id)) ptSlotMap.set(p.member_id, p); });

      const ptCurrentMap = new Map<string, { trainer_id: string; trainer_name: string }>();
      ptCurrentRes.data?.forEach((p: any) => {
        if (!ptCurrentMap.has(p.member_id)) {
          ptCurrentMap.set(p.member_id, {
            trainer_id: p.personal_trainer_id,
            trainer_name: (p.personal_trainers as any)?.name || "Unknown",
          });
        }
      });

      const subMap = new Map<string, string>();
      subRes.data?.forEach((s: any) => { if (!subMap.has(s.member_id)) subMap.set(s.member_id, s.status); });

      setMembers(tsmData.map((d: any) => {
        const pt = ptSlotMap.get(d.member_id);
        const current = ptCurrentMap.get(d.member_id);
        // "Replaced" = member has an active PT, but it isn't this slot's trainer.
        const isReplaced = !!(current && trainerPtId && current.trainer_id !== trainerPtId);
        return {
          id: d.id,
          member_id: d.member_id,
          member_name: d.members?.name || "Unknown",
          member_phone: d.members?.phone || "",
          pt_status: pt?.status || "not_synced",
          pt_end_date: pt?.end_date || null,
          subscription_status: subMap.get(d.member_id) || null,
          current_pt_trainer_id: current?.trainer_id || null,
          current_pt_trainer_name: current?.trainer_name || null,
          is_trainer_replaced: isReplaced,
        };
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddMembers = async () => {
    if (!currentBranch?.id) return;
    const existingIds = members.map(m => m.member_id);

    const { data } = await supabase
      .from("members")
      .select("id, name, phone")
      .eq("branch_id", currentBranch.id)
      .order("name");

    if (!data) return;

    const available = data.filter(m => !existingIds.includes(m.id));
    const memberIds = available.map(m => m.id);

    // Fetch active PT subscriptions and gym subscriptions
    const [ptRes, subRes] = await Promise.all([
      supabase
        .from("pt_subscriptions")
        .select("id, member_id, personal_trainer_id, personal_trainers(name)")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .eq("status", "active"),
      supabase
        .from("subscriptions")
        .select("member_id, end_date, status")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .in("status", ["active", "expiring_soon"])
        .order("end_date", { ascending: false }),
    ]);

    const ptMap = new Map<string, { trainer_name: string; trainer_id: string; pt_sub_id: string }>();
    ptRes.data?.forEach((p: any) => {
      if (!ptMap.has(p.member_id)) {
        ptMap.set(p.member_id, {
          trainer_name: (p.personal_trainers as any)?.name || "Unknown",
          trainer_id: p.personal_trainer_id,
          pt_sub_id: p.id,
        });
      }
    });

    const subMap = new Map<string, { end_date: string; status: string }>();
    subRes.data?.forEach((s: any) => { if (!subMap.has(s.member_id)) subMap.set(s.member_id, s); });

    const mappedMembers = available
      .map(m => {
        const sub = subMap.get(m.id);
        const ptInfo = ptMap.get(m.id);
        let ptStatus: "same_trainer" | "other_trainer" | "no_pt" = "no_pt";
        if (ptInfo) {
          ptStatus = ptInfo.trainer_id === trainerPtId ? "same_trainer" : "other_trainer";
        }
        return {
          ...m,
          selected: false,
          subscription_end_date: sub?.end_date || null,
          subscription_status: sub?.status || null,
          pt_status: ptStatus,
          existing_trainer_name: ptInfo?.trainer_name || null,
          existing_trainer_id: ptInfo?.trainer_id || null,
          pt_subscription_id: ptInfo?.pt_sub_id || null,
        };
      })
      // Sort: same_trainer first (selectable), then no_pt (not selectable), then other_trainer (grayed)
      .sort((a, b) => {
        const order = { same_trainer: 0, no_pt: 1, other_trainer: 2 };
        const diff = order[a.pt_status] - order[b.pt_status];
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });

    setAvailableMembers(mappedMembers);
    setMemberSearch("");
    setAddDialogOpen(true);
  };

  // Only members with PT under the same trainer can be added (no PT creation)
  const handleAddMembers = async () => {
    const selected = availableMembers.filter(m => m.selected);
    if (selected.length === 0) { toast.error("Select at least one member"); return; }
    if (members.length + selected.length > slotCapacity) {
      toast.error(`Slot capacity is ${slotCapacity}. Cannot add ${selected.length} more members.`);
      return;
    }

    setIsProcessing(true);
    try {
      // Insert into time_slot_members
      const inserts = selected.map(m => ({
        time_slot_id: selectedSlot,
        member_id: m.id,
        branch_id: currentBranch.id,
      }));

      const { error } = await supabase.from("time_slot_members").insert(inserts);
      if (error) { toast.error("Failed to add members", { description: error.message }); return; }

      // Update pt_subscriptions to link to this time slot
      for (const m of selected) {
        if (m.pt_subscription_id) {
          await supabase
            .from("pt_subscriptions")
            .update({ time_slot_id: selectedSlot })
            .eq("id", m.pt_subscription_id);
        }
      }

      toast.success(`${selected.length} member(s) assigned to ${trainerName}'s slot`, {
        description: "Time slot linked to existing PT subscriptions",
      });

      setAddDialogOpen(false);
      fetchSlotMembers();
      invalidatePtSubscriptions();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeConfirm) return;
    setIsProcessing(true);
    try {
      // Remove from time_slot_members
      await supabase.from("time_slot_members").delete().eq("id", removeConfirm.id);

      // Clear time_slot_id from PT subscription (but keep PT active)
      await supabase
        .from("pt_subscriptions")
        .update({ time_slot_id: null } as any)
        .eq("member_id", removeConfirm.memberId)
        .eq("time_slot_id", selectedSlot)
        .eq("status", "active");

      toast.success(`${removeConfirm.name} removed from slot`, {
        description: "PT subscription remains active (no time slot assigned)",
      });
      setRemoveConfirm(null);
      fetchSlotMembers();
      invalidatePtSubscriptions();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTransferMember = async () => {
    if (!transferConfirm || !trainerPtId) return;
    setIsTransferring(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Remove from old time_slot_members
      await supabase
        .from("time_slot_members")
        .delete()
        .eq("member_id", transferConfirm.memberId)
        .eq("branch_id", currentBranch.id);

      // 2. Deactivate old PT subscription
      await supabase
        .from("pt_subscriptions")
        .update({ status: "inactive", time_slot_id: null } as any)
        .eq("member_id", transferConfirm.memberId)
        .eq("status", "active");

      // 3. Add to new time_slot_members
      await supabase.from("time_slot_members").insert({
        time_slot_id: selectedSlot,
        member_id: transferConfirm.memberId,
        branch_id: currentBranch.id,
      });

      // 4. Create new PT subscription with this trainer
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", transferConfirm.memberId)
        .in("status", ["active", "expiring_soon"])
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const endDate = subData?.end_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
      const months = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24 * 30)));

      const { data: ptProfile } = await supabase
        .from("personal_trainers")
        .select("monthly_fee")
        .eq("id", trainerPtId)
        .maybeSingle();

      const monthlyFee = ptProfile?.monthly_fee || 0;

      const { data: insertedPt } = await supabase.from("pt_subscriptions").insert({
        member_id: transferConfirm.memberId,
        personal_trainer_id: trainerPtId,
        branch_id: currentBranch.id,
        start_date: today,
        end_date: endDate,
        monthly_fee: monthlyFee,
        total_fee: months * monthlyFee,
        status: "active",
        time_slot_id: selectedSlot,
      }).select("id").single();

      // Ledger: PT subscription income + trainer percentage expense
      try {
        await createMembershipIncomeEntry(
          months * monthlyFee,
          "pt_subscription",
          `PT subscription — ${trainerName} for ${transferConfirm.name} (transferred)`,
          transferConfirm.memberId,
          undefined,
          undefined,
          currentBranch.id,
        );
        await calculateTrainerPercentageExpense(
          trainerPtId,
          months * monthlyFee,
          transferConfirm.memberId,
          undefined,
          insertedPt?.id,
          transferConfirm.name,
          currentBranch.id,
        );
      } catch (ledgerErr) {
        console.error("Ledger entry (PT transfer) failed:", ledgerErr);
      }

      toast.success(`${transferConfirm.name} transferred to ${trainerName}`, {
        description: `Previous PT with ${transferConfirm.fromTrainer} deactivated`,
      });
      setTransferConfirm(null);
      setAddDialogOpen(false);
      fetchSlotMembers();
      invalidatePtSubscriptions();
    } finally {
      setIsTransferring(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setAvailableMembers(prev =>
      prev.map(m => m.id === memberId ? { ...m, selected: !m.selected } : m)
    );
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const filteredMembers = members.filter(m =>
    !searchFilter || m.member_name.toLowerCase().includes(searchFilter.toLowerCase()) || m.member_phone.includes(searchFilter)
  );

  const filteredAvailable = availableMembers.filter(m =>
    !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || m.phone.includes(memberSearch)
  );

  const selectedCount = availableMembers.filter(m => m.selected).length;
  const isFull = members.length >= slotCapacity;

  const getPtBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-100 text-green-700 text-[10px] border-0">PT Active</Badge>;
      case "expired": return <Badge className="bg-red-100 text-red-700 text-[10px] border-0">PT Expired</Badge>;
      case "not_synced": return <Badge className="bg-yellow-100 text-yellow-700 text-[10px] border-0">No PT Record</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const getSubBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "active": return <Badge className="bg-blue-100 text-blue-700 text-[10px] border-0">Active</Badge>;
      case "expiring_soon": return <Badge className="bg-orange-100 text-orange-700 text-[10px] border-0">Expiring</Badge>;
      case "expired": return <Badge className="bg-red-100 text-red-700 text-[10px] border-0">Expired</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base lg:text-lg font-semibold">Slot Member Management</h3>
        <p className="text-xs lg:text-sm text-muted-foreground">
          Assign PT members to trainer time slots. Only members with an active PT subscription can be added.
        </p>
      </div>

      {selectedTrainer && !trainerPtId && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            This trainer has no active Personal Trainer profile. Only members with an existing PT subscription under this trainer can be assigned to slots.
          </p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Select Trainer</label>
          <Select value={selectedTrainer} onValueChange={setSelectedTrainer} disabled={!!restrictedTrainerId}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose trainer..." /></SelectTrigger>
            <SelectContent>
              {trainers.filter(t => t.is_active).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Select Time Slot</label>
          <Select value={selectedSlot} onValueChange={setSelectedSlot} disabled={!selectedTrainer || slots.length === 0}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={slots.length === 0 ? "No slots" : "Choose slot..."} /></SelectTrigger>
            <SelectContent>
              {slots.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {formatTime(s.start_time)} – {formatTime(s.end_time)} (Cap: {s.capacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state when nothing is selected — colorful, informative panel */}
      {!selectedSlot && (
        <Card className="border-0 overflow-hidden bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
          <CardContent className="p-6 lg:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] items-center">
              {/* Left: heading + steps */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
                    <UserGroupIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-base lg:text-lg font-semibold">
                      {!selectedTrainer ? "Get Started" : "Pick a Time Slot"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {!selectedTrainer
                        ? "Select a trainer above to view their available time slots"
                        : "Choose a slot to manage its assigned members"}
                    </p>
                  </div>
                </div>

                {/* Step indicators */}
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <div className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all ${
                    selectedTrainer ? "bg-green-50 border-green-200" : "bg-card border-primary/30 ring-2 ring-primary/10"
                  }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedTrainer ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"
                    }`}>
                      {selectedTrainer ? "✓" : "1"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Choose Trainer</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {selectedTrainer ? trainerName || "Selected" : "Pick from list"}
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all ${
                    selectedSlot ? "bg-green-50 border-green-200" :
                    selectedTrainer ? "bg-card border-primary/30 ring-2 ring-primary/10" :
                    "bg-muted/30 border-border opacity-60"
                  }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedSlot ? "bg-green-500 text-white" :
                      selectedTrainer ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {selectedSlot ? "✓" : "2"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Pick Slot</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {selectedTrainer
                          ? slots.length > 0 ? `${slots.length} slot${slots.length > 1 ? "s" : ""} available` : "No slots yet"
                          : "Awaiting trainer"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/30 border-border opacity-60">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted-foreground/30 text-muted-foreground">
                      3
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Assign Members</p>
                      <p className="text-[10px] text-muted-foreground truncate">Active PT only</p>
                    </div>
                  </div>
                </div>

                {/* Tip strip */}
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-white text-[10px] font-bold">i</span>
                  </div>
                  <p className="text-xs text-blue-900">
                    <span className="font-semibold">Tip:</span> Members need an active PT subscription with the same trainer to join a slot. Use transfer to move them between trainers.
                  </p>
                </div>
              </div>

              {/* Right: decorative info chips */}
              <div className="hidden lg:flex flex-col gap-2.5 min-w-[180px]">
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-card border shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                    <UserGroupIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Same Trainer</p>
                    <p className="text-xs font-semibold">Add directly</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-card border shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                    <ArrowsRightLeftIcon className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Other Trainer</p>
                    <p className="text-xs font-semibold">Transfer over</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-card border shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <ClockIcon className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Capacity</p>
                    <p className="text-xs font-semibold">Per slot limit</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSlot && (
        <Card className="border shadow-sm">
          <CardContent className="p-3 lg:p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-semibold">
                  {members.length}/{slotCapacity} members
                </Badge>
                {isFull && <Badge className="bg-red-100 text-red-700 text-[10px] border-0">Full</Badge>}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="h-7 text-xs pl-8 w-36"
                  />
                </div>
                {canAssign && (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleOpenAddMembers} disabled={isFull}>
                    <PlusIcon className="w-3 h-3" /> Assign Members
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-8">
                <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No members assigned to this slot</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Only members with active PT can be added here</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{m.member_name}</p>
                        {getPtBadge(m.pt_status)}
                        {getSubBadge(m.subscription_status)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{m.member_phone}</p>
                        {m.pt_end_date && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <ClockIcon className="w-3 h-3" />
                            PT ends {new Date(m.pt_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
                        onClick={() => setRemoveConfirm({ id: m.id, name: m.member_name, memberId: m.member_id })}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Members Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg p-4">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5" />
              Assign Members to Time Slot
            </DialogTitle>
            <DialogDescription className="text-xs">
              Only members with an active PT subscription under <strong>{trainerName}</strong> can be assigned.
              Members with other trainers can be transferred.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredAvailable.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
              ) : (
                filteredAvailable.map(m => {
                  const isSelectable = m.pt_status === "same_trainer";
                  const isOtherTrainer = m.pt_status === "other_trainer";
                  const isNoPt = m.pt_status === "no_pt";

                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                        isSelectable
                          ? "border-transparent hover:border-border hover:bg-muted/50 cursor-pointer"
                          : "opacity-50 bg-muted/30 border-border/30 cursor-not-allowed"
                      }`}
                      onClick={() => isSelectable && toggleMemberSelection(m.id)}
                    >
                      {isSelectable ? (
                        <Checkbox checked={m.selected} onCheckedChange={() => toggleMemberSelection(m.id)} />
                      ) : (
                        <div className="w-4 h-4 rounded border border-muted-foreground/30 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium truncate ${!isSelectable ? "text-muted-foreground" : ""}`}>{m.name}</p>
                          {isOtherTrainer && (
                            <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0 shrink-0 px-1.5 py-0">
                              With {m.existing_trainer_name}
                            </Badge>
                          )}
                          {isNoPt && (
                            <Badge className="bg-muted text-muted-foreground text-[9px] border-0 shrink-0 px-1.5 py-0">
                              No PT
                            </Badge>
                          )}
                          {isSelectable && (
                            <Badge className="bg-green-100 text-green-700 text-[9px] border-0 shrink-0 px-1.5 py-0">
                              PT Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                          {m.subscription_end_date && (
                            <span className="text-[10px] text-muted-foreground">
                              till {new Date(m.subscription_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      {isOtherTrainer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 gap-1 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTransferConfirm({
                              memberId: m.id,
                              name: m.name,
                              fromTrainer: m.existing_trainer_name || "Unknown",
                              fromTrainerId: m.existing_trainer_id || "",
                              ptSubId: m.pt_subscription_id || "",
                            });
                          }}
                        >
                          <ArrowsRightLeftIcon className="w-3 h-3" />
                          Transfer
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-foreground">
                  <strong>{selectedCount}</strong> member{selectedCount > 1 ? "s" : ""} selected —
                  will be assigned to this time slot
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddMembers} disabled={isProcessing || selectedCount === 0}>
              {isProcessing ? "Assigning..." : `Assign ${selectedCount > 0 ? selectedCount : ""} Member${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remove {removeConfirm?.name} from slot?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              <strong>{removeConfirm?.name}</strong> will be removed from this time slot.
              Their PT subscription with {trainerName} will remain active but won't be linked to any slot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveMember} 
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? "Removing..." : "Remove from Slot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Confirmation */}
      <AlertDialog open={!!transferConfirm} onOpenChange={(open) => !open && setTransferConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Transfer {transferConfirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will transfer <strong>{transferConfirm?.name}</strong> from{" "}
              <strong>{transferConfirm?.fromTrainer}</strong> to <strong>{trainerName}</strong>.
              <br /><br />
              • Previous PT subscription will be deactivated<br />
              • New PT subscription will be created with {trainerName}<br />
              • Member will be assigned to this time slot
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTransferring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferMember}
              disabled={isTransferring}
            >
              {isTransferring ? "Transferring..." : "Transfer Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
