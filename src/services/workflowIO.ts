import type { Project } from "@/types/project";

/**
 * Export the current project as a JSON file via Tauri save dialog.
 */
export async function exportWorkflow(project: Project) {
  const data = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description,
      goal: project.goal,
      agents: project.agents,
      workflow: project.workflow,
    },
  };
  const json = JSON.stringify(data, null, 2);
  const defaultName = `${project.name.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_")}.flowith.json`;

  // Try Tauri save dialog
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "Workflow JSON", extensions: ["json", "bossagent.json"] }],
      title: "Export Workflow",
    });
    if (path) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_text_file", { path, content: json });
      return;
    }
  } catch {
    // Fall back to browser download
  }

  // Browser fallback
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function readTauriFile(path: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string>("read_text_file", { path });
}

/**
 * Open native file picker and import a workflow JSON file.
 */
export async function importWorkflowNative(): Promise<Project | null> {
  try {
    // Try Tauri dialog first
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      filters: [{ name: "Workflow JSON", extensions: ["json", "bossagent.json"] }],
      multiple: false,
      title: "Import Workflow",
    });
    if (!path) return null;

    const text = await readTauriFile(path as string);
    const data = JSON.parse(text);
    const source = data.project || data;

    if (!source.workflow?.nodes || !source.workflow?.edges) {
      throw new Error("Invalid workflow file");
    }

    const idMap = new Map<string, string>();
    const newId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);

    const agents = (source.agents || []).map((a: any) => {
      const nid = newId(); idMap.set(a.agentId, nid);
      return { ...a, agentId: nid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    });

    const nodes = source.workflow.nodes.map((n: any) => {
      const nid = newId(); idMap.set(n.nodeId, nid);
      return { ...n, nodeId: nid, agentIds: (n.agentIds || []).map((aid: string) => idMap.get(aid) || aid), status: "pending", outputCache: null, executionHash: null };
    });

    const edges = source.workflow.edges.map((e: any) => ({
      ...e, edgeId: newId(), sourceNodeId: idMap.get(e.sourceNodeId) || e.sourceNodeId, targetNodeId: idMap.get(e.targetNodeId) || e.targetNodeId,
    }));

    return {
      projectId: newId(), name: source.name || "Imported Workflow", description: source.description || "", goal: source.goal || "",
      folderPath: undefined, knowledgeBaseId: null, agents,
      workflow: { nodes, edges },
      vaultAgents: source.vaultAgents || [], permanentlyDeletedPresetNames: source.permanentlyDeletedPresetNames || [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    alert(`Import failed: ${err instanceof Error ? err.message : "Invalid file"}`);
    return null;
  }
}

/**
 * Parse an imported workflow file (browser fallback).
 */
export async function parseWorkflowFile(file: File): Promise<Project | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const source = data.project || data;

    if (!source.workflow?.nodes || !source.workflow?.edges) {
      throw new Error("Invalid workflow file: missing nodes or edges");
    }

    const idMap = new Map<string, string>();
    const newId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);

    const agents = (source.agents || []).map((a: any) => {
      const nid = newId(); idMap.set(a.agentId, nid);
      return { ...a, agentId: nid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    });

    const nodes = source.workflow.nodes.map((n: any) => {
      const nid = newId(); idMap.set(n.nodeId, nid);
      return { ...n, nodeId: nid, agentIds: (n.agentIds || []).map((aid: string) => idMap.get(aid) || aid), status: "pending", outputCache: null, executionHash: null };
    });

    const edges = source.workflow.edges.map((e: any) => ({
      ...e, edgeId: newId(), sourceNodeId: idMap.get(e.sourceNodeId) || e.sourceNodeId, targetNodeId: idMap.get(e.targetNodeId) || e.targetNodeId,
    }));

    return {
      projectId: newId(), name: source.name || "Imported Workflow", description: source.description || "", goal: source.goal || "",
      folderPath: undefined, knowledgeBaseId: null, agents,
      workflow: { nodes, edges },
      vaultAgents: source.vaultAgents || [], permanentlyDeletedPresetNames: source.permanentlyDeletedPresetNames || [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    alert(`Import failed: ${err instanceof Error ? err.message : "Invalid file"}`);
    return null;
  }
}
