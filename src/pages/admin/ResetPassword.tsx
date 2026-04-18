import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { ValidatedInput } from "@/components/ui/validated-input";
import PoweredByBadge from "@/components/PoweredByBadge";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [done, setDone] = useState(false);

  const tokenHash = useMemo(() => searchParams.get("token_hash") || "", [searchParams]);
  const resetType = useMemo(() => searchParams.get("type") || "", [searchParams]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(true);
        setIsVerifying(false);
      }
    });

    const initializeRecovery = async () => {
      try {
        if (tokenHash && resetType === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });

          if (error) throw error;
          setHasRecoverySession(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setHasRecoverySession(true);
        }
      } catch (err: any) {
        toast.error("Invalid reset link", {
          description: err?.message || "This password reset link is invalid or has expired.",
        });
      } finally {
        setIsVerifying(false);
      }
    };

    void initializeRecovery();
    return () => sub.subscription.unsubscribe();
  }, [tokenHash, resetType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password too short", { description: "Use at least 6 characters." });
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match", { description: "Please re-enter the same password." });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated", { description: "You can now sign in with your new password." });
      await supabase.auth.signOut();
      setTimeout(() => navigate("/admin/login", { replace: true }), 1500);
    } catch (err: any) {
      toast.error("Couldn't update password", {
        description: err?.message || "The reset link may have expired. Request a new one.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 pb-16">
        <div className="w-full max-w-md">
          <Card className="border border-border/50 shadow-2xl shadow-foreground/5">
            <CardHeader className="text-center pb-4 pt-8">
              <div className="flex items-center justify-center mb-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-foreground shadow-lg">
                  <span className="text-background font-bold text-2xl tracking-tight select-none">GK</span>
                </div>
              </div>
              <CardTitle className="text-xl md:text-2xl font-semibold">Reset your password</CardTitle>
              <CardDescription>Open the secure GymKloud reset link and set a new password</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8">
              {done ? (
                <div className="flex flex-col items-center text-center gap-3 py-6">
                  <CheckCircle2 className="w-12 h-12 text-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Password updated. Redirecting to sign in…
                  </p>
                </div>
              ) : isVerifying ? (
                <div className="flex flex-col items-center text-center gap-3 py-6">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Verifying your secure reset link…</p>
                </div>
              ) : !hasRecoverySession ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This reset link is invalid or has expired.
                  </p>
                  <Button variant="outline" onClick={() => navigate("/admin/login")}>
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      New Password
                    </Label>
                    <div className="relative">
                      <ValidatedInput
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        className="pr-12"
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-3 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      Confirm Password
                    </Label>
                    <ValidatedInput
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={isLoading || !password || !confirmPassword}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        Updating...
                      </div>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <PoweredByBadge />
    </div>
  );
};

export default ResetPassword;
