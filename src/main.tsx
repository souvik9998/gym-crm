import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { queryClient } from "./lib/queryClient";

// CRITICAL: Clear all cached query data on every full page load / refresh.
// This prevents stale data from a different tenant/branch from flashing
// before the auth context resolves the current user's identity.
queryClient.clear();

// Auto-reload on stale chunk errors (after deploys)
const RELOAD_KEY = "__chunk_reload_at";
const isStaleChunkError = (msg?: string) =>
  !!msg &&
  (msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module"));

const reloadOnce = () => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  // Avoid reload loops: only reload if we haven't reloaded in the last 10s
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }
};

window.addEventListener("vite:preloadError", reloadOnce);

window.addEventListener("error", (e) => {
  if (isStaleChunkError(e.message)) reloadOnce();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message || String(e.reason || "");
  if (isStaleChunkError(msg)) reloadOnce();
});

createRoot(document.getElementById("root")!).render(<App />);
