import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

interface MemberAttendance {
  memberId: string;
  memberName: string;
  memberPhone: string;
  status: AttendanceStatus;
  recordId?: string;
}

export const SimpleAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch active members (with active/expiring_soon subscriptions)
  const { data: activeMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["active-members-attendance", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone, subscriptions!inner(status)")
        .eq("branch_id", branchId)
        .in("subscriptions.status", ["active", "expiring_soon"])
        .order("name");
      if (error) throw error;
      // Deduplicate by member id
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

  // Build member attendance list
  const memberAttendanceList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({
      memberId: m.id,
      memberName: m.name,
      memberPhone: m.phone,
      status: localAttendance.get(m.id) || "absent",
      recordId: existingRecords.find((r: any) => r.member_id === m.id)?.id,
    }));
  }, [activeMembers, localAttendance, existingRecords]);

  // Filtered list
  const filteredList = useMemo(() => {
    if (!search.trim()) return memberAttendanceList;
    const q = search.toLowerCase();
    return memberAttendanceList.filter(
      (m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q)
    );
  }, [memberAttendanceList, search]);

  // Stats
  const stats = useMemo(() => {
    const total = memberAttendanceList.length;
    const present = memberAttendanceList.filter((m) => m.status === "present").length;
    const late = memberAttendanceList.filter((m) => m.status === "late").length;
    const absent = memberAttendanceList.filter((m) => m.status === "absent").length;
    return { total, present, late, absent };
  }, [memberAttendanceList]);

  const toggleStatus = useCallback((memberId: string, newStatus: AttendanceStatus) => {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      const currentStatus = next.get(memberId) || "absent";
      // If tapping same status, set to absent (toggle off)
      next.set(memberId, currentStatus === newStatus ? "absent" : newStatus);
      return next;
    });
    setHasChanges(true);
  }, []);

  const markAll = useCallback((status: AttendanceStatus) => {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      activeMembers.forEach((m: any) => next.set(m.id, status));
      return next;
    });
    setHasChanges(true);
  }, [activeMembers]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      
      const records = memberAttendanceList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: null,
        marked_by_type: "admin",
      }));

      // Upsert: use the unique index for conflict resolution
      const { error } = await supabase
        .from("daily_attendance")
        .upsert(records, { 
          onConflict: "member_id,branch_id,date",
          ignoreDuplicates: false,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", description: `Attendance for ${selectedDate} has been saved.` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["daily-attendance", branchId, selectedDate] });
    },
    onError: (err: any) => {
      toast({ title: "Error saving attendance", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = loadingMembers || loadingRecords;
  const isToday = selectedDate === today;

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case "present": return <CheckCircleSolidIcon className="w-5 h-5 text-green-500" />;
      case "late": return <ClockIcon className="w-5 h-5 text-amber-500" />;
      case "absent": return <XCircleIcon className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case "present": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">Present</Badge>;
      case "late": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px]">Late</Badge>;
      case "absent": return <Badge className="bg-red-500/10 text-red-500 border-red-200 text-[10px]">Absent</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with date & stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <AttendanceDatePicker
            label="Date"
            value={selectedDate}
            onChange={(v) => { setSelectedDate(v); setSearch(""); }}
            className="min-w-[160px] max-w-[200px]"
          />
          {isToday && (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs animate-fade-in">
              Today
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["daily-attendance"] })}
        >
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2 lg:gap-3">
        {[
          { label: "Total", value: stats.total, icon: UserGroupIcon, color: "text-foreground" },
          { label: "Present", value: stats.present, icon: CheckCircleIcon, color: "text-green-600" },
          { label: "Late", value: stats.late, icon: ClockIcon, color: "text-amber-600" },
          { label: "Absent", value: stats.absent, icon: XCircleIcon, color: "text-red-500" },
        ].map((s, i) => (
          <Card key={i} className="border border-border/40 shadow-sm">
            <CardContent className="p-2.5 lg:p-3.5">
              <div className="flex items-center gap-2">
                <s.icon className={cn("w-4 h-4 lg:w-5 lg:h-5 shrink-0", s.color)} />
                <div className="min-w-0">
                  <p className={cn("text-lg lg:text-xl font-bold leading-tight", s.color)}>{s.value}</p>
                  <p className="text-[9px] lg:text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
          onClick={() => markAll("present")}
        >
          <CheckBadgeIcon className="w-3.5 h-3.5" /> Mark All Present
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          onClick={() => markAll("absent")}
        >
          <XCircleIcon className="w-3.5 h-3.5" /> Mark All Absent
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm rounded-xl"
        />
      </div>

      {/* Member List */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading members...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search ? "No members match your search." : "No active members found."}
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
                  style={{ animationDelay: `${Math.min(idx * 20, 400)}ms` }}
                >
                  {/* Status icon */}
                  <button
                    onClick={() => toggleStatus(member.memberId, "present")}
                    className="shrink-0 transition-transform active:scale-90"
                  >
                    {getStatusIcon(member.status)}
                  </button>

                  {/* Member info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.memberName}</p>
                    <p className="text-[11px] text-muted-foreground">{member.memberPhone}</p>
                  </div>

                  {/* Status toggles */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleStatus(member.memberId, "present")}
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border",
                        member.status === "present"
                          ? "bg-green-500 text-white border-green-500 shadow-sm"
                          : "bg-transparent text-muted-foreground border-border/50 hover:border-green-300 hover:text-green-600"
                      )}
                    >
                      P
                    </button>
                    <button
                      onClick={() => toggleStatus(member.memberId, "late")}
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border",
                        member.status === "late"
                          ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                          : "bg-transparent text-muted-foreground border-border/50 hover:border-amber-300 hover:text-amber-600"
                      )}
                    >
                      L
                    </button>
                    <button
                      onClick={() => toggleStatus(member.memberId, "absent")}
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border",
                        member.status === "absent"
                          ? "bg-red-500 text-white border-red-500 shadow-sm"
                          : "bg-transparent text-muted-foreground border-border/50 hover:border-red-300 hover:text-red-600"
                      )}
                    >
                      A
                    </button>
                  </div>

                  {/* Mobile badge */}
                  {isMobile && (
                    <div className="hidden">{getStatusBadge(member.status)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky Save Button */}
      {filteredList.length > 0 && (
        <div className="sticky bottom-4 z-20">
          <Button
            className={cn(
              "w-full h-11 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300",
              hasChanges
                ? "bg-primary text-primary-foreground hover:bg-primary/90 animate-fade-in"
                : "bg-muted text-muted-foreground"
            )}
            disabled={!hasChanges || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
            ) : hasChanges ? (
              `Save Attendance (${stats.present} Present, ${stats.late} Late, ${stats.absent} Absent)`
            ) : (
              "No changes to save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
