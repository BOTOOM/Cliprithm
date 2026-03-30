import { TopNavBar } from "./TopNavBar";
import { SideNavBar } from "./SideNavBar";
import { useProjectStore } from "../../stores/projectStore";
import { EmptyState } from "../import/EmptyState";
import { ProcessingView } from "../processing/ProcessingView";
import { EditorView } from "../editor/EditorView";
import { ExportModal } from "../export/ExportModal";

export function MainLayout() {
  const { currentView, showExportModal } = useProjectStore();

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar />
      <div className="flex flex-1 overflow-hidden">
        <SideNavBar />
        <main className="flex-1 bg-surface overflow-hidden">
          {currentView === "import" && <EmptyState />}
          {currentView === "processing" && <ProcessingView />}
          {currentView === "editor" && <EditorView />}
        </main>
      </div>
      {showExportModal && <ExportModal />}
    </div>
  );
}
