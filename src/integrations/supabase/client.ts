// This file is configured to use the independent Supabase project
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Independent Supabase project: ydswesigiavvgllqrbze
const SUPABASE_URL = "https://ydswesigiavvgllqrbze.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc3dlc2lnaWF2dmdsbHFyYnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjA1NzUsImV4cCI6MjA4MzE5NjU3NX0.onumG_DlX_Ud4eBWsnqhhX-ZPhrfmYXBA5tNftSJD84";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
