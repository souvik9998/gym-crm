import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Closes a Radix Popover/DropdownMenu (or any controlled overlay) when the
 * route changes. Prevents stuck/floating overlays when the user navigates
 * away while a dropdown is still open.
 */
export function useCloseOnRouteChange(
  open: boolean,
  setOpen: (next: boolean) => void,
) {
  const location = useLocation();
  useEffect(() => {
    if (open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
