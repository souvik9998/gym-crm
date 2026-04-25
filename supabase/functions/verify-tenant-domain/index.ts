/**
 * verify-tenant-domain
 *
 * Super-admin gated. Performs DNS lookups for a hostname registered
 * in `public.tenant_domains` and marks it verified when the TXT
 * ownership record is present.
 *
 *   TXT  _lovable.<hostname>   contains   lovable_verify=<token>
 *
 * The A-record check is informational only — many gyms front their
 * domain with Cloudflare/Vercel proxies, or use subdomains like
 * `register.5threalm.in` that legitimately won't resolve to Lovable's
 * raw IP. Ownership (TXT) is what we actually need to safely route a
 * tenant. Pointing the host at Lovable for SSL/serving is configured
 * separately in Lovable Project Settings → Domains.
 *
 * Body: { domain_id: string }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_HOSTING_IP = "185.158.133.1";

// Common proxy providers gyms use in front of their domain. When the A
// record points to one of these, we treat the routing as "intentionally
// proxied" and surface an info note instead of an error.
const PROXY_IP_PREFIXES = [
  "104.16.", "104.17.", "104.18.", "104.19.", "104.20.", "104.21.",
  "104.22.", "104.23.", "104.24.", "104.25.", "104.26.", "104.27.",
  "104.28.", "172.64.", "172.65.", "172.66.", "172.67.", "172.68.",
  "172.69.", "172.70.", "172.71.", // Cloudflare
  "76.76.21.", "76.76.19.", // Vercel
  "151.101.", // Fastly
];

function isProxiedIp(ip: string): boolean {
  return PROXY_IP_PREFIXES.some((p) => ip.startsWith(p));
}

interface VerifyResult {
  verified: boolean;
  hostname: string;
  expected_token: string;
  dns: {
    a_records: string[] | null;
    a_matches: boolean;
    a_proxied: boolean;
    txt_records: string[] | null;
    txt_matches: boolean;
  };
  errors: string[];
  notes: string[];
}

async function lookupA(host: string): Promise<string[] | null> {
  try {
    const records = await Deno.resolveDns(host, "A");
    return records as string[];
  } catch (e) {
    console.warn(`A lookup failed for ${host}:`, (e as Error).message);
    return null;
  }
}

async function lookupTxt(host: string): Promise<string[] | null> {
  try {
    const records = await Deno.resolveDns(host, "TXT");
    return (records as string[][]).map((parts) => parts.join(""));
  } catch (e) {
    console.warn(`TXT lookup failed for ${host}:`, (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    )!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "").trim();
    let userId: string | undefined;
    try {
      const { data } = await userClient.auth.getClaims(token);
      userId = (data?.claims as any)?.sub;
    } catch {
      const { data: u } = await userClient.auth.getUser(token);
      userId = u.user?.id;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuper } = await adminClient.rpc("is_super_admin", {
      _user_id: userId,
    });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const domainId: string | undefined = body?.domain_id;
    if (!domainId || typeof domainId !== "string") {
      return new Response(
        JSON.stringify({ error: "domain_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: row, error: rowErr } = await adminClient
      .from("tenant_domains")
      .select("id, hostname, verification_token, is_verified")
      .eq("id", domainId)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(
        JSON.stringify({ error: "Domain not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const hostname = row.hostname.toLowerCase().trim();
    const expectedToken = row.verification_token;
    const errors: string[] = [];
    const notes: string[] = [];

    const [aRecords, txtRecords] = await Promise.all([
      lookupA(hostname),
      lookupTxt(`_lovable.${hostname}`),
    ]);

    const aMatches = !!aRecords?.includes(LOVABLE_HOSTING_IP);
    const aProxied =
      !aMatches && !!aRecords && aRecords.some((ip) => isProxiedIp(ip));
    const expectedTxt = `lovable_verify=${expectedToken}`;
    const txtMatches =
      !!txtRecords && txtRecords.some((r) => r.includes(expectedTxt));

    // TXT is the only hard requirement — it proves ownership.
    if (!txtRecords) {
      errors.push(
        `Could not find TXT record at _lovable.${hostname}. Add a TXT record on the host "_lovable" (or "_lovable.<subdomain>") with the verification token below.`
      );
    } else if (!txtMatches) {
      errors.push(
        `TXT record found but does not contain the expected token. Make sure the value is exactly: ${expectedTxt}`
      );
    }

    // A-record is informational. We surface useful notes but never block.
    if (aRecords && !aMatches) {
      if (aProxied) {
        notes.push(
          `Domain is proxied (got ${aRecords.join(
            ", "
          )}). That's fine — make sure SSL/origin is configured in Lovable Project Settings → Domains for ${hostname}.`
        );
      } else {
        notes.push(
          `Domain currently resolves to ${aRecords.join(
            ", "
          )}. For Lovable to serve this hostname directly, point it at ${LOVABLE_HOSTING_IP} (or front it with your existing CDN/proxy and add the same hostname under Lovable Project Settings → Domains for SSL).`
        );
      }
    } else if (!aRecords) {
      notes.push(
        `No A record resolved for ${hostname}. Add the hostname under Lovable Project Settings → Domains so SSL is provisioned.`
      );
    }

    // Verification = ownership proven via TXT. Routing/SSL is decoupled.
    const verified = txtMatches;

    if (verified && !row.is_verified) {
      await adminClient
        .from("tenant_domains")
        .update({ is_verified: true, verified_at: new Date().toISOString() })
        .eq("id", domainId);
    }

    const result: VerifyResult = {
      verified,
      hostname,
      expected_token: expectedToken,
      dns: {
        a_records: aRecords,
        a_matches: aMatches,
        a_proxied: aProxied,
        txt_records: txtRecords,
        txt_matches: txtMatches,
      },
      errors,
      notes,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-tenant-domain error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
