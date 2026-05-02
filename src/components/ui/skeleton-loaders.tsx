import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * Dashboard stats skeleton — neutral, color-free placeholders that mirror
 * the live StatCard layout. Matches the analytics skeleton style.
 */
export const DashboardStatsSkeleton = memo(() => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-3.5 lg:gap-4 animate-fade-in-soft">
    {Array.from({ length: 4 }).map((_, i) => (
      <Card key={i} className="border border-border/60 shadow-sm">
        <CardContent className="p-2.5 md:p-3 lg:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-6 md:h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-9 md:h-10 md:w-10 rounded-xl shrink-0" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
));
DashboardStatsSkeleton.displayName = "DashboardStatsSkeleton";

/**
 * Full dashboard skeleton — neutral placeholders for stats + tabs + table.
 * Mirrors the actual dashboard layout so the swap to real content is seamless
 * (no hollow space, no popping sections).
 */
export const DashboardFullSkeleton = memo(() => (
  <div className="space-y-3 md:space-y-6 max-w-7xl mx-auto animate-fade-in-soft">
    {/* Stats */}
    <DashboardStatsSkeleton />

    {/* Tabs + search + actions card */}
    <Card className="border-0 shadow-sm">
      <CardHeader className="px-2 lg:px-6 pt-2 lg:pt-6 pb-2 lg:pb-4 border-b">
        <div className="flex flex-col gap-2 lg:gap-4">
          {/* Top row: tabs + search + actions */}
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="flex gap-1.5">
              <Skeleton className="h-8 lg:h-9 w-20 lg:w-24 rounded-md" />
              <Skeleton className="h-8 lg:h-9 w-20 lg:w-24 rounded-md" />
              <Skeleton className="h-8 lg:h-9 w-20 lg:w-24 rounded-md" />
            </div>
            <Skeleton className="h-8 lg:h-9 flex-1 max-w-md rounded-md" />
            <div className="ml-auto flex gap-1.5">
              <Skeleton className="h-8 lg:h-9 w-9 rounded-md" />
              <Skeleton className="h-8 lg:h-9 w-24 lg:w-28 rounded-md" />
            </div>
          </div>
          {/* Filter chips row */}
          <div className="flex flex-wrap gap-1.5 lg:gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-7 lg:h-8 w-20 lg:w-24 rounded-full" />
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 lg:pt-2 lg:px-6 lg:pb-6">
        {/* Table header */}
        <div className="hidden lg:grid grid-cols-12 gap-3 pb-3 border-b">
          <Skeleton className="h-3.5 w-20 col-span-3" />
          <Skeleton className="h-3.5 w-16 col-span-2" />
          <Skeleton className="h-3.5 w-14 col-span-2" />
          <Skeleton className="h-3.5 w-16 col-span-2" />
          <Skeleton className="h-3.5 w-16 col-span-2" />
          <Skeleton className="h-3.5 w-6 col-span-1 ml-auto" />
        </div>
        {/* Rows */}
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 py-2.5 lg:py-3 items-center">
              <div className="col-span-3 flex items-center gap-2 lg:gap-3 min-w-0">
                <Skeleton className="h-8 w-8 lg:h-9 lg:w-9 rounded-full shrink-0" />
                <Skeleton className="h-4 w-24 lg:w-32" />
              </div>
              <Skeleton className="h-4 w-24 col-span-2 hidden lg:block" />
              <Skeleton className="h-5 w-16 rounded-full col-span-2" />
              <Skeleton className="h-5 w-16 rounded-full col-span-2 hidden lg:block" />
              <Skeleton className="h-4 w-20 col-span-2 hidden lg:block" />
              <Skeleton className="h-7 w-7 rounded-md col-span-1 ml-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
));
DashboardFullSkeleton.displayName = "DashboardFullSkeleton";

/**
 * Generic admin section skeleton used as route/chunk fallback inside the
 * already-mounted admin layout. Avoids showing a separate spinner in the main
 * content area while lazy pages load.
 */
export const AdminSectionSkeleton = memo(() => (
  <div className="space-y-3 md:space-y-5 max-w-7xl mx-auto animate-fade-in-soft">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border border-border/60 shadow-sm">
          <CardContent className="p-3 lg:p-4 space-y-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3.5 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>

    <Card className="border-0 shadow-sm">
      <CardHeader className="px-3 sm:px-4 lg:px-6 py-3 border-b space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 flex-1 min-w-40 max-w-md rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 lg:p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md hidden sm:block" />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
));
AdminSectionSkeleton.displayName = "AdminSectionSkeleton";

const SkeletonRows = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="rounded-xl border border-border/60 bg-card p-4 lg:p-5">
        <div className="flex items-center gap-3 lg:gap-4">
          <Skeleton className="h-11 w-11 lg:h-12 lg:w-12 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const StaffManagementSkeleton = memo(() => (
  <div className="space-y-6 animate-fade-in-soft">
    <div className="grid w-full max-w-md grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-md" />)}
    </div>
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2 space-y-2">
        <Skeleton className="h-5 lg:h-6 w-40" />
        <Skeleton className="h-3 lg:h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-2 lg:pt-0">
        <div className="grid gap-3 lg:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1 lg:space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 lg:h-12 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1 lg:space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 lg:h-12 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </CardContent>
    </Card>
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2 space-y-2">
        <Skeleton className="h-5 lg:h-6 w-36" />
        <Skeleton className="h-3 lg:h-4 w-28" />
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-2 lg:pt-0"><SkeletonRows rows={3} /></CardContent>
    </Card>
  </div>
));
StaffManagementSkeleton.displayName = "StaffManagementSkeleton";

