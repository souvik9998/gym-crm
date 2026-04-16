import { useState, useCallback } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffTrainersTab } from "@/components/admin/staff/StaffTrainersTab";
import { StaffOtherTab } from "@/components/admin/staff/StaffOtherTab";
import { StaffOverviewTab } from "@/components/admin/staff/StaffOverviewTab";
import { TimeSlotManagement } from "@/components/admin/staff/TimeSlotManagement";
import { AcademicCapIcon, UserGroupIcon, ChartBarIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useStaffPageData } from "@/hooks/queries/useStaffPageData";

export interface Staff {
  id: string;
  phone: string;
  full_name: string;
  role: "manager" | "trainer" | "reception" | "accountant";
  id_type: string | null;
  id_number: string | null;
  salary_type: "monthly" | "session_based" | "percentage" | "both";
  monthly_salary: number;
  session_fee: number;
  percentage_fee: number;
  specialization: string | null;
  auth_user_id: string | null;
  password_set_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  permissions?: StaffPermissions;
  branch_assignments?: StaffBranchAssignment[];
}

export interface StaffPermissions {
  id: string;
  staff_id: string;
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
  can_send_whatsapp: boolean;
  can_access_attendance: boolean;
  member_access_type?: string;
  can_manage_time_slots?: boolean;
  can_create_time_slots?: boolean;
  can_edit_delete_time_slots?: boolean;
  can_view_time_slots?: boolean;
  can_assign_members_to_slots?: boolean;
  can_view_slot_members?: boolean;
}

export interface StaffBranchAssignment {
  id: string;
  staff_id: string;
  branch_id: string;
  is_primary: boolean;
  branch_name?: string;
}

const StaffManagement = () => {
  const { currentBranch, branches } = useBranch();
  const [activeTab, setActiveTab] = useState("trainers");
  const { staff, trainers, otherStaff, totalPaidToStaff, isLoading, refetch } = useStaffPageData();

  return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-4 mb-6">
          <TabsTrigger value="trainers" className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-sm px-1 lg:px-3">
            <AcademicCapIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Trainers</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-sm px-1 lg:px-3">
            <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Other Staff</span>
          </TabsTrigger>
          <TabsTrigger value="timeslots" className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-sm px-1 lg:px-3">
            <ClockIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Time Slots</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-sm px-1 lg:px-3">
            <ChartBarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Overview</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trainers">
          <StaffTrainersTab
            trainers={trainers}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => refetch()}
            isLoading={isLoading}
            onConversionSuccess={() => { refetch(); setActiveTab("staff"); }}
          />
        </TabsContent>

        <TabsContent value="staff">
          <StaffOtherTab
            staff={otherStaff}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => refetch()}
            isLoading={isLoading}
            onConversionSuccess={() => { refetch(); setActiveTab("trainers"); }}
          />
        </TabsContent>

        <TabsContent value="timeslots">
          <TimeSlotManagement
            trainers={trainers}
            currentBranch={currentBranch}
            allStaff={staff}
          />
        </TabsContent>

        <TabsContent value="overview">
          <StaffOverviewTab
            allStaff={staff}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => refetch()}
            totalPaidToStaff={totalPaidToStaff}
          />
        </TabsContent>
      </Tabs>
  );
};

export default StaffManagement;
