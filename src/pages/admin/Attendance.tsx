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

  const tabs = [
    { value: "mark", icon: ClipboardDocumentListIcon, label: isMobile ? "Mark" : "Mark Attendance" },
    { value: "history", icon: ClockIcon, label: "History" },
    { value: "checkins", icon: UsersIcon, label: isMobile ? "QR" : "QR Check-ins" },
    { value: "analytics", icon: ExclamationTriangleIcon, label: isMobile ? "Absent" : "Absent Analytics" },
    { value: "staff", icon: UserGroupIcon, label: "Staff" },
    { value: "insights", icon: ChartBarIcon, label: "Insights" },
    { value: "biometric", icon: FingerPrintIcon, label: isMobile ? "Bio" : "Biometric" },
  ];

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-[11px] lg:text-sm text-muted-foreground mt-0.5">
            {isSlotMode ? "Time slot based attendance" : "Track daily member attendance"}
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "text-[10px] lg:text-xs shrink-0 transition-colors duration-300",
          isSlotMode ? "border-primary/30 text-primary" : "border-muted-foreground/30"
        )}>
          {isSlotMode ? "Slot Mode" : "Simple Mode"}
        </Badge>
      </div>

      <Tabs defaultValue="mark" className="space-y-3">
        <TabsList className="bg-muted/50 rounded-lg p-0.5 lg:p-1 h-auto inline-flex overflow-x-auto scrollbar-hide gap-0.5 lg:gap-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="gap-1 lg:gap-1.5 rounded-md text-[10px] lg:text-xs px-2 lg:px-3 py-1.5 lg:py-2 data-[state=active]:shadow-sm shrink-0 transition-all duration-200 data-[state=active]:scale-[1.02]"
            >
              <tab.icon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="mark" className="mt-0 animate-fade-in">
          {isSlotMode ? <SlotAttendanceTab /> : <SimpleAttendanceTab />}
        </TabsContent>
        <TabsContent value="history" className="mt-0 animate-fade-in">
          <AttendanceHistoryTab />
        </TabsContent>
        <TabsContent value="checkins" className="mt-0 animate-fade-in">
          <MembersAttendanceTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-0 animate-fade-in">
          <AbsentAnalyticsTab />
        </TabsContent>
        <TabsContent value="staff" className="mt-0 animate-fade-in">
          <StaffAttendanceTab />
        </TabsContent>
        <TabsContent value="insights" className="mt-0 animate-fade-in">
          <AttendanceInsightsTab />
        </TabsContent>
        <TabsContent value="biometric" className="mt-0 animate-fade-in">
          <BiometricDevicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Attendance;
