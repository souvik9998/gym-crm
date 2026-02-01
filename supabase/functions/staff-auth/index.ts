/**
 * Staff Authentication Edge Function
 * 
 * Uses ONLY Supabase Auth as the single source of truth for staff identity.
 * Staff accounts use email format: staff_{phone}@gym.local
 * 
 * NO CUSTOM PASSWORD HASHING - All password management via Supabase Auth Admin API.
 * 
 * Security features:
 * - Native Supabase Auth password management
 * - Account lockout after 5 failed attempts (15 min)
 * - Inactive/suspended staff prevention
 * - Login attempt tracking for audit
 * - JWT-based sessions via Supabase Auth
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LoginSchema,
  SetPasswordSchema,
  RevokeSessionsSchema,
  validateInput,
  validationErrorResponse,
} from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Staff email format for Supabase Auth
function getStaffEmail(phone: string): string {
  return `staff_${phone}@gym.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    switch (action) {
      case "login": {
        const body = await req.json().catch(() => ({}));
        
        const validation = validateInput(LoginSchema, body);
        if (!validation.success) {
          return validationErrorResponse(validation.error!, corsHeaders, validation.details);
        }
        
        const { phone, password } = validation.data!;
        
        // Log attempt
        await supabaseAdmin.from("staff_login_attempts").insert({
          phone,
          ip_address: clientIP,
          user_agent: userAgent,
          success: false,
          failure_reason: "pending",
        });

        // Find active staff by phone
        const { data: staffList, error: staffError } = await supabaseAdmin
          .from("staff")
          .select("*")
          .eq("phone", phone)
          .eq("is_active", true);

        // Get staff with auth_user_id first (has Supabase Auth account)
        const staff = staffList?.find(s => s.auth_user_id) || staffList?.[0];

        if (staffError || !staff) {
          await updateLoginAttempt(supabaseAdmin, phone, "invalid_credentials");
          return errorResponse("Invalid phone number or password", 401);
        }

        // Check account lock
        if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
          const remainingMinutes = Math.ceil(
            (new Date(staff.locked_until).getTime() - Date.now()) / 60000
          );
          await updateLoginAttempt(supabaseAdmin, phone, "account_locked");
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Account locked. Try again in ${remainingMinutes} minutes.`,
              locked: true 
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check inactive
        if (!staff.is_active) {
          await updateLoginAttempt(supabaseAdmin, phone, "account_inactive");
          return errorResponse("Account is deactivated. Contact admin.", 403);
        }

        // Check if staff has Supabase Auth account
        if (!staff.auth_user_id) {
          await updateLoginAttempt(supabaseAdmin, phone, "no_password");
          return errorResponse("No password set. Contact admin to set your password.", 401);
        }

        // Use Supabase Auth to authenticate
        const staffEmail = getStaffEmail(phone);
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          email: staffEmail,
          password: password,
        });

        if (signInError || !signInData.session) {
          // Login failed - increment failed attempts
          const newAttempts = (staff.failed_login_attempts || 0) + 1;
          const updateData: Record<string, unknown> = { failed_login_attempts: newAttempts };

          if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
            updateData.locked_until = lockUntil.toISOString();
          }

          await supabaseAdmin.from("staff").update(updateData).eq("id", staff.id);
          await updateLoginAttempt(supabaseAdmin, phone, "wrong_password");

          const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;
          return errorResponse(
            remainingAttempts > 0 
              ? `Invalid password. ${remainingAttempts} attempts remaining.`
              : `Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
            401
          );
        }

        // Login successful - reset failed attempts and update last login
        await supabaseAdmin.from("staff").update({
          failed_login_attempts: 0,
          locked_until: null,
          last_login_at: new Date().toISOString(),
          last_login_ip: clientIP,
        }).eq("id", staff.id);

        // Get permissions
        const { data: permissions } = await supabaseAdmin
          .from("staff_permissions")
          .select("*")
          .eq("staff_id", staff.id)
          .single();

        // Get branch assignments
        const { data: branchAssignments } = await supabaseAdmin
          .from("staff_branch_assignments")
          .select("branch_id, is_primary, branches(id, name)")
          .eq("staff_id", staff.id);

        // Update login attempt to success
        await updateLoginAttempt(supabaseAdmin, phone, null, true);

        // Log activity
        const primaryBranch = branchAssignments?.find(b => b.is_primary);
        const branchId = primaryBranch?.branch_id || branchAssignments?.[0]?.branch_id;
        
        await supabaseAdmin.from("admin_activity_logs").insert({
          admin_user_id: staff.auth_user_id,
          activity_category: "staff",
          activity_type: "staff_logged_in",
          description: `Staff "${staff.full_name}" logged in successfully`,
          entity_type: "staff",
          entity_id: staff.id,
          entity_name: staff.full_name,
          branch_id: branchId,
          metadata: {
            performed_by: "staff",
            staff_id: staff.id,
            staff_name: staff.full_name,
            staff_role: staff.role,
            ip_address: clientIP,
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            session: {
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
              expires_at: signInData.session.expires_at,
              expires_in: signInData.session.expires_in,
            },
            staff: {
              id: staff.id,
              authUserId: staff.auth_user_id,
              fullName: staff.full_name,
              phone: staff.phone,
              role: staff.role,
              isActive: staff.is_active,
            },
            permissions: permissions || {
              can_view_members: false,
              can_manage_members: false,
              can_access_ledger: false,
              can_access_payments: false,
              can_access_analytics: false,
              can_change_settings: false,
            },
            branches: branchAssignments?.map(b => ({
              id: b.branch_id,
              name: (b.branches as unknown as { name: string })?.name,
              isPrimary: b.is_primary,
            })) || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "verify-session": {
        const authHeader = req.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ valid: false, error: "No token provided" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const token = authHeader.replace("Bearer ", "");

        // Verify JWT via Supabase Auth
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
          return new Response(
            JSON.stringify({ valid: false, error: "Invalid or expired session" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get staff record linked to this auth user
        const { data: staff, error: staffError } = await supabaseAdmin
          .from("staff")
          .select("id, full_name, phone, role, is_active")
          .eq("auth_user_id", user.id)
          .single();

        if (staffError || !staff) {
          return new Response(
            JSON.stringify({ valid: false, error: "Staff record not found" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!staff.is_active) {
          return new Response(
            JSON.stringify({ valid: false, error: "Account deactivated" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get permissions
        const { data: permissions } = await supabaseAdmin
          .from("staff_permissions")
          .select("*")
          .eq("staff_id", staff.id)
          .single();

        // Get branch assignments
        const { data: branchAssignments } = await supabaseAdmin
          .from("staff_branch_assignments")
          .select("branch_id, is_primary, branches(id, name)")
          .eq("staff_id", staff.id);

        return new Response(
          JSON.stringify({
            valid: true,
            staff: {
              id: staff.id,
              authUserId: user.id,
              fullName: staff.full_name,
              phone: staff.phone,
              role: staff.role,
              isActive: staff.is_active,
            },
            permissions: permissions || {
              can_view_members: false,
              can_manage_members: false,
              can_access_ledger: false,
              can_access_payments: false,
              can_access_analytics: false,
              can_change_settings: false,
            },
            branches: branchAssignments?.map(b => ({
              id: b.branch_id,
              name: (b.branches as unknown as { name: string })?.name,
              isPrimary: b.is_primary,
            })) || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "logout": {
        const authHeader = req.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "");
          
          // Get user info before signing out
          const { data: { user } } = await supabaseAdmin.auth.getUser(token);
          
          if (user) {
            // Get staff info for logging
            const { data: staff } = await supabaseAdmin
              .from("staff")
              .select("id, full_name, phone, role")
              .eq("auth_user_id", user.id)
              .single();

            if (staff) {
              const { data: branchAssignments } = await supabaseAdmin
                .from("staff_branch_assignments")
                .select("branch_id, is_primary")
                .eq("staff_id", staff.id);
              
              const primaryBranch = branchAssignments?.find(b => b.is_primary);
              const branchId = primaryBranch?.branch_id || branchAssignments?.[0]?.branch_id;
              
              await supabaseAdmin.from("admin_activity_logs").insert({
                admin_user_id: user.id,
                activity_category: "staff",
                activity_type: "staff_logged_out",
                description: `Staff "${staff.full_name}" logged out`,
                entity_type: "staff",
                entity_id: staff.id,
                entity_name: staff.full_name,
                branch_id: branchId,
                metadata: {
                  performed_by: "staff",
                  staff_id: staff.id,
                  staff_name: staff.full_name,
                  staff_role: staff.role,
                },
              });
            }

            // Sign out the user (invalidate the session)
            await supabaseAdmin.auth.admin.signOut(user.id, "global");
          }
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "set-password": {
        const body = await req.json().catch(() => ({}));
        
        const validation = validateInput(SetPasswordSchema, body);
        if (!validation.success) {
          return validationErrorResponse(validation.error!, corsHeaders, validation.details);
        }
        
        const { staffId, password, sendWhatsApp } = validation.data!;

        // Get staff details
        const { data: staff, error: staffError } = await supabaseAdmin
          .from("staff")
          .select("*")
          .eq("id", staffId)
          .single();

        if (staffError || !staff) {
          return errorResponse("Staff not found", 404);
        }

        // Create or update Supabase Auth user
        const staffEmail = getStaffEmail(staff.phone);
        let authUserId = staff.auth_user_id;

        if (!authUserId) {
          // Create new Supabase Auth user
          const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: staffEmail,
            password: password,
            email_confirm: true,
            user_metadata: {
              staff_id: staff.id,
              role: staff.role,
              full_name: staff.full_name,
            }
          });

          if (createError) {
            // Try to find existing user by email
            const { data: users } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = users?.users?.find(u => u.email === staffEmail);
            
            if (existingUser) {
              authUserId = existingUser.id;
              // Update password for existing user
              const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { 
                password: password 
              });
              if (updateError) {
                console.error("Failed to update password:", updateError);
                return errorResponse("Failed to update password", 500);
              }
            } else {
              console.error("Failed to create auth user:", createError);
              return errorResponse("Failed to create auth account: " + createError.message, 500);
            }
          } else {
            authUserId = authUser.user.id;
          }

          // Add staff role to user_roles
          await supabaseAdmin.from("user_roles").upsert({
            user_id: authUserId,
            role: "staff"
          }, { onConflict: "user_id,role" });
        } else {
          // Update password for existing Supabase Auth user
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { 
            password: password 
          });
          if (updateError) {
            console.error("Failed to update password:", updateError);
            return errorResponse("Failed to update password: " + updateError.message, 500);
          }
        }

        // Update staff record with auth_user_id (no more password_hash!)
        const { error: updateError } = await supabaseAdmin
          .from("staff")
          .update({
            auth_user_id: authUserId,
            password_set_at: new Date().toISOString(),
            failed_login_attempts: 0,
            locked_until: null,
          })
          .eq("id", staffId);

        if (updateError) {
          return errorResponse("Failed to update staff record", 500);
        }

        // Send WhatsApp notification
        let whatsAppSent = false;
        if (sendWhatsApp && staff.phone) {
          whatsAppSent = await sendPasswordWhatsApp(supabaseAdmin, staff, password, staffId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Password set successfully",
            whatsAppSent,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "revoke-all-sessions": {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          return errorResponse("Admin authentication required", 401);
        }

        const token = authHeader.replace("Bearer ", "").trim();
        
        // Verify admin
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
          return errorResponse("Invalid admin token", 401);
        }

        // Check admin role
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!roleData) {
          return errorResponse("Admin access required", 403);
        }

        const body = await req.json().catch(() => ({}));
        
        const validation = validateInput(RevokeSessionsSchema, body);
        if (!validation.success) {
          return validationErrorResponse(validation.error!, corsHeaders, validation.details);
        }
        
        const { staffId } = validation.data!;

        // Get staff auth user
        const { data: staff } = await supabaseAdmin
          .from("staff")
          .select("auth_user_id")
          .eq("id", staffId)
          .single();

        if (staff?.auth_user_id) {
          // Sign out user from all sessions via Supabase Auth
          await supabaseAdmin.auth.admin.signOut(staff.auth_user_id, "global");
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (error: unknown) {
    console.error("Staff auth error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});

// Helper functions
function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function updateLoginAttempt(
  // deno-lint-ignore no-explicit-any
  supabase: any, 
  phone: string, 
  failureReason: string | null,
  success = false
) {
  await supabase
    .from("staff_login_attempts")
    .update({ success, failure_reason: failureReason })
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);
}

async function sendPasswordWhatsApp(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  staff: Record<string, unknown>,
  password: string,
  staffId: string
): Promise<boolean> {
  try {
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");

    if (!PERISKOPE_API_KEY || !PERISKOPE_PHONE) return false;

    const phone = staff.phone as string;
    const cleanPhone = phone.replace(/\D/g, "").replace(/^0/, "");
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const { data: branchAssignments } = await supabase
      .from("staff_branch_assignments")
      .select("branches(name)")
      .eq("staff_id", staffId);

    const branchNames = branchAssignments?.map((a: Record<string, unknown>) => 
      (a.branches as Record<string, unknown>)?.name
    ).filter(Boolean) || [];
    const branchDisplay = branchNames.length > 0 ? branchNames.join(", ") : "All Branches";
    const role = staff.role as string;
    const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Staff";

    const message = `🔐 *Staff Login Credentials*\n\n` +
      `Hi ${staff.full_name}, 👋\n\n` +
      `Your login credentials have been ${staff.password_set_at ? "updated" : "created"}:\n\n` +
      `📱 *Phone:* ${phone}\n` +
      `🔑 *Password:* ${password}\n` +
      `👤 *Role:* ${roleLabel}\n` +
      `📍 *Branch(es):* ${branchDisplay}\n\n` +
      `🔗 Access the admin portal and use the Staff Login tab.\n\n` +
      `⚠️ *SECURITY NOTICE:*\n` +
      `• Delete this message after saving your password\n` +
      `• Never share your credentials with anyone`;

    const response = await fetch("https://api.periskope.app/v1/message/send", {
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

    return response.ok;
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return false;
  }
}
