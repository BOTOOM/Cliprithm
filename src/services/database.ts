import Database from "@tauri-apps/plugin-sql";
import { log } from "../lib/logger";
import { isDesktopRuntime } from "../lib/runtime";

export interface ProjectRecord {
  id: number;
  name: string;
  file_path: string;
  thumbnail_path: string | null;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  processed_path: string | null;
  status: string;
  noise_threshold: number;
  min_duration: number;
  mode: string;
  silence_segments: string;
  created_at: string;
  updated_at: string;
}

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;
let memoryNextId = 1;
const memoryProjects: ProjectRecord[] = [];
const memorySettings = new Map<string, string>();

function nowIso(): string {
  return new Date().toISOString();
}

async function getDb(): Promise<Database> {
  if (db) {
    return db;
  }

  if (!dbPromise) {
    log.info("[db]", "Opening SQLite database: silencut.db");
    dbPromise = Database.load("sqlite:silencut.db").then((database) => {
      db = database;
      log.info("[db]", "Database opened OK");
      return database;
    });
  }

  return dbPromise;
}

export async function getAllProjects(): Promise<ProjectRecord[]> {
  if (!isDesktopRuntime()) {
    return [...memoryProjects].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  log.debug("[db]", "getAllProjects()");
  const database = await getDb();
  return database.select<ProjectRecord[]>(
    "SELECT * FROM projects ORDER BY updated_at DESC"
  );
}

export async function getProjectById(id: number): Promise<ProjectRecord | null> {
  if (!isDesktopRuntime()) {
    return memoryProjects.find((project) => project.id === id) ?? null;
  }

  const database = await getDb();
  const results = await database.select<ProjectRecord[]>(
    "SELECT * FROM projects WHERE id = $1",
    [id]
  );
  return results[0] ?? null;
}

export async function createProject(
  data: Omit<
    ProjectRecord,
    | "id"
    | "created_at"
    | "updated_at"
    | "processed_path"
    | "status"
    | "silence_segments"
  >
): Promise<number> {
  if (!isDesktopRuntime()) {
    const id = memoryNextId++;
    const timestamp = nowIso();
    memoryProjects.unshift({
      ...data,
      id,
      processed_path: null,
      status: "imported",
      silence_segments: "[]",
      created_at: timestamp,
      updated_at: timestamp,
    });
    return id;
  }

  log.info("[db]", `createProject: ${data.name} (${data.file_path})`);
  const database = await getDb();
  const result = await database.execute(
    `INSERT INTO projects (name, file_path, thumbnail_path, duration, width, height, fps, codec, file_size, noise_threshold, min_duration, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      data.name,
      data.file_path,
      data.thumbnail_path,
      data.duration,
      data.width,
      data.height,
      data.fps,
      data.codec,
      data.file_size,
      data.noise_threshold,
      data.min_duration,
      data.mode,
    ]
  );
  return result.lastInsertId ?? 0;
}

export async function updateProject(
  id: number,
  data: Partial<
    Pick<
      ProjectRecord,
      | "processed_path"
      | "status"
      | "noise_threshold"
      | "min_duration"
      | "mode"
      | "silence_segments"
      | "name"
    >
  >
): Promise<void> {
  if (!isDesktopRuntime()) {
    const project = memoryProjects.find((item) => item.id === id);
    if (project) {
      Object.assign(project, data, { updated_at: nowIso() });
    }
    return;
  }

  const database = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx += 1;
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await database.execute(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function deleteProject(id: number): Promise<void> {
  if (!isDesktopRuntime()) {
    const index = memoryProjects.findIndex((project) => project.id === id);
    if (index >= 0) {
      memoryProjects.splice(index, 1);
    }
    return;
  }

  const database = await getDb();
  await database.execute("DELETE FROM projects WHERE id = $1", [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return memorySettings.get(key) ?? null;
  }

  const database = await getDb();
  const results = await database.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return results[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!isDesktopRuntime()) {
    memorySettings.set(key, value);
    return;
  }

  const database = await getDb();
  await database.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)",
    [key, value]
  );
}
