/**
 * Protected Data API
 * 
 * Fetches full operational data for authenticated admin/staff users.
 * Uses the protected-data edge function which requires authorization.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface FullTrainer {
  id: string;
  name: string;
  phone: string | null;
  specialization: string | null;
  monthly_fee: number;
  monthly_salary: number;
  session_fee: number;
  percentage_fee: number;
  payment_category: string;
  is_active: boolean;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FullGymSettings {
  id: string;
  gym_name: string | null;
  gym_phone: string | null;
  gym_address: string | null;
  whatsapp_enabled: boolean | null;
  monthly_fee: number;
  joining_fee: number;
  monthly_packages: number[] | null;
  branch_id: string | null;
  updated_at: string | null;
}

export interface FullMonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
  is_active: boolean;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FullCustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: boolean;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FetchOptions {
  branchId?: string;
  authToken: string; // Staff session token or admin JWT
}

/**
 * Fetch full trainer data for admin/staff
 */
export async function fetchProtectedTrainers(options: FetchOptions): Promise<FullTrainer[]> {
  try {
    const params = new URLSearchParams({ action: "trainers" });
    if (options.branchId) params.append("branchId", options.branchId);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/protected-data?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${options.authToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch trainers");
    }

    const data = await response.json();
    return data.trainers || [];
  } catch (error) {
    console.error("Error fetching protected trainers:", error);
    throw error;
  }
}

/**
 * Fetch all trainers including inactive for management
 */
export async function fetchAllProtectedTrainers(options: FetchOptions): Promise<FullTrainer[]> {
  try {
    const params = new URLSearchParams({ action: "all-trainers" });
    if (options.branchId) params.append("branchId", options.branchId);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/protected-data?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${options.authToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch trainers");
    }

    const data = await response.json();
    return data.trainers || [];
  } catch (error) {
    console.error("Error fetching all protected trainers:", error);
    throw error;
  }
}

/**
 * Fetch full gym settings for admin/staff
 */
export async function fetchProtectedSettings(options: FetchOptions): Promise<FullGymSettings | null> {
  try {
    if (!options.branchId) {
      throw new Error("Branch ID required for settings");
    }

    const params = new URLSearchParams({ 
      action: "settings",
      branchId: options.branchId,
    });

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/protected-data?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${options.authToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch settings");
    }

    const data = await response.json();
    return data.settings || null;
  } catch (error) {
    console.error("Error fetching protected settings:", error);
    throw error;
  }
}

/**
 * Fetch all packages including inactive for management
 */
export async function fetchProtectedPackages(options: FetchOptions): Promise<{
  monthlyPackages: FullMonthlyPackage[];
  customPackages: FullCustomPackage[];
}> {
  try {
    const params = new URLSearchParams({ action: "packages" });
    if (options.branchId) params.append("branchId", options.branchId);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/protected-data?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${options.authToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch packages");
    }

    const data = await response.json();
    return {
      monthlyPackages: data.monthlyPackages || [],
      customPackages: data.customPackages || [],
    };
  } catch (error) {
    console.error("Error fetching protected packages:", error);
    throw error;
  }
}
