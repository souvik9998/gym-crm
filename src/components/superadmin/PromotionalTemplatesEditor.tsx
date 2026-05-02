import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MegaphoneIcon } from "@heroicons/react/24/outline";

export interface PromoVariable {
  key: string;
  description?: string;
}

// The Super Admin configures the Zavu template ID (used to actually send the
// message via Zavu) PLUS a friendly name and a preview body. The name and
// preview body are shown to the gym admin so they can recognise which
// promotional message they are sending — the Zavu template ID is never shown
// outside Super Admin.
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
  name: "",
  previewBody: "",
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

  const updateSlot = useCallback(
    (slotNum: number, patch: Partial<PromoTemplateSlot>) => {
      setSlots((prev) =>
        prev.map((s) => (s.slot === slotNum ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  const handleSave = async () => {
    const prepared: PromoTemplateSlot[] = slots.map((s) => {
      const tplId = (s.templateId ?? "").trim();
      const name = (s.name ?? "").trim();
      const body = (s.previewBody ?? "").trim();
      return {
        slot: s.slot,
        templateId: tplId,
        // A slot is "available to admin" when it has a Zavu template ID configured.
        enabled: tplId.length > 0,
        name: name || `Promo ${s.slot}`,
        previewBody: body,
        description: s.description ?? "",
        variables: Array.isArray(s.variables) ? s.variables : [],
      };
    });
    await onSave(prepared);
    lastSyncedRef.current = JSON.stringify(normalize(prepared));
    setSlots(normalize(prepared));
    toast.success("Promotional templates saved");
  };

  const filledCount = slots.filter((s) => (s.templateId ?? "").trim().length > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="w-5 h-5" /> Promotional Templates
        </CardTitle>
        <CardDescription>
          Configure up to 4 promotional templates for this gym. The <b>Zavu Template ID</b>
          is used in the background to actually send the message and is never shown to
          the gym admin. The <b>Name</b> and <b>Preview Body</b> are shown to the admin
          so they can recognise which message they are sending.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {filledCount} of 4 slots configured.
        </div>

        {slots.map((s) => {
          const filled = (s.templateId ?? "").trim().length > 0;
          return (
            <div
              key={s.slot}
              className={`p-4 rounded-lg border transition-colors ${
                filled ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Slot {s.slot}</Badge>
                  {filled ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                      Available to admin
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">Empty slot</span>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Template Name (shown to admin)</Label>
                  <Input
                    value={s.name ?? ""}
                    onChange={(e) => updateSlot(s.slot, { name: e.target.value })}
                    placeholder={`e.g. Diwali Offer, New Year Promo, Summer Discount`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Preview Body (shown to admin)</Label>
                  <Textarea
                    value={s.previewBody ?? ""}
                    onChange={(e) => updateSlot(s.slot, { previewBody: e.target.value })}
                    placeholder="Type the exact message preview the admin should see before sending. Use {{1}}, {{2}}… or words like {name}, {branch_name} as placeholders."
                    rows={4}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This is for showcase only — Zavu uses its own approved body for the
                    actual message. Keep this preview close to the approved content.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Approved Zavu Template ID (hidden from admin)</Label>
                  <Input
                    value={s.templateId}
                    onChange={(e) => updateSlot(s.slot, { templateId: e.target.value })}
                    placeholder="e.g. ks76tt87z42sgmmmdjgx6n7jch85yzp4"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required to send. Leave blank to disable this slot.
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Promotional Templates"}
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
        name: t.name ?? "",
        description: t.description ?? "",
        previewBody: t.previewBody ?? "",
        variables: Array.isArray(t.variables) ? t.variables : [],
      });
    }
  }
  return SLOT_NUMBERS.map((n) => bySlot.get(n) ?? blankSlot(n));
}
