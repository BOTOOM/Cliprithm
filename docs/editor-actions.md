# Cliprithm Editor Action Catalog

**Status:** Implemented synchronous editor action contract
**Action IDs:** English and stable

This catalog defines the synchronous editor-state actions shared by UI controls, keyboard shortcuts, timeline mutations, and MCP composition tools. Project lifecycle, media inspection, asynchronous analysis, preview, export, and job operations are MCP service operations because they require database or background-job I/O; they are defined in `docs/mcp-editor-spec.md` and `src/services/mcpBridge.ts`. Timeline state mutations must dispatch through the single editor action registry instead of mutating timeline state directly from components or the MCP bridge.

## Action definition

```ts
interface EditorActionDefinition<Input> {
  id: string;
  category: ActionCategory;
  labelKey: string;
  inputSchema: string;
  preconditions: string[];
  mutation: "project" | "selection" | "history";
  undoable: boolean;
  progress: "instant" | "background";
  mcp: "planned" | "internal";
}
```

The TypeScript registry is authoritative for runtime behavior. This document lists only actions that are entries in `EDITOR_ACTIONS`; MCP service operations are listed separately and must not be added to that registry unless they become synchronous state actions.

## Categories

- `media`: add or remove source assets;
- `selection`: choose clips, playhead positions, and timeline ranges;
- `edit`: mutate clips and track order;
- `timing`: change clip speed;
- `analysis`: accept validated analysis candidates;
- `annotation`: create, update, and delete semantic ranges;
- `history`: undo and redo timeline mutations.

## Registered synchronous actions

### Media

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `asset.addVideo` | video asset input | project loaded, supported video asset | yes | planned |
| `asset.remove` | asset ID | asset exists and has no clip or semantic-range references | yes | planned |

### Selection

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `selection.selectClip` | clip ID or null | clip exists when non-null | no | planned |
| `selection.setPlayhead` | timeline seconds | finite time inside the timeline | no | planned |
| `selection.selectRange` | start/end seconds | finite ordered range inside the timeline | no | planned |
| `selection.selectSemanticRange` | range ID or null | range exists when non-null | no | internal |

### Edit

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `clip.splitAtPlayhead` | clip ID, timeline time | clip exists and time is inside the clip | yes | planned |
| `clip.trim` | clip ID, source start/end | valid source interval | yes | planned |
| `clip.move` | clip ID, destination index | clip and primary track exist | yes | planned |
| `clip.duplicate` | clip ID | clip exists and project limits allow another clip | yes | planned |
| `clip.delete` | clip ID | clip exists and at least one primary clip remains | yes | planned |

### Timing

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `clip.setSpeed` | clip ID, speed `0.25..32` | clip exists and speed is within bounds | yes | planned |
| `clip.resetSpeed` | clip ID | clip exists | yes | planned |

### Analysis acceptance

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `analysis.acceptCandidate` | revision and clip silence candidates | candidate matches the current revision and every segment is bounded, ordered, and leaves content | yes | planned |

Accepted candidates create normal timeline history entries and can be undone.

### Annotation

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `semanticRange.add` | semantic range draft + absolute timeline start/end | valid absolute timeline interval, author, tags, title, and description | yes | planned |
| `semanticRange.update` | range ID and partial metadata/timeline updates | range exists and updated fields are valid | yes | planned |
| `semanticRange.delete` | range ID | range exists | yes | planned |

### History

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `history.undo` | none | timeline undo stack is non-empty | no | planned |
| `history.redo` | none | timeline redo stack is non-empty | no | planned |

Undo and redo restore composition state while assigning a new monotonic project revision so optimistic concurrency checks cannot accept mutations from a divergent history branch.

## MCP service operations

The following operations are implemented in the MCP service layer and are intentionally not entries in `EDITOR_ACTIONS`:

- project lifecycle: `project.createFromMedia`, `project.open`, `project.save`, `project.rename`, `project.delete`;
- media inspection: `asset.inspect`;
- analysis: `analysis.getSettings`, `analysis.updateSettings`, `analysis.detectSilence`, `analysis.getCandidate`, `analysis.discardCandidate`;
- preview and jobs: `preview.request`, `preview.requestWindow`, `preview.useSource`, `preview.useEdited`, `preview.cancel`, `job.get`, `job.cancel`;
- export: `export.validate`, `export.renderProject`, `export.cancel`.

Their public MCP names, schemas, result envelopes, and asynchronous behavior are defined in `docs/mcp-editor-spec.md` and `src/services/mcpBridge.ts`.

## Internal jobs

Internal jobs are implementation details and are not displayed as project actions or exposed through MCP:

- `internal.assetProxy.create`;
- `internal.sequencePreview.create`;
- `internal.previewWindow.create`;
- `internal.silenceAnalysis.create`;
- `internal.job.cancel`;
- `internal.cache.evict`.

Every internal job must include a source project revision and cache key. Results from stale revisions must never overwrite current preview state.

## MCP readiness rules

When an MCP service operation dispatches a synchronous composition mutation:

1. expose only actions marked `planned`;
2. validate composition inputs through the same action validation used by the UI;
3. return structured results with action ID, revision, affected IDs, and user-visible warnings;
4. never expose raw FFmpeg command strings as the public contract;
5. keep internal jobs opaque and report their status through typed action results;
6. require explicit confirmation for export and destructive-looking operations if the MCP policy requests it.
