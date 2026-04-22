import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { createTenant } from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FeaturePermissionsSection } from "@/components/superadmin/create-tenant/FeaturePermissionsSection";
import { UsageLimitsSection } from "@/components/superadmin/create-tenant/UsageLimitsSection";
import {
  defaultTenantFeatures,
  defaultTenantLimits,
  type CreateTenantLimitsForm,
} from "@/components/superadmin/create-tenant/tenantCreationConfig";
import type { TenantFeaturePermissions } from "@/contexts/AuthContext";
import { ArrowLeftIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { toast } from "sonner";

export default function CreateTenant() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    phone: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [limits, setLimits] = useState<CreateTenantLimitsForm>(defaultTenantLimits);
  const [features, setFeatures] = useState<TenantFeaturePermissions>(defaultTenantFeatures);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData((prev) => ({ ...prev, name, slug }));
  };

  const handleLimitNumberChange = (key: keyof CreateTenantLimitsForm, value: number) => {
    setLimits((prev) => ({ ...prev, [key]: value }));
  };

  const handleFeatureToggle = (key: keyof TenantFeaturePermissions, checked: boolean) => {
    setFeatures((prev) => {
      if (key === "attendance") {
        return {
          ...prev,
          attendance: checked,
          attendance_manual: checked ? prev.attendance_manual : false,
          attendance_qr: checked ? prev.attendance_qr : false,
          attendance_biometric: checked ? prev.attendance_biometric : false,
        };
      }

      return {
        ...prev,
        [key]: checked,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.slug || !formData.ownerEmail || !formData.ownerPassword) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (formData.ownerPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTenant({
        name: formData.name,
        slug: formData.slug,
        email: formData.ownerEmail,
        phone: formData.phone || undefined,
        ownerEmail: formData.ownerEmail,
        ownerPassword: formData.ownerPassword,
        limits: {
          max_branches: limits.maxBranches,
          max_staff_per_branch: limits.maxStaffPerBranch,
          max_members: limits.maxMembers,
          max_trainers: limits.maxTrainers,
          max_monthly_whatsapp_messages: limits.maxWhatsApp,
          max_monthly_checkins: limits.maxMonthlyCheckins,
          max_storage_mb: limits.maxStorageMb,
          plan_expiry_date: limits.planExpiryDate || null,
        },
        features,
      });

      toast.success(`Organization "${formData.name}" created successfully!`);
      navigate(`/superadmin/tenants/${result.tenant.id}`);
    } catch (error: any) {
      console.error("Error creating tenant:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/superadmin/tenants")}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create Organization</h1>
          <p className="text-sm text-muted-foreground">
            Set permissions, plan expiry, and resource limits before onboarding a new gym.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BuildingOffice2Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Basic information and owner access for the new gym.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="Pro Plus Fitness"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug *</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  placeholder="pro-plus-fitness"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used in URLs: /org/{formData.slug || "slug"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Phone (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provisioningSummary">Provisioning Summary</Label>
                <div
                  id="provisioningSummary"
                  className="min-h-10 rounded-md border border-border bg-muted/30 px-3 py-2 flex flex-wrap gap-2 items-center"
                >
                  <Badge variant="secondary">{limits.maxBranches} branches</Badge>
                  <Badge variant="secondary">{limits.maxMembers} members</Badge>
                  <Badge variant="secondary">{Object.values(features).filter(Boolean).length} modules on</Badge>
                  {limits.planExpiryDate ? <Badge variant="outline">Expires {limits.planExpiryDate}</Badge> : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Owner Login Credentials</h2>
                <p className="text-sm text-muted-foreground">
                  These credentials will be used by the gym owner to access the admin dashboard.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ownerEmail">Login Email *</Label>
                  <Input
                    id="ownerEmail"
                    name="ownerEmail"
                    type="email"
                    value={formData.ownerEmail}
                    onChange={handleInputChange}
                    placeholder="owner@gym.com"
                    required
                  />
                  <p className="text-xs text-muted-foreground">The gym owner will use this email to log in.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerPassword">Password *</Label>
                  <Input
                    id="ownerPassword"
                    name="ownerPassword"
                    type="password"
                    value={formData.ownerPassword}
                    onChange={handleInputChange}
                    placeholder="Min 6 characters"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Share this password securely with the gym owner.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <UsageLimitsSection
          limits={limits}
          disabled={isSubmitting}
          onNumberChange={handleLimitNumberChange}
          onDateChange={(value) => setLimits((prev) => ({ ...prev, planExpiryDate: value }))}
        />

        <FeaturePermissionsSection
          features={features}
          disabled={isSubmitting}
          onToggle={handleFeatureToggle}
        />

        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/superadmin/tenants")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Organization"}
          </Button>
        </div>
      </form>
    </div>
  );
}
