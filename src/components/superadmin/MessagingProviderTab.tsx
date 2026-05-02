import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChatBubbleLeftRightIcon, ShieldCheckIcon, BeakerIcon } from "@heroicons/react/24/outline";

// Mirror of supabase/functions/_shared/whatsapp-provider.ts (kept in sync manually).
const MESSAGE_CATEGORIES: Array<{ key: string; label: string; description: string; group: string; vars: string[] }> = [
  { key: "new_registration",    group: "Member Lifecycle", label: "New Registration",   description: "Welcome message after a new member joins.",      vars: ["name", "expiry_date", "branch_name"] },
  { key: "renewal",             group: "Member Lifecycle", label: "Membership Renewal", description: "Confirmation after a renewal payment.",          vars: ["name", "expiry_date", "branch_name"] },
  { key: "daily_pass",          group: "Member Lifecycle", label: "Daily Pass",          description: "Daily-pass purchase confirmation.",              vars: ["name", "expiry_date", "branch_name"] },
  { key: "pt_extension",        group: "Member Lifecycle", label: "PT Extension",        description: "Personal-training extension confirmation.",       vars: ["name", "expiry_date", "branch_name"] },
  { key: "admin_add_member",    group: "Member Lifecycle", label: "Admin Added Member",  description: "Sent when an admin adds a member manually.",     vars: ["name", "expiry_date", "branch_name"] },
  { key: "expiring_2days",      group: "Reminders",        label: "Expiring Soon",       description: "Reminder N days before membership expires.",      vars: ["name", "expiry_date", "branch_name"] },
  { key: "expiring_today",      group: "Reminders",        label: "Expiring Today",      description: "Reminder on the day membership expires.",         vars: ["name", "expiry_date", "branch_name"] },
  { key: "expired_reminder",    group: "Reminders",        label: "Expired Reminder",    description: "Follow-up after membership expired.",             vars: ["name", "days_expired", "branch_name"] },
  { key: "payment_details",     group: "Operational",      label: "Payment Receipt",     description: "Receipt after a successful payment.",            vars: ["name", "amount", "payment_date", "payment_mode", "expiry_date", "branch_name"] },
  { key: "invoice_link",        group: "Operational",      label: "Invoice Link",        description: "Branded invoice link share.",                    vars: ["name", "invoice_number", "invoice_url", "branch_name"] },
  { key: "event_confirmation",  group: "Operational",      label: "Event Confirmation",  description: "Sent after event registration.",                 vars: ["name", "event_title", "event_date", "branch_name"] },
  { key: "check_in",            group: "Operational",      label: "Check-in",            description: "Check-in confirmation (if enabled).",            vars: ["name", "check_in_time", "branch_name"] },
  { key: "promotional",         group: "Manual / Admin",   label: "Promotional",         description: "Promotional broadcast (manual only).",            vars: ["name", "branch_name"] },
  { key: "staff_credentials",   group: "Manual / Admin",   label: "Staff Credentials",   description: "Login credentials sent to new staff.",           vars: ["name", "phone", "password", "role", "branches", "branch_name"] },
  { key: "password_reset",      group: "Manual / Admin",   label: "Password Reset",      description: "Password-reset link.",                            vars: ["name", "reset_link", "branch_name"] },
  { key: "daily_summary_admin", group: "Manual / Admin",   label: "Daily Admin Summary", description: "Daily owner/admin summary message.",             vars: ["summary_text"] },
  { key: "holiday_notification",group: "Manual / Admin",   label: "Holiday Notification",description: "Sent to members when a gym holiday / closure is announced from the Calendar.", vars: ["branch_name", "date", "closed_status"] },
];

interface MessagingConfig {
  active_provider: "periskope" | "zavu" | "none";
  periskope: { connected: boolean; phone: string | null; verified_at: string | null };
  zavu: { connected: boolean; sender_id: string | null; verified_at: string | null };
  zavu_templates: Record<string, string>;
}

interface Props { tenantId: string; }

