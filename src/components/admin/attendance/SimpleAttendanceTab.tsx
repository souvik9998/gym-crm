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

interface MemberAttendance {
  memberId: string;
  memberName: string;
  memberPhone: string;
  status: AttendanceStatus;
}

export const SimpleAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const isFutureDate = selectedDate > today;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  // Fetch active members
  const { data: activeMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["active-members-attendance", branchId, isLimitedAccess, staffUser?.id],
    queryFn: async () => {
      if (!branchId) return [];

      if (isLimitedAccess && staffUser?.id) {
        const { data: staffData } = await supabase
          .from("staff").select("phone").eq("id", staffUser.id).single();
        if (!staffData?.phone) return [];
        const { data: trainer } = await supabase
          .from("personal_trainers").select("id")
          .eq("phone", staffData.phone).eq("branch_id", branchId).eq("is_active", true).maybeSingle();
        if (!trainer?.id) return [];
        const { data: memberDetails } = await supabase
          .from("member_details").select("member_id").eq("personal_trainer_id", trainer.id);
        const memberIds = (memberDetails || []).map((md: any) => md.member_id);
        if (memberIds.length === 0) return [];
        const { data, error } = await supabase
          .from("members").select("id, name, phone, subscriptions!inner(status)")
          .eq("branch_id", branchId).in("id", memberIds)
          .in("subscriptions.status", ["active", "expiring_soon"]).order("name");
        if (error) throw error;
        const seen = new Set<string>();
        return (data || []).filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
      }

      const { data, error } = await supabase
        .from("members").select("id, name, phone, subscriptions!inner(status)")
        .eq("branch_id", branchId).in("subscriptions.status", ["active", "expiring_soon"]).order("name");
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    },
    enabled: !!branchId,
  });

  // Fetch existing attendance records
  const { data: existingRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance", branchId, selectedDate],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance").select("id, member_id, status")
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => { map.set(r.member_id, r.status as AttendanceStatus); });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberAttendanceList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({
      memberId: m.id,
      memberName: m.name,
      memberPhone: m.phone,
      status: localAttendance.get(m.id) || "absent",
    }));
  }, [activeMembers, localAttendance]);

  const filteredList = useMemo(() => {
    let list = memberAttendanceList;
    if (statusFilter !== "all") {
      list = list.filter((m) => m.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q));
    }
    return list;
  }, [memberAttendanceList, search, statusFilter]);

  const stats = useMemo(() => {
    const total = memberAttendanceList.length;
    const present = memberAttendanceList.filter((m) => m.status === "present").length;
    const late = memberAttendanceList.filter((m) => m.status === "late").length;
    const absent = memberAttendanceList.filter((m) => m.status === "absent").length;
    return { total, present, late, absent };
  }, [memberAttendanceList]);

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
      activeMembers.forEach((m: any) => next.set(m.id, status));
      return next;
    });
    setHasChanges(true);
  }, [activeMembers, isFutureDate]);

  // Fix: use delete+insert instead of upsert (partial indexes don't support ON CONFLICT by column)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");

      // Delete existing records for this date (simple mode, no time_slot)
      const { error: deleteError } = await supabase
        .from("daily_attendance")
        .delete()
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .is("time_slot_id", null);

      if (deleteError) throw deleteError;

      // Insert fresh records
      const records = memberAttendanceList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: null as string | null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));

      const { error: insertError } = await supabase
        .from("daily_attendance")
        .insert(records);

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", description: `Attendance for ${selectedDate} saved successfully.` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["daily-attendance", branchId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    },
    onError: (err: any) => {
      toast({ title: "Error saving attendance", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = loadingMembers || loadingRecords;
  const isToday = selectedDate === today;

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
            <p className="text-[10px] text-muted-foreground">{stats.total > 0 ? `${Math.round((stats.present / stats.total) * 100)}% attendance` : "No members"}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ClockIcon className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs text-muted-foreground">Late Entry</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.late}</p>
            <p className="text-[10px] text-muted-foreground">{stats.late > 0 ? `${stats.total - stats.late} on time` : "All on time"}</p>
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
            <p className="text-[10px] text-muted-foreground">{stats.absent > 0 ? "Not marked present" : "Everyone present"}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3 lg:p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserGroupIcon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Total Members</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Active subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls Row: Search + Filters + Date */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
        <div className="relative flex-1 w-full lg:max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm rounded-lg"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter chips */}
          {[
            { key: "all", label: "All", count: stats.total },
            { key: "present", label: "Present", count: stats.present, color: "text-green-600" },
            { key: "late", label: "Late", count: stats.late, color: "text-amber-600" },
            { key: "absent", label: "Absent", count: stats.absent, color: "text-red-500" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={cn(
                "px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1",
                statusFilter === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              )}
            >
              {s.label}
              {statusFilter === s.key && <span className="text-[10px]">×</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <AttendanceDatePicker
            value={selectedDate}
            onChange={(v) => { setSelectedDate(v); setSearch(""); }}
            className="min-w-[150px]"
            disableFuture
          />
          {isToday && (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs h-7 px-2">Today</Badge>
          )}
          {isFutureDate && (
            <Badge variant="destructive" className="text-xs h-7">Future dates not allowed</Badge>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {!isFutureDate && stats.total > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick:</span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20"
            onClick={() => markAll("present")}
          >
            <CheckBadgeIcon className="w-3.5 h-3.5" /> Mark All Present
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
            onClick={() => markAll("absent")}
          >
            <XCircleIcon className="w-3.5 h-3.5" /> Mark All Absent
          </Button>
        </div>
      )}

      {/* Members Table */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading members...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search ? "No members match your search." : isLimitedAccess ? "No assigned members found." : "No active members found."}
              </p>
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
                {filteredList.map((member, idx) => (
                  <tr
                    key={member.memberId}
                    className={cn(
                      "transition-colors duration-150 hover:bg-muted/20",
                      member.status === "present" && "bg-green-500/[0.03]",
                      member.status === "late" && "bg-amber-500/[0.03]",
                      isFutureDate && "opacity-50 pointer-events-none",
                    )}
                  >
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
                      <Badge
                        className={cn(
                          "text-xs font-medium",
                          member.status === "present" ? "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800"
                            : member.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800"
                            : "bg-red-500/10 text-red-500 border-red-200 dark:border-red-800"
                        )}
                      >
                        {member.status === "present" ? "Present" : member.status === "late" ? "Late" : "Absent"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {(["present", "late", "absent"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => toggleStatus(member.memberId, s)}
                            disabled={isFutureDate}
                            className={cn(
                              "w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-150 border",
                              member.status === s
                                ? s === "present" ? "bg-green-500 text-white border-green-500 shadow-sm"
                                  : s === "late" ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                  : "bg-red-500 text-white border-red-500 shadow-sm"
                                : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30"
                            )}
                          >
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

      {/* Sticky Save Button */}
      {filteredList.length > 0 && !isFutureDate && (
        <div className="sticky bottom-3 z-20">
          <Button
            className={cn(
              "w-full h-11 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300",
              hasChanges
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            )}
            disabled={!hasChanges || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
            ) : hasChanges ? (
              `Save Attendance (${stats.present} Present · ${stats.late} Late · ${stats.absent} Absent)`
            ) : (
              "No changes to save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
