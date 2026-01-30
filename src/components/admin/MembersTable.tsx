import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
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
import { Phone, Calendar, MoreVertical, User, Trash2, Pencil, Dumbbell, ArrowUpDown, ArrowUp, ArrowDown, MessageCircle, Receipt, UserCheck, Clock, AlertTriangle, Download } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { EditMemberDialog } from "./EditMemberDialog";
import { MemberActivityDialog } from "./MemberActivityDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { MemberFilterValue } from "./MemberFilter";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { exportToExcel } from "@/utils/exportToExcel";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useBranch } from "@/contexts/BranchContext";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";
import { useInfiniteMembersQuery } from "@/hooks/queries";
import type { MemberWithSubscription } from "@/api/members";

// Use MemberWithSubscription from the API
type Member = MemberWithSubscription;

interface MembersTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: MemberFilterValue;
  ptFilterActive?: boolean;
  sortBy?: "name" | "join_date" | "end_date";
  sortOrder?: "asc" | "desc";
}

type SortField = "name" | "phone" | "status" | "trainer" | "expiry" | "end_date" | "join_date";
type SortOrder = "asc" | "desc";

export const MembersTable = ({ 
  searchQuery, 
  refreshKey, 
  filterValue, 
  ptFilterActive = false,
  sortBy: externalSortBy,
  sortOrder: externalSortOrder
}: MembersTableProps) => {
  const isMobile = useIsMobile();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const { invalidateMembers } = useInvalidateQueries();
  
  // Use infinite query for paginated data fetching
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteMembersQuery();

  // Flatten all pages into a single array
  const members = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.members);
  }, [data?.pages]);

  // Total count from the first page
  const totalCount = data?.pages[0]?.totalCount || 0;
  
  // Show loading when initially loading OR when fetching and no data yet (branch switch, initial load)
  // This prevents "No members" flash before data loads
  const showLoading = isLoading || (isFetching && !data) || data === undefined;

  // Intersection observer for infinite scroll - trigger prefetch 200px before bottom
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px 0px",
  });

  // Fetch next page when the sentinel comes into view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);
  
  const [editingMember, setEditingMember] = useState<MemberWithSubscription | null>(null);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [viewingMemberName, setViewingMemberName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; memberId: string; memberName: string }>({
    open: false,
    memberId: "",
    memberName: "",
  });
  
  // Check if user can manage members (admin or staff with can_manage_members permission)
  const canManageMembers = isAdmin || (isStaffLoggedIn && permissions?.can_manage_members === true);
  
  // Map external sortBy to internal sortField
  const mapSortByToField = (sortBy?: "name" | "join_date" | "end_date"): SortField => {
    if (!sortBy) return "name";
    if (sortBy === "end_date") return "expiry";
    return sortBy;
  };

  const [sortField, setSortField] = useState<SortField>(mapSortByToField(externalSortBy));
  const [sortOrder, setSortOrder] = useState<SortOrder>(externalSortOrder || "asc");
  
  // Update sort when external props change
  useEffect(() => {
    if (externalSortBy) {
      setSortField(mapSortByToField(externalSortBy));
    }
    if (externalSortOrder) {
      setSortOrder(externalSortOrder);
    }
  }, [externalSortBy, externalSortOrder]);
  
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Refetch when refreshKey changes (manual refresh button)
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const handleDeleteConfirm = async () => {
    try {
      // Get member data before deletion for logging
      const memberToDelete = members.find(m => m.id === deleteConfirm.memberId);
      
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", deleteConfirm.memberId);

      if (error) throw error;

      // Log activity - use staff logging if staff is logged in
      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members",
          type: "member_deleted",
          description: `Staff "${staffUser.fullName}" deleted member "${deleteConfirm.memberName}"`,
          entityType: "members",
          entityId: deleteConfirm.memberId,
          entityName: deleteConfirm.memberName,
          oldValue: memberToDelete ? {
            name: memberToDelete.name,
            phone: memberToDelete.phone,
            join_date: memberToDelete.join_date,
            subscription_status: memberToDelete.subscription?.status || "none",
          } : null,
          branchId: currentBranch?.id,
          staffId: staffUser.id,
          staffName: staffUser.fullName,
          staffPhone: staffUser.phone,
          metadata: { staff_role: staffUser.role },
        });
      } else {
        await logAdminActivity({
          category: "members",
          type: "member_deleted",
          description: `Deleted member "${deleteConfirm.memberName}"`,
          entityType: "members",
          entityId: deleteConfirm.memberId,
          entityName: deleteConfirm.memberName,
          oldValue: memberToDelete ? {
            name: memberToDelete.name,
            phone: memberToDelete.phone,
            join_date: memberToDelete.join_date,
            subscription_status: memberToDelete.subscription?.status || "none",
          } : null,
          branchId: currentBranch?.id,
        });
      }

      toast.success("Member deleted successfully");
      invalidateMembers(); // Invalidate cache to refetch
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
      });
    }
  };

  const handleMemberClick = (member: Member) => {
    setViewingMemberId(member.id);
    setViewingMemberName(member.name);
  };

  // Get saved template from localStorage for a specific type (branch-specific)
  const getSavedTemplate = (type: string): string | undefined => {
    const branchId = currentBranch?.id || "default";
    const templateKey = `whatsapp_${type}_template_${branchId}`;
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
            branchId: currentBranch?.id,
            branchName: currentBranch?.name,
          }),
        }
      );

      const data = await response.json();
      
      if (data.success && data.sent > 0) {
        // Log WhatsApp activity for staff
        if (isStaffLoggedIn && staffUser) {
          const activityType = type === "promotional" ? "whatsapp_promotional_sent" 
            : type === "expiry_reminder" ? "whatsapp_expiry_reminder_sent"
            : type === "expired_reminder" ? "whatsapp_expired_reminder_sent"
            : type === "payment_details" ? "whatsapp_payment_details_sent"
            : "whatsapp_message_sent";
          
          await logStaffActivity({
            category: "whatsapp",
            type: activityType as any,
            description: `Staff "${staffUser.fullName}" sent ${type.replace(/_/g, " ")} message to "${memberName}"`,
            entityType: "members",
            entityId: memberId,
            entityName: memberName,
            newValue: { message_type: type, recipient_phone: memberPhone },
            branchId: currentBranch?.id,
            staffId: staffUser.id,
            staffName: staffUser.fullName,
            staffPhone: staffUser.phone,
            metadata: { staff_role: staffUser.role },
          });
        }
        return true;
      } else {
        throw new Error(data.error || "Failed to send WhatsApp");
      }
    } catch (error: any) {
      toast.error("Failed to send WhatsApp", {
        description: error.message,
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
      toast.success(`Promotional message sent to ${member.name}`);
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
      toast.success(`Expiry reminder sent to ${member.name}`, {
        description: `Expires ${dayText}`,
      });
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
      toast.success(`Expired reminder sent to ${member.name}`, {
        description: `Expired ${diffDays} days ago`,
      });
    }
  };

  const handleSendPaymentDetails = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await sendWhatsAppMessage(member.id, member.name, member.phone, "payment_details");
    if (success) {
      toast.success(`Payment details sent to ${member.name}`);
    }
  };

  const isInactive = (member: Member): boolean => {
    return member.subscription?.status === "inactive";
  };

  const handleMoveToActive = async (member: Member, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!member.subscription?.id) {
        toast.error("No subscription found", {
          description: "Cannot activate member without a subscription",
        });
        return;
      }

      // Update subscription status to active
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "active" as any })
        .eq("id", member.subscription.id);
      
      if (error) throw error;
      
      // Invalidate cache to refetch with updated data
      invalidateMembers();

      // Log activity for staff
      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members",
          type: "member_moved_to_active",
          description: `Staff "${staffUser.fullName}" moved "${member.name}" to active status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: "active" },
          branchId: currentBranch?.id,
          staffId: staffUser.id,
          staffName: staffUser.fullName,
          staffPhone: staffUser.phone,
          metadata: { staff_role: staffUser.role },
        });
      } else {
        await logAdminActivity({
          category: "members",
          type: "member_status_changed",
          description: `Moved "${member.name}" to active status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: "active" },
          branchId: currentBranch?.id,
        });
      }
      
      toast.success(`${member.name} moved to active`);
    } catch (error: any) {
      toast.error("Error moving to active", {
        description: error.message,
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
      // Invalidate cache to refetch with updated data
      invalidateMembers();
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
            branchId: currentBranch?.id,
            branchName: currentBranch?.name,
          }),
        }
      );

      const data = await response.json();
      
      if (data.success) {
        const typeLabel = type === "promotional" ? "Promotional messages" : 
                          type === "expiry_reminder" ? "Expiry reminders" : 
                          type === "expired_reminder" ? "Expired reminders" : "Messages";
        toast.success(`${typeLabel} sent to ${data.sent} members`, {
          description: data.failed > 0 ? `${data.failed} failed` : undefined,
        });

        // Log bulk WhatsApp activity for staff
        if (isStaffLoggedIn && staffUser && data.sent > 0) {
          await logStaffActivity({
            category: "whatsapp",
            type: "whatsapp_bulk_message_sent",
            description: `Staff "${staffUser.fullName}" sent bulk ${type.replace(/_/g, " ")} to ${data.sent} members`,
            entityType: "members",
            newValue: { 
              message_type: type, 
              recipients_count: data.sent,
              failed_count: data.failed || 0,
            },
            branchId: currentBranch?.id,
            staffId: staffUser.id,
            staffName: staffUser.fullName,
            staffPhone: staffUser.phone,
            metadata: { staff_role: staffUser.role },
          });
        }

        setSelectedMembers(new Set());
      } else {
        throw new Error(data.error || "Failed to send WhatsApp");
      }
    } catch (error: any) {
      toast.error("Failed to send bulk WhatsApp", {
        description: error.message,
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
        case "expiring_today":
          return !isPTExpired && diffDays === 0;
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
        case "expiring_today":
          return !isExpired && diffDays === 0;
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
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
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
      case "end_date":
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

  const getStatusCircle = (subscription?: { status: string; end_date: string }) => {
    if (!subscription) {
      return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div>;
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
      return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div>;
    }

    // Use actual calculated status for display
    if (isActuallyExpired) {
      return <div className="w-2.5 h-2.5 rounded-full bg-red-500 dark:bg-red-400"></div>;
    }
    
    if (isActuallyExpiringSoon) {
      return <div className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400"></div>;
    }

    switch (subscription.status) {
      case "active":
        return <div className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-400"></div>;
      case "paused":
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div>;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div>;
    }
  };

  const getStatusBadge = (subscription?: { status: string; end_date: string }) => {
    const badgeBaseClass = "text-[9px] md:text-xs px-1.5 md:px-2 py-0.5 md:py-1";
    
    if (!subscription) {
      return <Badge variant="outline" className={`text-muted-foreground ${badgeBaseClass}`}>No Subscription</Badge>;
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
      return <Badge variant="outline" className={`bg-muted text-muted-foreground ${badgeBaseClass}`}>Inactive</Badge>;
    }

    // Use actual calculated status for display
    if (isActuallyExpired) {
      return <Badge className={`bg-destructive/10 text-destructive border-destructive/20 ${badgeBaseClass}`}>Expired</Badge>;
    }
    
    if (isActuallyExpiringSoon) {
      return <Badge className={`bg-warning/10 text-warning border-warning/20 ${badgeBaseClass}`}>Expiring Soon</Badge>;
    }

    switch (subscription.status) {
      case "active":
        return <Badge className={`bg-success/10 text-success border-success/20 hover:bg-green-200 dark:hover:bg-green-800/50 hover:text-green-900 dark:hover:text-green-100 hover:border-green-400 dark:hover:border-green-600 transition-all duration-150 cursor-default ${badgeBaseClass}`}>Active</Badge>;
      case "paused":
        return <Badge variant="outline" className={`text-muted-foreground ${badgeBaseClass}`}>Paused</Badge>;
      default:
        return <Badge variant="outline" className={badgeBaseClass}>{subscription.status}</Badge>;
    }
  };

  const getStatusText = (subscription?: { status: string; end_date: string }) => {
    if (!subscription) {
      return "No Subscription";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isActuallyExpired = diffDays < 0;
    const isActuallyExpiringSoon = !isActuallyExpired && diffDays >= 0 && diffDays <= 7;

    if (subscription.status === "inactive") {
      return "Inactive";
    }

    if (isActuallyExpired) {
      return "Expired";
    }
    
    if (isActuallyExpiringSoon) {
      return "Expiring Soon";
    }

    return subscription.status === "active" ? "Active" : subscription.status || "Unknown";
  };

  const handleExport = () => {
    try {
      const exportData = sortedMembers.map((member) => ({
        Name: member.name,
        Phone: `+91 ${member.phone}`,
        "Join Date": member.join_date ? new Date(member.join_date).toLocaleDateString("en-IN") : "-",
        Status: getStatusText(member.subscription),
        "Subscription Start Date": member.subscription?.start_date ? new Date(member.subscription.start_date).toLocaleDateString("en-IN") : "-",
        "Subscription End Date": member.subscription?.end_date ? new Date(member.subscription.end_date).toLocaleDateString("en-IN") : "-",
        "Personal Trainer": member.activePT?.trainer_name || "-",
        "PT End Date": member.activePT?.end_date ? new Date(member.activePT.end_date).toLocaleDateString("en-IN") : "-",
      }));

      exportToExcel(exportData, "members");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} member(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export members",
      });
    }
  };

  // Show skeleton while loading - this must come first to prevent "No data" flash
  if (showLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  // Only show empty state when we have confirmed data is empty (not loading, not fetching, data exists but is empty)
  const isDataConfirmedEmpty = !isLoading && !isFetching && data !== undefined && sortedMembers.length === 0;
  
  if (isDataConfirmedEmpty) {
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
      
      {/* Member count and export - Hidden on all screens */}
      <div className="hidden">
        <span>
          Showing {sortedMembers.length} of {totalCount} members
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Mobile Table Layout - matches desktop table style */}
      {isMobile ? (
        <div className="rounded-lg border overflow-hidden bg-card">
          {/* Table Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <button 
              className="flex items-center gap-1 text-xs font-medium text-foreground"
              onClick={() => handleSort("name")}
            >
              Member
              {sortField === "name" && (
                sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <button
                className="p-1.5"
                onClick={() => handleSort("expiry")}
              >
                {sortField === "expiry" && sortOrder === "desc" ? (
                  <ArrowDown className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
              <button
                className="p-1.5"
                onClick={() => setSelectedMembers(new Set())}
              >
                <span className="sr-only">Clear</span>
              </button>
            </div>
          </div>
          
          {/* Table Rows */}
          <div className="divide-y">
            {sortedMembers.map((member) => (
              <div 
                key={member.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50",
                  selectedMembers.has(member.id) && "bg-primary/5"
                )}
                onClick={() => handleMemberClick(member)}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-muted-foreground">
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                
                {/* Member Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground">+91 {member.phone}</p>
                </div>
                
                {/* Status Dot */}
                <div className="flex-shrink-0">
                  {getStatusCircle(member.subscription)}
                </div>
                
                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canManageMembers && (
                      <>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMember(member);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ open: true, memberId: member.id, memberName: member.name });
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                        {isInactive(member) && (
                          <DropdownMenuItem onClick={(e) => handleMoveToActive(member, e)}>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Move to Active
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleSendPromotional(member, e)}
                          disabled={sendingWhatsApp === member.id}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {sendingWhatsApp === member.id ? "Sending..." : "Send Promotional"}
                        </DropdownMenuItem>
                        {isExpiringOrExpired(member) && (
                          isExpired(member) ? (
                            <DropdownMenuItem
                              onClick={(e) => handleSendExpiredReminder(member, e)}
                              disabled={sendingWhatsApp === member.id}
                            >
                              <AlertTriangle className="w-4 h-4 mr-2" />
                              {sendingWhatsApp === member.id ? "Sending..." : "Send Expired Reminder"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => handleSendExpiryReminder(member, e)}
                              disabled={sendingWhatsApp === member.id}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              {sendingWhatsApp === member.id ? "Sending..." : "Send Expiry Reminder"}
                            </DropdownMenuItem>
                          )
                        )}
                        <DropdownMenuItem
                          onClick={(e) => handleSendPaymentDetails(member, e)}
                          disabled={sendingWhatsApp === member.id}
                        >
                          <Receipt className="w-4 h-4 mr-2" />
                          Send Payment Details
                        </DropdownMenuItem>
                      </>
                    )}
                    {!canManageMembers && (
                      <DropdownMenuItem disabled>
                        <span className="text-muted-foreground text-sm">View only - No edit permissions</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
          
          {/* Infinite scroll loading */}
          {isFetchingNextPage && (
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-muted rounded w-28" />
                    <div className="h-3 bg-muted rounded w-24" />
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          )}
          
          {/* Sentinel for infinite scroll */}
          {hasNextPage && !isFetchingNextPage && (
            <div ref={loadMoreRef} className="h-1" />
          )}
        </div>
      ) : (
        /* Desktop Table Layout */
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
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
                  <TableHead className="font-semibold">
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
                  <TableHead className="font-semibold">
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
                  <TableHead className="font-semibold">
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
                      "transition-colors duration-150 ease-in-out hover:bg-muted/50 cursor-pointer",
                      selectedMembers.has(member.id) && "bg-primary/5"
                    )}
                    onClick={() => handleMemberClick(member)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedMembers.has(member.id)}
                        onCheckedChange={() => {}}
                        onClick={(e) => toggleMemberSelection(member.id, e)}
                        aria-label={`Select ${member.name}`}
                      />
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{member.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        +91 {member.phone}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {getStatusBadge(member.subscription)}
                    </TableCell>
                    
                    <TableCell className="text-sm">
                      {member.activePT ? (
                        <Badge className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50">
                          <Dumbbell className="w-3 h-3 mr-1" />
                          {member.activePT.trainer_name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">No PT</span>
                      )}
                    </TableCell>
                    
                    <TableCell className="text-sm">
                      {member.subscription ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
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
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {canManageMembers && (
                            <>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMember(member);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm({ open: true, memberId: member.id, memberName: member.name });
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                              {isInactive(member) && (
                                <DropdownMenuItem onClick={(e) => handleMoveToActive(member, e)}>
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  Move to Active
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => handleSendPromotional(member, e)}
                                disabled={sendingWhatsApp === member.id}
                              >
                                <MessageCircle className="w-4 h-4 mr-2" />
                                {sendingWhatsApp === member.id ? "Sending..." : "Send Promotional"}
                              </DropdownMenuItem>
                              {isExpiringOrExpired(member) && (
                                isExpired(member) ? (
                                  <DropdownMenuItem
                                    onClick={(e) => handleSendExpiredReminder(member, e)}
                                    disabled={sendingWhatsApp === member.id}
                                  >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    {sendingWhatsApp === member.id ? "Sending..." : "Send Expired Reminder"}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={(e) => handleSendExpiryReminder(member, e)}
                                    disabled={sendingWhatsApp === member.id}
                                  >
                                    <Clock className="w-4 h-4 mr-2" />
                                    {sendingWhatsApp === member.id ? "Sending..." : "Send Expiry Reminder"}
                                  </DropdownMenuItem>
                                )
                              )}
                              <DropdownMenuItem
                                onClick={(e) => handleSendPaymentDetails(member, e)}
                                disabled={sendingWhatsApp === member.id}
                              >
                                <Receipt className="w-4 h-4 mr-2" />
                                Send Payment Details
                              </DropdownMenuItem>
                            </>
                          )}
                          {!canManageMembers && (
                            <DropdownMenuItem disabled>
                              <span className="text-muted-foreground text-sm">View only - No edit permissions</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Infinite scroll skeleton loader */}
                {isFetchingNextPage && <InfiniteScrollSkeleton rows={3} />}
                
                {/* Sentinel element for intersection observer */}
                {hasNextPage && !isFetchingNextPage && (
                  <TableRow ref={loadMoreRef}>
                    <TableCell colSpan={7} className="h-1 p-0" />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Show loading indicator at bottom when fetching more */}
      {hasNextPage && (
        <div className="text-center text-xs text-muted-foreground py-2">
          {isFetchingNextPage ? "Loading more..." : "Scroll for more"}
        </div>
      )}

      <EditMemberDialog
        open={!!editingMember}
        onOpenChange={(open) => !open && setEditingMember(null)}
        member={editingMember}
        onSuccess={invalidateMembers}
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
