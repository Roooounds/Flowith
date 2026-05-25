use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;
use base64::Engine;
use tauri::{AppHandle, Emitter, Manager};

mod kb;
mod python_service;

// ─── Existing commands (unchanged) ───

#[tauri::command]
fn get_app_status() -> String {
    serde_json::to_string(&serde_json::json!({
        "status": "running",
        "version": env!("CARGO_PKG_VERSION"),
    })).unwrap_or_default()
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { Command::new("open").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    #[cfg(target_os = "windows")]
    { Command::new("explorer").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    #[cfg(target_os = "linux")]
    { Command::new("xdg-open").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    Ok(())
}

#[tauri::command]
fn read_settings() -> Result<String, String> {
    let dir = dirs_next().ok_or("Cannot find config dir")?;
    let path = dir.join("flowith_settings.json");
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn write_settings(json: String) -> Result<(), String> {
    let dir = dirs_next().ok_or("Cannot find config dir")?;
    fs::create_dir_all(&dir).map_err(|e| format!("Create dir: {}", e))?;
    fs::write(dir.join("flowith_settings.json"), &json).map_err(|e| format!("Write: {}", e))?;
    Ok(())
}

fn dirs_next() -> Option<std::path::PathBuf> {
    dirs_next::config_dir().map(|d| d.join("Flowith"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { Command::new("open").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    #[cfg(target_os = "windows")]
    { Command::new("cmd").args(["/c", "start", "", &path]).spawn().map_err(|e| format!("Failed: {}", e))?; }
    #[cfg(target_os = "linux")]
    { Command::new("xdg-open").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    Ok(())
}

#[tauri::command]
fn cloud_llm_call(provider: String, api_key: String, model: String, system_prompt: String, prompt: String, temperature: f64, endpoint: String) -> Result<String, String> {
    match provider.as_str() {
        "openai" => {
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": temperature,
            });
            let resp = ureq::post("https://api.openai.com/v1/chat/completions")
                .set("Content-Type", "application/json")
                .set("Authorization", &format!("Bearer {}", api_key))
                .send_json(body)
                .map_err(|e| format!("OpenAI error: {}", e))?;
            let data: serde_json::Value = resp.into_json().map_err(|e| format!("Parse: {}", e))?;
            data["choices"][0]["message"]["content"].as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Unexpected response: {}", data))
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
            });
            let resp = ureq::post("https://api.anthropic.com/v1/messages")
                .set("Content-Type", "application/json")
                .set("x-api-key", &api_key)
                .set("anthropic-version", "2023-06-01")
                .send_json(body)
                .map_err(|e| format!("Anthropic error: {}", e))?;
            let data: serde_json::Value = resp.into_json().map_err(|e| format!("Parse: {}", e))?;
            data["content"][0]["text"].as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Unexpected response: {}", data))
        }
        "gemini" => {
            let mut body = serde_json::json!({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": temperature},
            });
            if !system_prompt.is_empty() {
                body["systemInstruction"] = serde_json::json!({"parts": [{"text": system_prompt}]});
            }
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, api_key);
            let resp = ureq::post(&url)
                .set("Content-Type", "application/json")
                .send_json(body)
                .map_err(|e| format!("Gemini error: {}", e))?;
            let data: serde_json::Value = resp.into_json().map_err(|e| format!("Parse: {}", e))?;
            data["candidates"][0]["content"]["parts"][0]["text"].as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Unexpected response: {}", data))
        }
        "custom" => {
            let base = if endpoint.is_empty() { "https://api.deepseek.com".to_string() } else { endpoint };
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": temperature,
            });
            let url = format!("{}/chat/completions", base.trim_end_matches('/'));
            let resp = ureq::post(&url)
                .set("Content-Type", "application/json")
                .set("Authorization", &format!("Bearer {}", api_key))
                .send_json(body)
                .map_err(|e| format!("Custom API error: {}", e))?;
            let data: serde_json::Value = resp.into_json().map_err(|e| format!("Parse: {}", e))?;
            data["choices"][0]["message"]["content"].as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| format!("Unexpected response: {}", data))
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

#[tauri::command]
fn comfyui_generate(base_url: String, model: String, prompt: String) -> Result<String, String> {
    let url = base_url.trim_end_matches('/');

    let workflow = serde_json::json!({
        "1": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] } },
        "2": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
        "3": { "class_type": "KSampler", "inputs": { "seed": rand::random::<u64>() % 1_000_000_000, "steps": 20, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0, "model": ["4", 0], "positive": ["1", 0], "negative": ["5", 0], "latent_image": ["2", 0] } },
        "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": model } },
        "5": { "class_type": "CLIPTextEncode", "inputs": { "text": "bad quality, blurry, distorted", "clip": ["4", 1] } },
        "6": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
        "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": "Flowith", "images": ["6", 0] } },
    });

    let resp = ureq::post(&format!("{}/prompt", url))
        .set("Content-Type", "application/json")
        .send_json(serde_json::json!({ "prompt": workflow }))
        .map_err(|e| format!("ComfyUI not reachable: {}", e))?;

    let status = resp.status();
    if status != 200 {
        let body = resp.into_string().unwrap_or_default();
        return Err(format!("ComfyUI error {}: {}", status, body));
    }

    let result: serde_json::Value = resp.into_json().map_err(|e| format!("Parse error: {}", e))?;
    let prompt_id = result["prompt_id"].as_str().ok_or("No prompt_id in response")?.to_string();

    for _ in 0..45 {
        thread::sleep(Duration::from_secs(2));
        let hist_url = format!("{}/history/{}", url, prompt_id);
        let hist = ureq::get(&hist_url).call().map_err(|e| format!("History fetch error: {}", e))?;
        if hist.status() != 200 { continue; }
        let data: serde_json::Value = hist.into_json().map_err(|_| "Invalid history JSON")?;
        let outputs = &data[&prompt_id]["outputs"];
        let images = outputs["7"]["images"].as_array();
        if images.is_none() || images.unwrap().is_empty() { continue; }
        let img = &images.unwrap()[0];
        let filename = img["filename"].as_str().unwrap_or("");
        let subfolder = img["subfolder"].as_str().unwrap_or("");
        let img_url = format!("{}/view?filename={}&subfolder={}&type=output", url, filename, subfolder);

        let img_resp = ureq::get(&img_url).call().map_err(|e| format!("Image download error: {}", e))?;
        let mut bytes = Vec::new();
        img_resp.into_reader().read_to_end(&mut bytes).map_err(|e| format!("Read error: {}", e))?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = if filename.ends_with(".png") { "image/png" } else { "image/jpeg" };
        return Ok(format!("data:{};base64,{}", mime, b64));
    }

    Err("ComfyUI generation timed out (90s)".into())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Cannot write file: {}", e))
}

