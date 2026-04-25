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
  BookOpenIcon,
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
    txt_host_checked?: string[];
    txt_records: string[] | null;
    txt_matches: boolean;
  };
  errors: string[];
  notes?: string[];
}

// (Vercel CNAME target moved below into the DNS-labels block.)

function normalizeHostname(input: string): string {
  const trimmed = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  // Only strip leading "www." when the host is exactly an apex+www
  // (e.g. "www.example.com"). Preserve real subdomains like
  // "www.register.example.com" or "register.example.com" untouched.
  return trimmed.split(".").length === 3 && trimmed.startsWith("www.")
    ? trimmed.slice(4)
    : trimmed;
}

const HOSTNAME_REGEX = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/**
 * Splits a hostname into the labels you actually type into a DNS panel.
 * For an apex domain like "5threalm.in" the A record host is "@".
 * For a subdomain like "register.5threalm.in" the A record host is
 * "register" (or the full path when the registrar wants the FQDN), and
 * the TXT verification host is "_lovable.register".
 */
function getDnsLabels(hostname: string) {
  const parts = hostname.split(".");
  // Treat anything with 3+ labels as a subdomain (works for .in, .co.uk
  // edge-cases too because we only need a hint for the host column).
  const isSubdomain = parts.length > 2;
  const subPrefix = isSubdomain ? parts.slice(0, -2).join(".") : "";
  return {
    isSubdomain,
    cnameHost: isSubdomain ? subPrefix : "@",
    txtHost: isSubdomain ? `_gymkloud.${subPrefix}` : "_gymkloud",
  };
}

