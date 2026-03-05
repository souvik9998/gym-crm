import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";

interface GymSettings {
  id: string;
  gym_name: string | null;
  gym_phone: string | null;
  gym_address: string | null;
  whatsapp_enabled: boolean | null;
}

interface MonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
  is_active: boolean;
}

interface CustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: boolean;
}

interface SettingsPageDataResponse {
  settings: GymSettings | null;
  monthlyPackages: MonthlyPackage[];
  customPackages: CustomPackage[];
}

export function useSettingsPageData() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  const { data, isLoading, refetch } = useQuery<SettingsPageDataResponse>({
    queryKey: ["settings-page-data", branchId],
    queryFn: () =>
      protectedFetch<SettingsPageDataResponse>({
        action: "settings-page-data",
        params: { branchId },
      }),
    enabled: !!branchId,
    staleTime: STALE_TIMES.REAL_TIME, // 30s - settings must reflect changes instantly after mutations
    gcTime: GC_TIME,
  });

  return {
    settings: data?.settings || null,
    monthlyPackages: data?.monthlyPackages || [],
    customPackages: data?.customPackages || [],
    isLoading,
    refetch,
  };
}

export type { GymSettings, MonthlyPackage, CustomPackage };
