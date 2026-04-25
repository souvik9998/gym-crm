/**
 * buildPublicUrl
 *
 * Builds a public-facing URL for share links (registration portal,
 * attendance check-in, event pages, invoices, etc.). When the tenant
 * has a verified custom domain configured, that domain is used so the
 * end customer always sees the gym's branded host. Otherwise it falls
 * back to the current app origin.
 *
 * Always pass an absolute path beginning with "/".
 */
export function buildPublicUrl(path: string, customHostname?: string | null): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (customHostname) {
    return `https://${customHostname}${normalized}`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`;
  }
  return normalized;
}
