import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
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
} from "recharts";
import LedgerDetailDialog from "@/components/admin/LedgerDetailDialog";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useQuery } from "@tanstack/react-query";

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
  { value: "bill_payment", label: "Bill Payment" },
  { value: "service_repair", label: "Service/Repair" },
  { value: "equipment", label: "Equipment Purchase" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "misc_expense", label: "Miscellaneous Expense" },
];

const INCOME_CATEGORIES = [
  { value: "gym_membership", label: "Gym Membership" },
  { value: "gym_renewal", label: "Gym Renewal" },
  { value: "daily_pass", label: "Daily Pass" },
  { value: "pt_subscription", label: "PT Subscription" },
  { value: "joining_fee", label: "Joining Fee" },
  { value: "misc_income", label: "Miscellaneous Income" },
];

type DateRangePreset = "today" | "7days" | "15days" | "30days" | "this_month" | "custom";

const AdminLedger = () => {
  
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

  const { data: entries = [], refetch: fetchEntries } = useQuery({
    queryKey: ["ledger-entries", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
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
  });

  const handleAddExpense = async () => {
    if (!expenseCategory || !expenseDescription || !expenseAmount) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSaving(true);

    const { data: session } = await supabase.auth.getSession();

    const { error } = await supabase.from("ledger_entries").insert({
      entry_type: "expense",
      category: expenseCategory,
      description: expenseDescription,
      amount: Number(expenseAmount),
      entry_date: format(expenseDate, "yyyy-MM-dd"),
      notes: expenseNotes || null,
      is_auto_generated: false,
      created_by: session?.session?.user?.id,
    });

    setIsSaving(false);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "payments",
        type: "cash_payment_added",
        description: `Added expense: ${expenseDescription} - ₹${expenseAmount}`,
        entityType: "ledger_entries",
        newValue: {
          category: expenseCategory,
          description: expenseDescription,
          amount: Number(expenseAmount),
          date: format(expenseDate, "yyyy-MM-dd"),
        },
      });
      toast.success("Expense added successfully");
      setIsAddExpenseOpen(false);
      resetExpenseForm();
      fetchEntries();
    }
  };

  const resetExpenseForm = () => {
    setExpenseCategory("");
    setExpenseDescription("");
    setExpenseAmount("");
    setExpenseDate(new Date());
    setExpenseNotes("");
  };

  const handleExport = () => {
    try {
      const exportData = entries.map((entry) => ({
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
          await logAdminActivity({
            category: "payments",
            type: "payment_deleted",
            description: `Deleted ledger entry: ${entry.description}`,
            entityType: "ledger_entries",
            entityId: entry.id,
            oldValue: {
              category: entry.category,
              description: entry.description,
              amount: entry.amount,
              type: entry.entry_type,
            },
          });
          toast.success("Entry deleted");
          fetchEntries();
        }
      },
    });
  };

  // Calculate totals
  const totals = useMemo(() => {
    const income = entries
      .filter((e) => e.entry_type === "income")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const expense = entries
      .filter((e) => e.entry_type === "expense")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      income,
      expense,
      profit: income - expense,
    };
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

  return (
    <AdminLayout title="Ledger" subtitle="Track profit & loss" onRefresh={() => fetchEntries()}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Date Range Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm font-medium">Date Range:</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "today", label: "Today" },
                  { value: "7days", label: "7 Days" },
                  { value: "15days", label: "15 Days" },
                  { value: "30days", label: "30 Days" },
                  { value: "this_month", label: "This Month" },
                  { value: "custom", label: "Custom" },
                ].map((preset) => (
                  <Button
                    key={preset.value}
                    variant={dateRangePreset === preset.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDateRangePreset(preset.value as DateRangePreset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              
              {dateRangePreset === "custom" && (
                <div className="flex items-center gap-2 ml-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        {customStartDate ? format(customStartDate, "MMM dd") : "Start"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        {customEndDate ? format(customEndDate, "MMM dd") : "End"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-success">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Income</p>
                  <p className="text-2xl font-bold text-success">
                    ₹{totals.income.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="p-3 bg-success/10 rounded-lg">
                  <ArrowUpRightIcon className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold text-destructive">
                    ₹{totals.expense.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-lg">
                  <ArrowDownRightIcon className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-l-4", totals.profit >= 0 ? "border-l-primary" : "border-l-destructive")}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    totals.profit >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    {totals.profit >= 0 ? "+" : ""}₹{totals.profit.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className={cn("p-3 rounded-lg", totals.profit >= 0 ? "bg-primary/10" : "bg-destructive/10")}>
                  {totals.profit >= 0 ? (
                    <ArrowTrendingUpIcon className="w-6 h-6 text-primary" />
                  ) : (
                    <ArrowTrendingDownIcon className="w-6 h-6 text-destructive" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Income vs Expenses</CardTitle>
              <CardDescription>Daily breakdown for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, ""]}
                    />
                    <Legend />
                    <Bar dataKey="income" name="Income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Entries Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>All income and expense entries</CardDescription>
              </div>
              <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <PlusIcon className="w-4 h-4 mr-2" />
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
                      <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Description *</Label>
                      <Input
                        value={expenseDescription}
                        onChange={(e) => setExpenseDescription(e.target.value)}
                        placeholder="e.g., Electricity bill for January"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount (₹) *</Label>
                        <Input
                          type="number"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder="0"
                        />
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
                            <Calendar
                              mode="single"
                              selected={expenseDate}
                              onSelect={(date) => date && setExpenseDate(date)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Input
                        value={expenseNotes}
                        onChange={(e) => setExpenseNotes(e.target.value)}
                        placeholder="Additional notes..."
                      />
                    </div>
                    <div className="flex gap-3 pt-4">
                      <Button variant="outline" className="flex-1" onClick={() => setIsAddExpenseOpen(false)}>
                        Cancel
                      </Button>
                      <Button className="flex-1" onClick={handleAddExpense} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Add Expense"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpenIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No entries found for the selected period</p>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    className="gap-2 hover:bg-accent/50 transition-colors font-medium"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    Export Data
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow 
                        key={entry.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleViewEntry(entry)}
                      >
                        <TableCell className="font-medium">
                          <div>
                            <p>{format(parseISO(entry.entry_date), "MMM dd, yyyy")}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(entry.created_at), "hh:mm a")}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                            entry.entry_type === "income"
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                          )}>
                            {entry.entry_type === "income" ? (
                              <ArrowUpRightIcon className="w-3 h-3" />
                            ) : (
                              <ArrowDownRightIcon className="w-3 h-3" />
                            )}
                            {entry.entry_type === "income" ? "Income" : "Expense"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getCategoryLabel(entry.category, entry.entry_type)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="truncate">{entry.description}</p>
                            {entry.is_auto_generated && (
                              <span className="text-xs text-muted-foreground">(Auto-generated)</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          entry.entry_type === "income" ? "text-success" : "text-destructive"
                        )}>
                          {entry.entry_type === "income" ? "+" : "-"}₹{Number(entry.amount).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewEntry(entry);
                              }}
                            >
                              <BookOpenIcon className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            {!entry.is_auto_generated && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEntry(entry);
                                }}
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
              </>
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
    </AdminLayout>
  );
};

export default AdminLedger;
