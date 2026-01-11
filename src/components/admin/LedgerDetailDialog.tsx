import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Calendar,
  Tag,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  IndianRupee,
  User,
  Dumbbell,
  CreditCard,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

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
  member_name?: string | null;
  trainer_name?: string | null;
}

interface LedgerDetailDialogProps {
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getCategoryLabel: (category: string, entryType: string) => string;
}

const LedgerDetailDialog = ({ entry, open, onOpenChange, getCategoryLabel }: LedgerDetailDialogProps) => {
  if (!entry) return null;

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
      relative: getRelativeTime(date),
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return null;
  };

  const { date, time, relative } = formatDateTime(entry.created_at);
  const isIncome = entry.entry_type === "income";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isIncome ? "bg-success/10" : "bg-destructive/10"
            )}>
              {isIncome ? (
                <ArrowUpRight className="w-5 h-5 text-success" />
              ) : (
                <ArrowDownRight className="w-5 h-5 text-destructive" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold">Transaction Details</p>
              <p className="text-sm font-normal text-muted-foreground">
                {getCategoryLabel(entry.category, entry.entry_type)}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Amount */}
          <div className="text-center py-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">Amount</p>
            <p className={cn(
              "text-3xl font-bold",
              isIncome ? "text-success" : "text-destructive"
            )}>
              {isIncome ? "+" : "-"}₹{Number(entry.amount).toLocaleString("en-IN")}
            </p>
          </div>

          {/* Timing Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Timing Details
            </h4>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{format(parseISO(entry.entry_date), "EEEE, MMMM d, yyyy")}</p>
                  <p className="text-xs text-muted-foreground">Entry Date</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{date}</p>
                  <p className="text-xs text-muted-foreground">Created: {time}</p>
                </div>
              </div>
              {relative && (
                <Badge variant="outline" className="text-xs">
                  {relative}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Description
            </h4>
            <p className="text-sm text-foreground bg-muted/30 rounded-lg p-4">
              {entry.description}
            </p>
          </div>

          {/* Details Grid */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Transaction Details
            </h4>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Type
                </span>
                <Badge className={cn(
                  isIncome 
                    ? "bg-success/10 text-success border-success/20" 
                    : "bg-destructive/10 text-destructive border-destructive/20"
                )}>
                  {isIncome ? "Income" : "Expense"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <IndianRupee className="w-4 h-4" />
                  Category
                </span>
                <span className="text-sm font-medium">{getCategoryLabel(entry.category, entry.entry_type)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Source</span>
                <Badge variant="outline">
                  {entry.is_auto_generated ? "Auto-generated" : "Manual Entry"}
                </Badge>
              </div>
              {entry.member_name && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Member
                  </span>
                  <span className="text-sm font-medium">{entry.member_name}</span>
                </div>
              )}
              {entry.trainer_name && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Dumbbell className="w-4 h-4" />
                    Trainer
                  </span>
                  <span className="text-sm font-medium">{entry.trainer_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {entry.notes && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes
                </h4>
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
                  {entry.notes}
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LedgerDetailDialog;
