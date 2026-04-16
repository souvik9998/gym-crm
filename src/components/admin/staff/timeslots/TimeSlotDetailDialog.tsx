import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
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

interface SlotMember {
  id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  has_pt: boolean;
}

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
  has_existing_pt: boolean;
  existing_trainer_name: string | null;
  existing_trainer_id: string | null;
  is_same_trainer: boolean;
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
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const TimeSlotDetailDialog = ({
  open,
  onOpenChange,
  slot,
  branchId,
  onUpdated,
}: TimeSlotDetailDialogProps) => {
  const [activeTab, setActiveTab] = useState("members");
  const [members, setMembers] = useState<SlotMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Add members state
  const [addMode, setAddMode] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  // Edit state
  const [editCapacity, setEditCapacity] = useState(10);
  const [editStartTime, setEditStartTime] = useState("06:00");
  const [editEndTime, setEditEndTime] = useState("07:00");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Remove confirmation
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string; memberId: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Transfer confirmation
  const [transferConfirm, setTransferConfirm] = useState<{ memberId: string; name: string; fromTrainer: string; fromTrainerId: string } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  // Trainer PT profile
  const [trainerPtId, setTrainerPtId] = useState<string | null>(null);

  const { invalidatePtSubscriptions } = useInvalidateQueries();

  // Resolve trainer's personal_trainer_id
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
  }, [open, slot?.id]);

  const fetchSlotMembers = async () => {
    if (!slot) return;
    setIsLoadingMembers(true);
    try {
      const { data } = await supabase
        .from("time_slot_members")
        .select("id, member_id, members(name, phone)")
        .eq("time_slot_id", slot.id);

      if (data) {
        const { data: ptData } = await supabase
          .from("pt_subscriptions")
          .select("member_id")
          .eq("time_slot_id", slot.id)
          .eq("status", "active");

        const ptMemberIds = new Set((ptData || []).map((p) => p.member_id));

        setMembers(
          data.map((d: any) => ({
            id: d.id,
            member_id: d.member_id,
            member_name: d.members?.name || "Unknown",
            member_phone: d.members?.phone || "",
            has_pt: ptMemberIds.has(d.member_id),
          }))
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

    // Fetch active PT subscriptions for all non-existing members
    const [ptRes, subRes] = await Promise.all([
      supabase
        .from("pt_subscriptions")
        .select("member_id, personal_trainer_id, personal_trainers(name)")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .eq("status", "active"),
      supabase
        .from("subscriptions")
        .select("member_id, end_date")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .in("status", ["active", "expiring_soon"])
        .order("end_date", { ascending: false }),
    ]);

    const ptMap = new Map<string, { trainer_name: string; trainer_id: string }>();
    ptRes.data?.forEach((p: any) => {
      if (!ptMap.has(p.member_id)) {
        ptMap.set(p.member_id, {
          trainer_name: (p.personal_trainers as any)?.name || "Unknown",
          trainer_id: p.personal_trainer_id,
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
        const isSameTrainer = ptInfo?.trainer_id === trainerPtId;
        return {
          ...m,
          selected: false,
          has_existing_pt: !!ptInfo,
          existing_trainer_name: ptInfo?.trainer_name || null,
          existing_trainer_id: ptInfo?.trainer_id || null,
          is_same_trainer: isSameTrainer,
          subscription_end_date: subMap.get(m.id) || null,
        };
      })
      // Sort: selectable first, then grayed (other trainer)
      .sort((a, b) => {
        const aBlocked = a.has_existing_pt && !a.is_same_trainer;
        const bBlocked = b.has_existing_pt && !b.is_same_trainer;
        if (aBlocked && !bBlocked) return 1;
        if (!aBlocked && bBlocked) return -1;
        return a.name.localeCompare(b.name);
      });

    setAvailableMembers(available);
    setMemberSearch("");
    setAddMode(true);
  };

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
      // 1. Insert into time_slot_members
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

      // 2. Create/Update PT subscriptions if trainer has PT profile
      if (trainerPtId) {
        const today = new Date().toISOString().split("T")[0];
        for (const m of selected) {
          try {
            // Check existing active PT for this member + trainer
            const { data: existingPt } = await supabase
              .from("pt_subscriptions")
              .select("id, time_slot_id")
              .eq("member_id", m.id)
              .eq("personal_trainer_id", trainerPtId)
              .eq("status", "active")
              .gte("end_date", today)
              .maybeSingle();

            if (existingPt) {
              await supabase
                .from("pt_subscriptions")
                .update({ time_slot_id: slot.id })
                .eq("id", existingPt.id);
            } else {
              // Deactivate any existing active PT with other trainer
              await supabase
                .from("pt_subscriptions")
                .update({ status: "inactive" } as any)
                .eq("member_id", m.id)
                .eq("status", "active")
                .neq("personal_trainer_id", trainerPtId);

              const endDate = m.subscription_end_date ||
                new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
              const startD = new Date(today);
              const endD = new Date(endDate);
              const months = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30)));

              const { data: ptProfile } = await supabase
                .from("personal_trainers")
                .select("monthly_fee")
                .eq("id", trainerPtId)
                .maybeSingle();

              const monthlyFee = ptProfile?.monthly_fee || 0;

              await supabase.from("pt_subscriptions").insert({
                member_id: m.id,
                personal_trainer_id: trainerPtId,
                branch_id: branchId,
                start_date: today,
                end_date: endDate,
                monthly_fee: monthlyFee,
                total_fee: months * monthlyFee,
                status: "active",
                time_slot_id: slot.id,
              });
            }
          } catch (err) {
            console.error(`PT sync failed for ${m.name}:`, err);
          }
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

      toast.success(`${selected.length} member(s) added`, {
        description: trainerPtId ? "PT subscriptions synced" : "No PT profile — subscriptions not created",
      });
      setAddMode(false);
      fetchSlotMembers();
      onUpdated();
      invalidatePtSubscriptions();
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeConfirm || !slot) return;
    setIsRemoving(true);
    try {
      // 1. Remove from time_slot_members
      await supabase.from("time_slot_members").delete().eq("id", removeConfirm.id);

      // 2. Deactivate PT subscription
      const { data: ptSub } = await supabase
        .from("pt_subscriptions")
        .select("id")
        .eq("member_id", removeConfirm.memberId)
        .eq("time_slot_id", slot.id)
        .eq("status", "active")
        .maybeSingle();

      if (ptSub) {
        await supabase
          .from("pt_subscriptions")
          .update({ status: "inactive", time_slot_id: null } as any)
          .eq("id", ptSub.id);
      }

      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_removed",
        description: `Removed ${removeConfirm.name} from ${slot.trainer_name}'s time slot. PT deactivated.`,
        entityType: "time_slot",
        entityId: slot.id,
        entityName: slot.trainer_name,
        oldValue: { member_name: removeConfirm.name },
        branchId,
      });

      toast.success(`${removeConfirm.name} removed`, { description: "PT subscription deactivated" });
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

      // 1. Remove from old time_slot_members
      await supabase
        .from("time_slot_members")
        .delete()
        .eq("member_id", transferConfirm.memberId)
        .eq("branch_id", branchId);

      // 2. Deactivate old PT subscription
      await supabase
        .from("pt_subscriptions")
        .update({ status: "inactive", time_slot_id: null } as any)
        .eq("member_id", transferConfirm.memberId)
        .eq("status", "active");

      // 3. Add to new time_slot_members
      await supabase.from("time_slot_members").insert({
        time_slot_id: slot.id,
        member_id: transferConfirm.memberId,
        branch_id: branchId,
        assigned_by: "Admin",
      });

      // 4. Create new PT subscription
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

      await supabase.from("pt_subscriptions").insert({
        member_id: transferConfirm.memberId,
        personal_trainer_id: trainerPtId,
        branch_id: branchId,
        start_date: today,
        end_date: endDate,
        monthly_fee: monthlyFee,
        total_fee: months * monthlyFee,
        status: "active",
        time_slot_id: slot.id,
      });

      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_transferred",
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
                    <Badge
                      key={d}
                      variant="secondary"
                      className="text-[9px] px-1 py-0 h-4"
                    >
                      {DAY_LABELS[d]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-5 pb-5 pt-3">
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="members" className="text-xs gap-1 h-7">
                <UserGroupIcon className="w-3.5 h-3.5" /> Members
              </TabsTrigger>
              <TabsTrigger value="edit" className="text-xs gap-1 h-7">
                <PencilIcon className="w-3.5 h-3.5" /> Edit Slot
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-3 space-y-3">
              {addMode ? (
                /* Add members sub-view */
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
                  <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-border/40 p-1.5">
                    {filteredAvailable.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No members found
                      </p>
                    ) : (
                      filteredAvailable.map((m) => {
                        const isBlocked = m.has_existing_pt && !m.is_same_trainer;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                              isBlocked
                                ? "opacity-50 bg-muted/30 cursor-not-allowed"
                                : "hover:bg-muted/50 cursor-pointer"
                            }`}
                            onClick={() => !isBlocked && toggleSelection(m.id)}
                          >
                            {isBlocked ? (
                              <div className="w-4 h-4 rounded border border-muted-foreground/30 shrink-0" />
                            ) : (
                              <Checkbox
                                checked={m.selected}
                                onCheckedChange={() => toggleSelection(m.id)}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`text-sm font-medium truncate ${isBlocked ? "text-muted-foreground" : ""}`}>
                                  {m.name}
                                </p>
                                {isBlocked && (
                                  <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0 shrink-0 px-1.5 py-0">
                                    With {m.existing_trainer_name}
                                  </Badge>
                                )}
                                {m.has_existing_pt && m.is_same_trainer && (
                                  <Badge className="bg-blue-100 text-blue-700 text-[9px] border-0 shrink-0 px-1.5 py-0">
                                    Same Trainer
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{m.phone}</p>
                            </div>
                            {isBlocked && (
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
                    <span className="text-xs text-muted-foreground">
                      {selectedCount} selected
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAddMode(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleAddMembers}
                        disabled={isAddingMembers || selectedCount === 0}
                      >
                        {isAddingMembers && (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        )}
                        Add {selectedCount > 0 ? selectedCount : ""} Member{selectedCount !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Members list view */
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
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleOpenAddMode}
                      disabled={isFull}
                    >
                      <PlusIcon className="w-3 h-3" /> Add
                    </Button>
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
                      <p className="text-sm text-muted-foreground">
                        No members in this slot
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={handleOpenAddMode}
                      >
                        Add Members
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredMembers.map((m, index) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all animate-fade-in"
                          style={{
                            animationDelay: `${index * 30}ms`,
                            animationFillMode: "backwards",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">
                                {m.member_name}
                              </p>
                              {m.has_pt && (
                                <Badge className="bg-primary/10 text-primary text-[9px] px-1 py-0 h-3.5">
                                  PT
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {m.member_phone}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
                            onClick={() =>
                              setRemoveConfirm({ id: m.id, name: m.member_name, memberId: m.member_id })
                            }
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Edit Tab */}
            <TabsContent value="edit" className="mt-3 space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Time</Label>
                  <Input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Capacity</Label>
                <Input
                  type="number"
                  min={Math.max(1, members.length)}
                  value={editCapacity}
                  onChange={(e) =>
                    setEditCapacity(parseInt(e.target.value) || 1)
                  }
                  className="h-9 text-sm"
                />
                {members.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Min capacity: {members.length} (current members)
                  </p>
                )}
              </div>
              <Button
                className="w-full gap-1.5"
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Changes
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remove {removeConfirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will remove <strong>{removeConfirm?.name}</strong> from {slot.trainer_name}'s time slot and{" "}
              <strong>deactivate their PT subscription</strong>. They will no longer have a personal trainer assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove & Deactivate PT"}
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
              • New PT subscription will be created<br />
              • Member will be moved to this time slot
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
    </>
  );
};
