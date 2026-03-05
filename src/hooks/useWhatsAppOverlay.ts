import { useState, useCallback, useRef } from "react";
import type { WhatsAppOverlayState } from "@/components/ui/whatsapp-sending-overlay";

export function useWhatsAppOverlay() {
  const [state, setState] = useState<WhatsAppOverlayState>("idle");
  const [recipientName, setRecipientName] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const lockRef = useRef(false);

  const startSending = useCallback((name?: string) => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setRecipientName(name);
    setErrorMessage(undefined);
    setState("sending");
    return true;
  }, []);

  const markSuccess = useCallback((name?: string) => {
    if (name) setRecipientName(name);
    setState("success");
  }, []);

  const markError = useCallback((msg?: string) => {
    setErrorMessage(msg);
    setState("error");
  }, []);

  const dismiss = useCallback(() => {
    setState("idle");
    setRecipientName(undefined);
    setErrorMessage(undefined);
    lockRef.current = false;
  }, []);

  return {
    overlayProps: { state, recipientName, errorMessage, onDismiss: dismiss },
    startSending,
    markSuccess,
    markError,
    dismiss,
    isBusy: state === "sending",
  };
}
