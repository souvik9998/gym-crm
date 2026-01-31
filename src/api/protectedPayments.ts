/**
 * Protected Payments API
 * 
 * Fetches payment data through the protected-data edge function.
 * Requires authentication (admin or staff with can_access_payments permission).
 */

import { protectedFetch } from "./authenticatedFetch";

export interface PaymentWithDetails {
  id: string;
  amount: number;
  payment_mode: "online" | "cash";
  status: "pending" | "success" | "failed" | null;
  created_at: string;
  notes: string | null;
  payment_type: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  branch_id: string | null;
  member_id: string | null;
  subscription_id: string | null;
  daily_pass_user_id: string | null;
  daily_pass_subscription_id: string | null;
  member?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  dailyPassUser?: {
    id: string;
    name: string;
    phone: string;
  } | null;
}

/**
 * Fetch payments via protected endpoint
 */
export async function fetchProtectedPayments(
  branchId?: string,
  cursor: number = 0,
  limit: number = 25
): Promise<{ payments: PaymentWithDetails[] }> {
  const response = await protectedFetch<{ payments: PaymentWithDetails[] }>({
    action: "payments",
    params: { branchId, cursor, limit },
  });
  return response;
}
