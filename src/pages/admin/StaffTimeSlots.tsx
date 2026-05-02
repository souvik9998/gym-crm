import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

import { ChartBarIcon, ClockIcon, UserGroupIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { TimeSlotsTab } from "@/components/admin/staff/timeslots/TimeSlotsTab";
import { SlotMembersTab } from "@/components/admin/staff/timeslots/SlotMembersTab";
import { TimeSlotAnalyticsTab } from "@/components/admin/staff/timeslots/TimeSlotAnalyticsTab";
import type { Staff } from "@/pages/admin/StaffManagement";

/**
 * Staff-facing Time Slots page.
 *
 * Permission-driven view layered on top of the existing TimeSlotsTab / SlotMembersTab.
 *
 * Visibility rules:
 *  - `member_access_type === "assigned"` AND user is themselves a trainer
 *      → only their own slots are visible (restrictedTrainerId = staffUser.id).
 *  - `member_access_type === "all"` (or non-trainer staff with permission)
 *      → all branch slots visible.
 *
 * Action rules (props passed to children):
 *  - canCreate = can_create_time_slots || can_manage_time_slots
 *  - canEditDelete = can_edit_delete_time_slots || can_manage_time_slots
 *  - canViewMembers = can_view_slot_members || can_manage_time_slots
 *  - canAssignMembers = can_assign_members_to_slots || can_manage_time_slots
 */
const StaffTimeSlots = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser, permissions, isLoading: staffLoading } = useStaffAuth();
  const [activeSubTab, setActiveSubTab] = useState("slots");

  useEffect(() => {
    if (!staffLoading && !isStaffLoggedIn) navigate("/admin/login");
  }, [staffLoading, isStaffLoggedIn, navigate]);

  // Permission resolution
  const canManage = !!permissions?.can_manage_time_slots;
  const canView = canManage || !!permissions?.can_view_time_slots;
  const canCreate = canManage || !!permissions?.can_create_time_slots;
  const canEditDelete = canManage || !!permissions?.can_edit_delete_time_slots;
  const canViewMembers = canManage || !!permissions?.can_view_slot_members;
  const canAssignMembers = canManage || !!permissions?.can_assign_members_to_slots;

  const isAssignedOnly = permissions?.member_access_type === "assigned";
  // Restrict listing to this staff-trainer only when "assigned-only" access.
  // trainer_id in trainer_time_slots references staff.id (see useAttendanceFilters).
  const restrictedTrainerId =
    isAssignedOnly && staffUser?.role === "trainer" ? staffUser.id : null;

  // Fetch trainers visible to this staff for the current branch.
  // Uses SECURITY DEFINER RPC so non-self trainer names resolve under "all" access too.
  const { data: trainerStaff = [] } = useQuery<Staff[]>({
    queryKey: ["staff-timeslot-trainers", currentBranch?.id, restrictedTrainerId, staffUser?.id],
    queryFn: async (): Promise<Staff[]> => {
      if (!currentBranch?.id) return [];

      // If restricted to self, build a single-entry list from the known staff user.
      if (restrictedTrainerId && staffUser) {
        const { data: selfRow } = await supabase
          .from("staff" as any)
          .select("id, full_name, phone, role, is_active")
          .eq("id", staffUser.id)
          .maybeSingle();
        const row = selfRow as any;
        if (!row) return [];
        return [
          {
            id: row.id,
            full_name: row.full_name,
            phone: row.phone,
            role: row.role,
            is_active: row.is_active,
          } as unknown as Staff,
        ];
      }

      // Otherwise, fetch all branch staff names via RPC and keep trainers.
      const { data: namesData } = await supabase.rpc(
        "get_staff_names_for_branch" as any,
        { _branch_id: currentBranch.id }
      );
      const names: Array<{ id: string; full_name: string }> = (namesData as any) || [];

      // Try to enrich with role/phone from `staff` table — RLS may restrict to self only,
      // but slot listing only needs id+name; phone is only required when this user
      // assigns members to a slot (fallback handled inside SlotMembersTab).
      const ids = names.map((n) => n.id);
      let staffRows: Array<{ id: string; phone: string | null; role: string; is_active: boolean }> = [];
      if (ids.length > 0) {
        const { data } = await supabase
          .from("staff" as any)
          .select("id, phone, role, is_active")
          .in("id", ids);
        staffRows = ((data as any) || []) as any;
      }
      const enrich = new Map(staffRows.map((r) => [r.id, r]));

      return names.map((n) => {
        const r = enrich.get(n.id);
        return {
          id: n.id,
          full_name: n.full_name,
          phone: r?.phone || "",
          role: (r?.role as Staff["role"]) || "trainer",
          is_active: r?.is_active ?? true,
        } as unknown as Staff;
      });
    },
    enabled: !!currentBranch?.id && canView,
    staleTime: 60_000,
  });

  // Trainers shown in dropdowns: only role=trainer; if restricted, just self.
  const trainers = useMemo(() => {
    const list = trainerStaff.filter((s) => s.role === "trainer" && s.is_active);
    if (restrictedTrainerId) return list.filter((s) => s.id === restrictedTrainerId);
    return list;
  }, [trainerStaff, restrictedTrainerId]);

  // Full name map (id → name) for resolving trainer names on slots whose
  // owner role couldn't be resolved via RLS-restricted staff table.
  const trainerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    trainerStaff.forEach((s) => { map[s.id] = s.full_name; });
    return map;
  }, [trainerStaff]);

  // Note: no full-page skeleton during staffLoading — the route-level
  // <Suspense> fallback (AdminSectionSkeleton) already covers chunk + initial
  // load. Returning another skeleton here would cause a visible skeleton swap.
  if (staffLoading) return null;

  if (!isStaffLoggedIn) return null;

  // No permission at all — show locked card.
  if (!canView) {
    return (
      <Card className="border-0 shadow-sm max-w-2xl mx-auto mt-8">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <LockClosedIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Access Restricted</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            You don't have permission to view time slots. Please contact your administrator
            if you believe this is an error.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine which sub-tabs to show.
  const showMembersTab = canViewMembers || canAssignMembers;
  const showAnalyticsTab = canView;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {restrictedTrainerId && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <ClockIcon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <p className="text-xs text-foreground">
            You're viewing <strong>your own time slots</strong> only. To view all trainers' slots,
            ask your admin to grant <em>"Access All Members"</em>.
          </p>
        </div>
      )}

      {showMembersTab || showAnalyticsTab ? (
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className={`grid w-full ${showMembersTab && showAnalyticsTab ? "max-w-xl grid-cols-3" : "max-w-md grid-cols-2"}`}>
            <TabsTrigger
              value="slots"
              className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3"
            >
              <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span>Time Slots</span>
            </TabsTrigger>
            {showMembersTab && (
              <TabsTrigger
                value="members"
                className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3"
              >
                <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                <span>Slot Members</span>
              </TabsTrigger>
            )}
            {showAnalyticsTab && (
              <TabsTrigger
                value="analytics"
                className="flex items-center gap-1 text-[10px] lg:text-sm px-1 lg:px-3"
              >
                <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                <span>Analytics</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="slots">
            <TimeSlotsTab
              trainers={trainers}
              currentBranch={currentBranch}
              restrictedTrainerId={restrictedTrainerId}
              canCreate={canCreate}
              canEditDelete={canEditDelete}
              canViewMembers={canViewMembers}
              trainerNameMap={trainerNameMap}
            />
          </TabsContent>

          {showMembersTab && (
            <TabsContent value="members">
              <SlotMembersTab
                trainers={trainers}
                currentBranch={currentBranch}
                restrictedTrainerId={restrictedTrainerId}
                canAssign={canAssignMembers}
                canRemove={canAssignMembers}
                trainerNameMap={trainerNameMap}
              />
            </TabsContent>
          )}

          {showAnalyticsTab && (
            <TabsContent value="analytics">
              <TimeSlotAnalyticsTab
                currentBranch={currentBranch}
                restrictedTrainerId={restrictedTrainerId}
                trainerNameMap={trainerNameMap}
              />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <TimeSlotsTab
          trainers={trainers}
          currentBranch={currentBranch}
          restrictedTrainerId={restrictedTrainerId}
          canCreate={canCreate}
          canEditDelete={canEditDelete}
          canViewMembers={false}
          trainerNameMap={trainerNameMap}
        />
      )}
    </div>
  );
};

export default StaffTimeSlots;
