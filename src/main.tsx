import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { guardStaleSession, installRefreshFailureGuard } from "./lib/sessionGuard";

// Install runtime refresh failure guard immediately (intercepts fetch)
installRefreshFailureGuard();

// Guard stale sessions before rendering, then mount the app
guardStaleSession()
  .catch((err) => console.error("[Session Guard] Startup error:", err))
  .finally(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
