import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PeriodType } from "@/components/admin/PeriodSelector";

interface AnalyticsState {
  // Analytics page state
  analyticsPeriod: PeriodType;
  analyticsCustomDateFrom: string;
  analyticsCustomDateTo: string;
  
  // Branch Analytics page state
  branchAnalyticsPeriod: PeriodType;
  branchAnalyticsCustomDateFrom: string;
  branchAnalyticsCustomDateTo: string;
  branchAnalyticsSelectedBranch: string | null;
  branchAnalyticsActiveTab: string;
  
  // Actions
  setAnalyticsPeriod: (period: PeriodType) => void;
  setAnalyticsCustomDates: (from: string, to: string) => void;
  setBranchAnalyticsPeriod: (period: PeriodType) => void;
  setBranchAnalyticsCustomDates: (from: string, to: string) => void;
  setBranchAnalyticsSelectedBranch: (branchId: string | null) => void;
  setBranchAnalyticsActiveTab: (tab: string) => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      // Analytics page defaults
      analyticsPeriod: "this_month",
      analyticsCustomDateFrom: "",
      analyticsCustomDateTo: "",
      
      // Branch Analytics page defaults
      branchAnalyticsPeriod: "this_month",
      branchAnalyticsCustomDateFrom: "",
      branchAnalyticsCustomDateTo: "",
      branchAnalyticsSelectedBranch: null,
      branchAnalyticsActiveTab: "overview",
      
      // Actions
      setAnalyticsPeriod: (period) => set({ analyticsPeriod: period }),
      setAnalyticsCustomDates: (from, to) => set({ 
        analyticsCustomDateFrom: from, 
        analyticsCustomDateTo: to 
      }),
      setBranchAnalyticsPeriod: (period) => set({ branchAnalyticsPeriod: period }),
      setBranchAnalyticsCustomDates: (from, to) => set({ 
        branchAnalyticsCustomDateFrom: from, 
        branchAnalyticsCustomDateTo: to 
      }),
      setBranchAnalyticsSelectedBranch: (branchId) => set({ branchAnalyticsSelectedBranch: branchId }),
      setBranchAnalyticsActiveTab: (tab) => set({ branchAnalyticsActiveTab: tab }),
    }),
    {
      name: "analytics-store",
    }
  )
);
