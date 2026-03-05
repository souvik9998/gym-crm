import { useState, useEffect, Fragment, memo, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { User } from "@supabase/supabase-js";
import { WhatsAppTemplates } from "@/components/admin/WhatsAppTemplates";
import { WhatsAppAutoSendSettings } from "@/components/admin/WhatsAppAutoSendSettings";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { BranchManagement } from "@/components/admin/BranchManagement";
import { SubscriptionPlanTab } from "@/components/admin/SubscriptionPlanTab";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStaffOperations } from "@/hooks/useStaffOperations";
import { useSettingsPageData } from "@/hooks/queries/useSettingsPageData";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { ButtonSpinner } from "@/components/ui/button-spinner";

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

/** Skeleton for Packages tab */
const SettingsPackagesSkeleton = memo(() => (
  <div className="space-y-4 lg:space-y-6">
    {[0, 1].map((i) => (
      <Card key={i} className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <Skeleton className="h-5 lg:h-6 w-40" />
          <Skeleton className="h-3 lg:h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="grid gap-2 lg:gap-4 grid-cols-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-1 lg:space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 lg:h-12 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-9 lg:h-10 w-32" />
          <div className="space-y-2 lg:space-y-3 pt-3 lg:pt-4 border-t">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex items-center gap-2 lg:gap-4 p-3 lg:p-4 bg-muted/50 rounded-lg">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
));
SettingsPackagesSkeleton.displayName = "SettingsPackagesSkeleton";

/** Skeleton for General tab */
const SettingsGeneralSkeleton = memo(() => (
  <div className="space-y-4 lg:space-y-6">
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <Skeleton className="h-5 lg:h-6 w-40" />
        <Skeleton className="h-3 lg:h-4 w-56 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
        <div className="grid gap-2 lg:gap-4 grid-cols-1 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-1 lg:space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 lg:h-12 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-1 lg:space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 lg:h-12 w-full" />
        </div>
      </CardContent>
    </Card>
    <Skeleton className="h-9 lg:h-10 w-full" />
  </div>
));
SettingsGeneralSkeleton.displayName = "SettingsGeneralSkeleton";

const AdminSettings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions } = useStaffAuth();
  const staffOps = useStaffOperations();
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Use aggregated settings page data hook (single API call)
  const { settings: fetchedSettings, monthlyPackages: fetchedMonthlyPackages, customPackages: fetchedCustomPackages, isLoading: isLoadingData, refetch: refetchData } = useSettingsPageData();
  
  // Cache invalidation for cross-page updates
  const { invalidateSettings } = useInvalidateQueries();
  
  // Loading states for toggle buttons
  const [isTogglingWhatsApp, setIsTogglingWhatsApp] = useState(false);
  const [togglingMonthlyId, setTogglingMonthlyId] = useState<string | null>(null);
  const [togglingCustomId, setTogglingCustomId] = useState<string | null>(null);

  // Loading states for CRUD buttons
  const [isAddingMonthly, setIsAddingMonthly] = useState(false);
  const [savingMonthlyId, setSavingMonthlyId] = useState<string | null>(null);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [savingCustomId, setSavingCustomId] = useState<string | null>(null);
  
  // Track recently added items for highlight animation
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());

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

  // Sync hook data to local state when it arrives
  useEffect(() => {
    if (fetchedSettings) {
      setSettings(fetchedSettings);
      setGymName(fetchedSettings.gym_name || "");
      setGymPhone(fetchedSettings.gym_phone || "");
      setGymAddress(fetchedSettings.gym_address || "");
      setWhatsappEnabled(fetchedSettings.whatsapp_enabled === true);
    }
  }, [fetchedSettings]);

  useEffect(() => {
    if (fetchedMonthlyPackages) {
      setMonthlyPackages(fetchedMonthlyPackages);
    }
  }, [fetchedMonthlyPackages]);

  useEffect(() => {
    if (fetchedCustomPackages) {
      setCustomPackages(fetchedCustomPackages);
    }
  }, [fetchedCustomPackages]);

  // Handle case where no settings exist for the branch - create them
  useEffect(() => {
    if (!isLoadingData && !fetchedSettings && currentBranch && (user || isStaffLoggedIn)) {
      // Create default settings for this branch
      const createDefaultSettings = async () => {
        const { error } = await supabase
          .from("gym_settings")
          .insert({
            branch_id: currentBranch.id,
            gym_name: currentBranch.name || "",
            gym_phone: currentBranch.phone || null,
            gym_address: currentBranch.address || null,
            whatsapp_enabled: false,
          });

        if (!error) {
          refetchData();
        } else {
          console.error("Error creating gym_settings:", error);
          setSettings(null);
          setGymName(currentBranch.name || "");
          setGymPhone(currentBranch.phone || "");
          setGymAddress(currentBranch.address || "");
          setWhatsappEnabled(false);
        }
      };
      createDefaultSettings();
    }
  }, [isLoadingData, fetchedSettings, currentBranch, user, isStaffLoggedIn, refetchData]);

  // Background invalidation for cross-page consistency (fire-and-forget)
  const backgroundInvalidate = () => {
    invalidateSettings().catch(() => {});
  };

  // Mark an item as recently added for highlight animation
  const markRecentlyAdded = useCallback((id: string) => {
    setRecentlyAddedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setRecentlyAddedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1500);
  }, []);

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
        // Instant local state update
        setSettings(prev => prev ? { ...prev, gym_name: gymName, gym_phone: gymPhone, gym_address: gymAddress } : prev);
        toast.success("Settings saved successfully");
        backgroundInvalidate();
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
      // Instant local state update
      setSettings(prev => prev ? { ...prev, gym_name: gymName, gym_phone: gymPhone, gym_address: gymAddress } : prev);
      toast.success("Settings saved successfully");
      backgroundInvalidate();
    }
  };

  // Monthly Package handlers
  const handleAddMonthlyPackage = async () => {
    setIsAddingMonthly(true);
    try {
    await _handleAddMonthlyPackage();
    } finally {
      setIsAddingMonthly(false);
    }
  };

  const _handleAddMonthlyPackage = async () => {
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
        const tempId = crypto.randomUUID();
        const tempPkg: MonthlyPackage = { id: tempId, months, price: Number(newMonthlyPackage.price), joining_fee: Number(newMonthlyPackage.joining_fee) || 0, is_active: true };
        setMonthlyPackages(prev => [...prev, tempPkg].sort((a, b) => a.months - b.months));
        markRecentlyAdded(tempId);
        toast.success("Package added");
        setNewMonthlyPackage({ months: "", price: "", joining_fee: "" });
        backgroundInvalidate();
      }
      return;
    }

    // Admin flow - use .select() to get the inserted record back
    const { data: inserted, error } = await supabase.from("monthly_packages").insert({
      months,
      price: Number(newMonthlyPackage.price),
      joining_fee: Number(newMonthlyPackage.joining_fee) || 0,
      branch_id: currentBranch.id,
    }).select().single();

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
      // Instant local state update
      if (inserted) {
        setMonthlyPackages(prev => [...prev, { id: inserted.id, months: inserted.months, price: inserted.price, joining_fee: inserted.joining_fee, is_active: inserted.is_active }].sort((a, b) => a.months - b.months));
        markRecentlyAdded(inserted.id);
      }
      toast.success("Package added");
      setNewMonthlyPackage({ months: "", price: "", joining_fee: "" });
      backgroundInvalidate();
    }
  };

  const handleEditMonthlyPackage = (pkg: MonthlyPackage) => {
    setEditingMonthlyId(pkg.id);
    setEditMonthlyData({ price: String(pkg.price), joining_fee: String(pkg.joining_fee) });
  };

  const handleSaveMonthlyPackage = async (id: string) => {
    setSavingMonthlyId(id);
    try {
    await _handleSaveMonthlyPackage(id);
    } finally {
      setSavingMonthlyId(null);
    }
  };

  const _handleSaveMonthlyPackage = async (id: string) => {
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
        // Instant local state update
        setMonthlyPackages(prev => prev.map(p => p.id === id ? { ...p, price: Number(editMonthlyData.price), joining_fee: Number(editMonthlyData.joining_fee) || 0 } : p));
        toast.success("Package updated");
        setEditingMonthlyId(null);
        backgroundInvalidate();
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
      // Instant local state update
      setMonthlyPackages(prev => prev.map(p => p.id === id ? { ...p, price: Number(editMonthlyData.price), joining_fee: Number(editMonthlyData.joining_fee) || 0 } : p));
      toast.success("Package updated");
      setEditingMonthlyId(null);
      backgroundInvalidate();
    }
  };

  const handleToggleMonthlyPackage = async (id: string, isActive: boolean) => {
    const pkg = monthlyPackages.find(p => p.id === id);

    // Optimistic: update local state instantly (Switch already flipped visually)
    setMonthlyPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: isActive } : p));
    setTogglingMonthlyId(id);

    try {
      let failed = false;

      if (isStaffLoggedIn && currentBranch) {
        const { error } = await staffOps.updateMonthlyPackage({
          packageId: id,
          branchId: currentBranch.id,
          isActive,
        });
        if (error) {
          failed = true;
          toast.error("Failed to update package", { description: error });
        }
      } else {
        const { error } = await supabase.from("monthly_packages").update({ is_active: isActive }).eq("id", id);
        if (error) {
          failed = true;
          toast.error("Failed to update package", { description: error.message });
        } else {
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
        }
      }

      if (failed) {
        // Revert optimistic update — Switch will smoothly animate back
        setMonthlyPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !isActive } : p));
      } else {
        toast.success(`Package ${isActive ? "activated" : "deactivated"}`);
      }
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
            // Instant local state update
            setMonthlyPackages(prev => prev.filter(p => p.id !== id));
            toast.success("Package deleted");
            backgroundInvalidate();
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
        // Instant local state update
        setMonthlyPackages(prev => prev.filter(p => p.id !== id));
        toast.success("Package deleted");
        backgroundInvalidate();
      },
    });
  };

  // Custom Package handlers
  const handleAddPackage = async () => {
    setIsAddingCustom(true);
    try {
    await _handleAddPackage();
    } finally {
      setIsAddingCustom(false);
    }
  };

  const _handleAddPackage = async () => {
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
        const tempId = crypto.randomUUID();
        const tempPkg: CustomPackage = { id: tempId, name: newPackage.name, duration_days: durationDays, price: Number(newPackage.price), is_active: true };
        setCustomPackages(prev => [...prev, tempPkg]);
        markRecentlyAdded(tempId);
        toast.success("Package added");
        setNewPackage({ name: "", duration_days: "", price: "" });
        backgroundInvalidate();
      }
      return;
    }

    // Admin flow - use .select() to get the inserted record back
    const { data: inserted, error } = await supabase.from("custom_packages").insert({
      name: newPackage.name,
      duration_days: durationDays,
      price: Number(newPackage.price),
      branch_id: currentBranch.id,
    }).select().single();

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
      // Instant local state update
      if (inserted) {
        setCustomPackages(prev => [...prev, { id: inserted.id, name: inserted.name, duration_days: inserted.duration_days, price: inserted.price, is_active: inserted.is_active }]);
        markRecentlyAdded(inserted.id);
      }
      toast.success("Package added");
      setNewPackage({ name: "", duration_days: "", price: "" });
      backgroundInvalidate();
    }
  };

  const handleEditPackage = (pkg: CustomPackage) => {
    setEditingPackageId(pkg.id);
    setEditPackageData({ name: pkg.name, price: String(pkg.price) });
  };

  const handleSavePackage = async (id: string) => {
    setSavingCustomId(id);
    try {
    await _handleSavePackage(id);
    } finally {
      setSavingCustomId(null);
    }
  };

  const _handleSavePackage = async (id: string) => {
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
        // Instant local state update
        setCustomPackages(prev => prev.map(p => p.id === id ? { ...p, name: editPackageData.name, price: Number(editPackageData.price) } : p));
        toast.success("Package updated");
        setEditingPackageId(null);
        backgroundInvalidate();
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
      // Instant local state update
      setCustomPackages(prev => prev.map(p => p.id === id ? { ...p, name: editPackageData.name, price: Number(editPackageData.price) } : p));
      toast.success("Package updated");
      setEditingPackageId(null);
      backgroundInvalidate();
    }
  };

  const handleTogglePackage = async (id: string, isActive: boolean) => {
    const pkg = customPackages.find(p => p.id === id);

    // Optimistic: update local state instantly
    setCustomPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: isActive } : p));
    setTogglingCustomId(id);

    try {
      let failed = false;

      if (isStaffLoggedIn && currentBranch) {
        const { error } = await staffOps.updateCustomPackage({
          packageId: id,
          branchId: currentBranch.id,
          isActive,
        });
        if (error) {
          failed = true;
          toast.error("Failed to update package", { description: error });
        }
      } else {
        const { error } = await supabase.from("custom_packages").update({ is_active: isActive }).eq("id", id);
        if (error) {
          failed = true;
          toast.error("Failed to update package", { description: error.message });
        } else {
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
        }
      }

      if (failed) {
        // Revert optimistic update
        setCustomPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !isActive } : p));
      } else {
        toast.success(`Package ${isActive ? "activated" : "deactivated"}`);
      }
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
            // Instant local state update
            setCustomPackages(prev => prev.filter(p => p.id !== id));
            toast.success("Package deleted");
            backgroundInvalidate();
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
        // Instant local state update
        setCustomPackages(prev => prev.filter(p => p.id !== id));
        toast.success("Package deleted");
        backgroundInvalidate();
      },
    });
  };

  return (
    <Fragment>
      <div className="max-w-4xl mx-auto space-y-4 lg:space-y-6">
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-5 bg-muted/50 h-auto">
            <TabsTrigger value="packages" className="gap-1 lg:gap-2 data-[state=active]:bg-background text-[10px] lg:text-sm px-1 lg:px-3 py-2">
              <CubeIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="hidden lg:inline">Packages</span>
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-1 lg:gap-2 data-[state=active]:bg-background text-[10px] lg:text-sm px-1 lg:px-3 py-2">
              <BuildingStorefrontIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="hidden lg:inline">Branches</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1 lg:gap-2 data-[state=active]:bg-background text-[10px] lg:text-sm px-1 lg:px-3 py-2">
              <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="hidden lg:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1 lg:gap-2 data-[state=active]:bg-background text-[10px] lg:text-sm px-1 lg:px-3 py-2">
              <Cog6ToothIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="hidden lg:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="gap-1 lg:gap-2 data-[state=active]:bg-background text-[10px] lg:text-sm px-1 lg:px-3 py-2">
              <ShieldCheckIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="hidden lg:inline">Plan</span>
            </TabsTrigger>
          </TabsList>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-4 lg:space-y-6 mt-4 lg:mt-6">
            {isLoadingData ? (
              <SettingsPackagesSkeleton />
            ) : (
            <>
            {/* Monthly Packages */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
                <CardTitle className="text-base lg:text-xl">Monthly Packages</CardTitle>
                <CardDescription className="text-xs lg:text-sm">Configure monthly subscription plans with custom pricing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
                <div className="grid gap-2 lg:gap-4 grid-cols-3">
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Duration *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newMonthlyPackage.months}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, months: e.target.value })}
                      placeholder="1, 3, 6"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Price (₹) *</Label>
                    <Input
                      type="number"
                      value={newMonthlyPackage.price}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, price: e.target.value })}
                      placeholder="1000"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Joining Fee</Label>
                    <Input
                      type="number"
                      value={newMonthlyPackage.joining_fee}
                      onChange={(e) => setNewMonthlyPackage({ ...newMonthlyPackage, joining_fee: e.target.value })}
                      placeholder="200"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                </div>
                <Button onClick={handleAddMonthlyPackage} disabled={isAddingMonthly} className="gap-1.5 lg:gap-2 h-9 lg:h-10 text-xs lg:text-sm">
                  {isAddingMonthly ? <ButtonSpinner /> : <PlusIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />}
                  {isAddingMonthly ? "Adding..." : "Add Package"}
                </Button>

                {monthlyPackages.length > 0 && (
                  <div className="space-y-2 lg:space-y-3 pt-3 lg:pt-4 border-t">
                    {monthlyPackages.map((pkg) => (
                      <div key={pkg.id} className={cn(
                        "group flex items-start gap-2 lg:gap-4 p-3 lg:p-4 bg-card border border-border/60 rounded-xl transition-all duration-300 hover:shadow-md hover:border-border",
                        recentlyAddedIds.has(pkg.id) && "animate-fade-in ring-2 ring-primary/30"
                      )}>
                        {editingMonthlyId === pkg.id ? (
                          <>
                            <div className="flex-1 grid grid-cols-2 gap-2 lg:gap-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] lg:text-xs text-muted-foreground">Price (₹)</Label>
                                <Input
                                  type="number"
                                  value={editMonthlyData.price}
                                  onChange={(e) => setEditMonthlyData({ ...editMonthlyData, price: e.target.value })}
                                  className="h-8 lg:h-9 text-xs lg:text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] lg:text-xs text-muted-foreground">Joining Fee (₹)</Label>
                                <Input
                                  type="number"
                                  value={editMonthlyData.joining_fee}
                                  onChange={(e) => setEditMonthlyData({ ...editMonthlyData, joining_fee: e.target.value })}
                                  className="h-8 lg:h-9 text-xs lg:text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 lg:gap-2 pt-5 lg:pt-6">
                              <Button 
                                size="icon" 
                                variant="outline"
                                onClick={() => handleSaveMonthlyPackage(pkg.id)}
                                disabled={savingMonthlyId === pkg.id}
                                className="h-8 w-8 lg:h-9 lg:w-9 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                              >
                                {savingMonthlyId === pkg.id ? <ButtonSpinner /> : <CheckIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />}
                              </Button>
                              <Button 
                                size="icon" 
                                variant="outline"
                                onClick={() => setEditingMonthlyId(null)}
                                className="h-8 w-8 lg:h-9 lg:w-9 transition-all duration-200"
                              >
                                <XMarkIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm lg:text-base">{pkg.months} {pkg.months === 1 ? "Month" : "Months"}</p>
                                {!pkg.is_active && (
                                  <span className="text-[10px] lg:text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Inactive</span>
                                )}
                              </div>
                              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                                ₹{pkg.price.toLocaleString()} + ₹{pkg.joining_fee.toLocaleString()} joining fee
                              </p>
                            </div>
                            <div className="flex items-center gap-2 lg:gap-3 shrink-0">
                              <Switch
                                id={`monthly-${pkg.id}`}
                                checked={pkg.is_active}
                                loading={togglingMonthlyId === pkg.id}
                                disabled={togglingMonthlyId !== null && togglingMonthlyId !== pkg.id}
                                onCheckedChange={(checked) => handleToggleMonthlyPackage(pkg.id, checked)}
                              />
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <Button variant="ghost" size="icon" onClick={() => handleEditMonthlyPackage(pkg)} className="h-8 w-8 lg:h-9 lg:w-9 rounded-lg text-muted-foreground hover:text-foreground">
                                  <PencilIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteMonthlyPackage(pkg.id, pkg.months)}
                                  className="h-8 w-8 lg:h-9 lg:w-9 rounded-lg text-muted-foreground hover:text-destructive"
                                >
                                  <TrashIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                </Button>
                              </div>
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
              <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
                <CardTitle className="text-base lg:text-xl">Daily Passes</CardTitle>
                <CardDescription className="text-xs lg:text-sm">Create packages for daily or short-term memberships (no joining fee)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
                <div className="grid gap-2 lg:gap-4 grid-cols-3">
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Name *</Label>
                    <Input
                      value={newPackage.name}
                      onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                      placeholder="1 Week"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Days *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newPackage.duration_days}
                      onChange={(e) => setNewPackage({ ...newPackage, duration_days: e.target.value })}
                      placeholder="7"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                  <div className="space-y-1 lg:space-y-2">
                    <Label className="text-xs lg:text-sm">Price (₹) *</Label>
                    <Input
                      type="number"
                      value={newPackage.price}
                      onChange={(e) => setNewPackage({ ...newPackage, price: e.target.value })}
                      placeholder="300"
                      className="h-9 lg:h-12 text-xs lg:text-base"
                    />
                  </div>
                </div>
                <Button onClick={handleAddPackage} className="gap-1.5 lg:gap-2 h-9 lg:h-10 text-xs lg:text-sm">
                  <PlusIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  Add Daily Pass
                </Button>

                {customPackages.length > 0 && (
                  <div className="space-y-2 lg:space-y-3 pt-3 lg:pt-4 border-t">
                    {customPackages.map((pkg) => (
                      <div key={pkg.id} className="group flex items-start gap-2 lg:gap-4 p-3 lg:p-4 bg-card border border-border/60 rounded-xl transition-all duration-200 hover:shadow-md hover:border-border">
                        {editingPackageId === pkg.id ? (
                          <>
                            <div className="flex-1 grid grid-cols-2 gap-2 lg:gap-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] lg:text-xs text-muted-foreground">Name</Label>
                                <Input
                                  value={editPackageData.name}
                                  onChange={(e) => setEditPackageData({ ...editPackageData, name: e.target.value })}
                                  className="h-8 lg:h-9 text-xs lg:text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] lg:text-xs text-muted-foreground">Price (₹)</Label>
                                <Input
                                  type="number"
                                  value={editPackageData.price}
                                  onChange={(e) => setEditPackageData({ ...editPackageData, price: e.target.value })}
                                  className="h-8 lg:h-9 text-xs lg:text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 lg:gap-2 pt-5 lg:pt-6">
                              <Button 
                                size="icon" 
                                variant="outline"
                                onClick={() => handleSavePackage(pkg.id)}
                                className="h-8 w-8 lg:h-9 lg:w-9 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                              >
                                <CheckIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="outline"
                                onClick={() => setEditingPackageId(null)}
                                className="h-8 w-8 lg:h-9 lg:w-9 transition-all duration-200"
                              >
                                <XMarkIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm lg:text-base">{pkg.name}</p>
                                {!pkg.is_active && (
                                  <span className="text-[10px] lg:text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Inactive</span>
                                )}
                              </div>
                              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                                {pkg.duration_days} {pkg.duration_days === 1 ? "Day" : "Days"} • ₹{pkg.price.toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 lg:gap-3 shrink-0">
                              <Switch
                                id={`custom-${pkg.id}`}
                                checked={pkg.is_active}
                                loading={togglingCustomId === pkg.id}
                                disabled={togglingCustomId !== null && togglingCustomId !== pkg.id}
                                onCheckedChange={(checked) => handleTogglePackage(pkg.id, checked)}
                              />
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <Button variant="ghost" size="icon" onClick={() => handleEditPackage(pkg)} className="h-8 w-8 lg:h-9 lg:w-9 rounded-lg text-muted-foreground hover:text-foreground">
                                  <PencilIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                                  className="h-8 w-8 lg:h-9 lg:w-9 rounded-lg text-muted-foreground hover:text-destructive"
                                >
                                  <TrashIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}
          </TabsContent>

          {/* Branches Tab */}
          <TabsContent value="branches" className="space-y-4 lg:space-y-6 mt-4 lg:mt-6">
            <BranchManagement />
          </TabsContent>

          {/* WhatsApp Templates */}
          <TabsContent value="whatsapp" className="space-y-4 lg:space-y-6 mt-4 lg:mt-6">
            {/* WhatsApp Enable/Disable Toggle */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
                <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
                  <ChatBubbleLeftEllipsisIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                  WhatsApp Messaging
                </CardTitle>
                <CardDescription className="text-xs lg:text-sm">Enable or disable all WhatsApp messaging features</CardDescription>
              </CardHeader>
              <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
                <div className="flex items-center justify-between p-3 lg:p-4 bg-card border border-border/60 rounded-xl transition-all duration-200 hover:shadow-md hover:border-border">
                  <div className="space-y-0.5 lg:space-y-1">
                    <p className="font-semibold text-sm lg:text-base">WhatsApp Notifications</p>
                    <p className="text-[10px] lg:text-sm text-muted-foreground">
                      {whatsappEnabled 
                        ? "Automated and manual WhatsApp messages are enabled" 
                        : "All WhatsApp messages are disabled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs lg:text-sm font-medium transition-colors duration-200 ${isTogglingWhatsApp ? 'text-muted-foreground' : whatsappEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                      {isTogglingWhatsApp ? "Updating..." : whatsappEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={whatsappEnabled}
                      loading={isTogglingWhatsApp}
                      onCheckedChange={async (checked) => {
                        if (!currentBranch?.id) return;
                        
                        // Optimistic: flip local state instantly
                        setWhatsappEnabled(checked);
                        setIsTogglingWhatsApp(true);
                        
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
                              setWhatsappEnabled(!checked); // revert
                              toast.error("Error", { description: createError.message });
                              return;
                            }
                            
                            settingsId = newSettings.id;
                            setSettings({ ...settings, id: settingsId } as GymSettings);
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
                            toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled");
                            return;
                          }

                          if (!settingsId) {
                            setWhatsappEnabled(!checked); // revert
                            toast.error("Settings not found");
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
                              setWhatsappEnabled(!checked); // revert
                              toast.error("Error", { description: error });
                            } else {
                              toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled");
                            }
                            return;
                          }
                          
                          // Admin flow
                          const { error } = await supabase
                            .from("gym_settings")
                            .update({ whatsapp_enabled: checked })
                            .eq("id", settingsId)
                            .eq("branch_id", currentBranch.id);
                          
                          if (error) {
                            setWhatsappEnabled(!checked); // revert
                            toast.error("Error", { description: error.message });
                          } else {
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
                            toast.success(checked ? "WhatsApp Enabled" : "WhatsApp Disabled");
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

            <WhatsAppAutoSendSettings whatsappEnabled={whatsappEnabled} />

            <WhatsAppTemplates />
          </TabsContent>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4 lg:space-y-6 mt-4 lg:mt-6">
            {isLoadingData ? (
              <SettingsGeneralSkeleton />
            ) : (
              <>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
                      <BuildingStorefrontIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                      Gym Information
                    </CardTitle>
                    <CardDescription className="text-xs lg:text-sm">Basic gym details and contact information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
                    <div className="grid gap-2 lg:gap-4 grid-cols-1 md:grid-cols-2">
                      <div className="space-y-1 lg:space-y-2">
                        <Label className="text-xs lg:text-sm">Gym Name</Label>
                        <Input value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Pro Plus Fitness" className="h-9 lg:h-12 text-xs lg:text-base" />
                      </div>
                      <div className="space-y-1 lg:space-y-2">
                        <Label className="text-xs lg:text-sm">Phone Number</Label>
                        <Input value={gymPhone} onChange={(e) => setGymPhone(e.target.value)} placeholder="+91 9876543210" className="h-9 lg:h-12 text-xs lg:text-base" />
                      </div>
                    </div>
                    <div className="space-y-1 lg:space-y-2">
                      <Label className="text-xs lg:text-sm">Address</Label>
                      <Input value={gymAddress} onChange={(e) => setGymAddress(e.target.value)} placeholder="Gym address" className="h-9 lg:h-12 text-xs lg:text-base" />
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full gap-1.5 lg:gap-2 h-9 lg:h-10 text-xs lg:text-sm">
                  <CheckIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  {isSaving ? "Saving..." : "Save Settings"}
                </Button>
              </>
            )}
          </TabsContent>
          {/* Subscription & Plan Tab */}
          <TabsContent value="subscription" className="space-y-4 lg:space-y-6 mt-4 lg:mt-6">
            <SubscriptionPlanTab />
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
