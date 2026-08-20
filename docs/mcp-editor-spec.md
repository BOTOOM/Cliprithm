# Cliprithm Editor MCP Specification

**Status:** Implemented
**Contract version:** `1.2.0`

## Scope

This contract exposes Cliprithm's video-editor operations through a local MCP server. It covers projects, video assets, selection, timeline editing, silence analysis, semantic ranges, history, previews, jobs, and export. Application updates, diagnostics, caption credentials, and language settings are outside this contract.

## Runtime

- Server: `cliprithm-mcp-server`, embedded in the Tauri process.
- Transport: Streamable HTTP at `http://127.0.0.1:<configured-port>/mcp`.
- Lifecycle: running only while Cliprithm is open; enabled by default.
- Configuration: `mcp.enabled` and `mcp.port` in `app_settings`.
- Security: loopback-only binding, Host/Origin validation, and a per-session bearer token. The token is shown only in the Cliprithm Settings panel and must be sent as `Authorization: Bearer <token>`.
- File access: source media paths may be outside the app directory for authenticated local imports and inspection. MCP preview/export outputs are restricted to the dedicated `<appDataDir>/mcp-outputs` directory. Render tools prefer a safe `fileName` basename and resolve it internally; absolute `outputPath` remains available only inside that directory for compatibility.
- Mutations: require the active project ID. Composition mutations require `expectedRevision`. Opening or creating a project while the active timeline has unsaved changes requires a short-lived confirmation token.

## Tools

Tools use the `cliprithm_` prefix and snake_case names. Every tool has a JSON input schema, a structured result-envelope output schema, a focused description, and MCP behavior annotations.

### Project and media tools

- `cliprithm_system_get_capabilities`
- `cliprithm_project_list`
- `cliprithm_project_get`
- `cliprithm_project_create_from_media`
- `cliprithm_project_open`
- `cliprithm_project_save`
- `cliprithm_project_rename`
- `cliprithm_project_delete`
- `cliprithm_asset_list`
- `cliprithm_asset_inspect`
- `cliprithm_asset_add_video`
- `cliprithm_asset_remove`

### Selection and timeline tools

- `cliprithm_selection_get`
- `cliprithm_selection_select_clip`
- `cliprithm_selection_select_range`
- `cliprithm_selection_set_playhead`
- `cliprithm_timeline_get`
- `cliprithm_clip_split`
- `cliprithm_clip_trim`
- `cliprithm_clip_move`
- `cliprithm_clip_duplicate`
- `cliprithm_clip_delete`
- `cliprithm_clip_set_speed`
- `cliprithm_clip_reset_speed`

### Silence, preview, jobs, and export tools

- `cliprithm_silence_get_settings`
- `cliprithm_silence_update_settings`
- `cliprithm_silence_detect`
- `cliprithm_silence_get_candidate`
- `cliprithm_silence_apply_candidate`
- `cliprithm_silence_discard_candidate`

Silence detection returns a candidate ID. Applying or discarding a candidate must include that exact ID so a result from an older or concurrent analysis cannot affect a newer candidate.

- `cliprithm_preview_request`
- `cliprithm_preview_request_window`
- `cliprithm_preview_use_source`
- `cliprithm_preview_use_edited`
- `cliprithm_job_get`
- `cliprithm_job_cancel`
- `cliprithm_preview_cancel`
- `cliprithm_export_validate`
- `cliprithm_export_render`
- `cliprithm_export_cancel`

### Export settings

`cliprithm_export_validate` and `cliprithm_export_render` accept the same optional export overrides as the desktop export panel. When an override is omitted, the active project export settings are used.

- `preset`: `tiktok`, `reels`, `youtube`, `square`, or `custom`.
- `resolution`: `1080p` or `4k` for preset canvases.
- `sizingMode`: `original`, `preset`, or `custom` when `preset` is `custom`.
- `creatorTarget`: `vertical-social`, `youtube-landscape`, `square-social`, `landscape-4k`, or `vertical-4k`.
- `width` and `height`: paired custom dimensions from 2 through 4096 pixels. Render dimensions are normalized down to even boundaries, and the effective normalized values are returned in `settings`.
- `resizeMode`: `original`, `fit`, `crop`, or `stretch`.
- `profile`: `fast`, `balanced`, or `quality`.
- `fps`: `30` or `60`.
- `playbackRate`: optional global clip-speed multiplier from `0.25` through `4`; individual clip speeds remain bounded by the editor's `0.25x`–`32x` limit.

