import { FatalErrorBoundary } from "./components/diagnostics/FatalErrorBoundary";
import { FatalErrorScreen } from "./components/diagnostics/FatalErrorScreen";
import { MainLayout } from "./components/layout/MainLayout";
import { I18nProvider } from "./lib/i18n";
import { GlobalErrorHandlers } from "./hooks/useGlobalErrorHandlers";
import { useDiagnosticsStore } from "./stores/diagnosticsStore";

export default function App() {
  return (
    <I18nProvider>
      <FatalErrorBoundary>
        <GlobalErrorHandlers />
        <FatalErrorOverlay />
        <MainLayout />
      </FatalErrorBoundary>
    </I18nProvider>
  );
}

function FatalErrorOverlay() {
  const fatalError = useDiagnosticsStore((state) => state.fatalError);

  if (!fatalError) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <FatalErrorScreen />
    </div>
  );
}
