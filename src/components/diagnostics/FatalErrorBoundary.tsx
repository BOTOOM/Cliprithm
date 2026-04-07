import { Component, type ErrorInfo, type ReactNode } from "react";
import { FatalErrorScreen } from "./FatalErrorScreen";
import { createFatalErrorDetails, useDiagnosticsStore } from "../../stores/diagnosticsStore";
import type { FatalErrorDetails } from "../../types/diagnostics";

interface FatalErrorBoundaryProps {
  children: ReactNode;
}

interface FatalErrorBoundaryState {
  fatalError: FatalErrorDetails | null;
}

export class FatalErrorBoundary extends Component<
  FatalErrorBoundaryProps,
  FatalErrorBoundaryState
> {
  state: FatalErrorBoundaryState = {
    fatalError: null,
  };

  static getDerivedStateFromError(error: unknown): FatalErrorBoundaryState {
    return {
      fatalError: createFatalErrorDetails("render", error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const fatalError = createFatalErrorDetails("render", error, info.componentStack);
    this.setState({ fatalError });
    useDiagnosticsStore.getState().captureFatalError("render", error, info.componentStack);
  }

  render() {
    if (this.state.fatalError) {
      return <FatalErrorScreen fallbackError={this.state.fatalError} />;
    }

    return this.props.children;
  }
}
