import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Mail, Lock, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { queryClient } from "@/lib/queryClient";
import { ValidatedInput } from "@/components/ui/validated-input";
import { withTimeout, AUTH_TIMEOUT_MS } from "@/lib/networkUtils";
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
  const { login: staffLogin, clearStaffState } = useStaffAuth();

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

  useEffect(() => {
    queryClient.clear();
    // Reset refresh failure counter on login page visit
    localStorage.removeItem("auth-refresh-fail-count");
  }, []);

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

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password: adminPassword,
        }),
        AUTH_TIMEOUT_MS,
        "Sign in"
      );

      if (error) throw error;

      const { data: roles, error: rolesError } = await withTimeout(
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .in("role", ["admin", "super_admin"])
          ,
        AUTH_TIMEOUT_MS,
        "Role check"
      );

      if (rolesError || !roles || roles.length === 0) {
        await supabase.auth.signOut();
        throw new Error("You don't have admin privileges. Contact the administrator.");
      }

      const userRoles = roles.map((r) => r.role);
      const isSuperAdmin = userRoles.includes("super_admin");

      if (!isSuperAdmin) {
        const { data: membership, error: membershipError } = await withTimeout(
          supabase
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", data.user.id)
            .limit(1)
            ,
          AUTH_TIMEOUT_MS,
          "Tenant check"
        );

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
      const isTimeout = error.message?.includes("timed out");
      toast.error(isTimeout ? "Network Error" : "Login Failed", {
        description: isTimeout
          ? "Slow network detected. Please check your connection and try again."
          : error.message || "Something went wrong",
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
      const { success, error } = await withTimeout(
        staffLogin(phone, staffPassword),
        AUTH_TIMEOUT_MS,
        "Staff login"
      );

      if (!success) {
        throw new Error(error || "Login failed");
      }

      toast.success("Login Successful", {
        description: "Welcome back!",
      });
      navigate("/staff/dashboard");
    } catch (error: any) {
      const isTimeout = error.message?.includes("timed out");
      toast.error(isTimeout ? "Network Error" : "Login Failed", {
        description: isTimeout
          ? "Slow network detected. Please check your connection and try again."
          : error.message || "Invalid phone number or password",
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
                <div style={{ width: "4rem" }} className="h-full rounded-xl overflow-hidden">
                  <img src="/logo.jpg" alt="Icon" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>
            <CardTitle className="flex items-center justify-center gap-2">
              <Dumbbell className="w-5 h-5 text-accent" />
              Login Portal
            </CardTitle>
            <CardDescription>Sign in to access the admin dashboard</CardDescription>
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
                      <Lock className="w-4 h-4 text-accent" />
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
                    className="w-full"
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

              <TabsContent value="staff">
                <form onSubmit={handleStaffSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4 text-accent" />
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
                      <Lock className="w-4 h-4 text-accent" />
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
                    className="w-full"
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
  );
};

export default AdminLogin;
