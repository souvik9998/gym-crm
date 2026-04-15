import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import { AttendanceDatePicker } from "./AttendanceDatePicker";

type AttendanceStatus = "present" | "absent" | "late";

export const SlotAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch trainer time slots for this branch
  const { data: timeSlots = [] } = useQuery<any[]>({
    queryKey: ["trainer-time-slots-attendance", branchId],
    queryFn: async (): Promise<any[]> => {
      if (!branchId) return [];
      const query = supabase
        .from("trainer_time_slots")
        .select("id, start_time, end_time, capacity, trainer_id, personal_trainers(name)") as any;
      const { data, error } = await query
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("start_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  // Auto-select first slot
  useEffect(() => {
    if (timeSlots.length > 0 && !selectedSlotId) {
      setSelectedSlotId(timeSlots[0].id);
    }
  }, [timeSlots, selectedSlotId]);

  // Fetch members assigned to selected slot
  const { data: slotMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["slot-members-attendance", selectedSlotId],
    queryFn: async () => {
      if (!selectedSlotId) return [];
      const { data, error } = await supabase
        .from("time_slot_members")
        .select("member_id, members(id, name, phone)")
        .eq("time_slot_id", selectedSlotId);
      if (error) throw error;
      return (data || []).map((d: any) => d.members).filter(Boolean);
    },
    enabled: !!selectedSlotId,
  });

  // Fetch existing attendance records for selected date + slot
  const { data: existingRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-slot", branchId, selectedDate, selectedSlotId],
    queryFn: async () => {
      if (!branchId || !selectedSlotId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id, member_id, status")
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .eq("time_slot_id", selectedSlotId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!selectedSlotId,
  });

  // Initialize local attendance
  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => {
      map.set(r.member_id, r.status as AttendanceStatus);
    });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberList = useMemo(() => {
    return slotMembers.map((m: any) => ({
      memberId: m.id,
      memberName: m.name,
      memberPhone: m.phone,
      status: (localAttendance.get(m.id) || "absent") as AttendanceStatus,
    }));
  }, [slotMembers, localAttendance]);

  const filteredList = useMemo(() => {
    if (!search.trim()) return memberList;
    const q = search.toLowerCase();
    return memberList.filter(
      (m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q)
    );
  }, [memberList, search]);

  const stats = useMemo(() => ({
    total: memberList.length,
    present: memberList.filter((m) => m.status === "present").length,
    late: memberList.filter((m) => m.status === "late").length,
    absent: memberList.filter((m) => m.status === "absent").length,
  }), [memberList]);

  const toggleStatus = useCallback((memberId: string, newStatus: AttendanceStatus) => {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) || "absent";
      next.set(memberId, cur === newStatus ? "absent" : newStatus);
      return next;
    });
    setHasChanges(true);
  }, []);

  const markAll = useCallback((status: AttendanceStatus) => {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      slotMembers.forEach((m: any) => next.set(m.id, status));
      return next;
    });
    setHasChanges(true);
  }, [slotMembers]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId || !selectedSlotId) throw new Error("No branch/slot selected");
      const records = memberList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: selectedSlotId,
        marked_by_type: "admin",
      }));
      const { error } = await supabase
        .from("daily_attendance")
        .upsert(records, { onConflict: "member_id,branch_id,date,time_slot_id", ignoreDuplicates: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", description: `Slot attendance for ${selectedDate} saved.` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-slot", branchId, selectedDate, selectedSlotId] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <AttendanceDatePicker
          label="Date"
          value={selectedDate}
          onChange={(v) => { setSelectedDate(v); setSearch(""); }}
          className="min-w-[160px] max-w-[200px]"
        />
        {selectedDate === today && (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Today</Badge>
        )}
      </div>

      {/* Time Slot Selector */}
      {timeSlots.length === 0 ? (
        <Card className="border border-border/40">
          <CardContent className="py-10 text-center">
            <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No time slots configured. Add time slots in Staff Management.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {timeSlots.map((slot: any) => (
              <button
                key={slot.id}
                onClick={() => { setSelectedSlotId(slot.id); setSearch(""); }}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-200",
                  selectedSlotId === slot.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                <div>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</div>
                <div className="text-[10px] opacity-70 mt-0.5">
                  {(slot as any).personal_trainers?.name || "Unassigned"}
                </div>
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: stats.total, color: "text-foreground" },
              { label: "Present", value: stats.present, color: "text-green-600" },
              { label: "Late", value: stats.late, color: "text-amber-600" },
              { label: "Absent", value: stats.absent, color: "text-red-500" },
            ].map((s, i) => (
              <div key={i} className="bg-card border border-border/40 rounded-lg p-2 text-center">
                <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400" onClick={() => markAll("present")}>
              <CheckBadgeIcon className="w-3.5 h-3.5" /> All Present
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400" onClick={() => markAll("absent")}>
              <XCircleIcon className="w-3.5 h-3.5" /> All Absent
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm rounded-xl" />
          </div>

          {/* Member List */}
          <Card className="border border-border/40 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {(loadingMembers || loadingRecords) ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
              ) : filteredList.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {search ? "No members match." : "No members assigned to this slot."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredList.map((member, idx) => (
                    <div
                      key={member.memberId}
                      className={cn(
                        "flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 transition-all duration-200 hover:bg-muted/30",
                        member.status === "present" && "bg-green-500/[0.03]",
                        member.status === "late" && "bg-amber-500/[0.03]",
                      )}
                    >
                      <button onClick={() => toggleStatus(member.memberId, "present")} className="shrink-0 transition-transform active:scale-90">
                        {member.status === "present"
                          ? <CheckCircleSolidIcon className="w-5 h-5 text-green-500" />
                          : member.status === "late"
                          ? <ClockIcon className="w-5 h-5 text-amber-500" />
                          : <XCircleIcon className="w-5 h-5 text-red-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.memberName}</p>
                        <p className="text-[11px] text-muted-foreground">{member.memberPhone}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(["present", "late", "absent"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => toggleStatus(member.memberId, s)}
                            className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border",
                              member.status === s
                                ? s === "present" ? "bg-green-500 text-white border-green-500" : s === "late" ? "bg-amber-500 text-white border-amber-500" : "bg-red-500 text-white border-red-500"
                                : "bg-transparent text-muted-foreground border-border/50 hover:border-primary/30"
                            )}
                          >
                            {s[0].toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          {filteredList.length > 0 && (
            <div className="sticky bottom-4 z-20">
              <Button
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300",
                  hasChanges ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
                disabled={!hasChanges || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
                ) : hasChanges ? (
                  `Save Attendance (${stats.present}P, ${stats.late}L, ${stats.absent}A)`
                ) : "No changes to save"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
