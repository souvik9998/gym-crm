/**
 * Extract the server-side `error` field from a Supabase Functions invocation
 * error. The Functions client throws `FunctionsHttpError` for non-2xx
 * responses; the original response body is on `error.context`. Without this,
 * the user only sees "Edge function returned 500" which hides the friendly
 * message our edge functions return (e.g. weak/HIBP password rejection).
 */
export const extractEdgeFunctionError = async (
  error: unknown,
  fallback = "Something went wrong"
): Promise<string> => {
  if (!error) return fallback;
  // deno-lint-ignore no-explicit-any
  const err = error as any;
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.text === "function") {
      const bodyText = await ctx.text();
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          if (parsed?.error) return String(parsed.error);
          if (parsed?.message) return String(parsed.message);
        } catch {
          // body wasn't JSON — return raw text if it looks user-readable
          if (bodyText.length < 300) return bodyText;
        }
      }
    }
  } catch {
    // ignore — fall through to message
  }
  return err?.message || fallback;
};
