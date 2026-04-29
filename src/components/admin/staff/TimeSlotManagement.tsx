import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Staff } from "@/pages/admin/StaffManagement";
import { TimeSlotsTab } from "./timeslots/TimeSlotsTab";
import { SlotMembersTab } from "./timeslots/SlotMembersTab";
import { TimeSlotAnalyticsTab } from "./timeslots/TimeSlotAnalyticsTab";
import { TimeBucketsSettings } from "@/components/admin/TimeBucketsSettings";
import { AdjustmentsHorizontalIcon, ChartBarIcon, ClockIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { PageTour } from "@/components/guide/PageTour";
import { TIMESLOTS_STEPS } from "@/components/guide/tourSteps";

interface TimeSlotManagementProps {
  trainers: Staff[];
  currentBranch: any;
  allStaff: Staff[];
  /** Forwarded to children so the trainer-name resolution waits on the parent fetch. */
  trainersLoading?: boolean;
}

const VALID_SUBS = new Set(["slots", "members", "analytics", "time-filters"]);

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
        <TabsList data-tour="timeslots-tabs" className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="slots" data-tour="timeslots-tab-slots" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Time Slots</span>
          </TabsTrigger>
          <TabsTrigger value="members" data-tour="timeslots-tab-members" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Slot Members</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" data-tour="timeslots-tab-analytics" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="time-filters" data-tour="timeslots-tab-filters" className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3">
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Time Filters</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slots" forceMount hidden={activeSubTab !== "slots"}>
          <TimeSlotsTab trainers={trainers} currentBranch={currentBranch} trainersLoading={trainersLoading} />
        </TabsContent>

        <TabsContent value="members" forceMount hidden={activeSubTab !== "members"}>
          <SlotMembersTab trainers={trainers} currentBranch={currentBranch} trainerNameMap={trainerNameMap} />
        </TabsContent>

        <TabsContent value="analytics" forceMount hidden={activeSubTab !== "analytics"}>
          <TimeSlotAnalyticsTab currentBranch={currentBranch} trainerNameMap={trainerNameMap} />
        </TabsContent>

        <TabsContent value="time-filters" forceMount hidden={activeSubTab !== "time-filters"}>
          <TimeBucketsSettings />
        </TabsContent>
      </Tabs>
      <PageTour tourId="timeslots" steps={TIMESLOTS_STEPS} autoStart={false} />
    </div>
  );
};
