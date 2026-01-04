import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, Dumbbell, Calendar, IndianRupee, User, Phone, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
}

interface GymSettings {
  monthly_fee: number;
}

const planOptions = [
  { months: 1, label: "1 Month" },
  { months: 3, label: "3 Months" },
  { months: 6, label: "6 Months" },
  { months: 12, label: "12 Months" },
];

const Renew = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const member = (location.state as { member: Member })?.member;
  
  const [selectedMonths, setSelectedMonths] = useState(3);
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!member) {
      navigate("/");
      return;
    }
    fetchData();
  }, [member, navigate]);

  const fetchData = async () => {
    // Get settings
    const { data: settingsData } = await supabase
      .from("gym_settings")
      .select("monthly_fee")
      .limit(1)
      .maybeSingle();
    
    if (settingsData) {
      setSettings({ monthly_fee: Number(settingsData.monthly_fee) });
    }

    // Get current subscription
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("member_id", member.id)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    setCurrentSubscription(subData);
  };

  const monthlyFee = settings?.monthly_fee || 500;
  const totalAmount = monthlyFee * selectedMonths;

  const isExpired = currentSubscription && new Date(currentSubscription.end_date) < new Date();
  const isExpiringSoon = currentSubscription && 
    !isExpired && 
    new Date(currentSubscription.end_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const handlePayment = async () => {
    setIsLoading(true);
    
    try {
      // Calculate new dates
      const startDate = isExpired || !currentSubscription
        ? new Date()
        : new Date(currentSubscription.end_date);
      
      if (!isExpired && currentSubscription) {
        startDate.setDate(startDate.getDate() + 1);
      }
      
      const endDate = new Date(startDate);
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

      // Create payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          member_id: member.id,
          subscription_id: subscription.id,
          amount: totalAmount,
          payment_mode: "online",
          status: "success",
        });

      if (paymentError) throw paymentError;

      // Success!
      navigate("/success", {
        state: {
          memberName: member.name,
          phone: member.phone,
          amount: totalAmount,
          endDate: endDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          isNewMember: false,
        },
      });
    } catch (error: any) {
      toast({
        title: "Renewal Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!member) return null;

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
            Renew Membership
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-8">
        <Card className="max-w-md mx-auto animate-fade-in border-0 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Welcome back, {member.name}!</CardTitle>
            <CardDescription>Renew your membership to continue your fitness journey</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Member Info */}
            <div className="bg-muted rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-accent" />
                <span className="font-medium">{member.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>+91 {member.phone}</span>
              </div>
              {currentSubscription && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {isExpired ? (
                    <span className="px-2 py-1 bg-destructive/10 text-destructive rounded-full text-xs font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Expired on {new Date(currentSubscription.end_date).toLocaleDateString("en-IN")}
                    </span>
                  ) : isExpiringSoon ? (
                    <span className="px-2 py-1 bg-warning/10 text-warning rounded-full text-xs font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Expires on {new Date(currentSubscription.end_date).toLocaleDateString("en-IN")}
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-success/10 text-success rounded-full text-xs font-medium">
                      Active until {new Date(currentSubscription.end_date).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Plan Selection */}
            <div className="grid grid-cols-2 gap-3">
              {planOptions.map(({ months, label }) => (
                <button
                  key={months}
                  onClick={() => setSelectedMonths(months)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                    selectedMonths === months
                      ? "border-accent bg-accent/10 shadow-lg"
                      : "border-border hover:border-accent/50 bg-card"
                  }`}
                >
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

            {/* Price */}
            <div className="bg-muted rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {selectedMonths} {selectedMonths === 1 ? "Month" : "Months"}
                </span>
                <span className="font-display text-2xl font-bold text-accent flex items-center">
                  <IndianRupee className="w-5 h-5" />
                  {totalAmount.toLocaleString("en-IN")}
                </span>
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

export default Renew;
