import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { memo } from "react";

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
