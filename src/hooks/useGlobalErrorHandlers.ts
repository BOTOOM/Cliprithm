import { useEffect } from "react";
import { log } from "../lib/logger";
import { useDiagnosticsStore } from "../stores/diagnosticsStore";

function isExpectedAbortError(reason: unknown): boolean {
  if (reason instanceof DOMException) {
    return reason.name === "AbortError";
  }

  if (reason instanceof Error) {
    return reason.name === "AbortError";
  }

  if (typeof reason === "object" && reason !== null) {
    const maybeReason = reason as { name?: unknown; message?: unknown };
    return (
      maybeReason.name === "AbortError" &&
      typeof maybeReason.message === "string" &&
      maybeReason.message.toLowerCase().includes("aborted")
    );
  }

  return false;
}

export function useGlobalErrorHandlers(): void {
  const captureFatalError = useDiagnosticsStore((state) => state.captureFatalError);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      captureFatalError("window-error", event.error ?? event.message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isExpectedAbortError(event.reason)) {
        log.warn(
          "[fatal]",
          "Ignoring expected AbortError from an interrupted async operation",
          event.reason
        );
        event.preventDefault();
        return;
      }

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
