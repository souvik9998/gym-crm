import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import {
  UserGroupIcon,
  PlusIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { Clock, Loader2, Save } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { TransferSlotDialog } from "./TransferSlotDialog";

interface SlotMember {
  id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  has_pt: boolean;
  /** The member's CURRENT active PT trainer (regardless of this slot). */
  current_pt_trainer_id: string | null;
  current_pt_trainer_name: string | null;
  /** True when the slot's trainer != member's current active PT trainer. */
  is_trainer_replaced: boolean;
}

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
  pt_status: "same_trainer" | "other_trainer" | "no_pt";
  existing_trainer_name: string | null;
  existing_trainer_id: string | null;
  pt_subscription_id: string | null;
  subscription_end_date: string | null;
}

interface TimeSlotDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: {
    id: string;
    trainer_id: string;
    trainer_name: string;
    start_time: string;
    end_time: string;
    capacity: number;
    is_recurring: boolean;
    recurring_days: number[] | null;
    member_count: number;
  } | null;
  branchId: string;
  onUpdated: () => void;
  /** Permission flags. Default true (admin behaviour). */
  canEditSlot?: boolean;
  canAssignMembers?: boolean;
  canRemoveMembers?: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const TimeSlotDetailDialog = ({
  open,
  onOpenChange,
  slot,
  branchId,
  onUpdated,
  canEditSlot = true,
  canAssignMembers = true,
  canRemoveMembers = true,
}: TimeSlotDetailDialogProps) => {
  const [activeTab, setActiveTab] = useState("members");
  const [members, setMembers] = useState<SlotMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const [addMode, setAddMode] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  const [editCapacity, setEditCapacity] = useState(10);
  const [editStartTime, setEditStartTime] = useState("06:00");
  const [editEndTime, setEditEndTime] = useState("07:00");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string; memberId: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [transferConfirm, setTransferConfirm] = useState<{ memberId: string; name: string; fromTrainer: string; fromTrainerId: string } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  // Same-trainer slot move (for already-assigned members in this slot).
  const [moveSlot, setMoveSlot] = useState<{
    rowId: string;
    memberId: string;
    memberName: string;
    trainerId: string;
    trainerName: string;
  } | null>(null);

  const [trainerPtId, setTrainerPtId] = useState<string | null>(null);

  const { invalidatePtSubscriptions } = useInvalidateQueries();

  const resolveTrainerPtId = useCallback(async (staffTrainerId: string) => {
    const { data: staffRec } = await supabase
      .from("staff" as any)
      .select("phone")
      .eq("id", staffTrainerId)
      .maybeSingle();
    const staff = staffRec as any;
    if (!staff?.phone) { setTrainerPtId(null); return; }
    const { data: ptProfile } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("phone", staff.phone)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .maybeSingle();
    setTrainerPtId(ptProfile?.id || null);
  }, [branchId]);

  useEffect(() => {
    if (open && slot) {
      setActiveTab("members");
      setAddMode(false);
      setSearchFilter("");
      setEditCapacity(slot.capacity);
      setEditStartTime(slot.start_time.slice(0, 5));
      setEditEndTime(slot.end_time.slice(0, 5));
      resolveTrainerPtId(slot.trainer_id);
      fetchSlotMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot?.id]);

  // Re-evaluate replacement detection once trainerPtId resolves async.
  useEffect(() => {
    if (open && slot && trainerPtId !== null) fetchSlotMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerPtId]);

  const fetchSlotMembers = async () => {
    if (!slot) return;
    setIsLoadingMembers(true);
    try {
      const { data } = await supabase
        .from("time_slot_members")
        .select("id, member_id, members(name, phone)")
        .eq("time_slot_id", slot.id);

      if (data) {
        const memberIds = data.map((d: any) => d.member_id);

        // PT linked to THIS slot (badge), and CURRENT active PT trainer (replacement detection).
        const [ptSlotRes, ptCurrentRes] = await Promise.all([
          supabase
            .from("pt_subscriptions")
            .select("member_id")
            .eq("time_slot_id", slot.id)
            .eq("status", "active"),
          supabase
            .from("pt_subscriptions")
            .select("member_id, personal_trainer_id, personal_trainers(name)")
            .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
            .eq("status", "active"),
        ]);

        const ptMemberIds = new Set((ptSlotRes.data || []).map((p) => p.member_id));
        const ptCurrentMap = new Map<string, { trainer_id: string; trainer_name: string }>();
        ptCurrentRes.data?.forEach((p: any) => {
          if (!ptCurrentMap.has(p.member_id)) {
            ptCurrentMap.set(p.member_id, {
              trainer_id: p.personal_trainer_id,
              trainer_name: (p.personal_trainers as any)?.name || "Unknown",
            });
          }
        });

        setMembers(
          data.map((d: any) => {
            const current = ptCurrentMap.get(d.member_id);
            const isReplaced = !!(current && trainerPtId && current.trainer_id !== trainerPtId);
            return {
              id: d.id,
              member_id: d.member_id,
              member_name: d.members?.name || "Unknown",
              member_phone: d.members?.phone || "",
              has_pt: ptMemberIds.has(d.member_id),
              current_pt_trainer_id: current?.trainer_id || null,
              current_pt_trainer_name: current?.trainer_name || null,
              is_trainer_replaced: isReplaced,
            };
          })
        );
      }
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleOpenAddMode = async () => {
    const existingIds = members.map((m) => m.member_id);
    const { data } = await supabase
      .from("members")
      .select("id, name, phone")
      .eq("branch_id", branchId)
      .order("name");

    if (!data) return;

    const memberIds = data.filter((m) => !existingIds.includes(m.id)).map((m) => m.id);

    const [ptRes, subRes] = await Promise.all([
      supabase
        .from("pt_subscriptions")
        .select("id, member_id, personal_trainer_id, personal_trainers(name)")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .eq("status", "active"),
      supabase
        .from("subscriptions")
        .select("member_id, end_date")
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

    const subMap = new Map<string, string>();
    subRes.data?.forEach((s: any) => {
      if (!subMap.has(s.member_id)) subMap.set(s.member_id, s.end_date);
    });

    const available = data
      .filter((m) => !existingIds.includes(m.id))
      .map((m) => {
        const ptInfo = ptMap.get(m.id);
        let ptStatus: "same_trainer" | "other_trainer" | "no_pt" = "no_pt";
        if (ptInfo) {
          ptStatus = ptInfo.trainer_id === trainerPtId ? "same_trainer" : "other_trainer";
        }
        return {
          ...m,
          selected: false,
          pt_status: ptStatus,
          existing_trainer_name: ptInfo?.trainer_name || null,
          existing_trainer_id: ptInfo?.trainer_id || null,
          pt_subscription_id: ptInfo?.pt_sub_id || null,
          subscription_end_date: subMap.get(m.id) || null,
        };
      })
      .sort((a, b) => {
        const order = { same_trainer: 0, no_pt: 1, other_trainer: 2 };
        return order[a.pt_status] - order[b.pt_status] || a.name.localeCompare(b.name);
      });

    setAvailableMembers(available);
    setMemberSearch("");
    setAddMode(true);
  };

  // Only members with PT under the same trainer can be added
  const handleAddMembers = async () => {
    if (!slot) return;
    const selected = availableMembers.filter((m) => m.selected);
    if (selected.length === 0) {
      toast.error("Select at least one member");
      return;
    }
    if (members.length + selected.length > slot.capacity) {
      toast.error(`Exceeds capacity of ${slot.capacity}`);
      return;
    }

    setIsAddingMembers(true);
    try {
      const inserts = selected.map((m) => ({
        time_slot_id: slot.id,
        member_id: m.id,
        branch_id: branchId,
        assigned_by: "Admin",
      }));

      const { error } = await supabase.from("time_slot_members").insert(inserts);
      if (error) {
        toast.error("Failed to add members");
        return;
      }

      // Link PT subscriptions to this time slot
      for (const m of selected) {
        if (m.pt_subscription_id) {
          await supabase
            .from("pt_subscriptions")
            .update({ time_slot_id: slot.id })
            .eq("id", m.pt_subscription_id);
        }
      }

      const names = selected.map((m) => m.name).join(", ");
      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_added",
        description: `Added ${selected.length} member(s) to ${slot.trainer_name}'s slot: ${names}`,
        entityType: "time_slot",
        entityId: slot.id,
        entityName: slot.trainer_name,
        newValue: { members_added: selected.map((m) => ({ id: m.id, name: m.name })) },
        branchId,
      });

      toast.success(`${selected.length} member(s) assigned to slot`, {
        description: "Time slot linked to existing PT subscriptions",
      });
      setAddMode(false);
      fetchSlotMembers();
      onUpdated();
      invalidatePtSubscriptions();
    } finally {
      setIsAddingMembers(false);
    }
  };

  // Remove from slot only — PT stays active
  const handleRemoveMember = async () => {
    if (!removeConfirm || !slot) return;
    setIsRemoving(true);
    try {
      await supabase.from("time_slot_members").delete().eq("id", removeConfirm.id);

      // Clear time_slot_id from PT subscription but keep active
      await supabase
        .from("pt_subscriptions")
        .update({ time_slot_id: null } as any)
        .eq("member_id", removeConfirm.memberId)
        .eq("time_slot_id", slot.id)
        .eq("status", "active");

      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_removed",
        description: `Removed ${removeConfirm.name} from ${slot.trainer_name}'s time slot`,
        entityType: "time_slot",
        entityId: slot.id,
        entityName: slot.trainer_name,
        oldValue: { member_name: removeConfirm.name },
        branchId,
      });

      toast.success(`${removeConfirm.name} removed from slot`, {
        description: "PT subscription remains active",
      });
      setRemoveConfirm(null);
      fetchSlotMembers();
      onUpdated();
      invalidatePtSubscriptions();
    } finally {
      setIsRemoving(false);
    }
  };

  const handleTransferMember = async () => {
    if (!transferConfirm || !slot || !trainerPtId) return;
    setIsTransferring(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // Remove from old slot
      await supabase
        .from("time_slot_members")
        .delete()
        .eq("member_id", transferConfirm.memberId)
        .eq("branch_id", branchId);

      // Deactivate old PT
      await supabase
        .from("pt_subscriptions")
        .update({ status: "inactive", time_slot_id: null } as any)
        .eq("member_id", transferConfirm.memberId)
        .eq("status", "active");

      // Add to new slot
      await supabase.from("time_slot_members").insert({
        time_slot_id: slot.id,
        member_id: transferConfirm.memberId,
        branch_id: branchId,
        assigned_by: "Admin",
      });

      // Create new PT subscription
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
        branch_id: branchId,
        start_date: today,
        end_date: endDate,
        monthly_fee: monthlyFee,
        total_fee: months * monthlyFee,
        status: "active",
        time_slot_id: slot.id,
      }).select("id").single();

      // Ledger: PT subscription income + trainer percentage expense
      try {
        await createMembershipIncomeEntry(
          months * monthlyFee,
          "pt_subscription",
          `PT subscription — ${slot.trainer_name} for ${transferConfirm.name} (transferred)`,
          transferConfirm.memberId,
          undefined,
          undefined,
          branchId,
        );
        await calculateTrainerPercentageExpense(
          trainerPtId,
          months * monthlyFee,
          transferConfirm.memberId,
          undefined,
          insertedPt?.id,
          transferConfirm.name,
          branchId,
        );
      } catch (ledgerErr) {
        console.error("Ledger entry (PT transfer) failed:", ledgerErr);
      }

      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_added",
        description: `Transferred ${transferConfirm.name} from ${transferConfirm.fromTrainer} to ${slot.trainer_name}`,
        entityType: "time_slot",
        entityId: slot.id,
        entityName: slot.trainer_name,
        oldValue: { trainer: transferConfirm.fromTrainer },
        newValue: { trainer: slot.trainer_name },
        branchId,
      });

      toast.success(`${transferConfirm.name} transferred to ${slot.trainer_name}`, {
        description: `Previous PT with ${transferConfirm.fromTrainer} deactivated`,
      });
      setTransferConfirm(null);
      setAddMode(false);
      fetchSlotMembers();
      onUpdated();
      invalidatePtSubscriptions();
    } finally {
      setIsTransferring(false);
    }
  };

  const toggleSelection = (id: string) => {
    setAvailableMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
  };

  const handleSaveEdit = async () => {
    if (!slot) return;
    setIsSavingEdit(true);
    const { error } = await supabase
      .from("trainer_time_slots")
      .update({
        capacity: editCapacity,
        start_time: editStartTime,
        end_time: editEndTime,
      })
      .eq("id", slot.id);

    if (error) {
      toast.error("Failed to update slot");
    } else {
      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_updated",
        description: `Updated ${slot.trainer_name}'s slot: ${editStartTime}-${editEndTime}, capacity ${editCapacity}`,
        entityType: "time_slot",
        entityId: slot.id,
        entityName: slot.trainer_name,
        oldValue: { start_time: slot.start_time, end_time: slot.end_time, capacity: slot.capacity },
        newValue: { start_time: editStartTime, end_time: editEndTime, capacity: editCapacity },
        branchId,
      });
      toast.success("Slot updated");
      onUpdated();
      onOpenChange(false);
    }
    setIsSavingEdit(false);
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const filteredMembers = members.filter(
    (m) =>
      !searchFilter ||
      m.member_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.member_phone.includes(searchFilter)
  );

  const filteredAvailable = availableMembers.filter(
    (m) =>
      !memberSearch ||
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.phone.includes(memberSearch)
  );

  if (!slot) return null;

  const isFull = members.length >= slot.capacity;
  const selectedCount = availableMembers.filter((m) => m.selected).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {slot.trainer_name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs font-normal">
                {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
              </Badge>
              <Badge
                className={`text-[10px] ${
                  isFull
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                }`}
              >
                {members.length}/{slot.capacity} Members
              </Badge>
              {slot.is_recurring && slot.recurring_days && (
                <div className="flex gap-0.5">
                  {slot.recurring_days.sort().map((d) => (
                    <Badge key={d} variant="secondary" className="text-[9px] px-1 py-0 h-4">
                      {DAY_LABELS[d]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-5 pb-5 pt-3">
            <TabsList className={canEditSlot ? "grid w-full grid-cols-2 h-8" : "grid w-full grid-cols-1 h-8"}>
              <TabsTrigger value="members" className="text-xs gap-1 h-7">
                <UserGroupIcon className="w-3.5 h-3.5" /> Members
              </TabsTrigger>
              {canEditSlot && (
                <TabsTrigger value="edit" className="text-xs gap-1 h-7">
                  <PencilIcon className="w-3.5 h-3.5" /> Edit Slot
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="members" className="mt-3 space-y-3">
              {addMode ? (
                <div className="space-y-3 animate-fade-in">
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Only members with active PT under {slot.trainer_name} can be selected
                  </p>
                  <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-border/40 p-1.5">
                    {filteredAvailable.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No members found</p>
                    ) : (
                      filteredAvailable.map((m) => {
                        const isSelectable = m.pt_status === "same_trainer";
                        const isOtherTrainer = m.pt_status === "other_trainer";
                        const isNoPt = m.pt_status === "no_pt";

                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                              isSelectable
                                ? "hover:bg-muted/50 cursor-pointer"
                                : "opacity-50 bg-muted/30 cursor-not-allowed"
                            }`}
                            onClick={() => isSelectable && toggleSelection(m.id)}
                          >
                            {isSelectable ? (
                              <Checkbox checked={m.selected} onCheckedChange={() => toggleSelection(m.id)} />
                            ) : (
                              <div className="w-4 h-4 rounded border border-muted-foreground/30 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`text-sm font-medium truncate ${!isSelectable ? "text-muted-foreground" : ""}`}>
                                  {m.name}
                                </p>
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
                              <p className="text-xs text-muted-foreground">{m.phone}</p>
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddMode(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleAddMembers}
                        disabled={isAddingMembers || selectedCount === 0}
                      >
                        {isAddingMembers && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        Add {selectedCount > 0 ? selectedCount : ""} Member{selectedCount !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="h-7 text-xs pl-8"
                      />
                    </div>
                    {canAssignMembers && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={handleOpenAddMode} disabled={isFull}>
                        <PlusIcon className="w-3 h-3" /> Add
                      </Button>
                    )}
                  </div>

                  {isLoadingMembers ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="text-center py-6">
                      <UserGroupIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No members in this slot</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        Only PT members can be added
                      </p>
                      {canAssignMembers && (
                        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={handleOpenAddMode}>
                          Add Members
                        </Button>
                      )}
                    </div>
                  ) : (
                    <TooltipProvider delayDuration={150}>
                      <div className="space-y-1.5">
                        {filteredMembers.map((m, index) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all animate-fade-in"
                            style={{ animationDelay: `${index * 30}ms`, animationFillMode: "backwards" }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium truncate">{m.member_name}</p>
                                {m.has_pt && (
                                  <Badge className="bg-primary/10 text-primary text-[9px] px-1 py-0 h-3.5">PT</Badge>
                                )}
                                {m.is_trainer_replaced && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[9px] border-0 gap-0.5 cursor-help px-1 py-0 h-3.5">
                                        <ExclamationTriangleIcon className="w-2.5 h-2.5" />
                                        Replaced
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[240px]">
                                      <p className="text-xs">
                                        Trainer changed to <strong>{m.current_pt_trainer_name}</strong>.
                                        Tap <em>Transfer</em> to move them to one of {m.current_pt_trainer_name}'s slots.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{m.member_phone}</p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {canAssignMembers && m.current_pt_trainer_id && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className={`h-6 w-6 p-0 shrink-0 ${
                                        m.is_trainer_replaced
                                          ? "text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                          : "text-primary hover:text-primary hover:bg-primary/10"
                                      }`}
                                      onClick={() => setMoveSlot({
                                        rowId: m.id,
                                        memberId: m.member_id,
                                        memberName: m.member_name,
                                        trainerId: m.current_pt_trainer_id!,
                                        trainerName: m.current_pt_trainer_name || "Trainer",
                                      })}
                                    >
                                      <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">
                                      Transfer to <strong>{m.current_pt_trainer_name}</strong>'s slot
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {canRemoveMembers && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => setRemoveConfirm({ id: m.id, name: m.member_name, memberId: m.member_id })}
                                >
                                  <XMarkIcon className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </TabsContent>

            {canEditSlot && (
              <TabsContent value="edit" className="mt-3 space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Time</Label>
                    <Input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End Time</Label>
                    <Input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Capacity</Label>
                  <Input
                    type="number"
                    min={Math.max(1, members.length)}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(parseInt(e.target.value) || 1)}
                    className="h-9 text-sm"
                  />
                  {members.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">Min capacity: {members.length} (current members)</p>
                  )}
                </div>
                <Button className="w-full gap-1.5" size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                  {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Changes
                </Button>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remove {removeConfirm?.name} from slot?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              <strong>{removeConfirm?.name}</strong> will be removed from this time slot.
              Their PT subscription with {slot.trainer_name} will remain active but won't be linked to any slot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove from Slot"}
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
              <strong>{transferConfirm?.fromTrainer}</strong> to <strong>{slot.trainer_name}</strong>.
              <br /><br />
              • Previous PT subscription will be deactivated<br />
              • New PT subscription created with {slot.trainer_name}<br />
              • Member assigned to this time slot
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTransferring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransferMember} disabled={isTransferring}>
              {isTransferring ? "Transferring..." : "Transfer Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Same-trainer slot move */}
      {moveSlot && slot && (
        <TransferSlotDialog
          open={!!moveSlot}
          onOpenChange={(o) => !o && setMoveSlot(null)}
          currentSlotId={slot.id}
          slotMemberRowId={moveSlot.rowId}
          memberId={moveSlot.memberId}
          memberName={moveSlot.memberName}
          currentPtTrainerId={moveSlot.trainerId}
          currentPtTrainerName={moveSlot.trainerName}
          branchId={branchId}
          onTransferred={() => {
            setMoveSlot(null);
            fetchSlotMembers();
            onUpdated();
          }}
        />
      )}
    </>
  );
};
