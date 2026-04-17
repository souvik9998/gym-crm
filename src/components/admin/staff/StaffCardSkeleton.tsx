import { Skeleton } from "@/components/ui/skeleton";

interface StaffCardSkeletonProps {
  count?: number;
}

/**
 * Shimmer skeleton matching the collapsed staff/trainer card layout.
 * Used while the staff list is loading.
 */
export const StaffCardSkeleton = ({ count = 3 }: StaffCardSkeletonProps) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border/60 bg-card p-4 lg:p-5 animate-fade-in"
          style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "backwards" }}
        >
          <div className="flex items-center gap-3 lg:gap-4">
            {/* Avatar */}
            <Skeleton className="w-11 h-11 lg:w-12 lg:h-12 rounded-full flex-shrink-0" />

            {/* Name + meta */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-48" />
            </div>

            {/* Right side controls */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
