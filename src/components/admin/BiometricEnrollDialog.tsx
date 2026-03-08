import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchBiometricDevices, createEnrollmentRequest } from "@/api/biometric";
import type { BiometricDevice } from "@/api/biometric";
import {
  Fingerprint,
  CreditCard,
  ScanFace,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Phone,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BiometricEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  memberPhone: string;
  branchId: string;
}

type EnrollmentType = "fingerprint" | "rfid" | "face";
type EnrollmentStatus = "idle" | "pending" | "in_progress" | "completed" | "failed" | "timeout";

const enrollmentTypes: { value: EnrollmentType; label: string; icon: React.ReactNode; available: boolean }[] = [
  { value: "fingerprint", label: "Fingerprint", icon: <Fingerprint className="w-4 h-4" />, available: true },
  { value: "rfid", label: "RFID Card", icon: <CreditCard className="w-4 h-4" />, available: true },
  { value: "face", label: "Face", icon: <ScanFace className="w-4 h-4" />, available: false },
];

const statusMessages: Record<EnrollmentStatus, { text: string; color: string }> = {
  idle: { text: "Select a device and enrollment type to begin", color: "text-muted-foreground" },
  pending: { text: "Waiting for device to respond...", color: "text-amber-500" },
  in_progress: { text: "Place finger on device or tap RFID card...", color: "text-primary" },
  completed: { text: "Enrollment successful!", color: "text-emerald-500" },
  failed: { text: "Enrollment failed", color: "text-destructive" },
  timeout: { text: "Enrollment timed out — device did not respond", color: "text-destructive" },
};

