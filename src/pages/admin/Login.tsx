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
  
  // Staff state
  const [phone, setPhone] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [isStaffLoading, setIsStaffLoading] = useState(false);

  // Clear React Query cache on login page load for fresh start
  // NOTE: Do NOT call signOut here - that would log out users who just refreshed
  useEffect(() => {
    queryClient.clear();
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
      // CRITICAL: Clear any lingering staff state before admin login
      clearStaffState();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: adminPassword,
      });

      if (error) throw error;

      // SECURITY: Verify user has valid admin role before allowing navigation
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .in("role", ["admin", "super_admin"]);

      if (rolesError || !roles || roles.length === 0) {
        // User exists in auth.users but has no admin role - sign them out
        await supabase.auth.signOut();
        throw new Error("You don't have admin privileges. Contact the administrator.");
      }

      const userRoles = roles.map(r => r.role);
      const isSuperAdmin = userRoles.includes("super_admin");

      // For non-super-admins, verify tenant membership
      if (!isSuperAdmin) {
        const { data: membership, error: membershipError } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", data.user.id)
          .limit(1);

        if (membershipError || !membership || membership.length === 0) {
          await supabase.auth.signOut();
          throw new Error("You're not assigned to any organization. Contact the administrator.");
        }
      }

      // Redirect based on role
      if (isSuperAdmin) {
        navigate("/superadmin/dashboard");
      } else {
        navigate("/admin/dashboard");
      }
    } catch (error: any) {
      toast.error("Login Failed", {
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
                      autoComplete="current-password"
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
                        Signing In...
                      </div>
                    ) : (
                      "Sign In"
                    )}
                  </Button>

                  {/* SECURITY: Sign-up hidden - new admins created by super admin only */}
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
