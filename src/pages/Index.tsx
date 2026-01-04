import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dumbbell, Phone, User, ArrowRight, Shield, Clock, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
});

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = formSchema.safeParse({ name, phone });
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
        // New member - go to registration
        navigate("/register", { state: { name, phone } });
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
    <div className="min-h-screen bg-gradient-to-b from-primary via-primary/95 to-primary/80">
      {/* Hero Header */}
      <header className="px-4 pt-8 pb-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-accent rounded-xl shadow-glow animate-pulse-glow">
            <Dumbbell className="w-8 h-8 text-accent-foreground" />
          </div>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-2">
          Pro Plus Fitness
        </h1>
        <p className="text-primary-foreground/80 text-lg">Dinhata</p>
      </header>

      {/* Main Content */}
      <main className="px-4 pb-8">
        <Card className="max-w-md mx-auto mt-6 animate-fade-in border-0 shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Welcome to Your Fitness Journey</CardTitle>
            <CardDescription>
              Enter your details to register or renew your membership
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4 text-accent" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              
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
                variant="hero"
                size="xl"
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
        <div className="max-w-md mx-auto mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: Shield, label: "Secure Payment" },
            { icon: Clock, label: "Instant Access" },
            { icon: CreditCard, label: "Easy Renewal" },
          ].map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-primary-foreground/10 backdrop-blur-sm animate-fade-in"
              style={{ animationDelay: `${(i + 1) * 100}ms` }}
            >
              <Icon className="w-6 h-6 text-accent" />
              <span className="text-xs text-primary-foreground/80 text-center font-medium">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Admin Link */}
        <div className="max-w-md mx-auto mt-8 text-center">
          <Button
            variant="ghost"
            className="text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
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
