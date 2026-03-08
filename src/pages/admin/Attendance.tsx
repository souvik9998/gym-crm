import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersAttendanceTab } from "@/components/admin/attendance/MembersAttendanceTab";
import { StaffAttendanceTab } from "@/components/admin/attendance/StaffAttendanceTab";
import { AttendanceInsightsTab } from "@/components/admin/attendance/AttendanceInsightsTab";
import { BiometricDevicesTab } from "@/components/admin/attendance/BiometricDevicesTab";
import { UsersIcon, UserGroupIcon, ChartBarIcon, FingerPrintIcon } from "@heroicons/react/24/outline";

const Attendance = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">Track member and staff attendance via QR check-in and biometric devices.</p>
      </div>

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <UsersIcon className="w-4 h-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-2">
            <UserGroupIcon className="w-4 h-4" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2">
            <ChartBarIcon className="w-4 h-4" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="biometric" className="gap-2">
            <FingerPrintIcon className="w-4 h-4" />
            Biometric
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
