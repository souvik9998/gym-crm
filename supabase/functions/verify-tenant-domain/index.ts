/**
 * verify-tenant-domain
 *
 * Super-admin gated. Performs DNS lookups for a hostname registered
 * in `public.tenant_domains` and marks it verified when:
 *   - The TXT record at `_lovable.<hostname>` contains
 *     `lovable_verify=<verification_token>`, AND
 *   - The A record for `<hostname>` resolves to Lovable's hosting IP
 *     (185.158.133.1) — soft check, returns details either way.
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

interface VerifyResult {
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
    // resolveDns returns string[][] for TXT — flatten each entry
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

    // Validate caller
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

    // Super admin gate
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

    // DNS lookups in parallel
    const [aRecords, txtRecords] = await Promise.all([
      lookupA(hostname),
      lookupTxt(`_lovable.${hostname}`),
    ]);

    const aMatches = !!aRecords?.includes(LOVABLE_HOSTING_IP);
    const expectedTxt = `lovable_verify=${expectedToken}`;
    const txtMatches =
      !!txtRecords && txtRecords.some((r) => r.includes(expectedTxt));

    if (!aRecords) errors.push("Could not resolve A record");
    else if (!aMatches)
      errors.push(
        `A record does not point to ${LOVABLE_HOSTING_IP} (got: ${aRecords.join(
          ", "
        )})`
      );

    if (!txtRecords) errors.push(`Could not resolve TXT at _lovable.${hostname}`);
    else if (!txtMatches)
      errors.push(`TXT record missing expected value: ${expectedTxt}`);

    // We mark verified when ownership (TXT) is proven AND the host points
    // at Lovable. Both are required for the public link to actually serve.
    const verified = txtMatches && aMatches;

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
        txt_records: txtRecords,
        txt_matches: txtMatches,
      },
      errors,
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
