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
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { useAttendanceFilters } from "@/hooks/queries/useAttendanceFilters";

type AttendanceStatus = "present" | "absent" | "late";

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white shadow-green-500/30",
  late: "bg-amber-500 text-white shadow-amber-500/30",
  absent: "bg-red-500/80 text-white shadow-red-500/20",
};

export const SlotAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const isFutureDate = selectedDate > today;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const { trainers, allSlots, staffTrainerId } = useAttendanceFilters();

  // Filter slots by selected trainer
  const timeSlots = useMemo(() => {
    if (selectedTrainerId) return allSlots.filter(s => s.trainer_id === selectedTrainerId);
    return allSlots;
  }, [allSlots, selectedTrainerId]);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId || !selectedSlotId) throw new Error("No branch/slot selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");
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

  const isLoading = loadingMembers || loadingRecords;
  const MobileMemberCard = ({ member, idx }: { member: any; idx: number }) => (
    <div
      className={cn(
        "bg-card rounded-xl border p-3 transition-all duration-200 animate-fade-in",
        member.status === "present" ? "border-green-200 dark:border-green-900/40" :
        member.status === "late" ? "border-amber-200 dark:border-amber-900/40" :
        "border-border/40",
        isFutureDate && "opacity-50 pointer-events-none"
      )}
      style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-300",
            member.status === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
            member.status === "late" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" :
            "bg-muted text-muted-foreground"
          )}>
            {member.memberName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{member.memberName}</p>
            <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(["present", "late", "absent"] as const).map((s) => (
            <button key={s} onClick={() => toggleStatus(member.memberId, s)} disabled={isFutureDate}
              className={cn(
                "w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200 border active:scale-90",
                member.status === s
                  ? STATUS_COLORS[s] + " border-transparent shadow-md"
                  : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/50"
              )}>
              {s === "present" ? "P" : s === "late" ? "L" : "A"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Present", count: stats.present, icon: CheckCircleIcon, color: "text-green-600", bg: "bg-green-500/10" },
          { label: "Late", count: stats.late, icon: ClockIcon, color: "text-amber-600", bg: "bg-amber-500/10" },
          { label: "Absent", count: stats.absent, icon: XCircleIcon, color: "text-red-500", bg: "bg-red-500/10" },
          { label: "Total", count: stats.total, icon: UserGroupIcon, color: "text-foreground", bg: "bg-primary/10" },
        ].map((s, idx) => (
          <Card key={s.label} className="border border-border/40 animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
            <CardContent className="p-2.5 lg:p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={cn("w-6 h-6 lg:w-7 lg:h-7 rounded-lg flex items-center justify-center", s.bg)}>
                  <s.icon className={cn("w-3.5 h-3.5", s.color)} />
                </div>
                <span className="text-[10px] lg:text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={cn("text-lg lg:text-xl font-bold", s.color)}>{s.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
          </div>
          <AttendanceDatePicker value={selectedDate} onChange={(v) => { setSelectedDate(v); setSearch(""); }} className="w-[130px] lg:min-w-[150px]" disableFuture />
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {[
            { key: "all", label: "All" },
            { key: "present", label: "Present" },
            { key: "late", label: "Late" },
            { key: "absent", label: "Absent" },
          ].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] lg:text-xs font-medium transition-all duration-200 border shrink-0 active:scale-95",
                statusFilter === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}>
              {s.label}
            </button>
          ))}
          {isFutureDate && <Badge variant="destructive" className="text-[10px] h-5 ml-1 animate-fade-in">Future dates blocked</Badge>}
        </div>
      </div>

      {/* Trainer & Slot Filters */}
      <div className="flex items-center gap-1.5">
        <TrainerFilterDropdown
          value={selectedTrainerId}
          onChange={(v) => { setSelectedTrainerId(v); setSelectedSlotId(null); }}
          compact={isMobile}
        />
        <TimeSlotFilterDropdown
          value={selectedSlotId}
          onChange={(v) => { setSelectedSlotId(v); setSearch(""); }}
          trainerFilter={selectedTrainerId}
          compact={isMobile}
        />
      </div>

      {timeSlots.length === 0 ? (
        <Card className="border border-border/40 animate-fade-in">
          <CardContent className="py-10 text-center">
            <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {isLimitedAccess ? "No time slots assigned to you." : "No time slots configured."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Quick Actions */}
          {!isFutureDate && stats.total > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Quick:</span>
              <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7 px-2 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 active:scale-95 transition-transform" onClick={() => markAll("present")}>
                <CheckBadgeIcon className="w-3 h-3" /> All P
              </Button>
              <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7 px-2 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 active:scale-95 transition-transform" onClick={() => markAll("absent")}>
                <XCircleIcon className="w-3 h-3" /> All A
              </Button>
            </div>
          )}

          {/* Members */}
          {(loadingMembers || loadingRecords) ? (
            <div className="py-10 text-center text-muted-foreground text-sm animate-fade-in">Loading...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-10 text-center space-y-2 animate-fade-in">
              <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{search ? "No members match." : "No members in this slot."}</p>
            </div>
          ) : isMobile ? (
            <div className="space-y-2">
              {filteredList.map((member, idx) => (
                <MobileMemberCard key={member.memberId} member={member} idx={idx} />
              ))}
            </div>
          ) : (
            <Card className="border border-border/40 shadow-sm overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5">Member</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2.5 hidden sm:table-cell">Phone</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5">Status</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2.5 w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredList.map((member) => (
                      <tr key={member.memberId} className={cn(
                        "transition-colors duration-150 hover:bg-muted/10",
                        member.status === "present" && "bg-green-500/[0.03]",
                        member.status === "late" && "bg-amber-500/[0.03]",
                        isFutureDate && "opacity-50 pointer-events-none",
                      )}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors duration-300",
                              member.status === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                              member.status === "late" ? "bg-amber-500/20 text-amber-700" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {member.memberName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{member.memberName}</p>
                              <p className="text-[10px] text-muted-foreground sm:hidden">{member.memberPhone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{member.memberPhone}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={cn("text-[10px] font-medium transition-all duration-200",
                            member.status === "present" ? "bg-green-500/10 text-green-600 border-green-200"
                              : member.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200"
                              : "bg-red-500/10 text-red-500 border-red-200"
                          )}>
                            {member.status === "present" ? "Present" : member.status === "late" ? "Late" : "Absent"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            {(["present", "late", "absent"] as const).map((s) => (
                              <button key={s} onClick={() => toggleStatus(member.memberId, s)} disabled={isFutureDate}
                                className={cn(
                                  "w-7 h-7 rounded-md text-[10px] font-bold transition-all duration-200 border active:scale-90",
                                  member.status === s
                                    ? STATUS_COLORS[s] + " border-transparent shadow-sm"
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
              </div>
            </Card>
          )}

          {/* Save Button */}
          {filteredList.length > 0 && !isFutureDate && (
            <div className="sticky bottom-2 z-20 px-1">
              <Button
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300 active:scale-[0.98]",
                  hasChanges ? "bg-primary text-primary-foreground shadow-primary/20" : "bg-muted text-muted-foreground"
                )}
                disabled={!hasChanges || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
                ) : hasChanges ? (
                  <span>Save ({stats.present}P · {stats.late}L · {stats.absent}A)</span>
                ) : "No changes to save"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
