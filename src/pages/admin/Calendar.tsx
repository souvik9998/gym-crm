import { Suspense, lazy } from "react";

const HolidayCalendarTab = lazy(() => import("@/components/admin/HolidayCalendarTab"));

export default function AdminCalendar() {
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground">Holidays, events, and gym closures at a glance</p>
      </div>
      <Suspense fallback={
        <div className="space-y-4">
          <div className="h-64 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-48 bg-muted/30 rounded-xl animate-pulse" />
        </div>
      }>
        <HolidayCalendarTab />
      </Suspense>
    </div>
  );
}
