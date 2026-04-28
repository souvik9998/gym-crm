import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBranchSlug } from "@/hooks/useBranchSlug";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Phone, ArrowRight, Shield, Clock, CreditCard, Dumbbell, UserPlus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { fetchPublicBranch, fetchDefaultBranch, fetchRegistrationBootstrap } from "@/api/publicData";
import { ValidatedInput } from "@/components/ui/validated-input";
import { phoneSchema, validateField, validateForm } from "@/lib/validation";
import { z } from "zod";
import PoweredByBadge from "@/components/PoweredByBadge";
import RegistrationPageSkeleton from "@/components/registration/RegistrationPageSkeleton";

const formSchema = z.object({
  phone: phoneSchema,
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const branchSlug = useBranchSlug();
  const [resolvedBranchId, setResolvedBranchId] = useState<string | null>(null);
  const [phone, setPhone] = useState(() => {
    const saved = sessionStorage.getItem(`registration-phone-${branchSlug || "default"}`);
    return saved || "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [existingMember, setExistingMember] = useState<any>(null);
  const [membershipEndDate, setMembershipEndDate] = useState<string | null>(null);
  const [membershipStartDate, setMembershipStartDate] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [allowSelfSelectTrainer, setAllowSelfSelectTrainer] = useState(true);
  const [branchInfo, setBranchInfo] = useState<{ id: string; name: string; logo_url?: string | null } | null>(() => {
    if (!branchSlug) return null;
    const cached = sessionStorage.getItem(`branch-info-${branchSlug}`);
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached);
      return parsed?.id && UUID_REGEX.test(parsed.id) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [isBranchLoading, setIsBranchLoading] = useState(!branchInfo);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  
  const branchId = resolvedBranchId || branchInfo?.id;

  useEffect(() => {
    if (!branchSlug && !isRedirecting) {
      setIsRedirecting(true);
      (async () => {
        const fallback = await fetchDefaultBranch();
        if (fallback) {
          navigate(`/b/${fallback.slug || fallback.id}`, { replace: true });
        }
      })();
    }
  }, [branchSlug, navigate, isRedirecting]);

  useEffect(() => {
    if (!branchSlug) return;
    let cancelled = false;

    const resolve = async () => {
      setIsBranchLoading(true);
      // Use the unified bootstrap call — fetches branch + packages + trainers
      // in one round trip and warms caches for downstream pages (Register,
      // PackageSelectionForm) so they render instantly.
      const bootstrap = await fetchRegistrationBootstrap(branchSlug);
      const branch = bootstrap?.branch ?? (await fetchPublicBranch(branchSlug));
      if (cancelled) return;

      if (branch?.id && UUID_REGEX.test(branch.id)) {
        const info = { id: branch.id, name: branch.name, logo_url: branch.logo_url ?? null };
        setBranchInfo(info);
        setResolvedBranchId(branch.id);
        setAllowSelfSelectTrainer(branch.allowSelfSelectTrainer !== false);
        sessionStorage.setItem(`branch-info-${branchSlug}`, JSON.stringify(info));
      } else {
        setBranchInfo(null);
        setResolvedBranchId(null);
        sessionStorage.removeItem(`branch-info-${branchSlug}`);
      }

      setIsBranchLoading(false);
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [branchSlug]);

  // Handle return from Renew/ExtendPT pages
  useEffect(() => {
    const state = location.state as { returnToOptions?: boolean; phone?: string } | null;
    if (state?.returnToOptions && state?.phone) {
      const fetchMember = async () => {
        setIsLoading(true);
        try {
          const { data: memberData } = await supabase.rpc("check_phone_exists", {
            phone_number: state.phone,
            p_branch_id: branchId || null,
          });

          const result = memberData?.[0];

          if (result?.member_exists) {
            const member = {
              id: result.member_id,
              name: result.member_name,
              phone: result.member_phone,
              email: result.member_email,
              branch_id: branchId || null,
            };

            const { data: subscriptionData } = await supabase.rpc("get_member_subscription_info", {
              p_member_id: result.member_id,
            });

            const subscription = subscriptionData?.[0];
            const isValidForPT =
              subscription && (subscription.status === "active" || subscription.status === "expiring_soon");
            setMembershipEndDate(isValidForPT ? subscription?.end_date : null);
            setMembershipStartDate(isValidForPT ? subscription?.start_date : null);
            setExistingMember(member);
            setPhone(state.phone);
            setShowOptions(true);
          }
        } finally {
          setIsLoading(false);
        }
        window.history.replaceState({}, document.title);
      };
      fetchMember();
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateForm(formSchema, { phone });
    if (!result.success) {
      setPhoneError(result.errors.phone);
      
      return;
    }

    setIsLoading(true);

    try {
      const { data: memberData, error } = await supabase.rpc("check_phone_exists", {
        phone_number: phone,
        p_branch_id: branchId || null,
      });

      if (error) throw error;

      const result = memberData?.[0];

      if (result?.member_exists) {
        const member = {
          id: result.member_id,
          name: result.member_name,
          phone: result.member_phone,
          email: result.member_email,
          branch_id: branchId || null,
        };

        const { data: subscriptionData } = await supabase.rpc("get_member_subscription_info", {
          p_member_id: result.member_id,
        });

        const subscription = subscriptionData?.[0];
        const isValidForPT =
          subscription && (subscription.status === "active" || subscription.status === "expiring_soon");
        setMembershipEndDate(isValidForPT ? subscription?.end_date : null);
        setMembershipStartDate(isValidForPT ? subscription?.start_date : null);

        setExistingMember(member);
        setShowOptions(true);
      } else {
        const basePath = branchSlug ? `/b/${branchSlug}/register` : "/register";
        navigate(basePath, { state: { phone, branchId, branchName: branchInfo?.name } });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSelect = (option: "renew" | "extend-pt") => {
    const basePath = branchSlug ? `/b/${branchSlug}` : "";
    if (option === "renew") {
      navigate(`${basePath}/renew`, { state: { member: existingMember, branchId, branchName: branchInfo?.name, branchSlug } });
    } else {
      navigate(`${basePath}/extend-pt`, {
        state: {
          member: existingMember,
          membershipStartDate,
          membershipEndDate,
          branchId,
          branchName: branchInfo?.name,
          branchSlug,
        },
      });
    }
  };

  const handleBack = () => {
    setShowOptions(false);
    setExistingMember(null);
    setMembershipEndDate(null);
    setMembershipStartDate(null);
    setPhone("");
    setPhoneError(undefined);
    
  };

  if (isBranchLoading && !branchInfo) {
    return <RegistrationPageSkeleton variant="landing" />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Header */}
      <header className="px-4 pt-12 pb-8 text-center">
        <div className="flex items-center justify-center mb-4">
          {branchInfo?.logo_url ? (
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm">
              <img src={branchInfo.logo_url} alt={`${branchInfo.name} logo`} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-primary text-primary-foreground font-bold text-lg shadow-sm">
              {branchInfo?.name ? branchInfo.name.trim().split(/\s+/).length > 1 
                ? (branchInfo.name.trim().split(/\s+/)[0][0] + branchInfo.name.trim().split(/\s+/)[1][0]).toUpperCase()
                : branchInfo.name.substring(0, 2).toUpperCase()
              : "GK"}
            </div>
          )}
        </div>
        {isBranchLoading && !branchInfo ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-9 w-48 bg-muted animate-pulse rounded-lg" />
            <div className="h-5 w-56 bg-muted/60 animate-pulse rounded-md" />
          </div>
        ) : (
          <>
            <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-2">
              {branchInfo?.name || "Gym Portal"}
            </h1>
            <p className="text-muted-foreground text-lg">Member Registration Portal</p>
          </>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-8">
        {showOptions ? (
          <Card className="max-w-md mx-auto mt-6 border-0 shadow-xl bg-gradient-to-br from-card to-card/80">
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
                <Dumbbell className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="text-xl">Welcome Back!</CardTitle>
              <p className="text-lg font-semibold text-accent">{existingMember?.name}</p>
              <CardDescription className="mt-2">What would you like to do today?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <button
                onClick={() => handleOptionSelect("renew")}
                className="w-full p-4 rounded-xl border-2 border-accent bg-accent/5 hover:bg-accent/10 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Dumbbell className="w-6 h-6 text-accent" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-foreground">Renew Gym Membership</p>
                      <p className="text-sm text-muted-foreground">Continue your fitness journey</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-accent group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {allowSelfSelectTrainer && (
                <button
                  onClick={() => handleOptionSelect("extend-pt")}
                  disabled={!membershipEndDate}
                  className={`w-full p-4 rounded-xl border-2 transition-all duration-200 group ${
                    membershipEndDate
                      ? "border-border hover:border-accent/50 hover:bg-accent/5"
                      : "border-border/50 bg-muted/30 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform ${
                          membershipEndDate ? "bg-primary/10 group-hover:scale-110" : "bg-muted"
                        }`}
                      >
                        <UserPlus
                          className={`w-6 h-6 ${membershipEndDate ? "text-primary" : "text-muted-foreground"}`}
                        />
                      </div>
                      <div className="text-left">
                        <p className={`font-semibold ${membershipEndDate ? "text-foreground" : "text-muted-foreground"}`}>
                          {membershipEndDate ? "Add / Extend Personal Training" : "Personal Training"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {membershipEndDate ? "Get personalized coaching" : "Renew gym membership first"}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      className={`w-5 h-5 transition-transform ${
                        membershipEndDate
                          ? "text-muted-foreground group-hover:translate-x-1"
                          : "text-muted-foreground/50"
                      }`}
                    />
                  </div>
                </button>
              )}

              {allowSelfSelectTrainer && !membershipEndDate && (
                <p className="text-xs text-center text-muted-foreground bg-muted/50 p-2 rounded-lg">
                  You need an active gym membership to add personal training
                </p>
              )}

              <Button variant="ghost" className="w-full mt-2" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Use Different Number
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-md mx-auto mt-6 border">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-lg">Welcome to Your Fitness Journey</CardTitle>
              <CardDescription>Enter your phone number to register or renew your membership</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4 text-accent" />
                    Phone Number
                  </Label>
                  <div className="flex items-start w-full">
                    <span className="inline-flex items-center justify-center px-4 h-12 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium shrink-0">
                      +91
                    </span>
                    <ValidatedInput
                      id="phone"
                      type="tel"
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setPhone(cleaned);
                        sessionStorage.setItem(`registration-phone-${branchId || "default"}`, cleaned);
                        if (phoneError) setPhoneError(undefined);
                      }}
                      error={phoneError}
                      className="rounded-l-none flex-1 min-w-0"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  className="w-full mt-6"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                      Checking...
                    </div>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <div className="max-w-md mx-auto mt-12 grid grid-cols-3 gap-4">
          {[
            { icon: Shield, label: "Secure Payment" },
            { icon: Clock, label: "Instant Access" },
            { icon: CreditCard, label: "Easy Renewal" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card">
              <Icon className="w-5 h-5 text-accent" />
              <span className="text-xs text-muted-foreground text-center">{label}</span>
            </div>
          ))}
        </div>
      </main>

      <PoweredByBadge />
    </div>
  );
};

export default Index;
