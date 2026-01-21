import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.220.1/encoding/base64.ts";

const base64Encode = encodeBase64;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants for security
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const SESSION_EXPIRY_HOURS = 24;

interface LoginRequest {
  phone: string;
  password: string;
}

interface CreatePasswordRequest {
  staffId: string;
  password: string;
  sendWhatsApp?: boolean;
}

// Simple password hashing using Web Crypto API (bcrypt-like security with salt)
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  // Combine salt and password
  const combined = new Uint8Array(salt.length + passwordData.length);
  combined.set(salt);
  combined.set(passwordData, salt.length);
  
  // Hash using SHA-256 multiple rounds (PBKDF2-like)
  let hash = await crypto.subtle.digest("SHA-256", combined);
  for (let i = 0; i < 10000; i++) {
    hash = await crypto.subtle.digest("SHA-256", hash);
  }
  
  // Combine salt and hash for storage
  const hashArray = new Uint8Array(hash);
  const result = new Uint8Array(salt.length + hashArray.length);
  result.set(salt);
  result.set(hashArray, salt.length);
  
  return base64Encode(result);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    // Decode stored hash
    const decoded = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
    
    // Extract salt (first 16 bytes)
    const salt = decoded.slice(0, 16);
    const storedHashBytes = decoded.slice(16);
    
    // Hash input password with same salt
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const combined = new Uint8Array(salt.length + passwordData.length);
    combined.set(salt);
    combined.set(passwordData, salt.length);
    
    let hash = await crypto.subtle.digest("SHA-256", combined);
    for (let i = 0; i < 10000; i++) {
      hash = await crypto.subtle.digest("SHA-256", hash);
    }
    
    const hashArray = new Uint8Array(hash);
    
    // Compare hashes
    if (hashArray.length !== storedHashBytes.length) return false;
    for (let i = 0; i < hashArray.length; i++) {
      if (hashArray[i] !== storedHashBytes[i]) return false;
    }
    return true;
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}

