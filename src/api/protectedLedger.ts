/**
 * Protected Ledger API
 * 
 * Fetches ledger data through the protected-data edge function.
 * Requires authentication (admin or staff with can_access_ledger permission).
 */

import { protectedFetch } from "./authenticatedFetch";

export interface LedgerEntry {
  id: string;
  entry_type: "income" | "expense";
  category: string;
  amount: number;
  description: string;
  notes: string | null;
  entry_date: string;
  is_auto_generated: boolean;
  member_id: string | null;
  daily_pass_user_id: string | null;
  payment_id: string | null;
  trainer_id: string | null;
  pt_subscription_id: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch ledger entries via protected endpoint
 */
export async function fetchProtectedLedger(
  branchId?: string,
  cursor: number = 0,
  limit: number = 50
): Promise<{ entries: LedgerEntry[] }> {
  const response = await protectedFetch<{ entries: LedgerEntry[] }>({
    action: "ledger",
    params: { branchId, cursor, limit },
  });
  return response;
}
