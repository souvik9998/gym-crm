import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { readBackupPreview, isSupportedVersion, type BackupPreview } from "@/lib/backup/zipReader";
import { importBranch, type ImportResult } from "@/api/backup";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ImportProgressOverlay, type ImportStep } from "./ImportProgressOverlay";
import { useQueryClient } from "@tanstack/react-query";

const INITIAL_STEPS: ImportStep[] = [
  { key: "upload", label: "Uploading backup", status: "pending" },
  { key: "validate", label: "Validating contents", status: "pending" },
  { key: "autobackup", label: "Backing up current data", status: "pending" },
  { key: "restore", label: "Restoring rows (atomic)", status: "pending" },
  { key: "files", label: "Restoring files", status: "pending" },
  { key: "verify", label: "Verifying counts", status: "pending" },
];

export const ImportCard = () => {
  const { currentBranch } = useBranch();
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCrossTenant, setConfirmCrossTenant] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [steps, setSteps] = useState<ImportStep[]>(INITIAL_STEPS);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const isCrossTenant = !!preview && !!tenantId && preview.metadata.tenant_id !== tenantId;
  const versionOk = !!preview && isSupportedVersion(preview.metadata.version);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setConfirmDelete(false);
    setConfirmCrossTenant(false);
    setConfirmText("");
    setSteps(INITIAL_STEPS);
    setErrorLog(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(null);
    setPreviewError(null);
    setConfirmDelete(false);
    setConfirmCrossTenant(false);
    setConfirmText("");
    if (!f) return;
    try {
      const p = await readBackupPreview(f);
      setPreview(p);
    } catch (err) {
      setPreviewError((err as Error).message);
    }
  };

  const advance = (key: string, status: ImportStep["status"]) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));
  };

  const canImport =
    !!file &&
    !!preview &&
    !!currentBranch &&
    versionOk &&
    confirmDelete &&
    confirmText === "DELETE" &&
    (!isCrossTenant || confirmCrossTenant);

  const handleImport = async () => {
    if (!file || !currentBranch || !preview) return;
    setIsImporting(true);
    setErrorLog(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));

    advance("upload", "active");
    try {
      // Note: progress is sequential — we mark "upload" done as soon as the request body is sent;
      // the rest of the steps are driven by the server's phases on completion.
      advance("upload", "done");
      advance("validate", "active");

      const result = await importBranch(currentBranch.id, file, isCrossTenant);

      // Mark all server phases done on success
      ["validate", "autobackup", "restore", "files", "verify"].forEach((k) => advance(k, "done"));
      setLastResult(result);

      // Invalidate every cached query for this branch
      queryClient.clear();

      toast.success(
        `Restored ${Object.values(result.counts).reduce((a, b) => a + b.actual, 0)} rows from ${result.source_branch_name}`,
        { duration: 8000 }
      );
      if (result.warnings.length > 0) {
        toast.warning(`${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"} during restore`);
      }
    } catch (err) {
      const e = err as Error & { details?: { log?: string[]; warnings?: string[] } };
      const activeIdx = steps.findIndex((s) => s.status === "active");
      setSteps((prev) =>
        prev.map((s, i) =>
          i === activeIdx ? { ...s, status: "error" } : i < activeIdx ? { ...s, status: "done" } : s
        )
      );
      const log = [
        `ERROR: ${e.message}`,
        "",
        ...(e.details?.log || []),
        "",
        ...(e.details?.warnings?.map((w) => `WARNING: ${w}`) || []),
      ].join("\n");
      setErrorLog(log);
      toast.error(`Restore failed: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const downloadErrorLog = () => {
    if (!errorLog) return;
    const blob = new Blob([errorLog], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `restore-error-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {isImporting && <ImportProgressOverlay steps={steps} />}
      <Card className="border-2 border-destructive/40 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-destructive/10 text-destructive">
              <ExclamationTriangleIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div>
              <CardTitle className="text-base lg:text-xl">Restore into this branch</CardTitle>
              <CardDescription className="text-xs lg:text-sm">
                Destructive — replaces ALL data in the current branch with an uploaded backup
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground">
            <strong>Warning:</strong> all members, subscriptions, payments, attendance, events,
            packages, settings and files in <strong>{currentBranch?.name}</strong> will be deleted
            and replaced. A safety backup of the current data is taken automatically before any
            change is made.
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup-file">Backup file (.zip)</Label>
            <Input
              ref={fileInputRef}
              id="backup-file"
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              disabled={isImporting}
            />
            {previewError && (
              <p className="text-xs text-destructive">{previewError}</p>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Source branch</div>
                  <div className="font-medium">{preview.metadata.branch_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Exported</div>
                  <div className="font-medium">
                    {new Date(preview.metadata.exported_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total rows</div>
                  <div className="font-medium">{preview.totalRows.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Files</div>
                  <div className="font-medium">{preview.fileCount.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    versionOk
                      ? "bg-success/10 text-success border border-success/30"
                      : "bg-destructive/10 text-destructive border border-destructive/30"
                  }`}
                >
                  v{preview.metadata.version} {versionOk ? "compatible" : "unsupported"}
                </span>
                {isCrossTenant && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning border border-warning/30">
                    Cross-tenant migration
                  </span>
                )}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Per-table record counts
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(preview.recordCounts)
                    .filter(([, n]) => n > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <div key={t} className="flex justify-between">
                        <span className="text-muted-foreground truncate">{t}</span>
                        <span className="font-medium">{n.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </details>

              {isCrossTenant && (
                <div className="rounded border border-warning/30 bg-warning/5 p-2 text-xs text-foreground">
                  This backup is from a different organization. IDs will be regenerated and foreign
                  references rewritten. Staff accounts will only be re-linked when a phone number
                  matches an existing staff in your organization.
                </div>
              )}
            </div>
          )}

          {preview && versionOk && (
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm-delete"
                  checked={confirmDelete}
                  onCheckedChange={(c) => setConfirmDelete(c === true)}
                  disabled={isImporting}
                />
                <Label htmlFor="confirm-delete" className="text-xs leading-snug cursor-pointer">
                  I understand this will permanently delete all existing data in{" "}
                  <strong>{currentBranch?.name}</strong> and replace it with the uploaded backup.
                </Label>
              </div>

              {isCrossTenant && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="confirm-cross-tenant"
                    checked={confirmCrossTenant}
                    onCheckedChange={(c) => setConfirmCrossTenant(c === true)}
                    disabled={isImporting}
                  />
                  <Label htmlFor="confirm-cross-tenant" className="text-xs leading-snug cursor-pointer">
                    I'm intentionally restoring data from a different organization.
                  </Label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="confirm-text" className="text-xs">
                  Type <strong>DELETE</strong> to confirm
                </Label>
                <Input
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isImporting}
                  className="font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={handleImport}
              disabled={!canImport || isImporting}
            >
              {isImporting ? <ButtonSpinner /> : <ArrowUpTrayIcon className="w-4 h-4 mr-2" />}
              {isImporting ? "Restoring…" : "Restore from backup"}
            </Button>
            {(file || preview || errorLog) && (
              <Button variant="outline" onClick={reset} disabled={isImporting}>
                Reset
              </Button>
            )}
            {errorLog && (
              <Button variant="outline" onClick={downloadErrorLog}>
                <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                Download error log
              </Button>
            )}
          </div>

          {lastResult?.pre_backup_url && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              <div className="text-muted-foreground mb-1">Pre-restore safety backup (valid for 7 days)</div>
              <a
                href={lastResult.pre_backup_url}
                className="text-primary hover:underline font-medium break-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
