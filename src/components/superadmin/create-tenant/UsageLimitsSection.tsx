import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateTenantLimitsForm } from "./tenantCreationConfig";
import { usageLimitFields } from "./tenantCreationConfig";

interface UsageLimitsSectionProps {
  limits: CreateTenantLimitsForm;
  disabled?: boolean;
  onNumberChange: (key: keyof CreateTenantLimitsForm, value: number) => void;
  onDateChange: (value: string) => void;
}

export function UsageLimitsSection({ limits, disabled, onNumberChange, onDateChange }: UsageLimitsSectionProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Plan Limits</CardTitle>
        <CardDescription>
          Set quotas and optional expiry before creating the organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {usageLimitFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type="number"
                min={field.min}
                value={limits[field.key]}
                onChange={(e) => onNumberChange(field.key, Math.max(field.min, parseInt(e.target.value || "0", 10) || 0))}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">{field.helper}</p>
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="planExpiryDate">Plan Expiry Date</Label>
            <Input
              id="planExpiryDate"
              type="date"
              value={limits.planExpiryDate}
              onChange={(e) => onDateChange(e.target.value)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to create the organization without a fixed expiry date.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}