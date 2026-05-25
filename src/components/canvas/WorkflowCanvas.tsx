import { useCallback, useMemo, useRef, useState, useEffect, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  MarkerType,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import { nodeTypes } from "@/components/nodes";
import DraggableEdge from "./DraggableEdge";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import ContextMenu from "@/components/common/ContextMenu";
import type { NodeType } from "@/types/project";
import type { BossNode, BossEdge } from "@/types/canvas";

export default function WorkflowCanvas() {
  const t = useT();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const {
    canvasNodes,
    canvasEdges,
    layoutVersion,
    selectedNodeId,
    setSelectedNode,
    addNode,
    addEdge,
  } = useProjectStore();
  const { screenToFlowPosition, setCenter, getZoom, getViewport, setViewport } = useReactFlow();

  // Save viewport before centering on a selected node, so we can restore on deselect
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

  // Local state for React Flow controlled mode — stay in sync with store
  const [nodes, setNodes] = useState<BossNode[]>(canvasNodes);
  const [edges, setEdges] = useState<BossEdge[]>(canvasEdges);

  const removeEdge = useProjectStore((s) => s.removeEdge);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  // ── Keyboard shortcuts ──────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Don't intercept when focus is in a text input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // Full position sync when layout changes
  useEffect(() => {
    setNodes(canvasNodes);
    setEdges(canvasEdges);
  }, [layoutVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync structural and data changes (add/remove/update) without resetting positions
  useEffect(() => {
    setNodes((nds) => {
      const canvasById = new Map(canvasNodes.map((n) => [n.id, n]));
      const localIds = new Set(nds.map((n) => n.id));
      const canvasIds = new Set(canvasById.keys());

      // Detect changes: new, removed, or data updated
      const hasChanges =
        nds.some((n) => !canvasIds.has(n.id)) || // removed
        canvasNodes.some((n) => !localIds.has(n.id)); // added

      if (!hasChanges) {
        // Check for data updates on existing nodes
        const dataChanged = nds.some((n) => {
          const cn = canvasById.get(n.id);
          return cn && cn !== n && JSON.stringify(cn.data) !== JSON.stringify(n.data);
        });
        if (!dataChanged) return nds;
      }

      // Rebuild: keep local positions, take store data
      return canvasNodes.map((cn) => {
        const local = nds.find((n) => n.id === cn.id);
        return local ? { ...cn, position: local.position } : cn;
      });
    });
  }, [canvasNodes]);

  useEffect(() => {
    setEdges((eds) => {
      const canvasById = new Map(canvasEdges.map((e) => [e.id, e]));
      const localIds = new Set(eds.map((e) => e.id));
      const canvasIds = new Set(canvasById.keys());

      const hasChanges =
        eds.some((e) => !canvasIds.has(e.id)) ||
        canvasEdges.some((e) => !localIds.has(e.id));

      if (!hasChanges) return eds;

      return canvasEdges.map((ce) => {
        const local = eds.find((e) => e.id === ce.id);
        return local ? { ...ce, ...local, data: ce.data, label: ce.label, sourceHandle: ce.sourceHandle } : ce;
      });
    });
  }, [canvasEdges]);

  // Restore viewport when deselecting (right panel closes)
  useEffect(() => {
    if (!selectedNodeId && savedViewportRef.current) {
      const vp = savedViewportRef.current;
      savedViewportRef.current = null;
      setTimeout(() => {
        setViewport(vp, { duration: 400 });
      }, 100);
    }
  }, [selectedNodeId, setViewport]);

  // ── Drag & Drop from toolbar ────────────────────────────────────

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData(
        "application/boss-node-type"
      ) as NodeType | "";
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(nodeType, position);
    },
    [addNode, screenToFlowPosition]
  );

  // ── Node/Edge changes (drag, select, remove) ────────────────────

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as BossNode[]);
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds) as BossEdge[]);
      // Sync removals back to store
      for (const change of changes) {
        if (change.type === "remove") {
          removeEdge(change.id);
        }
      }
    },
    [removeEdge]
  );

  // ── Connection ──────────────────────────────────────────────────

  const connectStartRef = useRef<{ handleType: string; nodeId: string } | null>(null);

  const onConnectStart: OnConnectStart = useCallback(
    (_event, { handleType, nodeId }) => {
      connectStartRef.current = { handleType: (handleType ?? "source") as string, nodeId: nodeId! };

      // ComfyUI-style: dragging from an already-connected target handle
      // immediately detaches the wire so it follows the mouse
      if (handleType === "target") {
        const edgeToRemove = edges.find((e) => e.target === nodeId);
        if (edgeToRemove) removeEdge(edgeToRemove.id);
      }
    },
    [edges, removeEdge]
  );

  // Drop on empty space → nothing to do (edge already removed in onConnectStart if from target)
  const onConnectEnd: OnConnectEnd = useCallback(() => {
    connectStartRef.current = null;
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // If this was a target-handle reconnect, a new edge is being formed — create it
      const sh = connection.sourceHandle;
      const label = sh === "yes" ? "Yes" : sh === "no" ? "No" : undefined;
      addEdge(connection.source, connection.target, label, sh ?? undefined);
      connectStartRef.current = null;
    },
    [addEdge]
  );

  // ── Selection ───────────────────────────────────────────────────

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string; position: { x: number; y: number }; data?: { width?: number; height?: number } }) => {
      // Save current viewport before centering so we can restore on deselect
      if (!selectedNodeId) {
        savedViewportRef.current = getViewport();
      }
      setSelectedNode(node.id);
      const zoom = getZoom();
      const w = node.data?.width ?? 280;
      const h = node.data?.height ?? 180;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;
      setTimeout(() => {
        setCenter(cx, cy, { zoom, duration: 400 });
      }, 350);
    },
    [setSelectedNode, setCenter, getZoom, getViewport, selectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setCtxMenu({ x: event.clientX, y: event.clientY });
    },
    []
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      event.preventDefault();
      setCtxMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    []
  );

  const onAddNodeAtPosition = useCallback(
    (type: NodeType) => {
      if (!ctxMenu) return;
      const position = screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y });
      addNode(type, position);
    },
    [addNode, ctxMenu, screenToFlowPosition]
  );

  // ── Default edge options ────────────────────────────────────────

  const edgeTypes = useMemo(() => ({ smoothstep: DraggableEdge }), []);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep" as const,
      animated: false,
      style: { stroke: "#4a4f5e", strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#4a4f5e",
      },
    }),
    []
  );

  // ── Empty canvas ────────────────────────────────────────────────

  if (nodes.length === 0) {
    return (
      <div
        className="h-full w-full flex items-center justify-center bg-boss-bg"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={onPaneContextMenu}
      >
        <div className="text-center select-none">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-boss-border"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <p className="text-boss-text-muted text-sm mb-1">
            {t.canvas.dragToStart}
          </p>
          <p className="text-boss-text-muted/50 text-xs">
            {t.canvas.clickToolbar}
          </p>
        </div>
        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            onAddNode={onAddNodeAtPosition}
          />
        )}
      </div>
    );
  }

  // ── Canvas ──────────────────────────────────────────────────────

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      edgesFocusable={true}
      edgesReconnectable={true}
      selectionOnDrag={true}
      panOnDrag={[1]}
      fitView
      className="bg-boss-bg"
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="#2a2e3a"
      />
      <Controls
        className="!bg-boss-surface !border !border-boss-border !rounded-lg"
        position="bottom-right"
      />
      <FloatingLayoutButton />
      <MiniMap
        className="!bg-boss-surface !border !border-boss-border !rounded-lg"
        nodeColor={(node) => {
          const status = (node.data as { status?: string })?.status;
          switch (status) {
            case "completed":
              return "#22c55e";
            case "running":
              return "#f59e0b";
            case "error":
              return "#ef4444";
            default:
              return "#4a4f5e";
          }
        }}
        maskColor="rgba(15, 17, 23, 0.7)"
      />
      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          {...ctxMenu}
          onClose={() => setCtxMenu(null)}
          onAddNode={onAddNodeAtPosition}
        />
      )}
    </ReactFlow>
  );
}

function FloatingLayoutButton() {
  const autoLayout = useProjectStore((s) => s.autoLayout);
  const { fitView } = useReactFlow();
  const t = useT();

  const handleLayout = useCallback(() => {
    autoLayout();
    setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 50);
  }, [autoLayout, fitView]);

  return (
    <button onClick={handleLayout}
      className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-boss-surface border border-boss-border hover:border-boss-accent/50 shadow-lg text-xs text-boss-text-muted hover:text-boss-text transition-all">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
      {t.toolbar.autoLayout}
    </button>
  );
}
