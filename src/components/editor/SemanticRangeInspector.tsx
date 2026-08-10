import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import { sourceAnchorsFromTimelineSelection } from "../../lib/editor/semanticRanges";
import { useProjectStore } from "../../stores/projectStore";
import type { TimelineProject } from "../../types";
import { Button } from "../ui/Button";

interface SemanticRangeInspectorProps {
  project: TimelineProject;
  playhead: number;
}

export function SemanticRangeInspector({ project, playhead }: SemanticRangeInspectorProps) {
  const { t } = useI18n();
  const dispatchEditorAction = useProjectStore((state) => state.dispatchEditorAction);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");

  const createRange = () => {
    if (rangeStart === null) {
      setError(t("editor.rangeSetStartFirst"));
      return;
    }
    const endPoint = rangeEnd ?? playhead;
    const start = Math.min(rangeStart, endPoint);
    const end = Math.max(rangeStart, endPoint);
    const sourceAnchors = sourceAnchorsFromTimelineSelection(project, start, end);
    if (!title.trim() || !description.trim() || sourceAnchors.length === 0) {
      setError(t("editor.rangeRequiredFields"));
      return;
    }
    const created = dispatchEditorAction({
      type: "semanticRange.add",
      range: {
        title: title.trim(),
        description: description.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sourceAnchors,
        createdBy: "user",
      },
    });
    if (!created) {
      setError(t("editor.rangeCreateFailed"));
      return;
    }
    setRangeStart(null);
    setRangeEnd(null);
    setTitle("");
    setDescription("");
    setTags("");
    setError("");
  };

  return (
    <div className="space-y-3 rounded-lg border border-outline-variant/10 bg-surface-container p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
            {t("editor.semanticRanges")}
          </h3>
          <p className="mt-1 text-[10px] text-on-surface-variant/70">
            {t("editor.semanticRangesDescription")}
          </p>
        </div>
        <span className="font-mono text-[10px] text-primary">{project.semanticRanges.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={rangeStart === null ? "surface" : "primary"}
          size="sm"
          onClick={() => {
            setRangeStart(playhead);
            setRangeEnd(null);
            useProjectStore.getState().setSelectedRange(null);
            setError("");
          }}
        >
          {rangeStart === null ? t("editor.setRangeStart") : `${t("editor.rangeStart")}: ${rangeStart.toFixed(2)}s`}
        </Button>
        <Button
          variant="surface"
          size="sm"
          onClick={() => {
            if (rangeStart === null) {
              setError(t("editor.rangeSetStartFirst"));
              return;
            }
            setRangeEnd(playhead);
            const start = Math.min(rangeStart, playhead);
            const end = Math.max(rangeStart, playhead);
            dispatchEditorAction({ type: "selection.selectRange", start, end });
            setError("");
          }}
        >
          {rangeEnd === null ? t("editor.setRangeEnd") : `${t("editor.rangeEnd")}: ${rangeEnd.toFixed(2)}s`}
        </Button>
      </div>

      {rangeStart !== null && (
        <div className="space-y-2 border-t border-outline-variant/10 pt-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("editor.rangeTitle")}
            className="w-full rounded-md bg-surface-container-lowest px-2 py-1.5 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("editor.rangeDescription")}
            rows={3}
            className="w-full resize-none rounded-md bg-surface-container-lowest px-2 py-1.5 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t("editor.rangeTags")}
            className="w-full rounded-md bg-surface-container-lowest px-2 py-1.5 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary"
          />
          <Button variant="primary" size="sm" onClick={createRange}>
            {t("editor.createRange")}
          </Button>
        </div>
      )}

      {error && <p className="text-[10px] text-error">{error}</p>}

      <div className="max-h-36 space-y-1 overflow-y-auto custom-scrollbar">
        {project.semanticRanges.map((range) => (
          <div key={range.id} className="flex items-start justify-between gap-2 rounded bg-surface-container-high p-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-on-surface">{range.title}</p>
              <p className="line-clamp-2 text-[10px] text-on-surface-variant">{range.description}</p>
            </div>
            <button
              type="button"
              aria-label={t("editor.deleteSemanticRange")}
              onClick={() => dispatchEditorAction({ type: "semanticRange.delete", rangeId: range.id })}
              className="shrink-0 rounded p-1 text-error/70 hover:bg-error/20"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
