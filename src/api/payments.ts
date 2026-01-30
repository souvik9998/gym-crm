/**
 * Payments API Layer
 * All Supabase queries for payments data
 */
import { supabase } from "@/lib/supabase";
import type { Database } from "@/integrations/supabase/types";

export type PaymentMode = Database["public"]["Enums"]["payment_mode"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export interface PaymentWithDetails {
  id: string;
  amount: number;
  payment_mode: PaymentMode;
  status: PaymentStatus | null;
  created_at: string | null;
  notes: string | null;
  payment_type: string | null;
  member_id: string | null;
  daily_pass_user_id: string | null;
  member: {
    name: string;
    phone: string;
  } | null;
  daily_pass_user: {
    name: string;
    phone: string;
  } | null;
}

/**
 * Fetch all payments with member details
 */
export async function fetchPayments(branchId?: string): Promise<PaymentWithDetails[]> {
  let query = supabase
    .from("payments")
    .select(`
      id,
      amount,
      payment_mode,
      status,
      created_at,
      notes,
      payment_type,
      member_id,
      daily_pass_user_id,
      member:members(name, phone),
      daily_pass_user:daily_pass_users(name, phone)
    `)
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as PaymentWithDetails[];
}

export interface PaginatedPaymentsResponse {
  data: PaymentWithDetails[];
  nextCursor: number | null;
  totalCount: number;
}

/**
 * Fetch payments with pagination (cursor-based using offset)
 */
export async function fetchPaymentsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25
): Promise<PaginatedPaymentsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0 };
  }

  // Get total count for the branch
  const { count, error: countError } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);

  if (countError) throw countError;

  // Fetch paginated data
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id,
      amount,
      payment_mode,
      status,
      created_at,
      notes,
      payment_type,
      member_id,
      daily_pass_user_id,
      member:members(name, phone),
      daily_pass_user:daily_pass_users(name, phone)
    `)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  if (error) throw error;

  const totalCount = count || 0;
  const fetchedData = (data || []) as PaymentWithDetails[];
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: fetchedData,
    nextCursor,
    totalCount,
  };
}

/**
 * Fetch a single payment by ID
 */
export async function fetchPaymentById(paymentId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      member:members(name, phone, email),
      daily_pass_user:daily_pass_users(name, phone, email)
    `)
    .eq("id", paymentId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new payment
 */
export async function createPayment(payment: {
  amount: number;
  payment_mode: PaymentMode;
  status?: PaymentStatus;
  member_id?: string | null;
  daily_pass_user_id?: string | null;
  subscription_id?: string | null;
  daily_pass_subscription_id?: string | null;
  branch_id?: string | null;
  payment_type?: string;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      ...payment,
      status: payment.status || "success",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a payment
 */
export async function updatePayment(
  paymentId: string,
  updates: Partial<{
    status: PaymentStatus;
    notes: string | null;
  }>
) {
  const { data, error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", paymentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get payments for a specific member
 */
export async function fetchMemberPayments(memberId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
