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
    <div className="space-y-4 lg:space-y-6">
      {/* Plan Overview Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            Plan Overview
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">Your current subscription plan details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <span className="text-xs lg:text-sm font-medium text-muted-foreground">Organization:</span>
            <span className="font-semibold text-sm lg:text-base">{tenantName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <span className="text-xs lg:text-sm font-medium text-muted-foreground">Plan Expiry:</span>
            {limits.plan_expiry_date ? (
              <div className="flex items-center gap-1.5 lg:gap-2">
                <span className="font-semibold text-sm lg:text-base">
                  {format(new Date(limits.plan_expiry_date), "dd MMM yyyy")}
                </span>
                {isExpired ? (
                  <Badge variant="destructive" className="text-[10px] lg:text-xs">Expired</Badge>
                ) : daysUntilExpiry !== null && daysUntilExpiry <= 30 ? (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-[10px] lg:text-xs">
                    {daysUntilExpiry} days left
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-green-500 text-green-600 text-[10px] lg:text-xs">Active</Badge>
                )}
              </div>
            ) : (
              <Badge variant="outline" className="border-green-500 text-green-600 text-[10px] lg:text-xs">No Expiry (Unlimited)</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <span className="text-xs lg:text-sm font-medium text-muted-foreground">Storage Limit:</span>
            <span className="font-semibold text-sm lg:text-base">{limits.max_storage_mb} MB</span>
          </div>

          {isExpired && (
            <div className="p-2 lg:p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs lg:text-sm flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 lg:w-5 lg:h-5 flex-shrink-0" />
              Your plan has expired. Some features may be restricted. Contact your platform administrator to renew.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Limits Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <ChartBarIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            Usage & Quotas
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">Current resource usage against your plan limits</CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="grid gap-3 lg:gap-5 grid-cols-1 sm:grid-cols-2">
            {usageItems.map((item) => {
              const percentage = item.max > 0 ? Math.min((item.used / item.max) * 100, 100) : 0;
              const isNearLimit = percentage >= 80;
              const isAtLimit = percentage >= 100;

              return (
                <div key={item.label} className="space-y-1.5 lg:space-y-2 p-2 lg:p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs lg:text-sm font-medium">{item.label}</span>
                    <span className={`text-[10px] lg:text-sm font-semibold ${isAtLimit ? "text-destructive" : isNearLimit ? "text-yellow-600" : "text-foreground"}`}>
                      {item.used.toLocaleString()} / {item.max.toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    className={`h-1.5 lg:h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-yellow-500" : ""}`}
                  />
                  {isAtLimit && (
                    <p className="text-[10px] lg:text-xs text-destructive">Limit reached — contact admin to upgrade</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Feature Permissions Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <ShieldCheckIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            Feature Permissions
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">Modules enabled on your current plan</CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="space-y-3 lg:space-y-4">
            {enabledModules.length > 0 && (
              <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enabled</p>
                <div className="grid gap-1.5 lg:gap-2 grid-cols-1 sm:grid-cols-2">
                  {enabledModules.map(([key]) => {
                    const info = MODULE_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                        <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <div>
                          <p className="text-xs lg:text-sm font-medium">{info.label}</p>
                          <p className="text-[10px] lg:text-xs text-muted-foreground hidden sm:block">{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {disabledModules.length > 0 && (
              <div className="space-y-1.5 lg:space-y-2">
                <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Not Included</p>
                <div className="grid gap-1.5 lg:gap-2 grid-cols-1 sm:grid-cols-2">
                  {disabledModules.map(([key]) => {
                    const info = MODULE_LABELS[key];
                    if (!info) return null;
                    return (
                      <div key={key} className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg bg-muted/50 border border-border opacity-60">
                        <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-xs lg:text-sm font-medium">{info.label}</p>
                          <p className="text-[10px] lg:text-xs text-muted-foreground hidden sm:block">{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {enabledModules.length === 0 && disabledModules.length === 0 && (
              <p className="text-xs lg:text-sm text-muted-foreground text-center py-3 lg:py-4">
                No permission data available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help & Support Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 lg:w-5 lg:h-5 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            Help & Support
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">Need assistance? Reach out to us anytime</CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <a
              href="https://wa.me/917001090471?text=Hi%2C%20I%20need%20help%20with%20my%20gym%20management%20software."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 lg:p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm lg:text-base font-semibold text-green-700 dark:text-green-400">Chat on WhatsApp</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">+91 7001090471</p>
              </div>
            </a>

            <a
              href="mailto:support@gymkloud.in?subject=Support%20Request%20-%20Gym%20Management"
              className="flex items-center gap-3 p-3 lg:p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="white" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm lg:text-base font-semibold text-blue-700 dark:text-blue-400">Send an Email</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">support@gymkloud.in</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
