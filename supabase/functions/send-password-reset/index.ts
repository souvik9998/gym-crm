import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "GymKloud <hello@gymkloud.in>";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  diagnostics?: {
    error_stage?: string;
    provider_status?: number;
  };
}

function respond<T>(ok: boolean, payload: Omit<ApiResponse<T>, "ok">) {
  return new Response(JSON.stringify({ ok, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailHtml(resetUrl: string, email: string) {
  const safeEmail = escapeHtml(email);
  const safeResetUrl = escapeHtml(resetUrl);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Reset your GymKloud password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:center;">
                <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:#0f172a;color:#ffffff;font-weight:700;font-size:22px;line-height:56px;letter-spacing:-0.5px;">GK</div>
                <h1 style="margin:20px 0 4px 0;font-size:22px;font-weight:600;color:#0f172a;">Reset your password</h1>
                <p style="margin:0;color:#64748b;font-size:14px;">GymKloud account security</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                  Hi there,
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                  We received a request to reset the password for the GymKloud account associated with
                  <strong style="color:#0f172a;">${safeEmail}</strong>.
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#334155;">
                  Click the button below to choose a new password. This link will expire in 1 hour.
                </p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${safeResetUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">
                    Reset password
                  </a>
                </div>
                <p style="margin:16px 0 8px 0;font-size:13px;color:#64748b;line-height:1.6;">
                  Or copy and paste this URL into your browser:
                </p>
                <p style="margin:0 0 24px 0;font-size:12px;word-break:break-all;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;color:#475569;">
                  ${safeResetUrl}
                </p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                  If you didn't request a password reset, you can safely ignore this email — your password
                  won't change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;text-align:center;color:#94a3b8;font-size:12px;">
                © ${year} GymKloud. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error("Supabase env not configured");
    }

    const raw = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return respond(false, {
        error: "Invalid request payload.",
        diagnostics: { error_stage: "invalid_json" },
      });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const redirectTo = String(body.redirectTo || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      return respond(false, {
        error: "Please enter your email address.",
        diagnostics: { error_stage: "missing_email" },
      });
    }

    if (!emailRegex.test(email)) {
      return respond(false, {
        error: "Please enter a valid email address.",
        diagnostics: { error_stage: "invalid_email" },
      });
    }

    if (!redirectTo) {
      return respond(false, {
        error: "Missing password reset redirect.",
        diagnostics: { error_stage: "missing_redirect" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: linkData, error: linkErr } = await admin.auth.admin
      .generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

    if (linkErr || !linkData?.properties?.action_link) {
      console.warn("generateLink issue:", linkErr?.message);
      return respond(true, {
        data: {
          message:
            "If an account exists, a reset link has been sent to the email.",
        },
      });
    }

    // Rewrite the action_link host to the GymKloud domain so the email link
    // opens our branded /reset-password page instead of the Supabase site URL.
    const APP_DOMAIN = "https://app.gymkloud.in";
    let resetUrl = linkData.properties.action_link;
    try {
      const original = new URL(resetUrl);
      const target = new URL(APP_DOMAIN);
      // Preserve the recovery token query + hash; replace the origin only.
      target.pathname = "/reset-password";
      target.search = original.search;
      target.hash = original.hash;
      resetUrl = target.toString();
    } catch (e) {
      console.warn("Failed to rewrite reset URL host:", (e as Error).message);
    }

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject: "Reset your GymKloud password",
        html: buildEmailHtml(resetUrl, email),
      }),
    });

    const resendBody = await resendResponse.text();

    if (!resendResponse.ok) {
      console.error("Resend send failed", resendResponse.status, resendBody);
      return respond(false, {
        error: "Could not send reset email. Please try again later.",
        diagnostics: {
          error_stage: "email_sending_failed",
          provider_status: resendResponse.status,
        },
      });
    }

    return respond(true, {
      data: { message: "Reset link sent to your email" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-password-reset error:", msg);
    return respond(false, {
      error: "Could not send reset email. Please try again later.",
      diagnostics: { error_stage: "unexpected_runtime_error" },
    });
  }
});
