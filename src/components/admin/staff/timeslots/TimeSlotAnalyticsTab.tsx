import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClockIcon, UserGroupIcon, ChartBarIcon, BoltIcon } from "@heroicons/react/24/outline";
import {
  formatTimeLabel,
  getTimeBucketForMinutes,
  getTimeBucketLabel,
  getUtilizationPercent,
  parseTimeToMinutes,
  type TimeSlotLite,
} from "./timeSlotUtils";

interface TimeSlotAnalyticsTabProps {
  currentBranch: { id?: string | null } | null;
  restrictedTrainerId?: string | null;
  trainerNameMap?: Record<string, string>;
}

interface DecoratedSlot extends TimeSlotLite {
  trainer_name: string;
  member_count: number;
  utilization: number;
  bucket: "morning" | "afternoon" | "evening" | "night";
}

const bucketPalette = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary-foreground))",
  "hsl(var(--muted-foreground))",
];

export const TimeSlotAnalyticsTab = ({
  currentBranch,
  restrictedTrainerId = null,
  trainerNameMap = {},
}: TimeSlotAnalyticsTabProps) => {
  const isMobile = useIsMobile();

  const { data, isLoading } = useQuery<DecoratedSlot[]>({
    queryKey: ["time-slot-analytics", currentBranch?.id, restrictedTrainerId, Object.keys(trainerNameMap).sort().join(",")],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      let slotQuery = supabase
        .from("trainer_time_slots")
        .select("id, trainer_id, start_time, end_time, capacity, status")
        .eq("branch_id", currentBranch.id)
        .order("start_time");

      if (restrictedTrainerId) {
        slotQuery = slotQuery.eq("trainer_id", restrictedTrainerId);
      }

      const { data: slots } = await slotQuery;
      if (!slots?.length) return [];

      const slotIds = slots.map((slot) => slot.id);
      const today = new Date().toISOString().split("T")[0];

      const [ptRowsResult, staffRowsResult] = await Promise.all([
        supabase
          .from("pt_subscriptions")
          .select("time_slot_id, member_id")
          .in("time_slot_id", slotIds)
          .eq("status", "active")
          .gte("end_date", today),
        supabase.rpc("get_staff_names_for_branch" as any, { _branch_id: currentBranch.id }),
      ]);

      const countsBySlot = new Map<string, Set<string>>();
      ((ptRowsResult.data as any[]) || []).forEach((row) => {
        if (!row.time_slot_id) return;
        if (!countsBySlot.has(row.time_slot_id)) {
          countsBySlot.set(row.time_slot_id, new Set());
        }
        countsBySlot.get(row.time_slot_id)?.add(row.member_id);
      });

      const rpcNameMap = new Map<string, string>();
      (((staffRowsResult.data as any[]) || []) as Array<{ id: string; full_name: string }>).forEach((row) => {
        rpcNameMap.set(row.id, row.full_name);
      });

      return (slots as TimeSlotLite[]).map((slot) => {
        const memberCount = countsBySlot.get(slot.id)?.size ?? 0;
        const bucket = getTimeBucketForMinutes(parseTimeToMinutes(slot.start_time));
        return {
          ...slot,
          trainer_name: trainerNameMap[slot.trainer_id] || rpcNameMap.get(slot.trainer_id) || "Unknown Trainer",
          member_count: memberCount,
          utilization: getUtilizationPercent(memberCount, slot.capacity),
          bucket,
        };
      });
    },
    enabled: !!currentBranch?.id,
    staleTime: 60_000,
  });

  const analytics = useMemo(() => {
    const slots = data || [];
    const totalSlots = slots.length;
    const totalMembers = slots.reduce((sum, slot) => sum + slot.member_count, 0);
    const totalCapacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
    const avgUtilization = totalCapacity ? Math.round((totalMembers / totalCapacity) * 100) : 0;
    const fullSlots = slots.filter((slot) => slot.member_count >= slot.capacity && slot.capacity > 0).length;

    const bucketMap = new Map<string, { label: string; members: number; slots: number; utilizationTotal: number }>();
    ["morning", "afternoon", "evening", "night"].forEach((bucket) => {
      bucketMap.set(bucket, { label: getTimeBucketLabel(bucket as any), members: 0, slots: 0, utilizationTotal: 0 });
    });

    slots.forEach((slot) => {
      const entry = bucketMap.get(slot.bucket)!;
      entry.members += slot.member_count;
      entry.slots += 1;
      entry.utilizationTotal += slot.utilization;
    });

    const peakHours = Array.from(bucketMap.entries()).map(([bucket, value]) => ({
      bucket,
      label: value.label,
      members: value.members,
      slots: value.slots,
      avgUtilization: value.slots ? Math.round(value.utilizationTotal / value.slots) : 0,
    }));

    const peakWindow = peakHours.reduce((best, current) =>
      current.members > best.members ? current : best,
      peakHours[0] || { label: "--", members: 0, slots: 0, avgUtilization: 0 },
    );

    const busiestSlots = [...slots]
      .sort((a, b) => (b.member_count === a.member_count ? parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time) : b.member_count - a.member_count))
      .slice(0, 6)
      .map((slot) => ({
        id: slot.id,
        label: `${formatTimeLabel(slot.start_time)}-${formatTimeLabel(slot.end_time)}`,
        trainer: slot.trainer_name,
        members: slot.member_count,
        utilization: slot.utilization,
      }));

    const trainerLoadMap = new Map<string, { trainer: string; members: number; slots: number }>();
    slots.forEach((slot) => {
      const existing = trainerLoadMap.get(slot.trainer_id) || { trainer: slot.trainer_name, members: 0, slots: 0 };
      existing.members += slot.member_count;
      existing.slots += 1;
      trainerLoadMap.set(slot.trainer_id, existing);
    });

    const trainerLoad = Array.from(trainerLoadMap.values())
      .sort((a, b) => b.members - a.members)
      .slice(0, 6);

    return {
      totalSlots,
      totalMembers,
      avgUtilization,
      fullSlots,
      peakWindow,
      peakHours,
      busiestSlots,
      trainerLoad,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="border-border/60">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-border/60"><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card className="border-border/60"><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!analytics.totalSlots) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 text-center">
          <ClockIcon className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No slot analytics yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create time slots to start tracking peak hours and trainer load.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-primary/10 p-2 text-primary"><ClockIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total slots</p>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalSlots}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-accent/20 p-2 text-accent-foreground"><UserGroupIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned members</p>
              <p className="text-2xl font-semibold text-foreground">{analytics.totalMembers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-secondary p-2 text-secondary-foreground"><ChartBarIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Avg utilization</p>
              <p className="text-2xl font-semibold text-foreground">{analytics.avgUtilization}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-muted p-2 text-foreground"><BoltIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Peak window</p>
              <p className="text-lg font-semibold text-foreground">{analytics.peakWindow.label}</p>
              <p className="text-xs text-muted-foreground">{analytics.peakWindow.members} active members</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Peak hours</CardTitle>
            <CardDescription>Member volume and average utilization by time window.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-3 sm:px-4 sm:pb-4">
            <ChartContainer
              config={{
                members: { label: "Members", color: "hsl(var(--primary))" },
                avgUtilization: { label: "Utilization", color: "hsl(var(--accent))" },
              }}
              className="h-[260px] sm:h-[320px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.peakHours} margin={{ top: 8, right: 8, left: isMobile ? -16 : -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.45} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="members" radius={[8, 8, 0, 0]}>
                    {analytics.peakHours.map((entry, index) => (
                      <Cell key={entry.bucket} fill={bucketPalette[index % bucketPalette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick insights</CardTitle>
            <CardDescription>Use these signals to tune staffing and slot creation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Busiest window</p>
                  <p className="text-xs text-muted-foreground">Most active members grouped by start time.</p>
                </div>
                <Badge variant="secondary">{analytics.peakWindow.label}</Badge>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Full slots</p>
                  <p className="text-xs text-muted-foreground">Slots currently at capacity.</p>
                </div>
                <Badge variant="outline">{analytics.fullSlots}</Badge>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">Trainer load</p>
              <div className="mt-3 space-y-2">
                {analytics.trainerLoad.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No trainer load data yet.</p>
                ) : (
                  analytics.trainerLoad.map((trainer) => (
                    <div key={trainer.trainer} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{trainer.trainer}</p>
                        <p className="text-xs text-muted-foreground">{trainer.slots} slot{trainer.slots === 1 ? "" : "s"}</p>
                      </div>
                      <Badge variant="secondary">{trainer.members} members</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top occupied slots</CardTitle>
            <CardDescription>Most used time slots with trainer names and utilization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.busiestSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No occupied slots yet.</p>
            ) : (
              analytics.busiestSlots.map((slot, index) => (
                <div key={slot.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <p className="font-medium text-foreground">{slot.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{slot.trainer}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{slot.members} members</p>
                      <p className="text-xs text-muted-foreground">{slot.utilization}% utilized</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${slot.utilization}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Window breakdown</CardTitle>
            <CardDescription>How many slots are available in each part of the day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.peakHours.map((window) => (
              <div key={window.bucket} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{window.label}</p>
                  <Badge variant="secondary">{window.slots} slots</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{window.members} members</span>
                  <span>{window.avgUtilization}% avg utilization</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
