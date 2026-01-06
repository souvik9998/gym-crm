import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dumbbell, Phone, ArrowRight, Shield, Clock, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const formSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
});

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = formSchema.safeParse({ phone });
    if (!result.success) {
      toast({
        title: "Invalid Input",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Check if member exists
      const { data: existingMember, error } = await supabase
        .from("members")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

      if (error) throw error;

      if (existingMember) {
        // Existing member - go to renewal
        navigate("/renew", { state: { member: existingMember } });
      } else {
        // New member - go to registration with phone only
        navigate("/register", { state: { phone } });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
