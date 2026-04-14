import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  useEffect(() => {
    if (open && slot) {
      setActiveTab("members");
      setAddMode(false);
      setSearchFilter("");
      setEditCapacity(slot.capacity);
      setEditStartTime(slot.start_time.slice(0, 5));
      setEditEndTime(slot.end_time.slice(0, 5));
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
        // Check which members have active PT with this slot
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

    if (data) {
      setAvailableMembers(
        data
          .filter((m) => !existingIds.includes(m.id))
          .map((m) => ({ ...m, selected: false }))
      );
    }
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
    const inserts = selected.map((m) => ({
      time_slot_id: slot.id,
      member_id: m.id,
      branch_id: branchId,
      assigned_by: "Admin",
    }));

    const { error } = await supabase.from("time_slot_members").insert(inserts);
    if (error) {
      toast.error("Failed to add members");
    } else {
      toast.success(`${selected.length} member(s) added`);
      setAddMode(false);
      fetchSlotMembers();
      onUpdated();
    }
    setIsAddingMembers(false);
  };

  const handleRemoveMember = async (id: string, name: string) => {
    await supabase.from("time_slot_members").delete().eq("id", id);
    toast.success(`${name} removed`);
    fetchSlotMembers();
    onUpdated();
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
      toast.success("Slot updated");
      onUpdated();
      onOpenChange(false);
    }
    setIsSavingEdit(false);
  };

  const toggleSelection = (id: string) => {
    setAvailableMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
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

  return (
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
                    filteredAvailable.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={m.selected}
                          onCheckedChange={() => toggleSelection(m.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {availableMembers.filter((m) => m.selected).length} selected
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
                      disabled={isAddingMembers}
                    >
                      {isAddingMembers && (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      )}
                      Add Selected
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
                            handleRemoveMember(m.id, m.member_name)
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
  );
};
