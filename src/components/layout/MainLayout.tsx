import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { TopNavBar } from "./TopNavBar";
import { SideNavBar } from "./SideNavBar";
import { UpdateNotification } from "./UpdateNotification";
import { useProjectStore } from "../../stores/projectStore";
import { EmptyState } from "../import/EmptyState";
import { ProcessingView } from "../processing/ProcessingView";
import { EditorView } from "../editor/EditorView";
import { ExportModal } from "../export/ExportModal";
import { SettingsPanel } from "../editor/SettingsPanel";
import { isDesktopRuntime } from "../../lib/runtime";
import { getMediaServerPort } from "../../services/tauriCommands";
import { useAutoSave } from "../../hooks/useAutoSave";
import type { ProcessingProgress } from "../../types";

export function MainLayout() {
  const { currentView, showExportModal, activeSideTab, setProgress, setMediaServerPort } =
    useProjectStore();

  useAutoSave();

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    // Fetch the local HTTP media server port on startup
    void getMediaServerPort().then((port) => {
      setMediaServerPort(port);
    });
  }, [setMediaServerPort]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<ProcessingProgress>("processing-progress", (event) => {
      setProgress(event.payload);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setProgress]);

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
          {(currentView === "detection" || currentView === "editor") && <EditorView />}
        </main>
      </div>
      {showExportModal && <ExportModal />}
      <UpdateNotification />
    </div>
  );
}
