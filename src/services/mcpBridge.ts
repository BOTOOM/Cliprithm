import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { exists, remove } from "@tauri-apps/plugin-fs";
import {
  createProject,
  deleteProject,
  getAllProjects,
  getProjectById,
  updateProject,
} from "./database";
import {
  getSemanticRangeContext,
  getSemanticRangeContexts,
} from "../lib/editor/semanticRanges";
import {
  getAsset,
  getPositionedClips,
  getTimelineDuration,
  migrateLegacyProject,
  migrateTimelineProject,
} from "../lib/editor/timeline";
import { useProjectStore } from "../stores/projectStore";
import { buildClipSegmentsFromSilence } from "../lib/editor";
import {
  hasEditedPreviewAvailable,
  persistedPreviewMode,
  previewWindowFromPath,
} from "../lib/editor/preview";
import { log } from "../lib/logger";
import {
  cancelProjectRender,
  detectSilence,
  exportProject,
  generateProjectPreview,
  getVideoMetadata,
  replaceMcpOutput,
} from "./tauriCommands";
import type {
  AppView,
  DetectionSettings,
  ExportProfile,
  ExportResizeMode,
  ExportSettings,
  ExportSizingMode,
  SemanticRange,
  SilenceDetectionCandidate,
  PreviewJobState,
  PreviewWindow,
  ProcessingProgress,
  SilenceSegment,
  TimelineProject,
  VideoMetadata,
} from "../types";
import type { ProjectRecord } from "./database";
import type { EditorAction } from "../lib/editor/actions";

type JsonSchemaNode = Record<string, unknown>;

interface JsonSchema extends JsonSchemaNode {
  type: "object";
  properties: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesJsonSchemaType(value: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    switch (candidate) {
      case "null":
        return value === null;
      case "object":
        return isRecord(value);
      case "array":
        return Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
      case "boolean":
        return typeof value === "boolean";
      default:
        return false;
    }
  });
}

function validateJsonSchemaNode(value: unknown, node: JsonSchemaNode): boolean {
  if (node.type !== undefined && !matchesJsonSchemaType(value, node.type)) return false;

  if (Array.isArray(node.enum) && !node.enum.some((candidate) => Object.is(candidate, value))) {
    return false;
  }

  if (typeof value === "string") {
    if (typeof node.minLength === "number" && value.length < node.minLength) return false;
    if (typeof node.maxLength === "number" && value.length > node.maxLength) return false;
  }
  if (typeof value === "number") {
    if (typeof node.minimum === "number" && value < node.minimum) return false;
    if (typeof node.maximum === "number" && value > node.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) return false;
    if (typeof node.maxItems === "number" && value.length > node.maxItems) return false;
    if (node.items !== undefined) {
      if (!isRecord(node.items) || !value.every((item) => validateJsonSchemaNode(item, node.items as JsonSchemaNode))) {
        return false;
      }
    }
  }

  if (isRecord(value)) {
    const properties = node.properties === undefined
      ? {}
      : isRecord(node.properties)
        ? node.properties as Record<string, JsonSchemaNode>
        : null;
    if (properties === null) return false;
    const required = Array.isArray(node.required)
      && node.required.every((key) => typeof key === "string")
      ? node.required as string[]
      : [];
    if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (node.additionalProperties === false) {
      const unknownKeys = Object.keys(value).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
      if (unknownKeys.length > 0) return false;
    }
    for (const [key, property] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !validateJsonSchemaNode(value[key], property)) {
        return false;
      }
    }
  }

  return true;
}

export function validateMcpToolArguments(
  name: string,
  args: unknown,
): { valid: true } | { valid: false; message: string } {
  const definition = MCP_TOOL_CATALOG.find((candidate) => candidate.name === name || candidate.name === `cliprithm_${name}`);
  if (!definition) return { valid: false, message: `Tool '${name}' is not registered.` };
  if (!validateJsonSchemaNode(args, definition.inputSchema)) {
    return { valid: false, message: `Arguments for '${definition.name}' do not match its input schema.` };
  }
  return { valid: true };
}

export interface McpToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: Record<string, unknown>;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpRequest {
  requestId: string;
  kind: "tool";
  name: string;
  arguments: Record<string, unknown>;
}

const stringProperty = (description: string) => ({ type: "string", description });
const numberProperty = (description: string) => ({ type: "number", description });
const integerProperty = (description: string) => ({ type: "integer", description });
const semanticRangeUpdateSchema: JsonSchemaNode = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: "string", minLength: 1, maxLength: 4_000 },
    tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 64 }, maxItems: 20 },
    timelineStart: { type: "number", minimum: 0 },
    timelineEnd: { type: "number", minimum: 0 },
  },
  additionalProperties: false,
};
const rangeProperties = {
  projectId: integerProperty("Active project database ID."),
  expectedRevision: integerProperty("Current timeline revision returned by a read."),
};

const exportOverrideProperties: Record<string, JsonSchemaNode> = {
  preset: {
    type: "string",
    enum: ["tiktok", "reels", "youtube", "square", "custom"],
    description: "UI export preset. Custom enables sizingMode and explicit dimensions.",
  },
  resolution: {
    type: "string",
    enum: ["1080p", "4k"],
    description: "Preset resolution. It controls preset dimensions and is retained in the resolved settings.",
  },
  sizingMode: {
    type: "string",
    enum: ["original", "preset", "custom"],
    description: "Custom target mode: source dimensions, creator target, or explicit width/height.",
  },
  creatorTarget: {
    type: "string",
    enum: ["vertical-social", "youtube-landscape", "square-social", "landscape-4k", "vertical-4k"],
    description: "Recommended creator canvas from the export UI.",
  },
  width: {
    type: "integer",
    minimum: 2,
    maximum: 4096,
    description: "Custom output width in pixels. Provide width and height together.",
  },
  height: {
    type: "integer",
    minimum: 2,
    maximum: 4096,
    description: "Custom output height in pixels. Provide width and height together.",
  },
  resizeMode: {
    type: "string",
    enum: ["original", "fit", "crop", "stretch"],
    description: "How the source fits the target canvas.",
  },
  profile: {
    type: "string",
    enum: ["fast", "balanced", "quality"],
    description: "Export speed/quality profile from the UI.",
  },
  fps: {
    type: "integer",
    enum: [30, 60],
    description: "Output frame rate from the UI.",
  },
  playbackRate: {
    type: "number",
    minimum: 0.25,
    maximum: 4,
    description: "Optional global speed multiplier applied to the active clips for this export.",
  },
};

function schema(
  properties: Record<string, Record<string, unknown>>,
  required: string[] = []
): JsonSchema {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

const resultOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    actionId: { type: "string" },
    projectId: { type: ["integer", "null"] },
    revision: { type: ["integer", "null"] },
    affectedIds: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    data: {},
    errorCode: { type: "string" },
    message: { type: "string" },
    retryable: { type: "boolean" },
  },
  required: ["ok"],
  additionalProperties: true,
};

function tool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  options: Partial<Pick<McpToolDefinition, "title" | "outputSchema" | "readOnlyHint" | "destructiveHint" | "idempotentHint" | "openWorldHint">> = {}
): McpToolDefinition {
  return {
    name: `cliprithm_${name}`,
    title: options.title ?? name,
    description,
    inputSchema,
    outputSchema: options.outputSchema ?? resultOutputSchema,
    readOnlyHint: options.readOnlyHint ?? true,
    destructiveHint: options.destructiveHint ?? false,
    idempotentHint: options.idempotentHint ?? true,
    openWorldHint: options.openWorldHint ?? false,
  };
}