export const TimeSlotsSkeleton = memo(() => (
  <div className="space-y-4 animate-fade-in-soft">
    <div className="grid w-full max-w-2xl grid-cols-4 gap-1 rounded-lg bg-muted p-1">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-md" />)}
    </div>
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2"><Skeleton className="h-5 w-36" /><Skeleton className="h-3 w-56" /></div>
          <Skeleton className="h-9 w-full sm:w-32 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-2 lg:pt-0 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2"><Skeleton className="h-9 flex-1 rounded-md" /><Skeleton className="h-9 w-full sm:w-44 rounded-md" /></div>
        <SkeletonRows rows={5} />
      </CardContent>
    </Card>
  </div>
));
TimeSlotsSkeleton.displayName = "TimeSlotsSkeleton";

export const AttendanceSectionSkeleton = memo(() => (
  <div className="space-y-3 lg:space-y-3 animate-fade-in-soft">
    <div className="flex items-center justify-between">
      <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-3 w-48" /></div>
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-md" />)}
    </div>
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-3 lg:p-6 space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-64 max-w-full" /></CardHeader>
      <CardContent className="p-3 lg:p-6 pt-0 space-y-3"><SkeletonRows rows={6} /></CardContent>
    </Card>
  </div>
));
AttendanceSectionSkeleton.displayName = "AttendanceSectionSkeleton";

export const AnalyticsSectionSkeleton = memo(() => (
  <div className="max-w-6xl mx-auto space-y-3 sm:space-y-5 animate-fade-in-soft">
    <Card className="border-border/60 shadow-sm"><CardContent className="p-3 flex items-center justify-between gap-3"><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-48" /></CardContent></Card>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="border-0 shadow-sm"><CardContent className="p-4 space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-10 w-full rounded-md" /></CardContent></Card>)}
    </div>
    <Card className="border-0 shadow-sm"><CardHeader className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-60" /></CardHeader><CardContent className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</CardContent></Card>
    <div className="grid lg:grid-cols-2 gap-3 sm:gap-5">
      {Array.from({ length: 2 }).map((_, i) => <Card key={i} className="border-0 shadow-sm"><CardHeader className="space-y-2"><Skeleton className="h-5 w-36" /><Skeleton className="h-3 w-56" /></CardHeader><CardContent><Skeleton className="h-[240px] w-full rounded-lg" /></CardContent></Card>)}
    </div>
  </div>
));
AnalyticsSectionSkeleton.displayName = "AnalyticsSectionSkeleton";

export const BranchAnalyticsSkeleton = memo(() => (
  <div className="space-y-3 sm:space-y-6 animate-fade-in-soft">
    <div className="flex flex-col gap-3 sm:gap-4"><div className="space-y-2"><Skeleton className="h-7 w-72 max-w-full" /><Skeleton className="h-4 w-80 max-w-full" /></div><Card className="border-0 shadow-sm"><CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-2 sm:gap-3"><Skeleton className="h-9 w-full sm:w-64" /><Skeleton className="h-5 w-48" /></CardContent></Card></div>
    <Card className="border-l-4 border-l-warning"><CardHeader className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /></CardHeader><CardContent className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</CardContent></Card>
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-6 flex items-center justify-between"><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-28" /></div><Skeleton className="h-8 w-8 rounded-xl" /></CardContent></Card>)}</div>
    <div className="grid lg:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <Card key={i} className="border-l-4"><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent><Skeleton className="h-7 w-48 mb-4" /><div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, j) => <div key={j} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-24" /></div>)}</div></CardContent></Card>)}</div>
    <Card><CardHeader className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /></CardHeader><CardContent><Skeleton className="h-[360px] w-full rounded-lg" /></CardContent></Card>
  </div>
));
BranchAnalyticsSkeleton.displayName = "BranchAnalyticsSkeleton";

