import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import PoweredByBadge from "@/components/PoweredByBadge";

interface RegistrationPageSkeletonProps {
  variant?: "landing" | "form" | "package";
}

/**
 * Full-page skeleton for public registration flow pages
 * (Index, Register, Renew, ExtendPT). Mirrors the real layout so
 * users see a stable, branded placeholder while branch / package
 * data is being fetched — no CLS when real content swaps in.
 */
const RegistrationPageSkeleton = ({ variant = "landing" }: RegistrationPageSkeletonProps) => {
  if (variant === "landing") {
    return (
      <div className="min-h-screen bg-background flex flex-col animate-fade-in">
        {/* Hero */}
        <header className="px-4 pt-12 pb-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Skeleton className="w-16 h-16 rounded-xl" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-9 w-48 rounded-lg" />
            <Skeleton className="h-5 w-56 rounded-md" />
          </div>
        </header>

        {/* Form card */}
        <main className="flex-1 px-4 pb-8">
          <Card className="max-w-md mx-auto mt-6 border">
            <CardHeader className="text-center pb-4 space-y-2">
              <Skeleton className="h-5 w-56 mx-auto" />
              <Skeleton className="h-4 w-72 mx-auto" />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
            </CardContent>
          </Card>

          {/* Features */}
          <div className="max-w-md mx-auto mt-12 grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card"
              >
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </main>

        <PoweredByBadge />
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="min-h-screen bg-background animate-fade-in">
        <header className="px-4 pt-6 pb-4">
          <div className="max-w-md mx-auto">
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="flex justify-center gap-2 mt-4">
            <Skeleton className="h-2 w-8 rounded-full" />
            <Skeleton className="h-2 w-3 rounded-full" />
            <Skeleton className="h-2 w-3 rounded-full" />
          </div>
        </header>

        <main className="px-4 pb-8">
          <Card className="max-w-md mx-auto border">
            <CardHeader className="pb-4 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full rounded-lg" />
                </div>
              ))}
              <Skeleton className="h-12 w-full rounded-lg mt-2" />
            </CardContent>
          </Card>
        </main>

        <PoweredByBadge />
      </div>
    );
  }

  // variant === "package"
  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Skeleton className="h-7 w-56" />
        </div>
      </header>

      <main className="px-4 pb-8">
        <Card className="max-w-md mx-auto border">
          <CardHeader className="pb-4 space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Start date */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>

            {/* Tabs */}
            <Skeleton className="h-10 w-full rounded-lg" />

            {/* Package grid */}
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border-2 border-border">
                  <div className="flex flex-col items-center gap-2">
                    <Skeleton className="h-8 w-10" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>

            {/* Trainer toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>

            {/* Summary */}
            <div className="space-y-2 p-4 rounded-xl bg-muted/40">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>

            <Skeleton className="h-12 w-full rounded-lg" />
          </CardContent>
        </Card>
      </main>

      <PoweredByBadge />
    </div>
  );
};

export default RegistrationPageSkeleton;
