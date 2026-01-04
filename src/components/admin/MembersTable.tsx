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
import { Phone, Calendar, MoreVertical, User, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
  subscription?: {
    status: string;
    end_date: string;
  };
}

interface MembersTableProps {
  searchQuery: string;
  refreshKey: number;
}

export const MembersTable = ({ searchQuery, refreshKey }: MembersTableProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
            .select("status, end_date")
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

      setMembers(membersWithSubs);
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

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
  );

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
    <div className="overflow-x-auto -mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="hidden sm:table-cell">Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Expires</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredMembers.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
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
  );
};