export const SettingsSectionSkeleton = memo(() => (
  <div className="w-full px-1 sm:px-0 animate-fade-in-soft">
    {/* Mobile: dropdown selector */}
    <div className="lg:hidden mb-4">
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
    {/* Desktop: horizontal tab strip */}
    <div className="hidden lg:flex border-b border-border/60 mb-6 gap-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="px-5 py-2.5">
          <Skeleton className={cn("h-4", i === 0 ? "w-20" : i === 1 ? "w-24" : i === 2 ? "w-24" : i === 3 ? "w-20" : i === 4 ? "w-16" : i === 5 ? "w-16" : "w-24")} />
        </div>
      ))}
    </div>

    {/* Two stacked content cards (matches Packages/General style with icon + title + grid of fields) */}
    <div className="space-y-4 lg:space-y-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="border border-border/40 shadow-sm overflow-hidden">
          <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-5 lg:h-6 w-44" />
                <Skeleton className="h-3 lg:h-4 w-64 max-w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-0">
            {/* Inline form row (mimics duration / price grid in muted box) */}
            <div className="grid gap-2 lg:gap-4 grid-cols-3 p-3 lg:p-4 bg-muted/30 rounded-xl border border-border/30">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5 lg:space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 lg:h-10 w-full" />
                </div>
              ))}
            </div>
            {/* List rows */}
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <Skeleton className="h-4 w-40 max-w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
));
SettingsSectionSkeleton.displayName = "SettingsSectionSkeleton";

export const CalendarSectionSkeleton = memo(() => (
  <div className="p-4 lg:p-6 max-w-6xl mx-auto animate-fade-in-soft">
    {/* Page header */}
    <div className="mb-4 lg:mb-6 space-y-2">
      <Skeleton className="h-7 lg:h-8 w-32" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
    <CalendarSectionSkeletonBody />
  </div>
));
CalendarSectionSkeleton.displayName = "CalendarSectionSkeleton";

