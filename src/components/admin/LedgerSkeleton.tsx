import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Pixel-perfect skeleton mirroring the Ledger page structure:
 * - Date Range selector card (label + 6 preset pills)
 * - 3 summary cards (Income / Expenses / Net P&L) with left border accent
 * - Chart card (header + bar chart placeholder)
 * - Transactions card (header + add button + table rows)
 */
export const LedgerSkeleton = memo(() => {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Date Range Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 sm:w-20 rounded-md" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card
            key={i}
            className={`border-l-4 ${
              i === 0 ? "border-l-success/40" : i === 1 ? "border-l-destructive/40" : "border-l-primary/40"
            }`}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-7 w-32" />
                </div>
                <Skeleton className="h-12 w-12 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart Card */}
      <Card>
        <CardHeader className="px-3 py-3 sm:p-6 space-y-2">
          <Skeleton className="h-5 sm:h-6 w-40" />
          <Skeleton className="h-3 sm:h-4 w-56" />
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 sm:p-6 sm:pt-0">
          <div className="h-[220px] sm:h-[280px] lg:h-[300px] flex items-end gap-1.5 sm:gap-3 px-2">
            {Array.from({ length: 12 }).map((_, i) => {
              const incomeH = 30 + ((i * 17) % 60);
              const expenseH = 20 + ((i * 11) % 50);
              return (
                <div key={i} className="flex-1 flex items-end justify-center gap-1">
                  <Skeleton className="w-1/2 rounded-t-md" style={{ height: `${incomeH}%` }} />
                  <Skeleton className="w-1/2 rounded-t-md" style={{ height: `${expenseH}%` }} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Transactions Card */}
      <Card>
        <CardHeader className="px-3 py-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-5 sm:h-6 w-32" />
              <Skeleton className="h-3 sm:h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-full sm:w-32 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 pb-3 border-b">
            <Skeleton className="h-3.5 w-16 col-span-2" />
            <Skeleton className="h-3.5 w-14 col-span-1" />
            <Skeleton className="h-3.5 w-20 col-span-2" />
            <Skeleton className="h-3.5 w-24 col-span-4" />
            <Skeleton className="h-3.5 w-16 col-span-2 ml-auto" />
            <Skeleton className="h-3.5 w-8 col-span-1 ml-auto" />
          </div>
          {/* Rows */}
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-3 py-3 items-center"
              >
                <Skeleton className="h-4 w-20 col-span-2" />
                <Skeleton className="h-5 w-16 rounded-full col-span-1" />
                <Skeleton className="h-4 w-24 col-span-2" />
                <Skeleton className="h-4 w-full max-w-[200px] col-span-4" />
                <Skeleton className="h-4 w-20 col-span-2 ml-auto" />
                <Skeleton className="h-7 w-7 rounded-md col-span-1 ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
LedgerSkeleton.displayName = "LedgerSkeleton";
