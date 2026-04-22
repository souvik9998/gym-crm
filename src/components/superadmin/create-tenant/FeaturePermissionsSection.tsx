import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TenantFeaturePermissions } from "@/contexts/AuthContext";
import { featureGroups } from "./tenantCreationConfig";

interface FeaturePermissionsSectionProps {
  features: TenantFeaturePermissions;
  disabled?: boolean;
  onToggle: (key: keyof TenantFeaturePermissions, checked: boolean) => void;
}

export function FeaturePermissionsSection({ features, disabled, onToggle }: FeaturePermissionsSectionProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <CardDescription>
          Choose exactly which modules the new organization can access from day one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {featureGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map(({ key, label, description }) => {
                const isAttendanceChild = key !== "attendance" && key.startsWith("attendance_");
                const attendanceDisabled = isAttendanceChild && !features.attendance;

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center justify-between rounded-lg border border-border p-3",
                      attendanceDisabled && "opacity-50"
                    )}
                  >
                    <div className="pr-4">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Switch
                      checked={features[key]}
                      onCheckedChange={(checked) => onToggle(key, checked)}
                      disabled={disabled || attendanceDisabled}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}