export const CalendarSectionSkeletonBody = memo(() => (
  <div className="space-y-3 lg:space-y-6 animate-fade-in-soft">{/* body only — no page header */}
      {/* Calendar Card */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 lg:gap-3">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <Skeleton className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl" />
              <div className="space-y-1.5 min-w-0">
                <Skeleton className="h-4 lg:h-6 w-28" />
                <Skeleton className="h-3 lg:h-4 w-56 max-w-full" />
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Skeleton className="h-8 lg:h-9 flex-1 sm:w-32 rounded-xl" />
              <Skeleton className="h-8 lg:h-9 flex-1 sm:w-28 rounded-xl" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-1 lg:pt-2">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2.5 lg:mb-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 lg:h-4 w-6 lg:w-10 mx-auto" />
            ))}
          </div>
          {/* Calendar grid (6 weeks) */}
          <div className="grid grid-cols-7 gap-1 lg:gap-1.5">
            {Array.from({ length: 42 }).map((_, i) => (
              <Skeleton key={i} className="min-h-[68px] sm:min-h-[72px] lg:min-h-[100px] rounded-lg lg:rounded-xl" />
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 lg:mt-4 pt-2.5 lg:pt-3 border-t border-border/30 flex-wrap">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Skeleton className="w-2.5 h-2.5 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events / Holidays cards */}
      {Array.from({ length: 2 }).map((_, idx) => (
        <Card key={idx} className="border border-border/40 shadow-sm overflow-hidden">
          <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <Skeleton className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl" />
              <div className="space-y-1.5 min-w-0">
                <Skeleton className="h-4 lg:h-6 w-40" />
                <Skeleton className="h-3 lg:h-4 w-52 max-w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 lg:p-6 pt-0 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-2.5 lg:p-4 rounded-lg lg:rounded-xl border border-border/30">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
                  <Skeleton className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl" />
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-32 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
));
CalendarSectionSkeleton.displayName = "CalendarSectionSkeleton";

export const ActivityLogsSectionSkeleton = memo(() => (
  <div className="max-w-7xl mx-auto animate-fade-in-soft">
    {/* Top tabs (Admin / User / Staff / WhatsApp) */}
    <div className="grid w-full max-w-2xl grid-cols-4 mb-4 lg:mb-6 bg-muted/50 p-0.5 lg:p-1 h-auto rounded-md gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-7 lg:h-9 w-full rounded-sm" />
      ))}
    </div>

    {/* Sub tabs (Statistics / Activity Logs) */}
    <div className="grid w-full max-w-[240px] lg:max-w-xs grid-cols-2 h-8 lg:h-10 mb-4 lg:mb-6 bg-muted/50 p-0.5 lg:p-1 rounded-md gap-1">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-full w-full rounded-sm" />
      ))}
    </div>

    {/* Logs Card */}
    <Card>
      <CardHeader className="p-3 lg:p-6 pb-2 space-y-2">
        <Skeleton className="h-5 lg:h-6 w-32" />
        <Skeleton className="h-3 lg:h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-3 lg:space-y-4 p-3 lg:p-6 pt-0">
        {/* Filter row */}
        <div className="space-y-1.5 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
          <div className="flex items-center gap-1.5 lg:gap-3 lg:flex-1">
            <Skeleton className="h-8 lg:h-12 flex-1 min-w-[120px] lg:min-w-[200px] rounded-md" />
            <Skeleton className="h-8 lg:h-12 w-[90px] lg:w-[180px] rounded-md" />
          </div>
          <div className="flex items-center gap-1.5 lg:gap-3">
            <Skeleton className="h-8 lg:h-12 w-32 lg:w-48 rounded-md" />
            <Skeleton className="h-8 w-9 rounded-md" />
          </div>
        </div>

        {/* Table (desktop) / Card list (mobile) */}
        <div className="hidden lg:block rounded-md border">
          <div className="border-b p-3 grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b last:border-0 p-3 grid grid-cols-5 gap-4 items-center">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-full max-w-[280px]" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-8 ml-auto rounded-md" />
            </div>
          ))}
        </div>
        <div className="lg:hidden space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-full max-w-[240px]" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
));
ActivityLogsSectionSkeleton.displayName = "ActivityLogsSectionSkeleton";

export const EventsSectionSkeleton = memo(() => (
  <div className="space-y-4 lg:space-y-6 animate-fade-in-soft">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="space-y-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-4 w-56" /></div><Skeleton className="h-9 w-full sm:w-32 rounded-xl" /></div>
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"><Skeleton className="h-9 flex-1 sm:max-w-sm rounded-xl" /><Skeleton className="h-9 w-full sm:w-[200px] rounded-xl" /></div>
    <div className="flex gap-2 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="border border-border/40"><CardContent className="p-5 space-y-3"><Skeleton className="h-32 w-full rounded-xl" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><div className="flex gap-2 pt-2"><Skeleton className="h-8 flex-1" /><Skeleton className="h-8 w-8" /></div></CardContent></Card>)}</div>
  </div>
));
EventsSectionSkeleton.displayName = "EventsSectionSkeleton";

export const SuperAdminTableSkeleton = memo(() => (
  <div className="space-y-6 animate-fade-in-soft">
    <div className="flex items-center justify-between"><div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72" /></div><Skeleton className="h-10 w-40" /></div>
    <Skeleton className="h-10 w-full max-w-sm" />
    <Card><CardContent className="p-0"><div className="border-b p-4 grid grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}</div>{Array.from({ length: 7 }).map((_, i) => <div key={i} className="border-b p-4 grid grid-cols-5 gap-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-8 ml-auto" /></div>)}</CardContent></Card>
  </div>
));
SuperAdminTableSkeleton.displayName = "SuperAdminTableSkeleton";

export const SuperAdminFormSkeleton = memo(() => (
  <div className="space-y-6 max-w-5xl animate-fade-in-soft">
    <div className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-md" /><div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72" /></div></div>
    {Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardHeader className="space-y-2"><Skeleton className="h-6 w-44" /><Skeleton className="h-4 w-72" /></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, j) => <div key={j} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>)}</div></CardContent></Card>)}
  </div>
));
SuperAdminFormSkeleton.displayName = "SuperAdminFormSkeleton";

/**
 * Table skeleton for members/payments
 */
