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
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { format } from "date-fns";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import RazorpayCredentialsTab from "@/components/superadmin/RazorpayCredentialsTab";

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
  });

  // Dialogs
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [addBranchDialogOpen, setAddBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");

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
          });
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
      await updateTenantLimits(tenant.id, editLimits);
      toast.success("Organization limits updated");
      await loadTenantData();
    } catch (error) {
      console.error("Error updating limits:", error);
      toast.error("Failed to update limits");
    } finally {
      setIsSaving(false);
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
    // Store the tenant context and navigate to admin dashboard
    localStorage.setItem("superadmin-impersonated-tenant", tenant.id);
    navigate("/admin/dashboard");
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
            <TabsTrigger value="limits">Limits & Usage</TabsTrigger>
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
                      <TableRow key={branch.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
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
                              onClick={() => handleToggleBranchStatus(branch)}
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
                              onClick={() => handleDeleteBranch(branch)}
                              className="text-destructive"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
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
            <Card>
              <CardHeader>
                <CardTitle>Resource Limits</CardTitle>
                <CardDescription>
                  Configure usage limits for this organization. As Super Admin, you can set any values.
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
    </div>
  );
}
