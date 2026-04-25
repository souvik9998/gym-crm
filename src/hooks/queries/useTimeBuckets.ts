import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import {
  buildBucketOptions,
  DEFAULT_TIME_BUCKETS,
  type CustomTimeBucket,
  type TimeBucketOption,
} from "@/components/admin/staff/timeslots/timeSlotUtils";

/**
 * Resolves the active time-bucket chips for the current branch.
 *
 * Source of truth: `gym_settings.time_buckets` (jsonb array).
 * If empty / missing, falls back to the platform defaults so a fresh branch
 * still sees a usable Morning / Afternoon / Evening / Night chip strip.
 */
export function useTimeBuckets() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["time-buckets", branchId],
    queryFn: async (): Promise<CustomTimeBucket[]> => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("gym_settings")
        .select("time_buckets")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as any)?.time_buckets;
      if (!Array.isArray(raw) || raw.length === 0) return [];
      // Defensive sanitization — discard anything malformed so the UI never crashes.
      return raw
        .filter(
          (b: any) =>
            b &&
            typeof b.id === "string" &&
            typeof b.label === "string" &&
            typeof b.start_time === "string" &&
            typeof b.end_time === "string",
        )
        .map((b: any, idx: number) => ({
          id: b.id,
          label: b.label,
          emoji: typeof b.emoji === "string" && b.emoji.trim().length > 0 ? b.emoji : "⏰",
          start_time: b.start_time,
          end_time: b.end_time,
          sort_order: typeof b.sort_order === "number" ? b.sort_order : idx,
        }));
    },
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });

  // Falls back to the built-in defaults when the admin has not customized chips yet.
  const buckets: CustomTimeBucket[] = useMemo(
    () => (data && data.length > 0 ? data : DEFAULT_TIME_BUCKETS),
    [data],
  );

  const options: TimeBucketOption[] = useMemo(
    () => buildBucketOptions(data ?? []),
    [data],
  );

  // True when the admin has explicitly saved a custom set (not falling back to defaults).
  const isCustomized = (data?.length ?? 0) > 0;

  return { buckets, options, isCustomized, isLoading };
}
