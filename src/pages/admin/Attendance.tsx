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
import { AttendanceSkeleton } from "@/components/admin/attendance/AttendanceSkeleton";
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
import { useAuth } from "@/contexts/AuthContext";

const Attendance = () => {
  const isMobile = useIsMobile();
  const { currentBranch } = useBranch();
  const { tenantPermissions, isSuperAdmin } = useAuth();

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

  // Check attendance mode permissions from tenant features
  const canManual = isSuperAdmin || tenantPermissions.attendance_manual;
  const canQR = isSuperAdmin || tenantPermissions.attendance_qr;
  const canBiometric = isSuperAdmin || tenantPermissions.attendance_biometric;

  const allTabs = [
    { value: "mark", icon: ClipboardDocumentListIcon, label: isMobile ? "Mark" : "Mark Attendance", visible: canManual },
    { value: "history", icon: ClockIcon, label: "History", visible: true },
    { value: "checkins", icon: UsersIcon, label: isMobile ? "QR" : "QR Check-ins", visible: canQR },
    { value: "analytics", icon: ExclamationTriangleIcon, label: isMobile ? "Absent" : "Absent Analytics", visible: true },
    { value: "staff", icon: UserGroupIcon, label: "Staff", visible: true },
    { value: "insights", icon: ChartBarIcon, label: "Insights", visible: true },
    { value: "biometric", icon: FingerPrintIcon, label: isMobile ? "Bio" : "Biometric", visible: canBiometric },
  ];

  const tabs = allTabs.filter(t => t.visible);
  const defaultTab = tabs[0]?.value || "history";

  return (
    <div className="space-y-3 lg:space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-base lg:text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="text-[10px] lg:text-sm text-muted-foreground mt-0.5 truncate">
            {isSlotMode ? "Time slot based attendance" : "Track daily member attendance"}
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "text-[9px] lg:text-xs shrink-0 transition-colors duration-300 px-1.5 py-0.5 lg:px-2.5 lg:py-0.5",
          isSlotMode ? "border-primary/30 text-primary" : "border-muted-foreground/30"
        )}>
          {isSlotMode ? "Slot Mode" : "Simple Mode"}
        </Badge>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-3 lg:space-y-3">
        {/* Tabs - scrollable pill style on mobile, left-aligned */}
        <div className="-mx-1 px-1 lg:mx-0 lg:px-0 overflow-x-auto scrollbar-hide">
          <TabsList className="bg-muted/50 rounded-lg p-0.5 lg:p-1 h-auto inline-flex w-auto lg:w-auto gap-0.5 justify-start">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1 lg:gap-1.5 rounded-md text-[10px] lg:text-xs px-2 lg:px-3 py-1.5 lg:py-2 data-[state=active]:shadow-sm shrink-0 transition-all duration-200 data-[state=active]:scale-[1.02] whitespace-nowrap"
              >
                <tab.icon className="w-3 h-3 lg:w-4 lg:h-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {canManual && (
          <TabsContent value="mark" className="mt-0 animate-fade-in">
            {isSlotMode ? <SlotAttendanceTab /> : <SimpleAttendanceTab />}
          </TabsContent>
        )}
        <TabsContent value="history" className="mt-0 animate-fade-in">
          <AttendanceHistoryTab />
        </TabsContent>
        {canQR && (
          <TabsContent value="checkins" className="mt-0 animate-fade-in">
            <MembersAttendanceTab />
          </TabsContent>
        )}
        <TabsContent value="analytics" className="mt-0 animate-fade-in">
          <AbsentAnalyticsTab />
        </TabsContent>
        <TabsContent value="staff" className="mt-0 animate-fade-in">
          <StaffAttendanceTab />
        </TabsContent>
        <TabsContent value="insights" className="mt-0 animate-fade-in">
          <AttendanceInsightsTab />
        </TabsContent>
        {canBiometric && (
          <TabsContent value="biometric" className="mt-0 animate-fade-in">
            <BiometricDevicesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Attendance;
