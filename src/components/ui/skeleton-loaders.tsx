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
        <CardContent className="p-4 md:p-5">
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
 * Inline loading spinner — 3 orbiting dots around a pulsing core.
 * Inherits color via `text-*` so it adapts to any context.
 */
export const InlineSpinner = memo(({ size = "sm", className }: { size?: "sm" | "md" | "lg"; className?: string }) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
  const dotSize = {
    sm: "w-1 h-1",
    md: "w-1.5 h-1.5",
    lg: "w-2 h-2",
  };

  return (
    <span
      className={`relative inline-flex items-center justify-center ${sizeClasses[size]} text-primary ${className ?? ""}`}
      role="status"
      aria-label="Loading"
    >
      {/* Orbiting dots */}
      <span className="absolute inset-0 animate-[spinner-orbit_1.1s_linear_infinite]">
        <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${dotSize[size]} rounded-full bg-current`} />
      </span>
      <span className="absolute inset-0 animate-[spinner-orbit_1.1s_linear_infinite]" style={{ animationDelay: "-0.37s" }}>
        <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${dotSize[size]} rounded-full bg-current opacity-70`} />
      </span>
      <span className="absolute inset-0 animate-[spinner-orbit_1.1s_linear_infinite]" style={{ animationDelay: "-0.73s" }}>
        <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${dotSize[size]} rounded-full bg-current opacity-40`} />
      </span>
    </span>
  );
});
InlineSpinner.displayName = "InlineSpinner";

/**
 * Full page loading state — orbiting trio with a soft halo + pulsing core.
 * No text, just a delightful loading pattern that keeps motion alive.
 */
export const PageLoader = memo(() => (
  <div className="flex items-center justify-center py-16 animate-fade-in">
    <div className="relative w-16 h-16 text-primary">
      {/* Soft halo */}
      <span className="absolute inset-0 rounded-full bg-primary/10 blur-2xl animate-[spinner-pulse_1.6s_ease-in-out_infinite]" />

      {/* Orbiting trio */}
      <span className="absolute inset-0 animate-[spinner-orbit_1.2s_linear_infinite]">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-current shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
      </span>
      <span
        className="absolute inset-0 animate-[spinner-orbit_1.2s_linear_infinite]"
        style={{ animationDelay: "-0.4s" }}
      >
        <span className="absolute left-1/2 top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-current opacity-70 shadow-[0_0_10px_hsl(var(--primary)/0.45)]" />
      </span>
      <span
        className="absolute inset-0 animate-[spinner-orbit_1.2s_linear_infinite]"
        style={{ animationDelay: "-0.8s" }}
      >
        <span className="absolute left-1/2 top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-current opacity-40 shadow-[0_0_8px_hsl(var(--primary)/0.3)]" />
      </span>

      {/* Pulsing core */}
      <span className="absolute inset-[38%] rounded-full bg-current animate-[spinner-pulse_1.2s_ease-in-out_infinite]" />
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
