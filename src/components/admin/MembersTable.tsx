import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
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
import { Phone, Calendar, MoreVertical, User, Pencil, Dumbbell, ArrowUpDown, ArrowUp, ArrowDown, MessageCircle, Receipt, UserCheck, UserX, Clock, AlertTriangle, Download, Fingerprint } from "lucide-react";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
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
import { cn } from "@/lib/utils";
import { fuzzySearch } from "@/lib/fuzzySearch";
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
import { WhatsAppSendingOverlay } from "@/components/ui/whatsapp-sending-overlay";
import { useWhatsAppOverlay } from "@/hooks/useWhatsAppOverlay";
import { BiometricEnrollDialog } from "./BiometricEnrollDialog";
import { checkMemberBiometricStatus, fetchBiometricDevices } from "@/api/biometric";
import { useAuth } from "@/contexts/AuthContext";

// Use MemberWithSubscription from the API
type Member = MemberWithSubscription;

interface MembersTableProps {
  searchQuery: string;
  refreshKey: number;
  filterValue: MemberFilterValue;
  ptFilterActive?: boolean;
  trainerFilter?: string | null;
  timeSlotFilter?: string | null;
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
  trainerFilter = null,
  timeSlotFilter = null,
  sortBy: externalSortBy,
  sortOrder: externalSortOrder
}: MembersTableProps) => {
  const isMobile = useIsMobile();
  const isCompact = useIsTabletOrBelow();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const { isModuleEnabled } = useAuth();
  const { invalidateMembers } = useInvalidateQueries();

  const biometricEnabled = isModuleEnabled("attendance_biometric");

  // Check if biometric devices exist for this branch (only when feature is enabled)
  const { data: biometricDevicesData } = useQuery({
    queryKey: ["biometric-devices", currentBranch?.id],
    queryFn: () => fetchBiometricDevices(currentBranch?.id),
    enabled: !!currentBranch?.id && biometricEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const hasBiometricDevices = (biometricDevicesData?.length ?? 0) > 0;
  const canEnrollBiometric = biometricEnabled && hasBiometricDevices;
  
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
  
  // Check if user can manage members (admin or staff with can_manage_members permission)
  const canManageMembers = isAdmin || (isStaffLoggedIn && permissions?.can_manage_members === true);
  // Check if user can send WhatsApp (admin or staff with can_send_whatsapp permission)
  const canSendWhatsApp = isAdmin || (isStaffLoggedIn && (permissions as any)?.can_send_whatsapp === true);
  
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
  const [enrollMember, setEnrollMember] = useState<Member | null>(null);

  // Check which members have biometric enrollment
  const memberIds = useMemo(() => members.map(m => m.id), [members]);
  const { data: enrolledMemberIds = new Set<string>() } = useQuery({
    queryKey: ["biometric-enrolled", currentBranch?.id, memberIds.join(",")],
    queryFn: () => checkMemberBiometricStatus(memberIds, currentBranch?.id || ""),
    enabled: !!currentBranch?.id && memberIds.length > 0,
    staleTime: 60000,
  });

  // Refetch when refreshKey changes (manual refresh button)
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

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

  const waOverlay = useWhatsAppOverlay();

  const sendWhatsAppMessage = async (
    memberId: string, 
    memberName: string, 
    memberPhone: string,
    type: string,
    customMessage?: string
  ) => {
    if (!waOverlay.startSending(memberName)) return false;
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
        getEdgeFunctionUrl("send-whatsapp"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
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
      
      // Check success: edge function returns { success, results } not { success, sent }
      const sentCount = data.results?.filter((r: any) => r.success).length ?? 0;
      if (data.success || sentCount > 0) {
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
        waOverlay.markSuccess(memberName);
        return true;
      } else {
        throw new Error(data.error || "Failed to send WhatsApp");
      }
    } catch (error: any) {
      waOverlay.markError(error.message);
      return false;
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const handleSendPromotional = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    await sendWhatsAppMessage(member.id, member.name, member.phone, "promotional");
  };

  const handleSendExpiryReminder = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.subscription) return;
    await sendWhatsAppMessage(member.id, member.name, member.phone, "expiry_reminder");
  };

  const handleSendExpiredReminder = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.subscription) return;
    await sendWhatsAppMessage(member.id, member.name, member.phone, "expired_reminder");
  };

  const handleSendPaymentDetails = async (member: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    await sendWhatsAppMessage(member.id, member.name, member.phone, "payment_details");
  };

  const isInactive = (member: Member): boolean => {
    return member.subscription?.status === "inactive";
  };

  const computeStatusFromDates = (endDate: string | null | undefined): string => {
    if (!endDate) return "active";
    const now = new Date();
    const end = new Date(endDate);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "expired";
    if (diffDays <= 7) return "expiring_soon";
    return "active";
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

      // Compute the correct status based on subscription end_date
      const computedStatus = computeStatusFromDates(member.subscription?.end_date);

      console.log("Restore status: subscription id =", member.subscription.id, "end_date =", member.subscription?.end_date, "computed =", computedStatus);

      const { data: updatedRows, error } = await supabase
        .from("subscriptions")
        .update({ status: computedStatus as any })
        .eq("id", member.subscription.id)
        .select();
      
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Update failed — no rows were affected. You may not have permission to update this subscription.");
      }
      console.log("Restore status: updated row =", updatedRows[0]);
      
      invalidateMembers();

      const statusLabel = computedStatus === "expiring_soon" ? "Expiring Soon" : computedStatus === "expired" ? "Expired" : "Active";

      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members",
          type: "member_moved_to_active",
          description: `Staff "${staffUser.fullName}" restored "${member.name}" to ${statusLabel} status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: computedStatus },
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
          description: `Restored "${member.name}" to ${statusLabel} status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: computedStatus },
          branchId: currentBranch?.id,
        });
      }
      
      toast.success(`${member.name} restored to ${statusLabel}`);
    } catch (error: any) {
      toast.error("Error moving to active", {
        description: error.message,
      });
    }
  };

  const handleMoveToInactive = async (member: Member, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!member.subscription?.id) {
        toast.error("No subscription found", {
          description: "Cannot deactivate member without a subscription",
        });
        return;
      }

      const { data: updatedRows, error } = await supabase
        .from("subscriptions")
        .update({ status: "inactive" as any })
        .eq("id", member.subscription.id)
        .select();
      
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Update failed — no rows were affected. You may not have permission.");
      }

      console.log("Move to inactive: updated row =", updatedRows[0]);
      
      invalidateMembers();

      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members",
          type: "member_moved_to_inactive",
          description: `Staff "${staffUser.fullName}" moved "${member.name}" to inactive status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: "inactive" },
          branchId: currentBranch?.id,
          staffId: staffUser.id,
          staffName: staffUser.fullName,
          staffPhone: staffUser.phone,
          metadata: { staff_role: staffUser.role },
        });
      } else {
        await logAdminActivity({
          category: "members",
          type: "member_moved_to_inactive",
          description: `Moved "${member.name}" to inactive status`,
          entityType: "members",
          entityId: member.id,
          entityName: member.name,
          oldValue: { status: member.subscription.status },
          newValue: { status: "inactive" },
          branchId: currentBranch?.id,
        });
      }
      
      toast.success(`${member.name} moved to inactive`);
    } catch (error: any) {
      console.error("Move to inactive error:", error);
      toast.error("Error moving to inactive", {
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

  const isNewMember = (member: Member): boolean => {
    if (!member.created_at) return false;
    const createdAt = new Date(member.created_at).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return createdAt > oneHourAgo;
  };

  const isExpiringSoon = (member: Member): boolean => {
    if (!member.subscription) return false;
    if (member.subscription.status === "inactive") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(member.subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  };

  const isExpired = (member: Member): boolean => {
    if (!member.subscription) return false;
    if (member.subscription.status === "inactive") return false;
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
    
    const count = selectedMembers.size;
    if (!waOverlay.startSending(`${count} members`)) return;
    setBulkActionType(type);
    try {
      // Get saved template for the message type
      const savedTemplate = getSavedTemplate(type);

      // Get current admin user
      const { data: { session } } = await supabase.auth.getSession();
      const adminUserId = session?.user?.id || null;
      const accessToken = session?.access_token || null;

      const response = await fetch(
        getEdgeFunctionUrl("send-whatsapp"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
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
      
      // Derive sent/failed counts from results array
      const sentCount = data.results?.filter((r: any) => r.success).length ?? 0;
      const failedCount = data.results?.filter((r: any) => !r.success).length ?? 0;
      
      if (data.success || sentCount > 0) {
        const typeLabel = type === "promotional" ? "Promotional messages" : 
                          type === "expiry_reminder" ? "Expiry reminders" : 
                          type === "expired_reminder" ? "Expired reminders" : "Messages";
        waOverlay.markSuccess(`${sentCount} members${failedCount > 0 ? ` (${failedCount} failed)` : ""}`);

        // Log bulk WhatsApp activity for staff
        if (isStaffLoggedIn && staffUser && sentCount > 0) {
          await logStaffActivity({
            category: "whatsapp",
            type: "whatsapp_bulk_message_sent",
            description: `Staff "${staffUser.fullName}" sent bulk ${type.replace(/_/g, " ")} to ${sentCount} members`,
            entityType: "members",
            newValue: { 
              message_type: type, 
              recipients_count: sentCount,
              failed_count: failedCount,
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
      waOverlay.markError(error.message);
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

  // Forgiving fuzzy search: surfaces partial, typo'd, and out-of-order matches
  // ranked by relevance instead of strict substring matching.
  const searchFiltered = useMemo(
    () => fuzzySearch(members, searchQuery),
    [members, searchQuery],
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

  // Fetch member IDs for trainer/slot filter from pt_subscriptions (single source of truth)
  const { data: slotMemberIds } = useQuery({
    queryKey: ["pt-member-ids", currentBranch?.id, trainerFilter, timeSlotFilter],
    queryFn: async () => {
      if (!currentBranch?.id) return null;
      const today = new Date().toISOString().split("T")[0];

      // Special: "No Time Slot" — members with active PT but no time_slot_id
      // If trainerFilter is also set, scope to that trainer's members only
      if (timeSlotFilter === "__no_slot__") {
        // First get members who DO have a slot in their active PT
        const { data: withSlots } = await supabase
          .from("pt_subscriptions" as any)
          .select("member_id")
          .eq("branch_id", currentBranch.id)
          .eq("status", "active")
          .gte("end_date", today)
          .not("time_slot_id", "is", null);

        const withSlotSet = new Set((withSlots as any[] || []).map((d: any) => d.member_id));

        // If a trainer filter is also active, we need to get that trainer's members
        // and then exclude those who have slots
        if (trainerFilter && trainerFilter !== "__no_trainer__") {
          // Resolve trainerFilter to personal_trainer_ids
          // First check if it's directly a personal_trainer_id
          const { data: directPt } = await supabase
            .from("personal_trainers")
            .select("id")
            .eq("id", trainerFilter)
            .eq("branch_id", currentBranch.id)
            .maybeSingle();

          let ptIds: string[] = [];
          if (directPt) {
            ptIds = [directPt.id];
          } else {
            // Resolve staff_id → phone via direct query
            const { data: staffBasic } = await supabase.from("staff").select("id, phone, full_name").eq("id", trainerFilter).maybeSingle();
            const staffBasicArr = staffBasic ? [{ staff_id: staffBasic.id, phone: staffBasic.phone, full_name: staffBasic.full_name }] : [];
            const staffRecord = staffBasicArr.find((s: any) => s.staff_id === trainerFilter);
            if (staffRecord?.phone) {
              const { data: ptProfiles } = await supabase
                .from("personal_trainers")
                .select("id")
                .eq("phone", staffRecord.phone)
                .eq("branch_id", currentBranch.id);
              ptIds = (ptProfiles as any[] || []).map((p: any) => p.id);
            }
          }
          if (ptIds.length === 0) return { type: "include" as const, ids: new Set<string>() };

          const { data: ptSubs } = await supabase
            .from("pt_subscriptions" as any)
            .select("member_id, time_slot_id")
            .eq("branch_id", currentBranch.id)
            .eq("status", "active")
            .gte("end_date", today)
            .in("personal_trainer_id", ptIds);

          // Members of this trainer who have NO slot
          const noSlotMembers = new Set(
            (ptSubs as any[] || [])
              .filter((d: any) => !d.time_slot_id)
              .map((d: any) => d.member_id)
          );
          return { type: "include" as const, ids: noSlotMembers };
        }

        return { type: "exclude" as const, ids: withSlotSet };
      }

      // Special: "No Trainer" — members with NO active PT subscription at all
      if (trainerFilter === "__no_trainer__") {
        const { data: withPT } = await supabase
          .from("pt_subscriptions" as any)
          .select("member_id")
          .eq("branch_id", currentBranch.id)
          .eq("status", "active")
          .gte("end_date", today);

        const withPTSet = new Set((withPT as any[] || []).map((d: any) => d.member_id));
        return { type: "exclude" as const, ids: withPTSet };
      }

      // If timeSlotFilter is set, get members with active PT in that slot
      if (timeSlotFilter) {
        const { data } = await supabase
          .from("pt_subscriptions" as any)
          .select("member_id")
          .eq("time_slot_id", timeSlotFilter)
          .eq("status", "active")
          .gte("end_date", today);
        return { type: "include" as const, ids: new Set((data as any[] || []).map((d: any) => d.member_id)) };
      }

      // If trainerFilter is set, resolve to personal_trainer_id
      if (trainerFilter) {
        // First check if it's directly a personal_trainer_id
        const { data: directPt } = await supabase
          .from("personal_trainers")
          .select("id")
          .eq("id", trainerFilter)
          .eq("branch_id", currentBranch.id)
          .maybeSingle();

        let ptIds: string[] = [];
        if (directPt) {
          ptIds = [directPt.id];
        } else {
          // Resolve staff_id → phone via direct query
          const { data: staffBasicSingle } = await supabase.from("staff").select("id, phone, full_name").eq("id", trainerFilter).maybeSingle();
          const staffRecord = staffBasicSingle ? { staff_id: staffBasicSingle.id, phone: staffBasicSingle.phone } : null;
          if (staffRecord?.phone) {
            const { data: ptProfiles } = await supabase
              .from("personal_trainers")
              .select("id")
              .eq("phone", staffRecord.phone)
              .eq("branch_id", currentBranch.id);
            ptIds = (ptProfiles as any[] || []).map((p: any) => p.id);
          }
        }
        if (ptIds.length === 0) return { type: "include" as const, ids: new Set<string>() };

        const { data: ptSubs } = await supabase
          .from("pt_subscriptions" as any)
          .select("member_id")
          .eq("branch_id", currentBranch.id)
          .eq("status", "active")
          .gte("end_date", today)
          .in("personal_trainer_id", ptIds);

        return { type: "include" as const, ids: new Set((ptSubs as any[] || []).map((d: any) => d.member_id)) };
      }

      return null; // no filter active
    },
    enabled: !!currentBranch?.id && (!!trainerFilter || !!timeSlotFilter),
    staleTime: 30000,
  });

  // Apply trainer/slot filter
  const timeSlotFiltered = (() => {
    if ((!trainerFilter && !timeSlotFilter) || !slotMemberIds) return filteredMembers;
    if (slotMemberIds.type === "exclude") {
      return filteredMembers.filter((m) => !slotMemberIds.ids.has(m.id));
    }
    return filteredMembers.filter((m) => slotMemberIds.ids.has(m.id));
  })();

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

  const sortedMembers = [...timeSlotFiltered].sort((a, b) => {
    // New members (added within 1 hour) always appear at the top
    const aIsNew = isNewMember(a);
    const bIsNew = isNewMember(b);
    if (aIsNew && !bIsNew) return -1;
    if (!aIsNew && bIsNew) return 1;
    if (aIsNew && bIsNew) {
      // Among new members, sort by most recent first
      const aTime = new Date(a.created_at!).getTime();
      const bTime = new Date(b.created_at!).getTime();
      return bTime - aTime;
    }

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
      return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors duration-300"></div>;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(subscription.end_date);
    endDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isActuallyExpired = diffDays < 0;
    const isActuallyExpiringSoon = !isActuallyExpired && diffDays >= 0 && diffDays <= 7;

    if (subscription.status === "inactive") {
      return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors duration-300"></div>;
    }

    if (isActuallyExpired) {
      return <div className="w-2.5 h-2.5 rounded-full bg-red-500 dark:bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)] transition-all duration-300"></div>;
    }
    
    if (isActuallyExpiringSoon) {
      return <div className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)] animate-pulse transition-all duration-300"></div>;
    }

    switch (subscription.status) {
      case "active":
        return <div className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)] transition-all duration-300"></div>;
      case "paused":
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors duration-300"></div>;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors duration-300"></div>;
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
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 md:p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-xs md:text-sm font-medium">
            {selectedMembers.size} member{selectedMembers.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMembers(new Set())}
              className="h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3"
            >
              Clear
            </Button>
            {canSendWhatsApp && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkWhatsApp("promotional")}
                  disabled={bulkActionType !== null}
                  className="gap-1 md:gap-2 h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3"
                >
                  <MessageCircle className="w-3 h-3 md:w-4 md:h-4" />
                  {bulkActionType === "promotional" ? "Sending..." : "Promotional"}
                </Button>
                {hasExpiringOrExpiredSelected() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkWhatsApp("expiry_reminder")}
                    disabled={bulkActionType !== null}
                    className="gap-1 md:gap-2 h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3"
                  >
                    <Clock className="w-3 h-3 md:w-4 md:h-4" />
                    {bulkActionType === "expiry_reminder" ? "Sending..." : "Expiry Reminder"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      

      {isCompact ? (
        <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
          {/* Table Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }}>
                <Checkbox
                  checked={selectedMembers.size > 0 && selectedMembers.size === sortedMembers.length}
                  className="h-4.5 w-4.5 rounded-md border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>
              <button 
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                onClick={() => handleSort("name")}
              >
                Member
                {sortField === "name" && (
                  sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                )}
              </button>
              {selectedMembers.size > 0 && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                  {selectedMembers.size}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(trainerFilter || timeSlotFilter) && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {sortedMembers.length}/{totalCount}
                </span>
              )}
              <button
                className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
                onClick={() => handleSort("expiry")}
              >
                {sortField === "expiry" && sortOrder === "desc" ? (
                  <ArrowDown className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
          
          {/* Table Rows */}
          <div className="divide-y divide-border/60">
            {sortedMembers.map((member, index) => (
              <div 
                key={member.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-3 cursor-pointer transition-all duration-200 active:scale-[0.99] active:bg-muted/60",
                  !searchQuery && "animate-fade-in",
                  "hover:bg-muted/40",
                  selectedMembers.has(member.id) && "bg-primary/5",
                  isNewMember(member) && "border-l-2 border-l-emerald-500 bg-emerald-500/5"
                )}
                style={!searchQuery ? { animationDelay: `${Math.min(index, 12) * 25}ms`, animationDuration: "260ms" } : undefined}
                onClick={() => handleMemberClick(member)}
              >
                {/* Selection Checkbox */}
                <div 
                  className="flex-shrink-0"
                  onClick={(e) => toggleMemberSelection(member.id, e)}
                >
                  <Checkbox
                    checked={selectedMembers.has(member.id)}
                    className="h-5 w-5 rounded-md border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all duration-150"
                  />
                </div>
                
                {/* Member Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm truncate text-foreground">{member.name}</p>
                    {isNewMember(member) && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 h-4 animate-in zoom-in-50 duration-300 font-bold">
                        NEW
                      </Badge>
                    )}
                    {enrolledMemberIds.has(member.id) && (
                      <Fingerprint className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">+91 {member.phone}</p>
                </div>
                
                {/* Status Dot */}
                <div className="flex-shrink-0 pr-1">
                  {getStatusCircle(member.subscription)}
                </div>
                
                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0 rounded-lg hover:bg-muted/60 transition-colors">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-border/60">
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
                        {isInactive(member) && (
                          <DropdownMenuItem onClick={(e) => handleMoveToActive(member, e)}>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Restore Status
                          </DropdownMenuItem>
                        )}
                        {!isInactive(member) && member.subscription && (
                          <DropdownMenuItem onClick={(e) => handleMoveToInactive(member, e)}>
                            <UserX className="w-4 h-4 mr-2" />
                            Move to Inactive
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    {canSendWhatsApp && (
                      <>
                        {canManageMembers && <DropdownMenuSeparator />}
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
                    {canManageMembers && canEnrollBiometric && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnrollMember(member);
                          }}
                        >
                          <Fingerprint className="w-4 h-4 mr-2" />
                          Enroll Biometric
                        </DropdownMenuItem>
                      </>
                    )}
                    {!canManageMembers && !canSendWhatsApp && (
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
            <div className="divide-y divide-border/60">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded-md w-28" />
                    <div className="h-3 bg-muted rounded-md w-24" />
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
                  <TableHead className="w-10">
                    {(trainerFilter || timeSlotFilter) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {sortedMembers.length}/{totalCount}
                      </span>
                    )}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMembers.map((member, index) => (
                  <TableRow 
                    key={member.id}
                    className={cn(
                      "transition-colors duration-150 ease-in-out hover:bg-muted/50 cursor-pointer",
                      !searchQuery && "animate-fade-in",
                      selectedMembers.has(member.id) && "bg-primary/5",
                      isNewMember(member) && "bg-emerald-500/[0.06] hover:bg-emerald-500/10 border-l-2 border-l-emerald-500"
                    )}
                    style={!searchQuery ? { animationDelay: `${Math.min(index, 15) * 20}ms`, animationDuration: "240ms" } : undefined}
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
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm">{member.name}</p>
                          {isNewMember(member) && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 h-4 animate-in zoom-in-50 duration-300 font-bold">
                              NEW
                            </Badge>
                          )}
                          {enrolledMemberIds.has(member.id) && (
                            <Fingerprint className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          )}
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
                              {isInactive(member) && (
                                <DropdownMenuItem onClick={(e) => handleMoveToActive(member, e)}>
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  Restore Status
                                </DropdownMenuItem>
                              )}
                              {!isInactive(member) && member.subscription && (
                                <DropdownMenuItem onClick={(e) => handleMoveToInactive(member, e)}>
                                  <UserX className="w-4 h-4 mr-2" />
                                  Move to Inactive
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {canSendWhatsApp && (
                            <>
                              {canManageMembers && <DropdownMenuSeparator />}
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
                          {canManageMembers && canEnrollBiometric && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnrollMember(member);
                                }}
                              >
                                <Fingerprint className="w-4 h-4 mr-2" />
                                Enroll Biometric
                              </DropdownMenuItem>
                            </>
                          )}
                          {!canManageMembers && !canSendWhatsApp && (
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

      <WhatsAppSendingOverlay {...waOverlay.overlayProps} />

      {enrollMember && (
        <BiometricEnrollDialog
          open={!!enrollMember}
          onOpenChange={(open) => !open && setEnrollMember(null)}
          memberId={enrollMember.id}
          memberName={enrollMember.name}
          memberPhone={enrollMember.phone}
          branchId={currentBranch?.id || ""}
        />
      )}
    </div>
  );
};
