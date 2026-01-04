import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dumbbell, Mail, Lock, ArrowLeft, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email, password });
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
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin/dashboard`,
          },
        });

        if (error) throw error;

        if (data.user) {
          // Add admin role
          const { error: roleError } = await supabase
            .from("user_roles")
            .insert({ user_id: data.user.id, role: "admin" });

          if (roleError) {
            // Role might already exist or there might be RLS issues for first admin
            console.log("Role assignment note:", roleError.message);
          }

          toast({
            title: "Account Created",
            description: "You can now sign in with your credentials.",
          });
          setIsSignUp(false);
        }
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        navigate("/admin/dashboard");
      }
    } catch (error: any) {
      toast({
        title: isSignUp ? "Sign Up Failed" : "Login Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary via-primary/95 to-primary/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 mb-6"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Portal
        </Button>

        <Card className="animate-fade-in border-0 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="p-3 bg-primary rounded-xl">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="flex items-center justify-center gap-2">
              <Dumbbell className="w-5 h-5 text-accent" />
              Admin {isSignUp ? "Sign Up" : "Login"}
            </CardTitle>
            <CardDescription>
              {isSignUp
                ? "Create an admin account to manage the gym"
                : "Sign in to access the admin dashboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4 text-accent" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@proplusfitness.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-accent" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </div>

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                    {isSignUp ? "Creating Account..." : "Signing In..."}
                  </div>
                ) : (
                  isSignUp ? "Create Account" : "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
