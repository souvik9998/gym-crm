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
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Calendar, MoreVertical, User, Trash2, Pencil, Dumbbell, ArrowUpDown, ArrowUp, ArrowDown, MessageCircle, Receipt, UserCheck, Clock, AlertTriangle } from "lucide-react";
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
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  // Removed sendingBulkWhatsApp - now using bulkActionType

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

  // Get saved template from localStorage for a specific type
  const getSavedTemplate = (type: string): string | undefined => {
    const templateKey = `whatsapp_${type}_template`;
    const savedTemplate = localStorage.getItem(templateKey);
    return savedTemplate || undefined;
  };

  const sendWhatsAppMessage = async (
    memberId: string, 
    memberName: string, 
    memberPhone: string,
    type: string,
    customMessage?: string
  ) => {
    setSendingWhatsApp(memberId);
    
    try {
      // Get saved template for the message type if no custom message provided
      let messageToSend = customMessage;
      if (!messageToSend) {
        messageToSend = getSavedTemplate(type);
      }

      // Get current admin user
      const { data: { session } } = await supabase.auth.getSession();
      const adminUserId = session?.user?.id || null;
      const accessToken = session?.access_token || null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
          body: JSON.stringify({
            memberIds: [memberId],
            type: messageToSend ? "custom" : type,
            customMessage: messageToSend,
            isManual: true,
            adminUserId: adminUserId,
          }),
        }
      );

      const data = await response.json();
      
      if (data.success && data.sent > 0) {
        return true;
      } else {
        throw new Error(data.error || "Failed to send WhatsApp");
      }
    } catch (error: any) {
      toast({
        title: "Failed to send WhatsApp",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const handleSendPromotional = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await sendWhatsAppMessage(member.id, member.name, member.phone, "promotional");
    if (success) {
      toast({ title: `Promotional message sent to ${member.name}` });
    }
  };

  const handleSendExpiryReminder = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.subscription) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(member.subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    const success = await sendWhatsAppMessage(member.id, member.name, member.phone, "expiry_reminder");
    if (success) {
      const dayText = diffDays === 0 ? "today" : diffDays < 0 ? `${Math.abs(diffDays)} days ago` : `in ${diffDays} days`;
      toast({ title: `Expiry reminder sent to ${member.name}`, description: `Expires ${dayText}` });
    }
  };

  const handleSendExpiredReminder = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.subscription) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(member.subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.abs(Math.ceil((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    const success = await sendWhatsAppMessage(member.id, member.name, member.phone, "expired_reminder");
    if (success) {
      toast({ title: `Expired reminder sent to ${member.name}`, description: `Expired ${diffDays} days ago` });
    }
  };

  const handleSendPaymentDetails = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await sendWhatsAppMessage(member.id, member.name, member.phone, "payment_details");
    if (success) {
      toast({ title: `Payment details sent to ${member.name}` });
    }
  };

  const isInactive = (member: Member): boolean => {
    return member.subscription?.status === "inactive";
  };

  const handleMoveToActive = async (member: Member, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!member.subscription?.id) {
        toast({
          title: "No subscription found",
          description: "Cannot activate member without a subscription",
          variant: "destructive",
        });
        return;
      }

      // Update subscription status to active
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "active" as any })
        .eq("id", member.subscription.id);
      
      if (error) throw error;
      
      // Update local state immediately (in-place update)
      setMembers(prev => prev.map(m => 
        m.id === member.id 
          ? { 
              ...m, 
              subscription: { 
                ...m.subscription!,
                status: "active", 
              } 
            } 
          : m
      ));
      
      toast({ title: `${member.name} moved to active` });
    } catch (error: any) {
      toast({
        title: "Error moving to active",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Auto-mark members expired > 30 days as inactive
  const autoMarkLongExpiredAsInactive = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const longExpiredMembers = members.filter(m => {
      if (!m.subscription?.end_date) return false;
      if (m.subscription.status === "inactive") return false;
      
      const endDate = new Date(m.subscription.end_date);
      endDate.setHours(0, 0, 0, 0);
      return endDate < thirtyDaysAgo;
    });

    if (longExpiredMembers.length === 0) return;

    // Update all long-expired subscriptions to inactive in database
    const subscriptionIds = longExpiredMembers.map(m => m.subscription!.id);
    
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "inactive" })
      .in("id", subscriptionIds);
    
    if (!error) {
      // Update local state
      setMembers(prev => prev.map(m => {
        if (subscriptionIds.includes(m.subscription?.id || "")) {
          return {
            ...m,
            subscription: { ...m.subscription!, status: "inactive" }
          };
        }
        return m;
      }));
    }
  };

  useEffect(() => {
    if (members.length > 0) {
      autoMarkLongExpiredAsInactive();
    }
  }, [members.length]);

  const isExpiringSoon = (member: Member): boolean => {
    if (!member.subscription) return false;
    const status = member.subscription.status;
    return status === "expiring_soon";
  };

  const isExpired = (member: Member): boolean => {
    if (!member.subscription) return false;
    // Check actual date, not just status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(member.subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    return endDate < today || member.subscription.status === "expired";
  };

  const isExpiringOrExpired = (member: Member): boolean => {
    return isExpiringSoon(member) || isExpired(member);
  };

  const [bulkActionType, setBulkActionType] = useState<string | null>(null);

  const getSelectedMembersData = () => {
    return sortedMembers.filter(m => selectedMembers.has(m.id));
  };

  const hasExpiringOrExpiredSelected = () => {
    return getSelectedMembersData().some(m => isExpiringOrExpired(m));
  };

  const handleBulkWhatsApp = async (type: string) => {
    if (selectedMembers.size === 0) return;
    
    setBulkActionType(type);
    try {
      // Get saved template for the message type
      const savedTemplate = getSavedTemplate(type);

      // Get current admin user
      const { data: { session } } = await supabase.auth.getSession();
      const adminUserId = session?.user?.id || null;
      const accessToken = session?.access_token || null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
          body: JSON.stringify({
            memberIds: Array.from(selectedMembers),
            type: savedTemplate ? "custom" : type,
            customMessage: savedTemplate,
            isManual: true,
            adminUserId: adminUserId,
          }),
        }
      );

      const data = await response.json();
      
      if (data.success) {
        const typeLabel = type === "promotional" ? "Promotional messages" : 
                          type === "expiry_reminder" ? "Expiry reminders" : 
                          type === "expired_reminder" ? "Expired reminders" : "Messages";
        toast({ 
          title: `${typeLabel} sent to ${data.sent} members`,
          description: data.failed > 0 ? `${data.failed} failed` : undefined,
        });
        setSelectedMembers(new Set());
      } else {
        throw new Error(data.error || "Failed to send WhatsApp");
      }
    } catch (error: any) {
      toast({
        title: "Failed to send bulk WhatsApp",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBulkActionType(null);
    }
  };

  const toggleMemberSelection = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMembers.size === sortedMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(sortedMembers.map(m => m.id)));
    }
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

      // Handle inactive filter - only show explicitly inactive members
      if (filterValue === "inactive") {
        return subscription?.status === "inactive";
      }

      // Handle members without subscription - exclude from other filters
      if (!subscription || !subscription.end_date) {
        return false;
      }

      const endDate = new Date(subscription.end_date);
      endDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = diffDays < 0;
      const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

      // Skip inactive members from other filters
      if (subscription.status === "inactive") {
        return false;
      }

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

    // Calculate actual status based on end_date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isActuallyExpired = diffDays < 0;
    const isActuallyExpiringSoon = !isActuallyExpired && diffDays >= 0 && diffDays <= 7;

    // If status is inactive, show inactive
    if (subscription.status === "inactive") {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>;
    }

    // Use actual calculated status for display
    if (isActuallyExpired) {
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Expired</Badge>;
    }
    
    if (isActuallyExpiringSoon) {
      return <Badge className="bg-warning/10 text-warning border-warning/20">Expiring Soon</Badge>;
    }

    switch (subscription.status) {
      case "active":
        return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
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
    <div className="w-full space-y-3">
      {/* Bulk action bar */}
      {selectedMembers.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">
            {selectedMembers.size} member{selectedMembers.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMembers(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkWhatsApp("promotional")}
              disabled={bulkActionType !== null}
              className="gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              {bulkActionType === "promotional" ? "Sending..." : "Send Promotional"}
            </Button>
            {hasExpiringOrExpiredSelected() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkWhatsApp("expiry_reminder")}
                disabled={bulkActionType !== null}
                className="gap-2"
              >
                <Clock className="w-4 h-4" />
                {bulkActionType === "expiry_reminder" ? "Sending..." : "Send Expiry Reminder"}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedMembers.size === sortedMembers.length && sortedMembers.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
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
                className={cn(
                  "hover:bg-muted/30 cursor-pointer",
                  selectedMembers.has(member.id) && "bg-primary/5"
                )}
                onClick={() => handleMemberClick(member)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedMembers.has(member.id)}
                    onCheckedChange={() => {
                      setSelectedMembers(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(member.id)) {
                          newSet.delete(member.id);
                        } else {
                          newSet.add(member.id);
                        }
                        return newSet;
                      });
                    }}
                    aria-label={`Select ${member.name}`}
                  />
                </TableCell>
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
                      {/* Update User */}
                      <DropdownMenuItem onClick={() => setEditingMember(member)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Update User
                      </DropdownMenuItem>
                      
                      {/* Send Promotional Message */}
                      <DropdownMenuItem 
                        onClick={(e) => handleSendPromotional(member, e)}
                        disabled={sendingWhatsApp === member.id}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {sendingWhatsApp === member.id ? "Sending..." : "Send Promotional Message"}
                      </DropdownMenuItem>
                      
                      {/* Send Subscription Expiry Reminder - Only for Expiring Soon */}
                      {isExpiringSoon(member) && (
                        <DropdownMenuItem 
                          onClick={(e) => handleSendExpiryReminder(member, e)}
                          disabled={sendingWhatsApp === member.id}
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          Send Expiry Reminder
                        </DropdownMenuItem>
                      )}
                      
                      {/* Send Expired Reminder - Only for Expired members */}
                      {isExpired(member) && !isInactive(member) && (
                        <DropdownMenuItem 
                          onClick={(e) => handleSendExpiredReminder(member, e)}
                          disabled={sendingWhatsApp === member.id}
                        >
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Send Expired Reminder
                        </DropdownMenuItem>
                      )}
                      
                      {/* Send Payment Details/Bill */}
                      <DropdownMenuItem 
                        onClick={(e) => handleSendPaymentDetails(member, e)}
                        disabled={sendingWhatsApp === member.id}
                      >
                        <Receipt className="w-4 h-4 mr-2" />
                        Send Payment Details
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
