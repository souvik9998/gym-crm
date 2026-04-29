import { PageTour } from "./PageTour";
import { DASHBOARD_STEPS } from "./tourSteps";

/**
 * Thin wrapper around the generic PageTour for the admin dashboard.
 * Kept as a named component so existing imports continue to work.
 */
export const DashboardTour = () => (
  <PageTour tourId="dashboard" steps={DASHBOARD_STEPS} />
);

export default DashboardTour;
