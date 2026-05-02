import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MegaphoneIcon } from "@heroicons/react/24/outline";

export interface PromoVariable {
  key: string;
  description?: string;
}

// Backwards-compatible shape (legacy fields kept so saved data from older versions
// still loads). The editor now only manages `templateId` per slot — the real
// template name, copy and variables live inside Zavu against that template ID.
export interface PromoTemplateSlot {
  slot: number;
  enabled: boolean;
  name?: string;
  templateId: string;
  description?: string;
  previewBody?: string;
  variables?: PromoVariable[];
}

const SLOT_NUMBERS = [1, 2, 3, 4] as const;

const blankSlot = (slot: number): PromoTemplateSlot => ({
  slot,
  enabled: false,
  templateId: "",
});

interface Props {
  initial: PromoTemplateSlot[];
  onSave: (templates: PromoTemplateSlot[]) => Promise<void>;
  saving?: boolean;
}

export default function PromotionalTemplatesEditor({ initial, onSave, saving = false }: Props) {
  const [slots, setSlots] = useState<PromoTemplateSlot[]>(() => normalize(initial));
  const lastSyncedRef = useRef<string>(JSON.stringify(normalize(initial)));

  useEffect(() => {
    const incoming = normalize(initial);
    const sig = JSON.stringify(incoming);
    if (sig !== lastSyncedRef.current) {
      lastSyncedRef.current = sig;
      setSlots(incoming);
    }
  }, [initial]);

  const updateTemplateId = useCallback((slotNum: number, templateId: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slot === slotNum
          ? { ...s, templateId, enabled: templateId.trim().length > 0 }
          : s,
      ),
    );
  }, []);

  const handleSave = async () => {
    // Slots with a template ID become enabled. Empty slots are disabled.
    // We preserve any legacy fields (name/previewBody/variables) so older
    // configurations are not destroyed when re-saving.
    const prepared: PromoTemplateSlot[] = slots.map((s) => ({
      slot: s.slot,
      templateId: s.templateId.trim(),
      enabled: s.templateId.trim().length > 0,
      // Internal label only — never shown to admin/member; helps Super Admin scan the list.
      name: `Promo ${s.slot}`,
      description: s.description ?? "",
      previewBody: s.previewBody ?? "",
      variables: Array.isArray(s.variables) ? s.variables : [],
    }));
    await onSave(prepared);
    lastSyncedRef.current = JSON.stringify(normalize(prepared));
    setSlots(normalize(prepared));
    toast.success("Promotional template IDs saved");
  };

  const filledCount = slots.filter((s) => s.templateId.trim().length > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="w-5 h-5" /> Promotional Templates
        </CardTitle>
        <CardDescription>
          Paste up to 4 approved Zavu promotional template IDs for this gym. The actual
          message body, language and variables are configured inside Zavu against each
          template ID — they are not editable here. The gym admin will simply pick which
          slot to use as the active promo from their WhatsApp settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {filledCount} of 4 slots configured.
        </div>

        {slots.map((s) => {
          const filled = s.templateId.trim().length > 0;
          return (
            <div
              key={s.slot}
              className={`p-4 rounded-lg border transition-colors ${
                filled ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Promo {s.slot}</Badge>
                  {filled ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                      Available to admin
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">Empty slot</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Approved Zavu Template ID</Label>
                <Input
                  value={s.templateId}
                  onChange={(e) => updateTemplateId(s.slot, e.target.value)}
                  placeholder="e.g. ks76tt87z42sgmmmdjgx6n7jch85yzp4"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  The template body, variables and language come from Zavu. We only need
                  the ID here — leave blank to disable this slot.
                </p>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Promotional Template IDs"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function normalize(initial: PromoTemplateSlot[]): PromoTemplateSlot[] {
  const bySlot = new Map<number, PromoTemplateSlot>();
  for (const t of initial ?? []) {
    if (t && Number.isInteger(t.slot) && t.slot >= 1 && t.slot <= 4) {
      const tplId = (t.templateId ?? "").trim();
      bySlot.set(t.slot, {
        slot: t.slot,
        templateId: tplId,
        enabled: tplId.length > 0,
        name: t.name ?? `Promo ${t.slot}`,
        description: t.description ?? "",
        previewBody: t.previewBody ?? "",
        variables: Array.isArray(t.variables) ? t.variables : [],
      });
    }
  }
  return SLOT_NUMBERS.map((n) => bySlot.get(n) ?? blankSlot(n));
}
