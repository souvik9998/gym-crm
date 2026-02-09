import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { toast } from "sonner";
import { format } from "date-fns";
import { ShieldCheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface RazorpayCredentialsTabProps {
  tenantId: string;
}

interface RazorpayStatus {
  isConnected: boolean;
  maskedKeyId: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
}

export default function RazorpayCredentialsTab({ tenantId }: RazorpayCredentialsTabProps) {
  const [status, setStatus] = useState<RazorpayStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${getEdgeFunctionUrl("tenant-operations")}?action=get-razorpay-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ tenantId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch status");
      }

      const result = await response.json();
      setStatus(result.data);
    } catch (error) {
      console.error("Error fetching Razorpay status:", error);
      setStatus({ isConnected: false, maskedKeyId: null, isVerified: false, verifiedAt: null });
    } finally {
      setIsLoadingStatus(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSave = async () => {
    if (!keyId.trim() || !keySecret.trim()) {
      toast.error("Both Key ID and Key Secret are required");
      return;
    }

    if (!keyId.startsWith("rzp_")) {
      toast.error("Invalid Key ID format - should start with 'rzp_'");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${getEdgeFunctionUrl("tenant-operations")}?action=save-razorpay-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            tenantId,
            keyId: keyId.trim(),
            keySecret: keySecret.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to save credentials");
      }

      toast.success("Razorpay credentials verified and saved successfully");
      setKeyId("");
      setKeySecret("");
      await fetchStatus();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Failed to save credentials";
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${getEdgeFunctionUrl("tenant-operations")}?action=remove-razorpay-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ tenantId }),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to disconnect");
      }

      toast.success("Razorpay credentials removed");
      setDisconnectDialogOpen(false);
      await fetchStatus();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Failed to disconnect";
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingStatus) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5" />
            Razorpay Payment Gateway
          </CardTitle>
          <CardDescription>
            Configure Razorpay credentials for this organization's online payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                {status?.isConnected ? (
                  <Badge className="bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Not Connected</Badge>
                )}
              </div>
              {status?.isConnected && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Key ID: <code className="bg-muted px-1 rounded">{status.maskedKeyId}</code>
                  </p>
                  {status.verifiedAt && (
                    <p className="text-sm text-muted-foreground">
                      Verified: {format(new Date(status.verifiedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </>
              )}
            </div>
            {status?.isConnected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDisconnectDialogOpen(true)}
              >
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configure Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>
            {status?.isConnected ? "Update Credentials" : "Connect Razorpay"}
          </CardTitle>
          <CardDescription>
            {status?.isConnected
              ? "Enter new credentials to replace the current ones. They will be verified before saving."
              : "Enter your Razorpay API credentials. They will be verified by creating a test order before saving."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Credentials are encrypted at rest and never visible after saving. Only Super Admins can manage them.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="razorpay-key-id">Razorpay Key ID</Label>
              <Input
                id="razorpay-key-id"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="rzp_live_xxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razorpay-key-secret">Razorpay Key Secret</Label>
              <Input
                id="razorpay-key-secret"
                type="password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder="Enter key secret"
                autoComplete="new-password"
              />
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving || !keyId.trim() || !keySecret.trim()}
            >
              {isSaving ? "Verifying & Saving..." : "Verify & Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Disconnect Dialog */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Razorpay</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Razorpay credentials and disable online payments for all branches of this organization. Members will not be able to pay online until new credentials are configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isSaving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSaving ? "Removing..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
