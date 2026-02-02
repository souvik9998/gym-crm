-- ============================================================================
-- MULTI-TENANT MIGRATION - PART 1: ENUM EXTENSION
-- Project: Gym QR Pro
-- Target: ydswesigiavvgllqrbze.supabase.co
-- 
-- RUN THIS FIRST, then run Part 2 in a separate query.
-- ============================================================================

-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tenant_admin';

-- ============================================================================
-- DONE! Now run multi-tenant-migration-part2.sql in a NEW query window.
-- ============================================================================
