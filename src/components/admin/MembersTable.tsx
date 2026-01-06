import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Calendar, MoreVertical, User, Trash2, Pencil, Dumbbell, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EditMemberDialog } from "./EditMemberDialog";
import { MemberActivityDialog } from "./MemberActivityDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { MemberFilterValue } from "./MemberFilter";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
  subscription?: {
    id: string;
    status: string;
    end_date: string;
    start_date: string;
  };
  activePT?: {
    trainer_name: string;
    end_date: string;
  } | null;
}

interface MembersTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: MemberFilterValue;
  ptFilterActive?: boolean;
}

type SortField = "name" | "phone" | "status" | "trainer" | "expiry" | "join_date";
type SortOrder = "asc" | "desc";

export const MembersTable = ({ searchQuery, refreshKey, filterValue, ptFilterActive = false }: MembersTableProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [viewingMemberName, setViewingMemberName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; memberId: string; memberName: string }>({
    open: false,
    memberId: "",
    memberName: "",
  });
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    fetchMembers();
  }, [refreshKey]);

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: false });

      if (membersError) throw membersError;

      // Get latest subscription and PT for each member
      const membersWithData = await Promise.all(
        (membersData || []).map(async (member) => {
          // Get subscription
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("id, status, end_date, start_date")
            .eq("member_id", member.id)
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Get active PT subscription
          const today = new Date().toISOString().split("T")[0];
          const { data: ptData } = await supabase
            .from("pt_subscriptions")
            .select("end_date, personal_trainer:personal_trainers(name)")
            .eq("member_id", member.id)
            .eq("status", "active")
            .gte("end_date", today)
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...member,
            subscription: subData || undefined,
            activePT: ptData ? {
              trainer_name: (ptData.personal_trainer as any)?.name || "Unknown",
              end_date: ptData.end_date,
            } : null,
          };
        })
      );

      setMembers(membersWithData as Member[]);
    } catch (error: any) {
      console.error("Error fetching members:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", deleteConfirm.memberId);

      if (error) throw error;

      toast({ title: "Member deleted successfully" });
      fetchMembers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMemberClick = (member: Member) => {
    setViewingMemberId(member.id);
    setViewingMemberName(member.name);
  };

  // Filter by search query
  const searchFiltered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
  );

  // Filter by PT status if PT filter is active
  const filteredMembers = searchFiltered.filter((m) => {
    if (ptFilterActive) {
      // When PT filter is active, filter based on PT subscription status
      if (filterValue === "all") return !!m.activePT; // Show all members with PT
      
      if (!m.activePT) {
        // Member has no active PT
        return filterValue === "inactive";
      }

      // Member has active PT - check PT expiry status
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ptEndDate = new Date(m.activePT.end_date);
      ptEndDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((ptEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isPTExpired = diffDays < 0;
      const isPTExpiringSoon = !isPTExpired && diffDays >= 0 && diffDays <= 7;

      switch (filterValue) {
        case "active":
          return !isPTExpired && diffDays > 7;
        case "expiring_soon":
          return isPTExpiringSoon;
        case "expiring_2days":
          return !isPTExpired && diffDays >= 0 && diffDays <= 2;
        case "expiring_7days":
          return !isPTExpired && diffDays >= 0 && diffDays <= 7;
        case "expired":
        case "expired_recent":
          return isPTExpired;
        case "inactive":
          return false; // Has PT, so not inactive
        default:
          return true;
      }
    } else {
      // Normal filtering based on gym membership
      if (filterValue === "all") return true;

      const subscription = m.subscription;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Handle members without subscription
      if (!subscription || !subscription.end_date) {
        return filterValue === "inactive";
      }

      const endDate = new Date(subscription.end_date);
      endDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = diffDays < 0;
      const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

      switch (filterValue) {
        case "active":
          return !isExpired && diffDays > 7;
        case "expired":
          return isExpired || subscription.status === "expired";
        case "expired_recent":
          return isExpired && diffDays >= -30;
        case "expiring_soon":
          return isExpiringSoon;
        case "expiring_2days":
          return !isExpired && diffDays >= 0 && diffDays <= 2;
        case "expiring_7days":
          return !isExpired && diffDays >= 0 && diffDays <= 7;
        case "inactive":
          return !subscription || subscription.status === "paused" || isExpired;
        default:
          return true;
      }
    }
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground" />;
    }
    return sortOrder === "asc" 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-accent" />
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-accent" />;
  };

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "phone":
        comparison = a.phone.localeCompare(b.phone);
        break;
      case "status":
        const statusA = a.subscription?.status || "inactive";
        const statusB = b.subscription?.status || "inactive";
        comparison = statusA.localeCompare(statusB);
        break;
      case "trainer":
        const trainerA = a.activePT?.trainer_name || "";
        const trainerB = b.activePT?.trainer_name || "";
        comparison = trainerA.localeCompare(trainerB);
        break;
      case "expiry":
        const expiryA = a.subscription?.end_date ? new Date(a.subscription.end_date).getTime() : 0;
        const expiryB = b.subscription?.end_date ? new Date(b.subscription.end_date).getTime() : 0;
        comparison = expiryA - expiryB;
        break;
      case "join_date":
        const joinA = a.join_date ? new Date(a.join_date).getTime() : 0;
        const joinB = b.join_date ? new Date(b.join_date).getTime() : 0;
        comparison = joinA - joinB;
        break;
      default:
        return 0;
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });

  const getStatusBadge = (subscription?: { status: string; end_date: string }) => {
    if (!subscription) {
      return <Badge variant="outline" className="text-muted-foreground">No Subscription</Badge>;
    }

    switch (subscription.status) {
      case "active":
        return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
      case "expiring_soon":
        return <Badge className="bg-warning/10 text-warning border-warning/20">Expiring Soon</Badge>;
      case "expired":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Expired</Badge>;
      case "paused":
        return <Badge variant="outline" className="text-muted-foreground">Paused</Badge>;
      default:
        return <Badge variant="outline">{subscription.status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (sortedMembers.length === 0) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
        <p className="text-muted-foreground">
          {searchQuery ? "No members found matching your search" : "No members yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "name" && "bg-muted"
                  )}
                  onClick={() => handleSort("name")}
                >
                  <span className="flex items-center gap-1">
                    Member
                    {getSortIcon("name")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden sm:table-cell font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "phone" && "bg-muted"
                  )}
                  onClick={() => handleSort("phone")}
                >
                  <span className="flex items-center gap-1">
                    Phone
                    {getSortIcon("phone")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "status" && "bg-muted"
                  )}
                  onClick={() => handleSort("status")}
                >
                  <span className="flex items-center gap-1">
                    Status
                    {getSortIcon("status")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden lg:table-cell font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "trainer" && "bg-muted"
                  )}
                  onClick={() => handleSort("trainer")}
                >
                  <span className="flex items-center gap-1">
                    <Dumbbell className="w-4 h-4" />
                    Trainer
                    {getSortIcon("trainer")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden md:table-cell font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "expiry" && "bg-muted"
                  )}
                  onClick={() => handleSort("expiry")}
                >
                  <span className="flex items-center gap-1">
                    Expires
                    {getSortIcon("expiry")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.map((member) => (
              <TableRow 
                key={member.id} 
                className="hover:bg-muted/30 cursor-pointer"
                onClick={() => handleMemberClick(member)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {member.phone}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    +91 {member.phone}
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(member.subscription)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {member.activePT ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50">
                        <Dumbbell className="w-3 h-3 mr-1" />
                        <span className="font-medium bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                          {member.activePT.trainer_name}
                        </span>
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">No PT</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {member.subscription ? (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(member.subscription.end_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingMember(member)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Member
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteConfirm({ open: true, memberId: member.id, memberName: member.name })}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditMemberDialog
        open={!!editingMember}
        onOpenChange={(open) => !open && setEditingMember(null)}
        member={editingMember}
        onSuccess={fetchMembers}
      />

      <MemberActivityDialog
        open={!!viewingMemberId}
        onOpenChange={(open) => !open && setViewingMemberId(null)}
        memberId={viewingMemberId}
        memberName={viewingMemberName}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete Member"
        description={`Are you sure you want to delete "${deleteConfirm.memberName}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