// Where gyms point their CNAME. Cloudflare proxies the connection, and
// Vercel (where this app is deployed) accepts the host once it's added
// under Project → Settings → Domains.
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

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
  const [guideOpen, setGuideOpen] = useState(false);

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
              Connect the gym's own domain or subdomain (e.g. <code>5threalm.in</code> or
              <code> register.5threalm.in</code>) so member registration runs from their branded
              URL. Payments will then originate from this domain — required by Razorpay/RBI for
              separate merchant credentials.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Domain
          </Button>
        </CardHeader>

        <div className="px-6 -mt-2 mb-2">
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs space-y-2">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              ⚠️ Two-step setup — both are required
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-amber-900 dark:text-amber-200">
              <li>
                Add the domain here <strong>and</strong> add the TXT record at the gym's DNS
                provider (Cloudflare) so we can map the hostname to this tenant.
              </li>
              <li>
                Add a <strong>CNAME</strong> in Cloudflare pointing the gym's hostname at{" "}
                <code>cname.vercel-dns.com</code> (orange cloud / proxied is fine — Cloudflare
                will terminate SSL). Then add the same hostname under{" "}
                <strong>Vercel Project → Settings → Domains</strong> so Vercel accepts the host
                header and serves <strong>this app</strong>.
              </li>
            </ol>
            <div className="text-amber-800 dark:text-amber-300">
              For subdomains like <code>register.qoremedia.in</code>, the apex
              (<code>qoremedia.in</code>) can stay on the gym's existing site (Vercel landing
              page, etc.) — only the subdomain needs the CNAME above.
            </div>
          </div>
        </div>

        <div className="px-6 mb-4">
          <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <BookOpenIcon className="h-4 w-4" />
                  Complete Setup Guide (Cloudflare + Vercel)
                </span>
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${guideOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-5">
                <div>
                  <h4 className="font-semibold mb-1">📋 Prerequisites</h4>
                  <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground text-xs">
                    <li>Access to the gym's DNS provider (Cloudflare recommended)</li>
                    <li>Access to the GymKloud Vercel project (Settings → Domains)</li>
                    <li>Gym's branch already created in GymKloud</li>
                    <li>Decided on the subdomain (recommended: <code>register.&lt;gymdomain&gt;</code>)</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    <strong>Why a subdomain?</strong> The gym's main domain usually hosts their landing page elsewhere. A subdomain keeps both running independently.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">🟢 Step 1 — Add the Domain in GymKloud</h4>
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                    <li>Click <strong>Add Domain</strong> above and enter the full hostname (e.g. <code>register.qoremedia.in</code>).</li>
                    <li>Pick the branch this domain should resolve to.</li>
                    <li>GymKloud generates a <strong>TXT verification token</strong> — keep this tab open.</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">🟠 Step 2 — Cloudflare DNS (gym's DNS provider)</h4>
                  <p className="text-xs mb-2">In Cloudflare → select the gym's domain → <strong>DNS → Records</strong> → add <strong>two records</strong>:</p>

                  <div className="space-y-2">
                    <div className="rounded border bg-background p-2">
                      <div className="text-xs font-medium mb-1">A. CNAME record (routes traffic to Vercel)</div>
                      <ul className="text-xs space-y-0.5 font-mono">
                        <li>Type: <strong>CNAME</strong></li>
                        <li>Name: <strong>register</strong> (just the subdomain part)</li>
                        <li>Target: <strong>cname.vercel-dns.com</strong></li>
                        <li>Proxy: 🟧 <strong>Proxied</strong> (orange cloud ON)</li>
                        <li>TTL: Auto</li>
                      </ul>
                    </div>

                    <div className="rounded border bg-background p-2">
                      <div className="text-xs font-medium mb-1">B. TXT record (proves ownership)</div>
                      <ul className="text-xs space-y-0.5 font-mono">
                        <li>Type: <strong>TXT</strong></li>
                        <li>Name: <strong>_gymkloud.register</strong></li>
                        <li>Content: <strong>gymkloud-verify=&lt;token from Step 1&gt;</strong></li>
                        <li>Proxy: DNS only</li>
                      </ul>
                    </div>

                    <div className="rounded border border-destructive/40 bg-destructive/5 p-2">
                      <div className="text-xs font-medium mb-1 text-destructive">C. SSL/TLS setting (critical!)</div>
                      <p className="text-xs">
                        Go to <strong>SSL/TLS → Overview</strong> and set <strong>Encryption Mode = Full</strong>.
                      </p>
                      <p className="text-xs mt-1 text-muted-foreground">
                        ❌ Do NOT use <code>Flexible</code> — causes redirect loops. ✅ <code>Full</code> or <code>Full (strict)</code> both work.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">⬛ Step 3 — Vercel (GymKloud project)</h4>
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                    <li>Open Vercel dashboard → <strong>GymKloud project → Settings → Domains</strong>.</li>
                    <li>Click <strong>Add Domain</strong>.</li>
                    <li>Enter the full hostname (e.g. <code>register.qoremedia.in</code>) → <strong>Add</strong>.</li>
                    <li>If Vercel shows <strong>"Proxy Detected"</strong>, ignore it — Cloudflare is handling SSL/DDoS by design.</li>
                    <li>Wait ~30 seconds → status should show <strong>Production / Valid Configuration</strong>.</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-1">
                    No SSL action needed on Vercel — Cloudflare's edge cert handles HTTPS.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">✅ Step 4 — Verify in GymKloud</h4>
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                    <li>Return to this Domains tab.</li>
                    <li>Click <strong>Check verification</strong> on the domain row above.</li>
                    <li>Once the TXT record propagates (usually &lt;1 min on Cloudflare), status flips to <strong>Verified</strong>.</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">🧪 Step 5 — Test</h4>
                  <p className="text-xs">
                    Open <code>https://register.&lt;gymdomain&gt;/</code> in an incognito tab. The gym's branded registration page should load (same as <code>/b/&lt;branch-slug&gt;</code> on gymkloud.in), using the gym's database, Razorpay credentials, branding, and packages.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">🛠 Troubleshooting</h4>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-1.5 font-medium">Symptom</th>
                          <th className="text-left p-1.5 font-medium">Cause</th>
                          <th className="text-left p-1.5 font-medium">Fix</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-[11px]">
                        <tr className="border-b"><td className="p-1.5">Vercel 404 DEPLOYMENT_NOT_FOUND</td><td className="p-1.5">Domain not added in Vercel</td><td className="p-1.5">Repeat Step 3</td></tr>
                        <tr className="border-b"><td className="p-1.5">Cloudflare 525 / 526 error</td><td className="p-1.5">SSL mode is Flexible/Off</td><td className="p-1.5">Set SSL/TLS = Full</td></tr>
                        <tr className="border-b"><td className="p-1.5">Infinite redirect loop</td><td className="p-1.5">SSL mode = Flexible</td><td className="p-1.5">Set SSL/TLS = Full</td></tr>
                        <tr className="border-b"><td className="p-1.5">"Domain not configured" page</td><td className="p-1.5">Not verified in GymKloud</td><td className="p-1.5">Repeat Step 4</td></tr>
                        <tr className="border-b"><td className="p-1.5">TXT verification fails</td><td className="p-1.5">DNS not propagated yet</td><td className="p-1.5">Wait 1–2 min, retry</td></tr>
                        <tr><td className="p-1.5">Loads gymkloud.in homepage</td><td className="p-1.5">CNAME wrong / not proxied</td><td className="p-1.5">Check Step 2A</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-dashed p-3 bg-background">
                  <h4 className="font-semibold mb-1.5 text-xs">📌 Quick Reference (every new gym)</h4>
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs font-mono">
                    <li>GymKloud → add domain + copy TXT token</li>
                    <li>Cloudflare → CNAME register → cname.vercel-dns.com (Proxied)</li>
                    <li>Cloudflare → TXT _gymkloud.register = gymkloud-verify=&lt;token&gt;</li>
                    <li>Cloudflare → SSL/TLS = Full</li>
                    <li>Vercel → Settings → Domains → Add register.&lt;domain&gt;</li>
                    <li>GymKloud → Check verification</li>
                    <li>Test https://register.&lt;domain&gt;/</li>
                  </ol>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

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
                const labels = getDnsLabels(d.hostname);
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
                          {labels.isSubdomain && (
                            <Badge variant="outline" className="text-xs">Subdomain</Badge>
                          )}
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

                    {result && result.errors.length > 0 && (
                      <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2 space-y-1">
                        {result.errors.map((err, i) => (
                          <div key={i} className="text-amber-900 dark:text-amber-200">• {err}</div>
                        ))}
                        <div className="text-muted-foreground pt-1">
                          TXT: {result.dns.txt_records?.join(", ") || "—"}
                        </div>
                      </div>
                    )}

                    {result && result.notes && result.notes.length > 0 && (
                      <div className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded p-2 space-y-1">
                        {result.notes.map((note, i) => (
                          <div key={i} className="text-blue-900 dark:text-blue-200">ℹ {note}</div>
                        ))}
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
                          {labels.isSubdomain ? (
                            <>
                              <strong>Subdomain setup (Cloudflare + Vercel).</strong> 1) In
                              Cloudflare DNS, add the <strong>TXT</strong> record below — that's
                              all we need to verify ownership. 2) Add a <strong>CNAME</strong>{" "}
                              from <code>{labels.cnameHost}</code> to{" "}
                              <code>{VERCEL_CNAME_TARGET}</code> (orange cloud / proxied is
                              fine). 3) In <strong>Vercel → Project → Settings → Domains</strong>,
                              add <code>{d.hostname}</code> so Vercel routes the host to this
                              app. 4) Click "Check verification" once DNS has propagated.
                            </>
                          ) : (
                            <>
                              <strong>Apex domain setup (Cloudflare + Vercel).</strong> 1) Add
                              these DNS records in Cloudflare. 2) In{" "}
                              <strong>Vercel → Project → Settings → Domains</strong>, add{" "}
                              <code>{d.hostname}</code>. 3) Click "Check verification" once DNS
                              has propagated. Note: apex CNAMEs are flattened automatically by
                              Cloudflare, so a CNAME at <code>@</code> works.
                            </>
                          )}
                        </p>
                        <DnsRecordRow
                          type="TXT"
                          name={labels.txtHost}
                          value={`gymkloud-verify=${d.verification_token}`}
                          onCopy={(v) => copyText(v, "Value")}
                          required
                          hint="Add at the gym's DNS provider (Cloudflare). Proves ownership of the hostname."
                        />
                        <DnsRecordRow
                          type="CNAME"
                          name={labels.cnameHost}
                          value={VERCEL_CNAME_TARGET}
                          onCopy={(v) => copyText(v, "Value")}
                          hint="Routes traffic to Vercel where this app is hosted. Cloudflare proxy (orange cloud) is supported."
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
              Hostname only — no <code>https://</code> and no path. Apex domains
              (<code>5threalm.in</code>) or subdomains (<code>register.5threalm.in</code>) both work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-host">Domain</Label>
              <Input
                id="new-host"
                placeholder="register.5threalm.in"
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
  required,
  hint,
}: {
  type: string;
  name: string;
  value: string;
  onCopy: (v: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[60px_minmax(80px,140px)_1fr_auto] gap-2 items-center text-xs bg-muted/40 rounded p-2 font-mono">
        <Badge variant="outline" className="font-mono">{type}</Badge>
        <span className="truncate">{name}</span>
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
      {(required || hint) && (
        <div className="text-[11px] text-muted-foreground pl-2">
          {required && (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Required for verification.
            </span>
          )}
          {required && hint ? " " : ""}
          {hint}
        </div>
      )}
    </div>
  );
}
