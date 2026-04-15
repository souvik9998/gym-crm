
-- Add slug column to branches
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS slug TEXT;

-- Add slug column to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug TEXT;

-- Function to generate a slug from text
CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          trim(input_text),
          '[^a-zA-Z0-9\s-]', '', 'g'
        ),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$$;

-- Backfill existing branches with slugs
UPDATE public.branches
SET slug = public.generate_slug(name) || '-' || left(id::text, 6)
WHERE slug IS NULL;

-- Backfill existing events with slugs  
UPDATE public.events
SET slug = public.generate_slug(title) || '-' || left(id::text, 6)
WHERE slug IS NULL;

-- Make slug unique and not null
ALTER TABLE public.branches ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.branches ADD CONSTRAINT branches_slug_unique UNIQUE (slug);

ALTER TABLE public.events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.events ADD CONSTRAINT events_slug_unique UNIQUE (slug);

-- Trigger to auto-generate slug on insert for branches
CREATE OR REPLACE FUNCTION public.set_branch_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.name) || '-' || left(NEW.id::text, 6);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_branch_slug
  BEFORE INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_branch_slug();

-- Trigger to auto-generate slug on insert for events
CREATE OR REPLACE FUNCTION public.set_event_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.title) || '-' || left(NEW.id::text, 6);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_event_slug
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_slug();
