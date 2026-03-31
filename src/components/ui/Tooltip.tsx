import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface TooltipProps {
  content: ReactNode;
}

export function Tooltip({ content }: TooltipProps) {
  return (
    <span className="relative inline-flex items-center group">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-on-surface-variant/80 hover:text-white transition-colors">
        <Icon name="info" className="text-sm" />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-outline-variant/10 bg-surface-container-highest px-3 py-2 text-[11px] leading-relaxed text-on-surface-variant shadow-2xl group-hover:block group-focus-within:block">
        {content}
      </span>
    </span>
  );
}
