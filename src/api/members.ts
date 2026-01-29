/**
 * Members API Layer
 * All Supabase queries for members data
 */
import { supabase } from "@/lib/supabase";

export interface MemberWithSubscription {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  join_date: string | null;
  branch_id: string;
  subscription?: {
    id: string;
    status: string;
    end_date: string;
    start_date: string;
  };
  activePT?: {
    trainer_name: string;
    end_date: string;
  } | null;
}

export interface MemberDetails {
  id: string;
  member_id: string;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  photo_id_type: string | null;
  photo_id_number: string | null;
  personal_trainer_id: string | null;
}

/**
 * Fetch all members with their latest subscription and PT data
 */
export async function fetchMembers(branchId?: string): Promise<MemberWithSubscription[]> {
  let query = supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data: membersData, error: membersError } = await query;
  if (membersError) throw membersError;

  const today = new Date().toISOString().split("T")[0];

  // Get latest subscription and PT for each member
  const membersWithData = await Promise.all(
    (membersData || []).map(async (member) => {
      // Get subscription
      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("id, status, end_date, start_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;

      // Get active PT subscription
      const { data: ptData, error: ptError } = await supabase
        .from("pt_subscriptions")
        .select("end_date, personal_trainer:personal_trainers(name)")
        .eq("member_id", member.id)
        .eq("status", "active")
        .gte("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ptError) throw ptError;

      return {
        ...member,
        subscription: subData || undefined,
        activePT: ptData
          ? {
              trainer_name: (ptData.personal_trainer as any)?.name || "Unknown",
              end_date: ptData.end_date,
            }
          : null,
      };
    })
  );

  return membersWithData;
}

/**
 * Fetch a single member by ID
 */
export async function fetchMemberById(memberId: string) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch member details
 */
export async function fetchMemberDetails(memberId: string): Promise<MemberDetails | null> {
  const { data, error } = await supabase
    .from("member_details")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Create a new member
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
 * Update a member
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
 * Delete a member
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
 */
export async function checkMemberByPhone(phone: string, branchId: string) {
  const { data, error } = await supabase
    .from("members")
    .select("id, name")
    .eq("phone", phone)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
