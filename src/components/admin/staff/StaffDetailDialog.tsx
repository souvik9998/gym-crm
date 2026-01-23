import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Staff } from "@/pages/admin/StaffManagement";
import {
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  TrendingUp,
  Building2,
  Shield,
  Key,
  Clock,
  IndianRupee,
} from "lucide-react";
import { format } from "date-fns";

interface SalaryHistoryEntry {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  category: string;
  is_auto_generated: boolean;
  member_name?: string;
  payment_id?: string;
}

interface StaffDetailDialogProps {
  staff: Staff | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  trainer: "Trainer",
  reception: "Reception",
  accountant: "Accountant",
};

export const StaffDetailDialog = ({ staff, open, onOpenChange }: StaffDetailDialogProps) => {
  const { currentBranch } = useBranch();
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [totalSalaryPaid, setTotalSalaryPaid] = useState(0);

  useEffect(() => {
    if (staff && open) {
      fetchSalaryHistory();
    }
  }, [staff, open, currentBranch?.id]);

  const fetchSalaryHistory = async () => {
    if (!staff || !currentBranch?.id) return;

    setIsLoadingHistory(true);
    try {
      const salaryEntries: SalaryHistoryEntry[] = [];

      // For trainers, find matching personal_trainer and get percentage expenses
      if (staff.role === "trainer") {
        // Find personal_trainer by phone match (try with branch_id first, then without)
        let personalTrainer = null;
        if (staff.phone) {
          const { data: trainerByPhone } = await supabase
            .from("personal_trainers")
            .select("id")
            .eq("phone", staff.phone)
            .eq("branch_id", currentBranch.id)
            .maybeSingle();
          
          if (!trainerByPhone) {
            // Try without branch_id constraint (for trainers not yet assigned to branch)
            const { data: trainerByPhoneOnly } = await supabase
              .from("personal_trainers")
              .select("id")
              .eq("phone", staff.phone)
              .maybeSingle();
            personalTrainer = trainerByPhoneOnly;
          } else {
            personalTrainer = trainerByPhone;
          }
        }

        // Also try matching by name if phone match fails
        if (!personalTrainer) {
          const { data: trainerByName } = await supabase
            .from("personal_trainers")
            .select("id")
            .ilike("name", staff.full_name)
            .eq("branch_id", currentBranch.id)
            .maybeSingle();
          personalTrainer = trainerByName;
        }

        if (personalTrainer) {
          // Fetch auto-generated percentage expenses
          const { data: percentageExpenses } = await supabase
            .from("ledger_entries")
            .select(`
              id,
              entry_date,
              description,
              amount,
              category,
              is_auto_generated,
              member_id,
              payment_id,
              members:member_id (name)
            `)
            .eq("trainer_id", personalTrainer.id)
            .eq("entry_type", "expense")
            .eq("category", "trainer_percentage")
            .eq("branch_id", currentBranch.id)
            .order("entry_date", { ascending: false });

          if (percentageExpenses) {
            percentageExpenses.forEach((expense: any) => {
              salaryEntries.push({
                id: expense.id,
                entry_date: expense.entry_date,
                description: expense.description,
                amount: Number(expense.amount),
                category: expense.category,
                is_auto_generated: expense.is_auto_generated,
                member_name: expense.members?.name,
                payment_id: expense.payment_id,
              });
            });
          }
        }

        // Fetch manual session-based expenses (trainer_session category)
        // Match by staff name in description
        const { data: sessionExpenses } = await supabase
          .from("ledger_entries")
          .select(`
            id,
            entry_date,
            description,
            amount,
            category,
            is_auto_generated,
            member_id,
            payment_id,
            members:member_id (name)
          `)
          .eq("entry_type", "expense")
          .eq("category", "trainer_session")
          .ilike("description", `%${staff.full_name}%`)
          .eq("branch_id", currentBranch.id)
          .order("entry_date", { ascending: false });

        if (sessionExpenses) {
          sessionExpenses.forEach((expense: any) => {
            salaryEntries.push({
              id: expense.id,
              entry_date: expense.entry_date,
              description: expense.description,
              amount: Number(expense.amount),
              category: expense.category,
              is_auto_generated: expense.is_auto_generated,
              member_name: expense.members?.name,
              payment_id: expense.payment_id,
            });
          });
        }
      } else {
        // For non-trainer staff, look for manual salary expenses
        // Check for expenses with staff name in description
        const { data: salaryExpenses } = await supabase
          .from("ledger_entries")
          .select(`
            id,
            entry_date,
            description,
            amount,
            category,
            is_auto_generated,
            member_id,
            payment_id,
            members:member_id (name)
          `)
          .eq("entry_type", "expense")
          .ilike("description", `%${staff.full_name}%`)
          .eq("branch_id", currentBranch.id)
          .order("entry_date", { ascending: false });

        if (salaryExpenses) {
          salaryExpenses.forEach((expense: any) => {
            salaryEntries.push({
              id: expense.id,
              entry_date: expense.entry_date,
              description: expense.description,
              amount: Number(expense.amount),
              category: expense.category,
              is_auto_generated: expense.is_auto_generated,
              member_name: expense.members?.name,
              payment_id: expense.payment_id,
            });
          });
        }
      }

      // Sort by date descending and remove duplicates
      const uniqueEntries = salaryEntries.filter(
        (entry, index, self) => index === self.findIndex((e) => e.id === entry.id)
      );
      uniqueEntries.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());

      setSalaryHistory(uniqueEntries);
      setTotalSalaryPaid(uniqueEntries.reduce((sum, entry) => sum + entry.amount, 0));
    } catch (error: any) {
      console.error("Error fetching salary history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (!staff) return null;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "manager":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "trainer":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "accountant":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "reception":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getPermissionBadges = () => {
    const perms = staff.permissions;
    if (!perms) return [];

    const badges = [];
    if (perms.can_view_members) badges.push("View Members");
    if (perms.can_manage_members) badges.push("Manage Members");
    if ((perms as any).can_access_ledger) badges.push("Ledger");
    if ((perms as any).can_access_payments) badges.push("Payments");
    if (perms.can_access_analytics) badges.push("Analytics");
    if (perms.can_change_settings) badges.push("Settings");

    return badges;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd MMM yyyy");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold">{staff.full_name}</p>
              <p className="text-sm font-normal text-muted-foreground">
                {ROLE_LABELS[staff.role] || staff.role}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription>Complete staff member details and salary history</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{staff.phone}</p>
                  </div>
                </div>
                {staff.specialization && (
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Specialization</p>
                      <p className="font-medium">{staff.specialization}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Joined</p>
                    <p className="font-medium">{formatDate(staff.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={staff.is_active ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500"}>
                      {staff.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>

              {staff.id_type && staff.id_number && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">ID Details</p>
                    <p className="font-medium">
                      {staff.id_type.toUpperCase()}: {staff.id_number}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Salary Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Salary Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {staff.monthly_salary > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Salary</p>
                    <p className="text-lg font-semibold">₹{staff.monthly_salary.toLocaleString()}</p>
                  </div>
                )}
                {staff.session_fee > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Session Fee</p>
                    <p className="text-lg font-semibold">₹{staff.session_fee.toLocaleString()}/session</p>
                  </div>
                )}
                {staff.percentage_fee > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Percentage Fee</p>
                    <p className="text-lg font-semibold">{staff.percentage_fee}%</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Salary Type</p>
                <Badge variant="outline">{staff.salary_type.replace(/_/g, " ").toUpperCase()}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Branch Assignments */}
          {staff.branch_assignments && staff.branch_assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Branch Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {staff.branch_assignments.map((assignment) => (
                    <Badge key={assignment.id} variant="outline" className="text-sm">
                      {assignment.branch_name}
                      {assignment.is_primary && " ★"}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Permissions */}
          {getPermissionBadges().length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {getPermissionBadges().map((perm) => (
                    <Badge key={perm} variant="secondary">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Login Access */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="w-5 h-5" />
                Login Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Password Set</span>
                  <Badge variant={staff.password_hash ? "default" : "secondary"}>
                    {staff.password_hash ? "Yes" : "No"}
                  </Badge>
                </div>
                {staff.password_set_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Password Set At</span>
                    <span className="text-sm font-medium">{formatDate(staff.password_set_at)}</span>
                  </div>
                )}
                {staff.last_login_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Login</span>
                    <span className="text-sm font-medium">
                      {format(new Date(staff.last_login_at), "dd MMM yyyy, hh:mm a")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Salary History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Salary History
                  </CardTitle>
                  <CardDescription>
                    Track all salary payments and deductions for this staff member
                  </CardDescription>
                </div>
                {totalSalaryPaid > 0 && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{totalSalaryPaid.toLocaleString("en-IN")}
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                </div>
              ) : salaryHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <IndianRupee className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No salary history found</p>
                  <p className="text-sm mt-2">
                    Salary payments will appear here when expenses are added or auto-deducted
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salaryHistory.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(entry.entry_date)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{entry.description}</p>
                              {entry.is_auto_generated && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  Auto-generated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                entry.category === "trainer_percentage"
                                  ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                  : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                              }
                            >
                              {entry.category === "trainer_percentage" ? "Percentage" : "Session"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.member_name ? (
                              <span className="text-sm">{entry.member_name}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            ₹{entry.amount.toLocaleString("en-IN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
