import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * AES-256-GCM Encryption/Decryption for Razorpay secrets
 * Uses Web Crypto API available in Deno runtime
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encrypt(
  plaintext: string,
  keyHex: string
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = hexToBytes(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
  };
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  keyHex: string
): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const ivBytes = hexToBytes(iv);
  const ciphertextBytes = hexToBytes(ciphertext);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    ciphertextBytes
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Look up Razorpay credentials for a branch's tenant.
 * Returns decrypted key_id and key_secret, or null if not configured/verified.
 */
export async function getGymRazorpayCredentials(
  serviceClient: ReturnType<typeof createClient>,
  branchId: string
): Promise<{ keyId: string; keySecret: string } | null> {
  // Get tenant_id from the branch
  const { data: branch, error: branchError } = await serviceClient
    .from("branches")
    .select("tenant_id")
    .eq("id", branchId)
    .single();

  if (branchError || !branch?.tenant_id) {
    console.error("Failed to resolve tenant from branch:", branchError);
    return null;
  }

  // Get credentials for this tenant
  const { data: creds, error: credsError } = await serviceClient
    .from("razorpay_credentials")
    .select("key_id, encrypted_key_secret, encryption_iv, is_verified")
    .eq("tenant_id", branch.tenant_id)
    .single();

  if (credsError || !creds) {
    // No per-gym credentials configured
    return null;
  }

  if (!creds.is_verified) {
    console.error("Razorpay credentials exist but are not verified for tenant:", branch.tenant_id);
    return null;
  }

  const encryptionKey = Deno.env.get("RAZORPAY_ENCRYPTION_KEY");
  if (!encryptionKey) {
    console.error("RAZORPAY_ENCRYPTION_KEY not configured");
    return null;
  }

  try {
    const keySecret = await decrypt(
      creds.encrypted_key_secret,
      creds.encryption_iv,
      encryptionKey
    );

    return {
      keyId: creds.key_id,
      keySecret,
    };
  } catch (err) {
    console.error("Failed to decrypt Razorpay credentials:", err);
    return null;
  }
}
