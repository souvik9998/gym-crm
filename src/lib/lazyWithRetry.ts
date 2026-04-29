import { lazy } from "react";

const RELOAD_KEY = "__chunk_retry_ts";
const RELOAD_WINDOW_MS = 10_000;

const isChunkLoadError = (message?: string) =>
  !!message &&
  [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "error loading dynamically imported module",
    "Unable to preload CSS",
  ].some((needle) => message.includes(needle));

const reloadWithCacheBust = () => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  const now = Date.now();

  // Prevent reload loop: if we already reloaded within the last 10s, give up.
  if (last && now - last < RELOAD_WINDOW_MS) {
    return;
  }

  sessionStorage.setItem(RELOAD_KEY, String(now));
  const url = new URL(window.location.href);
  url.searchParams.set("r", String(now));
  window.location.replace(url.toString());
};

export const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(
  importer: () => Promise<T>
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");

      if (isChunkLoadError(message)) {
        reloadWithCacheBust();
        // Return a placeholder while the page reloads to avoid a blank screen + thrown error.
        return { default: (() => null) as unknown as React.ComponentType<any> } as T;
      }

      throw error;
    }
  });
