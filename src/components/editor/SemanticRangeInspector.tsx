import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../lib/i18n";
import { useProjectStore } from "../../stores/projectStore";
import type { SemanticRange } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface SemanticRangeInspectorProps {
  range: SemanticRange | null;
  draft: { start: number; end: number } | null;
  onClose: () => void;
}

export function SemanticRangeInspector({ range, draft, onClose }: SemanticRangeInspectorProps) {
  const { t } = useI18n();
  const dispatchEditorAction = useProjectStore((state) => state.dispatchEditorAction);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(range?.title ?? "");
  const [description, setDescription] = useState(range?.description ?? "");
  const [tags, setTags] = useState(range?.tags.join(", ") ?? "");
  const start = range?.timelineStart ?? draft?.start ?? 0;
  const end = range?.timelineEnd ?? draft?.end ?? 0;
  const isEditing = Boolean(range);

  useEffect(() => {
    setTitle(range?.title ?? "");
    setDescription(range?.description ?? "");
    setTags(range?.tags.join(", ") ?? "");
    window.setTimeout(() => titleRef.current?.focus(), 0);
  }, [range, draft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!range && !draft) return null;

  const save = () => {
    const normalizedTags = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const saved = isEditing && range
      ? dispatchEditorAction({
          type: "semanticRange.update",
          rangeId: range.id,
          updates: { title: title.trim(), description: description.trim(), tags: normalizedTags },
        })
      : dispatchEditorAction({
          type: "semanticRange.add",
          range: {
            title: title.trim(),
            description: description.trim(),
            tags: normalizedTags,
            timelineStart: start,
            timelineEnd: end,
            createdBy: "user",
          },
        });
    if (saved) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-range-dialog-title"
        className="w-full max-w-md space-y-4 rounded-xl border border-outline-variant/20 bg-surface-container-highest p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="bookmark" className="text-base text-secondary" />
              <h2 id="semantic-range-dialog-title" className="text-sm font-bold text-on-surface">
                {isEditing ? t("editor.editSemanticRange") : t("editor.createSemanticRange")}
              </h2>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-on-surface-variant">
              {t("editor.semanticRangeModalDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.closeSemanticRange")}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="close" className="text-base" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container p-3 text-[10px]">
          <div>
            <span className="block uppercase tracking-widest text-on-surface-variant">{t("editor.rangeStart")}</span>
            <span className="font-mono text-on-surface">{start.toFixed(2)}s</span>
          </div>
          <div>
            <span className="block uppercase tracking-widest text-on-surface-variant">{t("editor.rangeEnd")}</span>
            <span className="font-mono text-on-surface">{end.toFixed(2)}s</span>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{t("editor.rangeTitle")}</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              className="w-full rounded-md bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{t("editor.rangeDescription")}</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4000}
              rows={5}
              className="w-full resize-y rounded-md bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{t("editor.rangeTags")}</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="w-full rounded-md bg-surface-container-lowest px-3 py-2 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
          {isEditing && range ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-error"
              onClick={() => {
                if (dispatchEditorAction({ type: "semanticRange.delete", rangeId: range.id })) onClose();
              }}
            >
              <Icon name="delete" className="text-sm" />
              {t("editor.deleteSemanticRange")}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t("editor.cancel")}</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={!title.trim() || !description.trim()}>
              {t("editor.saveSemanticRange")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
