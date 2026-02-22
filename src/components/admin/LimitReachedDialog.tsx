import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Phone, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LimitReachedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: string;
  currentCount: number;
  maxCount: number;
}

export function LimitReachedDialog({
  open,
  onOpenChange,
  resourceType,
  currentCount,
  maxCount,
}: LimitReachedDialogProps) {
  const navigate = useNavigate();
  const [adminContact, setAdminContact] = useState<{ phone?: string; email?: string } | null>(null);

  useEffect(() => {
    if (open) {
      fetchAdminContact();
    }
  }, [open]);

  const fetchAdminContact = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: membership } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.tenant_id) return;

      const { data: tenant } = await supabase
        .from("tenants")
        .select("phone, email")
        .eq("id", membership.tenant_id)
        .single();

      if (tenant) {
        setAdminContact({ phone: tenant.phone ?? undefined, email: tenant.email ?? undefined });
      }
    } catch {
      // silently fail
    }
  };

  const handleContactAdmin = () => {
    if (adminContact?.phone) {
      window.open(`https://wa.me/91${adminContact.phone}`, "_blank");
    } else if (adminContact?.email) {
      window.open(`mailto:${adminContact.email}`, "_blank");
    } else {
      window.open(`mailto:support@example.com`, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {resourceType} Limit Reached
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentCount}/{maxCount} used
              </p>
            </div>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            You've reached the maximum of <strong>{maxCount} {resourceType.toLowerCase()}</strong> allowed
            on your current plan. To add more, you can upgrade your plan or contact the platform administrator.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-muted/80"
            onClick={handleContactAdmin}
          >
            <Phone className="h-5 w-5 text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">Contact Admin</p>
              <p className="text-[10px] text-muted-foreground">Get help upgrading</p>
            </div>
          </Button>
          <Button
            className="flex flex-col items-center gap-2 h-auto py-4"
            onClick={() => {
              onOpenChange(false);
              navigate("/admin/settings?tab=plan");
            }}
          >
            <CreditCard className="h-5 w-5" />
            <div className="text-center">
              <p className="text-sm font-medium">View Plan</p>
              <p className="text-[10px] opacity-80">See usage & limits</p>
            </div>
          </Button>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
