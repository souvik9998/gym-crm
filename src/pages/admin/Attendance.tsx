import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersAttendanceTab } from "@/components/admin/attendance/MembersAttendanceTab";
import { StaffAttendanceTab } from "@/components/admin/attendance/StaffAttendanceTab";
import { AttendanceInsightsTab } from "@/components/admin/attendance/AttendanceInsightsTab";
import { BiometricDevicesTab } from "@/components/admin/attendance/BiometricDevicesTab";
import { SimpleAttendanceTab } from "@/components/admin/attendance/SimpleAttendanceTab";
import { SlotAttendanceTab } from "@/components/admin/attendance/SlotAttendanceTab";
import { AttendanceHistoryTab } from "@/components/admin/attendance/AttendanceHistoryTab";
import { AbsentAnalyticsTab } from "@/components/admin/attendance/AbsentAnalyticsTab";
import { UsersIcon, ChartBarIcon, FingerPrintIcon, ClockIcon, ClipboardDocumentListIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const Attendance = () => {
  const isMobile = useIsMobile();
  const { currentBranch } = useBranch();

  // Fetch attendance mode from gym_settings
  const { data: attendanceMode = "simple" } = useQuery({
    queryKey: ["attendance-mode", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return "simple";
      const { data } = await supabase
        .from("gym_settings")
        .select("attendance_mode")
        .eq("branch_id", currentBranch.id)
        .maybeSingle() as any;
      return (data?.attendance_mode as string) || "simple";
    },
    enabled: !!currentBranch?.id,
  });

  const isSlotMode = attendanceMode === "time_slot";

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            {isSlotMode
              ? "Track attendance by time slot and trainer assignments."
              : "Mark and track daily member attendance."}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[10px] lg:text-xs shrink-0", isSlotMode ? "border-primary/30 text-primary" : "border-muted-foreground/30")}>
          {isSlotMode ? "Slot Mode" : "Simple Mode"}
        </Badge>
      </div>

      <Tabs defaultValue="mark" className="space-y-3 lg:space-y-4">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger value="mark" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <ClipboardDocumentListIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Mark" : "Mark Attendance"}
          </TabsTrigger>
          <TabsTrigger value="checkins" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <UsersIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Check-ins" : "QR Check-ins"}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Analytics" : "Absent Analytics"}
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="biometric" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <FingerPrintIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Bio" : "Biometric"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mark">
          {isSlotMode ? <SlotAttendanceTab /> : <SimpleAttendanceTab />}
        </TabsContent>
        <TabsContent value="checkins">
          <MembersAttendanceTab />
        </TabsContent>
        <TabsContent value="history">
          <AttendanceHistoryTab />
        </TabsContent>
        <TabsContent value="analytics">
          <AbsentAnalyticsTab />
        </TabsContent>
        <TabsContent value="staff">
          <StaffAttendanceTab />
        </TabsContent>
        <TabsContent value="insights">
          <AttendanceInsightsTab />
        </TabsContent>
        <TabsContent value="biometric">
          <BiometricDevicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Attendance;
