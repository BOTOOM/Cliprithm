import { useProjectStore } from "../../stores/projectStore";
import { Button } from "../ui/Button";

export function TopNavBar() {
  const { currentView, setShowExportModal, filePath } = useProjectStore();

  const showEditorNav = currentView === "editor";
  const canExport = filePath !== null && currentView !== "import";

  return (
    <header className="w-full h-14 flex items-center justify-between px-6 bg-surface border-b border-surface-container-high z-50">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold tracking-tighter text-white">
          The Precision Darkroom
        </span>
        {showEditorNav && (
          <>
            <div className="h-4 w-px bg-outline-variant/30 ml-2" />
            <nav className="flex items-center gap-6">
              <span className="text-sm font-medium text-white">Editor</span>
              <span className="text-sm font-medium text-on-surface-variant hover:text-white cursor-pointer transition-colors">
                Library
              </span>
            </nav>
          </>
        )}
        {currentView === "processing" && (
          <>
            <div className="h-4 w-px bg-outline-variant/30 ml-2" />
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Processing Mode
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm">
          Import
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canExport}
          onClick={() => setShowExportModal(true)}
        >
          Export
        </Button>
      </div>
    </header>
  );
}
