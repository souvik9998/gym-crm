import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Staff } from "@/pages/admin/StaffManagement";
import { TimeSlotsTab } from "./timeslots/TimeSlotsTab";
import { SlotMembersTab } from "./timeslots/SlotMembersTab";
import { StaffPermissionsOverviewTab } from "./timeslots/StaffPermissionsOverviewTab";
import { ClockIcon, UserGroupIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

interface TimeSlotManagementProps {
  trainers: Staff[];
  currentBranch: any;
  allStaff: Staff[];
}

export const TimeSlotManagement = ({
  trainers,
  currentBranch,
  allStaff,
}: TimeSlotManagementProps) => {
  const [activeSubTab, setActiveSubTab] = useState("slots");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="slots" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Time Slots</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Slot Members</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ShieldCheckIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Permissions</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slots">
          <TimeSlotsTab trainers={trainers} currentBranch={currentBranch} />
        </TabsContent>

        <TabsContent value="members">
          <SlotMembersTab trainers={trainers} currentBranch={currentBranch} />
        </TabsContent>

        <TabsContent value="permissions">
          <StaffPermissionsOverviewTab allStaff={allStaff} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
