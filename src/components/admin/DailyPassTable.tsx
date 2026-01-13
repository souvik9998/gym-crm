import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { format, isAfter, addDays, isBefore } from "date-fns";
import { exportToExcel } from "@/utils/exportToExcel";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { 
  MoreHorizontal, 
  Search, 
  Trash2, 
  Calendar, 
  User, 
  RefreshCw,
  Dumbbell,
  Clock,
  Download
} from "lucide-react";

interface DailyPassUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  created_at: string;
  subscription?: {
    id: string;
    package_name: string;
    duration_days: number;
    start_date: string;
    end_date: string;
    price: number;
    trainer_fee: number;
    status: string;
    personal_trainer_id: string | null;
    trainer?: {
      name: string;
    };
  };
}

interface DailyPassTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: string;
}

const DailyPassTable = ({ searchQuery, refreshKey, filterValue }: DailyPassTableProps) => {
  const [users, setUsers] = useState<DailyPassUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<DailyPassUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [refreshKey]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch daily pass users with their latest subscription
      const { data: usersData, error: usersError } = await supabase
        .from("daily_pass_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      // Fetch subscriptions for each user
      const usersWithSubs = await Promise.all(
        (usersData || []).map(async (user) => {
          const { data: subData } = await supabase
            .from("daily_pass_subscriptions")
            .select(`
              *,
              personal_trainers:personal_trainer_id (name)
            `)
            .eq("daily_pass_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...user,
            subscription: subData ? {
              ...subData,
              trainer: subData.personal_trainers || undefined,
            } : undefined,
          };
        })
      );

      setUsers(usersWithSubs);
    } catch (error) {
      console.error("Error fetching daily pass users:", error);
      toast.error("Error", {
        description: "Failed to load daily pass users",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      // First, delete related records in the correct order to avoid FK constraints
      
      // 1. Delete user activity logs referencing this daily pass user
      await supabase
        .from("user_activity_logs")
        .delete()
        .eq("daily_pass_user_id", userToDelete.id);

      // 2. Delete WhatsApp notifications
      await supabase
        .from("whatsapp_notifications")
        .delete()
        .eq("daily_pass_user_id", userToDelete.id);

      // 3. Delete ledger entries
      await supabase
        .from("ledger_entries")
        .delete()
        .eq("daily_pass_user_id", userToDelete.id);

      // 4. Delete payments referencing daily pass subscriptions
      await supabase
        .from("payments")
        .delete()
        .eq("daily_pass_user_id", userToDelete.id);

      // 5. Delete daily pass subscriptions
      await supabase
        .from("daily_pass_subscriptions")
        .delete()
        .eq("daily_pass_user_id", userToDelete.id);

      // 6. Finally delete the daily pass user
      const { error } = await supabase
        .from("daily_pass_users")
        .delete()
        .eq("id", userToDelete.id);

      if (error) throw error;

      // Log the admin activity
      await logAdminActivity({
        category: "members",
        type: "member_deleted",
        description: `Deleted daily pass user: ${userToDelete.name}`,
        entityType: "daily_pass_user",
        entityId: userToDelete.id,
        entityName: userToDelete.name,
        oldValue: {
          name: userToDelete.name,
          phone: userToDelete.phone,
          email: userToDelete.email,
          gender: userToDelete.gender,
          subscription: userToDelete.subscription ? {
            package_name: userToDelete.subscription.package_name,
            end_date: userToDelete.subscription.end_date,
            trainer: userToDelete.subscription.trainer?.name,
          } : null,
        },
        metadata: {
          userType: "daily_pass",
        },
      });

      toast.success("Success", {
        description: "Daily pass user deleted successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error("Error", {
        description: error.message || "Failed to delete daily pass user",
      });
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const getStatusBadge = (subscription?: DailyPassUser["subscription"]) => {
    if (!subscription) {
      return <Badge variant="outline" className="text-muted-foreground">No Pass</Badge>;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const expiringThreshold = addDays(today, 1);

    if (isAfter(today, endDate)) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (isAfter(expiringThreshold, endDate) || endDate.getTime() === today.getTime()) {
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Expiring Today</Badge>;
    } else {
      return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
    }
  };

  const getStatusText = (subscription?: DailyPassUser["subscription"]) => {
    if (!subscription) {
      return "No Pass";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const expiringThreshold = addDays(today, 1);

    if (isAfter(today, endDate)) {
      return "Expired";
    } else if (isAfter(expiringThreshold, endDate) || endDate.getTime() === today.getTime()) {
      return "Expiring Today";
    } else {
      return "Active";
    }
  };

  const handleExport = () => {
    try {
      const exportData = filteredUsers.map((user) => ({
        Name: user.name,
        Phone: user.phone,
        Email: user.email || "-",
        Gender: user.gender || "-",
        "Package Name": user.subscription?.package_name || "-",
        "Duration (Days)": user.subscription?.duration_days || "-",
        "Start Date": user.subscription?.start_date ? format(new Date(user.subscription.start_date), "dd MMM yyyy") : "-",
        "End Date": user.subscription?.end_date ? format(new Date(user.subscription.end_date), "dd MMM yyyy") : "-",
        "Price": user.subscription?.price ? `₹${user.subscription.price}` : "-",
        "Trainer": user.subscription?.trainer?.name || "-",
        Status: getStatusText(user.subscription),
        "Created At": format(new Date(user.created_at), "dd MMM yyyy"),
      }));

      exportToExcel(exportData, "daily_pass_users");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} daily pass user(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export daily pass users",
      });
    }
  };

  // Filter users based on search and filter value
  const filteredUsers = useMemo(() => {
    let result = users;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.phone.includes(query)
      );
    }

    // Apply status filter
    if (filterValue && filterValue !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      result = result.filter((user) => {
        if (!user.subscription) {
          return filterValue === "expired";
        }

        const endDate = new Date(user.subscription.end_date);
        endDate.setHours(0, 0, 0, 0);
        const expiringThreshold = addDays(today, 1);

        if (filterValue === "active") {
          return isAfter(endDate, today) || endDate.getTime() === today.getTime();
        } else if (filterValue === "expiring_soon") {
          return endDate.getTime() === today.getTime() || 
                 (isAfter(expiringThreshold, today) && !isAfter(today, endDate));
        } else if (filterValue === "expired") {
          return isAfter(today, endDate);
        }
        return true;
      });
    }

    return result;
  }, [users, searchQuery, filterValue]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filteredUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <User className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No daily pass users found</p>
        <p className="text-sm">Daily pass users will appear here after they register</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-2 hover:bg-accent/50 transition-colors font-medium"
        >
          <Download className="w-4 h-4" />
          Export Data
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.phone}</TableCell>
                <TableCell>
                  {user.subscription ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{user.subscription.package_name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {user.subscription?.trainer ? (
                    <div className="flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-accent" />
                      <span>{user.subscription.trainer.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {user.subscription ? (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{format(new Date(user.subscription.end_date), "d MMM yyyy")}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>{getStatusBadge(user.subscription)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setUserToDelete(user);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setUserToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Daily Pass User"
        description={`Are you sure you want to delete ${userToDelete?.name}? This will also delete all their subscriptions and payment records.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
};

export default DailyPassTable;
