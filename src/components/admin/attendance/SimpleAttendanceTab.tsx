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
  recordId?: string;
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
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const isFutureDate = selectedDate > today;

  // Determine if staff has limited member access
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  // Fetch active members (with active/expiring_soon subscriptions)
  const { data: activeMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["active-members-attendance", branchId, isLimitedAccess, staffUser?.id],
    queryFn: async () => {
      if (!branchId) return [];

      if (isLimitedAccess && staffUser?.id) {
        // Trainer with limited access - get only assigned members
        // First get the trainer's personal_trainers ID via phone match
        const { data: staffData } = await supabase
          .from("staff")
          .select("phone")
          .eq("id", staffUser.id)
          .single();

        if (!staffData?.phone) return [];

        const { data: trainer } = await supabase
          .from("personal_trainers")
          .select("id")
          .eq("phone", staffData.phone)
          .eq("branch_id", branchId)
          .eq("is_active", true)
          .maybeSingle();

        if (!trainer?.id) return [];

        // Get members assigned to this trainer
        const { data: memberDetails } = await supabase
          .from("member_details")
          .select("member_id")
          .eq("personal_trainer_id", trainer.id);

        const memberIds = (memberDetails || []).map((md: any) => md.member_id);
        if (memberIds.length === 0) return [];

        const { data, error } = await supabase
          .from("members")
          .select("id, name, phone, subscriptions!inner(status)")
          .eq("branch_id", branchId)
          .in("id", memberIds)
          .in("subscriptions.status", ["active", "expiring_soon"])
          .order("name");
        if (error) throw error;
        const seen = new Set<string>();
        return (data || []).filter((m: any) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      }

      // Admin or staff with full access
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone, subscriptions!inner(status)")
        .eq("branch_id", branchId)
        .in("subscriptions.status", ["active", "expiring_soon"])
        .order("name");
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    },
    enabled: !!branchId,
  });

  // Fetch existing attendance records for selected date
  const { data: existingRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance", branchId, selectedDate],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id, member_id, status")
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .is("time_slot_id", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  // Initialize local attendance from existing records
  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => {
      map.set(r.member_id, r.status as AttendanceStatus);
    });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberAttendanceList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({
      memberId: m.id,
      memberName: m.name,
      memberPhone: m.phone,
      status: localAttendance.get(m.id) || "absent",
      recordId: existingRecords.find((r: any) => r.member_id === m.id)?.id,
    }));
  }, [activeMembers, localAttendance, existingRecords]);

  const filteredList = useMemo(() => {
    if (!search.trim()) return memberAttendanceList;
    const q = search.toLowerCase();
    return memberAttendanceList.filter(
      (m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q)
    );
  }, [memberAttendanceList, search]);

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
      const currentStatus = next.get(memberId) || "absent";
      next.set(memberId, currentStatus === newStatus ? "absent" : newStatus);
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");

      const records = memberAttendanceList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));

      const { error } = await supabase
        .from("daily_attendance")
        .upsert(records, {
          onConflict: "member_id,branch_id,date",
          ignoreDuplicates: false,
        });

      if (error) throw error;
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
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex items-end gap-3 flex-wrap">
        <AttendanceDatePicker
          label="Date"
          value={selectedDate}
          onChange={(v) => { setSelectedDate(v); setSearch(""); }}
          className="min-w-[150px] max-w-[180px]"
          disableFuture
        />
        {isToday && (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] h-6">Today</Badge>
        )}
        {isFutureDate && (
          <Badge variant="destructive" className="text-[10px] h-6">Future dates not allowed</Badge>
        )}
      </div>

      {/* Compact Stats Row */}
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 rounded-lg">
        <div className="flex items-center gap-1.5">
          <UserGroupIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{stats.total}</span>
          <span className="text-[10px] text-muted-foreground">Total</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <CheckCircleIcon className="w-3.5 h-3.5 text-green-600" />
          <span className="text-xs font-semibold text-green-600">{stats.present}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-600">{stats.late}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircleIcon className="w-3.5 h-3.5 text-red-500" />
          <span className="text-xs font-semibold text-red-500">{stats.absent}</span>
        </div>
        <div className="flex-1" />
        {!isFutureDate && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-[10px] h-7 px-2 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => markAll("present")}
            >
              <CheckBadgeIcon className="w-3 h-3" /> All P
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-[10px] h-7 px-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={() => markAll("absent")}
            >
              <XCircleIcon className="w-3 h-3" /> All A
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs rounded-lg"
        />
      </div>

      {/* Member List */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground text-xs">Loading members...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <UserGroupIcon className="w-8 h-8 mx-auto text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {search ? "No members match your search." : isLimitedAccess ? "No assigned members found." : "No active members found."}
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

      {/* Sticky Save Button */}
      {filteredList.length > 0 && !isFutureDate && (
        <div className="sticky bottom-3 z-20">
          <Button
            className={cn(
              "w-full h-10 rounded-lg text-xs font-semibold shadow-lg transition-all duration-300",
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
              `Save Attendance (${stats.present}P · ${stats.late}L · ${stats.absent}A)`
            ) : (
              "No changes to save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
