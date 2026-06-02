/// Knowledge Base module — Ollama embeddings + SQLite vector storage.
/// Uses a separate SQLite file (flowith_kb.db) managed by Rust via rusqlite,
/// avoiding conflicts with the main tauri-plugin-sql database.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

// ─── Types ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KbDocument {
    pub doc_id: String,
    pub project_id: String,
    pub title: String,
    pub content: String,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub doc_id: String,
    pub title: String,
    pub content: String,
    pub score: f32,
}

// ─── DB path ───

fn kb_db_path() -> PathBuf {
    let mut path = dirs_next::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("flowith");
    std::fs::create_dir_all(&path).ok();
    path.push("flowith_kb.db");
    path
}

// ─── DB singleton ───

static KB_DB: Mutex<Option<Connection>> = Mutex::new(None);

fn get_db() -> Result<std::sync::MutexGuard<'static, Option<Connection>>, String> {
    let mut guard = KB_DB.lock().map_err(|e| format!("Lock error: {}", e))?;
    if guard.is_none() {
        let path = kb_db_path();
        let conn = Connection::open(&path).map_err(|e| format!("Failed to open KB DB: {}", e))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
            .map_err(|e| format!("Pragma error: {}", e))?;
        init_schema(&conn)?;
        *guard = Some(conn);
    }
    Ok(guard)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kb_documents (
            doc_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            source_type TEXT DEFAULT 'text',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kb_embeddings (
            doc_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            embedding BLOB NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            FOREIGN KEY (doc_id) REFERENCES kb_documents(doc_id)
        );
        CREATE INDEX IF NOT EXISTS idx_kb_project ON kb_documents(project_id);
        CREATE INDEX IF NOT EXISTS idx_kb_emb_project ON kb_embeddings(project_id);",
    )
    .map_err(|e| format!("Schema error: {}", e))
}

// ─── Embedding API ───

const OLLAMA_EMBED_URL: &str = "http://localhost:11434/api/embeddings";
const DEFAULT_EMBED_MODEL: &str = "nomic-embed-text";

/// Call Ollama embeddings API, return the float vector.
fn get_embedding(text: &str, model: &str) -> Result<Vec<f32>, String> {
    let body = serde_json::json!({
        "model": model,
        "prompt": text,
    });

    let resp = ureq::post(OLLAMA_EMBED_URL)
        .set("Content-Type", "application/json")
        .send_json(&body)
        .map_err(|e| format!("Ollama embed request failed: {}. Is Ollama running?", e))?;

    let json: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("Parse embed response failed: {}", e))?;

    let embedding: Vec<f32> = json["embedding"]
        .as_array()
        .ok_or_else(|| {
            format!(
                "Ollama returned no embedding. Model '{}' may not support embeddings. Try: ollama pull {}",
                model, DEFAULT_EMBED_MODEL
            )
        })?
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0) as f32)
        .collect();

    Ok(embedding)
}

/// Ensure the embedding model is available. Silently fails if Ollama is not running.
fn ensure_embed_model(model: &str) {
    // Check if model exists by calling ollama list
    if let Ok(resp) = ureq::get("http://localhost:11434/api/tags").call() {
        if let Ok(json) = resp.into_json::<serde_json::Value>() {
            if let Some(models) = json["models"].as_array() {
                let exists = models.iter().any(|m| m["name"].as_str() == Some(model));
                if !exists {
                    // Model not found — try to pull it (best effort)
                    let pull_body = serde_json::json!({"name": model});
                    let _ = ureq::post("http://localhost:11434/api/pull")
                        .set("Content-Type", "application/json")
                        .send_json(&pull_body);
                }
            }
        }
    }
}

// ─── Cosine similarity ───

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

/// Convert BLOB bytes back to Vec<f32>
fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// Convert Vec<f32> to BLOB bytes
fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

// ─── Tauri commands ───

#[tauri::command]
pub fn kb_add_document(
    project_id: String,
    title: String,
    content: String,
) -> Result<KbDocument, String> {
    let guard = get_db()?;
    let conn = guard.as_ref().unwrap();

    let doc_id = uuid::Uuid::new_v4().to_string();
    let now = chrono_now();

    // Ensure embedding model
    ensure_embed_model(DEFAULT_EMBED_MODEL);

    // Generate embedding from content
    let embedding = get_embedding(&content, DEFAULT_EMBED_MODEL)?;
    let dimensions = embedding.len();
    let blob = vec_to_blob(&embedding);

    // Store document + embedding
    conn.execute(
        "INSERT INTO kb_documents (doc_id, project_id, title, content, source_type, created_at)
         VALUES (?1, ?2, ?3, ?4, 'text', ?5)",
        params![doc_id, project_id, title, content, now],
    )
    .map_err(|e| format!("Insert document failed: {}", e))?;

    conn.execute(
        "INSERT INTO kb_embeddings (doc_id, project_id, embedding, model, dimensions)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            doc_id,
            project_id,
            blob,
            DEFAULT_EMBED_MODEL,
            dimensions as i64
        ],
    )
    .map_err(|e| format!("Insert embedding failed: {}", e))?;

    Ok(KbDocument {
        doc_id,
        project_id,
        title,
        content,
        source_type: "text".into(),
        created_at: now,
    })
}

