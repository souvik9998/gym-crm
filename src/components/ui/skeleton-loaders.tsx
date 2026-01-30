import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { memo } from "react";

/**
 * Dashboard stats skeleton
 */
export const DashboardStatsSkeleton = memo(() => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Card key={i} className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-12 w-12 rounded-xl" />
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
 * Inline loading spinner
 */
export const InlineSpinner = memo(({ size = "sm" }: { size?: "sm" | "md" | "lg" }) => {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-4",
  };
  
  return (
    <div className={`${sizeClasses[size]} border-primary/30 border-t-primary rounded-full animate-spin`} />
  );
});
InlineSpinner.displayName = "InlineSpinner";

/**
 * Full page loading state
 */
export const PageLoader = memo(() => (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
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
