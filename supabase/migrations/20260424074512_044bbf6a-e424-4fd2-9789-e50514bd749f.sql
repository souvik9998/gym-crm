-- Add draft support to member_assessments
ALTER TABLE public.member_assessments
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_member_assessments_member_draft
  ON public.member_assessments (member_id, is_draft);