/// Manages the Python FastAPI backend subprocess lifecycle.
/// Spawns Python on app startup, monitors health, and exposes status to the frontend.
/// Uses ureq (already a dependency) for HTTP — no extra crates needed.

use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

static PYTHON_PORT: u16 = 8420;

/// Global handle to the Python child process, so we can kill it on shutdown.
static PYTHON_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Spawn the Python backend process.
/// Blocks up to 30s waiting for the health check to pass.
pub fn start_python_backend() -> Result<String, String> {
    let backend_dir = find_backend_dir()?;

    let main_py = backend_dir.join("main.py");
    if !main_py.exists() {
        return Err(format!("backend/main.py not found at {}", main_py.display()));
    }

    // Install dependencies if needed
    let req_file = backend_dir.join("requirements.txt");
    if req_file.exists() {
        let _ = install_requirements(&backend_dir);
    }

    let child = Command::new("python3")
        .args(["-u", main_py.to_str().unwrap_or("main.py")])
        .current_dir(&backend_dir)
        .env("PYTHONUNBUFFERED", "1")
        .spawn()
        .map_err(|e| format!("Failed to start Python backend: {}", e))?;

    let mut proc = PYTHON_PROCESS.lock().map_err(|e| format!("Lock error: {}", e))?;
    *proc = Some(child);
    drop(proc);

    // Wait for the backend to become healthy (poll /health)
    for _ in 0..30 {
        if check_health_blocking() {
            let path_str = backend_dir.to_string_lossy().to_string();
            return Ok(path_str);
        }
        thread::sleep(Duration::from_secs(1));
    }

    kill_python_backend();
    Err("Python backend started but health check timed out (30s)".to_string())
}

/// Kill the Python subprocess if it's running.
pub fn kill_python_backend() {
    if let Ok(mut proc) = PYTHON_PROCESS.lock() {
        if let Some(ref mut child) = *proc {
            let _ = child.kill();
            let _ = child.wait();
        }
        *proc = None;
    }
}

/// Synchronous health check via ureq GET /health.
fn check_health_blocking() -> bool {
    let url = format!("http://127.0.0.1:{}/health", PYTHON_PORT);
    ureq::get(&url)
        .timeout(Duration::from_secs(2))
        .call()
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

/// Install Python dependencies from requirements.txt.
fn install_requirements(backend_dir: &std::path::Path) -> Result<(), String> {
    let req_file = backend_dir.join("requirements.txt");
    let output = Command::new("pip3")
        .args(["install", "-r", &req_file.to_string_lossy(), "--quiet"])
        .current_dir(backend_dir)
        .output()
        .map_err(|e| format!("pip install failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pip install error: {}", stderr));
    }
    Ok(())
}

/// Locate the backend directory.
/// Dev mode: <project_root>/backend
/// Bundled mode: alongside the binary (or in macOS Resources/)
fn find_backend_dir() -> Result<std::path::PathBuf, String> {
    // Dev mode — relative to cwd
    let cwd_backend = std::env::current_dir()
        .map_err(|e| format!("cwd error: {}", e))?
        .join("backend");
    if cwd_backend.join("main.py").exists() {
        return Ok(cwd_backend);
    }

    // Bundled mode — relative to executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled = exe_dir.join("backend");
            if bundled.join("main.py").exists() {
                return Ok(bundled);
            }
            #[cfg(target_os = "macos")]
            {
                let resources = exe_dir.join("../Resources/backend");
                if resources.join("main.py").exists() {
                    return Ok(std::path::PathBuf::from(resources));
                }
            }
        }
    }

    Err("Could not find backend directory. Expected backend/main.py".to_string())
}

// ─── Tauri commands ────────────────────────────────────────────────

#[tauri::command]
pub fn python_backend_status() -> String {
    if check_health_blocking() {
        serde_json::json!({"status": "running", "port": PYTHON_PORT}).to_string()
    } else {
        serde_json::json!({"status": "stopped", "port": PYTHON_PORT}).to_string()
    }
}

#[tauri::command]
pub fn python_backend_restart() -> Result<String, String> {
    kill_python_backend();
    // Give the OS a moment to free the port
    thread::sleep(Duration::from_millis(500));
    start_python_backend()
}

/// Auto-start hook — called from the Tauri setup closure.
pub fn auto_start(_app: &AppHandle) {
    match start_python_backend() {
        Ok(dir) => log::info!("Python backend started from {}", dir),
        Err(e) => log::warn!("Python backend did not start: {} — some features will be limited", e),
    }
}
