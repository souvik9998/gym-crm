/**
 * Centralized Supabase client instance
 * Single source of truth for all Supabase connections
 */
export { supabase } from "@/integrations/supabase/client";

// Re-export types for convenience
export type { Database } from "@/integrations/supabase/types";
