import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  FunnelIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TimePicker12h } from "@/components/ui/time-picker-12h";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TransferSlotDialog } from "./TransferSlotDialog";
import {
  AVAILABILITY_OPTIONS,
  formatTimeLabel,
  getSlotAvailability,
  getUtilizationPercent,
  matchesTimeFilter,
  type SlotAvailability,
  type TimeBucket,
} from "./timeSlotUtils";
import { TimeBucketChips } from "@/components/admin/TimeBucketChips";

interface SlotMembersTabProps {
  trainers: Staff[];
  currentBranch: any;
  restrictedTrainerId?: string | null;
  canAssign?: boolean;
  canRemove?: boolean;
  trainerNameMap?: Record<string, string>;
}

interface TimeSlot {
  id: string;
  trainer_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  status?: string | null;
  trainer_name: string;
  member_count: number;
  availability: Exclude<SlotAvailability, "all">;
  utilization: number;
}

interface SlotMember {
  id: string;
  slot_id: string;
  slot_label: string;
  trainer_id: string;
  trainer_name: string;
  slot_capacity: number;
  slot_member_count: number;
  member_id: string;
  member_name: string;
  member_phone: string;
  pt_status: string;
  pt_end_date: string | null;
  subscription_status: string | null;
  current_pt_trainer_id: string | null;
  current_pt_trainer_name: string | null;
  is_trainer_replaced: boolean;
  hasSlotMemberRow: boolean;
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

const SLOTS_QUERY_KEY = "slot-members-panel-slots";
const MEMBERS_QUERY_KEY = "slot-members-panel-members";

export const SlotMembersTab = ({
  trainers,
  currentBranch,
  restrictedTrainerId = null,
  canAssign = true,
  canRemove = true,
  trainerNameMap = {},
}: SlotMembersTabProps) => {
  const queryClient = useQueryClient();
  const { invalidatePtSubscriptions } = useInvalidateQueries();

  const [selectedSlot, setSelectedSlot] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string; memberId: string; slotId: string } | null>(null);
  const [trainerName, setTrainerName] = useState("");
  const [filterTrainer, setFilterTrainer] = useState<string>(restrictedTrainerId || "all");
  const [filterAvailability, setFilterAvailability] = useState<SlotAvailability>("all");
  const [timeFilter, setTimeFilter] = useState<TimeBucket>("all");
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("10:00");
  const [slotSearch, setSlotSearch] = useState("");

  const [transferConfirm, setTransferConfirm] = useState<{
    memberId: string;
    name: string;
    fromTrainer: string;
    fromTrainerId: string;
    ptSubId: string;
  } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const [moveSlot, setMoveSlot] = useState<{
    rowId: string;
    memberId: string;
    memberName: string;
    trainerId: string;
    trainerName: string;
    currentSlotId: string;
  } | null>(null);

  useEffect(() => {
    if (restrictedTrainerId) setFilterTrainer(restrictedTrainerId);
  }, [restrictedTrainerId]);

