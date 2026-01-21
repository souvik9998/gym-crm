import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { useBranch } from "@/contexts/BranchContext";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

interface StaffWhatsAppButtonProps {
  staff: Staff;
  password?: string; // Plain password to send (optional - if provided, sends with password)
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  showLabel?: boolean;
}

export const StaffWhatsAppButton = ({
  staff,
  password,
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

    // Only require password_hash if we're not providing a password directly
    if (!password && !staff.password_hash) {
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
            password: password, // Include plain password if provided
            role: staff.role,
            branches: branchNames,
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

  // Can send if we have a password OR if staff already has credentials set
  const canSend = !!(password || staff.password_hash);

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleSendCredentials}
      disabled={isSending || !canSend}
      title={canSend ? "Send credentials via WhatsApp" : "Set password first to send credentials"}
      className="gap-1"
    >
      <ChatBubbleLeftRightIcon className="w-4 h-4" />
      {showLabel && (isSending ? "Sending..." : "WhatsApp")}
    </Button>
  );
};

// Helper function to send staff credentials via WhatsApp
export const sendStaffCredentialsWhatsApp = async (
  staff: { full_name: string; phone: string; role: string },
  password: string,
  branchId?: string,
  branchName?: string,
  branchNames?: string[]
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        type: "staff_credentials",
        branchId,
        branchName,
        staffCredentials: {
          staffName: staff.full_name,
          staffPhone: staff.phone,
          password,
          role: staff.role,
          branches: branchNames,
        },
      },
    });

    if (error) throw error;

    const response = typeof data === "string" ? JSON.parse(data) : data;
    return response.success;
  } catch (error) {
    console.error("Failed to send staff credentials WhatsApp:", error);
    return false;
  }
};
