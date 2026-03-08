import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersAttendanceTab } from "@/components/admin/attendance/MembersAttendanceTab";
import { StaffAttendanceTab } from "@/components/admin/attendance/StaffAttendanceTab";
import { AttendanceInsightsTab } from "@/components/admin/attendance/AttendanceInsightsTab";
import { BiometricDevicesTab } from "@/components/admin/attendance/BiometricDevicesTab";
import { UsersIcon, UserGroupIcon, ChartBarIcon, FingerPrintIcon } from "@heroicons/react/24/outline";
import { useIsMobile } from "@/hooks/use-mobile";

const Attendance = () => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">Track member and staff attendance via QR check-in and biometric devices.</p>
      </div>

      <Tabs defaultValue="members" className="space-y-3 lg:space-y-4">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger value="members" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <UsersIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Members" : "Members"}
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Staff" : "Staff"}
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Insights" : "Insights"}
          </TabsTrigger>
          <TabsTrigger value="biometric" className="gap-1.5 rounded-lg text-[11px] lg:text-sm px-2.5 lg:px-3 py-1.5">
            <FingerPrintIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {isMobile ? "Bio" : "Biometric"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersAttendanceTab />
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
