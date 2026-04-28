import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { PlatformQstashOverview } from "@/components/superadmin/PlatformQstashOverview";

interface PlatformSettings {
  id: string;
  maintenance_mode: boolean;
  allow_new_signups: boolean;
  default_branch_limit: number;
  default_member_limit: number;
  default_whatsapp_limit: number;
  default_staff_per_branch: number;
  default_trainers_limit: number;
  default_monthly_checkins: number;
  default_storage_mb: number;
}

export default function SuperAdminSettings() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    maintenanceMode: false,
    allowNewSignups: true,
    defaultBranchLimit: 3,
    defaultMemberLimit: 1000,
    defaultWhatsAppLimit: 500,
    defaultStaffPerBranch: 10,
    defaultTrainersLimit: 20,
    defaultMonthlyCheckins: 10000,
    defaultStorageMb: 500,
  });

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  // Load settings from database
  useEffect(() => {
    if (!isSuperAdmin) return;

    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings" as any)
          .select("*")
          .limit(1)
          .single();

        if (error) throw error;

        if (data) {
          const row = data as any as PlatformSettings;
          setSettingsId(row.id);
          setSettings({
            maintenanceMode: row.maintenance_mode,
            allowNewSignups: row.allow_new_signups,
            defaultBranchLimit: row.default_branch_limit,
            defaultMemberLimit: row.default_member_limit,
            defaultWhatsAppLimit: row.default_whatsapp_limit,
            defaultStaffPerBranch: row.default_staff_per_branch,
            defaultTrainersLimit: row.default_trainers_limit,
            defaultMonthlyCheckins: row.default_monthly_checkins,
            defaultStorageMb: row.default_storage_mb,
          });
        }
      } catch (error) {
        console.error("Error loading platform settings:", error);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, [isSuperAdmin]);

  const handleSave = async () => {
    if (!settingsId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("platform_settings" as any)
        .update({
          maintenance_mode: settings.maintenanceMode,
          allow_new_signups: settings.allowNewSignups,
          default_branch_limit: settings.defaultBranchLimit,
          default_member_limit: settings.defaultMemberLimit,
          default_whatsapp_limit: settings.defaultWhatsAppLimit,
          default_staff_per_branch: settings.defaultStaffPerBranch,
          default_trainers_limit: settings.defaultTrainersLimit,
          default_monthly_checkins: settings.defaultMonthlyCheckins,
          default_storage_mb: settings.defaultStorageMb,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settingsId);

      if (error) throw error;
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (roleLoading || isLoadingSettings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure global platform settings and defaults
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cog6ToothIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Platform-wide configuration options</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">
                Disable access to all tenants temporarily
              </p>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, maintenanceMode: checked }))
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow New Signups</Label>
              <p className="text-sm text-muted-foreground">
                Allow new organizations to be created
              </p>
            </div>
            <Switch
              checked={settings.allowNewSignups}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, allowNewSignups: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Default Limits for New Organizations</CardTitle>
          <CardDescription>
            These limits will be applied when creating new organizations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Default Branch Limit</Label>
              <Input
                type="number"
                value={settings.defaultBranchLimit}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultBranchLimit: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Member Limit</Label>
              <Input
                type="number"
                value={settings.defaultMemberLimit}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultMemberLimit: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Default WhatsApp Limit</Label>
              <Input
                type="number"
                value={settings.defaultWhatsAppLimit}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultWhatsAppLimit: parseInt(e.target.value) || 0,
                  }))
                }
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Staff per Branch</Label>
              <Input
                type="number"
                value={settings.defaultStaffPerBranch}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultStaffPerBranch: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Trainers Limit</Label>
              <Input
                type="number"
                value={settings.defaultTrainersLimit}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultTrainersLimit: parseInt(e.target.value) || 0,
                  }))
                }
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Monthly Check-ins</Label>
              <Input
                type="number"
                value={settings.defaultMonthlyCheckins}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultMonthlyCheckins: parseInt(e.target.value) || 0,
                  }))
                }
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Storage (MB)</Label>
              <Input
                type="number"
                value={settings.defaultStorageMb}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultStorageMb: parseInt(e.target.value) || 0,
                  }))
                }
                min={0}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <PlatformQstashOverview />
    </div>
  );
}
