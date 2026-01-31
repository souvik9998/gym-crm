/**
 * Protected Members API
 * 
 * Fetches member data through the protected-data edge function.
 * Requires authentication (admin or staff with permissions).
 */

import { protectedFetch } from "./authenticatedFetch";

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

export interface PaginatedMembersResponse {
  members: MemberWithSubscription[];
  nextCursor: number | null;
  totalCount: number;
}

/**
 * Fetch paginated members with subscriptions via protected endpoint
 */
export async function fetchProtectedMembersPaginated(
  branchId?: string,
  cursor: number = 0,
  limit: number = 25
): Promise<PaginatedMembersResponse> {
  const response = await protectedFetch<PaginatedMembersResponse>({
    action: "members",
    params: { branchId, cursor, limit },
  });
  return response;
}

/**
 * Fetch a single member with details via protected endpoint
 */
export async function fetchProtectedMember(memberId: string): Promise<{
  member: MemberWithSubscription;
  details: MemberDetails | null;
}> {
  const response = await protectedFetch<{
    member: MemberWithSubscription;
    details: MemberDetails | null;
  }>({
    action: "member",
    params: { memberId },
  });
  return response;
}

/**
 * Fetch daily pass users via protected endpoint
 */
export async function fetchProtectedDailyPassUsers(
  branchId?: string,
  cursor: number = 0,
  limit: number = 25
) {
  const response = await protectedFetch<{ users: any[] }>({
    action: "daily-pass-users",
    params: { branchId, cursor, limit },
  });
  return response.users;
}
