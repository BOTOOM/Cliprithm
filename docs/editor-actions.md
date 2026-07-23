# Cliprithm Editor Action Catalog

**Status:** Draft for implementation
**Action IDs:** English and stable

This catalog is the contract between UI controls, keyboard shortcuts, project mutations, background jobs, and the future MCP adapter. Implementations must dispatch these actions through a single registry instead of mutating timeline state directly from components.

## Action definition

```ts
interface EditorActionDefinition<Input> {
  id: string;
  category: ActionCategory;
  labelKey: string;
  inputSchema: string;
  preconditions: string[];
  mutation: "project" | "selection" | "job" | "none";
  undoable: boolean;
  progress: "instant" | "background" | "blocking";
  mcp: "planned" | "internal" | "blocked";
  execute(input: Input): EditorActionResult;
}
```

The TypeScript registry is authoritative for runtime behavior. This document is the human-readable catalog and must stay synchronized with it.

## Categories

- `project`: create, open, save, and project metadata;
- `media`: add and inspect source assets;
- `selection`: choose clips and playhead ranges;
- `edit`: mutate clips and track order;
- `timing`: change trim and speed;
- `analysis`: detect and apply silence candidates;
- `preview`: request and cancel derived previews;
- `history`: undo and redo;
- `export`: render the project;
- `internal`: jobs that are not exposed to users or MCP.

## Project actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `project.createFromMedia` | source path and metadata | valid video source | no | planned |
| `project.open` | project ID | project exists | no | planned |
| `project.save` | none | project loaded | no | planned |
| `project.rename` | name | project loaded, non-empty name | yes | planned |

## Media actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `asset.addVideo` | path and metadata | project loaded, supported video | yes | planned |
| `asset.remove` | asset ID | asset has no required clip references | yes | planned |
| `asset.inspect` | asset ID | asset exists | no | planned |

## Selection actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `selection.selectClip` | clip ID or null | clip exists when non-null | no | planned |
| `selection.setPlayhead` | timeline seconds | project loaded | no | planned |
| `selection.selectRange` | start/end | valid timeline range | no | planned |

## Edit actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `clip.splitAtPlayhead` | clip ID, timeline time | playhead is inside clip | yes | planned |
| `clip.trim` | clip ID, new source start/end | valid source interval | yes | planned |
| `clip.move` | clip ID, destination index | primary track loaded | yes | planned |
| `clip.duplicate` | clip ID | clip exists | yes | planned |
| `clip.delete` | clip ID | clip exists | yes | planned |
| `clip.restore` | clip snapshot | valid snapshot | yes | internal |

## Timing actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `clip.setSpeed` | clip ID, speed `0.25..32` | clip exists and speed valid | yes | planned |
| `clip.resetSpeed` | clip ID | clip exists | yes | planned |

## Analysis actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `analysis.prepareSilence` | scope and settings | project loaded, eligible audio exists | no | planned |
| `analysis.detectSilence` | candidate request | no conflicting analysis job | no | planned |
| `analysis.updateSettings` | threshold/min duration | candidate open | no | planned |
| `analysis.acceptCandidate` | candidate ID | candidate matches current revision | yes | planned |
| `analysis.discardCandidate` | candidate ID | candidate exists | no | planned |

Accepted candidates must create normal edit actions so they appear in history and can be undone.

## Preview actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `preview.request` | revision and quality | project loaded | no | planned |
| `preview.requestWindow` | revision, center, duration | project loaded | no | planned |
| `preview.cancel` | job ID | job exists | no | internal |
| `preview.useSource` | none | source preview available | no | planned |
| `preview.useEdited` | none | current preview available or pending | no | planned |

Preview actions never change user project data.

## History actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `history.undo` | none | undo stack non-empty | no | planned |
| `history.redo` | none | redo stack non-empty | no | planned |
| `history.clear` | none | project loaded | no | internal |

## Export actions

| ID | Input | Preconditions | Undo | MCP |
|---|---|---|---|---|
| `export.validate` | export settings | project has exportable video | no | planned |
| `export.renderProject` | output path/settings | validation passes, engine available | no | planned |
| `export.cancel` | job ID | export job exists | no | planned |

## Internal actions and jobs

These are implementation details and are not displayed as projects or exposed through MCP:

- `internal.assetProxy.create`;
- `internal.sequencePreview.create`;
- `internal.previewWindow.create`;
- `internal.silenceAnalysis.create`;
- `internal.job.cancel`;
- `internal.cache.evict`.

Every internal job must include a source project revision and cache key. Results from stale revisions must never overwrite current preview state.

## MCP readiness rules

When an MCP server is implemented:

1. expose only actions marked `planned`;
2. validate inputs through the same schemas used by the UI;
3. return structured results with action ID, revision, affected IDs, and user-visible warnings;
4. never expose raw FFmpeg command strings as the public contract;
5. keep internal jobs opaque and report their status through typed action results;
6. require explicit confirmation for export and destructive-looking operations if the MCP policy requests it.
