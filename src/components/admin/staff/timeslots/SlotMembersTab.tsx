import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { PlusIcon, XMarkIcon, MagnifyingGlassIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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
}

interface AvailableMember {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
}

export const SlotMembersTab = ({ trainers, currentBranch }: SlotMembersTabProps) => {
  const [selectedTrainer, setSelectedTrainer] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [members, setMembers] = useState<SlotMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [slotCapacity, setSlotCapacity] = useState(0);

  // Fetch slots when trainer changes
  useEffect(() => {
    if (!selectedTrainer || !currentBranch?.id) { setSlots([]); setSelectedSlot(""); return; }
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
  }, [selectedTrainer, currentBranch?.id]);

  // Fetch slot members when slot changes
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
      const { data } = await supabase
        .from("time_slot_members")
        .select("id, member_id, members(name, phone)")
        .eq("time_slot_id", selectedSlot);

      if (data) {
        setMembers(data.map((d: any) => ({
          id: d.id,
          member_id: d.member_id,
          member_name: d.members?.name || "Unknown",
          member_phone: d.members?.phone || "",
        })));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddMembers = async () => {
    if (!currentBranch?.id) return;
    const existingIds = members.map(m => m.member_id);

    let query = supabase
      .from("members")
      .select("id, name, phone")
      .eq("branch_id", currentBranch.id)
      .order("name");

    const { data } = await query;

    if (data) {
      setAvailableMembers(
        data.filter(m => !existingIds.includes(m.id)).map(m => ({ ...m, selected: false }))
      );
    }
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

    const inserts = selected.map(m => ({
      time_slot_id: selectedSlot,
      member_id: m.id,
      branch_id: currentBranch.id,
    }));

    const { error } = await supabase.from("time_slot_members").insert(inserts);
    if (error) { toast.error("Failed to add members", { description: error.message }); return; }

    // Sync pt_subscriptions: resolve personal_trainer_id from staff (trainer) via phone
    try {
      const staffId = selectedTrainer;
      const { data: staffRec } = await supabase
        .from("staff" as any)
        .select("phone")
        .eq("id", staffId)
        .maybeSingle();

      if ((staffRec as any)?.phone) {
        const { data: ptProfile } = await supabase
          .from("personal_trainers")
          .select("id, monthly_fee")
          .eq("phone", (staffRec as any).phone)
          .eq("branch_id", currentBranch.id)
          .eq("is_active", true)
          .maybeSingle();

        if (ptProfile) {
          const today = new Date().toISOString().split("T")[0];

          for (const m of selected) {
            // Check if active pt_subscription already exists for this member + trainer
            const { data: existingPt } = await supabase
              .from("pt_subscriptions")
              .select("id, time_slot_id")
              .eq("member_id", m.id)
              .eq("personal_trainer_id", ptProfile.id)
              .eq("status", "active")
              .gte("end_date", today)
              .maybeSingle();

            if (existingPt) {
              // Update existing PT subscription with slot
              if (!existingPt.time_slot_id) {
                await supabase
                  .from("pt_subscriptions")
                  .update({ time_slot_id: selectedSlot })
                  .eq("id", existingPt.id);
              }
            } else {
              // Get member's gym membership end date for PT end date
              const { data: memberSub } = await supabase
                .from("subscriptions")
                .select("end_date")
                .eq("member_id", m.id)
                .in("status", ["active", "expiring_soon"])
                .order("end_date", { ascending: false })
                .limit(1)
                .maybeSingle();

              const endDate = memberSub?.end_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
              const startD = new Date(today);
              const endD = new Date(endDate);
              const months = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30)));

              await supabase.from("pt_subscriptions").insert({
                member_id: m.id,
                personal_trainer_id: ptProfile.id,
                branch_id: currentBranch.id,
                start_date: today,
                end_date: endDate,
                monthly_fee: ptProfile.monthly_fee,
                total_fee: months * ptProfile.monthly_fee,
                status: "active",
                time_slot_id: selectedSlot,
              });
            }
          }
        }
      }
    } catch (syncErr) {
      console.error("PT subscription sync error (non-blocking):", syncErr);
    }

    toast.success(`${selected.length} member(s) added`);
    setAddDialogOpen(false);
    fetchSlotMembers();
  };

  const handleRemoveMember = async (id: string, name: string) => {
    await supabase.from("time_slot_members").delete().eq("id", id);
    toast.success(`${name} removed from slot`);
    fetchSlotMembers();
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

  const isFull = members.length >= slotCapacity;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base lg:text-lg font-semibold">Slot Member Management</h3>
        <p className="text-xs lg:text-sm text-muted-foreground">Assign and manage members in time slots</p>
      </div>

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
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 lg:p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{members.length}/{slotCapacity} members</Badge>
                {isFull && <Badge className="bg-red-100 text-red-700 text-[10px]">Full</Badge>}
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
                  <PlusIcon className="w-3 h-3" /> Add
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-6">
                <UserGroupIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No members assigned to this slot</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{m.member_name}</p>
                      <p className="text-xs text-muted-foreground">{m.member_phone}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveMember(m.id, m.member_name)}
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
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
        <DialogContent className="sm:max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Add Members to Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredAvailable.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
              ) : (
                filteredAvailable.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={m.selected} onCheckedChange={() => toggleMemberSelection(m.id)} />
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {availableMembers.filter(m => m.selected).length} selected
              {isFull && " • Slot is full"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddMembers}>Add Selected</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
