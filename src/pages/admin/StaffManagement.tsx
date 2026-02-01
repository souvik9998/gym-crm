import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffTrainersTab } from "@/components/admin/staff/StaffTrainersTab";
import { StaffOtherTab } from "@/components/admin/staff/StaffOtherTab";
import { StaffOverviewTab } from "@/components/admin/staff/StaffOverviewTab";
import { AcademicCapIcon, UserGroupIcon, ChartBarIcon } from "@heroicons/react/24/outline";

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
  auth_user_id: string | null; // Supabase Auth user ID - indicates password is set
  password_set_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  // Joined data
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("trainers");

  useEffect(() => {
    fetchStaff();
  }, [refreshKey, currentBranch?.id]);

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      // Fetch all staff
      const { data: staffData, error: staffError } = await supabase
        .from("staff")
        .select("*")
        .order("full_name");

      if (staffError) throw staffError;

      // Fetch permissions for all staff
      const { data: permissionsData } = await supabase
        .from("staff_permissions")
        .select("*");

      // Fetch branch assignments
      const { data: assignmentsData } = await supabase
        .from("staff_branch_assignments")
        .select("*, branches(name)");

      // Combine data
      const combinedStaff = (staffData || []).map((s: any) => ({
        ...s,
        permissions: permissionsData?.find((p: any) => p.staff_id === s.id),
        branch_assignments: assignmentsData
          ?.filter((a: any) => a.staff_id === s.id)
          .map((a: any) => ({
            ...a,
            branch_name: a.branches?.name,
          })),
      }));

      // Filter by current branch if needed
      const filteredStaff = currentBranch?.id
        ? combinedStaff.filter(
            (s: Staff) =>
              s.branch_assignments?.some((a) => a.branch_id === currentBranch.id) ||
              s.branch_assignments?.length === 0
          )
        : combinedStaff;

      setStaff(filteredStaff);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const trainers = staff.filter((s) => s.role === "trainer");
  const otherStaff = staff.filter((s) => s.role !== "trainer");

  return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
          <TabsTrigger value="trainers" className="flex items-center gap-2">
            <AcademicCapIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Trainers</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <UserGroupIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Other Staff</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trainers">
          <StaffTrainersTab
            trainers={trainers}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="staff">
          <StaffOtherTab
            staff={otherStaff}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="overview">
          <StaffOverviewTab
            allStaff={staff}
            branches={branches}
            currentBranch={currentBranch}
            onRefresh={() => setRefreshKey((k) => k + 1)}
          />
        </TabsContent>
      </Tabs>
  );
};

export default StaffManagement;
