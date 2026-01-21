import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { KeyIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

interface StaffCredentialsSectionProps {
  enableLogin: boolean;
  onEnableLoginChange: (enabled: boolean) => void;
  password: string;
  onPasswordChange: (password: string) => void;
}

const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const StaffCredentialsSection = ({
  enableLogin,
  onEnableLoginChange,
  password,
  onPasswordChange,
}: StaffCredentialsSectionProps) => {
  const [showPassword, setShowPassword] = useState(false);

  const handleGeneratePassword = () => {
    onPasswordChange(generatePassword());
  };

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-dashed">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyIcon className="w-4 h-4 text-muted-foreground" />
          <Label className="font-medium">Enable Login Access</Label>
        </div>
        <Switch checked={enableLogin} onCheckedChange={onEnableLoginChange} />
      </div>
      
      {enableLogin && (
        <div className="space-y-2 pt-2">
          <Label className="text-sm">Set Password</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Enter or generate password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGeneratePassword}
            >
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Staff can login using their phone number and this password
          </p>
        </div>
      )}
    </div>
  );
};