export const TableSkeleton = memo(({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) => (
  <div className="rounded-lg border overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          {Array.from({ length: columns }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton className="h-4 w-full max-w-[100px]" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
));
TableSkeleton.displayName = "TableSkeleton";

/**
 * Member row skeleton
 */
export const MemberRowSkeleton = memo(() => (
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </TableCell>
    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
  </TableRow>
));
MemberRowSkeleton.displayName = "MemberRowSkeleton";

/**
 * Infinite scroll loading skeleton (rows at bottom)
 */
export const InfiniteScrollSkeleton = memo(({ rows = 3 }: { rows?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <TableRow key={`infinite-skeleton-${i}`} className="animate-pulse">
        <TableCell className="w-8 md:w-10">
          <Skeleton className="h-4 w-4" />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 md:gap-3">
            <Skeleton className="h-8 w-8 md:h-10 md:w-10 rounded-full flex-shrink-0" />
            <div className="space-y-1 min-w-0 flex-1">
              <Skeleton className="h-4 w-24 md:w-32" />
              <Skeleton className="h-3 w-16 md:w-24" />
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Skeleton className="h-5 w-16" />
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Skeleton className="h-4 w-20" />
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Skeleton className="h-4 w-24" />
        </TableCell>
        <TableCell className="w-10 md:w-12">
          <Skeleton className="h-8 w-8" />
        </TableCell>
      </TableRow>
    ))}
  </>
));

/**
 * Card list skeleton
 */
export const CardListSkeleton = memo(({ count = 3 }: { count?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} className="border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
));
CardListSkeleton.displayName = "CardListSkeleton";

/**
 * Form skeleton
 */
export const FormSkeleton = memo(({ fields = 4 }: { fields?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    ))}
    <Skeleton className="h-10 w-full mt-6" />
  </div>
));
FormSkeleton.displayName = "FormSkeleton";

/**
 * Payment history skeleton
 */
export const PaymentHistorySkeleton = memo(() => (
  <div className="space-y-4">
    {/* Filters skeleton */}
    <div className="flex flex-wrap gap-3 items-end">
      <Skeleton className="h-9 w-[200px]" />
      <Skeleton className="h-9 w-[100px]" />
      <Skeleton className="h-9 w-[100px]" />
      <Skeleton className="h-9 w-[100px]" />
    </div>
    {/* Summary skeleton */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-24" />
    </div>
    {/* Table skeleton */}
    <TableSkeleton rows={5} columns={6} />
  </div>
));
PaymentHistorySkeleton.displayName = "PaymentHistorySkeleton";

/**
 * Inline prix-clip ring spinner. Inherits color via `currentColor`.
 */
export const InlineSpinner = memo(({ size = "sm", className }: { size?: "sm" | "md" | "lg"; className?: string }) => {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-[3px]",
    lg: "w-8 h-8 border-[3px]",
  };

  return (
    <span
      className={`relative inline-block rounded-full text-primary animate-[spinner-orbit_1s_linear_infinite] ${className ?? ""}`}
      role="status"
      aria-label="Loading"
    >
      <span
        className={`block box-border rounded-full border-current animate-[prix-clip-fix_2s_linear_infinite] ${sizeClasses[size]}`}
      />
    </span>
  );
});
InlineSpinner.displayName = "InlineSpinner";

/**
 * Full-page loader using the prix-clip ring pattern with a soft halo.
 */
export const PageLoader = memo(() => (
  <div className="flex items-center justify-center py-10 animate-fade-in">
    <div className="relative w-7 h-7 text-primary">
      <span className="absolute inset-0 rounded-full bg-primary/10 blur-md animate-[spinner-pulse_1.6s_ease-in-out_infinite]" />
      <span className="absolute inset-0 rounded-full animate-[spinner-orbit_1s_linear_infinite]">
        <span className="block w-full h-full box-border rounded-full border-[3px] border-current animate-[prix-clip-fix_2s_linear_infinite]" />
      </span>
    </div>
  </div>
));
PageLoader.displayName = "PageLoader";

/**
 * Empty state with optional action
 */
export const EmptyState = memo(({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: { 
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="text-center py-12 text-muted-foreground">
    {Icon && <Icon className="w-10 h-10 mx-auto mb-3 opacity-50" />}
    <p className="font-medium">{title}</p>
    {description && <p className="text-sm mt-1">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
));
EmptyState.displayName = "EmptyState";
