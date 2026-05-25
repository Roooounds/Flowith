/**
 * Database Service — SQLite persistence via tauri-plugin-sql
 * Replaces localStorage with a real database.
 * Schema uses a simple JSON-blob approach matching the existing
 * localStorage structure for easy migration.
 */

import type { Project } from "../types/project";

// ─── Types ───

interface AppState {
  activeProjectId: string | null;
}

// ─── Singleton ───

let db: Awaited<ReturnType<typeof import("@tauri-apps/plugin-sql").default.load>> | null = null;

async function getDb() {
  if (db) return db;
  // Dynamic import — only works in Tauri context (not in tests)
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  db = await Database.load("sqlite:flowith.db");
  await initSchema();
  return db;
}

// ─── Schema ───

async function initSchema(): Promise<void> {
  const database = db!;
  await database.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Knowledge base tables (for future use by Rust embedding service)
  await database.execute(`
    CREATE TABLE IF NOT EXISTS kb_documents (
      doc_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT DEFAULT 'text',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(project_id)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS kb_embeddings (
      doc_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(project_id),
      FOREIGN KEY (doc_id) REFERENCES kb_documents(doc_id)
    )
  `);
}

// ─── Migration from localStorage ───

export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    const database = await getDb();

    // Check if we already have data in SQLite
    const countResult = await database.select<[{ cnt: number }]>(
      "SELECT COUNT(*) as cnt FROM projects"
    );
    if (countResult[0]?.cnt > 0) {
      console.log("[DB] SQLite already has data, skipping migration");
      return false; // Already migrated
    }

    // Read from localStorage
    const raw = localStorage.getItem("flowith_projects");
    if (!raw) {
      console.log("[DB] No localStorage data to migrate");
      return false;
    }

    const data = JSON.parse(raw) as {
      projects: Project[];
      activeProjectId: string | null;
    };

    if (!data.projects?.length) {
      console.log("[DB] localStorage data empty, skipping migration");
      return false;
    }

    console.log(`[DB] Migrating ${data.projects.length} projects from localStorage...`);

    // Insert each project
    for (const project of data.projects) {
      await database.execute(
        `INSERT OR REPLACE INTO projects (project_id, data_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [
          project.projectId,
          JSON.stringify(project),
          project.createdAt || new Date().toISOString(),
          project.updatedAt || new Date().toISOString(),
        ]
      );
    }

    // Save app state
    if (data.activeProjectId) {
      await database.execute(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ($1, $2)`,
        ["activeProjectId", data.activeProjectId]
      );
    }

    console.log(`[DB] Migration complete — ${data.projects.length} projects saved to SQLite`);
    return true;
  } catch (e) {
    console.error("[DB] Migration failed:", e);
    return false;
  }
}

// ─── Project CRUD ───

export async function loadAllProjects(): Promise<{
  projects: Project[];
  activeProjectId: string | null;
}> {
  try {
    const database = await getDb();

    const rows = await database.select<Array<{ project_id: string; data_json: string }>>(
      "SELECT project_id, data_json FROM projects ORDER BY updated_at DESC"
    );

    const projects: Project[] = rows.map((row) => JSON.parse(row.data_json));

    const stateRows = await database.select<Array<{ value: string }>>(
      "SELECT value FROM app_state WHERE key = 'activeProjectId'"
    );
    const activeProjectId = stateRows[0]?.value || null;

    return { projects, activeProjectId };
  } catch (e) {
    console.error("[DB] loadAllProjects failed:", e);
    return { projects: [], activeProjectId: null };
  }
}

export async function saveProject(project: Project): Promise<void> {
  try {
    const database = await getDb();
    await database.execute(
      `INSERT OR REPLACE INTO projects (project_id, data_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [
        project.projectId,
        JSON.stringify(project),
        project.createdAt || new Date().toISOString(),
        new Date().toISOString(),
      ]
    );
  } catch (e) {
    console.error("[DB] saveProject failed:", e);
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  try {
    const database = await getDb();
    await database.execute("DELETE FROM projects WHERE project_id = $1", [projectId]);
    // Also clean up KB data
    await database.execute("DELETE FROM kb_documents WHERE project_id = $1", [projectId]);
    await database.execute("DELETE FROM kb_embeddings WHERE project_id = $1", [projectId]);
  } catch (e) {
    console.error("[DB] deleteProject failed:", e);
  }
}

export async function saveActiveProjectId(projectId: string | null): Promise<void> {
  try {
    const database = await getDb();
    if (projectId) {
      await database.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('activeProjectId', $1)",
        [projectId]
      );
    } else {
      await database.execute("DELETE FROM app_state WHERE key = 'activeProjectId'");
    }
  } catch (e) {
    console.error("[DB] saveActiveProjectId failed:", e);
  }
}

// ─── Knowledge Base CRUD (frontend-side setup) ───

export async function addKbDocument(
  docId: string,
  projectId: string,
  title: string,
  content: string,
  sourceType: string = "text"
): Promise<void> {
  try {
    const database = await getDb();
    await database.execute(
      `INSERT OR REPLACE INTO kb_documents (doc_id, project_id, title, content, source_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [docId, projectId, title, content, sourceType, new Date().toISOString()]
    );
  } catch (e) {
    console.error("[DB] addKbDocument failed:", e);
  }
}

export async function getKbDocuments(
  projectId: string
): Promise<Array<{ doc_id: string; title: string; content: string; source_type: string; created_at: string }>> {
  try {
    const database = await getDb();
    return await database.select(
      "SELECT doc_id, title, content, source_type, created_at FROM kb_documents WHERE project_id = $1 ORDER BY created_at DESC",
      [projectId]
    );
  } catch (e) {
    console.error("[DB] getKbDocuments failed:", e);
    return [];
  }
}

export async function deleteKbDocument(docId: string): Promise<void> {
  try {
    const database = await getDb();
    await database.execute("DELETE FROM kb_documents WHERE doc_id = $1", [docId]);
    await database.execute("DELETE FROM kb_embeddings WHERE doc_id = $1", [docId]);
  } catch (e) {
    console.error("[DB] deleteKbDocument failed:", e);
  }
}

// ─── Batch save (for Zustand subscriber) ───

export async function saveAllProjects(
  projects: Project[],
  activeProjectId: string | null
): Promise<void> {
  try {
    const database = await getDb();

    // Use a transaction-like approach: delete all then re-insert
    // (simpler than tracking individual changes)
    await database.execute("DELETE FROM projects");

    for (const project of projects) {
      await database.execute(
        `INSERT INTO projects (project_id, data_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [
          project.projectId,
          JSON.stringify(project),
          project.createdAt || new Date().toISOString(),
          project.updatedAt || new Date().toISOString(),
        ]
      );
    }

    await saveActiveProjectId(activeProjectId);
  } catch (e) {
    console.error("[DB] saveAllProjects failed:", e);
  }
}
