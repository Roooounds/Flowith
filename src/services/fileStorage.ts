// ─── File System Access API + Tauri storage ───────────────────────

// WICG File System Access API types (experimental, not in standard TS lib)
declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface FileSystemDirectoryHandle {
    name: string;
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
    getFile(): Promise<File>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | Blob | ArrayBuffer): Promise<void>;
    close(): Promise<void>;
  }

  interface Window {
    showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
}

interface StoredDirHandle {
  name: string;
}

const DIR_DB = "flowith_dirs";
const DIR_STORE = "handles";

function openDirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DIR_STORE, { keyPath: "projectId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  try {
    return (await handle.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

async function writeFile(
  handle: FileSystemDirectoryHandle,
  filename: string,
  content: string,
) {
  if (!(await verifyPermission(handle, "readwrite"))) return;
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function readFile(
  handle: FileSystemDirectoryHandle,
  filename: string,
): Promise<string | null> {
  if (!(await verifyPermission(handle, "read"))) return null;
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────

let activeHandle: FileSystemDirectoryHandle | null = null;

let selectedFolderPath: string | null = null;

export async function selectProjectFolder(): Promise<string | null> {
  // Try Tauri native dialog first
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ directory: true, multiple: false, title: "Select Project Folder" });
    if (path) {
      selectedFolderPath = path as string;
      const name = selectedFolderPath.split("/").pop() || selectedFolderPath.split("\\").pop() || selectedFolderPath;
      // Also try browser API for file operations
      try { activeHandle = await window.showDirectoryPicker({ mode: "readwrite" }); } catch {}
      return name;
    }
    return null;
  } catch {
    // Tauri not available, try browser API
  }

  try {
    activeHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    return activeHandle.name;
  } catch {
    return null;
  }
}

export function hasFolderAccess(): boolean {
  return activeHandle !== null || selectedFolderPath !== null;
}

export async function saveToFolder(projectId: string, data: string): Promise<boolean> {
  if (!activeHandle) return false;
  try {
    await writeFile(activeHandle, `${projectId}.json`, data);
    return true;
  } catch {
    return false;
  }
}

export async function loadFromFolder(projectId: string): Promise<string | null> {
  if (!activeHandle) return null;
  return readFile(activeHandle, `${projectId}.json`);
}

export async function deleteFromFolder(projectId: string): Promise<boolean> {
  if (!activeHandle || !(await verifyPermission(activeHandle, "readwrite"))) return false;
  try {
    await activeHandle.removeEntry(`${projectId}.json`);
    return true;
  } catch {
    return false;
  }
}

async function getOutputsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!activeHandle || !(await verifyPermission(activeHandle, "readwrite"))) return null;
  try {
    return await activeHandle.getDirectoryHandle("outputs", { create: true });
  } catch {
    return null;
  }
}

// ─── Content type detection ───────────────────────────────────────

