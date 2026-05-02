import { useState, useMemo, useEffect, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PlusIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  CurrencyRupeeIcon,
  SparklesIcon,
  EyeIcon,
  XMarkIcon,
  Squares2X2Icon,
  ChartPieIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { exportToExcel } from "@/utils/exportToExcel";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LedgerDetailDialog from "@/components/admin/LedgerDetailDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryClient";
import MobileExpandableRow from "@/components/admin/MobileExpandableRow";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { LedgerSkeleton } from "@/components/admin/LedgerSkeleton";
import { keepPreviousData } from "@tanstack/react-query";

interface LedgerEntry {
  id: string;
  entry_type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  notes: string | null;
  is_auto_generated: boolean;
  created_at: string;
  member_id: string | null;
  daily_pass_user_id: string | null;
  trainer_id: string | null;
}

const EXPENSE_CATEGORIES = [
  { value: "trainer_session", label: "Trainer Expense (Session)" },
  { value: "trainer_percentage", label: "Trainer Expense (Percentage)" },
  { value: "staff_salary", label: "Other Staff Expense" },
  { value: "bill_payment", label: "Bill Payment" },
  { value: "service_repair", label: "Service/Repair" },
  { value: "equipment", label: "Equipment Purchase" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "misc_expense", label: "Miscellaneous Expense" },
];

const EXPENSE_DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  trainer_session: "e.g., Trainer session payout for morning batch",
  trainer_percentage: "e.g., Monthly salary",
  staff_salary: "e.g., Front desk salary for April",
  bill_payment: "e.g., Electricity bill for January",
  service_repair: "e.g., Treadmill repair service",
  equipment: "e.g., Dumbbell rack purchase",
  rent: "e.g., Gym rent for April",
  utilities: "e.g., Water and electricity charges",
  misc_expense: "e.g., Cleaning supplies purchase",
};

const INCOME_CATEGORIES = [
  { value: "gym_membership", label: "Gym Membership" },
  { value: "gym_renewal", label: "Gym Renewal" },
  { value: "daily_pass", label: "Daily Pass" },
  { value: "pt_subscription", label: "PT Subscription" },
  { value: "joining_fee", label: "Joining Fee" },
  { value: "event_registration", label: "Event Registration" },
  { value: "misc_income", label: "Miscellaneous Income" },
];

type DateRangePreset = "today" | "7days" | "15days" | "30days" | "this_month" | "custom";

