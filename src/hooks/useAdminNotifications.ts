/**
 * Hook to gather admin notifications:
 * - Plan expiry warnings
 * - Resource limit warnings (members, branches, staff, whatsapp, trainers)
 * - Expiring members based on WhatsApp reminder settings
 * - Recently added members (within 1 hour)
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";

interface ExpiringMemberNotificationItem {
  id: string;
  name: string;
  phone: string;
  endDate: string;
}

interface MemberNotificationMeta {
  mode: "expiring_soon" | "expiring_today";
  daysBefore?: number;
  members: ExpiringMemberNotificationItem[];
}

export interface AdminNotification {
  id: string;
  type: "danger" | "warning" | "info" | "success";
  category: "plan" | "limit" | "member" | "new_member" | "event" | "expired_checkin";
  title: string;
  description: string;
  actionRoute?: string;
  timestamp: Date;
  memberMeta?: MemberNotificationMeta;
}

interface TenantLimitsData {
  max_members: number;
  max_branches: number;
  max_staff_per_branch: number;
  max_trainers: number;
  max_monthly_whatsapp_messages: number;
  max_monthly_checkins: number;
  plan_expiry_date: string | null;
}

interface TenantUsageData {
  members_count: number;
  branches_count: number;
  staff_count: number;
  trainers_count: number;
  whatsapp_this_month: number;
  monthly_checkins: number;
}

type SubscriptionRow = {
  id: string;
  end_date: string;
  status: string;
  member_id: string;
  members: {
    id: string;
    name: string;
    phone: string;
    branch_id: string;
  } | null;
};

const DEFAULT_EXPIRING_DAYS = 2;

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date: Date) => date.toISOString().split("T")[0];

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentBranch } = useBranch();
  const { tenantId, isLoading: authLoading } = useAuth();

  const fetchNotifications = async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    try {
      const items: AdminNotification[] = [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const today = startOfToday();

      let recentMembersQuery = supabase
        .from("members")
        .select("id, name, created_at")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false });

      if (currentBranch?.id) {
        recentMembersQuery = recentMembersQuery.eq("branch_id", currentBranch.id);
      }

      let settingsQuery = supabase
        .from("gym_settings")
        .select("branch_id, whatsapp_auto_send")
        .limit(1);

      if (currentBranch?.id) {
        settingsQuery = settingsQuery.eq("branch_id", currentBranch.id);
      } else {
        settingsQuery = settingsQuery.not("branch_id", "is", null);
      }

      const [limitsRes, usageRes, recentMembersRes, settingsRes] = await Promise.all([
        supabase.from("tenant_limits").select("*").eq("tenant_id", tenantId).single(),
        supabase.rpc("get_tenant_current_usage", { _tenant_id: tenantId }),
        recentMembersQuery,
        settingsQuery.maybeSingle(),
      ]);

      const limits = limitsRes.data as TenantLimitsData | null;
      const usage = (usageRes.data as TenantUsageData[] | null)?.[0];
      const recentMembers = recentMembersRes.data || [];
      const autoSend = (settingsRes.data?.whatsapp_auto_send as Record<string, unknown> | null) || {};
      const expiringSoonEnabled = autoSend.expiring_2days !== false;
      const expiringTodayEnabled = autoSend.expiring_today !== false;
      const expiringDaysBefore =
        typeof autoSend.expiring_days_before === "number" ? autoSend.expiring_days_before : DEFAULT_EXPIRING_DAYS;

      if (recentMembers.length > 0) {
        const memberNames = recentMembers.slice(0, 3).map((m: any) => m.name);
        const moreCount = recentMembers.length - 3;
        const namesList = memberNames.join(", ") + (moreCount > 0 ? ` and ${moreCount} more` : "");

        items.push({
          id: "new-members-recent",
          type: "success",
          category: "new_member",
          title: `${recentMembers.length} New Member${recentMembers.length > 1 ? "s" : ""} Added`,
          description: `Recently registered: ${namesList}`,
          actionRoute: "/admin/dashboard",
          timestamp: new Date(recentMembers[0].created_at),
        });
      }

      if (limits) {
        if (limits.plan_expiry_date) {
          const expiry = new Date(limits.plan_expiry_date);
          const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysLeft < 0) {
            items.push({
              id: "plan-expired",
              type: "danger",
              category: "plan",
              title: "Plan Expired",
              description: `Your plan expired ${Math.abs(daysLeft)} days ago. Renew to continue using all features.`,
              actionRoute: "/admin/settings?tab=plan",
              timestamp: new Date(),
            });
          } else if (daysLeft <= 7) {
            items.push({
              id: "plan-expiring",
              type: "warning",
              category: "plan",
              title: "Plan Expiring Soon",
              description: `Your plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Renew soon.`,
              actionRoute: "/admin/settings?tab=plan",
              timestamp: new Date(),
            });
          }
        }

        if (usage) {
          const checks: { key: string; used: number; max: number; label: string; route: string }[] = [
            { key: "members", used: usage.members_count, max: limits.max_members, label: "Members", route: "/admin/dashboard" },
            { key: "branches", used: usage.branches_count, max: limits.max_branches, label: "Branches", route: "/admin/settings?tab=branches" },
            { key: "staff", used: usage.staff_count, max: limits.max_staff_per_branch, label: "Staff", route: "/admin/staff" },
            { key: "trainers", used: usage.trainers_count, max: limits.max_trainers, label: "Trainers", route: "/admin/trainers" },
            { key: "whatsapp", used: usage.whatsapp_this_month, max: limits.max_monthly_whatsapp_messages, label: "WhatsApp Messages", route: "/admin/settings?tab=whatsapp" },
          ];

          for (const c of checks) {
            const pct = c.max > 0 ? (c.used / c.max) * 100 : 0;
            if (c.used >= c.max) {
              items.push({
                id: `limit-${c.key}`,
                type: "danger",
                category: "limit",
                title: `${c.label} Limit Reached`,
                description: `You've used ${c.used}/${c.max} ${c.label.toLowerCase()}. Upgrade to add more.`,
                actionRoute: c.route,
                timestamp: new Date(),
              });
            } else if (pct >= 80) {
              items.push({
                id: `limit-warn-${c.key}`,
                type: "warning",
                category: "limit",
                title: `${c.label} Almost Full`,
                description: `${c.used}/${c.max} ${c.label.toLowerCase()} used (${Math.round(pct)}%).`,
                actionRoute: c.route,
                timestamp: new Date(),
              });
            }
          }
        }
      }

      if (currentBranch?.id && (expiringSoonEnabled || expiringTodayEnabled)) {
        const targetSoonDate = formatDate(addDays(today, expiringDaysBefore));
        const targetTodayDate = formatDate(today);

        const subscriptionQuery = supabase
          .from("subscriptions")
          .select("id, end_date, status, member_id, members!inner(id, name, phone, branch_id)")
          .eq("members.branch_id", currentBranch.id)
          .in("status", ["active", "expiring_soon"]);

        const dateFilters = [
          expiringSoonEnabled ? `end_date.eq.${targetSoonDate}` : null,
          expiringTodayEnabled ? `end_date.eq.${targetTodayDate}` : null,
        ].filter(Boolean);

        const { data: matchedSubscriptions, error: matchedError } = await subscriptionQuery.or(dateFilters.join(","));

        if (matchedError) {
          console.error("Failed to fetch expiring member notifications:", matchedError);
        } else {
          const rows = (matchedSubscriptions || []) as unknown as SubscriptionRow[];
          const expiringSoonMembers = rows
            .filter((row) => row.end_date === targetSoonDate)
            .map((row) => ({
              id: row.member_id,
              name: row.members?.name || "Member",
              phone: row.members?.phone || "",
              endDate: row.end_date,
            }));

          const expiringTodayMembers = rows
            .filter((row) => row.end_date === targetTodayDate)
            .map((row) => ({
              id: row.member_id,
              name: row.members?.name || "Member",
              phone: row.members?.phone || "",
              endDate: row.end_date,
            }));

          if (expiringSoonMembers.length > 0) {
            items.push({
              id: `members-expiring-${expiringDaysBefore}`,
              type: "warning",
              category: "member",
              title: `${expiringSoonMembers.length} Member${expiringSoonMembers.length > 1 ? "s" : ""} Expiring in ${expiringDaysBefore} Day${expiringDaysBefore > 1 ? "s" : ""}`,
              description: `Select members and send the configured reminder scheduled ${expiringDaysBefore} day${expiringDaysBefore > 1 ? "s" : ""} before expiry.`,
              timestamp: new Date(),
              memberMeta: {
                mode: "expiring_soon",
                daysBefore: expiringDaysBefore,
                members: expiringSoonMembers,
              },
            });
          }

          if (expiringTodayMembers.length > 0) {
            items.push({
              id: "members-expiring-today",
              type: "danger",
              category: "member",
              title: `${expiringTodayMembers.length} Member${expiringTodayMembers.length > 1 ? "s" : ""} Expiring Today`,
              description: "Select members and send today's expiry notification in bulk.",
              timestamp: new Date(),
              memberMeta: {
                mode: "expiring_today",
                members: expiringTodayMembers,
              },
            });
          }
        }
      }

      setNotifications(items);
    } catch (err) {
      console.error("Failed to fetch admin notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !tenantId) {
      if (!authLoading && !tenantId) setIsLoading(false);
      return;
    }

    fetchNotifications();
  }, [authLoading, tenantId, currentBranch?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (tenantId) fetchNotifications();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [tenantId, currentBranch?.id]);

  const dangerCount = useMemo(() => notifications.filter((n) => n.type === "danger").length, [notifications]);
  const successCount = useMemo(() => notifications.filter((n) => n.type === "success").length, [notifications]);
  const totalCount = notifications.length;

  return { notifications, isLoading, dangerCount, successCount, totalCount, refetch: fetchNotifications };
}
