import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ArrowDownTrayIcon, ArchiveBoxIcon } from "@heroicons/react/24/outline";
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
      // Trigger download
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
    <Card className="border border-border/40 shadow-sm">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-primary/10 text-primary">
            <ArchiveBoxIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Export branch data</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Download a complete backup of this branch as a .zip file
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Branch</span>
          <span className="font-medium text-foreground">{currentBranch?.name || "—"}</span>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Last export</span>
          <span className="font-medium text-foreground">
            {lastExportAt ? new Date(lastExportAt).toLocaleString() : "Never"}
          </span>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Includes members, subscriptions, payments, attendance, events, settings and all
          related files. Staff accounts are snapshotted for reference only.
        </div>
        <Button onClick={handleExport} disabled={!currentBranch || isExporting} className="w-full sm:w-auto">
          {isExporting ? <ButtonSpinner /> : <ArrowDownTrayIcon className="w-4 h-4 mr-2" />}
          {isExporting ? "Preparing backup…" : "Export branch data"}
        </Button>
      </CardContent>
    </Card>
  );
};
