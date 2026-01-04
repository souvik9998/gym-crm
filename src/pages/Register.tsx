import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, Dumbbell, Calendar, IndianRupee, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GymSettings {
  monthly_fee: number;
  joining_fee: number;
  gym_name: string;
}

const planOptions = [
  { months: 1, label: "1 Month", popular: false },
  { months: 3, label: "3 Months", popular: true },
  { months: 6, label: "6 Months", popular: false },
  { months: 12, label: "12 Months", popular: false },
];

const Register = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { name, phone } = (location.state as { name: string; phone: string }) || {};
  
  const [selectedMonths, setSelectedMonths] = useState(3);
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!name || !phone) {
      navigate("/");
      return;
    }
    fetchSettings();
  }, [name, phone, navigate]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("gym_settings")
      .select("monthly_fee, joining_fee, gym_name")
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setSettings({
        monthly_fee: Number(data.monthly_fee),
        joining_fee: Number(data.joining_fee),
        gym_name: data.gym_name || "Pro Plus Fitness",
      });
    }
  };

  const monthlyFee = settings?.monthly_fee || 500;
  const joiningFee = settings?.joining_fee || 200;
  const subscriptionAmount = monthlyFee * selectedMonths;
  const totalAmount = subscriptionAmount + joiningFee;

  const handlePayment = async () => {
    setIsLoading(true);
    
    try {
      // Create member
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name, phone })
        .select()
        .single();

      if (memberError) throw memberError;

      // Calculate dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + selectedMonths);

      // Create subscription
      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          plan_months: selectedMonths,
          status: "active",
        })
        .select()
        .single();

      if (subError) throw subError;

      // Create payment record (pending - would be updated by webhook in production)
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          member_id: member.id,
          subscription_id: subscription.id,
          amount: totalAmount,
          payment_mode: "online",
          status: "success", // In production, this would be "pending" until Razorpay confirms
        });

      if (paymentError) throw paymentError;

      // Success!
      navigate("/success", {
        state: {
          memberName: name,
          phone,
          amount: totalAmount,
          endDate: endDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          isNewMember: true,
        },
      });
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!name || !phone) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary via-primary/95 to-primary/80">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 -ml-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Dumbbell className="w-6 h-6 text-accent" />
          <span className="font-display text-xl font-bold text-primary-foreground">
            New Membership
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-8">
        <Card className="max-w-md mx-auto animate-fade-in border-0 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Welcome, {name}!</CardTitle>
            <CardDescription>Select your membership plan to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plan Selection */}
            <div className="grid grid-cols-2 gap-3">
              {planOptions.map(({ months, label, popular }) => (
                <button
                  key={months}
                  onClick={() => setSelectedMonths(months)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                    selectedMonths === months
                      ? "border-accent bg-accent/10 shadow-lg"
                      : "border-border hover:border-accent/50 bg-card"
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </span>
                  )}
                  <div className="text-center">
                    <div className="font-display text-2xl font-bold text-foreground">
                      {months}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {months === 1 ? "Month" : "Months"}
                    </div>
                    {selectedMonths === months && (
                      <div className="mt-2 flex justify-center">
                        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-3 h-3 text-accent-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Price Breakdown */}
            <div className="bg-muted rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Subscription ({selectedMonths} mo)
                </span>
                <span className="font-semibold flex items-center">
                  <IndianRupee className="w-4 h-4" />
                  {subscriptionAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Joining Fee
                </span>
                <span className="font-semibold flex items-center">
                  <IndianRupee className="w-4 h-4" />
                  {joiningFee.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">Total</span>
                  <span className="font-display text-2xl font-bold text-accent flex items-center">
                    <IndianRupee className="w-5 h-5" />
                    {totalAmount.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Pay Button */}
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onClick={handlePayment}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                <>
                  Pay ₹{totalAmount.toLocaleString("en-IN")}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Secure payment powered by Razorpay
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Register;
