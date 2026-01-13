import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Phone, ArrowRight, Shield, Clock, CreditCard, Dumbbell, UserPlus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { z } from "zod";

const formSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
});

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingMember, setExistingMember] = useState<any>(null);
  const [membershipEndDate, setMembershipEndDate] = useState<string | null>(null);
  const [membershipStartDate, setMembershipStartDate] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Handle return from Renew/ExtendPT pages
  useEffect(() => {
    const state = location.state as { returnToOptions?: boolean; phone?: string } | null;
    if (state?.returnToOptions && state?.phone) {
      // Re-fetch member data and show options
      const fetchMember = async () => {
        setIsLoading(true);
        try {
          const { data: member } = await supabase
            .from("members")
            .select("*")
            .eq("phone", state.phone)
            .maybeSingle();

          if (member) {
            // Fetch the most recent subscription (including future-dated ones)
            const { data: subscription } = await supabase
              .from("subscriptions")
              .select("start_date, end_date, status")
              .eq("member_id", member.id)
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Only consider active/expiring_soon for enabling PT option
            const isValidForPT = subscription && (subscription.status === 'active' || subscription.status === 'expiring_soon');
            setMembershipEndDate(isValidForPT ? subscription?.end_date : null);
            setMembershipStartDate(isValidForPT ? subscription?.start_date : null);
            setExistingMember(member);
            setPhone(state.phone);
            setShowOptions(true);
          }
        } finally {
          setIsLoading(false);
        }
        // Clear the state to prevent re-triggering
        window.history.replaceState({}, document.title);
      };
      fetchMember();
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = formSchema.safeParse({ phone });
    if (!result.success) {
      toast.error("Invalid Input", {
        description: result.error.errors[0].message,
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Check if member exists
      const { data: member, error } = await supabase
        .from("members")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

      if (error) throw error;

      if (member) {
        // Fetch the most recent subscription (including future-dated ones)
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("start_date, end_date, status")
          .eq("member_id", member.id)
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Only consider active/expiring_soon for enabling PT option
        const isValidForPT = subscription && (subscription.status === 'active' || subscription.status === 'expiring_soon');
        setMembershipEndDate(isValidForPT ? subscription?.end_date : null);
        setMembershipStartDate(isValidForPT ? subscription?.start_date : null);

        // Existing member - show options
        setExistingMember(member);
        setShowOptions(true);
      } else {
        // New member - go to registration with phone only
        navigate("/register", { state: { phone } });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSelect = (option: 'renew' | 'extend-pt') => {
    if (option === 'renew') {
      navigate("/renew", { state: { member: existingMember } });
    } else {
      navigate("/extend-pt", { 
        state: { 
          member: existingMember,
          membershipStartDate: membershipStartDate,
          membershipEndDate: membershipEndDate
        } 
      });
    }
  };

  const handleBack = () => {
    setShowOptions(false);
    setExistingMember(null);
    setMembershipEndDate(null);
    setMembershipStartDate(null);
    setPhone("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="px-4 pt-12 pb-8 text-center">
        <div style={{ height: "4rem" }} className="flex items-center justify-center gap-3 mb-4 w-full h-20">
          <div
            style={{ width: "4rem" }}
            className="h-full rounded-xl overflow-hidden"
          >
            <img
              src="/logo.jpg"
              alt="Icon"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-2">
          Pro Plus Fitness
        </h1>
        <p className="text-muted-foreground text-lg">Dinhata</p>
      </header>

      {/* Main Content */}
      <main className="px-4 pb-8">
        {showOptions ? (
          // Options for existing member
          <Card className="max-w-md mx-auto mt-6 border-0 shadow-xl bg-gradient-to-br from-card to-card/80">
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
                <Dumbbell className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="text-xl">Welcome Back!</CardTitle>
              <p className="text-lg font-semibold text-accent">{existingMember?.name}</p>
              <CardDescription className="mt-2">
                What would you like to do today?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <button
                onClick={() => handleOptionSelect('renew')}
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
                onClick={() => handleOptionSelect('extend-pt')}
                disabled={!membershipEndDate}
                className={`w-full p-4 rounded-xl border-2 transition-all duration-200 group ${
                  membershipEndDate 
                    ? "border-border hover:border-accent/50 hover:bg-accent/5" 
                    : "border-border/50 bg-muted/30 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform ${
                      membershipEndDate ? "bg-primary/10 group-hover:scale-110" : "bg-muted"
                    }`}>
                      <UserPlus className={`w-6 h-6 ${membershipEndDate ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="text-left">
                      <p className={`font-semibold ${membershipEndDate ? "text-foreground" : "text-muted-foreground"}`}>
                        {membershipEndDate ? "Add / Extend Personal Training" : "Personal Training"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {membershipEndDate 
                          ? "Get personalized coaching" 
                          : "Renew gym membership first"}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`w-5 h-5 transition-transform ${
                    membershipEndDate ? "text-muted-foreground group-hover:translate-x-1" : "text-muted-foreground/50"
                  }`} />
                </div>
              </button>

              {!membershipEndDate && (
                <p className="text-xs text-center text-muted-foreground bg-muted/50 p-2 rounded-lg">
                  You need an active gym membership to add personal training
                </p>
              )}

              <Button
                variant="ghost"
                className="w-full mt-2"
                onClick={handleBack}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Use Different Number
              </Button>
            </CardContent>
          </Card>
        ) : (
          // Phone input form
          <Card className="max-w-md mx-auto mt-6 border">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-lg">Welcome to Your Fitness Journey</CardTitle>
              <CardDescription>
                Enter your phone number to register or renew your membership
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4 text-accent" />
                    Phone Number
                  </Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-lg border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
                      +91
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="rounded-l-none"
                      required
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
            <div
              key={label}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card"
            >
              <Icon className="w-5 h-5 text-accent" />
              <span className="text-xs text-muted-foreground text-center">
                {label}
              </span>
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
