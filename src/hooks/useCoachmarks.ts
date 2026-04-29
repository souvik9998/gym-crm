import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gymkloud:coachmarks:dismissed";

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

/**
 * Coachmark visibility hook — first-time only.
 * Each `id` is shown until the user dismisses it (or clicks the anchor).
 * Dismissals are persisted in localStorage so they don't reappear.
 */
export function useCoachmark(id: string) {
  const [dismissed, setDismissed] = useState<boolean>(true); // assume dismissed until hydrated

  useEffect(() => {
    setDismissed(readDismissed().has(id));
  }, [id]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    const set = readDismissed();
    set.add(id);
    writeDismissed(set);
  }, [id]);

  const reset = useCallback(() => {
    const set = readDismissed();
    set.delete(id);
    writeDismissed(set);
    setDismissed(false);
  }, [id]);

  return { visible: !dismissed, dismiss, reset };
}

/** Reset every coachmark — used by the "Replay tour" action in the Guide drawer. */
export function resetAllCoachmarks() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
