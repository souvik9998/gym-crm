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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Staff } from "@/pages/admin/StaffManagement";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";

interface ChangePhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff | null;
  branchId?: string;
  branchName?: string;
  onSuccess: () => void;
}

const cleanPhoneNumber = (raw: string) =>
  raw.replace(/\D/g, "").replace(/^0/, "").slice(-10);

const formatPhoneForWA = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const ChangePhoneDialog = ({
  open,
  onOpenChange,
  staff,
  branchId,
  branchName,
  onSuccess,
}: ChangePhoneDialogProps) => {
  const [newPhone, setNewPhone] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    setNewPhone("");
    setNotifyWhatsApp(true);
    onOpenChange(false);
  };

  const sendNotification = async (toPhone: string, message: string) => {
    try {
      await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "custom",
          phone: toPhone,
          name: staff?.full_name || "Staff",
          customMessage: message,
          branchId: branchId || null,
          branchName: branchName || null,
        },
      });
    } catch (err) {
      console.error("Phone-change WhatsApp failed:", err);
    }
  };

  const handleSave = async () => {
    if (!staff) return;
    const cleaned = cleanPhoneNumber(newPhone);

    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      toast.error("Enter a valid 10-digit Indian mobile number");
      return;
    }
    if (cleaned === staff.phone) {
      toast.error("New number must be different from current");
      return;
    }

    setIsSaving(true);
    try {
      const oldPhone = staff.phone;

      // Call edge function — keeps auth.users email in sync with phone, otherwise login breaks.
      const { data, error: fnErr } = await supabase.functions.invoke("staff-auth", {
        body: {
          action: "change-phone",
          staffId: staff.id,
          newPhone: cleaned,
        },
      });

      if (fnErr || (data && data.success === false)) {
        const msg = (data && (data.error || data.message)) || fnErr?.message || "Update failed";
        toast.error("Failed to update mobile number", { description: msg });
        return;
      }

      await logAdminActivity({
        category: "staff",
        type: "staff_updated",
        description: `Changed mobile number for "${staff.full_name}" (${oldPhone} → ${cleaned})`,
        entityType: "staff",
        entityId: staff.id,
        entityName: staff.full_name,
        oldValue: { phone: oldPhone },
        newValue: { phone: cleaned },
        branchId,
      });

      // Send WhatsApp notifications to both numbers
      if (notifyWhatsApp) {
        const gym = branchName || "the gym";
        const oldMsg =
          `📱 *Mobile Number Updated*\n\n` +
          `Hi ${staff.full_name},\n\n` +
          `This is a notice that your registered mobile number at *${gym}* has been changed.\n\n` +
          `• Previous: ${oldPhone}\n` +
          `• New: ${cleaned}\n\n` +
          `If you did NOT request this change, please contact the gym immediately.\n\n` +
          `— Team ${gym}`;

        const newMsg =
          `✅ *Mobile Number Confirmed*\n\n` +
          `Hi ${staff.full_name},\n\n` +
          `Your new mobile number has been registered at *${gym}*.\n\n` +
          `Please use this number for all future logins and communication.\n\n` +
          `— Team ${gym}`;

        if (oldPhone) await sendNotification(formatPhoneForWA(oldPhone), oldMsg);
        await sendNotification(formatPhoneForWA(cleaned), newMsg);
      }

      toast.success("Mobile number updated", {
        description: notifyWhatsApp ? "WhatsApp notifications sent" : undefined,
      });
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast.error("Failed to update mobile number", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Mobile Number</DialogTitle>
          <DialogDescription>
            Update the registered mobile number for {staff?.full_name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted border border-border">
            <ExclamationTriangleIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Mobile number is used for login and communication. This is a sensitive
              change — verify the new number with the staff member before saving.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Current Number</Label>
            <Input value={staff?.phone || ""} disabled className="h-10" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">New Mobile Number *</Label>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="10-digit number"
              inputMode="numeric"
              maxLength={10}
              className="h-10"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="notifyWA"
              checked={notifyWhatsApp}
              onCheckedChange={(c) => setNotifyWhatsApp(c === true)}
            />
            <Label htmlFor="notifyWA" className="text-sm cursor-pointer">
              Notify on WhatsApp (sent to both old and new numbers)
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !newPhone}>
            {isSaving ? "Saving..." : "Update Number"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
