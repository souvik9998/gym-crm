import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MegaphoneIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

export interface PromoVariable {
  key: string;
  description?: string;
}

export interface PromoTemplateSlot {
  slot: number;
  enabled: boolean;
  name: string;
  templateId: string;
  description: string;
  previewBody: string;
  variables: PromoVariable[];
}

const SLOT_NUMBERS = [1, 2, 3, 4] as const;

const blankSlot = (slot: number): PromoTemplateSlot => ({
  slot,
  enabled: false,
  name: "",
  templateId: "",
  description: "",
  previewBody: "",
  variables: [],
});

interface Props {
  initial: PromoTemplateSlot[];
  onSave: (templates: PromoTemplateSlot[]) => Promise<void>;
  saving?: boolean;
}

export default function PromotionalTemplatesEditor({ initial, onSave, saving = false }: Props) {
  const [slots, setSlots] = useState<PromoTemplateSlot[]>(() => normalize(initial));
  // Track the last "remote" signature we synced from so we don't blow away
  // local edits every time the parent re-renders with a fresh array reference.
  const lastSyncedRef = useRef<string>(JSON.stringify(normalize(initial)));

  useEffect(() => {
    const incoming = normalize(initial);
    const sig = JSON.stringify(incoming);
    if (sig !== lastSyncedRef.current) {
      lastSyncedRef.current = sig;
      setSlots(incoming);
    }
  }, [initial]);

  const update = useCallback((slotNum: number, patch: Partial<PromoTemplateSlot>) => {
    setSlots((prev) => prev.map((s) => (s.slot === slotNum ? { ...s, ...patch } : s)));
  }, []);

  const addVariable = (slotNum: number) => {
    update(slotNum, {
      variables: [
        ...(slots.find((s) => s.slot === slotNum)?.variables ?? []),
        { key: "", description: "" },
      ],
    });
  };

  const removeVariable = (slotNum: number, idx: number) => {
    const cur = slots.find((s) => s.slot === slotNum);
    if (!cur) return;
    update(slotNum, { variables: cur.variables.filter((_, i) => i !== idx) });
  };

  const updateVariable = (slotNum: number, idx: number, patch: Partial<PromoVariable>) => {
    const cur = slots.find((s) => s.slot === slotNum);
    if (!cur) return;
    update(slotNum, {
      variables: cur.variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    });
  };

  const handleSave = async () => {
    // Light validation: enabled slots must have name + templateId
    const invalid = slots.find((s) => s.enabled && (!s.name.trim() || !s.templateId.trim()));
    if (invalid) {
      toast.error(`Promo ${invalid.slot}: Name and Template ID are required when enabled.`);
      return;
    }
    // Variable key uniqueness within a slot
    for (const s of slots) {
      const keys = s.variables.map((v) => v.key.trim()).filter(Boolean);
      if (new Set(keys).size !== keys.length) {
        toast.error(`Promo ${s.slot}: variable keys must be unique.`);
        return;
      }
    }
    await onSave(slots);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="w-5 h-5" /> Promotional Templates (4 slots per gym)
        </CardTitle>
        <CardDescription>
          Configure up to 4 approved Meta/Zavu promotional templates for this gym. The gym admin
          will pick one of these as the active promo from their WhatsApp settings — they cannot
          edit the templates themselves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {slots.map((s) => (
          <div
            key={s.slot}
            className={`p-4 rounded-lg border transition-colors ${
              s.enabled ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-muted/20"
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Slot {s.slot}</Badge>
                <p className="text-sm font-medium">
                  {s.name.trim() || <span className="text-muted-foreground">Promo {s.slot}</span>}
                </p>
                {s.enabled && <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">Available to admin</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${s.slot}`} className="text-xs text-muted-foreground">Enabled</Label>
                <Switch
                  id={`enabled-${s.slot}`}
                  checked={s.enabled}
                  onCheckedChange={(checked) => update(s.slot, { enabled: checked })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={s.name}
                  onChange={(e) => update(s.slot, { name: e.target.value })}
                  placeholder="e.g. Diwali Offer"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Approved Meta/Zavu Template ID</Label>
                <Input
                  value={s.templateId}
                  onChange={(e) => update(s.slot, { templateId: e.target.value })}
                  placeholder="tmpl_xxxxxxxxxxxx"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5 mt-3">
              <Label className="text-xs">Description (shown to admin)</Label>
              <Input
                value={s.description}
                onChange={(e) => update(s.slot, { description: e.target.value })}
                placeholder="When should the admin pick this template?"
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5 mt-3">
              <Label className="text-xs">Preview Body (shown to admin before sending)</Label>
              <Textarea
                value={s.previewBody}
                onChange={(e) => update(s.slot, { previewBody: e.target.value })}
                placeholder={"Example: Hi {{1}}, get 20% off this Diwali at {{2}}!\nUse {{1}}, {{2}} ... in the order of variables below."}
                rows={3}
                className="text-xs font-mono"
              />
            </div>

            <Separator className="my-3" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Template Variables (positional, mapped to {`{{1}}, {{2}}, ...`})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => addVariable(s.slot)}
                  disabled={s.variables.length >= 12}
                >
                  <PlusIcon className="w-3 h-3" /> Add
                </Button>
              </div>
              {s.variables.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  No variables yet. Add the named placeholders your approved template uses (e.g. <code>name</code>, <code>branch_name</code>, <code>offer_amount</code>).
                </p>
              ) : (
                <div className="space-y-2">
                  {s.variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0">{`{{${i + 1}}}`}</Badge>
                      <Input
                        value={v.key}
                        onChange={(e) => updateVariable(s.slot, i, { key: e.target.value })}
                        placeholder="variable_key"
                        className="h-8 text-xs font-mono w-40 shrink-0"
                        maxLength={60}
                      />
                      <Input
                        value={v.description ?? ""}
                        onChange={(e) => updateVariable(s.slot, i, { description: e.target.value })}
                        placeholder="What this variable means (optional)"
                        className="h-8 text-xs"
                        maxLength={200}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeVariable(s.slot, i)}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

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
      bySlot.set(t.slot, {
        slot: t.slot,
        enabled: t.enabled !== false && (!!t.templateId || !!t.name),
        name: t.name ?? "",
        templateId: t.templateId ?? "",
        description: t.description ?? "",
        previewBody: t.previewBody ?? "",
        variables: Array.isArray(t.variables) ? t.variables : [],
      });
    }
  }
  return SLOT_NUMBERS.map((n) => bySlot.get(n) ?? blankSlot(n));
}
