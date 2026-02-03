import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Mail, Lock, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { z } from "zod";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { queryClient } from "@/lib/queryClient";

const adminLoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const staffLoginSchema = z.object({
  phone: z.string().min(10, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login: staffLogin, clearStaffState } = useStaffAuth();
  
  // Admin state
  const [email, setEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Staff state
  const [phone, setPhone] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [isStaffLoading, setIsStaffLoading] = useState(false);

  // Clear all caches on login page load for fresh start
  useEffect(() => {
    // Clear React Query cache
    queryClient.clear();
    
    // Clear localStorage cache items
    const keysToRemove = [
      'analytics-store',
      'dashboard-store', 
      'branch-store',
      'staff-session',
      'staff-branches',
      'staff-permissions',
    ];
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignore errors
      }
    });
    
    // Sign out any existing session to start fresh
    supabase.auth.signOut().catch(() => {
      // Ignore errors - user might not be signed in
    });
  }, []);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = adminLoginSchema.safeParse({ email, password: adminPassword });
    if (!result.success) {
      toast.error("Invalid Input", {
        description: result.error.errors[0].message,
      });
      return;
    }

    setIsAdminLoading(true);
    
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: adminPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/admin/dashboard`,
          },
        });

        if (error) throw error;

        if (data.user) {
          const { error: roleError } = await supabase
            .from("user_roles")
            .insert({ user_id: data.user.id, role: "admin" });

          if (roleError) {
            console.log("Role assignment note:", roleError.message);
          }

          toast.success("Account Created", {
            description: "You can now sign in with your credentials.",
          });
          setIsSignUp(false);
        }
      } else {
        // CRITICAL: Clear any lingering staff state before admin login
        clearStaffState();
        
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: adminPassword,
        });

        if (error) throw error;

        navigate("/admin/dashboard");
      }
    } catch (error: any) {
      toast.error(isSignUp ? "Sign Up Failed" : "Login Failed", {
        description: error.message || "Something went wrong",
      });
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = staffLoginSchema.safeParse({ phone, password: staffPassword });
    if (!result.success) {
      toast.error("Invalid Input", {
        description: result.error.errors[0].message,
      });
      return;
    }

    setIsStaffLoading(true);
    
    try {
      const { success, error } = await staffLogin(phone, staffPassword);
      
      if (!success) {
        throw new Error(error || "Login failed");
      }

      toast.success("Login Successful", {
        description: "Welcome back!",
      });
      // Staff users go to their dedicated dashboard
      navigate("/staff/dashboard");
    } catch (error: any) {
      toast.error("Login Failed", {
        description: error.message || "Invalid phone number or password",
      });
    } finally {
      setIsStaffLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center gap-2 mb-4">
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
            </div>
            <CardTitle className="flex items-center justify-center gap-2">
              <Dumbbell className="w-5 h-5 text-accent" />
              Login Portal
            </CardTitle>
            <CardDescription>
              Sign in to access the admin dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="admin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="admin" className="gap-2">
                  <Mail className="w-4 h-4" />
                  Admin
                </TabsTrigger>
                <TabsTrigger value="staff" className="gap-2">
                  <User className="w-4 h-4" />
                  Staff
                </TabsTrigger>
              </TabsList>

              <TabsContent value="admin">
                <form onSubmit={handleAdminSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-accent" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="admin-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="w-4 h-4 text-accent" />
                      Password
                    </Label>
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    className="w-full"
                    disabled={isAdminLoading}
                  >
                    {isAdminLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        {isSignUp ? "Creating Account..." : "Signing In..."}
                      </div>
                    ) : (
                      isSignUp ? "Create Account" : "Sign In"
                    )}
                  </Button>

                  <div className="text-center">
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
                </form>
              </TabsContent>

              <TabsContent value="staff">
                <form onSubmit={handleStaffSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4 text-accent" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoComplete="tel"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="staff-password" className="text-sm font-medium flex items-center gap-2">
                      <Lock className="w-4 h-4 text-accent" />
                      Password
                    </Label>
                    <Input
                      id="staff-password"
                      type="password"
                      placeholder="••••••••"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    className="w-full"
                    disabled={isStaffLoading}
                  >
                    {isStaffLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        Signing In...
                      </div>
                    ) : (
                      "Sign In"
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Staff credentials are provided by your admin
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