#[tauri::command]
pub fn kb_search(
    project_id: String,
    query: String,
    top_k: usize,
) -> Result<Vec<SearchResult>, String> {
    let guard = get_db()?;
    let conn = guard.as_ref().unwrap();

    // Get query embedding
    let query_emb = get_embedding(&query, DEFAULT_EMBED_MODEL)?;

    // Load all embeddings for this project
    let mut stmt = conn
        .prepare(
            "SELECT e.doc_id, e.embedding, d.title, d.content
             FROM kb_embeddings e
             JOIN kb_documents d ON e.doc_id = d.doc_id
             WHERE e.project_id = ?1",
        )
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            let doc_id: String = row.get(0)?;
            let blob: Vec<u8> = row.get(1)?;
            let title: String = row.get(2)?;
            let content: String = row.get(3)?;
            let emb = blob_to_vec(&blob);
            let score = cosine_similarity(&query_emb, &emb);
            Ok((doc_id, title, content, score))
        })
        .map_err(|e| format!("Query map failed: {}", e))?;

    // Collect, sort by score descending, take top_k
    let mut results: Vec<SearchResult> = rows
        .filter_map(|r| r.ok())
        .map(|(doc_id, title, content, score)| SearchResult {
            doc_id,
            title,
            content,
            score,
        })
        .collect();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(top_k);

    Ok(results)
}

#[tauri::command]
pub fn kb_get_documents(project_id: String) -> Result<Vec<KbDocument>, String> {
    let guard = get_db()?;
    let conn = guard.as_ref().unwrap();

    let mut stmt = conn
        .prepare(
            "SELECT doc_id, project_id, title, content, source_type, created_at
             FROM kb_documents WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Query failed: {}", e))?;

    let docs = stmt
        .query_map(params![project_id], |row| {
            Ok(KbDocument {
                doc_id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                source_type: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query map failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(docs)
}

#[tauri::command]
pub fn kb_delete_document(doc_id: String) -> Result<(), String> {
    let guard = get_db()?;
    let conn = guard.as_ref().unwrap();

    conn.execute(
        "DELETE FROM kb_embeddings WHERE doc_id = ?1",
        params![doc_id],
    )
    .map_err(|e| format!("Delete embedding failed: {}", e))?;
    conn.execute(
        "DELETE FROM kb_documents WHERE doc_id = ?1",
        params![doc_id],
    )
    .map_err(|e| format!("Delete document failed: {}", e))?;

    Ok(())
}

/// Get a context string for an agent — top relevant KB docs concatenated
#[tauri::command]
pub fn kb_get_context(project_id: String, query: String, top_k: usize) -> Result<String, String> {
    let results = kb_search(project_id, query, top_k)?;
    if results.is_empty() {
        return Ok(String::new());
    }

    let ctx: Vec<String> = results
        .iter()
        .enumerate()
        .map(|(i, r)| format!("[Document {}] {}\n{}", i + 1, r.title, r.content))
        .collect();

    Ok(ctx.join("\n\n"))
}

// ─── Helpers ───

fn chrono_now() -> String {
    // Simple ISO timestamp without chrono crate dependency
    if let Ok(now) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        let secs = now.as_secs();
        // Basic ISO format: 2024-01-15T10:30:00Z
        let days_since_epoch = secs / 86400;
        let time_of_day = secs % 86400;
        let hours = time_of_day / 3600;
        let minutes = (time_of_day % 3600) / 60;
        let secs = time_of_day % 60;

        // Simple date calculation (approximate, good enough)
        let mut year = 1970i64;
        let mut remaining_days = days_since_epoch as i64;
        loop {
            let days_in_year = if is_leap(year) { 366 } else { 365 };
            if remaining_days < days_in_year {
                break;
            }
            remaining_days -= days_in_year;
            year += 1;
        }
        let month_days = if is_leap(year) {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };
        let mut month = 0;
        for (i, &md) in month_days.iter().enumerate() {
            if remaining_days < md as i64 {
                month = i + 1;
                break;
            }
            remaining_days -= md as i64;
        }
        let day = remaining_days + 1;
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            year, month, day, hours, minutes, secs
        )
    } else {
        "1970-01-01T00:00:00Z".to_string()
    }
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
