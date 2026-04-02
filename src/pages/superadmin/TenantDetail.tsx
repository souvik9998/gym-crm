import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import {
  fetchTenantDetails,
  updateTenant,
  updateTenantLimits,
  TenantWithDetails,
} from "@/api/tenants";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeftIcon,
  BuildingOffice2Icon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  PlayIcon,
  PauseIcon,
  EyeIcon,
  ChevronRightIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  CalendarIcon,
  FingerPrintIcon,
  UserGroupIcon,
  CurrencyRupeeIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { format } from "date-fns";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import RazorpayCredentialsTab from "@/components/superadmin/RazorpayCredentialsTab";
import { BiometricDevicesSection } from "@/components/superadmin/BiometricDevicesSection";

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface BranchDetails {
  membersCount: number;
  activeMembers: number;
  expiredMembers: number;
  inactiveMembers: number;
  staffCount: number;
  devicesCount: number;
  trainersCount: number;
  monthlyRevenue: number;
  totalRevenue: number;
  whatsappSentThisMonth: number;
  attendanceToday: number;
  attendanceThisMonth: number;
  lastPaymentDate: string | null;
  gymSettings: { gym_name: string | null; gym_phone: string | null; gym_address: string | null; whatsapp_enabled: boolean | null } | null;
}

