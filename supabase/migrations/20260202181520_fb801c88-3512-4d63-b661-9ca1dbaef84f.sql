-- =====================================================
-- MULTI-TENANT SAAS ARCHITECTURE - PHASE 1A
-- Extend app_role enum with new values
-- =====================================================

-- Add new enum values (these must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tenant_admin';