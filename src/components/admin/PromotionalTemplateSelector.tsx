import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { toast } from "@/components/ui/sonner";
import { useBranch } from "@/contexts/BranchContext";
import { MegaphoneIcon, EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";
import { getPromoDisplayValue, getPromoTemplateName, getPromoVariableLabel, getResolvedPromoVariables } from "@/utils/promotionalTemplates";

interface PromoVariable {
  key: string;
  description?: string;
  defaultValue?: string;
}
interface PromoSlot {
  slot: number;
  enabled: boolean;
  name: string;
  templateId: string;
  description: string;
  previewBody: string;
  variables: PromoVariable[];
}

const SUPPORT_EMAIL = "hello@gymkloud.in";
const SUPPORT_PHONE = "+91 70010 90471";

// localStorage key for the admin's per-branch + per-slot variable overrides.
const overrideStorageKey = (branchId: string, slot: number) =>
  `promo_var_overrides_${branchId}_${slot}`;

// Helper used by MembersTable at send time so the right values flow through.
export function getPromoVariableOverrides(branchId: string, slot: number): Record<string, string> {
  try {
    const raw = localStorage.getItem(overrideStorageKey(branchId, slot));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch (_e) {
    /* noop */
  }
  return {};
}

export const PromotionalTemplateSelector = ({ whatsappEnabled = true }: { whatsappEnabled?: boolean }) => {
  const { currentBranch } = useBranch();
  const [slots, setSlots] = useState<PromoSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [savedSlot, setSavedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // overrides[slot][key] = string value
  const [overrides, setOverrides] = useState<Record<number, Record<string, string>>>({});

  const fetchData = useCallback(async () => {
    if (!currentBranch?.id) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${getEdgeFunctionUrl("tenant-operations")}?action=get-promotional-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ branchId: currentBranch.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load promotional templates");

      const promos = (json?.data?.promotional_templates ?? []) as PromoSlot[];
      const visible = promos
        .filter((p) => p && p.enabled !== false && typeof p.templateId === "string" && p.templateId.trim().length > 0)
        .sort((a, b) => a.slot - b.slot);
      const cur = (json?.data?.active_promotional_slot ?? null) as number | null;
      setActiveSlot(cur);
      setSavedSlot(cur);
      setSlots(visible);

      // Hydrate overrides from localStorage (admin's previously saved edits).
      const hydrated: Record<number, Record<string, string>> = {};
      for (const s of visible) {
        const stored = getPromoVariableOverrides(currentBranch.id, s.slot);
        const merged: Record<string, string> = {};
        for (const v of getResolvedPromoVariables(s)) {
          if (!v?.key) continue;
          merged[v.key] = stored[v.key] ?? v.defaultValue ?? "";
        }
        hydrated[s.slot] = merged;
      }
      setOverrides(hydrated);
    } catch (e) {
      console.warn("[promo-templates] load failed:", e);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [currentBranch?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateOverride = useCallback((slot: number, key: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] ?? {}), [key]: value },
    }));
  }, []);

  const handleSave = async () => {
    if (!currentBranch?.id) return;
    setSaving(true);

    // Persist variable overrides for ALL configured slots (not just active),
    // so admin's edits survive even if they switch active slot later.
    try {
      for (const s of slots) {
        const values = overrides[s.slot] ?? {};
        // Only persist keys actually defined on the template.
        const filtered: Record<string, string> = {};
        for (const v of s.variables ?? []) {
          if (!v?.key) continue;
          filtered[v.key] = values[v.key] ?? v.defaultValue ?? "";
        }
        localStorage.setItem(overrideStorageKey(currentBranch.id, s.slot), JSON.stringify(filtered));
      }
    } catch (_e) {
      /* localStorage may be unavailable; ignore */
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${getEdgeFunctionUrl("tenant-operations")}?action=set-active-promotional-slot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ branchId: currentBranch.id, activeSlot }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json?.error || "Failed to update active promotional template");
      setSaving(false);
      return;
    }
    setSavedSlot(activeSlot);
    const chosen = slots.find((s) => s.slot === activeSlot);
        const label = chosen ? getPromoTemplateName(chosen) : (activeSlot ? `Promo ${activeSlot}` : "");
    toast.success(activeSlot ? `Active promotional template set to "${label}"` : "Active promotional template cleared");
    setSaving(false);
  };

  const empty = !loading && slots.length === 0;
  const dirty = useMemo(() => {
    if (activeSlot !== savedSlot) return true;
    // We don't compare overrides vs storage here; saving always re-persists them,
    // and they're always saved alongside the active-slot save.
    return false;
  }, [activeSlot, savedSlot]);

  return (
    <>
      <Card className={!whatsappEnabled ? "opacity-60" : ""}>
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <MegaphoneIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            Promotional Template
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            Pick which promotional template to use, and customise the values that appear in
            the message. Default values are set by GymKloud — change them to match your offer.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0 space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : empty ? (
            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 text-center space-y-3">
              <p className="text-sm font-medium">No promotional templates configured yet</p>
              <p className="text-xs text-muted-foreground">
                Promotional templates need to be set up by GymKloud for your gym.
              </p>
              <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                Contact GymKloud to set up
              </Button>
            </div>
          ) : (
            <>
              <RadioGroup
                value={activeSlot ? String(activeSlot) : ""}
                onValueChange={(v) => setActiveSlot(Number(v))}
                disabled={!whatsappEnabled || saving}
                className="space-y-2"
              >
                {slots.map((s) => {
                  const isSelected = activeSlot === s.slot;
                  const slotVars = s.variables ?? [];
                  return (
                    <div
                      key={s.slot}
                      className={`rounded-lg border transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <label
                        htmlFor={`promo-${s.slot}`}
                        className="flex items-start gap-3 p-3 cursor-pointer"
                      >
                        <RadioGroupItem value={String(s.slot)} id={`promo-${s.slot}`} className="mt-0.5" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{(s.name && s.name.trim()) || `Promo ${s.slot}`}</p>
                            {savedSlot === s.slot && (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">Active</Badge>
                            )}
                          </div>
                          {s.previewBody && s.previewBody.trim().length > 0 ? (
                            <p className="text-[11px] lg:text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                              {s.previewBody}
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">
                              No preview available — message body is configured by GymKloud.
                            </p>
                          )}
                        </div>
                      </label>

                      {isSelected && slotVars.length > 0 && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2">
                          <p className="text-[11px] font-medium text-muted-foreground">
                            Message values (you can edit these)
                          </p>
                          <div className="grid gap-2">
                            {slotVars.map((v) => (
                              <div key={v.key} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                <Label
                                  htmlFor={`promo-${s.slot}-${v.key}`}
                                  className="text-[11px] sm:text-xs font-mono text-muted-foreground sm:col-span-1"
                                >
                                  {v.key}
                                </Label>
                                <Input
                                  id={`promo-${s.slot}-${v.key}`}
                                  value={overrides[s.slot]?.[v.key] ?? v.defaultValue ?? ""}
                                  onChange={(e) => updateOverride(s.slot, v.key, e.target.value)}
                                  placeholder={v.defaultValue || `value for ${v.key}`}
                                  disabled={!whatsappEnabled || saving}
                                  className="h-8 text-xs sm:col-span-2"
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Tip: <code>name</code> and <code>branch_name</code> are auto-filled per
                            recipient if left blank.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </RadioGroup>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] lg:text-xs text-muted-foreground">
                  {dirty ? "Unsaved change" : "✓ Saved"}
                </p>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!whatsappEnabled || saving}
                  className="h-8 text-xs"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up promotional templates</DialogTitle>
            <DialogDescription>
              Promotional WhatsApp templates need to be approved by Meta and configured by the GymKloud team. Reach out to us and we'll set them up for your gym.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Set%20up%20promotional%20WhatsApp%20templates`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <EnvelopeIcon className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{SUPPORT_EMAIL}</p>
              </div>
            </a>
            <a
              href={`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <PhoneIcon className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Phone / WhatsApp</p>
                <p className="text-sm font-medium">{SUPPORT_PHONE}</p>
              </div>
            </a>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