#[tauri::command]
fn write_output_file(folder: String, filename: String, content: String) -> Result<String, String> {
    let outputs_dir = Path::new(&folder).join("outputs");
    fs::create_dir_all(&outputs_dir).map_err(|e| format!("Cannot create outputs dir: {}", e))?;
    let file_path = outputs_dir.join(&filename);
    fs::write(&file_path, &content).map_err(|e| format!("Cannot write file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

// ═══════════════════════════════════════════════════════════════
// Launcher — system detection & dependency installation
// ═══════════════════════════════════════════════════════════════

fn flowith_home() -> std::path::PathBuf {
    dirs_next::home_dir().unwrap_or_else(|| Path::new(".").to_path_buf()).join(".flowith")
}

const LAUNCHER_DONE_FILE: &str = ".launcher_done";

fn launcher_marker_path() -> std::path::PathBuf {
    flowith_home().join(LAUNCHER_DONE_FILE)
}

fn log(app: &AppHandle, msg: &str) {
    let _ = app.emit("launcher-log", msg);
}

fn progress(app: &AppHandle, id: &str, pct: u64) {
    let _ = app.emit("launcher-progress", serde_json::json!({"id": id, "percent": pct}));
}

fn dep_status(app: &AppHandle, id: &str, status: &str) {
    let _ = app.emit("launcher-dep-status", serde_json::json!({"id": id, "status": status}));
}

/// Download a file with progress events, write to dest.
fn download(app: &AppHandle, id: &str, url: &str, dest: &Path) -> Result<(), String> {
    log(app, &format!("Downloading {}...", url));
    let resp = ureq::get(url).call().map_err(|e| format!("Download failed: {}", e))?;
    let total: u64 = resp.header("Content-Length")
        .and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut reader = resp.into_reader();
    let mut file = fs::File::create(dest).map_err(|e| format!("Cannot create file: {}", e))?;
    let mut buf = [0u8; 65536];
    let mut downloaded: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
        if n == 0 { break; }
        file.write_all(&buf[..n]).map_err(|e| format!("Write error: {}", e))?;
        downloaded += n as u64;
        if total > 0 {
            progress(app, id, downloaded * 100 / total);
        }
    }
    log(app, "Download complete.");
    Ok(())
}

fn ollama_installed() -> bool {
    for cmd in &["ollama", "/usr/local/bin/ollama", "/opt/homebrew/bin/ollama"] {
        if let Ok(out) = Command::new(cmd).arg("--version").output() {
            if out.status.success() { return true; }
        }
    }
    false
}

fn python_installed() -> Option<String> {
    // Tauri GUI apps have a minimal PATH (e.g. /usr/bin:/bin:/usr/sbin:/sbin on macOS).
    // Homebrew python3 lives in /usr/local/bin or /opt/homebrew/bin, neither of which
    // is in the GUI PATH. Search explicit paths first, then fall back to bare command names.
    let candidates: &[&str] = if cfg!(target_os = "macos") {
        &[
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
            "python3",
            "python",
        ]
    } else if cfg!(target_os = "windows") {
        &[
            "python",
            "python3",
        ]
    } else {
        &[
            "python3",
            "python",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ]
    };
    for cmd in candidates {
        if let Ok(out) = Command::new(cmd).arg("--version").output() {
            if out.status.success() {
                let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if v.contains("3.") { return Some(v); }
            }
        }
    }
    None
}

fn git_installed() -> bool {
    // IMPORTANT: On macOS, /usr/bin/git is a stub that triggers an Xcode CLT
    // install dialog when executed. We must NOT run `git --version` unless we
    // know git is real. Instead, check known installation paths by existence.
    #[cfg(target_os = "macos")]
    {
        // 1. Xcode Command Line Tools (most common)
        if Path::new("/Library/Developer/CommandLineTools/usr/bin/git").exists() {
            return true;
        }
        // 2. Homebrew (Apple Silicon)
        if Path::new("/opt/homebrew/bin/git").exists() {
            return true;
        }
        // 3. Homebrew (Intel)
        if Path::new("/usr/local/bin/git").exists() {
            return true;
        }
        // 4. Check if CLT is installed via pkgutil (fast, non-blocking)
        if let Ok(out) = Command::new("pkgutil")
            .args(["--pkg-info", "com.apple.pkg.CLTools_Executables"])
            .output()
        {
            if out.status.success() { return true; }
        }
        // 5. Last resort: try running git but only at known real paths
        // (skip /usr/bin/git — it's the dangerous stub)
        for cmd in &["/opt/homebrew/bin/git", "/usr/local/bin/git"] {
            if let Ok(out) = Command::new(cmd).arg("--version").output() {
                if out.status.success() { return true; }
            }
        }
        return false;
    }
    #[cfg(not(target_os = "macos"))]
    {
        for cmd in &["git"] {
            if let Ok(out) = Command::new(cmd).arg("--version").output() {
                if out.status.success() { return true; }
            }
        }
        false
    }
}

#[tauri::command]
fn detect_system(app: AppHandle) -> Result<serde_json::Value, String> {
    use sysinfo::System;

    // OS
    let os = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);

    // CPU
    let mut sys = System::new_all();
    sys.refresh_all();
    let cpu = sys.cpus().first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // RAM
    let total_ram_gb = sys.total_memory() / (1024 * 1024 * 1024);
    let used_ram_gb = sys.used_memory() / (1024 * 1024 * 1024);
    let ram = format!("{} GB / {} GB", used_ram_gb, total_ram_gb);

    // GPU — basic detection
    let (gpu, gpu_ok) = detect_gpu();

    // Disk
    let home = dirs_next::home_dir().unwrap_or_else(|| Path::new(".").to_path_buf());
    let disk_free = fs2::available_space(&home)
        .map(|b| format!("{:.0} GB", b as f64 / 1_073_741_824.0))
        .unwrap_or_else(|_| "Unknown".to_string());

    log(&app, &format!("Detected: {} | {} | RAM {} | GPU {} | Disk {}", os, cpu, ram, gpu, disk_free));

    Ok(serde_json::json!({
        "os": os,
        "cpu": cpu,
        "ram": ram,
        "gpu": gpu,
        "gpu_ok": gpu_ok,
        "disk_free": disk_free,
    }))
}

fn detect_gpu() -> (String, bool) {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = Command::new("system_profiler").args(["SPDisplaysDataType"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            // Extract chip/model line
            for line in text.lines() {
                let t = line.trim();
                if t.contains("Chipset Model:") || t.contains("Chip:") {
                    let gpu = t.split(':').last().unwrap_or("Apple GPU").trim().to_string();
                    return (gpu, true);
                }
            }
        }
        ("Apple GPU (Metal)".into(), true)
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = Command::new("wmic").args(["path", "win32_VideoController", "get", "name"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines().skip(1) {
                let t = line.trim();
                if !t.is_empty() && !t.eq_ignore_ascii_case("Name") {
                    return (t.to_string(), true);
                }
            }
        }
        ("Unknown GPU".into(), false)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    ("Unknown".into(), false)
}

#[tauri::command]
fn install_ollama(app: AppHandle) -> Result<(), String> {
    if ollama_installed() {
        log(&app, "Ollama is already installed.");
        dep_status(&app, "ollama", "done");
        return Ok(());
    }

    let home = flowith_home();
    fs::create_dir_all(&home).map_err(|e| format!("Cannot create .flowith dir: {}", e))?;

    #[cfg(target_os = "macos")]
    {
        let url = "https://ollama.com/download/Ollama-darwin.dmg";
        let dmg_path = home.join("Ollama.dmg");
        log(&app, "Downloading Ollama for macOS...");
        download(&app, "ollama", url, &dmg_path)?;

        log(&app, "Mounting DMG...");
        log(&app, "System may request permission to install Ollama.");
        let mount = Command::new("hdiutil")
            .args(["attach", "-nobrowse", dmg_path.to_str().unwrap()])
            .output().map_err(|e| format!("hdiutil failed: {}", e))?;

        let mount_output = String::from_utf8_lossy(&mount.stdout);
        // Find mount point
        let vol = mount_output.lines()
            .filter(|l| l.contains("/Volumes/"))
            .last()
            .and_then(|l| l.split('\t').last())
            .map(|s| s.trim().to_string())
            .ok_or("Could not find mount point")?;

        log(&app, &format!("Installing from {}...", vol));
        let ollama_app = format!("{}/Ollama.app", vol);
        let status = Command::new("cp")
            .args(["-R", &ollama_app, "/Applications/Ollama.app"])
            .status().map_err(|e| format!("Install failed: {}", e))?;

        // Detach
        let _ = Command::new("hdiutil").args(["detach", &vol]).status();
        let _ = fs::remove_file(&dmg_path);

        if !status.success() {
            dep_status(&app, "ollama", "failed");
            return Err("Ollama installation failed. Download manually from https://ollama.com".into());
        }
    }

    #[cfg(target_os = "windows")]
    {
        let url = "https://ollama.com/download/OllamaSetup.exe";
        let exe_path = home.join("OllamaSetup.exe");
        log(&app, "Downloading Ollama for Windows...");
        download(&app, "ollama", url, &exe_path)?;

        log(&app, "Installing Ollama (silent)...");
        let status = Command::new(exe_path.to_str().unwrap())
            .args(["/S"])
            .status().map_err(|e| format!("Install failed: {}", e))?;
        let _ = fs::remove_file(&exe_path);

        if !status.success() {
            dep_status(&app, "ollama", "failed");
            return Err("Ollama installation failed. Download manually from https://ollama.com".into());
        }
    }

    dep_status(&app, "ollama", "done");
    log(&app, "Ollama installed successfully.");
    Ok(())
}

#[tauri::command]
fn pull_model(app: AppHandle) -> Result<(), String> {
    if !ollama_installed() {
        dep_status(&app, "model", "failed");
        return Err("Ollama is not installed — cannot pull model".into());
    }

    log(&app, "Pulling llama3.2:3b (~2GB). This may take a few minutes...");
    dep_status(&app, "model", "installing");

    let status = Command::new("ollama")
        .args(["pull", "llama3.2:3b"])
        .status()
        .map_err(|e| format!("ollama pull failed: {}", e))?;

    if status.success() {
        log(&app, "Model llama3.2:3b pulled successfully.");
        dep_status(&app, "model", "done");
        Ok(())
    } else {
        dep_status(&app, "model", "failed");
        Err("Failed to pull llama3.2:3b. Run `ollama pull llama3.2:3b` manually.".into())
    }
}

#[tauri::command]
fn install_python(app: AppHandle) -> Result<(), String> {
    if let Some(v) = python_installed() {
        log(&app, &format!("Python already installed: {}", v));
        dep_status(&app, "python", "done");
        return Ok(());
    }

    let home = flowith_home();
    fs::create_dir_all(&home).map_err(|e| format!("Cannot create .flowith: {}", e))?;

    #[cfg(target_os = "macos")]
    {
        // Try Homebrew first — cleanest install path
        if Command::new("brew").arg("--version").output().is_ok() {
            log(&app, "Installing Python via Homebrew (this may take several minutes)...");
            let status = Command::new("brew")
                .args(["install", "python@3.12"])
                .status().map_err(|e| format!("brew failed: {}", e))?;
            if status.success() {
                dep_status(&app, "python", "done");
                log(&app, "Python installed via Homebrew.");
                return Ok(());
            }
        }
        // No Homebrew, no automatic install — avoid sudo which triggers
        // an invisible system password dialog that freezes the UI.
        dep_status(&app, "python", "failed");
        return Err(
            "Python 3.10+ not found. Install manually via:\n  brew install python@3.12\n  or download from https://python.org".into()
        );
    }

    #[cfg(target_os = "windows")]
    {
        let url = "https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe";
        let exe = home.join("python-installer.exe");
        log(&app, "Downloading Python for Windows...");
        download(&app, "python", url, &exe)?;
        log(&app, "Installing Python (silent)...");
        let status = Command::new(exe.to_str().unwrap())
            .args(["/quiet", "InstallAllUsers=1", "PrependPath=1"])
            .status().map_err(|e| format!("Install failed: {}", e))?;
        let _ = fs::remove_file(&exe);
        if !status.success() {
            dep_status(&app, "python", "failed");
            return Err("Python install failed. Download from https://python.org".into());
        }
    }

    dep_status(&app, "python", "done");
    log(&app, "Python installed successfully.");
    Ok(())
}

#[tauri::command]
fn install_git(app: AppHandle) -> Result<(), String> {
    if git_installed() {
        log(&app, "Git is already installed.");
        dep_status(&app, "git", "done");
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // Try Homebrew first — avoids the blocking xcode-select dialog
        if Command::new("brew").arg("--version").output().is_ok() {
            log(&app, "Installing Git via Homebrew (this may take a moment)...");
            let br = Command::new("brew").args(["install", "git"]).status()
                .map_err(|e| format!("brew failed: {}", e))?;
            if br.success() {
                dep_status(&app, "git", "done");
                log(&app, "Git installed via Homebrew.");
                return Ok(());
            }
        }
        // No brew, no auto-install — xcode-select --install triggers a
        // blocking system dialog that freezes the UI.
        dep_status(&app, "git", "failed");
        return Err(
            "Git not found. Install manually:\n  brew install git\n  or run: xcode-select --install\n  or download from https://git-scm.com".into()
        );
    }

    #[cfg(target_os = "windows")]
    {
        let home = flowith_home();
        fs::create_dir_all(&home).map_err(|e| format!("Cannot create .flowith: {}", e))?;
        let url = "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/Git-2.44.0-64-bit.exe";
        let exe = home.join("Git-installer.exe");
        log(&app, "Downloading Git for Windows...");
        download(&app, "git", url, &exe)?;
        log(&app, "Installing Git (silent)...");
        let status = Command::new(exe.to_str().unwrap())
            .args(["/VERYSILENT", "/NORESTART"])
            .status().map_err(|e| format!("Install failed: {}", e))?;
        let _ = fs::remove_file(&exe);
        if !status.success() {
            dep_status(&app, "git", "failed");
            return Err("Git install failed. Install manually: https://git-scm.com".into());
        }
        dep_status(&app, "git", "done");
    }

    Ok(())
}

#[tauri::command]
fn install_comfyui(app: AppHandle) -> Result<(), String> {
    if !git_installed() {
        dep_status(&app, "comfyui", "failed");
        return Err("Git is required to clone ComfyUI. Install Git first (xcode-select --install or brew install git).".into());
    }

    let home = flowith_home();
    let comfy_dir = home.join("ComfyUI");

    if comfy_dir.join("main.py").exists() {
        log(&app, "ComfyUI already installed.");
        dep_status(&app, "comfyui", "done");
        return Ok(());
    }

    // Clean up any partial clone from a previous failed attempt
    if comfy_dir.exists() {
        log(&app, "Removing partial ComfyUI directory from previous attempt...");
        let _ = fs::remove_dir_all(&comfy_dir);
    }

    log(&app, "Cloning ComfyUI (shallow clone, ~200MB)...");
    log(&app, "This may take several minutes depending on network speed.");
    let status = Command::new("git")
        .args(["clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", comfy_dir.to_str().unwrap()])
        .status().map_err(|e| format!("git clone failed: {}", e))?;

    if !status.success() {
        // Clean up on failure
        let _ = fs::remove_dir_all(&comfy_dir);
        dep_status(&app, "comfyui", "failed");
        return Err("Failed to clone ComfyUI. Check your network connection and retry.".into());
    }

    log(&app, "Installing ComfyUI Python dependencies (this may take a while)...");
    let pip = python_pip_cmd();
    let pip_status = Command::new(pip.0)
        .args(pip.1.iter().chain(&["-r", "requirements.txt"]).cloned().collect::<Vec<_>>())
        .current_dir(&comfy_dir)
        .status().map_err(|e| format!("pip install failed: {}", e))?;

    if !pip_status.success() {
        log(&app, "Warning: pip install had issues. You may need to install deps manually.");
        log(&app, "Run: cd ~/.flowith/ComfyUI && pip install -r requirements.txt");
    }

    // Clone ComfyUI Manager plugin (optional)
    let custom_nodes = comfy_dir.join("custom_nodes");
    fs::create_dir_all(&custom_nodes).ok();
    let mgr_dir = custom_nodes.join("ComfyUI-Manager");
    if !mgr_dir.exists() {
        log(&app, "Installing ComfyUI Manager plugin...");
        let _ = Command::new("git")
            .args(["clone", "--depth", "1", "https://github.com/ltdrdata/ComfyUI-Manager.git", mgr_dir.to_str().unwrap()])
            .status();
    }

    log(&app, "ComfyUI installed. Use ComfyUI Manager to download image generation models.");
    dep_status(&app, "comfyui", "done");
    Ok(())
}

fn python_pip_cmd() -> (&'static str, Vec<&'static str>) {
    for cmd in &["python3", "python"] {
        if Command::new(cmd).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
            return (cmd, vec!["-m", "pip", "install"]);
        }
    }
    ("python3", vec!["-m", "pip", "install"])
}

#[tauri::command]
fn finish_launcher(app: AppHandle, skipped: bool) -> Result<(), String> {
    if skipped {
        log(&app, "User chose to skip dependency setup.");
    }
    log(&app, "Launching Flowith...");

    // Write marker so future launches skip the launcher
    let home = flowith_home();
    fs::create_dir_all(&home).ok();
    let marker = launcher_marker_path();
    if let Err(e) = fs::write(&marker, b"1") {
        log(&app, &format!("⚠ Could not write launcher marker: {}", e));
    }

    // Show the main window
    if let Some(main_win) = app.get_webview_window("main") {
        main_win.show().map_err(|e| format!("{}", e))?;
        main_win.set_focus().ok();
    }
    // Close the launcher window (redundant safety — JS also closes it)
    if let Some(launcher) = app.get_webview_window("launcher") {
        launcher.close().ok();
    }
    Ok(())
}

#[tauri::command]
fn validate_comfyui_path(path: String) -> Result<serde_json::Value, String> {
    let main_py = Path::new(&path).join("main.py");
    Ok(serde_json::json!({
        "valid": main_py.exists(),
        "path": path,
    }))
}

#[tauri::command]
fn relaunch_launcher(app: AppHandle) -> Result<(), String> {
    // Remove launcher-done marker so launcher shows on next restart
    let marker = launcher_marker_path();
    fs::remove_file(&marker).ok();

    // Close main window, show launcher
    if let Some(main_win) = app.get_webview_window("main") {
        main_win.hide().ok();
    }
    // Try to show existing launcher; if it was closed, this is a no-op
    // (the app must be restarted to get the launcher back after close)
    if let Some(launcher) = app.get_webview_window("launcher") {
        launcher.show().map_err(|e| format!("{}", e))?;
        launcher.set_focus().ok();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_app_status, open_folder, open_file,
            read_settings, write_settings,
            read_text_file, write_text_file, write_output_file,
            cloud_llm_call, comfyui_generate,
            // Launcher commands
            detect_system, install_ollama, pull_model,
            install_python, install_git, install_comfyui,
            finish_launcher, relaunch_launcher, validate_comfyui_path,
            // Knowledge Base commands
            kb::kb_add_document, kb::kb_search, kb::kb_get_documents,
            kb::kb_delete_document, kb::kb_get_context,
            // Python backend commands
            python_service::python_backend_status, python_service::python_backend_restart,
        ])
        .setup(|app| {
            // Skip launcher if user has already completed setup
            let marker = launcher_marker_path();
            if marker.exists() {
                if let Some(main_win) = app.get_webview_window("main") {
                    main_win.show().ok();
                    main_win.set_focus().ok();
                }
                if let Some(launcher) = app.get_webview_window("launcher") {
                    launcher.close().ok();
                }
            }
            python_service::auto_start(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
