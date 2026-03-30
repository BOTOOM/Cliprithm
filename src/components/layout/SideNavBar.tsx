import { Icon } from "../ui/Icon";
import { useProjectStore } from "../../stores/projectStore";

type SideTab = "media" | "files" | "settings";

interface SideNavItem {
  id: SideTab;
  icon: string;
  label: string;
}

const navItems: SideNavItem[] = [
  { id: "media", icon: "video_library", label: "Media\nLibrary" },
  { id: "files", icon: "folder_open", label: "Project\nFiles" },
  { id: "settings", icon: "settings", label: "Settings" },
];

export function SideNavBar() {
  const { activeSideTab, setActiveSideTab } = useProjectStore();

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
    </aside>
  );
}
