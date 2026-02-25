import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Phone, ArrowRight, Shield, Clock, CreditCard, Dumbbell, UserPlus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { fetchPublicBranch, fetchDefaultBranch } from "@/api/publicData";
import { ValidatedInput } from "@/components/ui/validated-input";
import { phoneSchema, validateField, validateForm } from "@/lib/validation";
import { z } from "zod";

const formSchema = z.object({
  phone: phoneSchema,
});

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId } = useParams<{ branchId?: string }>();
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingMember, setExistingMember] = useState<any>(null);
  const [membershipEndDate, setMembershipEndDate] = useState<string | null>(null);
  const [membershipStartDate, setMembershipStartDate] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [branchInfo, setBranchInfo] = useState<{ id: string; name: string } | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Redirect to default branch if no branchId is provided
  useEffect(() => {
    if (!branchId && !isRedirecting) {
      setIsRedirecting(true);
      fetchDefaultBranch().then((branch) => {
        if (branch) {
          navigate(`/b/${branch.id}`, { replace: true });
        }
      });
    }
  }, [branchId, navigate, isRedirecting]);

  // Fetch branch info
  useEffect(() => {
    if (branchId) {
      fetchPublicBranch(branchId).then((branch) => {
        if (branch) {
          setBranchInfo({ id: branch.id, name: branch.name });
        }
      });
    }
  }, [branchId]);

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
      setPhoneTouched(true);
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
        const basePath = branchId ? `/b/${branchId}/register` : "/register";
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
    const basePath = branchId ? `/b/${branchId}` : "";
    if (option === "renew") {
      navigate(`${basePath}/renew`, { state: { member: existingMember, branchId, branchName: branchInfo?.name } });
    } else {
      navigate(`${basePath}/extend-pt`, {
        state: {
          member: existingMember,
          membershipStartDate,
          membershipEndDate,
          branchId,
          branchName: branchInfo?.name,
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
    setPhoneTouched(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="px-4 pt-12 pb-8 text-center">
        <div style={{ height: "4rem" }} className="flex items-center justify-center gap-3 mb-4 w-full h-20">
          <div style={{ width: "4rem" }} className="h-full rounded-xl overflow-hidden">
            <img src="/logo.jpg" alt="Icon" className="w-full h-full object-contain" />
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-2">
          {branchInfo?.name || "Loading..."}
        </h1>
        {branchInfo?.name && <p className="text-muted-foreground text-lg">Member Registration Portal</p>}
      </header>

      {/* Main Content */}
      <main className="px-4 pb-8">
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

              {!membershipEndDate && (
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
                  <div className="flex items-stretch">
                    <span className="inline-flex items-center px-4 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium h-11">
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
                        if (phoneTouched && cleaned.length === 10) {
                          setPhoneError(validateField(phoneSchema, cleaned));
                        } else if (phoneTouched && cleaned.length > 0 && cleaned.length < 10) {
                          setPhoneError("Enter a valid 10-digit Indian mobile number");
                        } else {
                          setPhoneError(undefined);
                        }
                      }}
                      onValidate={(v) => {
                        setPhoneTouched(true);
                        setPhoneError(validateField(phoneSchema, v));
                      }}
                      error={phoneTouched ? phoneError : undefined}
                      className="rounded-l-none h-11 text-sm"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  className="w-full mt-6"
                  disabled={isLoading || phone.length !== 10}
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

        {/* Admin Link */}
        <div className="max-w-md mx-auto mt-8 text-center">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/admin/login")}
          >
            Admin Login
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
