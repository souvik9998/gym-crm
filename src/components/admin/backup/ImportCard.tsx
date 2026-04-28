import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Upload,
  FileDown,
  FileArchive,
  UploadCloud,
  X,
  CheckCircle2,
  XCircle,
  Database,
  Files,
  CalendarClock,
  Building,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { readBackupPreview, isSupportedVersion, type BackupPreview } from "@/lib/backup/zipReader";
import { importBranch, type ImportResult } from "@/api/backup";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ImportProgressOverlay, type ImportStep } from "./ImportProgressOverlay";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const INITIAL_STEPS: ImportStep[] = [
  { key: "upload", label: "Uploading backup", status: "pending" },
  { key: "validate", label: "Validating contents", status: "pending" },
  { key: "autobackup", label: "Backing up current data", status: "pending" },
  { key: "restore", label: "Restoring rows (atomic)", status: "pending" },
  { key: "files", label: "Restoring files", status: "pending" },
  { key: "verify", label: "Verifying counts", status: "pending" },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [showCounts, setShowCounts] = useState(false);

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
    setShowCounts(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setPreviewError(null);
    setConfirmDelete(false);
    setConfirmCrossTenant(false);
    setConfirmText("");
    try {
      const p = await readBackupPreview(f);
      setPreview(p);
    } catch (err) {
      setPreviewError((err as Error).message);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) await processFile(f);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isImporting) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setPreviewError("Please drop a .zip backup file");
      return;
    }
    await processFile(f);
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
      advance("upload", "done");
      advance("validate", "active");

      const result = await importBranch(currentBranch.id, file, isCrossTenant);

      ["validate", "autobackup", "restore", "files", "verify"].forEach((k) => advance(k, "done"));
      setLastResult(result);

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
      <Card className="relative overflow-hidden border border-destructive/30 shadow-sm transition-all hover:shadow-md">
        {/* Decorative backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-warning/5 pointer-events-none" />
        <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-destructive/10 blur-3xl pointer-events-none" />

        <CardContent className="relative p-5 lg:p-7 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-destructive/20 blur-md" />
              <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive to-destructive/70 text-destructive-foreground shadow-lg">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base lg:text-xl font-semibold text-foreground">
                  Restore into this branch
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Destructive
                </span>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                Replaces ALL data in the current branch with an uploaded backup
              </p>
            </div>
          </div>

          {/* Warning banner */}
          <div className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-foreground/80 leading-relaxed">
              All data in <strong className="text-foreground">{currentBranch?.name}</strong> will be
              deleted and replaced. A safety backup is taken automatically before any change.
            </div>
          </div>

          {/* File dropzone */}
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isImporting) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !isImporting && fileInputRef.current?.click()}
              className={cn(
                "relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 group",
                "flex flex-col items-center justify-center text-center px-6 py-10",
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border/70 bg-muted/20 hover:border-primary/50 hover:bg-primary/5",
                isImporting && "pointer-events-none opacity-60"
              )}
              role="button"
              tabIndex={0}
            >
              <div className="relative mb-3">
                <div
                  className={cn(
                    "absolute inset-0 rounded-2xl blur-md transition-colors",
                    isDragging ? "bg-primary/30" : "bg-primary/10 group-hover:bg-primary/20"
                  )}
                />
                <div
                  className={cn(
                    "relative flex items-center justify-center w-14 h-14 rounded-2xl transition-all",
                    isDragging
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-card border border-border/60 text-primary group-hover:scale-105"
                  )}
                >
                  <UploadCloud className="w-6 h-6" />
                </div>
              </div>
              <div className="text-sm font-semibold text-foreground">
                {isDragging ? "Drop your backup file here" : "Drag & drop your backup .zip"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                or <span className="text-primary font-medium underline-offset-2 group-hover:underline">browse files</span>{" "}
                from your computer
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border/60 text-[10px] font-medium text-muted-foreground">
                <FileArchive className="w-3 h-3" />
                .zip files only
              </div>
              <Input
                ref={fileInputRef}
                id="backup-file"
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileChange}
                disabled={isImporting}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden animate-fade-in">
              {/* File header row */}
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
                  <FileArchive className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{formatBytes(file.size)}</span>
                    {preview && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="w-3 h-3" />
                          Validated
                        </span>
                      </>
                    )}
                    {previewError && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="w-3 h-3" />
                          Invalid
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={reset}
                  disabled={isImporting}
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {previewError && (
                <div className="px-3.5 pb-3.5">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                    {previewError}
                  </div>
                </div>
              )}

              {preview && (
                <div className="border-t border-border/60 bg-muted/20 p-3.5 space-y-3">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-card border border-border/40 p-2.5 flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</div>
                        <div className="text-xs font-semibold text-foreground truncate">
                          {preview.metadata.branch_name}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-card border border-border/40 p-2.5 flex items-center gap-2">
                      <CalendarClock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Exported</div>
                        <div className="text-xs font-semibold text-foreground truncate">
                          {new Date(preview.metadata.exported_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-card border border-border/40 p-2.5 flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows</div>
                        <div className="text-xs font-semibold text-foreground">
                          {preview.totalRows.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-card border border-border/40 p-2.5 flex items-center gap-2">
                      <Files className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Files</div>
                        <div className="text-xs font-semibold text-foreground">
                          {preview.fileCount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
                        versionOk
                          ? "bg-success/10 text-success border-success/30"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                      )}
                    >
                      {versionOk ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                      v{preview.metadata.version} {versionOk ? "compatible" : "unsupported"}
                    </span>
                    {isCrossTenant && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/30">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Cross-tenant
                      </span>
                    )}
                  </div>

                  {/* Per-table counts */}
                  <button
                    type="button"
                    onClick={() => setShowCounts((s) => !s)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showCounts && "rotate-180")} />
                    Per-table record counts
                  </button>
                  {showCounts && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs animate-fade-in pl-5">
                      {Object.entries(preview.recordCounts)
                        .filter(([, n]) => n > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([t, n]) => (
                          <div key={t} className="flex justify-between">
                            <span className="text-muted-foreground truncate">{t}</span>
                            <span className="font-medium text-foreground">{n.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {isCrossTenant && (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-foreground/80 leading-relaxed">
                      This backup is from a different organization. IDs will be regenerated and foreign
                      references rewritten. Staff accounts will only be re-linked when a phone number
                      matches an existing staff in your organization.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {preview && versionOk && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4 animate-fade-in">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm-delete"
                  checked={confirmDelete}
                  onCheckedChange={(c) => setConfirmDelete(c === true)}
                  disabled={isImporting}
                  className="mt-0.5"
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
                    className="mt-0.5"
                  />
                  <Label htmlFor="confirm-cross-tenant" className="text-xs leading-snug cursor-pointer">
                    I'm intentionally restoring data from a different organization.
                  </Label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="confirm-text" className="text-xs">
                  Type <strong className="text-destructive">DELETE</strong> to confirm
                </Label>
                <Input
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isImporting}
                  className={cn(
                    "font-mono transition-colors",
                    confirmText === "DELETE" && "border-destructive/50 focus-visible:ring-destructive/30"
                  )}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="lg"
              onClick={handleImport}
              disabled={!canImport || isImporting}
              className="gap-2 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
            >
              {isImporting ? <ButtonSpinner /> : <Upload className="w-4 h-4" />}
              {isImporting ? "Restoring…" : "Restore from backup"}
            </Button>
            {(file || preview || errorLog) && (
              <Button variant="outline" size="lg" onClick={reset} disabled={isImporting} className="gap-2">
                <X className="w-4 h-4" />
                Reset
              </Button>
            )}
            {errorLog && (
              <Button variant="outline" size="lg" onClick={downloadErrorLog} className="gap-2">
                <FileDown className="w-4 h-4" />
                Download error log
              </Button>
            )}
          </div>

          {lastResult?.pre_backup_url && (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-3 animate-fade-in">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-success/15 text-success shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-foreground">
                  Pre-restore safety backup created
                </div>
                <div className="text-[10px] text-muted-foreground">Valid for 7 days</div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
                <a href={lastResult.pre_backup_url} target="_blank" rel="noopener noreferrer">
                  <FileDown className="w-3.5 h-3.5" />
                  Download
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