export default function TenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  
  const [tenant, setTenant] = useState<TenantWithDetails | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Edit states
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  
  // Limits
  const [editLimits, setEditLimits] = useState({
    max_branches: 3,
    max_staff_per_branch: 10,
    max_members: 1000,
    max_trainers: 20,
    max_monthly_whatsapp_messages: 500,
    max_monthly_checkins: 10000,
    max_storage_mb: 500,
    plan_expiry_date: "" as string,
  });

  // Feature permissions
  const [editFeatures, setEditFeatures] = useState<Record<string, boolean>>({
    members_management: true,
    attendance: true,
    payments_billing: true,
    staff_management: true,
    reports_analytics: true,
    workout_diet_plans: false,
    notifications: true,
    integrations: true,
    leads_crm: false,
  });
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);

  // Dialogs
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [addBranchDialogOpen, setAddBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");

  // Branch detail
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [branchDetails, setBranchDetails] = useState<BranchDetails | null>(null);
  const [branchDetailLoading, setBranchDetailLoading] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  const loadTenantData = useCallback(async () => {
    if (!tenantId) return;
    
    setIsLoading(true);
    try {
      const data = await fetchTenantDetails(tenantId);
      if (data) {
        setTenant(data);
        setEditName(data.name);
        setEditEmail(data.email || "");
        setEditPhone(data.phone || "");
        if (data.limits) {
          setEditLimits({
            max_branches: data.limits.max_branches,
            max_staff_per_branch: data.limits.max_staff_per_branch,
            max_members: data.limits.max_members,
            max_trainers: data.limits.max_trainers,
            max_monthly_whatsapp_messages: data.limits.max_monthly_whatsapp_messages,
            max_monthly_checkins: data.limits.max_monthly_checkins ?? 10000,
            max_storage_mb: data.limits.max_storage_mb ?? 500,
            plan_expiry_date: data.limits.plan_expiry_date || "",
          });
          if (data.limits.features) {
            setEditFeatures(data.limits.features as Record<string, boolean>);
          }
        }
      }

      // Fetch branches for this tenant (super admin can see all)
      const { data: branchData, error: branchError } = await supabase
        .from("branches")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");

      if (!branchError && branchData) {
        setBranches(branchData);
      }
    } catch (error) {
      console.error("Error loading tenant:", error);
      toast.error("Failed to load organization details");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (isSuperAdmin && tenantId) {
      loadTenantData();
    }
  }, [isSuperAdmin, tenantId, loadTenantData]);

  const handleSaveDetails = async () => {
    if (!tenant) return;
    
    setIsSaving(true);
    try {
      await updateTenant(tenant.id, {
        name: editName,
        email: editEmail || null,
        phone: editPhone || null,
      });
      toast.success("Organization details updated");
      await loadTenantData();
    } catch (error) {
      console.error("Error updating tenant:", error);
      toast.error("Failed to update organization");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLimits = async () => {
    if (!tenant) return;
    
    setIsSaving(true);
    try {
      const limitsToSave: Record<string, any> = { ...editLimits };
      if (!limitsToSave.plan_expiry_date) {
        limitsToSave.plan_expiry_date = null;
      }
      await updateTenantLimits(tenant.id, limitsToSave);
      toast.success("Organization limits updated");
      await loadTenantData();
    } catch (error) {
      console.error("Error updating limits:", error);
      toast.error("Failed to update limits");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFeature = async (featureKey: string, enabled: boolean) => {
    if (!tenant) return;
    
    const newFeatures = { ...editFeatures, [featureKey]: enabled };
    setEditFeatures(newFeatures);
    setIsSavingFeatures(true);
    try {
      await updateTenantLimits(tenant.id, { features: newFeatures });
      toast.success(`${featureKey.replace(/_/g, " ")} ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Error updating feature:", error);
      setEditFeatures(prev => ({ ...prev, [featureKey]: !enabled }));
      toast.error("Failed to update feature");
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const handleSuspendToggle = async () => {
    if (!tenant) return;
    
    setIsSaving(true);
    try {
      await updateTenant(tenant.id, { is_active: !tenant.is_active });
      toast.success(tenant.is_active ? "Organization suspended" : "Organization activated");
      await loadTenantData();
      setSuspendDialogOpen(false);
    } catch (error) {
      console.error("Error toggling suspension:", error);
      toast.error("Failed to update organization status");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!tenant || !newBranchName.trim()) {
      toast.error("Branch name is required");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${getEdgeFunctionUrl("tenant-operations")}?action=superadmin-create-branch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            tenantId: tenant.id,
            name: newBranchName.trim(),
            address: newBranchAddress.trim() || null,
            phone: newBranchPhone.trim() || null,
            bypassLimits: true, // Super admin bypass
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create branch");
      }

      toast.success("Branch created successfully");
      setAddBranchDialogOpen(false);
      setNewBranchName("");
      setNewBranchAddress("");
      setNewBranchPhone("");
      await loadTenantData();
    } catch (error: any) {
      console.error("Error creating branch:", error);
      toast.error(error.message || "Failed to create branch");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    const loadingId = toast.loading(branch.is_active ? "Suspending branch..." : "Activating branch...");
    try {
      const { error } = await supabase
        .from("branches")
        .update({ is_active: !branch.is_active })
        .eq("id", branch.id);

      if (error) throw error;

      toast.success(branch.is_active ? "Branch suspended" : "Branch activated", { id: loadingId });
      await loadTenantData();
    } catch (error) {
      console.error("Error toggling branch:", error);
      toast.error("Failed to update branch status", { id: loadingId });
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    const loadingId = toast.loading("Deleting branch...");
    try {
      const { error } = await supabase
        .from("branches")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", branch.id);

      if (error) throw error;

      toast.success("Branch deleted", { id: loadingId });
      await loadTenantData();
    } catch (error) {
      console.error("Error deleting branch:", error);
      toast.error("Failed to delete branch", { id: loadingId });
    }
  };

  const handleViewAsTenant = () => {
    if (!tenant) return;
    localStorage.setItem("superadmin-impersonated-tenant", tenant.id);
    navigate("/admin/dashboard");
  };

  const handleOpenBranchDetail = async (branch: Branch) => {
    setSelectedBranch(branch);
    setBranchDetails(null);
    setBranchDetailLoading(true);
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const today = new Date().toISOString().split("T")[0];

      const [membersRes, staffRes, devicesRes, trainersRes, paymentsRes, totalPaymentsRes, settingsRes, subsRes, attendanceTodayRes, attendanceMonthRes, whatsappRes, lastPaymentRes] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }).eq("branch_id", branch.id),
        supabase.from("staff_branch_assignments").select("id", { count: "exact", head: true }).eq("branch_id", branch.id),
        supabase.from("biometric_devices" as any).select("id", { count: "exact", head: true }).eq("branch_id", branch.id).eq("is_active", true),
        supabase.from("personal_trainers").select("id", { count: "exact", head: true }).eq("branch_id", branch.id).eq("is_active", true),
        supabase.from("payments").select("amount").eq("branch_id", branch.id).eq("status", "success").gte("created_at", monthStart),
        supabase.from("payments").select("amount").eq("branch_id", branch.id).eq("status", "success"),
        supabase.from("gym_settings").select("gym_name, gym_phone, gym_address, whatsapp_enabled").eq("branch_id", branch.id).maybeSingle(),
        supabase.from("subscriptions").select("status").eq("branch_id", branch.id),
        supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("branch_id", branch.id).eq("date", today),
        supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("branch_id", branch.id).gte("date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]),
        supabase.from("admin_activity_logs").select("id", { count: "exact", head: true }).eq("branch_id", branch.id).eq("activity_type", "whatsapp_sent").gte("created_at", monthStart),
        supabase.from("payments").select("created_at").eq("branch_id", branch.id).eq("status", "success").order("created_at", { ascending: false }).limit(1),
      ]);

      const allSubs = subsRes.data || [];
      const activeCount = allSubs.filter((s: any) => s.status === "active" || s.status === "expiring_soon").length;
      const expiredCount = allSubs.filter((s: any) => s.status === "expired").length;
      const inactiveCount = allSubs.filter((s: any) => s.status === "inactive").length;

      setBranchDetails({
        membersCount: membersRes.count || 0,
        activeMembers: activeCount,
        expiredMembers: expiredCount,
        inactiveMembers: inactiveCount,
        staffCount: staffRes.count || 0,
        devicesCount: devicesRes.count || 0,
        trainersCount: trainersRes.count || 0,
        monthlyRevenue: (paymentsRes.data || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
        totalRevenue: (totalPaymentsRes.data || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
        whatsappSentThisMonth: whatsappRes.count || 0,
        attendanceToday: attendanceTodayRes.count || 0,
        attendanceThisMonth: attendanceMonthRes.count || 0,
        lastPaymentDate: lastPaymentRes.data?.[0]?.created_at || null,
        gymSettings: settingsRes.data || null,
      });
    } catch (err) {
      console.error("Error loading branch details:", err);
    } finally {
      setBranchDetailLoading(false);
    }
  };

  if (roleLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground">Organization not found</p>
          <Button className="mt-4" onClick={() => navigate("/superadmin/tenants")}>
            Back to Organizations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/superadmin/tenants")}
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
                    <Badge variant={tenant.is_active ? "default" : "destructive"}>
                      {tenant.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Created {format(new Date(tenant.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleViewAsTenant}>
                <EyeIcon className="w-4 h-4 mr-2" />
                View as Admin
              </Button>
              <Button
                variant={tenant.is_active ? "destructive" : "default"}
                onClick={() => setSuspendDialogOpen(true)}
              >
                {tenant.is_active ? (
                  <>
                    <PauseIcon className="w-4 h-4 mr-2" />
                    Suspend
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4 mr-2" />
                    Activate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="branches">Branches ({branches.length})</TabsTrigger>
            <TabsTrigger value="limits">Permissions & Limits</TabsTrigger>
            <TabsTrigger value="biometric">Biometric Devices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Basic information about this gym organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Organization Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <Input value={tenant.slug} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+91 9876543210"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveDetails} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Branches</p>
                  <p className="text-2xl font-bold">{tenant.usage?.branches_count || branches.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Members</p>
                  <p className="text-2xl font-bold">{tenant.usage?.members_count || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Staff</p>
                  <p className="text-2xl font-bold">{tenant.usage?.staff_count || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Trainers</p>
                  <p className="text-2xl font-bold">{tenant.usage?.trainers_count || 0}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Branches</h3>
              <Button onClick={() => setAddBranchDialogOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Branch
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((branch) => (
                      <TableRow 
                        key={branch.id} 
                        className="cursor-pointer hover:bg-accent/50 transition-colors duration-150"
                        onClick={() => handleOpenBranchDetail(branch)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BuildingOffice2Icon className="w-4 h-4 text-primary shrink-0" />
                            {branch.name}
                            {branch.is_default && (
                              <Badge variant="secondary" className="text-xs">Default</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {branch.address || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {branch.phone || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={branch.is_active ? "default" : "secondary"}>
                            {branch.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleToggleBranchStatus(branch); }}
                              title={branch.is_active ? "Suspend" : "Activate"}
                            >
                              {branch.is_active ? (
                                <PauseIcon className="w-4 h-4" />
                              ) : (
                                <PlayIcon className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch); }}
                              className="text-destructive"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {branches.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No branches found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="limits" className="space-y-6">
            {/* Module Permissions */}
            <Card>
              <CardHeader>
                <CardTitle>Module Permissions</CardTitle>
                <CardDescription>
                  Toggle feature modules for this gym. Disabled modules are hidden from the gym admin dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: "members_management", label: "Members Management", desc: "Add, edit, view gym members" },
                    { key: "attendance", label: "Attendance", desc: "Check-in/out tracking & insights" },
                    { key: "payments_billing", label: "Payments & Billing", desc: "Payments, ledger, invoices" },
                    { key: "staff_management", label: "Staff Management", desc: "Manage staff accounts & roles" },
                    { key: "reports_analytics", label: "Reports & Analytics", desc: "Revenue, growth & performance charts" },
                    { key: "workout_diet_plans", label: "Workout/Diet Plans", desc: "Create workout & diet plans" },
                    { key: "notifications", label: "Notifications (SMS/WhatsApp)", desc: "Automated & manual notifications" },
                    { key: "integrations", label: "Integrations (Razorpay)", desc: "Payment gateway integrations" },
                    { key: "leads_crm", label: "Leads/Enquiries CRM", desc: "Manage leads & follow-ups" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Switch
                        checked={editFeatures[key] ?? false}
                        onCheckedChange={(checked) => handleToggleFeature(key, checked)}
                        disabled={isSavingFeatures}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Usage Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Usage Limits</CardTitle>
                <CardDescription>
                  Configure resource quotas. Actions are blocked when limits are reached.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Branches</Label>
                    <Input
                      type="number"
                      value={editLimits.max_branches}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_branches: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Current: {tenant.usage?.branches_count || branches.length}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Staff per Branch</Label>
                    <Input
                      type="number"
                      value={editLimits.max_staff_per_branch}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_staff_per_branch: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Members</Label>
                    <Input
                      type="number"
                      value={editLimits.max_members}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_members: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Current: {tenant.usage?.members_count || 0}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Trainers</Label>
                    <Input
                      type="number"
                      value={editLimits.max_trainers}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_trainers: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Current: {tenant.usage?.trainers_count || 0}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly WhatsApp</Label>
                    <Input
                      type="number"
                      value={editLimits.max_monthly_whatsapp_messages}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_monthly_whatsapp_messages: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used this month: {tenant.usage?.whatsapp_this_month || 0}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Check-ins</Label>
                    <Input
                      type="number"
                      value={editLimits.max_monthly_checkins}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_monthly_checkins: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used this month: {tenant.usage?.monthly_checkins || 0}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Storage Limit (MB)</Label>
                    <Input
                      type="number"
                      value={editLimits.max_storage_mb}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, max_storage_mb: parseInt(e.target.value) || 0 }))}
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan Expiry Date</Label>
                    <Input
                      type="date"
                      value={editLimits.plan_expiry_date}
                      onChange={(e) => setEditLimits(prev => ({ ...prev, plan_expiry_date: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {editLimits.plan_expiry_date ? (
                        new Date(editLimits.plan_expiry_date) < new Date() ? 
                          <span className="text-destructive font-medium">Expired</span> : 
                          `Expires ${format(new Date(editLimits.plan_expiry_date), "MMM d, yyyy")}`
                      ) : "No expiry set"}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={handleSaveLimits} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Limits"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="biometric" className="space-y-4">
            <BiometricDevicesSection branches={branches} tenantId={tenant.id} />
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <RazorpayCredentialsTab tenantId={tenant.id} />
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Users</CardTitle>
                <CardDescription>Users who have access to this organization</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenant.members?.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-mono text-sm">
                          {member.user_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{member.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {member.is_owner ? (
                            <Badge variant="default">Owner</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(member.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!tenant.members || tenant.members.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Suspend/Activate Dialog */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tenant.is_active ? "Suspend Organization" : "Activate Organization"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tenant.is_active
                ? `Are you sure you want to suspend "${tenant.name}"? This will prevent all users from accessing their dashboard and data.`
                : `Are you sure you want to activate "${tenant.name}"? This will restore access for all users.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspendToggle}
              disabled={isSaving}
              className={tenant.is_active ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {isSaving ? "Processing..." : tenant.is_active ? "Suspend" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Branch Dialog */}
      <AlertDialog open={addBranchDialogOpen} onOpenChange={setAddBranchDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new branch for this organization. As Super Admin, this bypasses any branch limits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Branch Name *</Label>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Downtown Branch"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                placeholder="123 Main Street"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateBranch} disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Branch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Branch Detail Dialog */}
      <Dialog open={!!selectedBranch} onOpenChange={(open) => !open && setSelectedBranch(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BuildingOffice2Icon className="w-5 h-5 text-primary" />
              {selectedBranch?.name}
              {selectedBranch?.is_default && (
                <Badge variant="secondary" className="text-xs">Default</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {branchDetailLoading ? (
            <div className="space-y-3 py-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-5 py-2">
              {/* Branch Info */}
              <div className="space-y-2">
                {selectedBranch?.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPinIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedBranch.address}</span>
                  </div>
                )}
                {selectedBranch?.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <PhoneIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedBranch.phone}</span>
                  </div>
                )}
                {selectedBranch?.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <EnvelopeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{selectedBranch.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Created {selectedBranch ? format(new Date(selectedBranch.created_at), "MMM d, yyyy") : ""}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={selectedBranch?.is_active ? "default" : "secondary"}>
                    {selectedBranch?.is_active ? "Active" : "Inactive"}
                  </Badge>
                  {branchDetails?.gymSettings?.whatsapp_enabled && (
                    <Badge variant="outline" className="border-green-500 text-green-600 text-xs">WhatsApp Enabled</Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* Members Breakdown */}
              <div>
                <p className="text-sm font-semibold mb-2">Members Overview</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold">{branchDetails?.membersCount ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-green-600">{branchDetails?.activeMembers ?? 0}</p>
                    <p className="text-[10px] text-green-600/70">Active</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-yellow-600">{branchDetails?.expiredMembers ?? 0}</p>
                    <p className="text-[10px] text-yellow-600/70">Expired</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-red-500">{branchDetails?.inactiveMembers ?? 0}</p>
                    <p className="text-[10px] text-red-500/70">Inactive</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Resources & Operations */}
              <div>
                <p className="text-sm font-semibold mb-2">Resources & Operations</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UserGroupIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.staffCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Staff</p>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UsersIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.trainersCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Trainers</p>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FingerPrintIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.devicesCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Bio Devices</p>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.whatsappSentThisMonth ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">WA This Month</p>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ClockIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.attendanceToday ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Check-ins Today</p>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CheckCircleIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold">{branchDetails?.attendanceThisMonth ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Check-ins Month</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Revenue */}
              <div>
                <p className="text-sm font-semibold mb-2">Revenue</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">This Month</p>
                    <p className="text-lg font-bold">₹{(branchDetails?.monthlyRevenue ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">All Time</p>
                    <p className="text-lg font-bold">₹{(branchDetails?.totalRevenue ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                {branchDetails?.lastPaymentDate && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Last payment: {format(new Date(branchDetails.lastPaymentDate), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>

              {/* Gym Settings */}
              {branchDetails?.gymSettings && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Gym Settings</p>
                    <div className="text-sm space-y-1">
                      {branchDetails.gymSettings.gym_name && (
                        <p><span className="text-muted-foreground">Name:</span> {branchDetails.gymSettings.gym_name}</p>
                      )}
                      {branchDetails.gymSettings.gym_phone && (
                        <p><span className="text-muted-foreground">Phone:</span> {branchDetails.gymSettings.gym_phone}</p>
                      )}
                      {branchDetails.gymSettings.gym_address && (
                        <p><span className="text-muted-foreground">Address:</span> {branchDetails.gymSettings.gym_address}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
