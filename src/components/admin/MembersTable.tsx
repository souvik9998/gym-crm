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
  
  // Show loading when initially loading OR when data hasn't been fetched yet
  const showLoading = isLoading && !data;

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

  if (showLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  if (sortedMembers.length === 0 && !isFetching) {
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
      
      {/* Member count and export */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
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

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-hidden md:overflow-x-auto -mx-2 md:-mx-4 sm:mx-0 px-2 md:px-4 sm:px-0">
          <Table className="w-full md:min-w-[600px] table-fixed md:table-auto">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10 hidden md:table-cell">
                <Checkbox
                  checked={selectedMembers.size === sortedMembers.length && sortedMembers.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="font-semibold text-[10px] md:text-sm py-1.5 md:py-3 w-auto md:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-5 md:h-8 px-0.5 md:px-2 -ml-0.5 md:-ml-2 hover:bg-muted/50",
                    sortField === "name" && "bg-muted"
                  )}
                  onClick={() => handleSort("name")}
                >
                  <span className="flex items-center gap-0.5 md:gap-1 text-[10px] md:text-sm">
                    Member
                    {getSortIcon("name")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden sm:table-cell font-semibold text-xs md:text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "phone" && "bg-muted"
                  )}
                  onClick={() => handleSort("phone")}
                >
                  <span className="flex items-center gap-1 text-xs md:text-sm">
                    Phone
                    {getSortIcon("phone")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="font-semibold text-[10px] md:text-sm py-1.5 md:py-3 md:table-cell w-6">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-5 md:h-8 px-0 md:px-2 -ml-0 md:-ml-2 hover:bg-muted/50",
                    sortField === "status" && "bg-muted"
                  )}
                  onClick={() => handleSort("status")}
                >
                  <span className="hidden md:flex items-center gap-0.5 md:gap-1 text-[10px] md:text-sm">
                    Status
                    {getSortIcon("status")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs md:text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "trainer" && "bg-muted"
                  )}
                  onClick={() => handleSort("trainer")}
                >
                  <span className="flex items-center gap-1 text-xs md:text-sm">
                    <Dumbbell className="w-4 h-4" />
                    Trainer
                    {getSortIcon("trainer")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs md:text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-2 -ml-2 hover:bg-muted/50",
                    sortField === "expiry" && "bg-muted"
                  )}
                  onClick={() => handleSort("expiry")}
                >
                  <span className="flex items-center gap-1 text-xs md:text-sm">
                    Expires
                    {getSortIcon("expiry")}
                  </span>
                </Button>
              </TableHead>
              <TableHead className="w-10 md:w-auto"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.map((member) => (
              <React.Fragment key={member.id}>
              <TableRow 
                className={cn(
                  "transition-colors duration-150 ease-in-out hover:bg-muted/50",
                  selectedMembers.has(member.id) && "bg-primary/5",
                  expandedMemberId === member.id && "bg-muted/30"
                )}
                onClick={() => handleMemberClick(member)}
              >
                {/* Checkbox - hidden on mobile */}
                <TableCell className="hidden md:table-cell py-2 md:py-3">
                  <Checkbox
                    checked={selectedMembers.has(member.id)}
                    onCheckedChange={() => {}}
                    onClick={(e) => toggleMemberSelection(member.id, e)}
                    aria-label={`Select ${member.name}`}
                  />
                </TableCell>
                
                {/* Member info with avatar */}
                <TableCell className="py-2 md:py-3 pl-2 md:pl-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs md:text-sm font-semibold text-primary">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-xs md:text-sm truncate max-w-[100px] md:max-w-none">
                          {member.name}
                        </p>
                        {/* Status circle on mobile - show on desktop too for visual consistency */}
                        <div className="md:hidden">
                          {getStatusCircle(member.subscription)}
                        </div>
                      </div>
                      <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5 md:w-3 md:h-3 hidden sm:inline" />
                        +91 {member.phone}
                      </p>
                    </div>
                  </div>
                </TableCell>
                
                {/* Phone - hidden on mobile */}
                <TableCell className="hidden sm:table-cell text-xs md:text-sm">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    +91 {member.phone}
                  </div>
                </TableCell>
                
                {/* Status - show circle on mobile, badge on desktop */}
                <TableCell className="py-2 md:py-3 w-6 md:w-auto">
                  <div className="hidden md:block">
                    {getStatusBadge(member.subscription)}
                  </div>
                  <div className="md:hidden">
                    {getStatusCircle(member.subscription)}
                  </div>
                </TableCell>
                
                {/* Trainer - hidden on small screens */}
                <TableCell className="hidden lg:table-cell text-xs md:text-sm">
                  {member.activePT ? (
                    <Badge className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50">
                      <Dumbbell className="w-3 h-3 mr-1" />
                      {member.activePT.trainer_name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">No PT</span>
                  )}
                </TableCell>
                
                {/* Expiry date - hidden on mobile */}
                <TableCell className="hidden md:table-cell text-xs md:text-sm">
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
                
                {/* Actions */}
                <TableCell className="py-1 md:py-3 pr-1 md:pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 md:h-8 md:w-8 p-0">
                        <MoreVertical className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 md:w-48">
                      {canManageMembers && (
                        <>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMember(member);
                            }}
                            className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                          >
                            <Pencil className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ open: true, memberId: member.id, memberName: member.name });
                            }}
                            className="text-destructive text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                          >
                            <Trash2 className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                            Delete
                          </DropdownMenuItem>
                          {isInactive(member) && (
                            <DropdownMenuItem 
                              onClick={(e) => handleMoveToActive(member, e)}
                              className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                            >
                              <UserCheck className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                              Move to Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => handleSendPromotional(member, e)}
                            disabled={sendingWhatsApp === member.id}
                            className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                          >
                            <MessageCircle className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                            {sendingWhatsApp === member.id ? "Sending..." : "Send Promotional"}
                          </DropdownMenuItem>
                          {isExpiringOrExpired(member) && (
                            isExpired(member) ? (
                              <DropdownMenuItem
                                onClick={(e) => handleSendExpiredReminder(member, e)}
                                disabled={sendingWhatsApp === member.id}
                                className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                              >
                                <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                                {sendingWhatsApp === member.id ? "Sending..." : "Send Expired Reminder"}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={(e) => handleSendExpiryReminder(member, e)}
                                disabled={sendingWhatsApp === member.id}
                                className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                              >
                                <Clock className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                                {sendingWhatsApp === member.id ? "Sending..." : "Send Expiry Reminder"}
                              </DropdownMenuItem>
                            )
                          )}
                          <DropdownMenuItem
                            onClick={(e) => handleSendPaymentDetails(member, e)}
                            disabled={sendingWhatsApp === member.id}
                            className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2"
                          >
                            <Receipt className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                            Send Payment Details
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      {/* If user only has view access, show message */}
                      {!canManageMembers && (
                        <DropdownMenuItem disabled className="text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-2">
                          <span className="text-muted-foreground text-[10px] md:text-sm">View only - No edit permissions</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
              {/* Mobile: Expanded details row */}
              {expandedMemberId === member.id && (
                <TableRow className="md:hidden">
                  <TableCell colSpan={5} className="py-2 px-3 bg-muted/20">
                    <div className="space-y-1.5">
                      {/* Phone */}
                      <div className="flex items-center gap-2 text-[10px]">
                        <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Phone:</span>
                        <span>+91 {member.phone}</span>
                      </div>
                      {/* Trainer */}
                      {member.activePT ? (
                        <div className="flex items-center gap-2 text-[10px]">
                          <Dumbbell className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Trainer:</span>
                          <Badge className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-700/50 text-[9px] px-1.5 py-0.5">
                            {member.activePT.trainer_name}
                          </Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px]">
                          <Dumbbell className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Trainer:</span>
                          <span className="text-muted-foreground">No PT</span>
                        </div>
                      )}
                      {/* Expiry Date */}
                      {member.subscription ? (
                        <div className="flex items-center gap-2 text-[10px]">
                          <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Expires:</span>
                          <span>{new Date(member.subscription.end_date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px]">
                          <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">Expires:</span>
                          <span className="text-muted-foreground">-</span>
                        </div>
                      )}
                      {/* Status Badge (mobile expanded view) */}
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground">Status:</span>
                        {getStatusBadge(member.subscription)}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </React.Fragment>
            ))}
            
            {/* Infinite scroll skeleton loader - shown when fetching next page */}
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
