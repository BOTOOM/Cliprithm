import Database from "@tauri-apps/plugin-sql";
import { log } from "../lib/logger";

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

async function getDb(): Promise<Database> {
  if (!db) {
    log.info("[db]", "Opening SQLite database: silencut.db");
    db = await Database.load("sqlite:silencut.db");
    log.info("[db]", "Database opened OK");
  }
  return db;
}

export async function getAllProjects(): Promise<ProjectRecord[]> {
  log.debug("[db]", "getAllProjects()");
  const database = await getDb();
  const rows = await database.select<ProjectRecord[]>(
    "SELECT * FROM projects ORDER BY updated_at DESC"
  );
  log.debug("[db]", `getAllProjects → ${rows.length} records`);
  return rows;
}

export async function getProjectById(
  id: number
): Promise<ProjectRecord | null> {
  log.debug("[db]", `getProjectById(${id})`);
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
    "id" | "created_at" | "updated_at" | "processed_path" | "status" | "silence_segments"
  >
): Promise<number> {
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
  const newId = result.lastInsertId ?? 0;
  log.info("[db]", `createProject → id=${newId}`);
  return newId;
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
  const database = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${idx}`);
    values.push(value);
    idx++;
  }

  fields.push(`updated_at = datetime('now')`);
  values.push(id);

  await database.execute(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function deleteProject(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM projects WHERE id = $1", [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDb();
  const results = await database.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return results[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)",
    [key, value]
  );
}