export function BiometricEnrollDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  memberPhone,
  branchId,
}: BiometricEnrollDialogProps) {
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>("fingerprint");
  const [status, setStatus] = useState<EnrollmentStatus>("idle");
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // Load devices when dialog opens
  useEffect(() => {
    if (open && branchId) {
      setLoadingDevices(true);
      fetchBiometricDevices(branchId)
        .then((d) => {
          setDevices(d);
          if (d.length === 1) setSelectedDevice(d[0].id);
        })
        .catch(() => toast.error("Failed to load devices"))
        .finally(() => setLoadingDevices(false));
    }
  }, [open, branchId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setEnrollmentId(null);
      setErrorMessage("");
      setProgress(0);
      setSelectedDevice("");
      setEnrollmentType("fingerprint");
    }
  }, [open]);

  // Subscribe to realtime updates on enrollment request
  useEffect(() => {
    if (!enrollmentId || !open) return;

    const channel = supabase
      .channel(`enrollment-${enrollmentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "biometric_enrollment_requests",
          filter: `id=eq.${enrollmentId}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.status as EnrollmentStatus;
          if (newStatus) {
            setStatus(newStatus);
            if (newStatus === "failed") {
              setErrorMessage(payload.new?.error_message || "Unknown error");
            }
            if (newStatus === "completed") {
              setProgress(100);
              toast.success("Biometric enrolled successfully!", {
                description: `${memberName} is now enrolled`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enrollmentId, open, memberName]);

  // Progress animation for pending/in_progress
  useEffect(() => {
    if (status !== "pending" && status !== "in_progress") return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + (status === "in_progress" ? 2 : 1);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  // Timeout handler
  useEffect(() => {
    if (status !== "pending" && status !== "in_progress") return;

    const timeout = setTimeout(() => {
      if (status === "pending" || status === "in_progress") {
        setStatus("timeout");
      }
    }, 120000); // 2 minutes

    return () => clearTimeout(timeout);
  }, [status]);

  const handleStartEnrollment = useCallback(async () => {
    if (!selectedDevice || !memberId || !branchId) return;

    setLoading(true);
    setStatus("pending");
    setProgress(0);
    setErrorMessage("");

    try {
      const result = await createEnrollmentRequest(branchId, memberId, selectedDevice, enrollmentType);
      setEnrollmentId(result.enrollment_id);
    } catch (err: any) {
      setStatus("failed");
      setErrorMessage(err.message);
      toast.error("Failed to start enrollment", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, memberId, branchId, enrollmentType]);

  const isActive = status === "pending" || status === "in_progress";
  const isDone = status === "completed" || status === "failed" || status === "timeout";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isActive) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-primary" />
            Enroll Biometric
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Member Info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{memberName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" />
                +91 {memberPhone}
              </p>
            </div>
          </div>

          {/* Enrollment Type Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enrollment Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {enrollmentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => !isActive && type.available && setEnrollmentType(type.value)}
                  disabled={isActive || !type.available}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200",
                    "hover:shadow-sm active:scale-[0.97]",
                    enrollmentType === type.value && type.available
                      ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                      : type.available
                        ? "bg-card border-border/40 text-muted-foreground hover:border-border"
                        : "bg-muted/20 border-border/20 text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {type.icon}
                  <span className="text-xs font-medium">{type.label}</span>
                  {!type.available && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0">Soon</Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Device Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select Device</Label>
            {loadingDevices ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading devices...
              </div>
            ) : devices.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground rounded-lg bg-muted/30 border border-border/30">
                <Wifi className="w-4 h-4 inline mr-1.5" />
                No biometric devices configured for this branch
              </div>
            ) : (
              <Select
                value={selectedDevice}
                onValueChange={setSelectedDevice}
                disabled={isActive}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose a device..." />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{device.device_name}</span>
                        <span className="text-xs text-muted-foreground">({device.device_serial})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Status Display */}
          {status !== "idle" && (
            <div className={cn(
              "p-4 rounded-xl border transition-all duration-300 animate-fade-in",
              status === "completed" ? "bg-emerald-500/5 border-emerald-500/20" :
              status === "failed" || status === "timeout" ? "bg-destructive/5 border-destructive/20" :
              "bg-primary/5 border-primary/20"
            )}>
              <div className="flex items-center gap-3 mb-3">
                {isActive && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                {status === "completed" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {(status === "failed" || status === "timeout") && <XCircle className="w-5 h-5 text-destructive" />}
                <span className={cn("text-sm font-medium", statusMessages[status].color)}>
                  {statusMessages[status].text}
                </span>
              </div>

              {isActive && (
                <Progress value={progress} className="h-1.5" />
              )}

              {errorMessage && (status === "failed" || status === "timeout") && (
                <p className="text-xs text-muted-foreground mt-2">{errorMessage}</p>
              )}
            </div>
          )}

          {/* Instructions */}
          {status === "idle" && selectedDevice && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Instructions:</p>
              {enrollmentType === "fingerprint" && (
                <p>Ask the member to place their finger on the biometric device when prompted.</p>
              )}
              {enrollmentType === "rfid" && (
                <p>Ask the member to tap their RFID card on the device when prompted.</p>
              )}
              {enrollmentType === "face" && (
                <p>Ask the member to look at the device camera when prompted.</p>
              )}
              <p className="text-muted-foreground/70">The local sync agent must be running on the gym computer.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!isDone && (
              <Button
                onClick={handleStartEnrollment}
                disabled={!selectedDevice || loading || isActive || devices.length === 0}
                className="flex-1 h-11 gap-2 transition-all duration-200 active:scale-[0.97]"
              >
                {loading || isActive ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {status === "pending" ? "Waiting..." : "Enrolling..."}
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    Start Enrollment
                  </>
                )}
              </Button>
            )}

            {isDone && (
              <>
                {(status === "failed" || status === "timeout") && (
                  <Button
                    onClick={() => {
                      setStatus("idle");
                      setEnrollmentId(null);
                      setErrorMessage("");
                      setProgress(0);
                    }}
                    variant="outline"
                    className="flex-1 h-11 gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    Try Again
                  </Button>
                )}
                <Button
                  onClick={() => onOpenChange(false)}
                  variant={status === "completed" ? "default" : "outline"}
                  className="flex-1 h-11 gap-2"
                >
                  {status === "completed" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Done
                    </>
                  ) : (
                    "Close"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
