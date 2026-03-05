import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { queryClient } from "./lib/queryClient";

// CRITICAL: Clear all cached query data on every full page load / refresh.
// This prevents stale data from a different tenant/branch from flashing
// before the auth context resolves the current user's identity.
queryClient.clear();

// Auto-reload on stale chunk errors (after deploys)
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
