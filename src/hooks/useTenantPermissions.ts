/**
 * Hook to fetch and cache tenant module permissions for the current gym owner.
 * Returns which feature modules are enabled/disabled for the tenant.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TenantFeaturePermissions {
  members_management: boolean;
  attendance: boolean;
  payments_billing: boolean;
  staff_management: boolean;
  reports_analytics: boolean;
  workout_diet_plans: boolean;
  notifications: boolean;
  integrations: boolean;
  leads_crm: boolean;
}

const DEFAULT_PERMISSIONS: TenantFeaturePermissions = {
  members_management: true,
  attendance: true,
  payments_billing: true,
  staff_management: true,
  reports_analytics: true,
  workout_diet_plans: false,
  notifications: true,
  integrations: true,
  leads_crm: false,
};

export function useTenantPermissions() {
  const [permissions, setPermissions] = useState<TenantFeaturePermissions>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [planExpired, setPlanExpired] = useState(false);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setIsLoading(false);
          return;
        }

        // Check for impersonated tenant (super admin viewing as admin)
        const impersonatedTenantId = localStorage.getItem("superadmin-impersonated-tenant");
        
        // Check if user is super admin - they get all permissions
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["super_admin"]);

        if (roles && roles.length > 0 && !impersonatedTenantId) {
          // Super admin without impersonation gets everything
          setPermissions({
            members_management: true,
            attendance: true,
            payments_billing: true,
            staff_management: true,
            reports_analytics: true,
            workout_diet_plans: true,
            notifications: true,
            integrations: true,
            leads_crm: true,
          });
          setIsLoading(false);
          return;
        }

        // Get tenant ID
        let effectiveTenantId = impersonatedTenantId;
        if (!effectiveTenantId) {
          const { data: membership } = await supabase
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", session.user.id)
            .limit(1)
            .maybeSingle();
          
          effectiveTenantId = membership?.tenant_id || null;
        }

        if (!effectiveTenantId) {
          setIsLoading(false);
          return;
        }

        setTenantId(effectiveTenantId);

        // Fetch tenant limits (includes features and plan_expiry_date)
        const { data: limits } = await supabase
          .from("tenant_limits")
          .select("features, plan_expiry_date")
          .eq("tenant_id", effectiveTenantId)
          .single();

        if (limits) {
          const features = limits.features as Record<string, boolean> | null;
          if (features) {
            setPermissions({
              members_management: features.members_management ?? true,
              attendance: features.attendance ?? true,
              payments_billing: features.payments_billing ?? true,
              staff_management: features.staff_management ?? true,
              reports_analytics: features.reports_analytics ?? true,
              workout_diet_plans: features.workout_diet_plans ?? false,
              notifications: features.notifications ?? true,
              integrations: features.integrations ?? true,
              leads_crm: features.leads_crm ?? false,
            });
          }

          // Check plan expiry
          if (limits.plan_expiry_date) {
            const expiry = new Date(limits.plan_expiry_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            setPlanExpired(expiry < today);
          }
        }
      } catch (error) {
        console.error("Error fetching tenant permissions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const isModuleEnabled = (module: keyof TenantFeaturePermissions): boolean => {
    if (planExpired) return false;
    return permissions[module] ?? false;
  };

  return {
    permissions,
    isLoading,
    tenantId,
    planExpired,
    isModuleEnabled,
  };
}
