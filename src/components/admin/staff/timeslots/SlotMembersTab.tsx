import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { PlusIcon, XMarkIcon, MagnifyingGlassIcon, UserGroupIcon, ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";

interface SlotMembersTabProps {
  trainers: Staff[];
  currentBranch: any;
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
}

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
  subscription_end_date: string | null;
  subscription_status: string | null;
  has_existing_pt: boolean;
  existing_trainer_name: string | null;
  existing_trainer_id: string | null;
  is_same_trainer: boolean;
}

export const SlotMembersTab = ({ trainers, currentBranch }: SlotMembersTabProps) => {
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
  const [transferConfirm, setTransferConfirm] = useState<{ memberId: string; name: string; fromTrainer: string; fromTrainerId: string } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const { invalidatePtSubscriptions } = useInvalidateQueries();

  // Resolve personal_trainer_id from staff phone
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

  // Fetch slots when trainer changes
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

  // Fetch slot members from pt_subscriptions (source of truth) + time_slot_members
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

      const [ptRes, subRes] = await Promise.all([
        supabase
          .from("pt_subscriptions")
          .select("member_id, status, end_date")
          .eq("time_slot_id", selectedSlot)
          .in("member_id", memberIds),
        supabase
          .from("subscriptions")
          .select("member_id, status, end_date")
          .in("member_id", memberIds)
          .in("status", ["active", "expiring_soon", "expired"])
          .order("end_date", { ascending: false }),
      ]);

      const ptMap = new Map<string, { status: string; end_date: string | null }>();
      ptRes.data?.forEach((p: any) => { if (!ptMap.has(p.member_id)) ptMap.set(p.member_id, p); });

      const subMap = new Map<string, string>();
      subRes.data?.forEach((s: any) => { if (!subMap.has(s.member_id)) subMap.set(s.member_id, s.status); });

      setMembers(tsmData.map((d: any) => {
        const pt = ptMap.get(d.member_id);
        return {
          id: d.id,
          member_id: d.member_id,
          member_name: d.members?.name || "Unknown",
          member_phone: d.members?.phone || "",
          pt_status: pt?.status || "not_synced",
          pt_end_date: pt?.end_date || null,
          subscription_status: subMap.get(d.member_id) || null,
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

    const [subRes, ptRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("member_id, end_date, status")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .in("status", ["active", "expiring_soon"])
        .order("end_date", { ascending: false }),
      supabase
        .from("pt_subscriptions")
        .select("member_id, personal_trainer_id, personal_trainers(name)")
        .in("member_id", memberIds.length > 0 ? memberIds : ["__none__"])
        .eq("status", "active"),
    ]);

    const subMap = new Map<string, { end_date: string; status: string }>();
    subRes.data?.forEach((s: any) => { if (!subMap.has(s.member_id)) subMap.set(s.member_id, s); });

    const ptMap = new Map<string, { trainer_name: string; trainer_id: string }>();
    ptRes.data?.forEach((p: any) => {
      if (!ptMap.has(p.member_id)) {
        ptMap.set(p.member_id, {
          trainer_name: (p.personal_trainers as any)?.name || "Unknown",
          trainer_id: p.personal_trainer_id,
        });
      }
    });

    const mappedMembers = available
      .map(m => {
        const sub = subMap.get(m.id);
        const ptInfo = ptMap.get(m.id);
        const isSameTrainer = ptInfo?.trainer_id === trainerPtId;
        return {
          ...m,
          selected: false,
          subscription_end_date: sub?.end_date || null,
          subscription_status: sub?.status || null,
          has_existing_pt: !!ptInfo,
          existing_trainer_name: ptInfo?.trainer_name || null,
          existing_trainer_id: ptInfo?.trainer_id || null,
          is_same_trainer: isSameTrainer,
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

    setAvailableMembers(mappedMembers);
    setMemberSearch("");
    setAddDialogOpen(true);
  };

  const handleAddMembers = async () => {
    const selected = availableMembers.filter(m => m.selected);
    if (selected.length === 0) { toast.error("Select at least one member"); return; }
    if (members.length + selected.length > slotCapacity) {
      toast.error(`Slot capacity is ${slotCapacity}. Cannot add ${selected.length} more members.`);
      return;
    }

    setIsProcessing(true);
    try {
      const inserts = selected.map(m => ({
        time_slot_id: selectedSlot,
        member_id: m.id,
        branch_id: currentBranch.id,
      }));

      const { error } = await supabase.from("time_slot_members").insert(inserts);
      if (error) { toast.error("Failed to add members", { description: error.message }); return; }

      if (trainerPtId) {
        const today = new Date().toISOString().split("T")[0];
        let successCount = 0;
        let errorCount = 0;

        for (const m of selected) {
          try {
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
                .update({ time_slot_id: selectedSlot })
                .eq("id", existingPt.id);
            } else {
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
                branch_id: currentBranch.id,
                start_date: today,
                end_date: endDate,
                monthly_fee: monthlyFee,
                total_fee: months * monthlyFee,
                status: "active",
                time_slot_id: selectedSlot,
              });
            }
            successCount++;
          } catch (err) {
            console.error(`PT sync failed for ${m.name}:`, err);
            errorCount++;
          }
        }

        if (errorCount > 0) {
          toast.warning(`${successCount} member(s) assigned, ${errorCount} failed PT sync`);
        } else {
          toast.success(`${successCount} member(s) assigned to ${trainerName}'s slot with PT subscription created`, {
            description: "PT records updated • Member profiles synced",
          });
        }
      } else {
        toast.warning(`${selected.length} member(s) added to slot but trainer has no PT profile. PT subscriptions not created.`);
      }

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
      await supabase.from("time_slot_members").delete().eq("id", removeConfirm.id);

      const { data: ptSub } = await supabase
        .from("pt_subscriptions")
        .select("id")
        .eq("member_id", removeConfirm.memberId)
        .eq("time_slot_id", selectedSlot)
        .eq("status", "active")
        .maybeSingle();

      if (ptSub) {
        await supabase
          .from("pt_subscriptions")
          .update({ status: "inactive", time_slot_id: null } as any)
          .eq("id", ptSub.id);
      }

      toast.success(`${removeConfirm.name} removed from slot`, {
        description: "PT subscription deactivated",
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
        branch_id: currentBranch.id,
        start_date: today,
        end_date: endDate,
        monthly_fee: monthlyFee,
        total_fee: months * monthlyFee,
        status: "active",
        time_slot_id: selectedSlot,
      });

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
          Assign members to trainer time slots. This automatically creates PT subscriptions.
        </p>
      </div>

      {/* Trainer PT warning */}
      {selectedTrainer && !trainerPtId && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            This trainer has no active Personal Trainer profile. Members added here won't have PT subscriptions created automatically. 
            Please add a PT profile for this trainer first.
          </p>
        </div>
      )}

      {/* Selectors */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Select Trainer</label>
          <Select value={selectedTrainer} onValueChange={setSelectedTrainer}>
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

      {/* Members list */}
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
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleOpenAddMembers} disabled={isFull}>
                  <PlusIcon className="w-3 h-3" /> Assign Members
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-8">
                <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No members assigned to this slot</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add members to automatically create PT subscriptions</p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
                      onClick={() => setRemoveConfirm({ id: m.id, name: m.member_name, memberId: m.member_id })}
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                      Remove
                    </Button>
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
              Adding members here will automatically create PT subscriptions linked to <strong>{trainerName}</strong>. 
              Members assigned to other trainers are shown grayed out — use Transfer to reassign.
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
                  const isBlocked = m.has_existing_pt && !m.is_same_trainer;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                        isBlocked
                          ? "opacity-50 bg-muted/30 border-border/30 cursor-not-allowed"
                          : "border-transparent hover:border-border hover:bg-muted/50 cursor-pointer"
                      }`}
                      onClick={() => !isBlocked && toggleMemberSelection(m.id)}
                    >
                      {isBlocked ? (
                        <div className="w-4 h-4 rounded border border-muted-foreground/30 shrink-0" />
                      ) : (
                        <Checkbox checked={m.selected} onCheckedChange={() => toggleMemberSelection(m.id)} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${isBlocked ? "text-muted-foreground" : ""}`}>{m.name}</p>
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
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                          {m.subscription_status && (
                            <span className="text-[10px] text-muted-foreground">
                              Gym: {m.subscription_status === "active" ? "✓ Active" : m.subscription_status === "expiring_soon" ? "⚠ Expiring" : m.subscription_status}
                            </span>
                          )}
                          {m.subscription_end_date && (
                            <span className="text-[10px] text-muted-foreground">
                              till {new Date(m.subscription_end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
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
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircleIcon className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-foreground">
                  <strong>{selectedCount}</strong> member{selectedCount > 1 ? "s" : ""} selected — 
                  PT subscriptions will be created for each
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
            <AlertDialogTitle className="text-base">Remove {removeConfirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will remove <strong>{removeConfirm?.name}</strong> from {trainerName}'s time slot and{" "}
              <strong>deactivate their PT subscription</strong>. They will no longer have a personal trainer assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveMember} 
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? "Removing..." : "Remove & Deactivate PT"}
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
    </div>
  );
};
