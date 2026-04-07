import { useEffect } from "react";
import { useDiagnosticsStore } from "../stores/diagnosticsStore";

export function useGlobalErrorHandlers(): void {
  const captureFatalError = useDiagnosticsStore((state) => state.captureFatalError);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      captureFatalError("window-error", event.error ?? event.message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureFatalError("unhandledrejection", event.reason);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [captureFatalError]);
}

export function GlobalErrorHandlers() {
  useGlobalErrorHandlers();
  return null;
}
