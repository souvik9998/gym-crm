import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircleIcon, XCircleIcon, ClockIcon, ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  memberCheckIn,
  staffCheckIn,
  getDeviceUUID,
  createDeviceUUID,
} from "@/api/attendance";
import { supabase } from "@/integrations/supabase/client";

type CheckInStatus = "loading" | "login" | "success" | "checked_out" | "expired" | "duplicate" | "device_mismatch" | "not_found" | "error";

const CheckIn = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const branchId = searchParams.get("branch_id") || "";

  const [status, setStatus] = useState<CheckInStatus>("loading");
  const [message, setMessage] = useState("");
  const [userName, setUserName] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const processResult = useCallback((result: any) => {
    setUserName(result.name || result.member_name || "");
    setCheckInTime(result.check_in_at || "");
    setCheckOutTime(result.check_out_at || "");
    setTotalHours(result.total_hours || null);
    setMessage(result.message || "");

    switch (result.status) {
      case "checked_in":
        setStatus("success");
        break;
      case "checked_out":
        setStatus("checked_out");
        break;
      case "expired":
        setStatus("expired");
        if (result.redirect) setRedirectUrl(result.redirect);
        break;
      case "duplicate":
        setStatus("duplicate");
        break;
      case "device_mismatch":
        setStatus("device_mismatch");
        break;
      case "not_found":
        setStatus("not_found");
        break;
      case "login_required":
        setStatus("login");
        break;
      default:
        setStatus("error");
    }
  }, []);

  // Auto check-in on mount - detect staff vs member
  useEffect(() => {
    if (!branchId) {
      setStatus("error");
      setMessage("Invalid QR code. No branch specified.");
      return;
    }

    const attemptCheckIn = async () => {
      // Check if a staff member is logged in (Supabase Auth session with staff_*@gym.local)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email?.startsWith("staff_") && session.user.email.endsWith("@gym.local")) {
          // Staff user detected - use authenticated staff check-in
          const result = await staffCheckIn(branchId);
          processResult(result);
          return;
        }
      } catch {
        // Not staff or session check failed - continue with member flow
      }

      // Member flow: check for existing device UUID
      const existingUUID = getDeviceUUID();
      if (existingUUID) {
        try {
          const result = await memberCheckIn({ branchId, deviceFingerprint: existingUUID });
          processResult(result);
        } catch {
          setStatus("login");
        }
      } else {
        setStatus("login");
      }
    };

    attemptCheckIn();
  }, [branchId, processResult]);

  // Auto-redirect for expired members
  useEffect(() => {
    if (status === "expired" && redirectUrl) {
      const timer = setTimeout(() => navigate(redirectUrl), 4000);
      return () => clearTimeout(timer);
    }
  }, [status, redirectUrl, navigate]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) return;

    setIsSubmitting(true);
    try {
      // Generate a new UUID for first-time registration
      const deviceId = createDeviceUUID();
      const result = await memberCheckIn({ phone, branchId, deviceFingerprint: deviceId });
      processResult(result);
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (isoStr: string) => {
    if (!isoStr) return "";
    return new Date(isoStr).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (!branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm border-destructive">
          <CardContent className="pt-6 text-center">
            <XCircleIcon className="w-16 h-16 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold">Invalid QR Code</p>
            <p className="text-muted-foreground mt-2">This QR code is not valid. Please scan the correct attendance QR at your gym.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Loading */}
        {status === "loading" && (
          <Card>
            <CardContent className="pt-6 text-center">
              <ArrowPathIcon className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-lg font-medium">Marking attendance...</p>
            </CardContent>
          </Card>
        )}

        {/* Login Form */}
        {(status === "login" || status === "not_found") && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <ClockIcon className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Gym Attendance</CardTitle>
              <p className="text-sm text-muted-foreground">Enter your registered phone number</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <Input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                  className="text-center text-lg tracking-wider"
                  autoFocus
                />
                {status === "not_found" && (
                  <p className="text-destructive text-sm text-center">{message}</p>
                )}
                <Button type="submit" className="w-full" disabled={phone.length < 10 || isSubmitting}>
                  {isSubmitting ? "Checking..." : "Mark Attendance"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Success - Checked In */}
        {status === "success" && (
          <Card className="border-green-500/30">
            <CardContent className="pt-6 text-center">
              <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <p className="text-2xl font-bold text-green-600">Checked In!</p>
              <p className="text-lg mt-2">Welcome, {userName} 👋</p>
              <p className="text-muted-foreground mt-1">{formatTime(checkInTime)}</p>
              <p className="text-sm text-muted-foreground mt-4">Scan again when you leave to check out.</p>
            </CardContent>
          </Card>
        )}

        {/* Checked Out */}
        {status === "checked_out" && (
          <Card className="border-blue-500/30">
            <CardContent className="pt-6 text-center">
              <CheckCircleIcon className="w-20 h-20 text-blue-500 mx-auto mb-4" />
              <p className="text-2xl font-bold text-blue-600">Checked Out!</p>
              <p className="text-lg mt-2">See you next time, {userName}! 👋</p>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>In: {formatTime(checkInTime)} → Out: {formatTime(checkOutTime)}</p>
                {totalHours && <p className="font-medium text-foreground">Total: {totalHours} hours</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expired */}
        {status === "expired" && (
          <Card className="border-orange-500/30">
            <CardContent className="pt-6 text-center">
              <ExclamationTriangleIcon className="w-20 h-20 text-orange-500 mx-auto mb-4" />
              <p className="text-2xl font-bold text-orange-600">Membership Expired</p>
              <p className="text-lg mt-2">{userName}</p>
              <p className="text-muted-foreground mt-2">{message}</p>
              <p className="text-sm text-muted-foreground mt-4">Redirecting to renewal page...</p>
            </CardContent>
          </Card>
        )}

        {/* Duplicate */}
        {status === "duplicate" && (
          <Card className="border-yellow-500/30">
            <CardContent className="pt-6 text-center">
              <ClockIcon className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-yellow-600">Too Soon!</p>
              <p className="text-muted-foreground mt-2">{message}</p>
            </CardContent>
          </Card>
        )}

        {/* Device Mismatch */}
        {status === "device_mismatch" && (
          <Card className="border-destructive/30">
            <CardContent className="pt-6 text-center">
              <XCircleIcon className="w-16 h-16 text-destructive mx-auto mb-4" />
              <p className="text-lg font-semibold text-destructive">Device Not Recognized</p>
              <p className="text-muted-foreground mt-2">{message}</p>
              <p className="text-sm text-muted-foreground mt-4">Please contact the gym admin to reset your device registration.</p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {status === "error" && (
          <Card className="border-destructive/30">
            <CardContent className="pt-6 text-center">
              <XCircleIcon className="w-16 h-16 text-destructive mx-auto mb-4" />
              <p className="text-lg font-semibold">Error</p>
              <p className="text-muted-foreground mt-2">{message || "Something went wrong."}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CheckIn;
