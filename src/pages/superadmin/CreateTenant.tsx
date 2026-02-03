import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { createTenant } from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { toast } from "sonner";

export default function CreateTenant() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    phone: "",
    ownerEmail: "",
    ownerPassword: "",
    maxBranches: 3,
    maxStaffPerBranch: 10,
    maxMembers: 1000,
    maxTrainers: 20,
    maxWhatsApp: 500,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseInt(value) || 0 : value,
    }));
  };

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData((prev) => ({ ...prev, name, slug }));
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
        email: formData.ownerEmail, // Use owner email as contact email
        phone: formData.phone || undefined,
        ownerEmail: formData.ownerEmail,
        ownerPassword: formData.ownerPassword,
        limits: {
          max_branches: formData.maxBranches,
          max_staff_per_branch: formData.maxStaffPerBranch,
          max_members: formData.maxMembers,
          max_trainers: formData.maxTrainers,
          max_monthly_whatsapp_messages: formData.maxWhatsApp,
        },
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
    navigate("/admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                Set up a new gym organization on the platform
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Details */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BuildingOffice2Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Organization Details</CardTitle>
                  <CardDescription>Basic information about the gym</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Owner Login Credentials */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Owner Login Credentials</CardTitle>
              <CardDescription>
                These credentials will be used by the gym owner to access their admin dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <p className="text-xs text-muted-foreground">
                    The gym owner will use this email to log in
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Share this password with the gym owner
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resource Limits */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Resource Limits</CardTitle>
              <CardDescription>
                Set usage limits for this organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxBranches">Max Branches</Label>
                  <Input
                    id="maxBranches"
                    name="maxBranches"
                    type="number"
                    value={formData.maxBranches}
                    onChange={handleInputChange}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxStaffPerBranch">Staff per Branch</Label>
                  <Input
                    id="maxStaffPerBranch"
                    name="maxStaffPerBranch"
                    type="number"
                    value={formData.maxStaffPerBranch}
                    onChange={handleInputChange}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxMembers">Max Members</Label>
                  <Input
                    id="maxMembers"
                    name="maxMembers"
                    type="number"
                    value={formData.maxMembers}
                    onChange={handleInputChange}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTrainers">Max Trainers</Label>
                  <Input
                    id="maxTrainers"
                    name="maxTrainers"
                    type="number"
                    value={formData.maxTrainers}
                    onChange={handleInputChange}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxWhatsApp">Monthly WhatsApp</Label>
                  <Input
                    id="maxWhatsApp"
                    name="maxWhatsApp"
                    type="number"
                    value={formData.maxWhatsApp}
                    onChange={handleInputChange}
                    min={0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
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
      </main>
    </div>
  );
}