function detectContentType(content: string, nodeType: string): {
  ext: string;
  data: string;
  icon: string;
} {
  if (nodeType === "decision") {
    return { ext: ".json", data: JSON.stringify({ result: content, evaluated: new Date().toISOString() }, null, 2), icon: "📊" };
  }
  if (/^\s*[\{\[]/.test(content)) {
    try { JSON.parse(content); return { ext: ".json", data: content, icon: "📋" }; } catch {}
  }
  const imgMatch = content.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)/i);
  if (imgMatch) {
    const mimeType = imgMatch[1].replace("+xml", "").replace("jpeg", "jpg");
    const binary = atob(imgMatch[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ext: `.${mimeType}`, data: new Blob([bytes]).toString(), icon: "🖼️" };
  }
  const vidMatch = content.match(/^data:video\/(mp4|webm|mov);base64,/i);
  if (vidMatch) {
    return { ext: ".video.json", data: JSON.stringify({ type: `video/${vidMatch[1]}`, size: content.length, note: "Video stored as metadata" }, null, 2), icon: "🎬" };
  }
  if (/\.pptx?\b/i.test(content) || /PPT|PowerPoint|演示文稿/.test(content)) {
    return { ext: ".pptx.json", data: JSON.stringify({ type: "powerpoint", description: content.slice(0, 500) }, null, 2), icon: "📽️" };
  }
  if (/\.xlsx?\b/i.test(content) || /\bExcel\b|电子表格|spreadsheet/i.test(content)) {
    return { ext: ".xlsx.json", data: JSON.stringify({ type: "excel", description: content.slice(0, 500) }, null, 2), icon: "📊" };
  }
  const codeBlockMatch = content.match(/```(\w+)\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const langMap: Record<string, string> = { python: "py", py: "py", javascript: "js", js: "js", typescript: "ts", ts: "ts", html: "html", css: "css", json: "json", rust: "rs", go: "go", java: "java", cpp: "cpp", c: "c", sql: "sql", sh: "sh", bash: "sh", yaml: "yml", xml: "xml", markdown: "md", md: "md" };
    const lang = codeBlockMatch[1].toLowerCase();
    const ext = langMap[lang] || lang;
    return { ext: `.${ext}`, data: codeBlockMatch[2].trim(), icon: "💻" };
  }
  if (/^(import |from |def |class |function |const |let |var |#!\/|\/\/ |package |use )/.test(content.trim())) {
    if (/^(import |def |class |print|from |# )/.test(content.trim())) return { ext: ".py", data: content, icon: "🐍" };
    if (/^(const |let |var |function |import |export |\/\/ |\/\*)/.test(content.trim())) return { ext: ".js", data: content, icon: "💛" };
  }
  if (/^#+\s|\[.+\]\(.+\)|\*\*.*\*\*/.test(content) || content.includes("---")) {
    return { ext: ".md", data: content, icon: "📖" };
  }
  if (/^[\w\s,"'\t]+$/.test(content.trim().slice(0, 200)) && (content.includes(",") || content.includes("\t"))) {
    return { ext: ".csv", data: content, icon: "📈" };
  }
  return { ext: ".txt", data: content, icon: "📄" };
}

export async function saveOutputToFolder(
  nodeName: string,
  content: string,
  nodeType: string,
): Promise<{ filename: string; icon: string } | null> {
  const { ext, data, icon } = detectContentType(content, nodeType);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeName = nodeName.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 40);
  const filename = `${ts}_${safeName}${ext}`;

  // Try Tauri native file write
  if (selectedFolderPath) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fullPath = await invoke<string>("write_output_file", {
        folder: selectedFolderPath,
        filename,
        content: data,
      });
      return { filename: fullPath, icon };
    } catch {
      // Tauri write failed, try browser API
    }
  }

  // Browser fallback
  const dir = await getOutputsDir();
  if (!dir) return null;
  try {
    await writeFile(activeHandle!, `outputs/${filename}`, data);
    return { filename: `outputs/${filename}`, icon };
  } catch {
    return null;
  }
}

export async function saveAllOutputs(
  outputs: { name: string; content: string; type: string }[],
): Promise<string[]> {
  const saved: string[] = [];
  for (const out of outputs) {
    if (!out.content) continue;
    const result = await saveOutputToFolder(out.name, out.content, out.type);
    if (result) saved.push(result.filename);
  }
  return saved;
}

// ─── Open folder (Tauri native or browser fallback) ──────────────

/**
 * Try to open a folder in the OS file explorer.
 * Uses Tauri native API when available, falls back to showing a folder picker.
 */
export async function openFile(filePath: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_file", { path: filePath });
  } catch {
    // Fallback: not in Tauri
  }
}

export async function openProjectFolder(folderName?: string) {
  const path = selectedFolderPath || folderName;
  // Try Tauri native opener
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_folder", { path: path || "." });
    return;
  } catch {
    // Not running in Tauri — fall back
  }
  // Browser fallback
  try {
    await window.showDirectoryPicker({ mode: "readwrite" });
  } catch {}
}
