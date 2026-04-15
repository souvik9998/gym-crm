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
import {
  UsersIcon,
  ChartBarIcon,
  FingerPrintIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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
    <div className="space-y-3 lg:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg lg:text-xl font-bold tracking-tight">Attendance</h1>
          <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">
            {isSlotMode ? "Time slot based attendance tracking" : "Daily member attendance tracking"}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[10px] lg:text-xs shrink-0", isSlotMode ? "border-primary/30 text-primary" : "border-muted-foreground/30")}>
          {isSlotMode ? "Slot Mode" : "Simple Mode"}
        </Badge>
      </div>

      <Tabs defaultValue="mark" className="space-y-2 lg:space-y-3">
        <TabsList className="bg-muted/50 rounded-lg p-0.5 h-auto flex flex-wrap gap-0.5">
          <TabsTrigger value="mark" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
            {isMobile ? "Mark" : "Mark Attendance"}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <ClockIcon className="w-3.5 h-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="checkins" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <UsersIcon className="w-3.5 h-3.5" />
            {isMobile ? "QR" : "QR Check-ins"}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
            {isMobile ? "Absent" : "Absent Analytics"}
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <UserGroupIcon className="w-3.5 h-3.5" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <ChartBarIcon className="w-3.5 h-3.5" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="biometric" className="gap-1 rounded-md text-[10px] lg:text-xs px-2 lg:px-2.5 py-1.5 data-[state=active]:shadow-sm">
            <FingerPrintIcon className="w-3.5 h-3.5" />
            {isMobile ? "Bio" : "Biometric"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mark" className="mt-2">
          {isSlotMode ? <SlotAttendanceTab /> : <SimpleAttendanceTab />}
        </TabsContent>
        <TabsContent value="history" className="mt-2">
          <AttendanceHistoryTab />
        </TabsContent>
        <TabsContent value="checkins" className="mt-2">
          <MembersAttendanceTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-2">
          <AbsentAnalyticsTab />
        </TabsContent>
        <TabsContent value="staff" className="mt-2">
          <StaffAttendanceTab />
        </TabsContent>
        <TabsContent value="insights" className="mt-2">
          <AttendanceInsightsTab />
        </TabsContent>
        <TabsContent value="biometric" className="mt-2">
          <BiometricDevicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Attendance;
