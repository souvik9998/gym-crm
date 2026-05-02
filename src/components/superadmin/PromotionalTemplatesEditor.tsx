import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MegaphoneIcon } from "@heroicons/react/24/outline";
import { Plus, Trash2 } from "lucide-react";

export interface PromoVariable {
  key: string;
  description?: string;
  // Default value the gym admin will see pre-filled. Admin can override
  // before sending; Super Admin's default is used as fallback.
  defaultValue?: string;
}

// The Super Admin configures the Zavu template ID (used to actually send the
// message via Zavu) PLUS a friendly name, a preview body and the variable
// list with default values. Name + preview body + default variables are
// shown to the gym admin so they can recognise / customise the message.
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
  variables: [],
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

  const updateVariable = useCallback(
    (slotNum: number, idx: number, patch: Partial<PromoVariable>) => {
      setSlots((prev) =>
        prev.map((s) => {
          if (s.slot !== slotNum) return s;
          const vars = [...(s.variables ?? [])];
          vars[idx] = { ...vars[idx], ...patch };
          return { ...s, variables: vars };
        }),
      );
    },
    [],
  );

  const addVariable = useCallback((slotNum: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slot === slotNum
          ? {
              ...s,
              variables: [...(s.variables ?? []), { key: "", defaultValue: "", description: "" }],
            }
          : s,
      ),
    );
  }, []);

  const removeVariable = useCallback((slotNum: number, idx: number) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot !== slotNum) return s;
        const vars = [...(s.variables ?? [])];
        vars.splice(idx, 1);
        return { ...s, variables: vars };
      }),
    );
  }, []);

  const handleSave = async () => {
    const prepared: PromoTemplateSlot[] = slots.map((s) => {
      const tplId = (s.templateId ?? "").trim();
      const name = (s.name ?? "").trim();
      const body = (s.previewBody ?? "").trim();
      const cleanedVars = (s.variables ?? [])
        .map((v) => ({
          key: (v.key ?? "").trim(),
          defaultValue: (v.defaultValue ?? "").trim(),
          description: (v.description ?? "").trim(),
        }))
        .filter((v) => v.key.length > 0);
      return {
        slot: s.slot,
        templateId: tplId,
        enabled: tplId.length > 0,
        name: name || `Promo ${s.slot}`,
        previewBody: body,
        description: s.description ?? "",
        variables: cleanedVars,
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
          Configure up to 4 promotional templates. The <b>Zavu Template ID</b> is used in
          the background and is never shown to the gym admin. The <b>Name</b>,{" "}
          <b>Preview Body</b> and <b>Variables</b> (with default values) are shown to
          the admin — they can override variable values before sending.
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
                    placeholder="e.g. Diwali Offer, New Year Promo, Summer Discount"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Preview Body (shown to admin)</Label>
                  <Textarea
                    value={s.previewBody ?? ""}
                    onChange={(e) => updateSlot(s.slot, { previewBody: e.target.value })}
                    placeholder="Type the exact message preview the admin should see before sending. Reference variables like {{name}}, {{offer}}, {{url}}."
                    rows={4}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Showcase only — Zavu uses its own approved body for the actual send.
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

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Variables &amp; Default Values</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addVariable(s.slot)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add variable
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    List variables in the same order as <code>{"{{1}}, {{2}}…"}</code> in
                    the Zavu template. Default values are used unless the admin overrides
                    them before sending. Common keys: <code>name</code>, <code>branch_name</code>,
                    <code>offer</code>, <code>url</code>.
                  </p>
                  {(s.variables ?? []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      No variables yet. Add one for each <code>{"{{n}}"}</code> in the Zavu template.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(s.variables ?? []).map((v, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-12 gap-2 items-start p-2 rounded-md bg-background border border-border/50"
                        >
                          <div className="col-span-1 flex items-center justify-center pt-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {`{{${idx + 1}}}`}
                            </Badge>
                          </div>
                          <div className="col-span-4">
                            <Input
                              value={v.key}
                              onChange={(e) => updateVariable(s.slot, idx, { key: e.target.value })}
                              placeholder="key (e.g. offer)"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          <div className="col-span-6">
                            <Input
                              value={v.defaultValue ?? ""}
                              onChange={(e) =>
                                updateVariable(s.slot, idx, { defaultValue: e.target.value })
                              }
                              placeholder="default value (admin can override)"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeVariable(s.slot, idx)}
                              aria-label="Remove variable"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
      const vars: PromoVariable[] = Array.isArray(t.variables)
        ? t.variables.map((v) => ({
            key: typeof v?.key === "string" ? v.key : "",
            defaultValue: typeof (v as PromoVariable)?.defaultValue === "string"
              ? (v as PromoVariable).defaultValue
              : "",
            description: typeof v?.description === "string" ? v.description : "",
          }))
        : [];
      bySlot.set(t.slot, {
        slot: t.slot,
        templateId: tplId,
        enabled: tplId.length > 0,
        name: t.name ?? "",
        description: t.description ?? "",
        previewBody: t.previewBody ?? "",
        variables: vars,
      });
    }
  }
  return SLOT_NUMBERS.map((n) => bySlot.get(n) ?? blankSlot(n));
}
