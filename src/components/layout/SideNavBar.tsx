import { Icon } from "../ui/Icon";

interface SideNavItem {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const navItems: SideNavItem[] = [
  { icon: "video_library", label: "Media\nLibrary", active: true },
  { icon: "folder_open", label: "Project\nFiles" },
  { icon: "settings", label: "Settings" },
];

export function SideNavBar() {
  return (
    <aside className="w-20 flex flex-col items-center py-6 bg-surface-container z-40">
      <div className="flex flex-col gap-8 items-center w-full">
        {navItems.map((item) => (
          <button
            key={item.icon}
            onClick={item.onClick}
            className={`w-full flex flex-col items-center gap-1 cursor-pointer py-3 transition-all ease-in-out duration-300 ${
              item.active
                ? "border-l-2 border-primary text-primary bg-surface-container-high"
                : "text-on-surface-variant opacity-60 hover:text-white hover:bg-surface-container-high"
            }`}
          >
            <Icon name={item.icon} className="text-2xl" filled={item.active} />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-center px-1 whitespace-pre-line">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
