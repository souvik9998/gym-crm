/**
 * Slug Resolver
 * Resolves human-readable slugs to UUIDs for branches and events.
 * Falls back to treating the param as a UUID for backward compatibility.
 */

import { supabase } from "@/integrations/supabase/client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Resolve a branch identifier (slug or UUID) to its full info.
 * Returns { id, slug, name, logo_url } or null.
 */
export async function resolveBranch(identifier: string): Promise<{
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
} | null> {
  const column = isUUID(identifier) ? "id" : "slug";

  const { data, error } = await supabase
    .from("branches")
    .select("id, slug, name, logo_url")
    .eq(column, identifier)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/**
 * Resolve an event identifier (slug or UUID) to its ID.
 * Returns the UUID event ID or null.
 */
export async function resolveEventId(identifier: string): Promise<string | null> {
  if (isUUID(identifier)) return identifier;

  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("slug", identifier)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
