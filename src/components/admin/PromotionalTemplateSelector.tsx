import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { toast } from "@/components/ui/sonner";
import { useBranch } from "@/contexts/BranchContext";
import { MegaphoneIcon, EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";

interface PromoVariable { key: string; description?: string }
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

export const PromotionalTemplateSelector = ({ whatsappEnabled = true }: { whatsappEnabled?: boolean }) => {
  const { currentBranch } = useBranch();
  const [slots, setSlots] = useState<PromoSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [savedSlot, setSavedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

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
    } catch (e) {
      console.warn("[promo-templates] load failed:", e);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [currentBranch?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!currentBranch?.id) return;
    setSaving(true);
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
    toast.success(activeSlot ? `Active promotional template set to "Promo ${activeSlot}"` : "Active promotional template cleared");
    setSaving(false);
  };

  const empty = !loading && slots.length === 0;

  return (
    <>
      <Card className={!whatsappEnabled ? "opacity-60" : ""}>
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
            <MegaphoneIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            Promotional Template
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            Pick which approved promotional template to use when sending promo messages to members. Templates are configured by GymKloud for your gym.
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
                {slots.map((s) => (
                  <label
                    key={s.slot}
                    htmlFor={`promo-${s.slot}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      activeSlot === s.slot ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <RadioGroupItem value={String(s.slot)} id={`promo-${s.slot}`} className="mt-0.5" />
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{`Promo ${s.slot}`}</p>
                        {savedSlot === s.slot && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">Active</Badge>
                        )}
                      </div>
                      <p className="text-[10px] lg:text-[11px] text-muted-foreground font-mono truncate">
                        ID: {s.templateId}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] lg:text-xs text-muted-foreground">
                  {activeSlot === savedSlot ? "✓ Saved" : "Unsaved change"}
                </p>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!whatsappEnabled || saving || activeSlot === savedSlot}
                  className="h-8 text-xs"
                >
                  {saving ? "Saving..." : "Save selection"}
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
