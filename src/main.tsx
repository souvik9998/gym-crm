import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { guardStaleSession } from "./lib/sessionGuard";

// Synchronous check — clears obviously stale sessions from localStorage
// so the Supabase client doesn't enter an infinite refresh loop.
// No network calls, no fetch interception.
guardStaleSession();

createRoot(document.getElementById("root")!).render(<App />);
