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
  FunnelIcon,
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const isFutureDate = selectedDate > today;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const { data: staffTrainerId } = useQuery({
    queryKey: ["staff-trainer-id", staffUser?.id, branchId],
    queryFn: async () => {
      if (!staffUser?.id || !branchId) return null;
      const { data: staffData } = await supabase.from("staff").select("phone").eq("id", staffUser.id).single();
      if (!staffData?.phone) return null;
      const { data: trainer } = await supabase.from("personal_trainers").select("id")
        .eq("phone", staffData.phone).eq("branch_id", branchId).eq("is_active", true).maybeSingle();
      return trainer?.id || null;
    },
    enabled: !!staffUser?.id && !!branchId && isLimitedAccess,
  });

  const { data: timeSlots = [] } = useQuery<any[]>({
    queryKey: ["trainer-time-slots-attendance", branchId, isLimitedAccess, staffTrainerId],
    queryFn: async (): Promise<any[]> => {
      if (!branchId) return [];
      let query = supabase.from("trainer_time_slots")
        .select("id, start_time, end_time, capacity, trainer_id, personal_trainers(name)") as any;
      query = query.eq("branch_id", branchId).eq("is_active", true).order("start_time");
      if (isLimitedAccess && staffTrainerId) {
        query = query.eq("trainer_id", staffTrainerId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && (!isLimitedAccess || staffTrainerId !== undefined),
  });

  useEffect(() => {
    if (timeSlots.length > 0 && !selectedSlotId) setSelectedSlotId(timeSlots[0].id);
  }, [timeSlots, selectedSlotId]);

  useEffect(() => {
    if (timeSlots.length > 0 && selectedSlotId && !timeSlots.find((s: any) => s.id === selectedSlotId))
      setSelectedSlotId(timeSlots[0].id);
  }, [timeSlots, selectedSlotId]);

  const { data: slotMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["slot-members-attendance", selectedSlotId],
    queryFn: async () => {
      if (!selectedSlotId) return [];
      const { data, error } = await supabase.from("time_slot_members")
        .select("member_id, members(id, name, phone)").eq("time_slot_id", selectedSlotId);
      if (error) throw error;
      return (data || []).map((d: any) => d.members).filter(Boolean);
    },
    enabled: !!selectedSlotId,
  });

  const { data: existingRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-slot", branchId, selectedDate, selectedSlotId],
    queryFn: async () => {
      if (!branchId || !selectedSlotId) return [];
      const { data, error } = await supabase.from("daily_attendance")
        .select("id, member_id, status").eq("branch_id", branchId)
        .eq("date", selectedDate).eq("time_slot_id", selectedSlotId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!selectedSlotId,
  });

  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => { map.set(r.member_id, r.status as AttendanceStatus); });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberList = useMemo(() => {
    return slotMembers.map((m: any) => ({
      memberId: m.id, memberName: m.name, memberPhone: m.phone,
      status: (localAttendance.get(m.id) || "absent") as AttendanceStatus,
    }));
  }, [slotMembers, localAttendance]);

  const filteredList = useMemo(() => {
    let list = memberList;
    if (statusFilter !== "all") list = list.filter((m) => m.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q));
    }
    return list;
  }, [memberList, search, statusFilter]);

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

  // Fix: delete+insert instead of upsert
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId || !selectedSlotId) throw new Error("No branch/slot selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");

      // Delete existing records for this date+slot
      const { error: deleteError } = await supabase
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).eq("time_slot_id", selectedSlotId);
      if (deleteError) throw deleteError;

      const records = memberList.map((m) => ({
        member_id: m.memberId, branch_id: branchId, date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: selectedSlotId,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));
      const { error: insertError } = await supabase.from("daily_attendance").insert(records);
      if (insertError) throw insertError;
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
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircleIcon className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs text-muted-foreground">Present</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.present}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs text-muted-foreground">Late</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.late}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircleIcon className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-xs text-muted-foreground">Absent</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{stats.absent}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserGroupIcon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls: Search + Filters + Date + Slot */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
        <div className="relative flex-1 w-full lg:max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm rounded-lg" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: "All" },
            { key: "present", label: "Present" },
            { key: "late", label: "Late" },
            { key: "absent", label: "Absent" },
          ].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={cn(
                "px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1",
                statusFilter === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label} {statusFilter === s.key && <span className="text-[10px]">×</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <AttendanceDatePicker value={selectedDate} onChange={(v) => { setSelectedDate(v); setSearch(""); }} className="min-w-[150px]" disableFuture />
          {isFutureDate && <Badge variant="destructive" className="text-xs h-7">Future dates not allowed</Badge>}
        </div>
      </div>

      {/* Time Slot Filter */}
      {timeSlots.length > 0 && (
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Time Slot:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {timeSlots.map((slot: any) => (
              <button
                key={slot.id}
                onClick={() => { setSelectedSlotId(slot.id); setSearch(""); }}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                  selectedSlotId === slot.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                <div className="font-semibold">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</div>
                <div className="text-[10px] opacity-70">{slot.personal_trainers?.name || "Unassigned"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {timeSlots.length === 0 ? (
        <Card className="border border-border/40">
          <CardContent className="py-12 text-center">
            <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {isLimitedAccess ? "No time slots assigned to you." : "No time slots configured. Add time slots in Staff Management."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Quick Actions */}
          {!isFutureDate && stats.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick:</span>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800" onClick={() => markAll("present")}>
                <CheckBadgeIcon className="w-3.5 h-3.5" /> All Present
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800" onClick={() => markAll("absent")}>
                <XCircleIcon className="w-3.5 h-3.5" /> All Absent
              </Button>
            </div>
          )}

          {/* Members Table */}
          <Card className="border border-border/40 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {(loadingMembers || loadingRecords) ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
              ) : filteredList.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{search ? "No members match." : "No members assigned to this slot."}</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Member</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Phone</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 w-[140px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredList.map((member) => (
                      <tr key={member.memberId} className={cn(
                        "transition-colors hover:bg-muted/20",
                        member.status === "present" && "bg-green-500/[0.03]",
                        member.status === "late" && "bg-amber-500/[0.03]",
                        isFutureDate && "opacity-50 pointer-events-none",
                      )}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                              {member.memberName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{member.memberName}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{member.memberPhone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">{member.memberPhone}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge className={cn("text-xs font-medium",
                            member.status === "present" ? "bg-green-500/10 text-green-600 border-green-200"
                              : member.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200"
                              : "bg-red-500/10 text-red-500 border-red-200"
                          )}>
                            {member.status === "present" ? "Present" : member.status === "late" ? "Late" : "Absent"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            {(["present", "late", "absent"] as const).map((s) => (
                              <button key={s} onClick={() => toggleStatus(member.memberId, s)} disabled={isFutureDate}
                                className={cn(
                                  "w-8 h-8 rounded-lg text-xs font-semibold transition-all border",
                                  member.status === s
                                    ? s === "present" ? "bg-green-500 text-white border-green-500 shadow-sm"
                                      : s === "late" ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                      : "bg-red-500 text-white border-red-500 shadow-sm"
                                    : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30"
                                )}>
                                {s[0].toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          {/* Save Button */}
          {filteredList.length > 0 && !isFutureDate && (
            <div className="sticky bottom-3 z-20">
              <Button
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-semibold shadow-lg transition-all",
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