// Generate secure session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64Encode(array).replace(/[+/=]/g, (c) => {
    if (c === '+') return '-';
    if (c === '/') return '_';
    return '';
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get client info for logging
    const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    switch (action) {
      case "login": {
        const { phone, password } = (await req.json()) as LoginRequest;

        if (!phone || !password) {
          return new Response(
            JSON.stringify({ success: false, error: "Phone and password are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Clean phone number
        const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "");
        
        // Log the login attempt
        await supabase.from("staff_login_attempts").insert({
          phone: cleanPhone,
          ip_address: clientIP,
          user_agent: userAgent,
          success: false,
          failure_reason: "pending",
        });

        // Find staff by phone
        const { data: staff, error: staffError } = await supabase
          .from("staff")
          .select("*")
          .eq("phone", cleanPhone)
          .single();

        if (staffError || !staff) {
          // Update login attempt
          await supabase
            .from("staff_login_attempts")
            .update({ failure_reason: "invalid_credentials" })
            .eq("phone", cleanPhone)
            .order("created_at", { ascending: false })
            .limit(1);

          return new Response(
            JSON.stringify({ success: false, error: "Invalid phone number or password" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if account is locked
        if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
          const remainingMinutes = Math.ceil(
            (new Date(staff.locked_until).getTime() - Date.now()) / 60000
          );
          
          await supabase
            .from("staff_login_attempts")
            .update({ failure_reason: "account_locked" })
            .eq("phone", cleanPhone)
            .order("created_at", { ascending: false })
            .limit(1);

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Account is locked. Try again in ${remainingMinutes} minutes.`,
              locked: true 
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if staff is active
        if (!staff.is_active) {
          await supabase
            .from("staff_login_attempts")
            .update({ failure_reason: "account_inactive" })
            .eq("phone", cleanPhone)
            .order("created_at", { ascending: false })
            .limit(1);

          return new Response(
            JSON.stringify({ success: false, error: "Account is deactivated. Contact admin." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if password is set
        if (!staff.password_hash) {
          await supabase
            .from("staff_login_attempts")
            .update({ failure_reason: "no_password" })
            .eq("phone", cleanPhone)
            .order("created_at", { ascending: false })
            .limit(1);

          return new Response(
            JSON.stringify({ success: false, error: "No password set. Contact admin." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify password
        const isValid = await verifyPassword(password, staff.password_hash);

        if (!isValid) {
          const newAttempts = (staff.failed_login_attempts || 0) + 1;
          const updateData: any = { failed_login_attempts: newAttempts };

          // Lock account if too many attempts
          if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
            updateData.locked_until = lockUntil.toISOString();
          }

          await supabase.from("staff").update(updateData).eq("id", staff.id);

          await supabase
            .from("staff_login_attempts")
            .update({ failure_reason: "wrong_password" })
            .eq("phone", cleanPhone)
            .order("created_at", { ascending: false })
            .limit(1);

          const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: remainingAttempts > 0 
                ? `Invalid password. ${remainingAttempts} attempts remaining.`
                : `Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Successful login - reset failed attempts and update last login
        await supabase.from("staff").update({
          failed_login_attempts: 0,
          locked_until: null,
          last_login_at: new Date().toISOString(),
          last_login_ip: clientIP,
        }).eq("id", staff.id);

        // Create session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

        await supabase.from("staff_sessions").insert({
          staff_id: staff.id,
          session_token: sessionToken,
          ip_address: clientIP,
          user_agent: userAgent,
          expires_at: expiresAt.toISOString(),
        });

        // Get permissions
        const { data: permissions } = await supabase
          .from("staff_permissions")
          .select("*")
          .eq("staff_id", staff.id)
          .single();

        // Get assigned branches
        const { data: branchAssignments } = await supabase
          .from("staff_branch_assignments")
          .select("branch_id, is_primary, branches(id, name)")
          .eq("staff_id", staff.id);

        // Update login attempt to success
        await supabase
          .from("staff_login_attempts")
          .update({ success: true, failure_reason: null })
          .eq("phone", cleanPhone)
          .order("created_at", { ascending: false })
          .limit(1);

        return new Response(
          JSON.stringify({
            success: true,
            session: {
              token: sessionToken,
              expiresAt: expiresAt.toISOString(),
            },
            staff: {
              id: staff.id,
              fullName: staff.full_name,
              phone: staff.phone,
              role: staff.role,
              isActive: staff.is_active,
            },
            permissions: permissions || {
              can_view_members: false,
              can_manage_members: false,
              can_access_financials: false,
              can_access_analytics: false,
              can_change_settings: false,
            },
            branches: branchAssignments?.map(b => ({
              id: b.branch_id,
              name: (b.branches as any)?.name,
              isPrimary: b.is_primary,
            })) || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "verify-session": {
        const authHeader = req.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ valid: false, error: "No session token" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const token = authHeader.replace("Bearer ", "");

        const { data: session, error: sessionError } = await supabase
          .from("staff_sessions")
          .select(`
            *,
            staff:staff_id (
              id, full_name, phone, role, is_active
            )
          `)
          .eq("session_token", token)
          .eq("is_revoked", false)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (sessionError || !session) {
          return new Response(
            JSON.stringify({ valid: false, error: "Invalid or expired session" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!(session.staff as any)?.is_active) {
          return new Response(
            JSON.stringify({ valid: false, error: "Account deactivated" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get permissions
        const { data: permissions } = await supabase
          .from("staff_permissions")
          .select("*")
          .eq("staff_id", (session.staff as any).id)
          .single();

        // Get assigned branches
        const { data: branchAssignments } = await supabase
          .from("staff_branch_assignments")
          .select("branch_id, is_primary, branches(id, name)")
          .eq("staff_id", (session.staff as any).id);

        return new Response(
          JSON.stringify({
            valid: true,
            staff: {
              id: (session.staff as any).id,
              fullName: (session.staff as any).full_name,
              phone: (session.staff as any).phone,
              role: (session.staff as any).role,
              isActive: (session.staff as any).is_active,
            },
            permissions: permissions || {
              can_view_members: false,
              can_manage_members: false,
              can_access_financials: false,
              can_access_analytics: false,
              can_change_settings: false,
            },
            branches: branchAssignments?.map(b => ({
              id: b.branch_id,
              name: (b.branches as any)?.name,
              isPrimary: b.is_primary,
            })) || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "logout": {
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "");
          await supabase
            .from("staff_sessions")
            .update({ is_revoked: true })
            .eq("session_token", token);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "set-password": {
        // This requires admin authentication
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: "Admin authentication required" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify admin token with Supabase
        const token = authHeader.replace("Bearer ", "").trim();
        const userSupabase = createClient(SUPABASE_URL, token, {
          auth: { persistSession: false },
        });
        
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError || !user) {
          return new Response(
            JSON.stringify({ success: false, error: "Invalid admin token" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if user is admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (!roleData || roleData.role !== "admin") {
          return new Response(
            JSON.stringify({ success: false, error: "Admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { staffId, password, sendWhatsApp } = (await req.json()) as CreatePasswordRequest;

        if (!staffId || !password) {
          return new Response(
            JSON.stringify({ success: false, error: "Staff ID and password are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate password strength
        if (password.length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: "Password must be at least 6 characters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get staff details
        const { data: staff, error: staffError } = await supabase
          .from("staff")
          .select("*")
          .eq("id", staffId)
          .single();

        if (staffError || !staff) {
          return new Response(
            JSON.stringify({ success: false, error: "Staff not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Update staff with password
        const { error: updateError } = await supabase
          .from("staff")
          .update({
            password_hash: passwordHash,
            password_set_at: new Date().toISOString(),
            failed_login_attempts: 0,
            locked_until: null,
          })
          .eq("id", staffId);

        if (updateError) {
          return new Response(
            JSON.stringify({ success: false, error: "Failed to set password" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Send WhatsApp notification if requested
        if (sendWhatsApp && staff.phone) {
          try {
            const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
            const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");

            if (PERISKOPE_API_KEY && PERISKOPE_PHONE) {
              const cleanPhone = staff.phone.replace(/\D/g, "").replace(/^0/, "");
              const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

              const message = `🔐 *Login Credentials*\n\n` +
                `Hi ${staff.full_name}, 👋\n\n` +
                `Your staff login has been created. Here are your credentials:\n\n` +
                `📱 *Phone:* ${staff.phone}\n` +
                `🔑 *Password:* ${password}\n\n` +
                `You can login at the admin portal using these credentials.\n\n` +
                `⚠️ Please keep these credentials secure and change your password after first login.\n\n` +
                `— Gym Admin`;

              await fetch("https://api.periskope.app/v1/message/send", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${PERISKOPE_API_KEY}`,
                  "x-phone": PERISKOPE_PHONE,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  chat_id: `${phoneWithCountry}@c.us`,
                  message,
                }),
              });
            }
          } catch (whatsappError) {
            console.error("Error sending WhatsApp:", whatsappError);
            // Don't fail the request if WhatsApp fails
          }
        }

        return new Response(
          JSON.stringify({ success: true, message: "Password set successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "revoke-all-sessions": {
        // Admin-only action to revoke all sessions for a staff member
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: "Admin authentication required" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const token = authHeader.replace("Bearer ", "").trim();
        const userSupabase = createClient(SUPABASE_URL, token, {
          auth: { persistSession: false },
        });
        
        const { data: { user }, error: userError } = await userSupabase.auth.getUser();
        if (userError || !user) {
          return new Response(
            JSON.stringify({ success: false, error: "Invalid admin token" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { staffId } = await req.json();

        await supabase
          .from("staff_sessions")
          .update({ is_revoked: true })
          .eq("staff_id", staffId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("Staff auth error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
