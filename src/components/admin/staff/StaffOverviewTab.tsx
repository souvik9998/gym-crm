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
import { UserGroupIcon, AcademicCapIcon, CurrencyRupeeIcon, BuildingOfficeIcon } from "@heroicons/react/24/outline";

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
  const activeStaff = allStaff.filter((s) => s.is_active);
  const trainers = allStaff.filter((s) => s.role === "trainer");
  const otherStaff = allStaff.filter((s) => s.role !== "trainer");
  
  // Calculate total monthly salary
  const totalMonthlySalary = activeStaff.reduce((sum, s) => sum + (s.monthly_salary || 0), 0);
  
  // Group by role
  const staffByRole = allStaff.reduce((acc, s) => {
    acc[s.role] = (acc[s.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Staff with login access
  const staffWithLogin = allStaff.filter((s) => s.password_hash);

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
    if (perms.can_access_financials) badges.push("Financials");
    if (perms.can_access_analytics) badges.push("Analytics");
    if (perms.can_change_settings) badges.push("Settings");

    return badges;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <UserGroupIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allStaff.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeStaff.length} active, {allStaff.length - activeStaff.length} inactive
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trainers</CardTitle>
            <AcademicCapIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trainers.length}</div>
            <p className="text-xs text-muted-foreground">
              {trainers.filter((t) => t.is_active).length} active trainers
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Salary</CardTitle>
            <CurrencyRupeeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalMonthlySalary.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total for active staff</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Login Access</CardTitle>
            <BuildingOfficeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{staffWithLogin.length}</div>
            <p className="text-xs text-muted-foreground">
              {allStaff.length - staffWithLogin.length} without credentials
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Staff by Role</CardTitle>
          <CardDescription>Distribution of staff across different roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Object.entries(staffByRole).map(([role, count]) => (
              <div key={role} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Badge className={getRoleBadgeColor(role)}>{ROLE_LABELS[role] || role}</Badge>
                <span className="text-lg font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>All Staff Members</CardTitle>
          <CardDescription>Complete overview of all staff with their details and permissions</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableRow key={member.id} className="transition-colors duration-150 hover:bg-muted/50">
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
                            <div className="text-xs text-muted-foreground">
                              ₹{member.session_fee}/session
                            </div>
                          )}
                          {member.percentage_fee > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {member.percentage_fee}% fee
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getPermissionBadges(member)?.slice(0, 2).map((perm) => (
                            <Badge key={perm} variant="secondary" className="text-xs">
                              {perm}
                            </Badge>
                          ))}
                          {getPermissionBadges(member)?.length && getPermissionBadges(member)!.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{getPermissionBadges(member)!.length - 2}
                            </Badge>
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
                          {member.password_hash && (
                            <Badge variant="outline" className="text-xs text-blue-600">
                              🔑
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
        </CardContent>
      </Card>
    </div>
  );
};
