import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProjectStore } from "@/stores/projectStore";
import type { AgentProfile } from "@/types/project";

// ─── Setup ──────────────────────────────────────────────────────

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Mock uuid to return deterministic IDs
vi.mock("uuid", () => {
  let counter = 0;
  return {
    v4: () => `test-id-${++counter}`,
    default: { v4: () => `test-id-${++counter}` },
  };
});

// Mock execution engine
vi.mock("@/services/executionEngine", () => ({
  executeWorkflow: vi.fn().mockResolvedValue([]),
}));

// Mock file storage
vi.mock("@/services/fileStorage", () => ({
  hasFolderAccess: () => false,
  saveToFolder: vi.fn().mockResolvedValue(true),
}));

// Mock LLM service
vi.mock("@/services/llmService", () => ({
  llmService: {
    call: vi.fn(),
    setMode: vi.fn(),
    getMode: vi.fn(() => "mock"),
  },
}));

// Mock Tauri dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────

function createTestAgent(): Omit<AgentProfile, "agentId" | "createdAt" | "updatedAt"> {
  return {
    name: "Test Agent",
    provider: "local_ollama",
    modelName: "llama3:8b",
    systemPrompt: "You are helpful.",
    temperature: 0.3,
    toolsAllowed: [],
  };
}

beforeEach(() => {
  localStorageMock.clear();
  // Reset the store to a clean state before each test
  useProjectStore.setState({
    projects: [],
    activeProjectId: null,
    project: null,
    canvasNodes: [],
    canvasEdges: [],
    selectedNodeId: null,
    layoutVersion: 0,
    rightPanel: null,
    isRunning: false,
    runProgress: { completed: 0, total: 0 },
    editingAgentId: null,
  });
});

// ─── Tests: Project CRUD ────────────────────────────────────────

