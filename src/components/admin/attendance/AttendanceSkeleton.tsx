import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Pixel-perfect skeleton mirroring the Attendance page structure:
 * - Header (title + subtitle + mode badge)
 * - Scrollable tab pills row
 * - Content area: filters bar + summary chips + list/table rows
 */
export const AttendanceSkeleton = memo(() => {
  return (
    <div className="space-y-3 lg:space-y-3 animate-fade-in">
      {/* Header — mirrors Attendance.tsx header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-5 lg:h-7 w-28 lg:w-40" />
          <Skeleton className="h-3 lg:h-4 w-40 lg:w-56" />
        </div>
        <Skeleton className="h-5 lg:h-6 w-20 lg:w-24 rounded-full shrink-0" />
      </div>

      {/* Tabs pill bar — mirrors TabsList */}
      <div className="-mx-1 px-1 lg:mx-0 lg:px-0 overflow-hidden">
        <div className="bg-muted/50 rounded-lg p-0.5 lg:p-1 inline-flex gap-0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-7 lg:h-9 w-16 lg:w-28 rounded-md"
            />
          ))}
        </div>
      </div>

      {/* Content area */}
      <Card className="border shadow-sm">
        <CardContent className="p-3 lg:p-5 space-y-4">
          {/* Filter / search row */}
          <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 lg:items-center">
            <Skeleton className="h-9 lg:h-10 flex-1 lg:max-w-sm rounded-md" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 lg:h-10 w-24 lg:w-32 rounded-md" />
              <Skeleton className="h-9 lg:h-10 w-24 lg:w-32 rounded-md" />
              <Skeleton className="h-9 lg:h-10 w-20 lg:w-28 rounded-md" />
            </div>
          </div>

          {/* Summary chips row */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 lg:h-8 w-20 lg:w-28 rounded-full" />
            ))}
          </div>

          {/* List rows — mirrors member attendance row layout */}
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-2.5 lg:p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
                  <Skeleton className="h-9 w-9 lg:h-10 lg:w-10 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 lg:h-4 w-32 lg:w-44" />
                    <Skeleton className="h-3 w-20 lg:w-28" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                  <Skeleton className="h-7 w-12 lg:h-8 lg:w-16 rounded-md" />
                  <Skeleton className="h-7 w-12 lg:h-8 lg:w-16 rounded-md" />
                  <Skeleton className="h-7 w-12 lg:h-8 lg:w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination row */}
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-4 w-32 lg:w-40" />
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
AttendanceSkeleton.displayName = "AttendanceSkeleton";
