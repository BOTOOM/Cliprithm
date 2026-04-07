import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";
import { useProjectStore } from "../../stores/projectStore";

type SideTab = "media" | "files" | "settings" | "diagnostics" | "about";

interface SideNavItem {
  id: SideTab;
  icon: string;
  label: string;
}

export function SideNavBar() {
  const { language, setLanguage, t } = useI18n();
  const { activeSideTab, setActiveSideTab } = useProjectStore();
  const navItems: SideNavItem[] = [
    { id: "media", icon: "video_library", label: t("app.mediaLibrary") },
    { id: "files", icon: "folder_open", label: t("app.projectFiles") },
    { id: "settings", icon: "settings", label: t("app.settings") },
    { id: "diagnostics", icon: "monitor_heart", label: t("app.diagnostics") },
  ];

  return (
    <aside className="w-20 flex flex-col items-center py-6 bg-surface-container z-40">
      <div className="flex flex-col gap-8 items-center w-full">
        {navItems.map((item) => {
          const isActive = activeSideTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSideTab(item.id)}
              className={`w-full flex flex-col items-center gap-1 cursor-pointer py-3 transition-all ease-in-out duration-300 ${
                isActive
                  ? "border-l-2 border-primary text-primary bg-surface-container-high"
                  : "text-on-surface-variant opacity-60 hover:text-white hover:bg-surface-container-high"
              }`}
            >
              <Icon name={item.icon} className="text-2xl" filled={isActive} />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-center px-1 whitespace-pre-line">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto w-full px-2 pt-6 space-y-3">
        {/* About button */}
        <button
          onClick={() => setActiveSideTab("about")}
          className={`w-full flex flex-col items-center gap-1 cursor-pointer py-2 rounded-lg transition-all ease-in-out duration-300 ${
            activeSideTab === "about"
              ? "text-primary bg-surface-container-high"
              : "text-on-surface-variant opacity-60 hover:text-white hover:bg-surface-container-high"
          }`}
        >
          <Icon name="info" className="text-xl" filled={activeSideTab === "about"} />
          <span className="text-[8px] font-semibold uppercase tracking-widest">
            {t("about.title")}
          </span>
        </button>

        <div className="rounded-xl bg-surface-container-high p-2 border border-outline-variant/10">
          <div className="text-[8px] uppercase tracking-widest text-center text-on-surface-variant mb-2">
            {t("app.language")}
          </div>
          <div className="grid gap-1">
            {(["en", "es"] as const).map((option) => {
              const isActive = language === option;
              return (
                <button
                  key={option}
                  onClick={() => setLanguage(option)}
                  className={`text-[10px] font-semibold rounded-md py-1.5 transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container-highest hover:text-white"
                  }`}
                >
                  {option === "en" ? t("app.english") : t("app.spanish")}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
