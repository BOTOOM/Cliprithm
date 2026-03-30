import { TopNavBar } from "./TopNavBar";
import { SideNavBar } from "./SideNavBar";
import { UpdateNotification } from "./UpdateNotification";
import { useProjectStore } from "../../stores/projectStore";
import { EmptyState } from "../import/EmptyState";
import { ProcessingView } from "../processing/ProcessingView";
import { EditorView } from "../editor/EditorView";
import { ExportModal } from "../export/ExportModal";
import { SettingsPanel } from "../editor/SettingsPanel";

export function MainLayout() {
  const { currentView, showExportModal, activeSideTab } = useProjectStore();

  const showSettings = activeSideTab === "settings";

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar />
      <div className="flex flex-1 overflow-hidden">
        <SideNavBar />
        {showSettings ? (
          <aside className="w-80 border-r border-outline-variant/10 bg-surface-container-high">
            <SettingsPanel />
          </aside>
        ) : null}
        <main className="flex-1 bg-surface overflow-hidden">
          {currentView === "import" && <EmptyState />}
          {currentView === "processing" && <ProcessingView />}
          {currentView === "editor" && <EditorView />}
        </main>
      </div>
      {showExportModal && <ExportModal />}
      <UpdateNotification />
    </div>
  );
}