const AdminLedger = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const { invalidatePayments } = useInvalidateQueries();
  const queryClient = useQueryClient();
  // Date range state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  
  // Add expense dialog
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [expenseNotes, setExpenseNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("");
  const [trainers, setTrainers] = useState<Array<{ id: string; full_name: string; monthly_salary: number; phone: string | null }>>([]);
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [otherStaff, setOtherStaff] = useState<Array<{ id: string; full_name: string; monthly_salary: number; phone: string | null; role: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  const expenseDescriptionPlaceholder =
    EXPENSE_DESCRIPTION_PLACEHOLDERS[expenseCategory] || "e.g., Enter expense description";

  // Confirm dialog for delete
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  // Ledger detail dialog
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // New: search + filter + chart view toggle
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [chartView, setChartView] = useState<"bar" | "donut">("bar");

  const handleViewEntry = (entry: LedgerEntry) => {
    setSelectedEntry(entry);
    setIsDetailOpen(true);
  };

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (dateRangePreset) {
      case "today":
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return { start: startOfToday, end: today };
      case "7days":
        return { start: subDays(today, 7), end: today };
      case "15days":
        return { start: subDays(today, 15), end: today };
      case "30days":
        return { start: subDays(today, 30), end: today };
      case "this_month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "custom":
        return {
          start: customStartDate || subDays(today, 30),
          end: customEndDate || today,
        };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  }, [dateRangePreset, customStartDate, customEndDate]);

  const { data: entries = [], refetch: fetchEntries, isLoading: isEntriesLoading, isFetching: isEntriesFetching } = useQuery({
    queryKey: ["ledger-entries", dateRange.start, dateRange.end, currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .gte("entry_date", startStr)
        .lte("entry_date", endStr)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching ledger entries:", error);
        return [];
      }
      return data as LedgerEntry[];
    },
    enabled: !!currentBranch?.id,
    staleTime: STALE_TIMES.DYNAMIC,
    placeholderData: keepPreviousData,
  });

  // Show full-page skeleton on first load (no branch yet, or first fetch in flight)
  const showSkeleton = !currentBranch?.id || (isEntriesLoading && !entries.length);

  const handleAddExpense = async () => {
    if (!expenseCategory || !expenseDescription || !expenseAmount) {
      toast.error("Please fill all required fields");
      return;
    }

    // For trainer_percentage category, trainer must be selected
    if (expenseCategory === "trainer_percentage" && !selectedTrainerId) {
      toast.error("Please select a trainer");
      return;
    }

    // For staff_salary category, staff must be selected
    if (expenseCategory === "staff_salary" && !selectedStaffId) {
      toast.error("Please select a staff member");
      return;
    }

    setIsSaving(true);

    const { data: session } = await supabase.auth.getSession();

    // For trainer_percentage, find the personal_trainer id
    let trainerId: string | null = null;
    if (expenseCategory === "trainer_percentage" && selectedTrainerId) {
      const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);
      if (selectedTrainer) {
        // Try to find personal_trainer by phone match first
        if (selectedTrainer.phone) {
          const { data: trainerByPhone } = await supabase
            .from("personal_trainers")
            .select("id")
            .eq("phone", selectedTrainer.phone)
            .eq("branch_id", currentBranch?.id)
            .maybeSingle();
          
          if (trainerByPhone) {
            trainerId = trainerByPhone.id;
          } else {
            // Try without branch_id constraint
            const { data: trainerByPhoneOnly } = await supabase
              .from("personal_trainers")
              .select("id")
              .eq("phone", selectedTrainer.phone)
              .maybeSingle();
            
            if (trainerByPhoneOnly) {
              trainerId = trainerByPhoneOnly.id;
            }
          }
        }

        // If phone match failed, try name match
        if (!trainerId) {
          const { data: trainerByName } = await supabase
            .from("personal_trainers")
            .select("id")
            .ilike("name", selectedTrainer.full_name)
            .eq("branch_id", currentBranch?.id)
            .maybeSingle();
          
          if (trainerByName) {
            trainerId = trainerByName.id;
          }
        }
      }
    }

    const { data: inserted, error } = await supabase.from("ledger_entries").insert({
      entry_type: "expense",
      category: expenseCategory,
      description: expenseDescription,
      amount: Number(expenseAmount),
      entry_date: format(expenseDate, "yyyy-MM-dd"),
      notes: expenseNotes || null,
      is_auto_generated: false,
      created_by: session?.session?.user?.id,
      branch_id: currentBranch?.id,
      trainer_id: trainerId || null,
    }).select().single();

    setIsSaving(false);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      // Log activity - use staff logging if staff is logged in
      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "ledger",
          type: "expense_added",
          description: `Staff "${staffUser.fullName}" added expense: ${expenseDescription} - ₹${expenseAmount}`,
          entityType: "ledger_entries",
          newValue: {
            category: expenseCategory,
            description: expenseDescription,
            amount: Number(expenseAmount),
            date: format(expenseDate, "yyyy-MM-dd"),
          },
          branchId: currentBranch?.id,
          staffId: staffUser.id,
          staffName: staffUser.fullName,
          staffPhone: staffUser.phone,
          metadata: { staff_role: staffUser.role },
        });
      } else {
        await logAdminActivity({
          category: "ledger",
          type: "expense_added",
          description: `Added expense: ${expenseDescription} - ₹${expenseAmount}`,
          entityType: "ledger_entries",
          newValue: {
            category: expenseCategory,
            description: expenseDescription,
            amount: Number(expenseAmount),
            date: format(expenseDate, "yyyy-MM-dd"),
          },
          branchId: currentBranch?.id,
        });
      }
      toast.success("Expense added successfully");
      setIsAddExpenseOpen(false);
      resetExpenseForm();
      // Instant local update via query cache
      if (inserted) {
        const queryKey = ["ledger-entries", dateRange.start, dateRange.end, currentBranch?.id];
        queryClient.setQueryData<LedgerEntry[]>(queryKey, (old) => 
          old ? [inserted as LedgerEntry, ...old] : [inserted as LedgerEntry]
        );
      }
      invalidatePayments(); // Background cross-page invalidation
    }
  };

  const resetExpenseForm = () => {
    setExpenseCategory("");
    setExpenseDescription("");
    setExpenseAmount("");
    setExpenseDate(new Date());
    setExpenseNotes("");
    setSelectedTrainerId("");
    setSelectedStaffId("");
  };

  // Fetch trainers when dialog opens and category is trainer_percentage
  useEffect(() => {
    if (isAddExpenseOpen && expenseCategory === "trainer_percentage" && currentBranch?.id) {
      fetchTrainers();
    } else if (!isAddExpenseOpen) {
      setTrainers([]);
      setSelectedTrainerId("");
    }
  }, [isAddExpenseOpen, expenseCategory, currentBranch?.id]);

  // Fetch other staff when dialog opens and category is staff_salary
  useEffect(() => {
    if (isAddExpenseOpen && expenseCategory === "staff_salary" && currentBranch?.id) {
      fetchOtherStaff();
    } else if (!isAddExpenseOpen) {
      setOtherStaff([]);
      setSelectedStaffId("");
    }
  }, [isAddExpenseOpen, expenseCategory, currentBranch?.id]);

  const fetchTrainers = async () => {
    if (!currentBranch?.id) return;
    
    setIsLoadingTrainers(true);
    try {
      // Get staff assigned to current branch
      const { data: assignments } = await supabase
        .from("staff_branch_assignments")
        .select("staff_id")
        .eq("branch_id", currentBranch.id);

      const staffIds = assignments?.map((a) => a.staff_id) || [];

      if (staffIds.length === 0) {
        setTrainers([]);
        setIsLoadingTrainers(false);
        return;
      }

      // Fetch active trainers
      const { data: staffData, error } = await supabase
        .from("staff")
        .select("id, full_name, monthly_salary, phone")
        .in("id", staffIds)
        .eq("role", "trainer")
        .eq("is_active", true)
        .order("full_name");

      if (error) throw error;
      setTrainers((staffData || []) as Array<{ id: string; full_name: string; monthly_salary: number; phone: string | null }>);
    } catch (error: any) {
      console.error("Error fetching trainers:", error);
      toast.error("Error", {
        description: "Failed to fetch trainers",
      });
    } finally {
      setIsLoadingTrainers(false);
    }
  };

  // Handle trainer selection - populate amount with monthly_salary
  const handleTrainerSelect = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) {
      setExpenseAmount(String(trainer.monthly_salary || 0));
      setExpenseDescription(`${trainer.full_name} - Monthly Salary`);
    }
  };

  const fetchOtherStaff = async () => {
    if (!currentBranch?.id) return;
    
    setIsLoadingStaff(true);
    try {
      // Get staff assigned to current branch
      const { data: assignments } = await supabase
        .from("staff_branch_assignments")
        .select("staff_id")
        .eq("branch_id", currentBranch.id);

      const staffIds = assignments?.map((a) => a.staff_id) || [];

      if (staffIds.length === 0) {
        setOtherStaff([]);
        setIsLoadingStaff(false);
        return;
      }

      // Fetch active staff excluding trainers
      const { data: staffData, error } = await supabase
        .from("staff")
        .select("id, full_name, monthly_salary, phone, role")
        .in("id", staffIds)
        .neq("role", "trainer")
        .eq("is_active", true)
        .order("full_name");

      if (error) throw error;
      setOtherStaff((staffData || []) as Array<{ id: string; full_name: string; monthly_salary: number; phone: string | null; role: string }>);
    } catch (error: any) {
      console.error("Error fetching staff:", error);
      toast.error("Error", {
        description: "Failed to fetch staff",
      });
    } finally {
      setIsLoadingStaff(false);
    }
  };

  // Handle staff selection - populate amount with monthly_salary
  const handleStaffSelect = (staffId: string) => {
    setSelectedStaffId(staffId);
    const staff = otherStaff.find((s) => s.id === staffId);
    if (staff) {
      setExpenseAmount(String(staff.monthly_salary || 0));
      setExpenseDescription(`${staff.full_name} - Monthly Salary`);
    }
  };

  const handleExport = () => {
    try {
      const sourceEntries = hasActiveFilters ? filteredEntries : entries;
      const exportData = sourceEntries.map((entry) => ({
        Date: format(parseISO(entry.entry_date), "dd MMM yyyy"),
        Type: entry.entry_type === "income" ? "Income" : "Expense",
        Category: getCategoryLabel(entry.category, entry.entry_type),
        Description: entry.description,
        Amount: `₹${Number(entry.amount).toLocaleString("en-IN")}`,
        "Auto Generated": entry.is_auto_generated ? "Yes" : "No",
      }));

      exportToExcel(exportData, "ledger");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} ledger entry/entries to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export ledger entries",
      });
    }
  };

  const handleDeleteEntry = (entry: LedgerEntry) => {
    if (entry.is_auto_generated) {
      toast.error("Cannot delete", {
        description: "Auto-generated entries cannot be deleted",
      });
      return;
    }

    setConfirmDialog({
      open: true,
      title: "Delete Entry",
      description: `Are you sure you want to delete "${entry.description}"?`,
      onConfirm: async () => {
        const { error } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("id", entry.id);

        if (error) {
          toast.error("Error", {
            description: error.message,
          });
        } else {
          // Log activity - use staff logging if staff is logged in
          if (isStaffLoggedIn && staffUser) {
            await logStaffActivity({
              category: "ledger",
              type: "expense_deleted",
              description: `Staff "${staffUser.fullName}" deleted ledger entry: ${entry.description}`,
              entityType: "ledger_entries",
              entityId: entry.id,
              oldValue: {
                category: entry.category,
                description: entry.description,
                amount: entry.amount,
                type: entry.entry_type,
              },
              branchId: currentBranch?.id,
              staffId: staffUser.id,
              staffName: staffUser.fullName,
              staffPhone: staffUser.phone,
              metadata: { staff_role: staffUser.role },
            });
          } else {
            await logAdminActivity({
              category: "ledger",
              type: "expense_deleted",
              description: `Deleted ledger entry: ${entry.description}`,
              entityType: "ledger_entries",
              entityId: entry.id,
              oldValue: {
                category: entry.category,
                description: entry.description,
                amount: entry.amount,
                type: entry.entry_type,
              },
              branchId: currentBranch?.id,
            });
          }
          toast.success("Entry deleted");
          // Instant local update via query cache
          const queryKey = ["ledger-entries", dateRange.start, dateRange.end, currentBranch?.id];
          queryClient.setQueryData<LedgerEntry[]>(queryKey, (old) => 
            old ? old.filter(e => e.id !== entry.id) : []
          );
          invalidatePayments();
        }
      },
    });
  };

  // Calculate totals (with transaction counts and savings rate)
  const totals = useMemo(() => {
    let income = 0, expense = 0, incomeCount = 0, expenseCount = 0;
    entries.forEach((e) => {
      if (e.entry_type === "income") { income += Number(e.amount); incomeCount++; }
      else { expense += Number(e.amount); expenseCount++; }
    });
    const profit = income - expense;
    const savingsRate = income > 0 ? (profit / income) * 100 : 0;
    return { income, expense, profit, incomeCount, expenseCount, savingsRate };
  }, [entries]);

  // Chart data - group by date
  const chartData = useMemo(() => {
    const grouped: Record<string, { date: string; income: number; expense: number }> = {};
    entries.forEach((entry) => {
      if (!grouped[entry.entry_date]) {
        grouped[entry.entry_date] = { date: entry.entry_date, income: 0, expense: 0 };
      }
      if (entry.entry_type === "income") {
        grouped[entry.entry_date].income += Number(entry.amount);
      } else {
        grouped[entry.entry_date].expense += Number(entry.amount);
      }
    });
    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        date: format(parseISO(item.date), "MMM dd"),
      }));
  }, [entries]);

  const getCategoryLabel = (category: string, entryType: string) => {
    const categories = entryType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return categories.find((c) => c.value === category)?.label || category;
  };

  // Category breakdown for donut/list
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { category: string; type: "income" | "expense"; amount: number; count: number }> = {};
    entries.forEach((e) => {
      const key = `${e.entry_type}:${e.category}`;
      if (!map[key]) map[key] = { category: e.category, type: e.entry_type, amount: 0, count: 0 };
      map[key].amount += Number(e.amount);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [entries]);

  const topExpenseCategories = useMemo(
    () => categoryBreakdown.filter((c) => c.type === "expense").slice(0, 5),
    [categoryBreakdown]
  );

  // Filtered entries (search + type + category)
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.entry_type !== typeFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (q) {
        const haystack = `${e.description} ${getCategoryLabel(e.category, e.entry_type)} ${e.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, searchQuery, typeFilter, categoryFilter]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (typeFilter === "all" || e.entry_type === typeFilter) set.add(e.category);
    });
    return Array.from(set);
  }, [entries, typeFilter]);

  const hasActiveFilters = !!searchQuery || typeFilter !== "all" || categoryFilter !== "all";
  const clearFilters = () => { setSearchQuery(""); setTypeFilter("all"); setCategoryFilter("all"); };

  // Category color palette (used in donut + chips)
  const CATEGORY_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--success))",
    "hsl(var(--destructive))",
    "hsl(var(--warning))",
    "hsl(var(--accent))",
    "hsl(217 91% 60%)",
    "hsl(280 65% 60%)",
    "hsl(35 90% 55%)",
    "hsl(160 70% 45%)",
  ];

  const dateRangeLabel = useMemo(() => {
    return `${format(dateRange.start, "dd MMM")} – ${format(dateRange.end, "dd MMM yyyy")}`;
  }, [dateRange]);


  if (showSkeleton) {
    return <LedgerSkeleton />;
  }

  const presetButtons = [
    { value: "today", label: "Today" },
    { value: "7days", label: "7D" },
    { value: "15days", label: "15D" },
    { value: "30days", label: "30D" },
    { value: "this_month", label: "This Month" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <Fragment>
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
        {/* HERO HEADER */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-5 sm:p-7">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
                <BookOpenIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Ledger</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateRangeLabel}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span>{entries.length} {entries.length === 1 ? "transaction" : "transactions"}</span>
                  {isEntriesFetching && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        Refreshing
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size={isMobile ? "sm" : "default"}
                onClick={handleExport}
                disabled={entries.length === 0}
                className="gap-2 bg-background/60 backdrop-blur"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
                <DialogTrigger asChild>
                  <Button size={isMobile ? "sm" : "default"} className="gap-2 shadow-sm">
                    <PlusIcon className="h-4 w-4" />
                    Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Expense</DialogTitle>
                    <DialogDescription>Record a new expense entry</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Select
                        value={expenseCategory}
                        onValueChange={(value) => {
                          setExpenseCategory(value);
                          if (value !== "trainer_percentage") setSelectedTrainerId("");
                          if (value !== "staff_salary") setSelectedStaffId("");
                          if (value !== "trainer_percentage" && value !== "staff_salary") setExpenseAmount("");
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {expenseCategory === "trainer_percentage" && (
                      <div className="space-y-2">
                        <Label>Trainer *</Label>
                        <Select value={selectedTrainerId} onValueChange={handleTrainerSelect} disabled={isLoadingTrainers}>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingTrainers ? "Loading trainers..." : "Select trainer"} />
                          </SelectTrigger>
                          <SelectContent>
                            {trainers.length === 0 ? (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                {isLoadingTrainers ? "Loading..." : "No trainers found"}
                              </div>
                            ) : (
                              trainers.map((trainer) => (
                                <SelectItem key={trainer.id} value={trainer.id}>
                                  {trainer.full_name} {trainer.monthly_salary > 0 && `(₹${trainer.monthly_salary.toLocaleString()}/mo)`}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {expenseCategory === "staff_salary" && (
                      <div className="space-y-2">
                        <Label>Staff Member *</Label>
                        <Select value={selectedStaffId} onValueChange={handleStaffSelect} disabled={isLoadingStaff}>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingStaff ? "Loading staff..." : "Select staff member"} />
                          </SelectTrigger>
                          <SelectContent>
                            {otherStaff.length === 0 ? (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                {isLoadingStaff ? "Loading..." : "No staff found"}
                              </div>
                            ) : (
                              otherStaff.map((staff) => (
                                <SelectItem key={staff.id} value={staff.id}>
                                  {staff.full_name} {staff.monthly_salary > 0 && `(₹${staff.monthly_salary.toLocaleString()}/mo)`}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Description *</Label>
                      <Input
                        value={expenseDescription}
                        onChange={(e) => setExpenseDescription(e.target.value)}
                        placeholder={expenseDescriptionPlaceholder}
                        disabled={(expenseCategory === "trainer_percentage" && selectedTrainerId !== "") || (expenseCategory === "staff_salary" && selectedStaffId !== "")}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount (₹) *</Label>
                        <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start">
                              <CalendarIcon className="w-4 h-4 mr-2" />
                              {format(expenseDate, "PPP")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={expenseDate} onSelect={(date) => date && setExpenseDate(date)} initialFocus />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Input value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} placeholder="Additional notes..." />
                    </div>
                    <div className="flex gap-3 pt-4">
                      <Button variant="outline" className="flex-1" onClick={() => setIsAddExpenseOpen(false)}>Cancel</Button>
                      <Button className="flex-1 gap-2" onClick={handleAddExpense} disabled={isSaving}>
                        {isSaving && <ButtonSpinner />}
                        {isSaving ? "Adding..." : "Add Expense"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Date range pills inside header */}
          <div className="relative mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-background/70 backdrop-blur p-1 shadow-sm">
              {presetButtons.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDateRangePreset(p.value as DateRangePreset)}
                  className={cn(
                    "px-3 py-1.5 text-xs sm:text-sm rounded-md transition-all font-medium",
                    dateRangePreset === p.value
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {dateRangePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-background/70 backdrop-blur">
                      <CalendarIcon className="w-4 h-4" />
                      {customStartDate ? format(customStartDate, "MMM dd") : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} initialFocus />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-background/70 backdrop-blur">
                      <CalendarIcon className="w-4 h-4" />
                      {customEndDate ? format(customEndDate, "MMM dd") : "End"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Income */}
          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-success/15 via-success/5 to-transparent ring-1 ring-success/20 hover:ring-success/40 transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-success/80">Income</p>
                  <p className="text-2xl sm:text-[26px] font-bold text-success leading-tight">
                    ₹{totals.income.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">{totals.incomeCount} {totals.incomeCount === 1 ? "entry" : "entries"}</p>
                </div>
                <div className="rounded-xl bg-success/15 p-2.5 group-hover:scale-110 transition-transform">
                  <ArrowUpRightIcon className="h-5 w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent ring-1 ring-destructive/20 hover:ring-destructive/40 transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-destructive/80">Expenses</p>
                  <p className="text-2xl sm:text-[26px] font-bold text-destructive leading-tight">
                    ₹{totals.expense.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">{totals.expenseCount} {totals.expenseCount === 1 ? "entry" : "entries"}</p>
                </div>
                <div className="rounded-xl bg-destructive/15 p-2.5 group-hover:scale-110 transition-transform">
                  <ArrowDownRightIcon className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Profit */}
          <Card className={cn(
            "group relative overflow-hidden border-0 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lg",
            totals.profit >= 0
              ? "bg-gradient-to-br from-primary/15 via-primary/5 to-transparent ring-primary/20 hover:ring-primary/40"
              : "bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent ring-destructive/20 hover:ring-destructive/40"
          )}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className={cn(
                    "text-xs font-medium uppercase tracking-wider",
                    totals.profit >= 0 ? "text-primary/80" : "text-destructive/80"
                  )}>Net P&L</p>
                  <p className={cn(
                    "text-2xl sm:text-[26px] font-bold leading-tight",
                    totals.profit >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    {totals.profit >= 0 ? "+" : "-"}₹{Math.abs(totals.profit).toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totals.profit >= 0 ? "Profitable period" : "Loss for period"}
                  </p>
                </div>
                <div className={cn(
                  "rounded-xl p-2.5 group-hover:scale-110 transition-transform",
                  totals.profit >= 0 ? "bg-primary/15" : "bg-destructive/15"
                )}>
                  {totals.profit >= 0
                    ? <ArrowTrendingUpIcon className="h-5 w-5 text-primary" />
                    : <ArrowTrendingDownIcon className="h-5 w-5 text-destructive" />}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Savings rate */}
          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent ring-1 ring-accent/20 hover:ring-accent/40 transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent/80">Margin</p>
                  <p className="text-2xl sm:text-[26px] font-bold text-accent leading-tight">
                    {totals.income > 0 ? `${totals.savingsRate.toFixed(1)}%` : "—"}
                  </p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        totals.savingsRate >= 0 ? "bg-accent" : "bg-destructive"
                      )}
                      style={{ width: `${Math.min(Math.max(totals.savingsRate, 0), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl bg-accent/15 p-2.5 ml-3 group-hover:scale-110 transition-transform">
                  <SparklesIcon className="h-5 w-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CHARTS ROW */}
        {entries.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
            {/* Bar / Donut chart */}
            <Card className="lg:col-span-2 overflow-hidden">
              <CardHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <ChartBarIcon className="h-4 w-4 text-primary" />
                      Cash Flow
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-0.5">
                      {chartView === "bar" ? "Daily income vs expenses" : "Expense breakdown by category"}
                    </CardDescription>
                  </div>
                  <Tabs value={chartView} onValueChange={(v) => setChartView(v as "bar" | "donut")}>
                    <TabsList className="h-8 p-0.5">
                      <TabsTrigger value="bar" className="h-7 px-2.5 text-xs gap-1.5">
                        <Squares2X2Icon className="h-3.5 w-3.5" />
                        Daily
                      </TabsTrigger>
                      <TabsTrigger value="donut" className="h-7 px-2.5 text-xs gap-1.5">
                        <ChartPieIcon className="h-3.5 w-3.5" />
                        By Category
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-3 pt-3 sm:px-4 sm:pb-4">
                <div className="h-[240px] sm:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === "bar" ? (
                      <BarChart data={chartData} margin={{ top: 8, right: 12, left: isMobile ? -12 : 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                        <XAxis dataKey="date" className="text-xs" tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} />
                        <YAxis className="text-xs" tick={{ fontSize: isMobile ? 10 : 11 }} width={isMobile ? 40 : 50} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "10px",
                            boxShadow: "0 8px 24px -12px hsl(var(--foreground) / 0.15)",
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [`₹${value.toLocaleString("en-IN")}`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 12, paddingTop: 8 }} iconType="circle" />
                        <Bar dataKey="income" name="Income" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} maxBarSize={42} />
                        <Bar dataKey="expense" name="Expense" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} maxBarSize={42} />
                      </BarChart>
                    ) : topExpenseCategories.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        No expense data for this period
                      </div>
                    ) : (
                      <PieChart>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "10px",
                            fontSize: 12,
                          }}
                          formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Amount"]}
                        />
                        <Pie
                          data={topExpenseCategories.map((c) => ({ name: getCategoryLabel(c.category, "expense"), value: c.amount }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={isMobile ? 50 : 65}
                          outerRadius={isMobile ? 85 : 105}
                          paddingAngle={3}
                        >
                          {topExpenseCategories.map((_, idx) => (
                            <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} iconType="circle" />
                      </PieChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top categories list */}
            <Card className="overflow-hidden">
              <CardHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b bg-muted/30">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <CurrencyRupeeIcon className="h-4 w-4 text-destructive" />
                  Top Expenses
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-0.5">Where money is going</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                {topExpenseCategories.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No expenses yet</div>
                ) : (
                  <div className="space-y-3">
                    {topExpenseCategories.map((c, idx) => {
                      const pct = totals.expense > 0 ? (c.amount / totals.expense) * 100 : 0;
                      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                      return (
                        <div key={c.category} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate font-medium">{getCategoryLabel(c.category, "expense")}</span>
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                              ₹{c.amount.toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{c.count} {c.count === 1 ? "entry" : "entries"}</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* TRANSACTIONS */}
        <Card className="overflow-hidden">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b bg-muted/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg">Transactions</CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-0.5">
                  {hasActiveFilters
                    ? `${filteredEntries.length} of ${entries.length} matching`
                    : `${entries.length} entries`}
                </CardDescription>
              </div>

              {/* Filter toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:flex-initial sm:w-56">
                  <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    className="h-9 pl-8 pr-8 text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label="Clear search"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setCategoryFilter("all"); }}>
                  <SelectTrigger className="h-9 w-auto min-w-[110px] text-sm gap-1.5">
                    <FunnelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expenses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={availableCategories.length === 0}>
                  <SelectTrigger className="h-9 w-auto min-w-[130px] text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {availableCategories.map((cat) => {
                      const sample = entries.find((e) => e.category === cat);
                      return (
                        <SelectItem key={cat} value={cat}>
                          {sample ? getCategoryLabel(cat, sample.entry_type) : cat}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs gap-1">
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <BookOpenIcon className="h-7 w-7 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium">No entries yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an expense or wait for transactions to appear here</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm font-medium">No matches found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different search or clear the filters</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : isMobile ? (
              <div className="divide-y">
                {filteredEntries.map((entry) => (
                  <MobileExpandableRow
                    key={entry.id}
                    collapsedContent={
                      <div className="flex items-center gap-3 py-0.5">
                        <div className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0",
                          entry.entry_type === "income" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                        )}>
                          {entry.entry_type === "income"
                            ? <ArrowUpRightIcon className="h-4 w-4" />
                            : <ArrowDownRightIcon className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.description}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                            <span>{format(parseISO(entry.entry_date), "dd MMM")}</span>
                            <span className="text-muted-foreground/40">•</span>
                            <span className="truncate">{getCategoryLabel(entry.category, entry.entry_type)}</span>
                          </div>
                        </div>
                        <span className={cn(
                          "text-sm font-semibold whitespace-nowrap",
                          entry.entry_type === "income" ? "text-success" : "text-destructive"
                        )}>
                          {entry.entry_type === "income" ? "+" : "-"}₹{Number(entry.amount).toLocaleString("en-IN")}
                        </span>
                      </div>
                    }
                    expandedContent={
                      <div className="space-y-3 pt-2">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Type</p>
                            <Badge className={cn(
                              "mt-1",
                              entry.entry_type === "income"
                                ? "bg-success/10 text-success border-success/20"
                                : "bg-destructive/10 text-destructive border-destructive/20"
                            )}>
                              {entry.entry_type === "income" ? "Income" : "Expense"}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Category</p>
                            <p className="font-medium mt-1">{getCategoryLabel(entry.category, entry.entry_type)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Description</p>
                            <p className="font-medium mt-1">{entry.description}</p>
                            {entry.is_auto_generated && (
                              <span className="text-xs text-muted-foreground">(Auto-generated)</span>
                            )}
                          </div>
                          {entry.notes && (
                            <div className="col-span-2">
                              <p className="text-xs text-muted-foreground">Notes</p>
                              <p className="text-sm mt-1">{entry.notes}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleViewEntry(entry)}>
                            <EyeIcon className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                          {!entry.is_auto_generated && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry); }}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="whitespace-nowrap text-xs uppercase tracking-wider font-semibold w-[120px]">Date</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">Transaction</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold w-[160px]">Category</TableHead>
                      <TableHead className="text-right whitespace-nowrap text-xs uppercase tracking-wider font-semibold w-[140px]">Amount</TableHead>
                      <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className="cursor-pointer group transition-colors"
                        onClick={() => handleViewEntry(entry)}
                      >
                        <TableCell className="py-3">
                          <div>
                            <p className="text-sm font-medium">{format(parseISO(entry.entry_date), "dd MMM")}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(parseISO(entry.entry_date), "yyyy")} · {format(new Date(entry.created_at), "hh:mm a")}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105",
                              entry.entry_type === "income" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                            )}>
                              {entry.entry_type === "income"
                                ? <ArrowUpRightIcon className="h-4 w-4" />
                                : <ArrowDownRightIcon className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 max-w-[280px] lg:max-w-md">
                              <p className="text-sm font-medium truncate">{entry.description}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {entry.is_auto_generated ? "Auto-generated" : "Manual entry"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground/80">
                            {getCategoryLabel(entry.category, entry.entry_type)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <span className={cn(
                            "text-sm font-semibold tabular-nums",
                            entry.entry_type === "income" ? "text-success" : "text-destructive"
                          )}>
                            {entry.entry_type === "income" ? "+" : "-"}₹{Number(entry.amount).toLocaleString("en-IN")}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); handleViewEntry(entry); }}
                              aria-label="View details"
                            >
                              <EyeIcon className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            {!entry.is_auto_generated && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-destructive/10"
                                onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry); }}
                                aria-label="Delete"
                              >
                                <TrashIcon className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDialog.onConfirm}
      />

      <LedgerDetailDialog
        entry={selectedEntry}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        getCategoryLabel={getCategoryLabel}
      />
    </Fragment>
  );
};

export default AdminLedger;
