import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Download, Archive, Building2, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { exportBranch } from "@/api/backup";
import { toast } from "@/components/ui/sonner";

const LAST_EXPORT_KEY_PREFIX = "gymkloud-last-export-";

export const ExportCard = () => {
  const { currentBranch } = useBranch();
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBranch) return;
    setLastExportAt(localStorage.getItem(LAST_EXPORT_KEY_PREFIX + currentBranch.id));
  }, [currentBranch]);

  const handleExport = async () => {
    if (!currentBranch) return;
    setIsExporting(true);
    const tId = toast.loading(`Preparing backup for ${currentBranch.name}…`);
    try {
      const { blob, filename } = await exportBranch(currentBranch.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_EXPORT_KEY_PREFIX + currentBranch.id, now);
      setLastExportAt(now);
      toast.success("Backup downloaded", { id: tId });
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`, { id: tId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="relative overflow-hidden border border-border/40 shadow-sm transition-all hover:shadow-md">
      {/* Decorative gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <CardContent className="relative p-5 lg:p-7 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-md" />
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
              <Archive className="w-5 h-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base lg:text-xl font-semibold text-foreground">
                Export branch data
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success border border-success/20">
                <Sparkles className="w-2.5 h-2.5" />
                Safe
              </span>
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
              Download a complete .zip backup of this branch
            </p>
          </div>
        </div>

        {/* Info pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3 transition-colors hover:bg-card">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Branch
              </div>
              <div className="text-sm font-semibold text-foreground truncate">
                {currentBranch?.name || "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3 transition-colors hover:bg-card">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 text-accent shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Last export
              </div>
              <div className="text-sm font-semibold text-foreground truncate">
                {lastExportAt ? new Date(lastExportAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "Never"}
              </div>
            </div>
          </div>
        </div>

        {/* What's included */}
        <div className="flex gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3.5">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-foreground/80 leading-relaxed">
            Includes <strong>members, subscriptions, payments, attendance, events, settings</strong>{" "}
            and all related files. Staff accounts are snapshotted for reference only.
          </div>
        </div>

        {/* Action */}
        <Button
          onClick={handleExport}
          disabled={!currentBranch || isExporting}
          size="lg"
          className="w-full sm:w-auto gap-2 bg-gradient-to-r from-primary to-primary/85 hover:from-primary/95 hover:to-primary/80 shadow-md transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.99]"
        >
          {isExporting ? <ButtonSpinner /> : <Download className="w-4 h-4" />}
          {isExporting ? "Preparing backup…" : "Export branch data"}
        </Button>
      </CardContent>
    </Card>
  );
};
