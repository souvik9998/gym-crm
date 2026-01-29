import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MemberFilterValue } from '@/components/admin/MemberFilter';

type SortByValue = "name" | "join_date" | "end_date";
type SortOrderValue = "asc" | "desc";
type DailyPassFilterValue = "all" | "active" | "expired";

interface DashboardUIState {
  // Tab state
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Member filters
  memberFilter: MemberFilterValue;
  setMemberFilter: (filter: MemberFilterValue) => void;
  ptFilterActive: boolean;
  setPtFilterActive: (active: boolean) => void;
  
  // Sorting
  sortBy: SortByValue;
  setSortBy: (sortBy: SortByValue) => void;
  sortOrder: SortOrderValue;
  setSortOrder: (order: SortOrderValue) => void;
  
  // Daily pass filter
  dailyPassFilter: DailyPassFilterValue;
  setDailyPassFilter: (filter: DailyPassFilterValue) => void;
  
  // Reset all filters
  resetFilters: () => void;
}

const initialState = {
  activeTab: "members",
  memberFilter: "all" as MemberFilterValue,
  ptFilterActive: false,
  sortBy: "name" as SortByValue,
  sortOrder: "asc" as SortOrderValue,
  dailyPassFilter: "all" as DailyPassFilterValue,
};

export const useDashboardStore = create<DashboardUIState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      setMemberFilter: (filter) => set((state) => ({
        memberFilter: filter,
        // Reset PT filter when switching to "all"
        ptFilterActive: filter === "all" ? false : state.ptFilterActive,
      })),
      
      setPtFilterActive: (active) => set({ ptFilterActive: active }),
      
      setSortBy: (sortBy) => set({ sortBy }),
      
      setSortOrder: (order) => set({ sortOrder: order }),
      
      setDailyPassFilter: (filter) => set({ dailyPassFilter: filter }),
      
      resetFilters: () => set(initialState),
    }),
    {
      name: 'dashboard-ui-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        memberFilter: state.memberFilter,
        ptFilterActive: state.ptFilterActive,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        dailyPassFilter: state.dailyPassFilter,
      }),
    }
  )
);
