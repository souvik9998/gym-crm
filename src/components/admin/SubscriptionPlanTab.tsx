/**
 * Subscription & Plan tab for gym admin Settings page.
 * Shows the permissions, usage limits, and plan details set by the super admin.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheckIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  UsersIcon,
  BuildingStorefrontIcon,
  BoltIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";

interface TenantLimitsData {
  max_branches: number;
  max_staff_per_branch: number;
  max_members: number;
  max_trainers: number;
  max_monthly_whatsapp_messages: number;
  max_monthly_checkins: number;
  max_storage_mb: number;
  plan_expiry_date: string | null;
  features: Record<string, boolean>;
}

interface TenantUsageData {
  branches_count: number;
  staff_count: number;
  members_count: number;
  trainers_count: number;
  whatsapp_this_month: number;
  monthly_checkins: number;
}

const MODULE_LABELS: Record<string, { label: string; description: string }> = {
  members_management: { label: "Members Management", description: "Add, edit, and manage gym members" },
  attendance: { label: "Attendance", description: "Track member and staff attendance" },
  payments_billing: { label: "Payments & Billing", description: "Process payments and manage billing" },
  staff_management: { label: "Staff Management", description: "Manage staff accounts and permissions" },
  reports_analytics: { label: "Reports & Analytics", description: "View performance reports and insights" },
  workout_diet_plans: { label: "Workout/Diet Plans", description: "Create and assign workout and diet plans" },
  notifications: { label: "Notifications (SMS/WhatsApp)", description: "Send automated notifications" },
  integrations: { label: "Integrations (Razorpay)", description: "Payment gateway integrations" },
  leads_crm: { label: "Leads/Enquiries CRM", description: "Manage leads and enquiries" },
};

export function SubscriptionPlanTab() {
  const [limits, setLimits] = useState<TenantLimitsData | null>(null);
  const [usage, setUsage] = useState<TenantUsageData | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPlanDetails();
  }, []);

  const fetchPlanDetails = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Get tenant ID
      const impersonatedTenantId = localStorage.getItem("superadmin-impersonated-tenant");
      let tenantId = impersonatedTenantId;

      if (!tenantId) {
        const { data: membership } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", session.user.id)
          .limit(1)
          .maybeSingle();
        tenantId = membership?.tenant_id || null;
      }

      if (!tenantId) return;

      // Fetch tenant info, limits, and usage in parallel
      const [tenantRes, limitsRes, usageRes] = await Promise.all([
        supabase.from("tenants").select("name").eq("id", tenantId).single(),
        supabase.from("tenant_limits").select("*").eq("tenant_id", tenantId).single(),
        supabase.rpc("get_tenant_current_usage", { _tenant_id: tenantId }),
      ]);

      if (tenantRes.data) setTenantName(tenantRes.data.name);
      if (limitsRes.data) {
        setLimits({
          ...limitsRes.data,
          features: (limitsRes.data.features as Record<string, boolean>) || {},
        });
      }
      if (usageRes.data?.[0]) setUsage(usageRes.data[0]);
    } catch (error) {
      console.error("Error fetching plan details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!limits) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No subscription plan found. Contact your platform administrator.</p>
        </CardContent>
      </Card>
    );
  }

  const isExpired = limits.plan_expiry_date
    ? new Date(limits.plan_expiry_date) < new Date(new Date().toDateString())
    : false;

  const daysUntilExpiry = limits.plan_expiry_date
    ? Math.ceil((new Date(limits.plan_expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const usageItems = [
    { label: "Members", used: usage?.members_count ?? 0, max: limits.max_members, icon: UsersIcon },
    { label: "Branches", used: usage?.branches_count ?? 0, max: limits.max_branches, icon: BuildingStorefrontIcon },
    { label: "Staff", used: usage?.staff_count ?? 0, max: limits.max_staff_per_branch * limits.max_branches, icon: UsersIcon },
    { label: "Trainers", used: usage?.trainers_count ?? 0, max: limits.max_trainers, icon: UsersIcon },
    { label: "Monthly Check-ins", used: usage?.monthly_checkins ?? 0, max: limits.max_monthly_checkins, icon: ChartBarIcon },
    { label: "WhatsApp Messages", used: usage?.whatsapp_this_month ?? 0, max: limits.max_monthly_whatsapp_messages, icon: BoltIcon },
  ];

  const enabledModules = Object.entries(limits.features).filter(([, v]) => v === true);
  const disabledModules = Object.entries(limits.features).filter(([, v]) => v !== true);

  return (
    <div className="space-y-6">
      {/* Plan Overview Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="w-5 h-5 text-primary" />
            Plan Overview
          </CardTitle>
          <CardDescription>Your current subscription plan details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Organization:</span>
            <span className="font-semibold">{tenantName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Plan Expiry:</span>
            {limits.plan_expiry_date ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {format(new Date(limits.plan_expiry_date), "dd MMM yyyy")}
                </span>
                {isExpired ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : daysUntilExpiry !== null && daysUntilExpiry <= 30 ? (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                    {daysUntilExpiry} days left
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-green-500 text-green-600">Active</Badge>
                )}
              </div>
            ) : (
              <Badge variant="outline" className="border-green-500 text-green-600">No Expiry (Unlimited)</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Storage Limit:</span>
            <span className="font-semibold">{limits.max_storage_mb} MB</span>
          </div>

          {isExpired && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              Your plan has expired. Some features may be restricted. Contact your platform administrator to renew.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Limits Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-primary" />
            Usage & Quotas
          </CardTitle>
          <CardDescription>Current resource usage against your plan limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            {usageItems.map((item) => {
              const percentage = item.max > 0 ? Math.min((item.used / item.max) * 100, 100) : 0;
              const isNearLimit = percentage >= 80;
              const isAtLimit = percentage >= 100;

              return (
                <div key={item.label} className="space-y-2 p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className={`text-sm font-semibold ${isAtLimit ? "text-destructive" : isNearLimit ? "text-yellow-600" : "text-foreground"}`}>
                      {item.used.toLocaleString()} / {item.max.toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    className={`h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-yellow-500" : ""}`}
                  />
                  {isAtLimit && (
                    <p className="text-xs text-destructive">Limit reached — contact admin to upgrade</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Feature Permissions Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-primary" />
            Feature Permissions
          </CardTitle>
          <CardDescription>Modules enabled on your current plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {enabledModules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enabled</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {enabledModules.map(([key]) => {
                    const info = MODULE_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                        <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{info.label}</p>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {disabledModules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not Included</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {disabledModules.map(([key]) => {
                    const info = MODULE_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border opacity-60">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{info.label}</p>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {enabledModules.length === 0 && disabledModules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No permission data available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
