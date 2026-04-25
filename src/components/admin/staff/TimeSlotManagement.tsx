import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Staff } from "@/pages/admin/StaffManagement";
import { TimeSlotsTab } from "./timeslots/TimeSlotsTab";
import { SlotMembersTab } from "./timeslots/SlotMembersTab";
import { TimeSlotAnalyticsTab } from "./timeslots/TimeSlotAnalyticsTab";
import { ChartBarIcon, ClockIcon, UserGroupIcon } from "@heroicons/react/24/outline";

interface TimeSlotManagementProps {
  trainers: Staff[];
  currentBranch: any;
  allStaff: Staff[];
  /** Forwarded to children so the trainer-name resolution waits on the parent fetch. */
  trainersLoading?: boolean;
}

const VALID_SUBS = new Set(["slots", "members", "analytics"]);

export const TimeSlotManagement = ({
  trainers,
  currentBranch,
  allStaff,
  trainersLoading = false,
}: TimeSlotManagementProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const subParam = searchParams.get("sub");
  const activeSubTab = subParam && VALID_SUBS.has(subParam) ? subParam : "slots";

  // Persist sub-tab in URL (`?tab=timeslots&sub=members`) so reload + browser
  // back keep the user where they were. forceMount on TabsContent below
  // preserves the in-tab state (filters, search, dialogs) across switches.
  const setActiveSubTab = useCallback(
    (sub: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("sub", sub);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const trainerNameMap = allStaff.reduce<Record<string, string>>((acc, staff) => {
    acc[staff.id] = staff.full_name;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="slots" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Time Slots</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Slot Members</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slots" forceMount hidden={activeSubTab !== "slots"}>
          <TimeSlotsTab trainers={trainers} currentBranch={currentBranch} />
        </TabsContent>

        <TabsContent value="members" forceMount hidden={activeSubTab !== "members"}>
          <SlotMembersTab trainers={trainers} currentBranch={currentBranch} trainerNameMap={trainerNameMap} />
        </TabsContent>

        <TabsContent value="analytics" forceMount hidden={activeSubTab !== "analytics"}>
          <TimeSlotAnalyticsTab currentBranch={currentBranch} trainerNameMap={trainerNameMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