export default function MessagingProviderTab({ tenantId }: Props) {
  const [config, setConfig] = useState<MessagingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periskopeKey, setPeriskopeKey] = useState("");
  const [periskopePhone, setPeriskopePhone] = useState("");
  const [zavuKey, setZavuKey] = useState("");
  const [zavuSenderId, setZavuSenderId] = useState("");
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  const callAction = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${getEdgeFunctionUrl("tenant-operations")}?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ tenantId, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      return json.data;
    },
    [tenantId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await callAction("get-messaging-config", {})) as MessagingConfig;
      setConfig(data);
      setPeriskopePhone(data.periskope.phone ?? "");
      setZavuSenderId(data.zavu.sender_id ?? "");
      setTemplates(data.zavu_templates ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callAction]);

  useEffect(() => { refresh(); }, [refresh]);

  const setProvider = async (p: "periskope" | "zavu" | "none") => {
    setSaving(true);
    try {
      await callAction("save-messaging-config", { active_provider: p });
      toast.success(`Active provider set to ${p}`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const savePeriskope = async () => {
    if (!periskopeKey.trim() && !periskopePhone.trim()) {
      toast.error("Enter API key or phone");
      return;
    }
    setSaving(true);
    try {
      await callAction("save-messaging-config", {
        periskope: {
          ...(periskopeKey.trim() ? { apiKey: periskopeKey.trim() } : {}),
          phone: periskopePhone.trim(),
        },
      });
      toast.success("Periskope credentials saved & verified");
      setPeriskopeKey("");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const saveZavu = async () => {
    if (!zavuKey.trim() && zavuSenderId === (config?.zavu.sender_id ?? "")) {
      toast.error("Enter API key or update sender ID");
      return;
    }
    setSaving(true);
    try {
      await callAction("save-messaging-config", {
        zavu: {
          ...(zavuKey.trim() ? { apiKey: zavuKey.trim() } : {}),
          senderId: zavuSenderId.trim(),
        },
      });
      toast.success("Zavu credentials saved & verified");
      setZavuKey("");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const removeProvider = async (p: "periskope" | "zavu") => {
    setSaving(true);
    try {
      await callAction("remove-messaging-credentials", { provider: p });
      toast.success(`${p} credentials removed`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const saveTemplates = async () => {
    setSaving(true);
    try {
      await callAction("save-messaging-config", { zavu_templates: templates });
      toast.success("Zavu template IDs saved");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const testSend = async () => {
    if (!testPhone.trim()) { toast.error("Enter a test phone number (with country code)"); return; }
    setTesting(true);
    try {
      const result = await callAction("test-messaging", {
        toPhone: testPhone.trim(),
        category: "promotional",
      });
      if (result?.success) toast.success(`Test sent via ${result.provider}`);
      else toast.error(result?.error || "Test send failed");
    } catch (e) { toast.error((e as Error).message); }
    finally { setTesting(false); }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-6 w-48 bg-muted rounded" /><div className="h-32 bg-muted rounded" /></div></CardContent></Card>
    );
  }

  const grouped = MESSAGE_CATEGORIES.reduce<Record<string, typeof MESSAGE_CATEGORIES>>((acc, c) => {
    (acc[c.group] ||= []).push(c); return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Active provider */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-5 h-5" /> Active WhatsApp Provider
          </CardTitle>
          <CardDescription>
            Choose which service GymKloud uses to deliver every WhatsApp message for this gym. The selection takes effect immediately for all messages — registrations, renewals, reminders, receipts, etc. WhatsApp usage is counted against the gym's monthly quota regardless of provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={config?.active_provider ?? "periskope"}
            onValueChange={(v) => setProvider(v as "periskope" | "zavu" | "none")}
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            {[
              { v: "periskope", label: "Periskope", desc: "Free-text WhatsApp via Periskope (default)." },
              { v: "zavu", label: "Zavu", desc: "Template-based delivery via Zavu." },
              { v: "none", label: "Disabled", desc: "Block all WhatsApp messages for this gym." },
            ].map(({ v, label, desc }) => (
              <label key={v} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${config?.active_provider === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                <RadioGroupItem value={v} id={`prov-${v}`} className="mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {label}
                    {config?.active_provider === v && <Badge className="bg-emerald-600 hover:bg-emerald-700">Active</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Periskope creds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheckIcon className="w-5 h-5" /> Periskope Credentials</CardTitle>
          <CardDescription>API key and sending phone number for Periskope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span>Status:</span>
            {config?.periskope.connected
              ? <Badge className="bg-emerald-600 hover:bg-emerald-700">Connected</Badge>
              : <Badge variant="secondary">Not Connected</Badge>}
            {config?.periskope.verified_at && (
              <span className="text-xs text-muted-foreground">Verified {format(new Date(config.periskope.verified_at), "MMM d, yyyy")}</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Key {config?.periskope.connected && <span className="text-xs text-muted-foreground">(leave empty to keep current)</span>}</Label>
              <Input type="password" value={periskopeKey} onChange={(e) => setPeriskopeKey(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label>Sending Phone (E.164)</Label>
              <Input value={periskopePhone} onChange={(e) => setPeriskopePhone(e.target.value)} placeholder="+919876543210" />
            </div>
          </div>
          <div className="flex justify-between">
            {config?.periskope.connected
              ? <Button variant="destructive" size="sm" onClick={() => removeProvider("periskope")} disabled={saving}>Disconnect</Button>
              : <span />}
            <Button onClick={savePeriskope} disabled={saving}>{saving ? "Saving..." : "Verify & Save"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Zavu creds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheckIcon className="w-5 h-5" /> Zavu Credentials</CardTitle>
          <CardDescription>Live API key from <code className="bg-muted px-1 rounded">dashboard.zavu.dev</code> (starts with <code className="bg-muted px-1 rounded">zv_live_</code>). Sender ID is optional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span>Status:</span>
            {config?.zavu.connected
              ? <Badge className="bg-emerald-600 hover:bg-emerald-700">Connected</Badge>
              : <Badge variant="secondary">Not Connected</Badge>}
            {config?.zavu.verified_at && (
              <span className="text-xs text-muted-foreground">Verified {format(new Date(config.zavu.verified_at), "MMM d, yyyy")}</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Key {config?.zavu.connected && <span className="text-xs text-muted-foreground">(leave empty to keep current)</span>}</Label>
              <Input type="password" value={zavuKey} onChange={(e) => setZavuKey(e.target.value)} placeholder="zv_live_xxxxxxxxxxxx" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label>Sender ID (optional)</Label>
              <Input value={zavuSenderId} onChange={(e) => setZavuSenderId(e.target.value)} placeholder="sender_12345" />
            </div>
          </div>
          <div className="flex justify-between">
            {config?.zavu.connected
              ? <Button variant="destructive" size="sm" onClick={() => removeProvider("zavu")} disabled={saving}>Disconnect</Button>
              : <span />}
            <Button onClick={saveZavu} disabled={saving}>{saving ? "Saving..." : "Verify & Save"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Zavu template mapping — only when Zavu is active */}
      {config?.active_provider === "zavu" && (
        <Card>
          <CardHeader>
            <CardTitle>Zavu Template IDs</CardTitle>
            <CardDescription>
              Provide an approved Zavu template ID (<code className="bg-muted px-1 rounded">tmpl_xxx</code>) for every category GymKloud sends. Variables for each category must match the listed positional order — they are passed as <code>{"{{1}}, {{2}}, ..."}</code> in your template body.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</p>
                <div className="space-y-3">
                  {items.map((c) => (
                    <div key={c.key} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-border">
                      <div>
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Variables: {c.vars.map((v, i) => <code key={v} className="bg-muted px-1 rounded mr-1">{`{{${i + 1}}}`}={v}</code>)}
                        </p>
                      </div>
                      <Input
                        value={templates[c.key] ?? ""}
                        onChange={(e) => setTemplates((prev) => ({ ...prev, [c.key]: e.target.value }))}
                        placeholder="tmpl_xxxxxxxxxxxx"
                        className="self-start"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-end">
              <Button onClick={saveTemplates} disabled={saving}>{saving ? "Saving..." : "Save All Templates"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test send */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BeakerIcon className="w-5 h-5" /> Send Test Message</CardTitle>
          <CardDescription>Sends a test message via the currently active provider using the <code className="bg-muted px-1 rounded">promotional</code> category.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="space-y-2 flex-1">
            <Label>Recipient Phone</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+919876543210" />
          </div>
          <Button onClick={testSend} disabled={testing}>{testing ? "Sending..." : "Send Test"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
