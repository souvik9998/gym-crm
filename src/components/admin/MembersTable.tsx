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
import { Phone, Calendar, MoreVertical, User, Trash2, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EditMemberDialog } from "./EditMemberDialog";
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
}

interface MembersTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: MemberFilterValue;
}

export const MembersTable = ({ searchQuery, refreshKey, filterValue }: MembersTableProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

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

      // Get latest subscription for each member
      const membersWithSubs = await Promise.all(
        (membersData || []).map(async (member) => {
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("id, status, end_date, start_date")
            .eq("member_id", member.id)
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...member,
            subscription: subData || undefined,
          };
        })
      );

      setMembers(membersWithSubs as Member[]);
    } catch (error: any) {
      console.error("Error fetching members:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (memberId: string) => {
    if (!confirm("Are you sure you want to delete this member?")) return;

    try {
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", memberId);

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

  // Filter by search query
  const searchFiltered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
  );

  // Filter by member status and expiry date
  const filteredMembers = searchFiltered.filter((m) => {
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
    const isActive = diffDays > 0 && (subscription.status === "active" || (!isExpired && diffDays > 7));
    const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

    switch (filterValue) {
      case "active":
        // Active members: not expired and more than 7 days remaining
        return !isExpired && diffDays > 7;
      
      case "expired":
        // All expired members
        return isExpired || subscription.status === "expired";
      
      case "expired_recent":
        // Recently expired (within last 30 days)
        return isExpired && diffDays >= -30;
      
      case "expiring_soon":
        // All expiring soon (within 7 days)
        return isExpiringSoon;
      
      case "expiring_2days":
        // Expiring within 2 days
        return !isExpired && diffDays >= 0 && diffDays <= 2;
      
      case "expiring_7days":
        // Expiring within 7 days
        return !isExpired && diffDays >= 0 && diffDays <= 7;
      
      case "inactive":
        // Inactive: no subscription, paused, or expired
        return !subscription || subscription.status === "paused" || isExpired;
      
      default:
        return true;
    }
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

  if (filteredMembers.length === 0) {
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
              <TableHead className="font-semibold">Member</TableHead>
              <TableHead className="hidden sm:table-cell font-semibold">Phone</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="hidden md:table-cell font-semibold">Expires</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow key={member.id} className="hover:bg-muted/30">
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
                <TableCell>
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
                        onClick={() => handleDelete(member.id)}
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
    </div>
  );
};
