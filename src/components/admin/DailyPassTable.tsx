import { useState, useEffect, useMemo } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { useInView } from "react-intersection-observer";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { format, isAfter, addDays } from "date-fns";
import { exportToExcel } from "@/utils/exportToExcel";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import MobileExpandableRow from "@/components/admin/MobileExpandableRow";
import { useInfiniteDailyPassQuery, useDeleteDailyPassUser, type DailyPassUserWithSubscription } from "@/hooks/queries";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";
import { 
  MoreHorizontal, 
  Trash2, 
  Calendar, 
  User, 
  Dumbbell,
  Clock,
  Download,
  Phone,
  IndianRupee
} from "lucide-react";

interface DailyPassTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: string;
}

const DailyPassTable = ({ searchQuery, refreshKey, filterValue }: DailyPassTableProps) => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const isCompact = useIsTabletOrBelow();
  const deleteMutation = useDeleteDailyPassUser();
  
  // Use infinite query for paginated data fetching
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteDailyPassQuery();
  
  // Flatten all pages into single array
  const allUsers = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data);
  }, [data]);
  
  // Total count from the first page
  const totalCount = data?.pages[0]?.totalCount || 0;
  
  // Show loading when initially loading OR when data hasn't been fetched yet
  const showLoading = isLoading || (isFetching && !data) || data === undefined;

  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  // Fetch next page when scrolled to bottom
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<DailyPassUserWithSubscription | null>(null);

  // Refetch when refreshKey changes (manual refresh)
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      await deleteMutation.mutateAsync(userToDelete.id);

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
        branchId: currentBranch?.id,
      });

      toast.success("Success", {
        description: "Daily pass user deleted successfully",
      });
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

  const getStatusBadge = (subscription?: DailyPassUserWithSubscription["subscription"]) => {
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
      return <Badge className="bg-warning hover:bg-warning/90 text-warning-foreground">Expiring Today</Badge>;
    } else {
      return <Badge className="bg-success hover:bg-success/90 text-success-foreground">Active</Badge>;
    }
  };

  const getStatusText = (subscription?: DailyPassUserWithSubscription["subscription"]) => {
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
    let result = allUsers;

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
  }, [allUsers, searchQuery, filterValue]);

  // Check if data is confirmed empty
  const isDataConfirmedEmpty = !isLoading && !isFetching && data !== undefined && filteredUsers.length === 0;

  if (showLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  if (isDataConfirmedEmpty) {
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

      {/* Mobile View */}
      {isCompact ? (
        <div className="rounded-lg border overflow-hidden">
          {filteredUsers.map((user) => (
            <MobileExpandableRow
              key={user.id}
              collapsedContent={
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.phone}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(user.subscription)}
                  </div>
                </div>
              }
              expandedContent={
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </p>
                      <p className="font-medium mt-0.5">{user.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium mt-0.5">{user.email || "-"}</p>
                    </div>
                    {user.subscription && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Package
                          </p>
                          <p className="font-medium mt-0.5">{user.subscription.package_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" /> Price
                          </p>
                          <p className="font-medium mt-0.5">₹{user.subscription.price}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> End Date
                          </p>
                          <p className="font-medium mt-0.5">
                            {format(new Date(user.subscription.end_date), "d MMM yyyy")}
                          </p>
                        </div>
                        {user.subscription.trainer && (
                          <div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Dumbbell className="w-3 h-3" /> Trainer
                            </p>
                            <p className="font-medium mt-0.5">{user.subscription.trainer.name}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => {
                        setUserToDelete(user);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete User
                    </Button>
                  </div>
                </div>
              }
            />
          ))}
          
          {/* Infinite scroll sentinel */}
          {hasNextPage && (
            <div ref={loadMoreRef} className="p-4">
              {isFetchingNextPage && <InfiniteScrollSkeleton />}
            </div>
          )}
        </div>
      ) : (
        /* Desktop View */
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
              
              {/* Infinite scroll sentinel row */}
              {hasNextPage && (
                <TableRow ref={loadMoreRef}>
                  <TableCell colSpan={7} className="p-0">
                    {isFetchingNextPage && <InfiniteScrollSkeleton />}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

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
