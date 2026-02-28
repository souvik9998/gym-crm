import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Staff } from "@/pages/admin/StaffManagement";
import { UserGroupIcon, AcademicCapIcon, CurrencyRupeeIcon, BuildingOfficeIcon, KeyIcon } from "@heroicons/react/24/outline";
import { StaffDetailDialog } from "./StaffDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";

interface StaffOverviewTabProps {
  allStaff: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  trainer: "Trainer",
  reception: "Reception",
  accountant: "Accountant",
};

export const StaffOverviewTab = ({
  allStaff,
  branches,
  currentBranch,
}: StaffOverviewTabProps) => {
  const { currentBranch: branchContext } = useBranch();
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [totalPaidToStaff, setTotalPaidToStaff] = useState(0);
  const [isLoadingTotalPaid, setIsLoadingTotalPaid] = useState(false);
  const isCompact = useIsTabletOrBelow();
  
  const activeStaff = allStaff.filter((s) => s.is_active);
  const trainers = allStaff.filter((s) => s.role === "trainer");
  
  const handleStaffClick = (staff: Staff) => {
    setSelectedStaff(staff);
    setIsDetailOpen(true);
  };
  
  const totalMonthlySalary = activeStaff.reduce((sum, s) => sum + (s.monthly_salary || 0), 0);

  useEffect(() => {
    if (currentBranch?.id || branchContext?.id) {
      fetchTotalPaidToStaff();
    }
  }, [currentBranch?.id, branchContext?.id, allStaff]);

  const fetchTotalPaidToStaff = async () => {
    const branchId = currentBranch?.id || branchContext?.id;
    if (!branchId) return;

    setIsLoadingTotalPaid(true);
    try {
      const staffNames = allStaff.map((s) => s.full_name);

      const [trainerPercentageExpenses, trainerSessionExpenses, staffSalaryExpenses] = await Promise.all([
        supabase.from("ledger_entries").select("amount").eq("entry_type", "expense").eq("category", "trainer_percentage").eq("branch_id", branchId),
        supabase.from("ledger_entries").select("amount").eq("entry_type", "expense").eq("category", "trainer_session").eq("branch_id", branchId),
        supabase.from("ledger_entries").select("amount").eq("entry_type", "expense").eq("category", "staff_salary").eq("branch_id", branchId)
      ]);

      let nameBasedExpenses: any[] = [];
      if (staffNames.length > 0) {
        const nameQueries = staffNames.map((name) => 
          supabase.from("ledger_entries").select("amount").eq("entry_type", "expense").neq("category", "trainer_percentage").neq("category", "trainer_session").neq("category", "staff_salary").ilike("description", `%${name}%`).eq("branch_id", branchId)
        );
        const nameResults = await Promise.all(nameQueries);
        nameBasedExpenses = nameResults.flatMap((result) => result.data || []);
      }

      const total = 
        (trainerPercentageExpenses.data?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0) +
        (trainerSessionExpenses.data?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0) +
        (staffSalaryExpenses.data?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0) +
        (nameBasedExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0));

      setTotalPaidToStaff(total);
    } catch (error: any) {
      console.error("Error fetching total paid to staff:", error);
    } finally {
      setIsLoadingTotalPaid(false);
    }
  };
  
  const staffByRole = allStaff.reduce((acc, s) => {
    acc[s.role] = (acc[s.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const staffWithLogin = allStaff.filter((s) => s.auth_user_id);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800";
      case "manager": return "bg-blue-100 text-blue-800";
      case "trainer": return "bg-purple-100 text-purple-800";
      case "accountant": return "bg-green-100 text-green-800";
      case "reception": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPermissionBadges = (staff: Staff) => {
    const perms = staff.permissions;
    if (!perms) return null;
    const badges = [];
    if (perms.can_view_members) badges.push("View Members");
    if (perms.can_manage_members) badges.push("Manage Members");
    if ((perms as any).can_access_ledger) badges.push("Ledger");
    if ((perms as any).can_access_payments) badges.push("Payments");
    if (perms.can_access_analytics) badges.push("Analytics");
    if (perms.can_change_settings) badges.push("Settings");
    return badges;
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-2 grid-cols-2 lg:gap-4 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg lg:text-2xl font-bold">{allStaff.length}</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">Total Staff</p>
              </div>
              <UserGroupIcon className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg lg:text-2xl font-bold">{trainers.length}</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">Trainers</p>
              </div>
              <AcademicCapIcon className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg lg:text-2xl font-bold">₹{totalMonthlySalary.toLocaleString()}</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">Monthly Salary</p>
              </div>
              <CurrencyRupeeIcon className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg lg:text-2xl font-bold">{staffWithLogin.length}</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">With Login</p>
              </div>
              <BuildingOfficeIcon className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-green-500 col-span-2 lg:col-span-1">
          <CardContent className="p-3 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                {isLoadingTotalPaid ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-lg lg:text-2xl font-bold text-green-600">
                      ₹{totalPaidToStaff.toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">
                      All salary expenses (trainers + staff)
                    </p>
                  </>
                )}
              </div>
              <CurrencyRupeeIcon className="h-4 w-4 lg:h-5 lg:w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="text-base lg:text-lg">Staff by Role</CardTitle>
          <CardDescription className="text-xs lg:text-sm">Distribution of staff across different roles</CardDescription>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
          <div className="flex flex-wrap gap-2 lg:gap-4">
            {Object.entries(staffByRole).map(([role, count]) => (
              <div key={role} className="flex items-center gap-1.5 lg:gap-2 p-2 lg:p-3 bg-muted/50 rounded-lg">
                <Badge className={`${getRoleBadgeColor(role)} text-[10px] lg:text-xs`}>{ROLE_LABELS[role] || role}</Badge>
                <span className="text-sm lg:text-lg font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="text-base lg:text-lg">All Staff Members</CardTitle>
          <CardDescription className="text-xs lg:text-sm">Complete overview of all staff with their details and permissions</CardDescription>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
          {isCompact ? (
            <div className="space-y-2">
              {allStaff.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No staff members found</p>
              ) : (
                allStaff.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleStaffClick(member)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{member.full_name}</p>
                          <Badge className={`${getRoleBadgeColor(member.role)} text-[10px] px-1.5 py-0`}>
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                        </div>
                        {member.specialization && (
                          <p className="text-[11px] text-muted-foreground">{member.specialization}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{member.phone}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {member.is_active ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactive</Badge>
                        )}
                        {member.auth_user_id && (
                          <KeyIcon className="w-3.5 h-3.5 text-blue-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {member.branch_assignments?.map((a) => (
                          <Badge key={a.id} variant="outline" className="text-[10px] px-1.5 py-0">
                            {a.branch_name}{a.is_primary && " ★"}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-right flex-shrink-0">
                        {member.monthly_salary > 0 && <span>₹{member.monthly_salary.toLocaleString()}/mo</span>}
                        {member.percentage_fee > 0 && <span className="text-muted-foreground ml-1">{member.percentage_fee}%</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Branches</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allStaff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No staff members found
                      </TableCell>
                    </TableRow>
                  ) : (
                    allStaff.map((member) => (
                      <TableRow 
                        key={member.id} 
                        className="transition-colors duration-150 hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleStaffClick(member)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.full_name}</p>
                            {member.specialization && (
                              <p className="text-xs text-muted-foreground">{member.specialization}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeColor(member.role)}>
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{member.phone}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {member.branch_assignments?.map((a) => (
                              <Badge key={a.id} variant="outline" className="text-xs">
                                {a.branch_name}
                                {a.is_primary && " ★"}
                              </Badge>
                            ))}
                            {(!member.branch_assignments || member.branch_assignments.length === 0) && (
                              <span className="text-xs text-muted-foreground">No branch</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {member.monthly_salary > 0 && (
                              <div>₹{member.monthly_salary.toLocaleString()}/mo</div>
                            )}
                            {member.session_fee > 0 && (
                              <div className="text-xs text-muted-foreground">₹{member.session_fee}/session</div>
                            )}
                            {member.percentage_fee > 0 && (
                              <div className="text-xs text-muted-foreground">{member.percentage_fee}% fee</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getPermissionBadges(member)?.slice(0, 2).map((perm) => (
                              <Badge key={perm} variant="secondary" className="text-xs">{perm}</Badge>
                            ))}
                            {getPermissionBadges(member)?.length && getPermissionBadges(member)!.length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{getPermissionBadges(member)!.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {member.is_active ? (
                              <Badge className="bg-green-100 text-green-800">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                            {member.auth_user_id && (
                              <Badge variant="outline" className="text-xs text-blue-600 flex items-center gap-1">
                                <KeyIcon className="w-3 h-3" />
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <StaffDetailDialog
        staff={selectedStaff}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </div>
  );
};