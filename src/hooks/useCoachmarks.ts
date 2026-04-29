import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gymkloud:coachmarks:dismissed";
const SKIP_ALL_KEY = "gymkloud:coachmarks:skipAll";
const FIRST_RUN_KEY = "gymkloud:onboarding:seen";

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore quota errors
  }
}

function readSkipAll(): boolean {
  try {
    return localStorage.getItem(SKIP_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Coachmark visibility hook — first-time only.
 * Each `id` is shown until the user dismisses it (or clicks the anchor),
 * unless they've globally skipped the tour.
 */
export function useCoachmark(id: string) {
  // Assume hidden until hydrated to avoid SSR/first-paint flash.
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [skippedAll, setSkippedAll] = useState<boolean>(true);

  useEffect(() => {
    setDismissed(readDismissed().has(id));
    setSkippedAll(readSkipAll());

    // React to "Replay tour" or skip-all from other components in same tab.
    const onChange = () => {
      setDismissed(readDismissed().has(id));
      setSkippedAll(readSkipAll());
    };
    window.addEventListener("gymkloud:coachmarks-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("gymkloud:coachmarks-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [id]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    const set = readDismissed();
    set.add(id);
    writeDismissed(set);
  }, [id]);

  const skipAll = useCallback(() => {
    try {
      localStorage.setItem(SKIP_ALL_KEY, "1");
    } catch {
      // ignore
    }
    setSkippedAll(true);
    window.dispatchEvent(new Event("gymkloud:coachmarks-changed"));
  }, []);

  const reset = useCallback(() => {
    const set = readDismissed();
    set.delete(id);
    writeDismissed(set);
    setDismissed(false);
  }, [id]);

  return { visible: !dismissed && !skippedAll, dismiss, skipAll, reset };
}

/** Reset every coachmark — used by the "Replay tour" action in the Guide drawer. */
export function resetAllCoachmarks() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SKIP_ALL_KEY);
    localStorage.removeItem(FIRST_RUN_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("gymkloud:coachmarks-changed"));
}

/** Mark all current coachmarks as skipped (one-click bail-out). */
export function skipAllCoachmarks() {
  try {
    localStorage.setItem(SKIP_ALL_KEY, "1");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("gymkloud:coachmarks-changed"));
}

/**
 * First-time visitor flag. Returns true ONLY on the very first session
 * and persists "seen" forever after `markFirstRunSeen()` is called.
 * Use to gate the auto-opening "Recommended Next Step" / welcome tour.
 */
export function isFirstTimeUser(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markFirstRunSeen() {
  try {
    localStorage.setItem(FIRST_RUN_KEY, "1");
  } catch {
    // ignore
  }
}
