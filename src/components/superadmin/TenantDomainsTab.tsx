/**
 * TenantDomainsTab — Super Admin UI for managing a tenant's
 * custom branded domains.
 *
 * Lets the platform owner:
 *  - Add a domain (e.g. "5threalm.in") for any tenant
 *  - Optionally bind it to a specific branch
 *  - View the verification token + DNS instructions
 *  - Trigger a verification check (calls verify-tenant-domain edge fn)
 *  - Toggle the primary domain (one per tenant)
 *  - Delete a domain
 *  - Copy the public registration link
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { format } from "date-fns";
// (uses supabase.functions.invoke directly — no helper needed)

interface Branch {
  id: string;
  name: string;
  is_default: boolean;
}

interface TenantDomain {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  hostname: string;
  is_primary: boolean;
  is_verified: boolean;
  verification_token: string;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
}

interface VerifyResponse {
  verified: boolean;
  hostname: string;
  expected_token: string;
  dns: {
    a_records: string[] | null;
    a_matches: boolean;
    txt_records: string[] | null;
    txt_matches: boolean;
  };
  errors: string[];
}

const LOVABLE_HOSTING_IP = "185.158.133.1";

function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

const HOSTNAME_REGEX = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

interface Props {
  tenantId: string;
  branches: Branch[];
}

export default function TenantDomainsTab({ tenantId, branches }: Props) {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [newBranchId, setNewBranchId] = useState<string>("__all__");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResponse>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const branchMap = useMemo(() => {
    const m = new Map<string, Branch>();
    branches.forEach((b) => m.set(b.id, b));
    return m;
  }, [branches]);

  const loadDomains = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_domains")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load domains");
    } else {
      setDomains((data || []) as TenantDomain[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tenantId) loadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleAdd = async () => {
    const host = normalizeHostname(newHost);
    if (!host || !HOSTNAME_REGEX.test(host)) {
      toast.error("Please enter a valid domain like example.com");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tenant_domains").insert({
      tenant_id: tenantId,
      hostname: host,
      branch_id: newBranchId === "__all__" ? null : newBranchId,
      notes: newNotes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That domain is already in use" : error.message);
      return;
    }
    toast.success("Domain added — share the DNS instructions with the gym owner");
    setNewHost("");
    setNewBranchId("__all__");
    setNewNotes("");
    setAddOpen(false);
    loadDomains();
  };

  const handleSetPrimary = async (domain: TenantDomain, value: boolean) => {
    if (value) {
      // Clear other primaries first (single-primary unique index will reject otherwise)
      const others = domains.filter((d) => d.is_primary && d.id !== domain.id);
      if (others.length > 0) {
        await supabase
          .from("tenant_domains")
          .update({ is_primary: false })
          .in("id", others.map((d) => d.id));
      }
    }
    const { error } = await supabase
      .from("tenant_domains")
      .update({ is_primary: value })
      .eq("id", domain.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(value ? "Marked as primary" : "Removed primary flag");
    loadDomains();
  };

  const handleVerify = async (domain: TenantDomain) => {
    setVerifyingId(domain.id);
    try {
      const { data, error } = await supabase.functions.invoke<VerifyResponse>(
        "verify-tenant-domain",
        { body: { domain_id: domain.id } }
      );
      if (error || !data) throw new Error(error?.message || "Verification request failed");
      setVerifyResults((prev) => ({ ...prev, [domain.id]: data }));
      if (data.verified) {
        toast.success("Domain verified successfully");
        loadDomains();
      } else {
        toast.error(data.errors[0] || "Verification failed — DNS not ready");
      }
    } catch (e: any) {
      toast.error(e?.message || "Verification request failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("tenant_domains").delete().eq("id", deleteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Domain removed");
      loadDomains();
    }
    setDeleteId(null);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GlobeAltIcon className="h-5 w-5" />
              Custom Domains
            </CardTitle>
            <CardDescription>
              Connect the gym's own website (e.g. <code>5threalm.in</code>) so member
              registration runs from their branded domain. Payments will then originate
              from this domain — required by Razorpay/RBI for separate merchant credentials.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Domain
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Loading domains…
            </div>
          ) : domains.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border-2 border-dashed rounded-lg">
              No custom domains configured yet.
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map((d) => {
                const branch = d.branch_id ? branchMap.get(d.branch_id) : null;
                const result = verifyResults[d.id];
                const expanded = expandedId === d.id;
                return (
                  <div
                    key={d.id}
                    className="border rounded-lg p-4 space-y-3 transition-all hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://${d.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono font-semibold hover:underline"
                          >
                            {d.hostname}
                          </a>
                          {d.is_verified ? (
                            <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircleIcon className="h-3 w-3" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300">
                              <XCircleIcon className="h-3 w-3" /> Pending
                            </Badge>
                          )}
                          {d.is_primary && <Badge variant="secondary">Primary</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {branch ? `Branch: ${branch.name}` : "All branches (default)"}
                          {d.verified_at && ` • Verified ${format(new Date(d.verified_at), "MMM d, yyyy")}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={d.is_primary}
                            onCheckedChange={(v) => handleSetPrimary(d, v)}
                            disabled={!d.is_verified}
                          />
                          <span className="text-muted-foreground">Primary</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerify(d)}
                          disabled={verifyingId === d.id}
                        >
                          <ArrowPathIcon
                            className={`h-4 w-4 mr-1 ${verifyingId === d.id ? "animate-spin" : ""}`}
                          />
                          {verifyingId === d.id ? "Checking…" : "Check verification"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyText(`https://${d.hostname}/register`, "Registration link")
                          }
                        >
                          <ClipboardDocumentIcon className="h-4 w-4 mr-1" />
                          Copy link
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(d.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {result && !result.verified && (
                      <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2 space-y-1">
                        {result.errors.map((err, i) => (
                          <div key={i} className="text-amber-900 dark:text-amber-200">• {err}</div>
                        ))}
                        <div className="text-muted-foreground pt-1">
                          A: {result.dns.a_records?.join(", ") || "—"} • TXT:{" "}
                          {result.dns.txt_records?.join(", ") || "—"}
                        </div>
                      </div>
                    )}

                    <Collapsible open={expanded} onOpenChange={(o) => setExpandedId(o ? d.id : null)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between -mx-2">
                          <span className="text-xs text-muted-foreground">
                            DNS setup instructions
                          </span>
                          <ChevronDownIcon
                            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-2">
                        <p className="text-xs text-muted-foreground">
                          Ask the gym owner to add these records at their domain registrar,
                          then add this same domain in <strong>Lovable Project Settings → Domains</strong>{" "}
                          so SSL is provisioned. Click "Check verification" once DNS has propagated.
                        </p>
                        <DnsRecordRow
                          type="A"
                          name="@"
                          value={LOVABLE_HOSTING_IP}
                          onCopy={(v) => copyText(v, "Value")}
                        />
                        <DnsRecordRow
                          type="A"
                          name="www"
                          value={LOVABLE_HOSTING_IP}
                          onCopy={(v) => copyText(v, "Value")}
                        />
                        <DnsRecordRow
                          type="TXT"
                          name="_lovable"
                          value={`lovable_verify=${d.verification_token}`}
                          onCopy={(v) => copyText(v, "Value")}
                        />
                      </CollapsibleContent>
                    </Collapsible>

                    {d.notes && (
                      <p className="text-xs text-muted-foreground italic">Notes: {d.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Domain</DialogTitle>
            <DialogDescription>
              The hostname only — no <code>https://</code> and no path.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-host">Domain</Label>
              <Input
                id="new-host"
                placeholder="5threalm.in"
                value={newHost}
                onChange={(e) => setNewHost(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Branch (optional)</Label>
              <Select value={newBranchId} onValueChange={setNewBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All branches (uses default)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.is_default ? "(default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-notes">Notes (optional)</Label>
              <Input
                id="new-notes"
                placeholder="Internal notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !newHost.trim()}>
              {saving ? "Adding…" : "Add Domain"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this domain?</AlertDialogTitle>
            <AlertDialogDescription>
              The custom registration link will stop working. The gym's data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DnsRecordRow({
  type,
  name,
  value,
  onCopy,
}: {
  type: string;
  name: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[60px_80px_1fr_auto] gap-2 items-center text-xs bg-muted/40 rounded p-2 font-mono">
      <Badge variant="outline" className="font-mono">{type}</Badge>
      <span>{name}</span>
      <span className="truncate">{value}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onCopy(value)}
      >
        <ClipboardDocumentIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
