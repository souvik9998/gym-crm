import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, CreditCard, Banknote, Filter, X, Dumbbell, Download, User, Clock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { exportToExcel } from "@/utils/exportToExcel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/sonner";
import { useBranch } from "@/contexts/BranchContext";
import MobileExpandableRow from "@/components/admin/MobileExpandableRow";
import { usePaymentsQuery, type PaymentWithDetails } from "@/hooks/useDashboardQueries";
import { TableSkeleton } from "@/components/ui/skeleton-loaders";

type PaymentMode = Database["public"]["Enums"]["payment_mode"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];

interface PaymentHistoryProps {
  refreshKey: number;
}

export const PaymentHistory = ({ refreshKey }: PaymentHistoryProps) => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  
  // Use React Query for cached data fetching
  const { data: paymentsData, isLoading, refetch } = usePaymentsQuery();
  const payments = paymentsData || [];
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Refetch when refreshKey changes (manual refresh)
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Filter payments based on current filters
  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      // Date filter
      if (dateFrom && payment.created_at) {
        const paymentDate = new Date(payment.created_at).toISOString().split("T")[0];
        if (paymentDate < dateFrom) return false;
      }
      if (dateTo && payment.created_at) {
        const paymentDate = new Date(payment.created_at).toISOString().split("T")[0];
        if (paymentDate > dateTo) return false;
      }
      
      // Payment mode filter
      if (paymentMode !== "all" && payment.payment_mode !== paymentMode) return false;
      
      // Status filter
      if (statusFilter !== "all" && payment.status !== statusFilter) return false;
      
      // Type filter
      if (typeFilter !== "all" && payment.payment_type !== typeFilter) return false;
      
      return true;
    });
  }, [payments, dateFrom, dateTo, paymentMode, statusFilter, typeFilter]);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setPaymentMode("all");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  const getStatusBadge = (status: PaymentStatus | null) => {
    switch (status) {
      case "success":
        return <Badge variant="success">Success</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getPaymentModeIcon = (mode: PaymentMode) => {
    return mode === "online" ? (
      <CreditCard className="w-4 h-4 text-accent" />
    ) : (
      <Banknote className="w-4 h-4 text-success" />
    );
  };

  const getPaymentTypeBadge = (type: string | null) => {
    switch (type) {
      case "gym_and_pt":
        return (
          <Badge variant="outline" className="text-xs bg-accent/10 text-accent">
            <Dumbbell className="w-3 h-3 mr-1" />
            Gym + PT
          </Badge>
        );
      case "pt_only":
      case "pt":
        return (
          <Badge variant="outline" className="text-xs bg-warning/10 text-warning">
            <Dumbbell className="w-3 h-3 mr-1" />
            PT
          </Badge>
        );
      case "gym_membership":
      default:
        return (
          <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
            Gym
          </Badge>
        );
    }
  };

  const getPaymentTypeText = (type: string | null) => {
    switch (type) {
      case "gym_and_pt":
        return "Gym + PT";
      case "pt_only":
      case "pt":
        return "PT";
      case "gym_membership":
        return "Gym";
      default:
        return type || "-";
    }
  };

  const getStatusText = (status: PaymentStatus | null) => {
    switch (status) {
      case "success":
        return "Success";
      case "pending":
        return "Pending";
      case "failed":
        return "Failed";
      default:
        return "Unknown";
    }
  };

  const handleExport = () => {
    try {
      const exportData = filteredPayments.map((payment) => ({
        Date: payment.created_at ? new Date(payment.created_at).toLocaleString("en-IN") : "-",
        "Member Name": payment.member?.name || payment.daily_pass_user?.name || "-",
        "Member Phone": payment.member?.phone || payment.daily_pass_user?.phone || "-",
        "Payment Type": getPaymentTypeText(payment.payment_type),
        "Payment Mode": payment.payment_mode === "online" ? "Online" : "Cash",
        Amount: `₹${Number(payment.amount).toLocaleString("en-IN")}`,
        Status: getStatusText(payment.status),
        Notes: payment.notes || "-",
      }));

      exportToExcel(exportData, "payments");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} payment(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export payments",
      });
    }
  };

  const hasActiveFilters = dateFrom || dateTo || paymentMode !== "all" || statusFilter !== "all" || typeFilter !== "all";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
        <div className="flex-1 min-w-[100px]">
          <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="text-xs text-muted-foreground mb-1 block">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="gym_membership">Gym Only</SelectItem>
              <SelectItem value="pt_only">PT Only</SelectItem>
              <SelectItem value="gym_and_pt">Gym + PT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filteredPayments.length} of {payments.length} transactions
        </span>
        <div className="flex items-center gap-4">
          <span className="font-semibold text-foreground">
            Total: ₹{filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString("en-IN")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2 hover:bg-accent/50 transition-colors font-medium"
          >
            <Download className="w-4 h-4" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Table */}
      {filteredPayments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Filter className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No payments found</p>
          {hasActiveFilters && (
            <p className="text-sm mt-1">Try adjusting your filters</p>
          )}
        </div>
      ) : isMobile ? (
        /* Mobile View */
        <div className="rounded-lg border overflow-hidden">
          {filteredPayments.map((payment) => (
            <MobileExpandableRow
              key={payment.id}
              collapsedContent={
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">
                        {payment.created_at
                          ? new Date(payment.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "-"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {payment.created_at
                          ? new Date(payment.created_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {payment.member?.name || payment.daily_pass_user?.name || "Unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-success">
                      ₹{Number(payment.amount).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              }
              expandedContent={
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" /> Member
                      </p>
                      <p className="font-medium mt-0.5">
                        {payment.member?.name || payment.daily_pass_user?.name || "Unknown"}
                        {payment.daily_pass_user_id && (
                          <Badge variant="outline" className="ml-1 text-[9px] py-0">Daily</Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium mt-0.5">
                        {payment.member?.phone || payment.daily_pass_user?.phone || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <div className="mt-0.5">{getPaymentTypeBadge(payment.payment_type)}</div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Mode</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {getPaymentModeIcon(payment.payment_mode)}
                        <span className="capitalize text-sm font-medium">{payment.payment_mode}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="font-semibold mt-0.5 text-success">
                        ₹{Number(payment.amount).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <div className="mt-0.5">{getStatusBadge(payment.status)}</div>
                    </div>
                    {payment.notes && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="text-sm mt-0.5">{payment.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        /* Desktop View */
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {payment.created_at
                        ? new Date(payment.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {payment.created_at
                        ? new Date(payment.created_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {payment.member?.name || payment.daily_pass_user?.name || "Unknown"}
                      {payment.daily_pass_user_id && (
                        <Badge variant="outline" className="ml-2 text-[10px] py-0">Daily Pass</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {payment.member?.phone || payment.daily_pass_user?.phone || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getPaymentTypeBadge(payment.payment_type)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPaymentModeIcon(payment.payment_mode)}
                      <span className="capitalize">{payment.payment_mode}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    ₹{Number(payment.amount).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell>{getStatusBadge(payment.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
