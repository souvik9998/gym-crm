import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Lock, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import PoweredByBadge from "@/components/PoweredByBadge";
import { queryClient } from "@/lib/queryClient";
import { ValidatedInput } from "@/components/ui/validated-input";
import {
  adminLoginSchema,
  staffLoginSchema,
  validateField,
  validateForm,
  emailSchema,
  phoneSchema,
  type FieldErrors,
} from "@/lib/validation";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login: staffLogin, clearStaffState, isStaffLoggedIn } = useStaffAuth();
  const { isAuthenticated, isLoading: authLoading, isAdmin, isSuperAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Admin state
  const [email, setEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminErrors, setAdminErrors] = useState<FieldErrors>({});
  const [adminTouched, setAdminTouched] = useState<Record<string, boolean>>({});

  // Staff state
  const [phone, setPhone] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [staffErrors, setStaffErrors] = useState<FieldErrors>({});
  const [staffTouched, setStaffTouched] = useState<Record<string, boolean>>({});

  // Redirect already-authenticated users to their dashboard
  useEffect(() => {
    if (authLoading) return;
    if (isStaffLoggedIn) {
      navigate("/staff/dashboard", { replace: true });
      return;
    }
    if (isAuthenticated) {
      if (isSuperAdmin) {
        navigate("/superadmin/dashboard", { replace: true });
      } else if (isAdmin) {
        navigate("/admin/dashboard", { replace: true });
      }
    }
  }, [authLoading, isAuthenticated, isStaffLoggedIn, isAdmin, isSuperAdmin, navigate]);

  useEffect(() => {
    // Only clear cache and show UI once we know user is NOT authenticated
    if (!authLoading && !isAuthenticated && !isStaffLoggedIn) {
      queryClient.clear();
      setTimeout(() => setMounted(true), 50);
    }
  }, [authLoading, isAuthenticated, isStaffLoggedIn]);

  // While auth is loading or user is authenticated (about to redirect), show a minimal spinner
  if (authLoading || isAuthenticated || isStaffLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateForm(adminLoginSchema, { email: email.trim(), password: adminPassword });
    if (!result.success) {
      setAdminErrors(result.errors);
      setAdminTouched({ email: true, password: true });
      return;
    }

    setIsAdminLoading(true);

    try {
      clearStaffState();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: adminPassword,
      });

      if (error) throw error;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .in("role", ["admin", "super_admin"]);

      if (rolesError || !roles || roles.length === 0) {
        await supabase.auth.signOut();
        throw new Error("You don't have admin privileges. Contact the administrator.");
      }

      const userRoles = roles.map((r) => r.role);
      const isSuperAdmin = userRoles.includes("super_admin");

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

    const result = validateForm(staffLoginSchema, { phone, password: staffPassword });
    if (!result.success) {
      setStaffErrors(result.errors);
      setStaffTouched({ phone: true, password: true });
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main centered content */}
      <div className="flex-1 flex items-center justify-center p-4 pb-16">
        <div className={`w-full max-w-md transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <Card className="border border-border/50 shadow-2xl shadow-foreground/5 overflow-hidden">
            <CardHeader className="text-center pb-4 pt-8">
              {/* Animated GK Logo */}
              <div className={`flex items-center justify-center mb-5 transition-all duration-500 delay-200 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                <div className="relative group cursor-default">
                  <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-foreground/20 to-foreground/5 blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center bg-foreground shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
                    <span className="text-background font-bold text-2xl tracking-tight select-none">GK</span>
                  </div>
                </div>
              </div>
              <CardTitle className={`text-xl md:text-2xl font-semibold transition-all duration-500 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
                GymKloud Login
              </CardTitle>
              <CardDescription className={`transition-all duration-500 delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                Sign in to access the admin dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8">
              <Tabs defaultValue="admin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-11">
                  <TabsTrigger value="admin" className="gap-2 text-sm font-medium transition-all duration-200 data-[state=active]:shadow-sm">
                    <Mail className="w-4 h-4" />
                    Admin
                  </TabsTrigger>
                  <TabsTrigger value="staff" className="gap-2 text-sm font-medium transition-all duration-200 data-[state=active]:shadow-sm">
                    <User className="w-4 h-4" />
                    Staff
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="admin" className="animate-fade-in">
                  <form onSubmit={handleAdminSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        Email Address
                      </Label>
                      <ValidatedInput
                        id="email"
                        type="email"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (adminTouched.email) {
                            setAdminErrors((prev) => ({
                              ...prev,
                              email: validateField(emailSchema, e.target.value.trim()),
                            }));
                          }
                        }}
                        onValidate={(v) => {
                          setAdminTouched((prev) => ({ ...prev, email: true }));
                          setAdminErrors((prev) => ({ ...prev, email: validateField(emailSchema, v) }));
                        }}
                        error={adminTouched.email ? adminErrors.email : undefined}
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin-password" className="text-sm font-medium flex items-center gap-2">
                        <Lock className="w-4 h-4 text-muted-foreground" />
                        Password
                      </Label>
                      <ValidatedInput
                        id="admin-password"
                        type="password"
                        placeholder="••••••••"
                        value={adminPassword}
                        onChange={(e) => {
                          setAdminPassword(e.target.value);
                          if (adminTouched.password && e.target.value.length > 0 && e.target.value.length < 6) {
                            setAdminErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
                          } else {
                            setAdminErrors((prev) => ({ ...prev, password: undefined }));
                          }
                        }}
                        onValidate={() => {
                          setAdminTouched((prev) => ({ ...prev, password: true }));
                          if (adminPassword.length > 0 && adminPassword.length < 6) {
                            setAdminErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
                          }
                        }}
                        error={adminTouched.password ? adminErrors.password : undefined}
                        autoComplete="current-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="accent"
                      size="lg"
                      className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      disabled={isAdminLoading || !email.trim() || !adminPassword}
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
                  </form>
                </TabsContent>

                <TabsContent value="staff" className="animate-fade-in">
                  <form onSubmit={handleStaffSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        Phone Number
                      </Label>
                      <ValidatedInput
                        id="phone"
                        type="tel"
                        placeholder="Enter your phone number"
                        value={phone}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setPhone(cleaned);
                          if (staffTouched.phone && cleaned.length === 10) {
                            setStaffErrors((prev) => ({
                              ...prev,
                              phone: validateField(phoneSchema, cleaned),
                            }));
                          }
                        }}
                        onValidate={(v) => {
                          setStaffTouched((prev) => ({ ...prev, phone: true }));
                          setStaffErrors((prev) => ({ ...prev, phone: validateField(phoneSchema, v) }));
                        }}
                        error={staffTouched.phone ? staffErrors.phone : undefined}
                        autoComplete="tel"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="staff-password" className="text-sm font-medium flex items-center gap-2">
                        <Lock className="w-4 h-4 text-muted-foreground" />
                        Password
                      </Label>
                      <ValidatedInput
                        id="staff-password"
                        type="password"
                        placeholder="••••••••"
                        value={staffPassword}
                        onChange={(e) => {
                          setStaffPassword(e.target.value);
                          if (staffTouched.password && e.target.value.length > 0 && e.target.value.length < 6) {
                            setStaffErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
                          } else {
                            setStaffErrors((prev) => ({ ...prev, password: undefined }));
                          }
                        }}
                        onValidate={() => {
                          setStaffTouched((prev) => ({ ...prev, password: true }));
                          if (staffPassword.length > 0 && staffPassword.length < 6) {
                            setStaffErrors((prev) => ({ ...prev, password: "Password must be at least 6 characters" }));
                          }
                        }}
                        error={staffTouched.password ? staffErrors.password : undefined}
                        autoComplete="current-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="accent"
                      size="lg"
                      className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      disabled={isStaffLoading || phone.length !== 10 || !staffPassword}
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

      <PoweredByBadge />
    </div>
  );
};

export default AdminLogin;
