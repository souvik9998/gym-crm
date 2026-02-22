/**
 * Hook to gather admin notifications:
 * - Plan expiry warnings
 * - Resource limit warnings (members, branches, staff, whatsapp, trainers)
 * - Expiring/expired members
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useDashboardStats } from "@/hooks/queries/useDashboard";

export interface AdminNotification {
  id: string;
  type: "danger" | "warning" | "info";
  category: "plan" | "limit" | "member";
  title: string;
  description: string;
  actionRoute?: string;
  timestamp: Date;
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

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentBranch } = useBranch();
  const { data: dashStats } = useDashboardStats();

  useEffect(() => {
    fetchNotifications();
  }, [currentBranch?.id, dashStats]);

  const fetchNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsLoading(false); return; }

      const items: AdminNotification[] = [];

      // Get tenant ID
      const { data: membership } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.tenant_id) { setIsLoading(false); return; }

      const tenantId = membership.tenant_id;

      // Fetch limits and usage in parallel
      const [limitsRes, usageRes] = await Promise.all([
        supabase.from("tenant_limits").select("*").eq("tenant_id", tenantId).single(),
        supabase.rpc("get_tenant_current_usage", { _tenant_id: tenantId }),
      ]);

      const limits = limitsRes.data as TenantLimitsData | null;
      const usage = (usageRes.data as TenantUsageData[] | null)?.[0];

      if (limits) {
        // Plan expiry check
        if (limits.plan_expiry_date) {
          const expiry = new Date(limits.plan_expiry_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
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

        // Resource limit warnings
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

      // Expiring/expired members from dashboard stats
      if (dashStats) {
        if (dashStats.expiredMembers > 0) {
          items.push({
            id: "members-expired",
            type: "danger",
            category: "member",
            title: `${dashStats.expiredMembers} Expired Member${dashStats.expiredMembers > 1 ? "s" : ""}`,
            description: "Members with expired subscriptions need renewal.",
            actionRoute: "/admin/dashboard",
            timestamp: new Date(),
          });
        }
        if (dashStats.expiringSoon > 0) {
          items.push({
            id: "members-expiring",
            type: "warning",
            category: "member",
            title: `${dashStats.expiringSoon} Expiring Soon`,
            description: "Members whose subscriptions expire within 7 days.",
            actionRoute: "/admin/dashboard",
            timestamp: new Date(),
          });
        }
      }

      setNotifications(items);
    } catch (err) {
      console.error("Failed to fetch admin notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const dangerCount = useMemo(() => notifications.filter(n => n.type === "danger").length, [notifications]);
  const totalCount = notifications.length;

  return { notifications, isLoading, dangerCount, totalCount, refetch: fetchNotifications };
}
