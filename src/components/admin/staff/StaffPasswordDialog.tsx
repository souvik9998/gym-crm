import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useBranch } from "@/contexts/BranchContext";

interface StaffPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff | null;
  onSuccess: () => void;
}

// Generate a random password
const generatePassword = (length = 8): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const StaffPasswordDialog = ({
  open,
  onOpenChange,
  staff,
  onSuccess,
}: StaffPasswordDialogProps) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { currentBranch } = useBranch();

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    setPassword(newPassword);
    setShowPassword(true);
  };

  const sendCredentialsViaWhatsApp = async (staffData: Staff, plainPassword: string) => {
    try {
      const branchNames = staffData.branch_assignments?.map((a) => a.branch_name) || [];
      
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "staff_credentials",
          branchId: currentBranch?.id,
          branchName: currentBranch?.name,
          staffCredentials: {
            staffName: staffData.full_name,
            staffPhone: staffData.phone,
            password: plainPassword, // Send the plain password before it's hashed
            role: staffData.role,
            branches: branchNames,
          },
        },
      });

      if (error) throw error;

      const response = typeof data === "string" ? JSON.parse(data) : data;
      return response.success;
    } catch (error) {
      console.error("Failed to send WhatsApp:", error);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!staff) return;

    if (!password) {
      toast.error("Please enter a password");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("staff-auth?action=set-password", {
        body: {
          staffId: staff.id,
          password,
          sendWhatsApp: false, // We'll handle WhatsApp ourselves with the plain password
        },
      });

      if (error) throw error;

      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (!response.success) {
        throw new Error(response.error || "Failed to set password");
      }

      // Send WhatsApp with credentials if enabled (before we lose the plain password)
      let whatsAppSent = false;
      if (sendWhatsApp && staff.phone) {
        whatsAppSent = await sendCredentialsViaWhatsApp(staff, password);
      }

      toast.success("Password set successfully", {
        description: sendWhatsApp
          ? whatsAppSent
            ? "Login credentials sent via WhatsApp"
            : "Password set but WhatsApp delivery failed"
          : "Staff can now login with this password",
      });

      setPassword("");
      setShowPassword(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to set password", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {staff?.password_hash ? "Update Password" : "Set Password"}
          </DialogTitle>
          <DialogDescription>
            {staff?.password_hash
              ? `Update login password for ${staff?.full_name}`
              : `Create login credentials for ${staff?.full_name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Staff Details</Label>
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p><strong>Name:</strong> {staff?.full_name}</p>
              <p><strong>Phone:</strong> {staff?.phone}</p>
              <p><strong>Role:</strong> {staff?.role}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
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
                onClick={handleGeneratePassword}
              >
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 6 characters required
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="sendWhatsApp"
              checked={sendWhatsApp}
              onCheckedChange={(checked) => setSendWhatsApp(checked === true)}
            />
            <Label htmlFor="sendWhatsApp" className="text-sm cursor-pointer">
              Send login credentials via WhatsApp
            </Label>
          </div>

          {staff?.password_hash && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning-foreground">
              ⚠️ This staff member already has a password. Setting a new password will replace the existing one.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading
              ? "Setting Password..."
              : staff?.password_hash
              ? "Update Password"
              : "Set Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
