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
  event_registration?: {
    name: string;
    phone: string;
    event_name: string;
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
      daily_pass_user:daily_pass_users(name, phone),
      event_registrations(name, phone, event:events(title))
    `)
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((p: any) => {
    const er = p.event_registrations?.[0];
    return {
      ...p,
      event_registrations: undefined,
      event_registration: er ? {
        name: er.name,
        phone: er.phone,
        event_name: er.event?.title || "Event",
      } : null,
    };
  }) as PaymentWithDetails[];
}

export interface PaginatedPaymentsResponse {
  data: PaymentWithDetails[];
  nextCursor: number | null;
  totalCount: number;
  totalAmount: number;
}

/**
 * Fetch payments with pagination (cursor-based using offset).
 * `totalAmount` is computed across ALL payments for the branch (not just
 * the current page) so the UI can display a true grand total that does
 * not change as the user scrolls / loads more pages.
 */
export async function fetchPaymentsPaginated(
  branchId: string | undefined,
  cursor: number = 0,
  limit: number = 25
): Promise<PaginatedPaymentsResponse> {
  if (!branchId) {
    return { data: [], nextCursor: null, totalCount: 0, totalAmount: 0 };
  }

  // Get total count + total amount in parallel with the page fetch.
  // The aggregate query is cheap (server-side sum), so it's safe to run on
  // every page request — TanStack Query also caches it via the queryKey.
  const countPromise = supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branchId);

  // Pull just the amount column for branch — Postgres returns it quickly and
  // we sum on the client. Keeps logic simple while still being independent of
  // pagination. (For very large datasets, replace with an RPC that runs SUM().)
  const amountsPromise = supabase
    .from("payments")
    .select("amount")
    .eq("branch_id", branchId);

  const pagePromise = supabase
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
      daily_pass_user:daily_pass_users(name, phone),
      event_registrations(name, phone, event:events(title))
    `)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1);

  const [{ count, error: countError }, { data: amountRows, error: amountError }, { data, error }] =
    await Promise.all([countPromise, amountsPromise, pagePromise]);

  if (countError) throw countError;
  if (amountError) throw amountError;
  if (error) throw error;

  const totalCount = count || 0;
  const totalAmount = (amountRows || []).reduce(
    (sum: number, row: { amount: number | string | null }) => sum + Number(row?.amount || 0),
    0,
  );

  const fetchedData = (data || []).map((p: any) => {
    const er = p.event_registrations?.[0];
    return {
      ...p,
      event_registrations: undefined,
      event_registration: er ? {
        name: er.name,
        phone: er.phone,
        event_name: er.event?.title || "Event",
      } : null,
    };
  }) as PaymentWithDetails[];
  const nextCursor = cursor + limit < totalCount ? cursor + limit : null;

  return {
    data: fetchedData,
    nextCursor,
    totalCount,
    totalAmount,
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