For example:

```json
{
  "projectId": 14,
  "expectedRevision": 79,
  "fileName": "3dmodelsparte1.mp4",
  "preset": "custom",
  "sizingMode": "preset",
  "creatorTarget": "vertical-4k",
  "resizeMode": "fit",
  "profile": "balanced",
  "fps": 30
}
```

Preview and export renders return a job ID immediately. Use `job_get` for status and `job_cancel` to request cancellation. Jobs are bound to the active project and source revision; completed output from an older revision is never applied to the editor state. `preview_request_window` carries its timeline `start`/`end` metadata with the job and persists it with the edited preview, so the editor does not infer the playhead offset from the output filename. Export jobs have priority over previews: an export cancels an active preview for the same project and waits for its process to stop before rendering; if that preemption wait times out, the preview reservation remains until the old process actually finishes. Every render writes to a temporary sibling and atomically replaces the destination only after a successful render. Existing outputs are preserved on failure or cancellation, and a destination that appears after validation is never overwritten without the original overwrite authorization. Render tools accept either a safe `.mp4` `fileName` basename or a compatible absolute `outputPath`; the former is resolved inside the MCP output directory.

### Semantic range and history tools

- `cliprithm_semantic_range_list`
- `cliprithm_semantic_range_get`
- `cliprithm_semantic_range_create`
- `cliprithm_semantic_range_update`
- `cliprithm_semantic_range_delete`
- `cliprithm_history_undo`
- `cliprithm_history_redo`

## Semantic ranges

A semantic range is persisted inside `TimelineProject.schemaVersion = 3`:

```ts
interface SemanticRange {
  id: string;
  title: string;
  description: string;
  tags: string[];
  timelineStart: number | null;
  timelineEnd: number | null;
  sourceAnchors: Array<{
    assetId: string;
    sourceStart: number;
    sourceEnd: number;
  }>;
  createdBy: "user" | "ai";
  createdAt: string;
  updatedAt: string;
}
```

Timeline bounds are authoritative for the editor track. Source anchors are derived context for the content currently underneath those absolute seconds. A range remains fixed when clips move, split, or trim; its presence can become partial or not present without losing the user's description.

## Results and errors

Successful mutations return `actionId`, `projectId`, `revision`, `affectedIds`, `warnings`, and `data`. List tools return `items`, `totalCount`, `offset`, `count`, `hasMore`, and `nextOffset`.

Tool-level errors use structured results with an actionable `errorCode` and message. Common codes include:

- `PROJECT_NOT_ACTIVE`
- `PROJECT_NOT_FOUND`
- `REVISION_CONFLICT`
- `ACTION_PRECONDITION_FAILED`
- `CANDIDATE_STALE`
- `OUTPUT_EXISTS`
- `CONFIRMATION_REQUIRED`
- `INVALID_CONFIRMATION`
- `JOB_LIMIT`

## Critical confirmations

Deleting a saved project, overwriting an existing export, and switching away from an unsaved active project require two calls. The first returns a short-lived, action/parameter-bound confirmation token. The second must provide that token within 60 seconds. Tokens are one-use and are not authentication.

## Acceptance requirements

1. A default installation starts the server after the bridge catalog is registered.
2. Disabling MCP stops the endpoint and persists until re-enabled.
3. Requests without the per-session bearer token, invalid Host/Origin, payload, path, ID, range, and revision inputs cause no mutation.
4. UI and MCP composition tools use the same editor action validation and produce the same revisions; asynchronous MCP service operations use their own typed service validation.
5. Accepted silence candidates become undoable timeline edits.
6. Absolute range blocks survive split, move, speed, duplicate, trim, and silence application without changing their timeline bounds; source context is recomputed.
7. Export uses the active composition and reports the rendered revision.
8. Existing projects migrate from timeline schema v1/v2 to schema v3 without losing source ranges; visible legacy occurrences become independent absolute placements.
