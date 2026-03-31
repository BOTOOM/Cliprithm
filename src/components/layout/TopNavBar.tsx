import { useProjectStore } from "../../stores/projectStore";
import { isDesktopRuntime } from "../../lib/runtime";
import { useI18n } from "../../lib/i18n";
import { Button } from "../ui/Button";

export function TopNavBar() {
  const { t } = useI18n();
  const { currentView, setShowExportModal, filePath, clipSegments, setView } =
    useProjectStore();

  const showEditorNav = currentView === "editor";
  const showDetectionNav = currentView === "detection";
  const canExport =
    isDesktopRuntime() &&
    currentView === "editor" &&
    filePath !== null &&
    clipSegments.length > 0;

  return (
    <header className="w-full h-14 flex items-center justify-between px-6 bg-surface border-b border-surface-container-high z-50">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold tracking-tighter text-white">
          {t("app.brand")}
        </span>
        {showEditorNav && (
          <>
            <div className="h-4 w-px bg-outline-variant/30 ml-2" />
            <nav className="flex items-center gap-6">
              <span className="text-sm font-medium text-white">{t("app.editor")}</span>
              <button
                className="text-sm font-medium text-on-surface-variant hover:text-white transition-colors"
                onClick={() => setView("import")}
              >
                {t("app.library")}
              </button>
            </nav>
          </>
        )}
        {showDetectionNav && (
          <>
            <div className="h-4 w-px bg-outline-variant/30 ml-2" />
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("app.detectionReview")}
            </span>
          </>
        )}
        {currentView === "processing" && (
          <>
            <div className="h-4 w-px bg-outline-variant/30 ml-2" />
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("app.processingMode")}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setView("import")}>
          {t("app.import")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canExport}
          onClick={() => setShowExportModal(true)}
        >
          {t("app.export")}
        </Button>
      </div>
    </header>
  );
}
