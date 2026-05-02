import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { memo } from "react";

/**
 * Modern dashboard stats skeleton — mirrors the live StatCard layout
 * (icon tile + value + label + trend pill) with subtle gradient washes
 * and staggered fade-in so loading feels alive instead of static.
 */
const STAT_TONES = [
  "from-primary/8 via-primary/3",
  "from-success/10 via-success/3",
  "from-warning/10 via-warning/3",
  "from-accent/10 via-accent/3",
] as const;

export const DashboardStatsSkeleton = memo(() => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-3.5 lg:gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Card
        key={i}
        className={`relative overflow-hidden border border-border/60 shadow-sm bg-gradient-to-br ${STAT_TONES[i]} to-transparent animate-fade-in`}
        style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
      >
        {/* Decorative shimmer wash */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent animate-[shimmer_2.4s_ease-in-out_infinite]"
        />
        <CardContent className="relative p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2.5 flex-1 min-w-0">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-7 md:h-8 w-24" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-10 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-11 w-11 md:h-12 md:w-12 rounded-2xl shrink-0" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
));
DashboardStatsSkeleton.displayName = "DashboardStatsSkeleton";

/**
 * Full dashboard skeleton — hero header + quick actions + stats + chart + list.
 * Use as the top-level loading fallback for the admin dashboard.
 */
export const DashboardFullSkeleton = memo(() => (
  <div className="space-y-5 md:space-y-6 animate-fade-in">
    {/* Hero / greeting */}
    <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.05] to-transparent animate-[shimmer_2.2s_ease-in-out_infinite]"
      />
      <CardContent className="relative p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2.5 flex-1 min-w-0">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-6 md:h-7 w-56 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="hidden sm:block h-10 w-32 rounded-md" />
        </div>
      </CardContent>
    </Card>

    {/* Quick actions */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-12 rounded-xl animate-fade-in"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
        />
      ))}
    </div>

    {/* Stats */}
    <DashboardStatsSkeleton />

    {/* Chart + side list */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
      <Card className="lg:col-span-2 border-border/60">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent>
          <div className="h-[220px] md:h-[260px] flex items-end gap-2 md:gap-3 px-1">
            {Array.from({ length: 14 }).map((_, i) => {
              const h = 25 + ((i * 13) % 70);
              return (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-t-md animate-fade-in"
                  style={{ height: `${h}%`, animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-fade-in"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
            >
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  </div>
));
DashboardFullSkeleton.displayName = "DashboardFullSkeleton";

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
