/**
 * verify-tenant-domain
 *
 * Super-admin gated. Performs a DNS TXT lookup for a hostname
 * registered in `public.tenant_domains` and marks it verified when
 * the ownership record is present.
 *
 *   TXT  _gymkloud.<hostname>   contains   gymkloud-verify=<token>
 *
 * For backward compatibility we also accept the older
 *   TXT  _lovable.<hostname>    contains   lovable_verify=<token>
 * format used by the previous setup flow.
 *
 * The actual hosting/SSL is handled by Vercel + Cloudflare:
 *   - Cloudflare DNS: CNAME <host> → cname.vercel-dns.com (proxy ok)
 *   - Vercel Project → Settings → Domains: add the hostname
 *
 * That routing is intentionally decoupled from this function — DNS
 * proxies and CNAME flattening make A-record checks unreliable, so we
 * only assert ownership here. Routing health is observable directly
 * (the gym opens the URL).
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

interface VerifyResult {
  verified: boolean;
  hostname: string;
  expected_token: string;
  dns: {
    txt_host_checked: string[];
    txt_records: string[] | null;
    txt_matches: boolean;
  };
  errors: string[];
  notes: string[];
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

    // Check both the new (_gymkloud) and legacy (_lovable) TXT hosts so
    // older verified domains keep working without re-configuration.
    const txtHosts = [`_gymkloud.${hostname}`, `_lovable.${hostname}`];
    const lookups = await Promise.all(txtHosts.map((h) => lookupTxt(h)));

    const allRecords = lookups
      .flatMap((r) => r ?? [])
      .filter((r) => typeof r === "string");

    const expectedNew = `gymkloud-verify=${expectedToken}`;
    const expectedLegacy = `lovable_verify=${expectedToken}`;
    const txtMatches = allRecords.some(
      (r) => r.includes(expectedNew) || r.includes(expectedLegacy)
    );

    if (allRecords.length === 0) {
      errors.push(
        `Could not find a TXT record at _gymkloud.${hostname}. In Cloudflare DNS, add a TXT record on the host "_gymkloud" (or "_gymkloud.<subdomain>") with the verification token below.`
      );
    } else if (!txtMatches) {
      errors.push(
        `TXT record found but does not contain the expected token. Make sure the value is exactly: ${expectedNew}`
      );
    }

    notes.push(
      `Routing reminder: add a CNAME from ${hostname} → cname.vercel-dns.com in Cloudflare, and add ${hostname} under Vercel → Project → Settings → Domains.`
    );

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
        txt_host_checked: txtHosts,
        txt_records: allRecords.length ? allRecords : null,
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
