import { createPortal } from "react-dom";
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface TooltipProps {
  content: ReactNode;
  /** "icon" shows a small info icon (default). "wrap" wraps children and shows tooltip on hover with no visible icon. */
  variant?: "icon" | "wrap";
  /** Hover delay in ms before the tooltip appears. */
  delay?: number;
  children?: ReactNode;
}

export function Tooltip({ content, variant = "icon", delay = 0, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const rect = targetRef.current?.getBoundingClientRect();
  const left = rect ? rect.left + rect.width / 2 : 0;
  const top = rect ? rect.bottom : 0;

  return (
    <span
      ref={targetRef}
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {variant === "icon" ? (
        <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full text-on-surface-variant/50 hover:text-on-surface transition-colors">
          <Icon name="info" className="text-[8px]" />
        </span>
      ) : (
        children
      )}
      {visible &&
        createPortal(
          <span
            className="fixed z-[9999] -translate-x-1/2 mt-2 w-56 rounded-lg border border-outline-variant/10 bg-surface-container-highest px-3 py-2 text-[11px] leading-relaxed text-on-surface-variant shadow-2xl"
            style={{ left, top }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}
