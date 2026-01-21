import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { useBranch } from "@/contexts/BranchContext";

interface StaffWhatsAppButtonProps {
  staff: Staff;
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  showLabel?: boolean;
}

export const StaffWhatsAppButton = ({
  staff,
  variant = "outline",
  size = "sm",
  showLabel = false,
}: StaffWhatsAppButtonProps) => {
  const [isSending, setIsSending] = useState(false);
  const { currentBranch } = useBranch();

  const handleSendCredentials = async () => {
    if (!staff.phone) {
      toast.error("Staff phone number is required");
      return;
    }

    if (!staff.password_hash) {
      toast.error("Staff does not have login credentials set", {
        description: "Please set a password first before sending credentials via WhatsApp.",
      });
      return;
    }

    setIsSending(true);

    try {
      // Get branch names for this staff
      const branchNames = staff.branch_assignments?.map((a) => a.branch_name) || [];

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "staff_credentials",
          branchId: currentBranch?.id,
          branchName: currentBranch?.name,
          staffCredentials: {
            staffName: staff.full_name,
            staffPhone: staff.phone,
            role: staff.role,
            branches: branchNames,
            // Note: We don't send the actual password here since it's hashed
            // The message will just indicate credentials are set
          },
        },
      });

      if (error) throw error;

      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (response.success) {
        toast.success("Credentials sent via WhatsApp", {
          description: `Login details sent to ${staff.full_name}`,
        });
      } else {
        throw new Error(response.error || "Failed to send WhatsApp message");
      }
    } catch (error: any) {
      toast.error("Failed to send WhatsApp", { description: error.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleSendCredentials}
      disabled={isSending || !staff.password_hash}
      title={staff.password_hash ? "Send credentials via WhatsApp" : "Set password first to send credentials"}
      className="gap-1"
    >
      <span className="text-base">📱</span>
      {showLabel && (isSending ? "Sending..." : "WhatsApp")}
    </Button>
  );
};
