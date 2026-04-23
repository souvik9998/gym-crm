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
  gym_email: string | null;
  gym_gst: string | null;
  invoice_prefix: string | null;
  invoice_footer_message: string | null;
  invoice_tax_rate: number | null;
  invoice_terms: string | null;
  invoice_show_gst: boolean | null;
  invoice_brand_name: string | null;
  invoice_logo_url: string | null;
  invoice_palette: {
    header?: string;
    accent?: string;
    text?: string;
  } | null;
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
    staleTime: STALE_TIMES.SEMI_STATIC, // 5 min - invalidated on mutations
    gcTime: GC_TIME,
  });

  return {
    settings: data?.settings ?? null,
    // Return undefined when data hasn't loaded yet so consumers can distinguish
    // "not loaded" from "loaded but empty". Returning [] would let one-time
    // sync effects mistakenly capture an empty array before real data arrives.
    monthlyPackages: data?.monthlyPackages,
    customPackages: data?.customPackages,
    isLoading,
    refetch,
  };
}

export type { GymSettings, MonthlyPackage, CustomPackage };
