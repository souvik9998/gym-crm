import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

export interface CreateOwnerBranchParams {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isDefault?: boolean;
}

/**
 * Gym owner branch creation.
 * Uses a backend function to enforce tenant limits and avoid client-side RLS write failures.
 */
export async function createBranchAsOwner(params: CreateOwnerBranchParams) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  const response = await fetch(
    `${getEdgeFunctionUrl("tenant-operations")}?action=owner-create-branch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: params.name,
        address: params.address,
        phone: params.phone,
        email: params.email,
        isDefault: params.isDefault,
      }),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.error || "Failed to create branch");
  }

  return result.data;
}
