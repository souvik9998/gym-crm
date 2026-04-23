import { lazy } from "react";

const RELOAD_KEY = "__chunk_retry_url";

const isChunkLoadError = (message?: string) =>
  !!message &&
  [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "error loading dynamically imported module",
  ].some((needle) => message.includes(needle));

const reloadWithCacheBust = () => {
  const currentUrl = window.location.href;
  const lastUrl = sessionStorage.getItem(RELOAD_KEY);

  if (lastUrl === currentUrl) {
    sessionStorage.removeItem(RELOAD_KEY);
    return;
  }

  sessionStorage.setItem(RELOAD_KEY, currentUrl);
  const url = new URL(currentUrl);
  url.searchParams.set("r", Date.now().toString());
  window.location.replace(url.toString());
};

export const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(
  importer: () => Promise<T>
) =>
  lazy(async () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
      return await importer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");

      if (isChunkLoadError(message)) {
        reloadWithCacheBust();
      }

      throw error;
    }
  });