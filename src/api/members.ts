/**
 * Members API Layer
 * 
 * Authenticated member queries use protected edge functions.
 * Write operations use direct database queries (protected by RLS + auth context).
 * Phone check uses secure RPC function.
 */
import { supabase } from "@/lib/supabase";
import { 
  fetchProtectedMembersPaginated, 
  fetchProtectedMember,
  type MemberWithSubscription,
  type MemberDetails,
  type PaginatedMembersResponse 
} from "./protectedMembers";

// Re-export types
export type { MemberWithSubscription, MemberDetails, PaginatedMembersResponse };

/**
 * Fetch paginated members with their latest subscription and PT data
 * Routes through protected edge function for security
 */
export async function fetchMembersPaginated(
  branchId?: string,
  cursor: number = 0,
  limit: number = 25
): Promise<PaginatedMembersResponse> {
  return fetchProtectedMembersPaginated(branchId, cursor, limit);
}

/**
 * Fetch all members with their latest subscription and PT data
 * Routes through protected edge function - fetches all via pagination
 * @deprecated Use fetchMembersPaginated for better performance
 */
export async function fetchMembers(branchId?: string): Promise<MemberWithSubscription[]> {
  // Fetch via protected endpoint with large limit
  const result = await fetchProtectedMembersPaginated(branchId, 0, 1000);
  return result.members;
}

/**
 * Fetch a single member by ID via protected endpoint
 */
export async function fetchMemberById(memberId: string) {
  const result = await fetchProtectedMember(memberId);
  return result.member;
}

/**
 * Fetch member details via protected endpoint
 */
export async function fetchMemberDetails(memberId: string): Promise<MemberDetails | null> {
  const result = await fetchProtectedMember(memberId);
  return result.details;
}

/**
 * Create a new member (uses RLS - requires admin auth or staff permission)
 */
export async function createMember(member: {
  name: string;
  phone: string;
  email?: string | null;
  branch_id: string;
  join_date?: string;
}) {
  const { data, error } = await supabase
    .from("members")
    .insert(member)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a member (uses RLS - requires admin auth or staff permission)
 */
export async function updateMember(
  memberId: string,
  updates: Partial<{
    name: string;
    phone: string;
    email: string | null;
    join_date: string;
  }>
) {
  const { data, error } = await supabase
    .from("members")
    .update(updates)
    .eq("id", memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a member (uses RLS - requires admin auth)
 */
export async function deleteMember(memberId: string) {
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", memberId);

  if (error) throw error;
}

/**
 * Check if member exists by phone
 * Uses secure RPC function - safe for public use
 */
export async function checkMemberByPhone(phone: string, branchId: string) {
  // Use the secure RPC function that validates input
  const { data, error } = await supabase.rpc("check_phone_exists", {
    phone_number: phone,
    p_branch_id: branchId,
  });

  if (error) throw error;
  
  // The RPC returns an array, get first result
  const result = data?.[0];
  if (!result || !result.member_exists) {
    return null;
  }
  
  return {
    id: result.member_id,
    name: result.member_name,
  };
}