describe("projectStore", () => {
  describe("project CRUD", () => {
    it("creates a project with default values", () => {
      useProjectStore.getState().createProject("My Project", "A test");

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].name).toBe("My Project");
      expect(state.projects[0].description).toBe("A test");
      expect(state.projects[0].workflow.nodes).toEqual([]);
      expect(state.projects[0].workflow.edges).toEqual([]);
      expect(state.projects[0].agents).toEqual([]);
      expect(state.activeProjectId).toBe(state.projects[0].projectId);
    });

    it("switches between projects", () => {
      useProjectStore.getState().createProject("Project A", "");
      useProjectStore.getState().createProject("Project B", "");

      // Find Project A
      const projects = useProjectStore.getState().projects;
      const projectAId = projects.find((p) => p.name === "Project A")!.projectId;

      useProjectStore.getState().switchProject(projectAId);

      expect(useProjectStore.getState().project?.name).toBe("Project A");
    });

    it("removes a project and switches to remaining", () => {
      useProjectStore.getState().createProject("A", "");
      useProjectStore.getState().createProject("B", "");

      const projects = useProjectStore.getState().projects;
      const projectAId = projects.find((p) => p.name === "A")!.projectId;

      useProjectStore.getState().removeProject(projectAId);

      // Project B should be active now
      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(useProjectStore.getState().project?.name).toBe("B");
    });

    it("removing last project sets state to empty", () => {
      useProjectStore.getState().createProject("Only", "");
      const id = useProjectStore.getState().project!.projectId;

      useProjectStore.getState().removeProject(id);

      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(useProjectStore.getState().activeProjectId).toBeNull();
      expect(useProjectStore.getState().project).toBeNull();
    });

    it("updates project name", () => {
      useProjectStore.getState().createProject("Old Name", "");
      useProjectStore.getState().updateProjectName("New Name");

      expect(useProjectStore.getState().project?.name).toBe("New Name");
    });

    it("updates project goal", () => {
      useProjectStore.getState().createProject("P", "");
      useProjectStore.getState().updateProjectGoal("Complete the mission");

      expect(useProjectStore.getState().project?.goal).toBe("Complete the mission");
    });

    it("imports a project from JSON", () => {
      const imported = {
        projectId: "imported-1",
        name: "Imported Project",
        description: "From file",
        goal: "",
        knowledgeBaseId: null,
        workflow: { nodes: [], edges: [] },
        agents: [],
        vaultAgents: [],
        permanentlyDeletedPresetNames: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      useProjectStore.getState().importProject(imported);

      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(useProjectStore.getState().project?.name).toBe("Imported Project");
    });

    it("loads demo project with 8 nodes and 4 agents", () => {
      useProjectStore.getState().loadDemoProject("en");

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.project!.agents).toHaveLength(4);
      expect(state.project!.workflow.nodes).toHaveLength(8);
      expect(state.project!.workflow.edges).toHaveLength(9);
    });
  });

  // ── Tests: Agent CRUD ────────────────────────────────────────

  describe("agent CRUD", () => {
    beforeEach(() => {
      useProjectStore.getState().createProject("Agent Test", "");
    });

    it("adds an agent to the active project", () => {
      useProjectStore.getState().addAgent(createTestAgent());

      expect(useProjectStore.getState().project?.agents).toHaveLength(1);
      expect(useProjectStore.getState().project?.agents[0].name).toBe("Test Agent");
    });

    it("adds preset roles as agents", () => {
      const roles = [
        createTestAgent(),
        { ...createTestAgent(), name: "Second Agent" },
      ];

      useProjectStore.getState().addPresetRoles(roles);

      expect(useProjectStore.getState().project?.agents).toHaveLength(2);
    });

    it("updates an agent's properties", () => {
      useProjectStore.getState().addAgent(createTestAgent());
      const agentId = useProjectStore.getState().project!.agents[0].agentId;

      useProjectStore.getState().updateAgent(agentId, {
        name: "Renamed Agent",
        temperature: 0.9,
      });

      const agent = useProjectStore.getState().project?.agents[0];
      expect(agent?.name).toBe("Renamed Agent");
      expect(agent?.temperature).toBe(0.9);
    });

    it("removes an agent from the project", () => {
      useProjectStore.getState().addAgent(createTestAgent());
      const agentId = useProjectStore.getState().project!.agents[0].agentId;

      useProjectStore.getState().removeAgent(agentId);

      expect(useProjectStore.getState().project?.agents).toHaveLength(0);
    });

    it("does nothing when adding agent without active project", () => {
      useProjectStore.setState({ project: null, activeProjectId: null });

      useProjectStore.getState().addAgent(createTestAgent());

      // State unchanged
      expect(useProjectStore.getState().projects).toHaveLength(1); // project still exists
    });
  });

  // ── Tests: Node CRUD ─────────────────────────────────────────

  describe("node CRUD", () => {
    beforeEach(() => {
      useProjectStore.getState().createProject("Node Test", "");
    });

    it("adds a task node at a specific position", () => {
      useProjectStore.getState().addNode("task", { x: 100, y: 200 });

      const nodes = useProjectStore.getState().project!.workflow.nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe("task");
      expect(nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(nodes[0].status).toBe("pending");
    });

    it("adds different node types", () => {
      useProjectStore.getState().addNode("input", { x: 0, y: 0 });
      useProjectStore.getState().addNode("decision", { x: 50, y: 0 });
      useProjectStore.getState().addNode("output", { x: 100, y: 0 });

      const types = useProjectStore.getState().project!.workflow.nodes.map((n) => n.type);
      expect(types).toEqual(["input", "decision", "output"]);
    });

    it("updates a node's instruction", () => {
      useProjectStore.getState().addNode("task", { x: 0, y: 0 });
      const nodeId = useProjectStore.getState().project!.workflow.nodes[0].nodeId;

      useProjectStore.getState().updateNode(nodeId, { instruction: "New task" });

      const node = useProjectStore.getState().project!.workflow.nodes[0];
      expect(node.instruction).toBe("New task");
      // Updating instruction should reset status to pending
      expect(node.status).toBe("pending");
    });

    it("cascading reset: updating a node resets downstream nodes", () => {
      // Create: n1 → n2 → n3
      useProjectStore.getState().addNode("input", { x: 0, y: 0 });
      useProjectStore.getState().addNode("task", { x: 100, y: 0 });
      useProjectStore.getState().addNode("task", { x: 200, y: 0 });

      const nodes = useProjectStore.getState().project!.workflow.nodes;
      const [n1Id, n2Id, n3Id] = nodes.map((n) => n.nodeId);

      // Connect them
      useProjectStore.getState().addEdge(n1Id, n2Id);
      useProjectStore.getState().addEdge(n2Id, n3Id);

      // Mark all as completed
      useProjectStore.getState().updateNode(n1Id, { status: "completed", outputCache: "data1", executionHash: "h1" } as any);
      useProjectStore.getState().updateNode(n2Id, { status: "completed", outputCache: "data2", executionHash: "h2" } as any);
      useProjectStore.getState().updateNode(n3Id, { status: "completed", outputCache: "data3", executionHash: "h3" } as any);

      // Verify all completed
      expect(useProjectStore.getState().project!.workflow.nodes.map((n) => n.status))
        .toEqual(["completed", "completed", "completed"]);

      // Now change n1's instruction
      useProjectStore.getState().updateNode(n1Id, { instruction: "Changed" });

      // n1 should be reset, n2 and n3 should also be reset
      const updatedNodes = useProjectStore.getState().project!.workflow.nodes;
      expect(updatedNodes[0].status).toBe("pending"); // n1 reset
      expect(updatedNodes[1].status).toBe("pending"); // n2 cascade reset
      expect(updatedNodes[2].status).toBe("pending"); // n3 cascade reset
    });

    it("duplicates a node with offset position", () => {
      useProjectStore.getState().addNode("task", { x: 100, y: 200 });
      const originalId = useProjectStore.getState().project!.workflow.nodes[0].nodeId;

      useProjectStore.getState().duplicateNode(originalId);

      const nodes = useProjectStore.getState().project!.workflow.nodes;
      expect(nodes).toHaveLength(2);
      // Duplicate should be offset
      expect(nodes[1].position).toEqual({ x: 150, y: 250 });
      // Duplicate should be pending
      expect(nodes[1].status).toBe("pending");
    });

    it("removes a node and its connected edges", () => {
      useProjectStore.getState().addNode("input", { x: 0, y: 0 });
      useProjectStore.getState().addNode("task", { x: 100, y: 0 });
      const [n1Id, n2Id] = useProjectStore.getState().project!.workflow.nodes.map((n) => n.nodeId);

      useProjectStore.getState().addEdge(n1Id, n2Id);

      // Remove n1
      useProjectStore.getState().removeNode(n1Id);

      expect(useProjectStore.getState().project!.workflow.nodes).toHaveLength(1);
      expect(useProjectStore.getState().project!.workflow.edges).toHaveLength(0);
    });

    it("resizes a node", () => {
      useProjectStore.getState().addNode("task", { x: 0, y: 0 });
      const nodeId = useProjectStore.getState().project!.workflow.nodes[0].nodeId;

      useProjectStore.getState().resizeNode(nodeId, 400, 300);

      const node = useProjectStore.getState().project!.workflow.nodes[0];
      expect(node.width).toBe(400);
      expect(node.height).toBe(300);
    });
  });

  // ── Tests: Edge CRUD ─────────────────────────────────────────

  describe("edge CRUD", () => {
    beforeEach(() => {
      useProjectStore.getState().createProject("Edge Test", "");
    });

    it("adds an edge between two nodes", () => {
      useProjectStore.getState().addNode("input", { x: 0, y: 0 });
      useProjectStore.getState().addNode("task", { x: 100, y: 0 });
      const [n1Id, n2Id] = useProjectStore.getState().project!.workflow.nodes.map((n) => n.nodeId);

      useProjectStore.getState().addEdge(n1Id, n2Id, "data flow");

      const edges = useProjectStore.getState().project!.workflow.edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceNodeId).toBe(n1Id);
      expect(edges[0].targetNodeId).toBe(n2Id);
      expect(edges[0].label).toBe("data flow");
    });

    it("removes an edge", () => {
      useProjectStore.getState().addNode("input", { x: 0, y: 0 });
      useProjectStore.getState().addNode("task", { x: 100, y: 0 });
      const [n1Id, n2Id] = useProjectStore.getState().project!.workflow.nodes.map((n) => n.nodeId);
      useProjectStore.getState().addEdge(n1Id, n2Id);
      const edgeId = useProjectStore.getState().project!.workflow.edges[0].edgeId;

      useProjectStore.getState().removeEdge(edgeId);

      expect(useProjectStore.getState().project!.workflow.edges).toHaveLength(0);
    });
  });

  // ── Tests: Execution State ───────────────────────────────────

  describe("execution state", () => {
    it("isRunning is false by default", () => {
      useProjectStore.getState().createProject("Exec Test", "");
      expect(useProjectStore.getState().isRunning).toBe(false);
    });

    it("does not start if already running", () => {
      useProjectStore.getState().createProject("Exec Test", "");
      useProjectStore.setState({ isRunning: true });

      useProjectStore.getState().runWorkflow();

      // Should not have called executeWorkflow because isRunning was already true
      expect(useProjectStore.getState().isRunning).toBe(true);
    });
  });

  // ── Tests: Selection & Panel ─────────────────────────────────

  describe("selection and panel", () => {
    it("sets selected node and opens properties panel", () => {
      useProjectStore.getState().createProject("Test", "");
      useProjectStore.getState().addNode("task", { x: 0, y: 0 });
      const nodeId = useProjectStore.getState().project!.workflow.nodes[0].nodeId;

      useProjectStore.getState().setSelectedNode(nodeId);

      expect(useProjectStore.getState().selectedNodeId).toBe(nodeId);
      expect(useProjectStore.getState().rightPanel).toBe("properties");
    });

    it("clears selection when setting null", () => {
      useProjectStore.getState().setSelectedNode(null);

      expect(useProjectStore.getState().selectedNodeId).toBeNull();
      expect(useProjectStore.getState().rightPanel).toBeNull();
    });

    it("sets right panel manually", () => {
      useProjectStore.getState().setRightPanel("agents");

      expect(useProjectStore.getState().rightPanel).toBe("agents");
    });
  });

  // ── Tests: Persistence ───────────────────────────────────────

  describe("persistence", () => {
    it("saves projects to localStorage on state change", () => {
      useProjectStore.getState().createProject("Saved Project", "");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "flowith_projects",
        expect.stringContaining("Saved Project"),
      );
    });
  });
});
