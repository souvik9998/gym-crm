import { useState, useEffect, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CurrencyRupeeIcon,
  CubeIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ChatBubbleLeftEllipsisIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { User } from "@supabase/supabase-js";
import { WhatsAppTemplates } from "@/components/admin/WhatsAppTemplates";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { BranchManagement } from "@/components/admin/BranchManagement";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStaffOperations } from "@/hooks/useStaffOperations";

interface CustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: boolean;
}

interface MonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
  is_active: boolean;
}

interface GymSettings {
  id: string;
  gym_name: string | null;
  gym_phone: string | null;
  gym_address: string | null;
  whatsapp_enabled: boolean | null;
}

const AdminSettings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions } = useStaffAuth();
  const staffOps = useStaffOperations();
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Loading states for toggle buttons
  const [isTogglingWhatsApp, setIsTogglingWhatsApp] = useState(false);
  const [togglingMonthlyId, setTogglingMonthlyId] = useState<string | null>(null);
  const [togglingCustomId, setTogglingCustomId] = useState<string | null>(null);

  // Gym Settings
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [gymName, setGymName] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  // Monthly Packages
  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [newMonthlyPackage, setNewMonthlyPackage] = useState({ months: "", price: "", joining_fee: "" });
  const [editingMonthlyId, setEditingMonthlyId] = useState<string | null>(null);
  const [editMonthlyData, setEditMonthlyData] = useState({ price: "", joining_fee: "" });

  // Custom Packages
  const [customPackages, setCustomPackages] = useState<CustomPackage[]>([]);
  const [newPackage, setNewPackage] = useState({ name: "", duration_days: "", price: "" });
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editPackageData, setEditPackageData] = useState({ name: "", price: "" });

  // Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    variant: "default",
  });

  // Get initial tab from URL
  const initialTab = searchParams.get("tab") || "packages";

  useEffect(() => {
    // For admin: watch auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch data when: admin is logged in OR staff is logged in
    if ((user || isStaffLoggedIn) && currentBranch) {
      fetchData();
    }
  }, [user, isStaffLoggedIn, currentBranch]);

  // Reset settings state when branch changes to ensure fresh data
  useEffect(() => {
    if (currentBranch) {
      // Reset to prevent showing old branch data while loading
      setSettings(null);
      setGymName("");
      setGymPhone("");
      setGymAddress("");
      setWhatsappEnabled(false);
      setMonthlyPackages([]);
      setCustomPackages([]);
    }
  }, [currentBranch?.id]);

  const fetchData = async () => {
    if (!currentBranch) return;

    // Fetch gym settings for the current branch
    let { data: settingsData } = await supabase
      .from("gym_settings")
      .select("id, gym_name, gym_phone, gym_address, whatsapp_enabled")
      .eq("branch_id", currentBranch.id)
      .limit(1)
      .maybeSingle();

    // If no settings exist, create them for this branch
    if (!settingsData) {
      const { data: newSettings, error: createError } = await supabase
        .from("gym_settings")
        .insert({
          branch_id: currentBranch.id,
          gym_name: currentBranch.name || "",
          gym_phone: currentBranch.phone || null,
          gym_address: currentBranch.address || null,
          whatsapp_enabled: false,
        })
        .select("id, gym_name, gym_phone, gym_address, whatsapp_enabled")
        .single();

      if (createError) {
        console.error("Error creating gym_settings:", createError);
        // Still set state even if creation fails
        setSettings(null);
        setGymName(currentBranch.name || "");
        setGymPhone(currentBranch.phone || "");
        setGymAddress(currentBranch.address || "");
        setWhatsappEnabled(false);
        return;
      }
      settingsData = newSettings;
    }

    if (settingsData) {
      setSettings(settingsData as GymSettings);
      setGymName(settingsData.gym_name || "");
      setGymPhone(settingsData.gym_phone || "");
      setGymAddress(settingsData.gym_address || "");
      setWhatsappEnabled(settingsData.whatsapp_enabled === true);
    } else {
      // Fallback: reset state
      setSettings(null);
      setGymName("");
      setGymPhone("");
      setGymAddress("");
      setWhatsappEnabled(false);
    }

    // Fetch monthly packages for the current branch
    const { data: monthlyData } = await supabase
      .from("monthly_packages")
      .select("*")
      .eq("branch_id", currentBranch.id)
      .order("months");

    if (monthlyData) {
      setMonthlyPackages(monthlyData);
    } else {
      setMonthlyPackages([]);
    }

    // Fetch custom packages for the current branch
    const { data: packagesData } = await supabase
      .from("custom_packages")
      .select("*")
      .eq("branch_id", currentBranch.id)
      .order("duration_days");

    if (packagesData) {
      setCustomPackages(packagesData);
    } else {
      setCustomPackages([]);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings?.id || !currentBranch?.id) return;
    setIsSaving(true);

    const oldSettings = { gym_name: settings.gym_name, gym_phone: settings.gym_phone, gym_address: settings.gym_address };
    const newSettings = { gym_name: gymName, gym_phone: gymPhone, gym_address: gymAddress };

    // Use staff operations if staff is logged in
    if (isStaffLoggedIn) {
      const { error } = await staffOps.updateGymSettings({
        settingsId: settings.id,
        branchId: currentBranch.id,
        gymName,
        gymPhone,
        gymAddress,
      });
      setIsSaving(false);
      if (error) {
        toast.error("Error", { description: error });
      } else {
        toast.success("Settings saved successfully");
      }
      return;
    }

    // Admin flow
    const { error } = await supabase
      .from("gym_settings")
      .update({
        gym_name: gymName,
        gym_phone: gymPhone,
        gym_address: gymAddress,
      })
      .eq("id", settings.id)
      .eq("branch_id", currentBranch.id);

    setIsSaving(false);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "settings",
        type: "gym_info_updated",
        description: `Updated gym information for ${currentBranch?.name || "branch"}`,
        entityType: "gym_settings",
        entityId: settings.id,
        entityName: currentBranch?.name || "Gym Settings",
        oldValue: oldSettings,
        newValue: newSettings,
        branchId: currentBranch?.id,
      });
      toast.success("Settings saved successfully");
    }
  };

  // Monthly Package handlers
  const handleAddMonthlyPackage = async () => {
    if (!newMonthlyPackage.months || !newMonthlyPackage.price) {
      toast.error("Please fill months and price");
      return;
    }

    if (!currentBranch) {
      toast.error("Please select a branch first");
      return;
    }

    const months = Number(newMonthlyPackage.months);
    
    if (monthlyPackages.some((p) => p.months === months)) {
      toast.error("A package with this duration already exists");
      return;
    }

    // Use staff operations if staff is logged in
    if (isStaffLoggedIn) {
      const { error } = await staffOps.addMonthlyPackage({
        branchId: currentBranch.id,
        months,
        price: Number(newMonthlyPackage.price),
        joiningFee: Number(newMonthlyPackage.joining_fee) || 0,
      });
      if (error) {
        toast.error("Error", { description: error });
      } else {
        toast.success("Package added");
        setNewMonthlyPackage({ months: "", price: "", joining_fee: "" });
        fetchData();
      }
      return;
    }

    // Admin flow
    const { error } = await supabase.from("monthly_packages").insert({
      months,
      price: Number(newMonthlyPackage.price),
      joining_fee: Number(newMonthlyPackage.joining_fee) || 0,
      branch_id: currentBranch.id,
    });

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "packages",
        type: "monthly_package_added",
        description: `Added ${months} month package at ₹${newMonthlyPackage.price}`,
        entityType: "monthly_packages",
        entityName: `${months} Month Package`,
        newValue: { months, price: Number(newMonthlyPackage.price), joining_fee: Number(newMonthlyPackage.joining_fee) || 0 },
        branchId: currentBranch.id,
      });
      toast.success("Package added");
      setNewMonthlyPackage({ months: "", price: "", joining_fee: "" });
      fetchData();
    }
  };

  const handleEditMonthlyPackage = (pkg: MonthlyPackage) => {
    setEditingMonthlyId(pkg.id);
    setEditMonthlyData({ price: String(pkg.price), joining_fee: String(pkg.joining_fee) });
  };

  const handleSaveMonthlyPackage = async (id: string) => {
    const pkg = monthlyPackages.find(p => p.id === id);
    const oldValue = pkg ? { price: pkg.price, joining_fee: pkg.joining_fee } : null;
    
    // Use staff operations if staff is logged in
    if (isStaffLoggedIn && currentBranch) {
      const { error } = await staffOps.updateMonthlyPackage({
        packageId: id,
        branchId: currentBranch.id,
        price: Number(editMonthlyData.price),
        joiningFee: Number(editMonthlyData.joining_fee) || 0,
      });
      if (error) {
        toast.error("Error", { description: error });
      } else {
        toast.success("Package updated");
        setEditingMonthlyId(null);
        fetchData();
      }
      return;
    }

    // Admin flow
    const { error } = await supabase
      .from("monthly_packages")
      .update({
        price: Number(editMonthlyData.price),
        joining_fee: Number(editMonthlyData.joining_fee) || 0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "packages",
        type: "monthly_package_updated",
        description: `Updated ${pkg?.months} month package pricing`,
        entityType: "monthly_packages",
        entityId: id,
        entityName: `${pkg?.months} Month Package`,
        oldValue,
        newValue: { price: Number(editMonthlyData.price), joining_fee: Number(editMonthlyData.joining_fee) || 0 },
        branchId: currentBranch?.id,
      });
      toast.success("Package updated");
      setEditingMonthlyId(null);
      fetchData();
    }
  };

  const handleToggleMonthlyPackage = async (id: string, isActive: boolean) => {
    const pkg = monthlyPackages.find(p => p.id === id);
    
    setTogglingMonthlyId(id);
    toast.loading(`${isActive ? "Activating" : "Deactivating"} package...`, { id: `toggle-monthly-${id}` });
    
    try {
      // Use staff operations if staff is logged in
      if (isStaffLoggedIn && currentBranch) {
        const { error } = await staffOps.updateMonthlyPackage({
          packageId: id,
          branchId: currentBranch.id,
          isActive,
        });
        if (error) {
          toast.error("Error", { id: `toggle-monthly-${id}`, description: error });
        } else {
          toast.success(`Package ${isActive ? "activated" : "deactivated"}`, { id: `toggle-monthly-${id}` });
          fetchData();
        }
        return;
      }

      // Admin flow
      await supabase.from("monthly_packages").update({ is_active: isActive }).eq("id", id);
      await logAdminActivity({
        category: "packages",
        type: "monthly_package_toggled",
        description: `${isActive ? "Activated" : "Deactivated"} ${pkg?.months} month package`,
        entityType: "monthly_packages",
        entityId: id,
        entityName: `${pkg?.months} Month Package`,
        newValue: { is_active: isActive },
        branchId: currentBranch?.id,
      });
      toast.success(`Package ${isActive ? "activated" : "deactivated"}`, { id: `toggle-monthly-${id}` });
      fetchData();
    } finally {
      setTogglingMonthlyId(null);
    }
  };

  const handleDeleteMonthlyPackage = (id: string, months: number) => {
    setConfirmDialog({
      open: true,
      title: "Delete Package",
      description: `Are you sure you want to delete the ${months} month package?`,
      variant: "destructive",
      onConfirm: async () => {
        // Use staff operations if staff is logged in
        if (isStaffLoggedIn && currentBranch) {
          const { error } = await staffOps.deleteMonthlyPackage({
            packageId: id,
            branchId: currentBranch.id,
          });
          if (error) {
            toast.error("Error", { description: error });
          } else {
            fetchData();
            toast.success("Package deleted");
          }
          return;
        }

        // Admin flow
        await supabase.from("monthly_packages").delete().eq("id", id);
        await logAdminActivity({
          category: "packages",
          type: "monthly_package_deleted",
          description: `Deleted ${months} month package`,
          entityType: "monthly_packages",
          entityId: id,
          entityName: `${months} Month Package`,
          branchId: currentBranch?.id,
        });
        fetchData();
        toast.success("Package deleted");
      },
    });
  };

  // Custom Package handlers
  const handleAddPackage = async () => {
    if (!newPackage.name || !newPackage.duration_days || !newPackage.price) {
      toast.error("Please fill all fields");
      return;
    }

    if (!currentBranch) {
      toast.error("Please select a branch first");
      return;
    }

    const durationDays = Number(newPackage.duration_days);
    
    if (customPackages.some((p) => p.duration_days === durationDays)) {
      toast.error("A package with this duration already exists");
      return;
    }

    // Use staff operations if staff is logged in
    if (isStaffLoggedIn) {
      const { error } = await staffOps.addCustomPackage({
        branchId: currentBranch.id,
        name: newPackage.name,
        durationDays,
        price: Number(newPackage.price),
      });
      if (error) {
        toast.error("Error", { description: error });
      } else {
        toast.success("Package added");
        setNewPackage({ name: "", duration_days: "", price: "" });
        fetchData();
      }
      return;
    }

    // Admin flow
    const { error } = await supabase.from("custom_packages").insert({
      name: newPackage.name,
      duration_days: durationDays,
      price: Number(newPackage.price),
      branch_id: currentBranch.id,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("A package with this duration already exists");
      } else {
        toast.error("Error", {
          description: error.message,
        });
      }
    } else {
      await logAdminActivity({
        category: "packages",
        type: "custom_package_added",
        description: `Added daily pass "${newPackage.name}" (${durationDays} days) at ₹${newPackage.price}`,
        entityType: "custom_packages",
        entityName: newPackage.name,
        newValue: { name: newPackage.name, duration_days: durationDays, price: Number(newPackage.price) },
        branchId: currentBranch.id,
      });
      toast.success("Package added");
      setNewPackage({ name: "", duration_days: "", price: "" });
      fetchData();
    }
  };

  const handleEditPackage = (pkg: CustomPackage) => {
    setEditingPackageId(pkg.id);
    setEditPackageData({ name: pkg.name, price: String(pkg.price) });
  };

  const handleSavePackage = async (id: string) => {
    if (!editPackageData.name || !editPackageData.price) {
      toast.error("Name and price are required");
      return;
    }

    const pkg = customPackages.find(p => p.id === id);
    const oldValue = pkg ? { name: pkg.name, price: pkg.price } : null;

    // Use staff operations if staff is logged in
    if (isStaffLoggedIn && currentBranch) {
      const { error } = await staffOps.updateCustomPackage({
        packageId: id,
        branchId: currentBranch.id,
        name: editPackageData.name,
        price: Number(editPackageData.price),
      });
      if (error) {
        toast.error("Error", { description: error });
      } else {
        toast.success("Package updated");
        setEditingPackageId(null);
        fetchData();
      }
      return;
    }

    // Admin flow
    const { error } = await supabase
      .from("custom_packages")
      .update({
        name: editPackageData.name,
        price: Number(editPackageData.price),
      })
      .eq("id", id);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "packages",
        type: "custom_package_updated",
        description: `Updated daily pass "${editPackageData.name}"`,
        entityType: "custom_packages",
        entityId: id,
        entityName: editPackageData.name,
        oldValue,
        newValue: { name: editPackageData.name, price: Number(editPackageData.price) },
        branchId: currentBranch?.id,
      });
      toast.success("Package updated");
      setEditingPackageId(null);
      fetchData();
    }
  };

  const handleTogglePackage = async (id: string, isActive: boolean) => {
    const pkg = customPackages.find(p => p.id === id);
    
    setTogglingCustomId(id);
    toast.loading(`${isActive ? "Activating" : "Deactivating"} package...`, { id: `toggle-custom-${id}` });
    
    try {
      // Use staff operations if staff is logged in
      if (isStaffLoggedIn && currentBranch) {
        const { error } = await staffOps.updateCustomPackage({
          packageId: id,
          branchId: currentBranch.id,
          isActive,
        });
        if (error) {
          toast.error("Error", { id: `toggle-custom-${id}`, description: error });
        } else {
          toast.success(`Package ${isActive ? "activated" : "deactivated"}`, { id: `toggle-custom-${id}` });
          fetchData();
        }
        return;
      }

      // Admin flow
      await supabase.from("custom_packages").update({ is_active: isActive }).eq("id", id);
      await logAdminActivity({
        category: "packages",
        type: "custom_package_toggled",
        description: `${isActive ? "Activated" : "Deactivated"} daily pass "${pkg?.name}"`,
        entityType: "custom_packages",
        entityId: id,
        entityName: pkg?.name,
        oldValue: { is_active: !isActive },
        newValue: { is_active: isActive },
        branchId: currentBranch?.id,
      });
      toast.success(`Package ${isActive ? "activated" : "deactivated"}`, { id: `toggle-custom-${id}` });
      fetchData();
    } finally {
      setTogglingCustomId(null);
    }
  };

  const handleDeletePackage = (id: string, name: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Package",
      description: `Are you sure you want to delete "${name}"?`,
      variant: "destructive",
      onConfirm: async () => {
        const pkg = customPackages.find(p => p.id === id);
        
        // Use staff operations if staff is logged in
        if (isStaffLoggedIn && currentBranch) {
          const { error } = await staffOps.deleteCustomPackage({
            packageId: id,
            branchId: currentBranch.id,
          });
          if (error) {
            toast.error("Error", { description: error });
          } else {
            fetchData();
            toast.success("Package deleted");
          }
          return;
        }

        // Admin flow
        await supabase.from("custom_packages").delete().eq("id", id);
        await logAdminActivity({
          category: "packages",
          type: "custom_package_deleted",
          description: `Deleted daily pass "${name}"`,
          entityType: "custom_packages",
          entityId: id,
          entityName: name,
          oldValue: pkg ? { name: pkg.name, duration_days: pkg.duration_days, price: pkg.price } : null,
          branchId: currentBranch?.id,
        });
        fetchData();
        toast.success("Package deleted");
      },
    });
  };

  return (
    <Fragment>
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-4 bg-muted/50">
            <TabsTrigger value="packages" className="gap-2 data-[state=active]:bg-background">
              <CubeIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Packages</span>
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-2 data-[state=active]:bg-background">
              <BuildingStorefrontIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Branches</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2 data-[state=active]:bg-background">
              <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-background">
              <Cog6ToothIcon className="w-4 h-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
          </TabsList>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-6 mt-6">
            {/* Monthly Packages */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Monthly Packages</CardTitle>
                <CardDescription>Configure monthly subscription plans with custom pricing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Duration (Months) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newMonthlyPackage.months}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, months: e.target.value })}
                      placeholder="e.g., 1, 3, 6"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (₹) *</Label>
                    <Input
                      type="number"
                      value={newMonthlyPackage.price}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, price: e.target.value })}
                      placeholder="e.g., 1000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Joining Fee (₹)</Label>
                    <Input
                      type="number"
                      value={newMonthlyPackage.joining_fee}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, joining_fee: e.target.value })}
                      placeholder="e.g., 200"
                    />
                  </div>
                </div>
                <Button onClick={handleAddMonthlyPackage} className="gap-2">
                  <PlusIcon className="w-4 h-4" />
                  Add Package
                </Button>

                {monthlyPackages.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    {monthlyPackages.map((pkg) => (
                      <div key={pkg.id} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                        {editingMonthlyId === pkg.id ? (
                          <>
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Price (₹)</Label>
                                <Input
                                  type="number"
                                  value={editMonthlyData.price}
                                  onChange={(e) => setEditMonthlyData({ ...editMonthlyData, price: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Joining Fee (₹)</Label>
                                <Input
                                  type="number"
                                  value={editMonthlyData.joining_fee}
                                  onChange={(e) => setEditMonthlyData({ ...editMonthlyData, joining_fee: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => handleSaveMonthlyPackage(pkg.id)}
                                className="h-9 w-9 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-800 dark:hover:text-green-300 border border-green-200 dark:border-green-800 transition-all duration-150 shadow-sm hover:shadow-md"
                              >
                                <CheckIcon className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => setEditingMonthlyId(null)}
                                className="h-9 w-9 bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 transition-all duration-150 shadow-sm hover:shadow-md"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1">
                              <p className="font-medium">{pkg.months} {pkg.months === 1 ? "Month" : "Months"}</p>
                              <p className="text-sm text-muted-foreground">
                                ₹{pkg.price} + ₹{pkg.joining_fee} joining fee
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`monthly-${pkg.id}`} className="text-sm">Active</Label>
                                <Switch
                                  id={`monthly-${pkg.id}`}
                                  checked={pkg.is_active}
                                  disabled={togglingMonthlyId === pkg.id}
                                  onCheckedChange={(checked) => handleToggleMonthlyPackage(pkg.id, checked)}
                                />
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => handleEditMonthlyPackage(pkg)}>
                                <PencilIcon className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteMonthlyPackage(pkg.id, pkg.months)}
                              >
                                <TrashIcon className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily/Custom Packages */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Daily Passes</CardTitle>
                <CardDescription>Create packages for daily or short-term memberships (no joining fee)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Package Name *</Label>
                    <Input
                      value={newPackage.name}
                      onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                      placeholder="e.g., 1 Week Pass"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (Days) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newPackage.duration_days}
                      onChange={(e) => setNewPackage({ ...newPackage, duration_days: e.target.value })}
                      placeholder="e.g., 7"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (₹) *</Label>
                    <Input
                      type="number"
                      value={newPackage.price}
                      onChange={(e) => setNewPackage({ ...newPackage, price: e.target.value })}
                      placeholder="e.g., 300"
                    />
                  </div>
                </div>
                <Button onClick={handleAddPackage} className="gap-2">
                  <PlusIcon className="w-4 h-4" />
                  Add Daily Pass
                </Button>

                {customPackages.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    {customPackages.map((pkg) => (
                      <div key={pkg.id} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                        {editingPackageId === pkg.id ? (
                          <>
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Name</Label>
                                <Input
                                  value={editPackageData.name}
                                  onChange={(e) => setEditPackageData({ ...editPackageData, name: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Price (₹)</Label>
                                <Input
                                  type="number"
                                  value={editPackageData.price}
                                  onChange={(e) => setEditPackageData({ ...editPackageData, price: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => handleSavePackage(pkg.id)}
                                className="h-9 w-9 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-800 dark:hover:text-green-300 border border-green-200 dark:border-green-800 transition-all duration-150 shadow-sm hover:shadow-md"
                              >
                                <CheckIcon className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                onClick={() => setEditingPackageId(null)}
                                className="h-9 w-9 bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 transition-all duration-150 shadow-sm hover:shadow-md"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1">
                              <p className="font-medium">{pkg.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {pkg.duration_days} {pkg.duration_days === 1 ? "Day" : "Days"} • ₹{pkg.price}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`custom-${pkg.id}`} className="text-sm">Active</Label>
                                <Switch
                                  id={`custom-${pkg.id}`}
                                  checked={pkg.is_active}
                                  disabled={togglingCustomId === pkg.id}
                                  onCheckedChange={(checked) => handleTogglePackage(pkg.id, checked)}
                                />
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => handleEditPackage(pkg)}>
                                <PencilIcon className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                              >
                                <TrashIcon className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branches Tab */}
          <TabsContent value="branches" className="space-y-6 mt-6">
            <BranchManagement />
          </TabsContent>

          {/* WhatsApp Templates */}
          <TabsContent value="whatsapp" className="space-y-6 mt-6">
            {/* WhatsApp Enable/Disable Toggle */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-primary" />
                  WhatsApp Messaging
                </CardTitle>
                <CardDescription>Enable or disable all WhatsApp messaging features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">WhatsApp Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      {whatsappEnabled 
                        ? "Automated and manual WhatsApp messages are enabled" 
                        : "All WhatsApp messages are disabled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${isTogglingWhatsApp ? 'text-muted-foreground' : whatsappEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                      {isTogglingWhatsApp ? "Updating..." : whatsappEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={whatsappEnabled}
                      disabled={isTogglingWhatsApp}
                      onCheckedChange={async (checked) => {
                        if (!currentBranch?.id) return;
                        
                        setIsTogglingWhatsApp(true);
                        toast.loading(`${checked ? "Enabling" : "Disabling"} WhatsApp...`, { id: "toggle-whatsapp" });
                        
                        try {
                          let settingsId = settings?.id;
                          
                          // If settings don't exist, create them first (admin only)
                          if (!settingsId && !isStaffLoggedIn) {
                            const { data: newSettings, error: createError } = await supabase
                              .from("gym_settings")
                              .insert({
                                branch_id: currentBranch.id,
                                gym_name: currentBranch.name || "",
                                gym_phone: currentBranch.phone || null,
                                gym_address: currentBranch.address || null,
                                whatsapp_enabled: checked,
                              })
                              .select("id")
                              .single();
                            
                            if (createError) {
                              toast.error("Error", { id: "toggle-whatsapp", description: createError.message });
                              return;
                            }
                            
                            settingsId = newSettings.id;
                            setSettings({ ...settings, id: settingsId } as GymSettings);
                            setWhatsappEnabled(checked);
                            await logAdminActivity({
                              category: "settings",
                              type: "whatsapp_toggled",
                              description: `${checked ? "Enabled" : "Disabled"} WhatsApp messaging for ${currentBranch?.name || "branch"}`,
                              entityType: "gym_settings",
                              entityId: settingsId,
                              entityName: currentBranch?.name || "Gym Settings",
                              oldValue: { whatsapp_enabled: !checked },
                              newValue: { whatsapp_enabled: checked },
                              branchId: currentBranch?.id,
                            });
                            toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled", { id: "toggle-whatsapp" });
                            return;
                          }

                          if (!settingsId) {
                            toast.error("Settings not found", { id: "toggle-whatsapp" });
                            return;
                          }
                          
                          // Use staff operations if staff is logged in
                          if (isStaffLoggedIn) {
                            const { error } = await staffOps.toggleWhatsApp({
                              settingsId,
                              branchId: currentBranch.id,
                              enabled: checked,
                            });
                            if (error) {
                              toast.error("Error", { id: "toggle-whatsapp", description: error });
                            } else {
                              setWhatsappEnabled(checked);
                              toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled", {
                                id: "toggle-whatsapp",
                                description: checked 
                                  ? `WhatsApp messaging is now active for ${currentBranch?.name || "this branch"}` 
                                  : `All WhatsApp messages are now disabled for ${currentBranch?.name || "this branch"}`
                              });
                            }
                            return;
                          }
                          
                          // Admin flow - Update the WhatsApp enabled status
                          const { error } = await supabase
                            .from("gym_settings")
                            .update({ whatsapp_enabled: checked })
                            .eq("id", settingsId)
                            .eq("branch_id", currentBranch.id);
                          
                          if (error) {
                            toast.error("Error", { id: "toggle-whatsapp", description: error.message });
                          } else {
                            setWhatsappEnabled(checked);
                            await logAdminActivity({
                              category: "settings",
                              type: "whatsapp_toggled",
                              description: `${checked ? "Enabled" : "Disabled"} WhatsApp messaging for ${currentBranch?.name || "branch"}`,
                              entityType: "gym_settings",
                              entityId: settingsId,
                              entityName: currentBranch?.name || "Gym Settings",
                              oldValue: { whatsapp_enabled: !checked },
                              newValue: { whatsapp_enabled: checked },
                              branchId: currentBranch?.id,
                            });
                            toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled", {
                              id: "toggle-whatsapp",
                              description: checked 
                                ? `WhatsApp messaging is now active for ${currentBranch?.name || "this branch"}` 
                                : `All WhatsApp messages are now disabled for ${currentBranch?.name || "this branch"}`
                            });
                          }
                        } finally {
                          setIsTogglingWhatsApp(false);
                        }
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp API Plan Info */}
            <Card className="border-0 shadow-sm border-l-4 border-l-warning">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-warning" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-sm">WhatsApp API Plan Information</p>
                    <p className="text-xs text-muted-foreground">
                      Some message types (like promotional messages) may require a <strong>Periskope Pro or Enterprise plan</strong>. 
                      If you see "Plan Restriction" errors when sending messages, please contact your administrator to upgrade the WhatsApp API subscription.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <strong>Supported message types:</strong> Welcome messages, Renewal confirmations, Expiry reminders, Payment details, Staff credentials
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <WhatsAppTemplates />
          </TabsContent>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6 mt-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BuildingStorefrontIcon className="w-5 h-5 text-primary" />
                  Gym Information
                </CardTitle>
                <CardDescription>Basic gym details and contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Gym Name</Label>
                    <Input value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Pro Plus Fitness" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={gymPhone} onChange={(e) => setGymPhone(e.target.value)} placeholder="+91 9876543210" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={gymAddress} onChange={(e) => setGymAddress(e.target.value)} placeholder="Gym address" />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full gap-2">
              <CheckIcon className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText="Delete"
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
      />
    </Fragment>
  );
};

export default AdminSettings;
