import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
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
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import { AttendanceDatePicker } from "./AttendanceDatePicker";

type AttendanceStatus = "present" | "absent" | "late";

export const SlotAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const isFutureDate = selectedDate > today;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  // Get staff's trainer ID for filtering
  const { data: staffTrainerId } = useQuery({
    queryKey: ["staff-trainer-id", staffUser?.id, branchId],
    queryFn: async () => {
      if (!staffUser?.id || !branchId) return null;
      const { data: staffData } = await supabase
        .from("staff")
        .select("phone")
        .eq("id", staffUser.id)
        .single();
      if (!staffData?.phone) return null;
      const { data: trainer } = await supabase
        .from("personal_trainers")
        .select("id")
        .eq("phone", staffData.phone)
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .maybeSingle();
      return trainer?.id || null;
    },
    enabled: !!staffUser?.id && !!branchId && isLimitedAccess,
  });

  // Fetch trainer time slots - filtered for limited access staff
  const { data: timeSlots = [] } = useQuery<any[]>({
    queryKey: ["trainer-time-slots-attendance", branchId, isLimitedAccess, staffTrainerId],
    queryFn: async (): Promise<any[]> => {
      if (!branchId) return [];
      let query = supabase
        .from("trainer_time_slots")
        .select("id, start_time, end_time, capacity, trainer_id, personal_trainers(name)") as any;
      query = query.eq("branch_id", branchId).eq("is_active", true).order("start_time");

      // If limited access, only show trainer's own slots
      if (isLimitedAccess && staffTrainerId) {
        query = query.eq("trainer_id", staffTrainerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && (!isLimitedAccess || staffTrainerId !== undefined),
  });

  // Auto-select first slot
  useEffect(() => {
    if (timeSlots.length > 0 && !selectedSlotId) {
      setSelectedSlotId(timeSlots[0].id);
    }
  }, [timeSlots, selectedSlotId]);

  // Reset slot selection when slots change
  useEffect(() => {
    if (timeSlots.length > 0 && selectedSlotId && !timeSlots.find((s: any) => s.id === selectedSlotId)) {
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
    if (isFutureDate) return;
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) || "absent";
      next.set(memberId, cur === newStatus ? "absent" : newStatus);
      return next;
    });
    setHasChanges(true);
  }, [isFutureDate]);

  const markAll = useCallback((status: AttendanceStatus) => {
    if (isFutureDate) return;
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      slotMembers.forEach((m: any) => next.set(m.id, status));
      return next;
    });
    setHasChanges(true);
  }, [slotMembers, isFutureDate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId || !selectedSlotId) throw new Error("No branch/slot selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");

      const records = memberList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: selectedSlotId,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
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
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
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

  const selectedSlot = timeSlots.find((s: any) => s.id === selectedSlotId);

  return (
    <div className="space-y-3">
      {/* Date picker row */}
      <div className="flex items-end gap-3 flex-wrap">
        <AttendanceDatePicker
          label="Date"
          value={selectedDate}
          onChange={(v) => { setSelectedDate(v); setSearch(""); }}
          className="min-w-[150px] max-w-[180px]"
          disableFuture
        />
        {selectedDate === today && (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] h-6">Today</Badge>
        )}
        {isFutureDate && (
          <Badge variant="destructive" className="text-[10px] h-6">Future dates not allowed</Badge>
        )}
      </div>

      {timeSlots.length === 0 ? (
        <Card className="border border-border/40">
          <CardContent className="py-8 text-center">
            <ClockIcon className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {isLimitedAccess ? "No time slots assigned to you." : "No time slots configured. Add time slots in Staff Management."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Slot Selector - horizontal scroll */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {timeSlots.map((slot: any) => (
              <button
                key={slot.id}
                onClick={() => { setSelectedSlotId(slot.id); setSearch(""); }}
                className={cn(
                  "shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all duration-150",
                  selectedSlotId === slot.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                <div className="font-semibold">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</div>
                <div className="text-[9px] opacity-70">{slot.personal_trainers?.name || "Unassigned"}</div>
              </button>
            ))}
          </div>

          {/* Stats + Quick Actions */}
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 rounded-lg">
            <div className="flex items-center gap-1.5">
              <UserGroupIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold">{stats.total}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1">
              <CheckCircleIcon className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-600">{stats.present}</span>
            </div>
            <div className="flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-semibold text-amber-600">{stats.late}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircleIcon className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-500">{stats.absent}</span>
            </div>
            <div className="flex-1" />
            {!isFutureDate && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="gap-1 text-[10px] h-7 px-2 text-green-700 hover:bg-green-50 dark:text-green-400" onClick={() => markAll("present")}>
                  <CheckBadgeIcon className="w-3 h-3" /> All P
                </Button>
                <Button variant="ghost" size="sm" className="gap-1 text-[10px] h-7 px-2 text-red-600 hover:bg-red-50 dark:text-red-400" onClick={() => markAll("absent")}>
                  <XCircleIcon className="w-3 h-3" /> All A
                </Button>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
          </div>

          {/* Member List */}
          <Card className="border border-border/40 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {(loadingMembers || loadingRecords) ? (
                <div className="py-10 text-center text-muted-foreground text-xs">Loading...</div>
              ) : filteredList.length === 0 ? (
                <div className="py-10 text-center space-y-1.5">
                  <UserGroupIcon className="w-8 h-8 mx-auto text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    {search ? "No members match." : "No members assigned to this slot."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {filteredList.map((member) => (
                    <div
                      key={member.memberId}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 transition-colors duration-150",
                        member.status === "present" && "bg-green-500/[0.04]",
                        member.status === "late" && "bg-amber-500/[0.04]",
                        isFutureDate && "opacity-60 pointer-events-none",
                      )}
                    >
                      <button
                        onClick={() => toggleStatus(member.memberId, "present")}
                        className="shrink-0 transition-transform active:scale-90"
                        disabled={isFutureDate}
                      >
                        {member.status === "present"
                          ? <CheckCircleSolidIcon className="w-5 h-5 text-green-500" />
                          : member.status === "late"
                          ? <ClockIcon className="w-5 h-5 text-amber-500" />
                          : <XCircleIcon className="w-5 h-5 text-red-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{member.memberName}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{member.memberPhone}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {(["present", "late", "absent"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => toggleStatus(member.memberId, s)}
                            disabled={isFutureDate}
                            className={cn(
                              "w-7 h-7 rounded-md text-[10px] font-semibold transition-all duration-150 border",
                              member.status === s
                                ? s === "present" ? "bg-green-500 text-white border-green-500 shadow-sm"
                                  : s === "late" ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                  : "bg-red-500 text-white border-red-500 shadow-sm"
                                : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30"
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
          {filteredList.length > 0 && !isFutureDate && (
            <div className="sticky bottom-3 z-20">
              <Button
                className={cn(
                  "w-full h-10 rounded-lg text-xs font-semibold shadow-lg transition-all duration-300",
                  hasChanges ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
                disabled={!hasChanges || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
                ) : hasChanges ? (
                  `Save Attendance (${stats.present}P · ${stats.late}L · ${stats.absent}A)`
                ) : "No changes to save"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
