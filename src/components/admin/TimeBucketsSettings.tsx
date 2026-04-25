import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TimePicker12h } from "@/components/ui/time-picker-12h";
import { TimeBucketChips } from "@/components/admin/TimeBucketChips";
import {
  ClockIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import {
  DEFAULT_TIME_BUCKETS,
  buildBucketOptions,
  formatTimeLabel,
  type CustomTimeBucket,
} from "@/components/admin/staff/timeslots/timeSlotUtils";

/** A small curated emoji palette for chip personality. */
const EMOJI_OPTIONS = ["🌅", "☀️", "🌆", "🌙", "⏰", "🔥", "💪", "🏋️", "🥇", "✨", "🌤️", "🌃", "⭐", "🎯", "🧘", "🚴"];

type DraftBucket = CustomTimeBucket & { _isNew?: boolean };

function genId() {
  // Stable client-side id; the persisted format is just a string slug.
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isOvernight(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return e <= s;
}

export const TimeBucketsSettings = () => {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;
  const queryClient = useQueryClient();

  const [drafts, setDrafts] = useState<DraftBucket[]>([]);
  const [previewBucket, setPreviewBucket] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const lastLoadedFor = useRef<string | null>(null);

  // Load existing buckets for the current branch on mount / branch switch.
  useEffect(() => {
    if (!branchId) return;
    if (lastLoadedFor.current === branchId) return;
    lastLoadedFor.current = branchId;

    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("gym_settings")
        .select("time_buckets")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Couldn't load time filters", { description: error.message });
        setDrafts(DEFAULT_TIME_BUCKETS.map((b) => ({ ...b })));
      } else {
        const raw = (data as any)?.time_buckets;
        const next: DraftBucket[] =
          Array.isArray(raw) && raw.length > 0
            ? raw
                .filter(
                  (b: any) =>
                    b &&
                    typeof b.id === "string" &&
                    typeof b.label === "string" &&
                    typeof b.start_time === "string" &&
                    typeof b.end_time === "string",
                )
                .map((b: any, idx: number) => ({
                  id: b.id,
                  label: b.label,
                  emoji: typeof b.emoji === "string" && b.emoji.trim() ? b.emoji : "⏰",
                  start_time: b.start_time,
                  end_time: b.end_time,
                  sort_order: typeof b.sort_order === "number" ? b.sort_order : idx,
                }))
            : DEFAULT_TIME_BUCKETS.map((b) => ({ ...b }));
        setDrafts(next);
      }
      setIsDirty(false);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // Live preview options (always include All + Custom bookends).
  const previewOptions = useMemo(
    () => buildBucketOptions(drafts.map((d, i) => ({ ...d, sort_order: i }))),
    [drafts],
  );

  const updateDraft = (id: string, patch: Partial<CustomTimeBucket>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setIsDirty(true);
  };

  const moveDraft = (id: string, dir: -1 | 1) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((d, i) => ({ ...d, sort_order: i }));
    });
    setIsDirty(true);
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id).map((d, i) => ({ ...d, sort_order: i })));
    setIsDirty(true);
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: genId(),
        label: `Chip ${prev.length + 1}`,
        emoji: EMOJI_OPTIONS[prev.length % EMOJI_OPTIONS.length],
        start_time: "06:00",
        end_time: "10:00",
        sort_order: prev.length,
        _isNew: true,
      },
    ]);
    setIsDirty(true);
  };

  // Per-row validation issues — used for both inline highlights and save-time blocking.
  const issues = useMemo(() => {
    const labelIssues = new Set<string>();
    const rangeIssues = new Set<string>();
    const sameStartEnd = new Set<string>();

    // Detect duplicate labels (case-insensitive, trimmed, ignoring blanks).
    const labelMap = new Map<string, string[]>();
    for (const d of drafts) {
      const key = d.label.trim().toLowerCase();
      if (!key) continue;
      const arr = labelMap.get(key) ?? [];
      arr.push(d.id);
      labelMap.set(key, arr);
    }
    for (const ids of labelMap.values()) {
      if (ids.length > 1) ids.forEach((id) => labelIssues.add(id));
    }

    // Detect exact duplicate time ranges (same start AND same end).
    const rangeMap = new Map<string, string[]>();
    for (const d of drafts) {
      if (!/^\d{2}:\d{2}$/.test(d.start_time) || !/^\d{2}:\d{2}$/.test(d.end_time)) continue;
      const key = `${d.start_time}_${d.end_time}`;
      const arr = rangeMap.get(key) ?? [];
      arr.push(d.id);
      rangeMap.set(key, arr);
    }
    for (const ids of rangeMap.values()) {
      if (ids.length > 1) ids.forEach((id) => rangeIssues.add(id));
    }

    // Start time equal to end time on the same chip is meaningless.
    for (const d of drafts) {
      if (d.start_time && d.end_time && d.start_time === d.end_time) {
        sameStartEnd.add(d.id);
      }
    }

    return { labelIssues, rangeIssues, sameStartEnd };
  }, [drafts]);

  const hasIssues =
    issues.labelIssues.size > 0 ||
    issues.rangeIssues.size > 0 ||
    issues.sameStartEnd.size > 0;

  const validateAll = (): { ok: boolean; message?: string } => {
    if (drafts.length === 0) {
      return { ok: false, message: "Add at least one chip or reset to defaults." };
    }
    for (const d of drafts) {
      if (!d.label.trim()) return { ok: false, message: "Every chip needs a label." };
      if (!/^\d{2}:\d{2}$/.test(d.start_time) || !/^\d{2}:\d{2}$/.test(d.end_time)) {
        return { ok: false, message: `Invalid time on "${d.label}".` };
      }
    }
    if (issues.labelIssues.size > 0) {
      return { ok: false, message: "Two chips share the same name. Names must be unique (case-insensitive)." };
    }
    if (issues.sameStartEnd.size > 0) {
      return { ok: false, message: "Start and end time can't be the same on a chip." };
    }
    if (issues.rangeIssues.size > 0) {
      return { ok: false, message: "Two chips share the exact same time range. Adjust the start or end time." };
    }
    return { ok: true };
  };

  const handleSave = async () => {
    if (!branchId) return;
    const v = validateAll();
    if (!v.ok) {
      toast.error(v.message || "Please fix validation errors");
      return;
    }
    setIsSaving(true);
    try {
      const payload = drafts.map((d, i) => ({
        id: d.id,
        label: d.label.trim(),
        emoji: d.emoji || "⏰",
        start_time: d.start_time,
        end_time: d.end_time,
        sort_order: i,
      }));
      const { error } = await supabase
        .from("gym_settings")
        .update({ time_buckets: payload as any, updated_at: new Date().toISOString() })
        .eq("branch_id", branchId);
      if (error) throw error;

      // Strip _isNew flags after save and refresh dependents
      setDrafts(payload.map((p) => ({ ...p })));
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["time-buckets", branchId] });
      toast.success("Time filters saved", {
        description: "Your custom chips will appear across attendance & slot views.",
      });
    } catch (e: any) {
      toast.error("Couldn't save time filters", { description: e?.message || "Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!branchId) return;
    setIsResetting(true);
    try {
      const { error } = await supabase
        .from("gym_settings")
        .update({ time_buckets: [] as any, updated_at: new Date().toISOString() })
        .eq("branch_id", branchId);
      if (error) throw error;
      setDrafts(DEFAULT_TIME_BUCKETS.map((b) => ({ ...b })));
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["time-buckets", branchId] });
      toast.success("Restored default chips", {
        description: "Morning, Afternoon, Evening, and Night are back.",
      });
    } catch (e: any) {
      toast.error("Couldn't reset", { description: e?.message || "Please try again." });
    } finally {
      setIsResetting(false);
      setResetConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-3 animate-pulse">
            <div className="h-5 w-48 bg-muted rounded" />
            <div className="h-4 w-72 bg-muted rounded" />
            <div className="h-32 w-full bg-muted/60 rounded-lg mt-4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header card with live preview */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ClockIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base lg:text-lg">Time Filter Chips</CardTitle>
                <CardDescription className="mt-1 text-xs lg:text-sm">
                  Define the time-of-day chips members and staff see on attendance, slot members,
                  and history pages. Overnight ranges (e.g. 9 PM – 5 AM) are supported.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-medium">
              Branch-specific
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Live preview</p>
            <TimeBucketChips
              value={previewBucket}
              onChange={setPreviewBucket}
              compact
              options={previewOptions}
            />
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-3 flex flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <div>
            <CardTitle className="text-base lg:text-lg">Your Chips</CardTitle>
            <CardDescription className="mt-1 text-xs lg:text-sm">
              Reorder, rename, or change time windows. Use "Add chip" for as many as you need.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResetConfirm(true)}
              disabled={isResetting || isSaving}
            >
              <ArrowPathIcon className="w-4 h-4 mr-1.5" />
              Reset to defaults
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={addDraft}
              disabled={isSaving}
            >
              <PlusIcon className="w-4 h-4 mr-1.5" />
              Add chip
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0">
          {drafts.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No chips configured. Click "Add chip" to create your first one.
            </div>
          ) : (
            <div className="space-y-2.5">
              {drafts.map((d, idx) => {
                const overnight = isOvernight(d.start_time, d.end_time);
                const dupLabel = issues.labelIssues.has(d.id);
                const dupRange = issues.rangeIssues.has(d.id);
                const sameTimes = issues.sameStartEnd.has(d.id);
                const hasRowIssue = dupLabel || dupRange || sameTimes;
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "rounded-xl border border-border/60 bg-card p-3 lg:p-4 shadow-sm transition-shadow hover:shadow-md",
                      d._isNew && "ring-1 ring-primary/30",
                      hasRowIssue && "border-destructive/60 ring-1 ring-destructive/30",
                    )}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                      {/* Order controls */}
                      <div className="flex lg:flex-col items-center gap-1 self-start lg:self-end lg:pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveDraft(d.id, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                        >
                          <ArrowUpIcon className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveDraft(d.id, 1)}
                          disabled={idx === drafts.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDownIcon className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Emoji picker */}
                      <div className="space-y-1 lg:w-28">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Icon
                        </Label>
                        <EmojiPicker
                          value={d.emoji}
                          onChange={(emoji) => updateDraft(d.id, { emoji })}
                        />
                      </div>

                      {/* Label */}
                      <div className="space-y-1 flex-1 min-w-0">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Label
                        </Label>
                        <Input
                          value={d.label}
                          onChange={(e) => updateDraft(d.id, { label: e.target.value })}
                          placeholder="e.g. Morning, Sunrise…"
                          maxLength={24}
                          className={cn(dupLabel && "border-destructive focus-visible:ring-destructive/30")}
                          aria-invalid={dupLabel || undefined}
                        />
                        {dupLabel && (
                          <p className="text-[11px] text-destructive">
                            This name is already used. Names must be unique.
                          </p>
                        )}
                      </div>

                      {/* Start time */}
                      <div className="space-y-1 lg:w-40">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Start
                        </Label>
                        <TimePicker12h
                          value={d.start_time}
                          onChange={(v) => updateDraft(d.id, { start_time: v })}
                        />
                      </div>

                      {/* End time */}
                      <div className="space-y-1 lg:w-40">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          End
                        </Label>
                        <TimePicker12h
                          value={d.end_time}
                          onChange={(v) => updateDraft(d.id, { end_time: v })}
                        />
                      </div>

                      {/* Delete */}
                      <div className="self-start lg:self-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeDraft(d.id)}
                          aria-label="Remove chip"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Range preview / overnight hint / duplicate range warning */}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="rounded-full bg-muted px-2.5 py-1 font-medium tabular-nums text-muted-foreground">
                        {formatTimeLabel(d.start_time)} – {formatTimeLabel(d.end_time)}
                      </span>
                      {overnight && (
                        <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 font-medium">
                          Wraps past midnight
                        </span>
                      )}
                      {sameTimes && (
                        <span className="rounded-full bg-destructive/10 text-destructive px-2.5 py-1 font-medium">
                          Start and end can't be the same
                        </span>
                      )}
                      {dupRange && (
                        <span className="rounded-full bg-destructive/10 text-destructive px-2.5 py-1 font-medium">
                          Same time range as another chip — change start or end
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-xs text-muted-foreground">
          {hasIssues ? (
            <span className="text-destructive font-medium">
              Fix the highlighted chips before saving
            </span>
          ) : isDirty ? (
            <span className="text-warning font-medium">Unsaved changes</span>
          ) : (
            <>All changes saved</>
          )}
        </p>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving || hasIssues}
          className="min-w-[140px]"
        >
          {isSaving ? (
            <>
              <ButtonSpinner className="mr-2" /> Saving…
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4 mr-1.5" /> Save changes
            </>
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={resetConfirm}
        onOpenChange={setResetConfirm}
        title="Reset time filters?"
        description="This restores Morning, Afternoon, Evening, and Night chips and discards your custom set. This cannot be undone."
        confirmText={isResetting ? "Resetting…" : "Reset to defaults"}
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
};

/** Compact emoji picker — popover with a curated grid. */
const EmojiPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-9 w-full rounded-lg border border-input bg-background flex items-center justify-center gap-1.5",
          "hover:border-foreground/30 transition-colors text-base",
          open && "border-foreground/40 ring-2 ring-foreground/10",
        )}
      >
        <span className="text-lg leading-none">{value || "⏰"}</span>
        <span className="text-[10px] text-muted-foreground">Pick</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-[220px] rounded-lg border border-border bg-popover shadow-xl p-2 grid grid-cols-6 gap-1 animate-in fade-in-0 zoom-in-95 duration-150">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onChange(e);
                setOpen(false);
              }}
              className={cn(
                "h-8 w-8 rounded-md flex items-center justify-center text-base transition-colors",
                "hover:bg-accent",
                value === e && "bg-primary/10 ring-1 ring-primary/40",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