  const { data: slots = [], isLoading: isSlotsLoading, isFetching: isSlotsFetching } = useQuery<TimeSlot[]>({
    queryKey: [SLOTS_QUERY_KEY, currentBranch?.id, restrictedTrainerId, Object.keys(trainerNameMap).sort().join(","), trainers.map((t) => t.id).sort().join(",")],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      let query = supabase
        .from("trainer_time_slots")
        .select("id, trainer_id, start_time, end_time, capacity, status")
        .eq("branch_id", currentBranch.id)
        .order("start_time");

      if (restrictedTrainerId) query = query.eq("trainer_id", restrictedTrainerId);

      const { data: slotData } = await query;
      if (!slotData?.length) return [];

      const slotIds = slotData.map((slot) => slot.id);
      const today = new Date().toISOString().split("T")[0];
      const [ptRowsResult, namesResult] = await Promise.all([
        supabase
          .from("pt_subscriptions")
          .select("time_slot_id, member_id")
          .in("time_slot_id", slotIds)
          .eq("status", "active")
          .gte("end_date", today),
        supabase.rpc("get_staff_names_for_branch" as any, { _branch_id: currentBranch.id }),
      ]);

      const countsBySlot = new Map<string, Set<string>>();
      ((ptRowsResult.data as any[]) || []).forEach((row) => {
        if (!row.time_slot_id) return;
        if (!countsBySlot.has(row.time_slot_id)) countsBySlot.set(row.time_slot_id, new Set());
        countsBySlot.get(row.time_slot_id)?.add(row.member_id);
      });

      const rpcNameMap = new Map<string, string>();
      (((namesResult.data as any[]) || []) as Array<{ id: string; full_name: string }>).forEach((row) => {
        rpcNameMap.set(row.id, row.full_name);
      });

      return slotData.map((slot) => {
        const memberCount = countsBySlot.get(slot.id)?.size ?? 0;
        return {
          ...slot,
          trainer_name:
            trainers.find((trainer) => trainer.id === slot.trainer_id)?.full_name ||
            trainerNameMap[slot.trainer_id] ||
            rpcNameMap.get(slot.trainer_id) ||
            "Unknown Trainer",
          member_count: memberCount,
          availability: getSlotAvailability(memberCount, slot.capacity),
          utilization: getUtilizationPercent(memberCount, slot.capacity),
        } as TimeSlot;
      });
    },
    enabled: !!currentBranch?.id,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
  });

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (filterTrainer !== "all" && slot.trainer_id !== filterTrainer) return false;
      if (filterAvailability !== "all" && slot.availability !== filterAvailability) return false;
      if (!matchesTimeFilter(slot.start_time, timeFilter, customStart, customEnd, slot.end_time)) return false;
      if (!slotSearch) return true;
      const query = slotSearch.toLowerCase();
      const slotText = `${slot.trainer_name} ${formatTimeLabel(slot.start_time)} ${formatTimeLabel(slot.end_time)}`.toLowerCase();
      return slotText.includes(query);
    });
  }, [slots, filterTrainer, filterAvailability, timeFilter, customStart, customEnd, slotSearch]);

  useEffect(() => {
    setSelectedSlot((current) => (current && filteredSlots.some((slot) => slot.id === current) ? current : ""));
  }, [filteredSlots]);

  const selectedSlotData = useMemo(() => slots.find((slot) => slot.id === selectedSlot) || null, [slots, selectedSlot]);
  const visibleSlotIds = useMemo(() => (selectedSlot ? [selectedSlot] : filteredSlots.map((slot) => slot.id)), [selectedSlot, filteredSlots]);

  const { data: trainerPtMeta } = useQuery<{ trainerPtId: string | null; trainerName: string }>({
    queryKey: ["slot-members-panel-trainer-meta", currentBranch?.id, selectedSlotData?.trainer_id, trainerNameMap[selectedSlotData?.trainer_id || ""]],
    queryFn: async () => {
      if (!selectedSlotData?.trainer_id || !currentBranch?.id) return { trainerPtId: null, trainerName: "" };

      const { data: staffRec } = await supabase
        .from("staff" as any)
        .select("phone, full_name")
        .eq("id", selectedSlotData.trainer_id)
        .maybeSingle();

      const staff = staffRec as any;
      const resolvedName = staff?.full_name || trainerNameMap[selectedSlotData.trainer_id] || selectedSlotData.trainer_name || "";
      if (!staff?.phone) return { trainerPtId: null, trainerName: resolvedName };

      const { data: ptProfile } = await supabase
        .from("personal_trainers")
        .select("id")
        .eq("phone", staff.phone)
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true)
        .maybeSingle();

      return { trainerPtId: ptProfile?.id || null, trainerName: resolvedName };
    },
    enabled: !!selectedSlotData?.trainer_id && !!currentBranch?.id,
    staleTime: STALE_TIMES.SEMI_STATIC,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setTrainerName(trainerPtMeta?.trainerName || selectedSlotData?.trainer_name || "");
  }, [trainerPtMeta?.trainerName, selectedSlotData?.trainer_name]);

  const trainerPtId = trainerPtMeta?.trainerPtId || null;

  const { data: members = [], isLoading: isMembersLoading, isFetching: isMembersFetching } = useQuery<SlotMember[]>({
    queryKey: [MEMBERS_QUERY_KEY, currentBranch?.id, visibleSlotIds.join(","), selectedSlotData?.trainer_id, slots.map((s) => `${s.id}:${s.member_count}`).join("|")],
    queryFn: async () => {
      if (!visibleSlotIds.length) return [];

      const today = new Date().toISOString().split("T")[0];
      const { data: ptRows } = await supabase
        .from("pt_subscriptions")
        .select("member_id, time_slot_id, status, end_date, personal_trainer_id, members(name, phone), personal_trainers(name)")
        .in("time_slot_id", visibleSlotIds)
        .eq("status", "active")
        .gte("end_date", today);

      if (!ptRows?.length) return [];

      const memberIds = Array.from(new Set((ptRows as any[]).map((row: any) => row.member_id)));
      const [tsmRes, subRes] = await Promise.all([
        supabase
          .from("time_slot_members")
          .select("id, member_id, time_slot_id")
          .in("time_slot_id", visibleSlotIds)
          .in("member_id", memberIds),
        supabase
          .from("subscriptions")
          .select("member_id, status, end_date")
          .in("member_id", memberIds)
          .in("status", ["active", "expiring_soon", "expired"])
          .order("end_date", { ascending: false }),
      ]);

      const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
      const tsmMap = new Map<string, { id: string; time_slot_id: string }>();
      ((tsmRes.data as any[]) || []).forEach((row) => {
        tsmMap.set(`${row.time_slot_id}:${row.member_id}`, { id: row.id, time_slot_id: row.time_slot_id });
      });

      const subStatusMap = new Map<string, string>();
      (subRes.data || []).forEach((row: any) => {
        if (!subStatusMap.has(row.member_id)) subStatusMap.set(row.member_id, row.status);
      });

      const seen = new Set<string>();
      const nextMembers: SlotMember[] = [];
      (ptRows as any[]).forEach((row: any) => {
        const compoundKey = `${row.time_slot_id}:${row.member_id}`;
        if (seen.has(compoundKey)) return;
        seen.add(compoundKey);

        const slot = slotMap.get(row.time_slot_id);
        if (!slot) return;
        const rowRef = tsmMap.get(compoundKey);
        const isTrainerReplaced = !!(
          row.personal_trainer_id &&
          selectedSlotData?.trainer_id &&
          row.personal_trainer_id !== selectedSlotData.trainer_id
        );

        nextMembers.push({
          id: rowRef?.id || `pt-${row.time_slot_id}-${row.member_id}`,
          slot_id: row.time_slot_id,
          slot_label: `${formatTimeLabel(slot.start_time)} – ${formatTimeLabel(slot.end_time)}`,
          trainer_id: slot.trainer_id,
          trainer_name: slot.trainer_name,
          slot_capacity: slot.capacity,
          slot_member_count: slot.member_count,
          member_id: row.member_id,
          member_name: row.members?.name || "Unknown",
          member_phone: row.members?.phone || "",
          pt_status: row.status,
          pt_end_date: row.end_date,
          subscription_status: subStatusMap.get(row.member_id) || null,
          current_pt_trainer_id: row.personal_trainer_id,
          current_pt_trainer_name: row.personal_trainers?.name || slot.trainer_name,
          is_trainer_replaced: isTrainerReplaced,
          hasSlotMemberRow: !!rowRef,
        });
      });

      return nextMembers.sort((a, b) => {
        if (a.slot_label !== b.slot_label) return a.slot_label.localeCompare(b.slot_label);
        return a.member_name.localeCompare(b.member_name);
      });
    },
    enabled: visibleSlotIds.length > 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
  });

  const refreshLocalQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [SLOTS_QUERY_KEY], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: [MEMBERS_QUERY_KEY], refetchType: "all" }),
      invalidatePtSubscriptions(),
    ]);
  }, [invalidatePtSubscriptions, queryClient]);

  const handleOpenAddMembers = async () => {
    if (!currentBranch?.id || !selectedSlot || !selectedSlotData) return;
    const existingIds = members.filter((member) => member.slot_id === selectedSlot).map((member) => member.member_id);

    const { data } = await supabase
      .from("members")
      .select("id, name, phone")
      .eq("branch_id", currentBranch.id)
      .order("name");

    if (!data) return;

    const available = data.filter((member) => !existingIds.includes(member.id));
    const memberIds = available.map((member) => member.id);
    const today = new Date().toISOString().split("T")[0];

    const [ptRes, subRes] = await Promise.all([
      supabase
        .from("pt_subscriptions")
        .select("id, member_id, personal_trainer_id, end_date, personal_trainers(name)")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .eq("status", "active")
        .gte("end_date", today),
      supabase
        .from("subscriptions")
        .select("member_id, end_date, status")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .in("status", ["active", "expiring_soon"])
        .gte("end_date", today)
        .order("end_date", { ascending: false }),
    ]);

    const ptMap = new Map<string, { trainer_name: string; trainer_id: string; pt_sub_id: string }>();
    ptRes.data?.forEach((row: any) => {
      if (!ptMap.has(row.member_id)) {
        ptMap.set(row.member_id, {
          trainer_name: row.personal_trainers?.name || "Unknown",
          trainer_id: row.personal_trainer_id,
          pt_sub_id: row.id,
        });
      }
    });

    const subMap = new Map<string, { end_date: string; status: string }>();
    subRes.data?.forEach((row: any) => {
      if (!subMap.has(row.member_id)) subMap.set(row.member_id, row);
    });

    const mappedMembers = available
      .filter((member) => subMap.has(member.id))
      .map((member) => {
        const subscription = subMap.get(member.id);
        const ptInfo = ptMap.get(member.id);
        let ptStatus: "same_trainer" | "other_trainer" | "no_pt" = "no_pt";
        if (ptInfo) ptStatus = ptInfo.trainer_id === trainerPtId ? "same_trainer" : "other_trainer";

        return {
          ...member,
          selected: false,
          subscription_end_date: subscription?.end_date || null,
          subscription_status: subscription?.status || null,
          pt_status: ptStatus,
          existing_trainer_name: ptInfo?.trainer_name || null,
          existing_trainer_id: ptInfo?.trainer_id || null,
          pt_subscription_id: ptInfo?.pt_sub_id || null,
        };
      })
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

  const handleAddMembers = async () => {
    if (!selectedSlot || !selectedSlotData) return;
    const selected = availableMembers.filter((member) => member.selected);
    if (selected.length === 0) return toast.error("Select at least one member");

    const existingCount = members.filter((member) => member.slot_id === selectedSlot).length;
    if (existingCount + selected.length > selectedSlotData.capacity) {
      return toast.error(`Slot capacity is ${selectedSlotData.capacity}. Cannot add ${selected.length} more members.`);
    }

    setIsProcessing(true);
    try {
      const inserts = selected.map((member) => ({ time_slot_id: selectedSlot, member_id: member.id, branch_id: currentBranch.id }));
      const { error } = await supabase.from("time_slot_members").insert(inserts);
      if (error) return toast.error("Failed to add members", { description: error.message });

      await Promise.all(
        selected
          .filter((member) => member.pt_subscription_id)
          .map((member) => supabase.from("pt_subscriptions").update({ time_slot_id: selectedSlot }).eq("id", member.pt_subscription_id!)),
      );

      toast.success(`${selected.length} member(s) assigned to ${selectedSlotData.trainer_name}'s slot`, {
        description: "Time slot linked to existing PT subscriptions",
      });
      setAddDialogOpen(false);
      await refreshLocalQueries();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeConfirm) return;
    setIsProcessing(true);
    try {
      if (!removeConfirm.id.startsWith("pt-")) {
        await supabase.from("time_slot_members").delete().eq("id", removeConfirm.id);
      }

      await supabase
        .from("pt_subscriptions")
        .update({ time_slot_id: null } as any)
        .eq("member_id", removeConfirm.memberId)
        .eq("time_slot_id", removeConfirm.slotId)
        .eq("status", "active");

      toast.success(`${removeConfirm.name} removed from slot`, {
        description: "PT subscription remains active without a slot assignment",
      });
      setRemoveConfirm(null);
      await refreshLocalQueries();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTransferMember = async () => {
    if (!transferConfirm || !trainerPtId || !selectedSlot || !selectedSlotData) return;
    setIsTransferring(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      await supabase.from("time_slot_members").delete().eq("member_id", transferConfirm.memberId).eq("branch_id", currentBranch.id);
      await supabase
        .from("pt_subscriptions")
        .update({ status: "inactive", time_slot_id: null } as any)
        .eq("member_id", transferConfirm.memberId)
        .eq("status", "active");
      await supabase.from("time_slot_members").insert({
        time_slot_id: selectedSlot,
        member_id: transferConfirm.memberId,
        branch_id: currentBranch.id,
      });

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
      const { data: ptProfile } = await supabase.from("personal_trainers").select("monthly_fee").eq("id", trainerPtId).maybeSingle();
      const monthlyFee = ptProfile?.monthly_fee || 0;

      const { data: insertedPt } = await supabase
        .from("pt_subscriptions")
        .insert({
          member_id: transferConfirm.memberId,
          personal_trainer_id: trainerPtId,
          branch_id: currentBranch.id,
          start_date: today,
          end_date: endDate,
          monthly_fee: monthlyFee,
          total_fee: months * monthlyFee,
          status: "active",
          time_slot_id: selectedSlot,
        })
        .select("id")
        .single();

      try {
        await createMembershipIncomeEntry(
          months * monthlyFee,
          "pt_subscription",
          `PT subscription — ${selectedSlotData.trainer_name} for ${transferConfirm.name} (transferred)`,
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

      toast.success(`${transferConfirm.name} transferred to ${selectedSlotData.trainer_name}`, {
        description: `Previous PT with ${transferConfirm.fromTrainer} deactivated`,
      });
      setTransferConfirm(null);
      setAddDialogOpen(false);
      await refreshLocalQueries();
    } finally {
      setIsTransferring(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setAvailableMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, selected: !member.selected } : member)));
  };

  const visibleSlotIdSet = useMemo(() => new Set(visibleSlotIds), [visibleSlotIds]);

  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        // Guard against stale placeholderData when filters narrow to zero slots —
        // ensures Night/Custom filters never leak in members from a prior selection.
        if (!visibleSlotIdSet.has(member.slot_id)) return false;
        const query = searchFilter.trim().toLowerCase();
        if (!query) return true;
        return [member.member_name, member.member_phone, member.trainer_name, member.slot_label]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      }),
    [members, searchFilter, visibleSlotIdSet],
  );

  const filteredAvailable = useMemo(
    () =>
      availableMembers.filter((member) => {
        const query = memberSearch.trim().toLowerCase();
        if (!query) return true;
        return member.name.toLowerCase().includes(query) || member.phone.includes(query);
      }),
    [availableMembers, memberSearch],
  );

  const selectedCount = availableMembers.filter((member) => member.selected).length;
  const selectedSlotCount = selectedSlot ? members.filter((member) => member.slot_id === selectedSlot).length : 0;
  const isSelectedSlotFull = !!selectedSlotData && selectedSlotCount >= selectedSlotData.capacity;
  const visibleUtilization = selectedSlotData
    ? getUtilizationPercent(selectedSlotCount, selectedSlotData.capacity)
    : filteredSlots.length
      ? Math.round(filteredSlots.reduce((sum, slot) => sum + slot.utilization, 0) / filteredSlots.length)
      : 0;

  const getPtBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="secondary" className="bg-secondary/80">PT Active</Badge>;
      case "expired":
        return <Badge variant="destructive">PT Expired</Badge>;
      case "not_synced":
        return <Badge variant="outline">No PT Record</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSubBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "active":
        return <Badge variant="secondary" className="bg-primary/10 text-foreground">Gym Active</Badge>;
      case "expiring_soon":
        return <Badge variant="outline">Gym Expiring</Badge>;
      case "expired":
        return <Badge variant="destructive">Gym Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const FilterSkeleton = () => (
    <Card className="border-border/60 bg-card/70 shadow-sm backdrop-blur-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-md" />)}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
        </div>
      </CardContent>
    </Card>
  );

  const RowsSkeleton = () => (
    <Card className="border-border/60 bg-card/70 shadow-sm backdrop-blur-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-9 w-60 rounded-md" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border/60 bg-background/70 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-20" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div>
            <div className="flex justify-end"><Skeleton className="h-8 w-20 rounded-full" /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold lg:text-lg">Slot Member Management</h3>
        <p className="text-xs text-muted-foreground lg:text-sm">
          Filter members by slot, time window, and trainer. Trainer names stay visible across the branch for quick assignment review.
        </p>
      </div>

      {isSlotsLoading ? (
        <>
          <FilterSkeleton />
          <RowsSkeleton />
        </>
      ) : (
        <>
          <Card className="border-border/60 bg-card/75 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-card/65">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <FunnelIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Time-based filters</p>
                    {isSlotsFetching && <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground">Mix time, trainer, availability, and a specific slot when needed.</p>
                </div>
              </div>

              <TimeBucketChips value={timeFilter} onChange={setTimeFilter} />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {!restrictedTrainerId && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Trainer</label>
                    <Select value={filterTrainer} onValueChange={setFilterTrainer}>
                      <SelectTrigger className="h-9 border-border/70 bg-background/70 text-sm backdrop-blur-sm"><SelectValue placeholder="All trainers" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All trainers</SelectItem>
                        {trainers.filter((trainer) => trainer.is_active).map((trainer) => (
                          <SelectItem key={trainer.id} value={trainer.id}>{trainer.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Availability</label>
                  <Select value={filterAvailability} onValueChange={(value) => setFilterAvailability(value as SlotAvailability)}>
                    <SelectTrigger className="h-9 border-border/70 bg-background/70 text-sm backdrop-blur-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 xl:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Search slot or trainer</label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by trainer or time..."
                      value={slotSearch}
                      onChange={(e) => setSlotSearch(e.target.value)}
                      className="h-9 border-border/70 bg-background/70 pl-8 text-sm backdrop-blur-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Exact slot</label>
                  <Select value={selectedSlot || "all"} onValueChange={(value) => setSelectedSlot(value === "all" ? "" : value)}>
                    <SelectTrigger className="h-9 border-border/70 bg-background/70 text-sm backdrop-blur-sm"><SelectValue placeholder="All filtered slots" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All filtered slots</SelectItem>
                      {filteredSlots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.trainer_name} • {formatTimeLabel(slot.start_time)} – {formatTimeLabel(slot.end_time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {timeFilter === "custom" && (
                <div className="grid gap-3 rounded-xl border border-success/20 bg-success/5 p-3 sm:grid-cols-2 lg:max-w-md">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Start time</label>
                    <TimePicker12h value={customStart} onChange={setCustomStart} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">End time</label>
                    <TimePicker12h value={customEnd} onChange={setCustomEnd} />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-foreground">{filteredSlots.length} slot{filteredSlots.length === 1 ? "" : "s"}</Badge>
                <Badge variant="outline" className="border-accent/20 bg-accent/5 text-foreground">{filteredMembers.length} member{filteredMembers.length === 1 ? "" : "s"}</Badge>
                <Badge variant="outline" className="border-success/20 bg-success/5 text-foreground">{visibleUtilization}% utilization</Badge>
                {selectedSlotData && (
                  <Badge variant="secondary" className="border border-primary/20 bg-primary/12 text-foreground">
                    {selectedSlotData.trainer_name} • {formatTimeLabel(selectedSlotData.start_time)} – {formatTimeLabel(selectedSlotData.end_time)}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedSlotData && !trainerPtId && (
            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 backdrop-blur-sm text-foreground">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs">
                This trainer has no active Personal Trainer profile. Only members with an existing PT subscription under this trainer can be assigned here.
              </p>
            </div>
          )}

          {isMembersLoading ? (
            <RowsSkeleton />
          ) : (
            <Card className="border-border/60 bg-card/75 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-card/65">
              <CardContent className="space-y-3 p-3 lg:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{selectedSlotData ? "Selected slot members" : "Members across filtered slots"}</p>
                      {isMembersFetching && !isMembersLoading && <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedSlotData
                        ? `${selectedSlotCount}/${selectedSlotData.capacity} assigned • ${selectedSlotData.trainer_name}`
                        : "Compare members across matching slots and then drill into one slot for actions."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search members, trainer, phone"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="h-8 w-56 border-border/70 bg-background/70 pl-8 text-xs backdrop-blur-sm"
                      />
                    </div>
                  </div>
                </div>

                {selectedSlotData && isSelectedSlotFull && <Badge variant="destructive">This slot is full</Badge>}

                {!selectedSlotData && (
                  <div className="rounded-lg border border-border/70 bg-background/45 p-3 text-xs text-muted-foreground backdrop-blur-sm">
                    Select an exact slot when you need to assign, remove, or transfer members. Browsing stays enabled across all matching slots.
                  </div>
                )}

                {filteredMembers.length === 0 ? (
                  <div className="py-8 text-center">
                    <UserGroupIcon className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">No members found for the current filters</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">Try another time window, trainer, or slot.</p>
                  </div>
                ) : (
                  <TooltipProvider delayDuration={150}>
                    <div className="space-y-2">
                      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                        <span>Member</span>
                        <span>Trainer</span>
                        <span>Slot</span>
                        <span className="text-right">Actions</span>
                      </div>
                      {filteredMembers.map((member) => {
                        const actionsEnabled = !!selectedSlotData && member.slot_id === selectedSlotData.id;
                        return (
                          <div
                            key={`${member.slot_id}-${member.member_id}`}
                            className="grid gap-3 rounded-lg border border-border/70 bg-background/70 p-3 backdrop-blur-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{member.member_name}</p>
                                {getPtBadge(member.pt_status)}
                                {getSubBadge(member.subscription_status)}
                                {member.is_trainer_replaced && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="cursor-help bg-background/60">Trainer replaced</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[260px]">
                                      <p className="text-xs">
                                        PT trainer changed to <strong>{member.current_pt_trainer_name}</strong>. Move them to one of that trainer&apos;s slots if needed.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{member.member_phone}</span>
                                {member.pt_end_date && (
                                  <span className="inline-flex items-center gap-1">
                                    <ClockIcon className="h-3 w-3" /> PT ends {new Date(member.pt_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{member.trainer_name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">Assigned trainer</p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{member.slot_label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{member.slot_member_count}/{member.slot_capacity} members</p>
                            </div>

                            <div className="flex items-center justify-end gap-1">
                              {actionsEnabled && canAssign && member.current_pt_trainer_id && member.hasSlotMemberRow && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs hover:bg-primary/5"
                                      onClick={() =>
                                        setMoveSlot({
                                          rowId: member.id,
                                          memberId: member.member_id,
                                          memberName: member.member_name,
                                          trainerId: member.current_pt_trainer_id!,
                                          trainerName: member.current_pt_trainer_name || member.trainer_name,
                                          currentSlotId: member.slot_id,
                                        })
                                      }
                                    >
                                      <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
                                      <span className="hidden sm:inline">Transfer</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">Move to another slot under <strong>{member.current_pt_trainer_name}</strong></p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {actionsEnabled && canRemove && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => setRemoveConfirm({ id: member.id, name: member.member_name, memberId: member.member_id, slotId: member.slot_id })}
                                >
                                  <XMarkIcon className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Remove</span>
                                </Button>
                              )}
                              {!actionsEnabled && <Badge variant="outline" className="bg-background/60">View only</Badge>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TooltipProvider>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="p-4 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserGroupIcon className="h-5 w-5" />
              Assign Members to Time Slot
            </DialogTitle>
            <DialogDescription className="text-xs">
              Only members with an active PT subscription under <strong>{trainerName}</strong> can be assigned.
              Members with other trainers can be transferred into <strong>{selectedSlotData?.trainer_name}</strong>&apos;s selected slot.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredAvailable.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No members found</p>
              ) : (
                filteredAvailable.map((member) => {
                  const isSelectable = member.pt_status === "same_trainer";
                  const isOtherTrainer = member.pt_status === "other_trainer";
                  const isNoPt = member.pt_status === "no_pt";

                  return (
                    <div
                      key={member.id}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                        isSelectable
                          ? "cursor-pointer border-transparent hover:border-border hover:bg-muted/50"
                          : "cursor-not-allowed border-border/30 bg-muted/30 opacity-50"
                      }`}
                      onClick={() => isSelectable && toggleMemberSelection(member.id)}
                    >
                      {isSelectable ? (
                        <Checkbox checked={member.selected} onCheckedChange={() => toggleMemberSelection(member.id)} />
                      ) : (
                        <div className="h-4 w-4 shrink-0 rounded border border-muted-foreground/30" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`truncate text-sm font-medium ${!isSelectable ? "text-muted-foreground" : "text-foreground"}`}>{member.name}</p>
                          {isOtherTrainer && <Badge variant="outline">With {member.existing_trainer_name}</Badge>}
                          {isNoPt && <Badge variant="outline">No PT</Badge>}
                          {isSelectable && <Badge variant="secondary">PT Active</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{member.phone}</p>
                          {member.subscription_end_date && (
                            <span className="text-[10px] text-muted-foreground">
                              till {new Date(member.subscription_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      {isOtherTrainer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTransferConfirm({
                              memberId: member.id,
                              name: member.name,
                              fromTrainer: member.existing_trainer_name || "Unknown",
                              fromTrainerId: member.existing_trainer_id || "",
                              ptSubId: member.pt_subscription_id || "",
                            });
                          }}
                        >
                          <ArrowsRightLeftIcon className="h-3 w-3" />
                          Transfer
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
                <p className="text-xs text-foreground">
                  <strong>{selectedCount}</strong> member{selectedCount > 1 ? "s" : ""} selected — will be assigned to this time slot.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)} disabled={isProcessing}>Cancel</Button>
            <Button size="sm" onClick={handleAddMembers} disabled={isProcessing || selectedCount === 0}>
              {isProcessing ? "Assigning..." : `Assign ${selectedCount > 0 ? selectedCount : ""} Member${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Remove {removeConfirm?.name} from slot?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              <strong>{removeConfirm?.name}</strong> will be removed from this time slot. Their PT subscription with {trainerName || selectedSlotData?.trainer_name} will remain active but won&apos;t be linked to any slot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? "Removing..." : "Remove from Slot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!transferConfirm} onOpenChange={(open) => !open && setTransferConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Transfer {transferConfirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will transfer <strong>{transferConfirm?.name}</strong> from <strong>{transferConfirm?.fromTrainer}</strong> to <strong>{trainerName || selectedSlotData?.trainer_name}</strong>.
              <br /><br />
              • Previous PT subscription will be deactivated<br />
              • New PT subscription will be created with {trainerName || selectedSlotData?.trainer_name}<br />
              • Member will be assigned to this time slot
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

      {moveSlot && (
        <TransferSlotDialog
          open={!!moveSlot}
          onOpenChange={(open) => !open && setMoveSlot(null)}
          currentSlotId={moveSlot.currentSlotId}
          slotMemberRowId={moveSlot.rowId}
          memberId={moveSlot.memberId}
          memberName={moveSlot.memberName}
          currentPtTrainerId={moveSlot.trainerId}
          currentPtTrainerName={moveSlot.trainerName}
          branchId={currentBranch?.id}
          onTransferred={async () => {
            setMoveSlot(null);
            await refreshLocalQueries();
          }}
        />
      )}
    </div>
  );
};
