// This file is auto-configured by Lovable Cloud
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Lovable Cloud project - hardcoded to ensure JWT compatibility with edge functions
const SUPABASE_URL = "https://nhfghwwpnqoayhsitqmp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmdod3dwbnFvYXloc2l0cW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDExNTEsImV4cCI6MjA4MzExNzE1MX0.QMq4tpsNiKxX5lT4eyfMrNT6OtnPsm_CouOowDA5m1g";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
