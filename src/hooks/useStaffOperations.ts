import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

interface StaffOperationResult<T = any> {
  data?: T;
  error?: string;
}

export const useStaffOperations = () => {
  const { session, isStaffLoggedIn } = useStaffAuth();

  const invokeStaffOperation = async <T = any>(
    action: string,
    body: Record<string, any>
  ): Promise<StaffOperationResult<T>> => {
    if (!isStaffLoggedIn || !session?.token) {
      return { error: "Not authenticated as staff" };
    }

    try {
      const { data, error } = await supabase.functions.invoke("staff-operations", {
        body,
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      // The function URL includes the action as a query param
      // But supabase.functions.invoke doesn't support query params directly
      // So we'll pass action in the body instead
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-operations?action=${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return { error: result.error || "Operation failed" };
      }

      return { data: result.data };
    } catch (err: any) {
      console.error("Staff operation error:", err);
      return { error: err.message || "Operation failed" };
    }
  };

  // Gym Settings Operations
  const updateGymSettings = async (params: {
    settingsId: string;
    branchId: string;
    gymName?: string;
    gymPhone?: string;
    gymAddress?: string;
    whatsappEnabled?: boolean;
  }) => {
    return invokeStaffOperation("update-gym-settings", params);
  };

  const toggleWhatsApp = async (params: {
    settingsId: string;
    branchId: string;
    enabled: boolean;
  }) => {
    return invokeStaffOperation("toggle-whatsapp", params);
  };

  // Monthly Package Operations
  const addMonthlyPackage = async (params: {
    branchId: string;
    months: number;
    price: number;
    joiningFee?: number;
  }) => {
    return invokeStaffOperation("add-monthly-package", params);
  };

  const updateMonthlyPackage = async (params: {
    packageId: string;
    branchId: string;
    months?: number;
    price?: number;
    joiningFee?: number;
    isActive?: boolean;
  }) => {
    return invokeStaffOperation("update-monthly-package", params);
  };

  const deleteMonthlyPackage = async (params: {
    packageId: string;
    branchId: string;
  }) => {
    return invokeStaffOperation("delete-monthly-package", params);
  };

  // Custom Package Operations
  const addCustomPackage = async (params: {
    branchId: string;
    name: string;
    durationDays: number;
    price: number;
  }) => {
    return invokeStaffOperation("add-custom-package", params);
  };

  const updateCustomPackage = async (params: {
    packageId: string;
    branchId: string;
    name?: string;
    durationDays?: number;
    price?: number;
    isActive?: boolean;
  }) => {
    return invokeStaffOperation("update-custom-package", params);
  };

  const deleteCustomPackage = async (params: {
    packageId: string;
    branchId: string;
  }) => {
    return invokeStaffOperation("delete-custom-package", params);
  };

  // Member Operations (requires can_manage_members)
  const addCashPayment = async (params: {
    branchId: string;
    memberId: string;
    amount: number;
    notes?: string;
    paymentType?: string;
  }) => {
    return invokeStaffOperation("add-cash-payment", params);
  };

  const updateMember = async (params: {
    branchId: string;
    memberId: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    gender?: string;
    photoIdType?: string;
    photoIdNumber?: string;
    dateOfBirth?: string;
  }) => {
    return invokeStaffOperation("update-member", params);
  };

  // Ledger Operations (requires can_access_ledger)
  const addLedgerEntry = async (params: {
    branchId: string;
    entryType: "income" | "expense";
    category: string;
    amount: number;
    description: string;
    notes?: string;
    entryDate?: string;
  }) => {
    return invokeStaffOperation("add-ledger-entry", params);
  };

  const deleteLedgerEntry = async (params: {
    branchId: string;
    entryId: string;
  }) => {
    return invokeStaffOperation("delete-ledger-entry", params);
  };

  return {
    // Gym Settings
    updateGymSettings,
    toggleWhatsApp,
    // Monthly Packages
    addMonthlyPackage,
    updateMonthlyPackage,
    deleteMonthlyPackage,
    // Custom Packages
    addCustomPackage,
    updateCustomPackage,
    deleteCustomPackage,
    // Member Operations
    addCashPayment,
    updateMember,
    // Ledger Operations
    addLedgerEntry,
    deleteLedgerEntry,
    // Utility
    isStaffLoggedIn,
  };
};