export const MCP_TOOL_CATALOG: McpToolDefinition[] = [
  tool(
    "system_get_capabilities",
    "Return the Cliprithm MCP contract version, active project, revision, limits, and available editor capabilities.",
    schema({}),
  ),
  tool(
    "project_list",
    "List saved video projects with pagination metadata.",
    schema({ offset: integerProperty("Number of projects to skip."), limit: integerProperty("Maximum projects to return.") }),
  ),
  tool(
    "project_get",
    "Read a saved project record by database ID, including persisted editor state.",
    schema({ projectId: integerProperty("Project database ID.") }, ["projectId"]),
  ),
  tool(
    "project_create_from_media",
    "Create a project from a local video path, inspect its metadata, and open it in the editor.",
    schema({
      filePath: stringProperty("Absolute local video path."),
      name: stringProperty("Optional project name."),
      confirmationToken: stringProperty("Confirmation token when the active project has unsaved changes."),
    }, ["filePath"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "project_open",
    "Open a saved project in Cliprithm so subsequent editor tools operate on it.",
    schema({
      projectId: integerProperty("Project database ID."),
      confirmationToken: stringProperty("Confirmation token when the active project has unsaved changes."),
    }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "project_save",
    "Flush the active project state to SQLite.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "project_rename",
    "Rename a saved project without changing its video composition.",
    schema({ projectId: rangeProperties.projectId, name: stringProperty("New non-empty project name.") }, ["projectId", "name"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "project_delete",
    "Delete a saved project record and generated derivatives. Requires confirmation for irreversible deletion.",
    schema({ projectId: integerProperty("Project database ID."), confirmationToken: stringProperty("Confirmation token from the first delete request.") }, ["projectId"]),
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  ),
  tool(
    "asset_list",
    "List assets in the active timeline project.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
  ),
  tool(
    "asset_inspect",
    "Read metadata and source information for one active project asset.",
    schema({ projectId: rangeProperties.projectId, assetId: stringProperty("Asset ID.") }, ["projectId", "assetId"]),
  ),
  tool(
    "asset_add_video",
    "Inspect and add a local video asset to the active timeline.",
    schema({ ...rangeProperties, filePath: stringProperty("Absolute local video path.") }, ["projectId", "expectedRevision", "filePath"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "asset_remove",
    "Remove an unreferenced asset from the active project. Source files are not deleted.",
    schema({ ...rangeProperties, assetId: stringProperty("Asset ID.") }, ["projectId", "expectedRevision", "assetId"]),
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  ),
  tool(
    "selection_get",
    "Read the active project selection, playhead, timeline duration, and current revision.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
  ),
  tool(
    "timeline_get",
    "Read the active timeline with positioned clips, source ranges, speed, assets, and semantic range context.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
  ),
  tool(
    "clip_split",
    "Split an active timeline clip at a timeline coordinate. The edit is undoable.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID."), timelineTime: numberProperty("Timeline time in seconds.") }, ["projectId", "expectedRevision", "clipId", "timelineTime"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "clip_trim",
    "Trim an active clip to a source interval without modifying the source file.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID."), sourceStart: numberProperty("Source start in seconds."), sourceEnd: numberProperty("Source end in seconds.") }, ["projectId", "expectedRevision", "clipId", "sourceStart", "sourceEnd"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "clip_move",
    "Move an active clip to a destination index on its track.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID."), destinationIndex: integerProperty("Zero-based destination index.") }, ["projectId", "expectedRevision", "clipId", "destinationIndex"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "clip_duplicate",
    "Duplicate an active timeline clip immediately after the original.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID.") }, ["projectId", "expectedRevision", "clipId"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "clip_delete",
    "Delete an active timeline clip. The edit remains undoable.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID.") }, ["projectId", "expectedRevision", "clipId"]),
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  ),
  tool(
    "clip_set_speed",
    "Set playback speed for an active clip between 0.25x and 32x.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID."), speed: numberProperty("Playback speed from 0.25 to 32.") }, ["projectId", "expectedRevision", "clipId", "speed"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "clip_reset_speed",
    "Reset an active clip speed to 1x.",
    schema({ ...rangeProperties, clipId: stringProperty("Timeline clip ID.") }, ["projectId", "expectedRevision", "clipId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "selection_set_playhead",
    "Set the active timeline playhead in seconds.",
    schema({ ...rangeProperties, timelineTime: numberProperty("Timeline time in seconds.") }, ["projectId", "expectedRevision", "timelineTime"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "selection_select_clip",
    "Select an active timeline clip or clear selection with null.",
    schema({ projectId: rangeProperties.projectId, clipId: { type: ["string", "null"], description: "Timeline clip ID or null." } }, ["projectId", "clipId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "selection_select_range",
    "Select a valid timeline range in seconds.",
    schema({ projectId: rangeProperties.projectId, start: numberProperty("Timeline range start in seconds."), end: numberProperty("Timeline range end in seconds.") }, ["projectId", "start", "end"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "history_undo",
    "Undo the latest active timeline mutation.",
    schema({ ...rangeProperties }, ["projectId", "expectedRevision"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "history_redo",
    "Redo the latest undone active timeline mutation.",
    schema({ ...rangeProperties }, ["projectId", "expectedRevision"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "silence_get_settings",
    "Read the active project's silence detection parameters.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
  ),
  tool(
    "silence_update_settings",
    "Update silence detection parameters for the active project.",
    schema({
      projectId: rangeProperties.projectId,
      noiseThreshold: numberProperty("Silence threshold in dB."),
      minDuration: numberProperty("Minimum silence duration in seconds."),
      mode: { type: "string", enum: ["cut", "speed"], description: "Silence handling mode." },
      speedMultiplier: numberProperty("Speed multiplier for speed mode."),
      fadeEnabled: { type: "boolean", description: "Whether cut transitions use a fade." },
      playbackRate: numberProperty("Global preview/export playback rate."),
      detectBreath: { type: "boolean", description: "Whether breath detection is enabled." },
    }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "silence_detect",
    "Analyze eligible audio clips and create a reviewable silence candidate without changing the timeline.",
    schema({
      projectId: rangeProperties.projectId,
      scope: { type: "string", enum: ["clip", "timeline"], description: "Selected clip or whole primary timeline." },
      clipId: stringProperty("Clip ID when scope is clip."),
    }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "silence_get_candidate",
    "Read the current silence candidate for the active project.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
  ),
  tool(
    "silence_apply_candidate",
    "Apply the identified revision-matched silence candidate as an undoable timeline edit.",
    schema({
      projectId: rangeProperties.projectId,
      expectedRevision: rangeProperties.expectedRevision,
      candidateId: stringProperty("Candidate ID returned by silence_detect."),
    }, ["projectId", "expectedRevision", "candidateId"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "silence_discard_candidate",
    "Discard the identified silence candidate without changing the timeline.",
    schema({
      projectId: rangeProperties.projectId,
      candidateId: stringProperty("Candidate ID returned by silence_detect."),
    }, ["projectId", "candidateId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "export_validate",
    "Validate the active project and resolve export settings, including preset, canvas, resize, profile, FPS, and optional playback rate.",
    schema({ projectId: rangeProperties.projectId, ...exportOverrideProperties }, ["projectId"]),
  ),
  tool(
    "export_render",
    "Start rendering the active project composition to a managed MP4 filename or a compatible MCP output path.",
    schema({
      ...rangeProperties,
      ...exportOverrideProperties,
      fileName: stringProperty("Safe MP4 basename managed inside the MCP output directory."),
      outputPath: stringProperty("Optional absolute MP4 path inside the MCP output directory for backwards compatibility."),
      overwrite: { type: "boolean", description: "Allow replacing an existing output path." },
      confirmationToken: stringProperty("One-use token returned when overwrite confirmation is required."),
    }, ["projectId", "expectedRevision"]),
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  ),
  tool(
    "preview_request",
    "Start a revision-bound full timeline preview job using a managed MP4 filename or a compatible MCP output path.",
    schema({
      ...rangeProperties,
      fileName: stringProperty("Safe MP4 basename managed inside the MCP output directory."),
      outputPath: stringProperty("Optional absolute MP4 path inside the MCP output directory for backwards compatibility."),
    }, ["projectId", "expectedRevision"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "preview_request_window",
    "Start a revision-bound preview job for a timeline window using a managed MP4 filename or a compatible MCP output path.",
    schema({
      ...rangeProperties,
      fileName: stringProperty("Safe MP4 basename managed inside the MCP output directory."),
      outputPath: stringProperty("Optional absolute MP4 path inside the MCP output directory for backwards compatibility."),
      center: numberProperty("Timeline center in seconds."),
      duration: numberProperty("Window duration in seconds."),
    }, ["projectId", "expectedRevision", "center", "duration"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "preview_use_source",
    "Use the source preview mode for the active project.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "preview_use_edited",
    "Use the current edited preview mode for the active project.",
    schema({ projectId: rangeProperties.projectId }, ["projectId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "job_get",
    "Read the status of a Cliprithm MCP render job.",
    schema({ projectId: rangeProperties.projectId, jobId: stringProperty("MCP job ID.") }, ["projectId", "jobId"]),
  ),
  tool(
    "job_cancel",
    "Cancel an active Cliprithm MCP render job.",
    schema({ projectId: rangeProperties.projectId, jobId: stringProperty("MCP job ID.") }, ["projectId", "jobId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "preview_cancel",
    "Cancel an active preview job.",
    schema({ projectId: rangeProperties.projectId, jobId: stringProperty("Preview job ID.") }, ["projectId", "jobId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "export_cancel",
    "Cancel an active export job.",
    schema({ projectId: rangeProperties.projectId, jobId: stringProperty("Export job ID.") }, ["projectId", "jobId"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "semantic_range_list",
    "List semantic ranges and their current timeline occurrences and presence.",
    schema({ projectId: rangeProperties.projectId, offset: integerProperty("Number of ranges to skip."), limit: integerProperty("Maximum ranges to return.") }, ["projectId"]),
  ),
  tool(
    "semantic_range_get",
    "Read one absolute-timeline semantic range with derived source context and presence.",
    schema({ projectId: rangeProperties.projectId, rangeId: stringProperty("Semantic range ID.") }, ["projectId", "rangeId"]),
  ),
  tool(
    "semantic_range_create",
    "Create an absolute-timeline semantic range with title, description, and tags. The range is undoable.",
    schema({
      ...rangeProperties,
      title: { ...stringProperty("Short range title."), minLength: 1, maxLength: 120 },
      description: { ...stringProperty("What happens in the marked range."), minLength: 1, maxLength: 4_000 },
      tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 64 }, maxItems: 20, description: "Optional searchable tags." },
      timelineStart: numberProperty("Absolute timeline start in seconds."),
      timelineEnd: numberProperty("Absolute timeline end in seconds."),
    }, ["projectId", "expectedRevision", "title", "description", "timelineStart", "timelineEnd"]),
    { readOnlyHint: false, idempotentHint: false },
  ),
  tool(
    "semantic_range_update",
    "Update title, description, tags, or source anchors of an existing range.",
    schema({ ...rangeProperties, rangeId: stringProperty("Semantic range ID."), updates: semanticRangeUpdateSchema }, ["projectId", "expectedRevision", "rangeId", "updates"]),
    { readOnlyHint: false, idempotentHint: true },
  ),
  tool(
    "semantic_range_delete",
    "Delete a semantic range. The deletion is undoable.",
    schema({ ...rangeProperties, rangeId: stringProperty("Semantic range ID.") }, ["projectId", "expectedRevision", "rangeId"]),
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  ),
];

function invalid(message: string, errorCode = "INVALID_INPUT") {
  return { ok: false, errorCode, message, retryable: false };
}

interface ConfirmationEntry {
  fingerprint: string;
  expiresAt: number;
}

const confirmations = new Map<string, ConfirmationEntry>();
const MAX_PENDING_CONFIRMATIONS = 256;

type McpJob = PreviewJobState & {
  projectId: number;
  outputExistedBefore: boolean;
  cleanupOutput: boolean;
};
const mcpJobs = new Map<string, McpJob>();
const mcpProjectOutputs = new Map<number, Set<string>>();
const mcpOutputReservations = new Map<string, string>();
const pendingMcpOutputCleanup = new Map<string, Promise<void>>();
export const MAX_MCP_JOBS = 128;
const MAX_MCP_OUTPUTS_PER_PROJECT = 256;

export function canAcceptMcpJobStatuses(
  statuses: ReadonlyArray<PreviewJobState["status"]>,
): boolean {
  return statuses.length < MAX_MCP_JOBS || statuses.some((status) =>
    status === "complete" || status === "failed" || status === "cancelled"
  );
}

function createMcpJobId(kind: PreviewJobState["kind"]): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mcp-${kind}-${suffix}`;
}

let silenceCandidateSequence = 0;

function createSilenceCandidateId(revision: number): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${silenceCandidateSequence++}`;
  return `candidate-${revision}-${suffix}`;
}

function hasMcpJobCapacity(): boolean {
  return canAcceptMcpJobStatuses([...mcpJobs.values()].map((job) => job.status));
}

function rememberMcpJob(job: McpJob): boolean {
  if (!hasMcpJobCapacity() && !mcpJobs.has(job.jobId)) return false;
  if (mcpJobs.size >= MAX_MCP_JOBS && !mcpJobs.has(job.jobId)) {
    const terminalJobId = [...mcpJobs.entries()].find(([, current]) =>
      current.status === "complete" || current.status === "failed" || current.status === "cancelled"
    )?.[0];
    if (!terminalJobId) return false;
    mcpJobs.delete(terminalJobId);
  }
  mcpJobs.set(job.jobId, job);
  return true;
}

function mcpOutputManifestPath(outputPath: string): string {
  return `${outputPath}.manifest.json`;
}

async function removeMcpArtifactIfPresent(artifactPath: string): Promise<void> {
  try {
    if (await exists(artifactPath)) await remove(artifactPath);
  } catch (error) {
    log.warn(
      "[mcp]",
      `Could not remove MCP output artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function removeMcpOutputArtifacts(outputPath: string): Promise<void> {
  await removeMcpArtifactIfPresent(outputPath);
  await removeMcpArtifactIfPresent(mcpOutputManifestPath(outputPath));
}

function scheduleMcpOutputCleanup(outputPath: string, expectedJobId?: string): void {
  const reservedJobId = mcpOutputReservations.get(outputPath);
  if (expectedJobId && reservedJobId !== expectedJobId) return;
  if (!expectedJobId && reservedJobId) {
    const owner = mcpJobs.get(reservedJobId);
    if (owner?.status === "queued" || owner?.status === "running") return;
  }

  const previous = pendingMcpOutputCleanup.get(outputPath) ?? Promise.resolve();
  const cleanup = previous
    .catch(() => undefined)
    .then(async () => {
      const currentReservation = mcpOutputReservations.get(outputPath);
      if (expectedJobId && currentReservation !== expectedJobId) return;
      if (!expectedJobId && currentReservation) {
        const owner = mcpJobs.get(currentReservation);
        if (owner?.status === "queued" || owner?.status === "running") return;
      }
      if (currentReservation === expectedJobId || !expectedJobId) {
        mcpOutputReservations.delete(outputPath);
      }
      await removeMcpOutputArtifacts(outputPath);
    });
  const tracked = cleanup.finally(() => {
    if (pendingMcpOutputCleanup.get(outputPath) === tracked) {
      pendingMcpOutputCleanup.delete(outputPath);
    }
  });
  pendingMcpOutputCleanup.set(outputPath, tracked);
}

async function waitForMcpOutputCleanup(outputPath: string): Promise<void> {
  await pendingMcpOutputCleanup.get(outputPath);
}

function rememberMcpOutput(job: McpJob): void {
  if (!job.outputPath || !job.cleanupOutput) return;
  const outputs = mcpProjectOutputs.get(job.projectId) ?? new Set<string>();
  outputs.add(job.outputPath);
  while (outputs.size > MAX_MCP_OUTPUTS_PER_PROJECT) {
    const oldest = outputs.values().next().value;
    if (!oldest) break;
    outputs.delete(oldest);
    scheduleMcpOutputCleanup(oldest);
  }
  mcpProjectOutputs.set(job.projectId, outputs);
}

function forgetMcpOutput(projectId: number, outputPath: string): void {
  const outputs = mcpProjectOutputs.get(projectId);
  if (outputs) {
    outputs.delete(outputPath);
    if (outputs.size === 0) mcpProjectOutputs.delete(projectId);
  }
  const reservedJobId = mcpOutputReservations.get(outputPath);
  const owner = reservedJobId ? mcpJobs.get(reservedJobId) : null;
  if (!owner || owner.status === "complete" || owner.status === "failed" || owner.status === "cancelled") {
    mcpOutputReservations.delete(outputPath);
  }
}

async function cleanupMcpProjectOutputs(projectId: number): Promise<string[]> {
  const outputs = mcpProjectOutputs.get(projectId);
  mcpProjectOutputs.delete(projectId);
  if (!outputs) return [];

  const warnings: string[] = [];
  for (const outputPath of outputs) {
    await waitForMcpOutputCleanup(outputPath);
    for (const artifactPath of [outputPath, mcpOutputManifestPath(outputPath)]) {
      try {
        if (await exists(artifactPath)) await remove(artifactPath);
      } catch (error) {
        warnings.push(`Could not remove MCP output artifact ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const reservedJobId = mcpOutputReservations.get(outputPath);
    const owner = reservedJobId ? mcpJobs.get(reservedJobId) : null;
    if (!owner || owner.status === "complete" || owner.status === "failed" || owner.status === "cancelled") {
      mcpOutputReservations.delete(outputPath);
    }
  }
  return warnings;
}

function updateMcpJob(jobId: string, update: Partial<McpJob>): McpJob | null {
  const current = mcpJobs.get(jobId);
  if (!current) return null;
  const next: McpJob = { ...current, ...update };
  mcpJobs.set(jobId, next);
  return next;
}

let projectLifecycleQueue: Promise<void> = Promise.resolve();

export function enqueueProjectLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const queued = projectLifecycleQueue.then(operation, operation);
  projectLifecycleQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function activeMcpJob(projectId: number): McpJob | null {
  return [...mcpJobs.values()].find((job) =>
    job.projectId === projectId && (job.status === "queued" || job.status === "running")
  ) ?? null;
}

function activeMcpOutputJob(outputPath: string): McpJob | null {
  return [...mcpJobs.values()].find((job) =>
    job.outputPath === outputPath && (job.status === "queued" || job.status === "running")
  ) ?? null;
}

function isRenderJobAlreadyFinished(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("render job is not active");
}

export function isMcpPreviewJobCurrent(
  job: Pick<McpJob, "kind" | "projectRevision" | "status">,
  revision: number,
): boolean {
  return (
    job.projectRevision === revision &&
    (job.kind === "sequence_preview" || job.kind === "preview_window") &&
    (job.status === "queued" || job.status === "running")
  );
}

function hasPendingEditedPreview(projectId: number, revision: number): boolean {
  const state = useProjectStore.getState();
  const externalPending = [...mcpJobs.values()].some((job) =>
    job.projectId === projectId && isMcpPreviewJobCurrent(job, revision)
  );
  return hasEditedPreviewAvailable(state.editedPreviewFilePath, state.editedPreviewPending, externalPending);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function normalizeOverwriteConfirmationArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return { ...args, overwrite: true };
}

function confirmationFingerprint(name: string, args: Record<string, unknown>): string {
  const { confirmationToken: _confirmationToken, ...fingerprintArgs } = args;
  return JSON.stringify({ name, args: stableValue(fingerprintArgs) });
}

function purgeExpiredConfirmations(now = Date.now()): void {
  for (const [token, entry] of confirmations) {
    if (entry.expiresAt <= now) confirmations.delete(token);
  }
}

function createConfirmationToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `confirm-${crypto.randomUUID()}`;
  }
  const randomBytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(randomBytes);
    return `confirm-${Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new Error("A secure random source is required for MCP confirmations.");
}

function requestConfirmation(name: string, args: Record<string, unknown>, summary: string) {
  purgeExpiredConfirmations();
  while (confirmations.size >= MAX_PENDING_CONFIRMATIONS) {
    const oldest = confirmations.keys().next().value;
    if (!oldest) break;
    confirmations.delete(oldest);
  }
  const token = createConfirmationToken();
  const expiresAt = Date.now() + 60_000;
  confirmations.set(token, { fingerprint: confirmationFingerprint(name, args), expiresAt });
  return {
    ok: false,
    errorCode: "CONFIRMATION_REQUIRED",
    message: `${summary} Call the same tool again with confirmationToken within 60 seconds.`,
    confirmationToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
    retryable: true,
  };
}

function consumeConfirmation(
  name: string,
  args: Record<string, unknown>,
  summary = "This operation is irreversible.",
) {
  purgeExpiredConfirmations();
  const token = stringArg(args, "confirmationToken");
  if (!token) return requestConfirmation(name, args, summary) as ReturnType<typeof invalid>;
  const entry = confirmations.get(token);
  confirmations.delete(token);
  if (!entry || entry.expiresAt <= Date.now() || entry.fingerprint !== confirmationFingerprint(name, args)) {
    return invalid("Confirmation token is expired, already used, or does not match the requested operation.", "INVALID_CONFIRMATION");
  }
  return null;
}

export interface ActiveProjectPersistenceSnapshot {
  projectId: number | null;
  timelineRevision: number | null;
  clipSegmentsJson: string;
  currentView: string;
  previewMode: string;
  editedPreviewPath: string | null;
  editedPreviewWindowJson: string;
  detectionResultJson: string | null;
  detectionSettingsJson: string;
  videoMetadataJson: string | null;
  timelineJson: string | null;
}

export function snapshotActiveProjectState(
  state: ReturnType<typeof useProjectStore.getState>,
): ActiveProjectPersistenceSnapshot {
  return {
    projectId: state.projectId,
    timelineRevision: state.timelineProject?.revision ?? null,
    clipSegmentsJson: JSON.stringify(state.clipSegments),
    currentView: state.currentView,
    previewMode: state.previewMode,
    editedPreviewPath: state.editedPreviewFilePath,
    editedPreviewWindowJson: JSON.stringify(state.editedPreviewWindow),
    detectionResultJson: state.detectionResult ? JSON.stringify(state.detectionResult) : null,
    detectionSettingsJson: JSON.stringify(state.detectionSettings),
    videoMetadataJson: state.videoMetadata ? JSON.stringify(state.videoMetadata) : null,
    timelineJson: state.timelineProject ? JSON.stringify(state.timelineProject) : null,
  };
}

export function activeProjectStateMatches(
  state: ReturnType<typeof useProjectStore.getState>,
  snapshot: ActiveProjectPersistenceSnapshot,
): boolean {
  return JSON.stringify(snapshotActiveProjectState(state)) === JSON.stringify(snapshot);
}

async function confirmProjectSwitchIfNeeded(
  toolName: string,
  args: Record<string, unknown>,
) {
  const state = useProjectStore.getState();
  if (!state.projectId) return null;

  const activeProjectId = state.projectId;
  const activeSnapshot = snapshotActiveProjectState(state);
  const persistedRecord = await getProjectById(activeProjectId);
  const currentState = useProjectStore.getState();
  if (!activeProjectStateMatches(currentState, activeSnapshot)) {
    return invalid(
      "The active project changed while checking for unsaved changes. Retry the project switch.",
      "REVISION_CONFLICT",
    );
  }
  const currentProject = currentState.timelineProject;
  const persistedTimeline = persistedRecord
    ? migrateTimelineProject(parseJson<unknown>(persistedRecord.timeline_json, null))
    : null;
  const hasUnsavedTimelineChanges = currentProject
    ? !persistedTimeline ||
      persistedTimeline.schemaVersion !== currentProject.schemaVersion ||
      persistedTimeline.revision !== currentProject.revision
    : persistedTimeline !== null;
  const hasUnsavedProjectState =
    hasUnsavedTimelineChanges ||
    persistedRecord === null ||
    persistedRecord.clip_segments !== JSON.stringify(currentState.clipSegments) ||
    persistedRecord.preview_mode !== persistedPreviewMode(currentState.previewMode, currentState.editedPreviewFilePath) ||
    persistedRecord.edited_preview_path !== currentState.editedPreviewFilePath ||
    persistedRecord.edited_preview_window_json !== JSON.stringify(currentState.editedPreviewWindow) ||
    persistedRecord.current_view !== currentState.currentView ||
    persistedRecord.detection_result_json !== (currentState.detectionResult ? JSON.stringify(currentState.detectionResult) : null) ||
    persistedRecord.detection_settings_json !== JSON.stringify(currentState.detectionSettings) ||
    persistedRecord.video_metadata_json !== (currentState.videoMetadata ? JSON.stringify(currentState.videoMetadata) : null);
  if (!hasUnsavedProjectState) return null;

  const confirmationArgs = {
    ...args,
    activeProjectId,
    activeRevision: currentProject?.revision ?? null,
  };
  return consumeConfirmation(
    toolName,
    confirmationArgs,
    "The active project has unsaved changes.",
  );
}

interface McpResultContext {
  projectId?: number | null;
  revision?: number | null;
}

function success(
  actionId: string,
  data: unknown,
  affectedIds: string[] = [],
  context: McpResultContext = {},
  warnings: string[] = [],
) {
  const state = useProjectStore.getState();
  return {
    ok: true,
    actionId,
    projectId: Object.prototype.hasOwnProperty.call(context, "projectId")
      ? context.projectId
      : state.projectId,
    revision: Object.prototype.hasOwnProperty.call(context, "revision")
      ? context.revision
      : state.timelineProject?.revision ?? null,
    affectedIds,
    warnings,
    data,
  };
}

function numberArg(args: Record<string, unknown>, key: string): number | null {
  return typeof args[key] === "number" && Number.isFinite(args[key]) ? args[key] : null;
}

function integerArg(args: Record<string, unknown>, key: string): number | null {
  const value = numberArg(args, key);
  return value !== null && Number.isInteger(value) ? value : null;
}

function projectIdArg(args: Record<string, unknown>): number | null {
  const projectId = integerArg(args, "projectId");
  return projectId !== null && projectId > 0 ? projectId : null;
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  return typeof args[key] === "string" && args[key].length > 0 ? args[key] : null;
}

function absolutePathArg(args: Record<string, unknown>, key: string): string | null {
  const value = stringArg(args, key);
  if (!value || value.length > 32_768) return null;
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value) ? value : null;
}

function projectNameArg(value: string | null, fallback: string): string | null {
  const name = (value ?? fallback).trim();
  return name.length > 0 && name.length <= 512 ? name : null;
}

function outputPathArg(args: Record<string, unknown>, key: string, extension: string): string | null {
  const value = absolutePathArg(args, key);
  return value && value.toLowerCase().endsWith(extension) ? value : null;
}

const MAX_MCP_OUTPUT_FILE_NAME_LENGTH = 255;

export function isMcpOutputFileNameAllowed(fileName: string, extension = ".mp4"): boolean {
  return (
    fileName.length > 0 &&
    fileName.length <= MAX_MCP_OUTPUT_FILE_NAME_LENGTH &&
    fileName.toLowerCase().endsWith(extension) &&
    fileName !== "." &&
    fileName !== ".." &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    !fileName.includes(":") &&
    !fileName.includes("\0") &&
    !Array.from(fileName).some((character) => character.charCodeAt(0) < 32)
  );
}

function fileNameArg(args: Record<string, unknown>, key: string, extension: string): string | null {
  const value = stringArg(args, key);
  return value && isMcpOutputFileNameAllowed(value, extension) ? value : null;
}

async function mcpOutputDirectory(): Promise<string> {
  return resolve(await appDataDir(), "mcp-outputs");
}

export function isMcpOutputPathAllowed(outputRoot: string, outputPath: string): boolean {
  const normalizedRoot = outputRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = outputPath.replace(/\\/g, "/");
  const isWindowsPath = (value: string) => /^[A-Za-z]:\//.test(value);
  const comparisonRoot = isWindowsPath(normalizedRoot)
    ? normalizedRoot.toLowerCase()
    : normalizedRoot;
  const comparisonPath = isWindowsPath(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath;
  return comparisonPath.startsWith(`${comparisonRoot}/`);
}

function temporaryMcpOutputPath(outputPath: string, jobId: string): string {
  const separatorIndex = Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"));
  const directory = separatorIndex >= 0 ? outputPath.slice(0, separatorIndex + 1) : "";
  const filename = separatorIndex >= 0 ? outputPath.slice(separatorIndex + 1) : outputPath;
  return `${directory}.${filename}.${jobId}.tmp.mp4`;
}

async function removeMcpOutputIfPresent(outputPath: string): Promise<void> {
  await removeMcpOutputArtifacts(outputPath);
}

async function renderMcpOutput(
  outputPath: string,
  jobId: string,
  outputExistedBefore: boolean,
  preservePreviewManifest: boolean,
  render: (renderPath: string) => Promise<string>,
): Promise<string> {
  const renderPath = temporaryMcpOutputPath(outputPath, jobId);
  const outputManifest = mcpOutputManifestPath(outputPath);
  const outputManifestExistedBefore = preservePreviewManifest
    ? await exists(outputManifest)
    : false;
  try {
    await render(renderPath);
    await replaceMcpOutput(renderPath, outputPath, outputExistedBefore);
    if (preservePreviewManifest) {
      const temporaryManifest = mcpOutputManifestPath(renderPath);
      if (await exists(temporaryManifest)) {
        try {
          await replaceMcpOutput(temporaryManifest, outputManifest, outputManifestExistedBefore);
        } catch (error) {
          await removeMcpArtifactIfPresent(temporaryManifest);
          if (outputManifestExistedBefore) {
            await removeMcpArtifactIfPresent(outputManifest);
          }
          log.warn(
            "[mcp]",
            `Could not move the MCP preview manifest: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else if (outputManifestExistedBefore) {
        await removeMcpArtifactIfPresent(outputManifest);
      }
    } else {
      await removeMcpArtifactIfPresent(mcpOutputManifestPath(outputPath));
    }
    return outputPath;
  } catch (error) {
    await removeMcpOutputIfPresent(renderPath);
    throw error;
  }
}

async function secureMcpOutputPathArg(
  args: Record<string, unknown>,
  key: string,
  extension: string,
): Promise<string | null> {
  const fileNameKey = "fileName";
  const hasRequestedPath = Object.prototype.hasOwnProperty.call(args, key);
  const hasFileName = Object.prototype.hasOwnProperty.call(args, fileNameKey);
  if (hasRequestedPath === hasFileName) return null;

  const requestedPath = hasRequestedPath ? outputPathArg(args, key, extension) : null;
  const requestedFileName = hasFileName ? fileNameArg(args, fileNameKey, extension) : null;
  if ((hasRequestedPath && !requestedPath) || (hasFileName && !requestedFileName)) return null;

  try {
    const outputRoot = (await resolve(await mcpOutputDirectory())).replace(/\\/g, "/");
    const requestedOutput = requestedPath
      ? await resolve(requestedPath)
      : await resolve(outputRoot, requestedFileName!);
    const normalizedPath = requestedOutput.replace(/\\/g, "/");
    return isMcpOutputPathAllowed(outputRoot, normalizedPath) ? normalizedPath : null;
  } catch {
    return null;
  }
}

export type SilenceDetectionRequest = {
  scope: "clip" | "timeline";
  clipId: string | null;
};

export function parseSilenceDetectionRequest(
  args: Record<string, unknown>,
  selectedClipId: string | null,
  availableClipIds: ReadonlySet<string>,
): SilenceDetectionRequest | { error: string } {
  const hasScope = Object.prototype.hasOwnProperty.call(args, "scope");
  const hasClipId = Object.prototype.hasOwnProperty.call(args, "clipId");
  const rawScope = args.scope;
  if (hasScope && rawScope !== "clip" && rawScope !== "timeline") {
    return { error: "scope must be either clip or timeline." };
  }

  const scope: SilenceDetectionRequest["scope"] = rawScope === "timeline" ? "timeline" : "clip";
  if (scope === "timeline" && hasClipId) {
    return { error: "clipId may only be provided when scope is clip." };
  }
  if (scope === "clip" && hasClipId && (typeof args.clipId !== "string" || args.clipId.length === 0)) {
    return { error: "clipId must be a non-empty string when provided." };
  }

  const clipId = scope === "clip"
    ? (hasClipId ? args.clipId as string : selectedClipId)
    : null;
  if (scope === "clip" && (!clipId || !availableClipIds.has(clipId))) {
    return { error: "No eligible clip is selected for silence detection." };
  }

  return { scope, clipId };
}

function detectionSettingsUpdates(args: Record<string, unknown>):
  | { updates: Partial<DetectionSettings> }
  | { error: ReturnType<typeof invalid> } {
  const updates: Partial<DetectionSettings> = {};
  if (Object.prototype.hasOwnProperty.call(args, "noiseThreshold")) {
    if (typeof args.noiseThreshold !== "number" || !Number.isFinite(args.noiseThreshold) || args.noiseThreshold < -60 || args.noiseThreshold > 0) {
      return { error: invalid("noiseThreshold must be between -60 and 0 dB.") };
    }
    updates.noiseThreshold = args.noiseThreshold;
  }
  if (Object.prototype.hasOwnProperty.call(args, "minDuration")) {
    if (typeof args.minDuration !== "number" || !Number.isFinite(args.minDuration) || args.minDuration < 0.1 || args.minDuration > 3) {
      return { error: invalid("minDuration must be between 0.1 and 3 seconds.") };
    }
    updates.minDuration = args.minDuration;
  }
  if (Object.prototype.hasOwnProperty.call(args, "mode")) {
    if (args.mode !== "cut" && args.mode !== "speed") return { error: invalid("mode must be cut or speed.") };
    updates.mode = args.mode;
  }
  if (Object.prototype.hasOwnProperty.call(args, "speedMultiplier")) {
    if (typeof args.speedMultiplier !== "number" || !Number.isFinite(args.speedMultiplier) || args.speedMultiplier < 0.5 || args.speedMultiplier > 6) {
      return { error: invalid("speedMultiplier must be between 0.5 and 6.") };
    }
    updates.speedMultiplier = args.speedMultiplier;
  }
  if (Object.prototype.hasOwnProperty.call(args, "fadeEnabled")) {
    if (typeof args.fadeEnabled !== "boolean") return { error: invalid("fadeEnabled must be a boolean.") };
    updates.fadeEnabled = args.fadeEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(args, "playbackRate")) {
    if (typeof args.playbackRate !== "number" || !Number.isFinite(args.playbackRate) || args.playbackRate <= 0 || args.playbackRate > 100) {
      return { error: invalid("playbackRate must be greater than 0 and at most 100.") };
    }
    updates.playbackRate = args.playbackRate;
  }
  if (Object.prototype.hasOwnProperty.call(args, "detectBreath")) {
    if (typeof args.detectBreath !== "boolean") return { error: invalid("detectBreath must be a boolean.") };
    updates.detectBreath = args.detectBreath;
  }
  return { updates };
}

function activeProject(args: Record<string, unknown>) {
  const state = useProjectStore.getState();
  const projectId = projectIdArg(args);
  if (projectId === null) {
    return { error: invalid("projectId must be a positive integer.") };
  }
  if (state.projectId !== projectId || !state.timelineProject) {
    return { error: invalid("Open the requested project in Cliprithm first with project_open.", "PROJECT_NOT_ACTIVE") };
  }
  return { state, projectId, project: state.timelineProject };
}

function checkRevision(args: Record<string, unknown>, revision: number) {
  const expectedRevision = integerArg(args, "expectedRevision");
  if (expectedRevision === null || expectedRevision !== revision) {
    return invalid(
      `Project revision is ${revision}; read timeline_get and retry with that expectedRevision.`,
      "REVISION_CONFLICT",
    );
  }
  return null;
}

const defaultDetectionSettings: DetectionSettings = {
  noiseThreshold: -30,
  minDuration: 0.5,
  mode: "cut",
  speedMultiplier: 2,
  fadeEnabled: true,
  detectBreath: false,
  playbackRate: 1,
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function projectNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "Untitled project";
}

function persistedProjectView(value: string | null | undefined): AppView {
  switch (value) {
    case "import":
    case "processing":
    case "detection":
    case "editor":
    case "export":
      return value;
    default:
      return "editor";
  }
}

function projectViewAfterOpen(value: string | null | undefined): AppView {
  const view = persistedProjectView(value);
  return view === "processing" ? "editor" : view;
}

function metadataFromProject(record: ProjectRecord): VideoMetadata | null {
  const metadata = parseJson<VideoMetadata | null>(record.video_metadata_json, null);
  return metadata && Number.isFinite(metadata.duration) ? metadata : null;
}

async function existingEditedPreviewPath(record: ProjectRecord): Promise<string | null> {
  if (!record.edited_preview_path) return null;
  try {
    return await exists(record.edited_preview_path) ? record.edited_preview_path : null;
  } catch {
    return null;
  }
}

function revisionFromProjectRecord(record: ProjectRecord): number | null {
  const timelineProject = migrateTimelineProject(parseJson<unknown>(record.timeline_json, null));
  return timelineProject?.revision ?? null;
}

async function openProjectRecord(
  record: ProjectRecord,
  expectedActive: ActiveProjectPersistenceSnapshot,
) {
  const metadata = metadataFromProject(record) ?? await getVideoMetadata(record.file_path);
  if (!activeProjectStateMatches(useProjectStore.getState(), expectedActive)) {
    return null;
  }
  const savedClips = parseJson<Array<{ id: string; label: string; start: number; end: number; duration: number }>>(record.clip_segments, []);
  const savedSilence = parseJson<SilenceSegment[]>(record.silence_segments, []);
  const legacyClipSegments = savedClips.length > 0
    ? savedClips
    : buildClipSegmentsFromSilence(savedSilence, metadata.duration);
  const detectionResult = parseJson<ReturnType<typeof useProjectStore.getState>["detectionResult"]>(record.detection_result_json, null);
  const storedTimeline = parseJson<unknown>(record.timeline_json, null);
  const savedTimelineProject = migrateTimelineProject(storedTimeline);
  const needsTimelinePersistence = savedTimelineProject === null || (
    typeof storedTimeline === "object" &&
    storedTimeline !== null &&
    "schemaVersion" in storedTimeline &&
    storedTimeline.schemaVersion !== 3
  );
  const timelineProject = savedTimelineProject ?? migrateLegacyProject({
    asset: {
      path: record.file_path,
      name: record.name,
      metadata,
      thumbnailPath: record.thumbnail_path,
      sourceFingerprint: `${metadata.file_size}:${metadata.duration}:${metadata.codec}`,
    },
    clipSegments: legacyClipSegments,
  });
  const settings = {
    ...defaultDetectionSettings,
    ...parseJson<Partial<DetectionSettings>>(record.detection_settings_json, {}),
  };
  const editedPreviewPath = await existingEditedPreviewPath(record);
  const editedPreviewWindow = editedPreviewPath
    ? record.edited_preview_window_json === null
      ? previewWindowFromPath(editedPreviewPath)
      : parseJson<PreviewWindow | null>(record.edited_preview_window_json, null)
    : null;
  const previewMode = record.preview_mode === "edited" && editedPreviewPath ? "edited" : "source";
  const restoredView = projectViewAfterOpen(record.current_view);
  const needsPreviewPersistence =
    record.preview_mode !== previewMode ||
    record.edited_preview_path !== editedPreviewPath ||
    record.edited_preview_window_json !== JSON.stringify(editedPreviewWindow);
  const needsViewPersistence = record.current_view !== restoredView;
  if (!activeProjectStateMatches(useProjectStore.getState(), expectedActive)) {
    return null;
  }
  if (needsTimelinePersistence || needsPreviewPersistence || needsViewPersistence) {
    await updateProject(record.id, {
      ...(needsTimelinePersistence
        ? {
            timeline_json: JSON.stringify(timelineProject),
            project_schema_version: timelineProject.schemaVersion,
          }
        : {}),
      ...(needsPreviewPersistence
        ? {
            preview_mode: previewMode,
            edited_preview_path: editedPreviewPath,
            edited_preview_window_json: JSON.stringify(editedPreviewWindow),
          }
        : {}),
      ...(needsViewPersistence ? { current_view: restoredView } : {}),
      status: "in_progress",
    });
    if (!activeProjectStateMatches(useProjectStore.getState(), expectedActive)) {
      if (useProjectStore.getState().projectId === record.id) {
        await saveActiveProject(record.id);
      }
      return null;
    }
  }
  const store = useProjectStore.getState();
  store.loadProject({
    projectId: record.id,
    filePath: record.file_path,
    videoMetadata: metadata,
    detectionResult,
    detectionSettings: settings,
    clipSegments: legacyClipSegments,
    removedSegments: detectionResult?.segments ?? savedSilence,
    timelineProject,
    currentView: restoredView,
    previewMode,
    editedPreviewPath,
    editedPreviewWindow,
    processedPath: record.processed_path,
  });
  return timelineProject;
}

async function saveActiveProject(projectId: number) {
  const state = useProjectStore.getState();
  if (state.projectId !== projectId || !state.timelineProject) {
    throw new Error("Open the requested project before saving it.");
  }
  await updateProject(projectId, {
    clip_segments: JSON.stringify(state.clipSegments),
    current_view: state.currentView,
    preview_mode: persistedPreviewMode(state.previewMode, state.editedPreviewFilePath),
    edited_preview_path: state.editedPreviewFilePath,
    edited_preview_window_json: JSON.stringify(state.editedPreviewWindow),
    silence_segments: JSON.stringify(state.detectionResult?.segments ?? []),
    detection_result_json: state.detectionResult ? JSON.stringify(state.detectionResult) : null,
    detection_settings_json: JSON.stringify(state.detectionSettings),
    video_metadata_json: state.videoMetadata ? JSON.stringify(state.videoMetadata) : null,
    timeline_json: JSON.stringify(state.timelineProject),
    project_schema_version: state.timelineProject.schemaVersion,
    status: "in_progress",
  });
}

function dispatch(args: Record<string, unknown>, action: EditorAction, actionId: string, affectedIds: string[] = []) {
  const active = activeProject(args);
  if ("error" in active) return active.error;
  const revisionError = checkRevision(args, active.project.revision);
  if (revisionError) return revisionError;
  if (!active.state.dispatchEditorAction(action)) {
    return invalid("The action preconditions failed. Read the current project context and retry.", "ACTION_PRECONDITION_FAILED");
  }
  return success(actionId, useProjectStore.getState().timelineProject, affectedIds);
}

async function dispatchAndSave(
  args: Record<string, unknown>,
  action: EditorAction,
  actionId: string,
  affectedIds: string[] = [],
) {
  return enqueueProjectLifecycle(async () => {
    const result = dispatch(args, action, actionId, affectedIds);
    if (result?.ok) await saveActiveProject(Number(args.projectId));
    return result;
  });
}

function projectContext(project = useProjectStore.getState().timelineProject) {
  if (!project) return null;
  return {
    project,
    duration: getTimelineDuration(project),
    positionedClips: getPositionedClips(project),
    semanticRanges: getSemanticRangeContexts(project),
  };
}

type McpExportPreset = "tiktok" | "reels" | "youtube" | "square" | "custom";

type McpExportSettings = {
  preset: McpExportPreset;
  resolution: ExportSettings["resolution"];
  sizingMode: ExportSizingMode;
  creatorTarget: string | null;
  width: number;
  height: number;
  resizeMode: ExportResizeMode;
  profile: ExportProfile;
  fps: 30 | 60;
  playbackRate: number;
};

export type McpExportSettingsResolution =
  | { settings: McpExportSettings }
  | { error: string };

const CREATOR_TARGET_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "vertical-social": { width: 1080, height: 1920 },
  "youtube-landscape": { width: 1920, height: 1080 },
  "square-social": { width: 1080, height: 1080 },
  "landscape-4k": { width: 3840, height: 2160 },
  "vertical-4k": { width: 2160, height: 3840 },
};

function mcpPresetDimensions(
  preset: Exclude<McpExportPreset, "custom">,
  resolution: ExportSettings["resolution"],
): { width: number; height: number } {
  const is4k = resolution === "4k";
  if (preset === "tiktok" || preset === "reels") {
    return is4k ? { width: 2160, height: 3840 } : { width: 1080, height: 1920 };
  }
  if (preset === "youtube") {
    return is4k ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
  }
  return is4k ? { width: 2160, height: 2160 } : { width: 1080, height: 1080 };
}

function hasArgument(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

export function resolveMcpExportSettings(
  activeSettings: ExportSettings,
  project: TimelineProject,
  args: Record<string, unknown>,
): McpExportSettingsResolution {
  const firstAsset = project.assets.find((asset) => asset.metadata);
  const sourceWidth = firstAsset?.metadata?.width ?? 1920;
  const sourceHeight = firstAsset?.metadata?.height ?? 1080;
  const requestedPreset = stringArg(args, "preset") as McpExportPreset | null;
  const requestedResolution = stringArg(args, "resolution") as ExportSettings["resolution"] | null;
  const requestedSizingMode = stringArg(args, "sizingMode") as ExportSizingMode | null;
  const requestedCreatorTarget = stringArg(args, "creatorTarget");
  const requestedResizeMode = stringArg(args, "resizeMode") as ExportResizeMode | null;
  const requestedProfile = stringArg(args, "profile") as ExportProfile | null;
  const requestedWidth = hasArgument(args, "width") ? integerArg(args, "width") : null;
  const requestedHeight = hasArgument(args, "height") ? integerArg(args, "height") : null;
  const requestedFps = hasArgument(args, "fps") ? integerArg(args, "fps") : null;
  const requestedPlaybackRate = hasArgument(args, "playbackRate")
    ? numberArg(args, "playbackRate")
    : null;

  if (hasArgument(args, "width") && requestedWidth === null) {
    return { error: "width must be an integer when provided." };
  }
  if (hasArgument(args, "height") && requestedHeight === null) {
    return { error: "height must be an integer when provided." };
  }
  if (hasArgument(args, "fps") && requestedFps !== 30 && requestedFps !== 60) {
    return { error: "fps must be either 30 or 60." };
  }
  if (
    hasArgument(args, "playbackRate") &&
    (requestedPlaybackRate === null || requestedPlaybackRate < 0.25 || requestedPlaybackRate > 4)
  ) {
    return { error: "playbackRate must be between 0.25 and 4." };
  }

  let preset = requestedPreset ?? (activeSettings.preset as McpExportPreset);
  let resolution = requestedResolution ?? activeSettings.resolution;
  let sizingMode = requestedSizingMode ?? activeSettings.sizingMode;
  let creatorTarget = requestedCreatorTarget;
  let resizeMode = requestedResizeMode ?? activeSettings.resizeMode;
  let width = requestedWidth ?? activeSettings.width;
  let height = requestedHeight ?? activeSettings.height;

  if (creatorTarget) {
    const target = CREATOR_TARGET_DIMENSIONS[creatorTarget];
    if (!target) return { error: "creatorTarget is not a supported export target." };
    if (requestedPreset && requestedPreset !== "custom") {
      return { error: "creatorTarget can only be combined with preset=custom." };
    }
    if (hasArgument(args, "width") || hasArgument(args, "height")) {
      return { error: "creatorTarget cannot be combined with width or height." };
    }
    preset = "custom";
    sizingMode = "preset";
    width = target.width;
    height = target.height;
  }

  if (preset !== "custom") {
    if (requestedSizingMode || hasArgument(args, "width") || hasArgument(args, "height") || creatorTarget) {
      return { error: "sizingMode, creatorTarget, width, and height require preset=custom." };
    }
    if (requestedResizeMode && requestedResizeMode !== "fit") {
      return { error: "Non-custom presets use resizeMode=fit." };
    }
    const dimensions = mcpPresetDimensions(preset, resolution);
    width = dimensions.width;
    height = dimensions.height;
    sizingMode = "preset";
    resizeMode = "fit";
  } else if (sizingMode === "original") {
    if (hasArgument(args, "width") || hasArgument(args, "height")) {
      return { error: "width and height cannot be combined with sizingMode=original." };
    }
    width = sourceWidth;
    height = sourceHeight;
    if (requestedResizeMode && requestedResizeMode !== "original") {
      return { error: "sizingMode=original requires resizeMode=original." };
    }
    resizeMode = "original";
  } else {
    if (hasArgument(args, "width") !== hasArgument(args, "height")) {
      return { error: "width and height must be provided together." };
    }
    if (
      sizingMode === "custom" &&
      requestedSizingMode === "custom" &&
      (!hasArgument(args, "width") || !hasArgument(args, "height"))
    ) {
      return { error: "sizingMode=custom requires width and height." };
    }
    if (sizingMode === "custom" && (!Number.isInteger(width) || !Number.isInteger(height))) {
      return { error: "sizingMode=custom requires width and height." };
    }
    if (resizeMode === "original" && (width !== sourceWidth || height !== sourceHeight)) {
      return { error: "resizeMode=original requires output dimensions to match the source." };
    }
  }

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 4096 || height > 4096) {
    return { error: "Export dimensions must be between 2 and 4096 pixels." };
  }

  width -= width % 2;
  height -= height % 2;
  if (width < 2 || height < 2) {
    return { error: "Export dimensions must resolve to at least 2 pixels on even boundaries." };
  }
  if (resizeMode === "original" && (width !== sourceWidth || height !== sourceHeight)) {
    return { error: "resizeMode=original requires even source dimensions." };
  }

  const playbackRate = requestedPlaybackRate ?? 1;
  const invalidSpeed = getPositionedClips(project).some((clip) => {
    const speed = clip.speed * playbackRate;
    return !Number.isFinite(speed) || speed < 0.25 || speed > 32;
  });
  if (invalidSpeed) {
    return { error: "playbackRate would produce a clip speed outside the supported 0.25x–32x range." };
  }

  return {
    settings: {
      preset,
      resolution,
      sizingMode,
      creatorTarget: creatorTarget ?? null,
      width,
      height,
      resizeMode,
      profile: requestedProfile ?? activeSettings.profile,
      fps: (requestedFps ?? activeSettings.fps) as 30 | 60,
      playbackRate,
    },
  };
}

type McpRenderClip = {
  inputPath: string;
  sourceStart: number;
  sourceEnd: number;
  speed: number;
  fps: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

function renderClipsForProject(
  project: TimelineProject,
  window?: { start: number; end: number },
  playbackRate = 1,
): McpRenderClip[] {
  return getPositionedClips(project).flatMap((clip) => {
    const asset = getAsset(project, clip.assetId);
    if (!asset) return [];
    const start = Math.max(clip.timelineStart, window?.start ?? clip.timelineStart);
    const end = Math.min(clip.timelineEnd, window?.end ?? clip.timelineEnd);
    if (end - start < 0.08) return [];
    return [{
      inputPath: asset.path,
      sourceStart: clip.sourceStart + (start - clip.timelineStart) * clip.speed,
      sourceEnd: clip.sourceStart + (end - clip.timelineStart) * clip.speed,
      speed: clip.speed * playbackRate,
      fps: asset.metadata?.fps ?? 30,
      width: asset.metadata?.width ?? 1920,
      height: asset.metadata?.height ?? 1080,
      hasAudio: asset.metadata?.has_audio ?? false,
    }];
  });
}

function canCleanUpMcpJobOutput(job: McpJob): boolean {
  return job.kind !== "export_render" && !job.outputExistedBefore && Boolean(job.outputPath);
}

function cleanUpMcpJobOutput(job: McpJob, outputPath = job.outputPath): void {
  if (!outputPath) return;
  if (canCleanUpMcpJobOutput(job)) {
    scheduleMcpOutputCleanup(outputPath, job.jobId);
  } else if (mcpOutputReservations.get(outputPath) === job.jobId) {
    mcpOutputReservations.delete(outputPath);
  }
}

export function clearMcpPreviewJobIfOwned(job: McpJob): void {
  if (job.kind === "export_render") return;
  const state = useProjectStore.getState();
  if (
    state.projectId !== job.projectId ||
    state.timelineProject?.revision !== job.projectRevision ||
    state.editedPreviewJobId !== job.jobId
  ) {
    return;
  }
  state.setEditedPreviewJobId(null);
  if (!state.editedPreviewFilePath && !state.editedPreviewPending) {
    state.setPreviewMode("source");
  }
}

type McpJobStartResult =
  | { ok: true }
  | { ok: false; errorCode: "JOB_CONFLICT" | "OUTPUT_CONFLICT" | "JOB_LIMIT"; message: string };

export function startMcpRenderJob(
  job: McpJob,
  render: () => Promise<string>,
): McpJobStartResult {
  if (activeMcpJob(job.projectId)) {
    return {
      ok: false,
      errorCode: "JOB_CONFLICT",
      message: "Project already has an active MCP job.",
    };
  }
  if (
    job.outputPath &&
    (activeMcpOutputJob(job.outputPath) || mcpOutputReservations.has(job.outputPath))
  ) {
    return {
      ok: false,
      errorCode: "OUTPUT_CONFLICT",
      message: "Output path is already reserved by another MCP job.",
    };
  }
  if (!rememberMcpJob(job)) {
    return {
      ok: false,
      errorCode: "JOB_LIMIT",
      message: "The MCP job limit is reached; wait for an active job to finish and retry.",
    };
  }
  if (job.outputPath) mcpOutputReservations.set(job.outputPath, job.jobId);
  updateMcpJob(job.jobId, { status: "running", percent: 0 });
  if (job.kind !== "export_render") {
    const state = useProjectStore.getState();
    if (
      state.projectId === job.projectId &&
      state.timelineProject?.revision === job.projectRevision
    ) {
      state.setEditedPreviewJobId(job.jobId);
    }
  }
  void render()
    .then((outputPath) => {
      const current = mcpJobs.get(job.jobId);
      if (current?.status === "cancelled") {
        cleanUpMcpJobOutput(current, outputPath);
        clearMcpPreviewJobIfOwned(current);
        return;
      }
      if (!current) {
        cleanUpMcpJobOutput(job, outputPath);
        clearMcpPreviewJobIfOwned(job);
        return;
      }
      const completed = updateMcpJob(job.jobId, {
        status: "complete",
        percent: 100,
        outputPath,
        error: null,
        cleanupOutput: !current.outputExistedBefore,
      });
      if (completed) {
        rememberMcpOutput(completed);
        if (!completed.cleanupOutput && mcpOutputReservations.get(outputPath) === job.jobId) {
          mcpOutputReservations.delete(outputPath);
        }
      }
      const state = useProjectStore.getState();
      if (
        current.kind !== "export_render" &&
        state.projectId === current.projectId &&
        state.timelineProject?.revision === current.projectRevision
      ) {
        state.setEditedPreviewFilePath(outputPath);
        state.setEditedPreviewWindow(current.window ?? null);
        if (state.editedPreviewJobId === current.jobId) {
          state.setEditedPreviewJobId(null);
        }
      }
    })
    .catch((error) => {
      const current = mcpJobs.get(job.jobId);
      if (current?.status === "cancelled") {
        cleanUpMcpJobOutput(current);
        clearMcpPreviewJobIfOwned(current);
        return;
      }
      if (current) {
        updateMcpJob(job.jobId, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        cleanUpMcpJobOutput(current);
        clearMcpPreviewJobIfOwned(current);
      } else {
        cleanUpMcpJobOutput(job);
        clearMcpPreviewJobIfOwned(job);
      }
    });
  return { ok: true };
}

async function handleProjectCreateFromMedia(args: Record<string, unknown>) {
  const filePath = absolutePathArg(args, "filePath");
  if (!filePath) return invalid("filePath must be an absolute local path.");
  const name = projectNameArg(stringArg(args, "name"), projectNameFromPath(filePath));
  if (!name) return invalid("name must be between 1 and 512 characters.");
  const activeBeforeCreate = useProjectStore.getState();
  const expectedActive = snapshotActiveProjectState(activeBeforeCreate);
  const switchConfirmation = await confirmProjectSwitchIfNeeded(
    "cliprithm_project_create_from_media",
    args,
  );
  if (switchConfirmation) return switchConfirmation;
  const metadata = await getVideoMetadata(filePath);
  const currentBeforeCreate = useProjectStore.getState();
  if (!activeProjectStateMatches(currentBeforeCreate, expectedActive)) {
    return invalid("The active project changed while creating the new project. Retry the operation.", "REVISION_CONFLICT");
  }
  const settings = currentBeforeCreate.detectionSettings;
  const projectId = await createProject({
    name,
    file_path: filePath,
    thumbnail_path: null,
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    codec: metadata.codec,
    file_size: metadata.file_size,
    noise_threshold: settings.noiseThreshold,
    min_duration: settings.minDuration,
    mode: settings.mode,
  });
  const currentAfterCreate = useProjectStore.getState();
  if (!activeProjectStateMatches(currentAfterCreate, expectedActive)) {
    await deleteProject(projectId);
    return invalid("The active project changed while creating the new project. Retry the operation.", "REVISION_CONFLICT");
  }
  const store = currentAfterCreate;
  store.resetProject();
  store.setFilePath(filePath);
  store.setVideoMetadata(metadata);
  store.setProjectId(projectId);
  store.updateDetectionSettings(settings);
  store.initializeTimelineProject({
    path: filePath,
    name,
    metadata,
    thumbnailPath: null,
    sourceFingerprint: `${metadata.file_size}:${metadata.duration}:${metadata.codec}`,
  });
  store.setView("editor");
  await saveActiveProject(projectId);
  return success("project.createFromMedia", { projectId, name, metadata }, [String(projectId)]);
}

async function handleProjectOpen(args: Record<string, unknown>) {
  const projectId = projectIdArg(args);
  if (projectId === null) return invalid("projectId must be a positive integer.");
  const record = await getProjectById(projectId);
  if (!record) return invalid("Project was not found.", "PROJECT_NOT_FOUND");
  const activeBeforeOpen = useProjectStore.getState();
  const expectedActive = snapshotActiveProjectState(activeBeforeOpen);
  const switchConfirmation = await confirmProjectSwitchIfNeeded(
    "cliprithm_project_open",
    args,
  );
  if (switchConfirmation) return switchConfirmation;
  const timelineProject = await openProjectRecord(record, expectedActive);
  if (!timelineProject) {
    return invalid(
      "The active project changed while opening the requested project. Retry the operation.",
      "REVISION_CONFLICT",
    );
  }
  return success("project.open", { project: record, timelineProject }, [String(projectId)]);
}

async function handleProjectSave(args: Record<string, unknown>) {
  const projectId = projectIdArg(args);
  if (projectId === null) return invalid("projectId must be a positive integer.");
  const active = activeProject(args);
  if ("error" in active) return active.error;
  await saveActiveProject(projectId);
  return success("project.save", { projectId }, [String(projectId)]);
}

async function handleProjectRename(args: Record<string, unknown>) {
  const projectId = projectIdArg(args);
  const name = projectNameArg(stringArg(args, "name"), "");
  if (projectId === null || !name) return invalid("projectId and a name between 1 and 512 characters are required.");
  const project = await getProjectById(projectId);
  if (!project) return invalid("Project was not found.", "PROJECT_NOT_FOUND");
  await updateProject(projectId, { name });
  return success("project.rename", { projectId, name }, [String(projectId)], {
    projectId,
    revision: revisionFromProjectRecord(project),
  });
}

async function handleProjectDelete(args: Record<string, unknown>) {
  const projectId = projectIdArg(args);
  if (projectId === null) return invalid("projectId must be a positive integer.");
  const project = await getProjectById(projectId);
  if (!project) return invalid("Project was not found.", "PROJECT_NOT_FOUND");
  const activeJob = activeMcpJob(projectId);
  if (activeJob) {
    return invalid(
      `Cancel the active MCP job ${activeJob.jobId} before deleting this project.`,
      "JOB_CONFLICT",
    );
  }
  const confirmation = consumeConfirmation("cliprithm_project_delete", args);
  if (confirmation) return confirmation;
  await deleteProject(projectId);
  const warnings = await cleanupMcpProjectOutputs(projectId);
  if (useProjectStore.getState().projectId === projectId) useProjectStore.getState().resetProject();
  return success("project.delete", { projectId }, [String(projectId)], {
    projectId,
    revision: null,
  }, warnings);
}

async function handleSilenceApplyCandidate(args: Record<string, unknown>) {
  const active = activeProject(args);
  if ("error" in active) return active.error;
  const candidateId = stringArg(args, "candidateId");
  if (!candidateId) return invalid("candidateId is required.");
  const candidate = active.state.silenceCandidate;
  if (!candidate || candidate.id !== candidateId || candidate.status !== "reviewable") {
    return invalid("The requested silence candidate is no longer available.", "CANDIDATE_STALE");
  }
  if (candidate.projectRevision !== active.project.revision) return invalid("The candidate is stale; run silence_detect again.", "CANDIDATE_STALE");
  const revisionError = checkRevision(args, active.project.revision);
  if (revisionError) return revisionError;
  if (!active.state.dispatchEditorAction({
    type: "analysis.acceptCandidate",
    projectRevision: candidate.projectRevision,
    candidates: candidate.ranges,
  })) return invalid("The silence candidate no longer matches the project.", "ACTION_PRECONDITION_FAILED");
  active.state.setSilenceCandidate({ ...candidate, status: "accepted" });
  await saveActiveProject(active.projectId);
  return success("analysis.acceptCandidate", useProjectStore.getState().timelineProject);
}

export async function handleTool(name: string, args: Record<string, unknown>) {
  const normalizedName = name.replace(/^cliprithm_/, "");
  const argumentValidation = validateMcpToolArguments(normalizedName, args);
  if (!argumentValidation.valid) return invalid(argumentValidation.message);

  switch (normalizedName) {
    case "system_get_capabilities": {
      const state = useProjectStore.getState();
      let outputDirectory: string | null = null;
      try {
        outputDirectory = await mcpOutputDirectory();
      } catch {
        outputDirectory = null;
      }
      return success("system.getCapabilities", {
        contractVersion: "1.2.0",
        activeProjectId: state.projectId,
        revision: state.timelineProject?.revision ?? null,
        toolCount: MCP_TOOL_CATALOG.length,
        outputDirectory,
        managedOutputNames: true,
        limits: { minClipSpeed: 0.25, maxClipSpeed: 32, minRangeDuration: 0.08 },
      });
    }
    case "project_list": {
      const projects = await getAllProjects();
      const offset = Math.max(0, Math.floor(numberArg(args, "offset") ?? 0));
      const limit = Math.min(50, Math.max(1, Math.floor(numberArg(args, "limit") ?? 20)));
      const items = projects.slice(offset, offset + limit);
      return success(
        "project.list",
        {
          items,
          totalCount: projects.length,
          offset,
          count: items.length,
          hasMore: offset + items.length < projects.length,
          nextOffset: offset + items.length < projects.length ? offset + items.length : null,
        },
        [],
        { projectId: null, revision: null },
      );
    }
    case "project_get": {
      const projectId = projectIdArg(args);
      if (projectId === null) return invalid("projectId must be a positive integer.");
      const project = await getProjectById(projectId);
      return project
        ? success("project.get", project, [], {
            projectId,
            revision: revisionFromProjectRecord(project),
          })
        : invalid("Project was not found.", "PROJECT_NOT_FOUND");
    }
    case "project_create_from_media":
      return enqueueProjectLifecycle(() => handleProjectCreateFromMedia(args));
    case "project_open":
      return enqueueProjectLifecycle(() => handleProjectOpen(args));
    case "project_save":
      return enqueueProjectLifecycle(() => handleProjectSave(args));
    case "project_rename":
      return enqueueProjectLifecycle(() => handleProjectRename(args));
    case "project_delete":
      return enqueueProjectLifecycle(() => handleProjectDelete(args));
    case "asset_list": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      return success("asset.list", active.project.assets);
    }
    case "asset_inspect": {
      const active = activeProject(args);
      const assetId = stringArg(args, "assetId");
      if ("error" in active) return active.error;
      if (!assetId) return invalid("assetId is required.");
      const asset = getAsset(active.project, assetId);
      return asset ? success("asset.inspect", asset, [assetId]) : invalid("Asset was not found.", "ASSET_NOT_FOUND");
    }
    case "asset_add_video": {
      const filePath = absolutePathArg(args, "filePath");
      if (!filePath) return invalid("filePath must be an absolute local path.");
      const metadata = await getVideoMetadata(filePath);
      return dispatchAndSave(args, {
        type: "asset.addVideo",
        asset: {
          path: filePath,
          name: projectNameFromPath(filePath),
          metadata,
          thumbnailPath: null,
          sourceFingerprint: `${metadata.file_size}:${metadata.duration}:${metadata.codec}`,
          kind: "video",
        },
      }, "asset.addVideo");
    }
    case "asset_remove": {
      const assetId = stringArg(args, "assetId");
      if (!assetId) return invalid("assetId is required.");
      return dispatchAndSave(args, { type: "asset.remove", assetId }, "asset.remove", [assetId]);
    }
    case "selection_get": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      return success("selection.get", {
        selectedClipId: active.state.selectedClipId,
        selectedRange: active.state.selectedRange,
        playhead: active.state.playhead,
        duration: getTimelineDuration(active.project),
        revision: active.project.revision,
      });
    }
    case "timeline_get": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      return success("timeline.get", projectContext(active.project));
    }
    case "clip_split": {
      const clipId = stringArg(args, "clipId");
      const timelineTime = numberArg(args, "timelineTime");
      if (!clipId || timelineTime === null) return invalid("clipId and finite timelineTime are required.");
      return dispatchAndSave(args, { type: "clip.splitAtPlayhead", clipId, timelineTime }, "clip.splitAtPlayhead", [clipId]);
    }
    case "clip_trim": {
      const clipId = stringArg(args, "clipId");
      const sourceStart = numberArg(args, "sourceStart");
      const sourceEnd = numberArg(args, "sourceEnd");
      if (!clipId || sourceStart === null || sourceEnd === null) return invalid("clipId, sourceStart, and sourceEnd are required.");
      return dispatchAndSave(args, { type: "clip.trim", clipId, sourceStart, sourceEnd }, "clip.trim", [clipId]);
    }
    case "clip_move": {
      const clipId = stringArg(args, "clipId");
      const destinationIndex = numberArg(args, "destinationIndex");
      if (!clipId || destinationIndex === null || !Number.isInteger(destinationIndex)) return invalid("clipId and integer destinationIndex are required.");
      return dispatchAndSave(args, { type: "clip.move", clipId, destinationIndex }, "clip.move", [clipId]);
    }
    case "clip_duplicate": {
      const clipId = stringArg(args, "clipId");
      if (!clipId) return invalid("clipId is required.");
      return dispatchAndSave(args, { type: "clip.duplicate", clipId }, "clip.duplicate", [clipId]);
    }
    case "clip_delete": {
      const clipId = stringArg(args, "clipId");
      if (!clipId) return invalid("clipId is required.");
      return dispatchAndSave(args, { type: "clip.delete", clipId }, "clip.delete", [clipId]);
    }
    case "clip_set_speed": {
      const clipId = stringArg(args, "clipId");
      const speed = numberArg(args, "speed");
      if (!clipId || speed === null) return invalid("clipId and finite speed are required.");
      return dispatchAndSave(args, { type: "clip.setSpeed", clipId, speed }, "clip.setSpeed", [clipId]);
    }
    case "clip_reset_speed": {
      const clipId = stringArg(args, "clipId");
      if (!clipId) return invalid("clipId is required.");
      return dispatchAndSave(args, { type: "clip.resetSpeed", clipId }, "clip.resetSpeed", [clipId]);
    }
    case "selection_set_playhead": {
      const timelineTime = numberArg(args, "timelineTime");
      if (timelineTime === null) return invalid("finite timelineTime is required.");
      return dispatchAndSave(args, { type: "selection.setPlayhead", timelineTime }, "selection.setPlayhead");
    }
    case "selection_select_clip":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        const clipId = args.clipId === null ? null : stringArg(args, "clipId");
        if (args.clipId !== null && !clipId) return invalid("clipId must be a string or null.");
        if (!active.state.dispatchEditorAction({ type: "selection.selectClip", clipId })) {
          return invalid("The requested clip does not exist.", "ACTION_PRECONDITION_FAILED");
        }
        return success("selection.selectClip", { selectedClipId: clipId });
      });
    case "selection_select_range":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        const start = numberArg(args, "start");
        const end = numberArg(args, "end");
        if (start === null || end === null) return invalid("start and end must be finite numbers.");
        if (!active.state.dispatchEditorAction({ type: "selection.selectRange", start, end })) {
          return invalid("The requested timeline range is invalid.", "ACTION_PRECONDITION_FAILED");
        }
        return success("selection.selectRange", { start, end });
      });
    case "history_undo": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      const revisionError = checkRevision(args, active.project.revision);
      if (revisionError) return revisionError;
      return dispatchAndSave(args, { type: "history.undo" }, "history.undo");
    }
    case "history_redo": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      const revisionError = checkRevision(args, active.project.revision);
      if (revisionError) return revisionError;
      return dispatchAndSave(args, { type: "history.redo" }, "history.redo");
    }
    case "silence_get_settings": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      return success("analysis.getSettings", active.state.detectionSettings);
    }
    case "silence_update_settings":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        const parsed = detectionSettingsUpdates(args);
        if ("error" in parsed) return parsed.error;
        active.state.updateDetectionSettings(parsed.updates);
        await saveActiveProject(active.projectId);
        return success("analysis.updateSettings", useProjectStore.getState().detectionSettings);
      });
    case "silence_detect":
      return enqueueProjectLifecycle(async () => {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      const positionedClips = getPositionedClips(active.project);
      const parsedRequest = parseSilenceDetectionRequest(
        args,
        active.state.selectedClipId,
        new Set(positionedClips.map((clip) => clip.id)),
      );
      if ("error" in parsedRequest) {
        return invalid(parsedRequest.error, parsedRequest.error.startsWith("No eligible") ? "NO_ELIGIBLE_CLIP" : "INVALID_INPUT");
      }
      const { scope, clipId: requestedClipId } = parsedRequest;
      const requestProjectId = active.projectId;
      const requestRevision = active.project.revision;
      const detectionSettings = { ...active.state.detectionSettings };
      const clips = positionedClips.filter(
        (clip) => scope === "timeline" || clip.id === requestedClipId,
      );
      if (clips.length === 0) return invalid("No eligible clip is selected for silence detection.", "NO_ELIGIBLE_CLIP");
      const ranges: Array<{ clipId: string; segments: SilenceSegment[] }> = [];
      let totalSilence = 0;
      for (const clip of clips) {
        const asset = getAsset(active.project, clip.assetId);
        if (!asset?.metadata?.has_audio) continue;
        const result = await detectSilence(
          asset.path,
          detectionSettings.noiseThreshold,
          detectionSettings.minDuration,
          clip.sourceStart,
          clip.sourceEnd,
        );
        const segments = result.segments
          .map((segment) => ({
            start: Math.max(clip.sourceStart, segment.start),
            end: Math.min(clip.sourceEnd, segment.end),
            duration: Math.min(clip.sourceEnd, segment.end) - Math.max(clip.sourceStart, segment.start),
          }))
          .filter((segment) => segment.duration >= 0.08);
        if (segments.length > 0) {
          totalSilence += segments.reduce((total, segment) => total + segment.duration, 0);
          ranges.push({ clipId: clip.id, segments });
        }
      }
      const currentState = useProjectStore.getState();
      if (
        currentState.projectId !== requestProjectId ||
        currentState.timelineProject?.revision !== requestRevision
      ) {
        return invalid(
          "The active project changed while silence detection was running. Run silence_detect again.",
          "CANDIDATE_STALE",
        );
      }
      const candidate: SilenceDetectionCandidate = {
        id: createSilenceCandidateId(requestRevision),
        projectRevision: requestRevision,
        scope,
        settings: {
          noiseThreshold: detectionSettings.noiseThreshold,
          minDuration: detectionSettings.minDuration,
          detectBreath: detectionSettings.detectBreath,
        },
        ranges,
        estimatedOutputDuration: Math.max(0, getTimelineDuration(active.project) - totalSilence),
        status: "reviewable",
      };
      currentState.setSilenceCandidate(candidate);
      return success("analysis.detectSilence", candidate);
      });
    case "silence_get_candidate": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      return success("analysis.getCandidate", active.state.silenceCandidate);
    }
    case "silence_apply_candidate":
      return enqueueProjectLifecycle(() => handleSilenceApplyCandidate(args));
    case "silence_discard_candidate":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        const candidateId = stringArg(args, "candidateId");
        if (!candidateId) return invalid("candidateId is required.");
        const candidate = active.state.silenceCandidate;
        if (!candidate || candidate.id !== candidateId) {
          return invalid("The requested silence candidate is no longer available.", "CANDIDATE_STALE");
        }
        const discardedCandidate = { ...candidate, status: "discarded" as const };
        active.state.setSilenceCandidate(null);
        return success("analysis.discardCandidate", discardedCandidate, [candidateId]);
      });
    case "export_validate": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      const resolved = resolveMcpExportSettings(active.state.exportSettings, active.project, args);
      if ("error" in resolved) return invalid(resolved.error);
      const clips = getPositionedClips(active.project);
      if (clips.length === 0) return invalid("The active project has no exportable clips.", "NO_EXPORTABLE_CLIPS");
      return success("export.validate", {
        valid: true,
        clipCount: clips.length,
        duration: getTimelineDuration(active.project) / resolved.settings.playbackRate,
        settings: resolved.settings,
      });
    }
    case "export_render": {
      const outputPath = await secureMcpOutputPathArg(args, "outputPath", ".mp4");
      const active = activeProject(args);
      if ("error" in active) return active.error;
      if (!outputPath) return invalid("Provide either fileName as a safe .mp4 basename or outputPath as an absolute path inside mcp-outputs.");
      await waitForMcpOutputCleanup(outputPath);
      const revisionError = checkRevision(args, active.project.revision);
      if (revisionError) return revisionError;
      const resolved = resolveMcpExportSettings(active.state.exportSettings, active.project, args);
      if ("error" in resolved) return invalid(resolved.error);
      const overwrite = args.overwrite;
      if (overwrite !== undefined && typeof overwrite !== "boolean") {
        return invalid("overwrite must be a boolean when provided.");
      }
      const securedArgs = { ...args, outputPath };
      const outputExistedBefore = await exists(outputPath);
      if (outputExistedBefore) {
        if (overwrite === false) {
          return invalid(
            "The output already exists. Set overwrite to true and confirm the replacement.",
            "OUTPUT_EXISTS",
          );
        }
        const confirmationArgs = normalizeOverwriteConfirmationArgs(securedArgs);
        const confirmation = consumeConfirmation(
          "cliprithm_export_render",
          confirmationArgs,
        );
        if (confirmation) return confirmation;
      }
      if (!hasMcpJobCapacity()) {
        return invalid("The MCP job limit is reached; wait for an active job to finish and retry.", "JOB_LIMIT");
      }
      const targetWidth = resolved.settings.width;
      const targetHeight = resolved.settings.height;
      const clips = renderClipsForProject(active.project, undefined, resolved.settings.playbackRate);
      if (clips.length === 0) return invalid("The active project has no exportable clips.", "NO_EXPORTABLE_CLIPS");
      const existingJob = activeMcpJob(active.projectId);
      if (existingJob?.kind === "export_render") {
        return invalid(`Project already has an active MCP job: ${existingJob.jobId}.`, "JOB_CONFLICT");
      }
      if (existingJob) {
        try {
          await cancelProjectRender(existingJob.jobId);
        } catch (error) {
          const currentPreview = mcpJobs.get(existingJob.jobId);
          const stillTrackedAsPreview = currentPreview
            && currentPreview.kind !== "export_render"
            && (currentPreview.status === "queued" || currentPreview.status === "running");
          if (!stillTrackedAsPreview || !isRenderJobAlreadyFinished(error)) {
            return invalid(
              `The active preview could not be cancelled: ${error instanceof Error ? error.message : String(error)}`,
              "JOB_CONFLICT",
            );
          }
        }
        const cancelled = updateMcpJob(existingJob.jobId, {
          status: "cancelled",
          error: "Preempted by an export job.",
        });
        if (cancelled) {
          cleanUpMcpJobOutput(cancelled);
          clearMcpPreviewJobIfOwned(cancelled);
        }
        await waitForMcpOutputCleanup(outputPath);
      }
      const remainingJob = activeMcpJob(active.projectId);
      if (remainingJob) {
        return invalid(`Project already has an active MCP job: ${remainingJob.jobId}.`, "JOB_CONFLICT");
      }
      const outputJob = activeMcpOutputJob(outputPath);
      if (outputJob) return invalid(`Output path is already being rendered by job ${outputJob.jobId}.`, "JOB_CONFLICT");
      if (outputExistedBefore) {
        forgetMcpOutput(active.projectId, outputPath);
      }
      const jobId = createMcpJobId("export_render");
      const projectRevision = active.project.revision;
      const started = startMcpRenderJob(
        {
          jobId,
          projectId: active.projectId,
          projectRevision,
          kind: "export_render",
          status: "queued",
          percent: 0,
          outputPath,
          error: null,
          outputExistedBefore,
          cleanupOutput: false,
        },
        () => renderMcpOutput(
          outputPath,
          jobId,
          outputExistedBefore,
          false,
          (renderPath) => exportProject({
            outputPath: renderPath,
            clips,
            targetWidth,
            targetHeight,
            resizeMode: resolved.settings.resizeMode,
            profile: resolved.settings.profile,
            fps: resolved.settings.fps,
            jobId,
            projectId: active.projectId,
          }),
        ),
      );
      if (!started.ok) return invalid(started.message, started.errorCode);
      return success("export.renderProject", {
        jobId,
        outputPath,
        renderedRevision: projectRevision,
        settings: resolved.settings,
      }, [jobId]);
    }
    case "preview_request": {
      const outputPath = await secureMcpOutputPathArg(args, "outputPath", ".mp4");
      const active = activeProject(args);
      if ("error" in active) return active.error;
      if (!outputPath) return invalid("Provide either fileName as a safe .mp4 basename or outputPath as an absolute path inside mcp-outputs.");
      await waitForMcpOutputCleanup(outputPath);
      const revisionError = checkRevision(args, active.project.revision);
      if (revisionError) return revisionError;
      const existingJob = activeMcpJob(active.projectId);
      if (existingJob) return invalid(`Project already has an active MCP job: ${existingJob.jobId}.`, "JOB_CONFLICT");
      const outputJob = activeMcpOutputJob(outputPath);
      if (outputJob) return invalid(`Output path is already being rendered by job ${outputJob.jobId}.`, "JOB_CONFLICT");
      if (!hasMcpJobCapacity()) {
        return invalid("The MCP job limit is reached; wait for an active job to finish and retry.", "JOB_LIMIT");
      }
      const outputExistedBefore = await exists(outputPath);
      const clips = renderClipsForProject(active.project);
      if (clips.length === 0) return invalid("The active project has no previewable clips.", "NO_PREVIEWABLE_CLIPS");
      if (outputExistedBefore) forgetMcpOutput(active.projectId, outputPath);
      const firstAsset = active.project.assets.find((asset) => asset.metadata);
      const targetWidth = firstAsset?.metadata?.width ?? 1920;
      const targetHeight = firstAsset?.metadata?.height ?? 1080;
      const jobId = createMcpJobId("sequence_preview");
      const projectRevision = active.project.revision;
      const started = startMcpRenderJob(
        {
          jobId,
          projectId: active.projectId,
          projectRevision,
          kind: "sequence_preview",
          status: "queued",
          percent: 0,
          outputPath,
          error: null,
          outputExistedBefore,
          cleanupOutput: false,
        },
        () => renderMcpOutput(
          outputPath,
          jobId,
          outputExistedBefore,
          true,
          (renderPath) => generateProjectPreview({
            outputPath: renderPath,
            clips,
            targetWidth,
            targetHeight,
            jobId,
            projectId: active.projectId,
          }),
        ),
      );
      if (!started.ok) return invalid(started.message, started.errorCode);
      return success("preview.request", { jobId, outputPath, renderedRevision: projectRevision }, [jobId]);
    }
    case "preview_request_window": {
      const outputPath = await secureMcpOutputPathArg(args, "outputPath", ".mp4");
      const active = activeProject(args);
      const center = numberArg(args, "center");
      const duration = numberArg(args, "duration");
      if ("error" in active) return active.error;
      if (!outputPath || center === null || duration === null || duration <= 0 || duration > 300) {
        return invalid("outputPath, finite center, and duration between 0 and 300 seconds are required.");
      }
      await waitForMcpOutputCleanup(outputPath);
      const revisionError = checkRevision(args, active.project.revision);
      if (revisionError) return revisionError;
      const existingJob = activeMcpJob(active.projectId);
      if (existingJob) return invalid(`Project already has an active MCP job: ${existingJob.jobId}.`, "JOB_CONFLICT");
      const outputJob = activeMcpOutputJob(outputPath);
      if (outputJob) return invalid(`Output path is already being rendered by job ${outputJob.jobId}.`, "JOB_CONFLICT");
      if (!hasMcpJobCapacity()) {
        return invalid("The MCP job limit is reached; wait for an active job to finish and retry.", "JOB_LIMIT");
      }
      const outputExistedBefore = await exists(outputPath);
      const totalDuration = getTimelineDuration(active.project);
      if (center < 0 || center > totalDuration) return invalid("center must be inside the current timeline.");
      const start = Math.max(0, center - duration / 2);
      const end = Math.min(totalDuration, start + duration);
      const clips = renderClipsForProject(active.project, { start, end });
      if (clips.length === 0) return invalid("The requested window has no previewable clips.", "NO_PREVIEWABLE_CLIPS");
      if (outputExistedBefore) forgetMcpOutput(active.projectId, outputPath);
      const firstAsset = active.project.assets.find((asset) => asset.metadata);
      const targetWidth = firstAsset?.metadata?.width ?? 1920;
      const targetHeight = firstAsset?.metadata?.height ?? 1080;
      const jobId = createMcpJobId("preview_window");
      const projectRevision = active.project.revision;
      const started = startMcpRenderJob(
        {
          jobId,
          projectId: active.projectId,
          projectRevision,
          kind: "preview_window",
          status: "queued",
          percent: 0,
          outputPath,
          error: null,
          outputExistedBefore,
          cleanupOutput: false,
          window: { start, end },
        },
        () => renderMcpOutput(
          outputPath,
          jobId,
          outputExistedBefore,
          true,
          (renderPath) => generateProjectPreview({
            outputPath: renderPath,
            clips,
            targetWidth,
            targetHeight,
            jobId,
            projectId: active.projectId,
          }),
        ),
      );
      if (!started.ok) return invalid(started.message, started.errorCode);
      return success("preview.requestWindow", { jobId, outputPath, renderedRevision: projectRevision }, [jobId]);
    }
    case "preview_use_source":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        active.state.setPreviewMode("source");
        await saveActiveProject(active.projectId);
        return success("preview.useSource", { previewMode: "source" });
      });
    case "preview_use_edited":
      return enqueueProjectLifecycle(async () => {
        const active = activeProject(args);
        if ("error" in active) return active.error;
        if (!active.state.editedPreviewFilePath && !hasPendingEditedPreview(active.projectId, active.project.revision)) {
          return invalid("No current edited preview is available or pending.", "PREVIEW_NOT_AVAILABLE");
        }
        active.state.setPreviewMode("edited");
        await saveActiveProject(active.projectId);
        return success("preview.useEdited", { previewMode: "edited" });
      });
    case "job_get": {
      const active = activeProject(args);
      const jobId = stringArg(args, "jobId");
      if ("error" in active) return active.error;
      if (!jobId) return invalid("jobId is required.");
      const job = mcpJobs.get(jobId);
      if (!job || job.projectId !== active.projectId) return invalid("MCP job was not found.", "JOB_NOT_FOUND");
      return success("job.get", job, [jobId]);
    }
    case "job_cancel":
    case "preview_cancel":
    case "export_cancel": {
      const active = activeProject(args);
      const jobId = stringArg(args, "jobId");
      if ("error" in active) return active.error;
      if (!jobId) return invalid("jobId is required.");
      const job = mcpJobs.get(jobId);
      if (!job || job.projectId !== active.projectId) return invalid("MCP job was not found.", "JOB_NOT_FOUND");
      if (normalizedName === "preview_cancel" && job.kind === "export_render") return invalid("The requested job is not a preview.", "JOB_KIND_MISMATCH");
      if (normalizedName === "export_cancel" && job.kind !== "export_render") return invalid("The requested job is not an export.", "JOB_KIND_MISMATCH");
      if (job.status === "complete" || job.status === "failed" || job.status === "cancelled") return success("job.cancel", job, [jobId]);
      await cancelProjectRender(jobId);
      const cancelled = updateMcpJob(jobId, { status: "cancelled", error: "Cancelled by MCP client." });
      clearMcpPreviewJobIfOwned(cancelled ?? job);
      return success("job.cancel", cancelled, [jobId]);
    }
    case "semantic_range_list": {
      const active = activeProject(args);
      if ("error" in active) return active.error;
      const offset = Math.max(0, Math.floor(numberArg(args, "offset") ?? 0));
      const limit = Math.min(50, Math.max(1, Math.floor(numberArg(args, "limit") ?? 20)));
      const contexts = getSemanticRangeContexts(active.project).slice(offset, offset + limit);
      return success("semanticRange.list", {
        items: contexts,
        totalCount: active.project.semanticRanges.length,
        offset,
        count: contexts.length,
        hasMore: offset + contexts.length < active.project.semanticRanges.length,
        nextOffset: offset + contexts.length < active.project.semanticRanges.length ? offset + contexts.length : null,
      });
    }
    case "semantic_range_get": {
      const active = activeProject(args);
      const rangeId = stringArg(args, "rangeId");
      if ("error" in active) return active.error;
      if (!rangeId) return invalid("rangeId is required.");
      const range = active.project.semanticRanges.find((candidate) => candidate.id === rangeId);
      return range ? success("semanticRange.get", getSemanticRangeContext(active.project, range), [rangeId]) : invalid("Semantic range was not found.", "RANGE_NOT_FOUND");
    }
    case "semantic_range_create": {
      const title = stringArg(args, "title");
      const description = stringArg(args, "description");
      const timelineStart = numberArg(args, "timelineStart");
      const timelineEnd = numberArg(args, "timelineEnd");
      const tags = args.tags === undefined ? [] : args.tags;
      if (!title || !description || timelineStart === null || timelineEnd === null || !Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
        return invalid("title, description, timelineStart, timelineEnd, and string tags are required.");
      }
      return dispatchAndSave(args, {
        type: "semanticRange.add",
        range: {
          title,
          description,
          tags,
          timelineStart,
          timelineEnd,
          createdBy: "ai",
        },
      }, "semanticRange.add");
    }
    case "semantic_range_update": {
      const rangeId = stringArg(args, "rangeId");
      if (!rangeId || !args.updates || typeof args.updates !== "object" || Array.isArray(args.updates)) {
        return invalid("rangeId and an updates object are required.");
      }
      const rawUpdates = args.updates as Record<string, unknown>;
      const allowed = ["title", "description", "tags", "timelineStart", "timelineEnd"];
      if (Object.keys(rawUpdates).some((key) => !allowed.includes(key))) {
        return invalid("Only title, description, tags, timelineStart, and timelineEnd may be updated.");
      }
      const updates: Partial<Pick<SemanticRange, "title" | "description" | "tags" | "timelineStart" | "timelineEnd">> = {};
      if (Object.prototype.hasOwnProperty.call(rawUpdates, "title")) {
        if (typeof rawUpdates.title !== "string") return invalid("title must be a string.");
        updates.title = rawUpdates.title;
      }
      if (Object.prototype.hasOwnProperty.call(rawUpdates, "description")) {
        if (typeof rawUpdates.description !== "string") return invalid("description must be a string.");
        updates.description = rawUpdates.description;
      }
      if (Object.prototype.hasOwnProperty.call(rawUpdates, "tags")) {
        if (!Array.isArray(rawUpdates.tags) || !rawUpdates.tags.every((tag) => typeof tag === "string")) return invalid("tags must be an array of strings.");
        updates.tags = rawUpdates.tags;
      }
      if (Object.prototype.hasOwnProperty.call(rawUpdates, "timelineStart")) {
        if (rawUpdates.timelineStart !== null && typeof rawUpdates.timelineStart !== "number") return invalid("timelineStart must be a finite number.");
        updates.timelineStart = rawUpdates.timelineStart as number | null;
      }
      if (Object.prototype.hasOwnProperty.call(rawUpdates, "timelineEnd")) {
        if (rawUpdates.timelineEnd !== null && typeof rawUpdates.timelineEnd !== "number") return invalid("timelineEnd must be a finite number.");
        updates.timelineEnd = rawUpdates.timelineEnd as number | null;
      }
      return dispatchAndSave(args, { type: "semanticRange.update", rangeId, updates }, "semanticRange.update", [rangeId]);
    }
    case "semantic_range_delete": {
      const rangeId = stringArg(args, "rangeId");
      if (!rangeId) return invalid("rangeId is required.");
      return dispatchAndSave(args, { type: "semanticRange.delete", rangeId }, "semanticRange.delete", [rangeId]);
    }
    default:
      return invalid(`Tool '${name}' is not implemented by the active editor bridge.`, "TOOL_NOT_IMPLEMENTED");
  }
}

export async function handleMcpRequest(request: McpRequest): Promise<void> {
  try {
    const result = await handleTool(request.name, request.arguments ?? {});
    await invoke("resolve_mcp_request", {
      requestId: request.requestId,
      result,
      error: null,
    });
  } catch (error) {
    await invoke("resolve_mcp_request", {
      requestId: request.requestId,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function startMcpBridge(): Promise<UnlistenFn> {
  const unlisten = await listen<McpRequest>("mcp-request", (event) => {
    void handleMcpRequest(event.payload);
  });
  const unlistenProgress = await listen<ProcessingProgress>("export-progress", (event) => {
    const progress = event.payload;
    if (!progress.jobId) return;
    const job = mcpJobs.get(progress.jobId);
    if (!job || job.status === "cancelled") return;
    updateMcpJob(progress.jobId, {
      status: progress.stage === "complete" ? "complete" : "running",
      percent: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : job.percent,
    });
  });
  try {
    await invoke("register_mcp_catalog", { catalog: MCP_TOOL_CATALOG });
  } catch (error) {
    unlisten();
    unlistenProgress();
    throw error;
  }
  return () => {
    unlisten();
    unlistenProgress();
  };
}

export interface McpServerResponse {
  running: boolean;
  port: number | null;
  url: string | null;
  token: string | null;
  error: string | null;
}

export async function getMcpServerStatus() {
  return invoke<McpServerResponse>("get_mcp_server_status");
}

export async function startMcpServer(port?: number) {
  return invoke<McpServerResponse>("start_mcp_server", { port: port ?? null });
}

export async function stopMcpServer() {
  return invoke<McpServerResponse>("stop_mcp_server");
}
