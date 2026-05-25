import { memo, useState, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { useResize } from "@/hooks/useResize";
import { saveOutputToFolder, hasFolderAccess, openProjectFolder, selectProjectFolder } from "@/services/fileStorage";
import { parseOutput } from "@/services/outputParser";
import type { BossNodeData } from "@/types/canvas";

const THRESHOLD = 300;

function OutputNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as BossNodeData;
  const { label, status, outputCache, saved, width, height, wasCached } = nodeData;
  const removeNode = useProjectStore((s) => s.removeNode);
  const resizeNode = useProjectStore((s) => s.resizeNode);
  const updateNode = useProjectStore((s) => s.updateNode);
  const updateProjectFolder = useProjectStore((s) => s.updateProjectFolder);
  const t = useT();
  const { currentW, currentH, onMouseDown } = useResize(id, width ?? 400, height ?? 320, resizeNode);

  const content = outputCache || t.outputNode.noOutput;
  const parsed = parseOutput(content);
  const { icon: typeIcon, kind: typeLabel } = parsed;

  // Find first image and video from parsed items
  const firstImage = parsed.items.find((item) => item.type === "image");
  const firstVideo = parsed.items.find((item) => item.type === "video");
  const isImage = !!firstImage;
  const isVideo = !!firstVideo;
  const isCode = parsed.items.some((item) => item.type === "code");

  // For display: if image or video, use that item's src; otherwise text content
  const displaySrc = firstImage?.src || firstVideo?.src || "";
  const textContent = parsed.items
    .filter((item) => item.type === "text" || item.type === "json" || item.type === "markdown" || item.type === "code")
    .map((item) => item.content)
    .join("\n\n");
  const truncated = textContent.slice(0, THRESHOLD);
  const exceeds = textContent.length > THRESHOLD || content.length > THRESHOLD;
  const fileItems = parsed.items.filter((item) => item.type === "file");
  const mediaCount = parsed.items.filter((item) => item.type === "image" || item.type === "video").length;

  const [filePath, setFilePath] = useState<string | null>(null);

  // Auto-save overflow to folder
  useEffect(() => {
    if (!exceeds || !hasFolderAccess()) return;
    const safeName = (label || "output").replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 30);
    saveOutputToFolder(safeName, content, "output").then((result) => {
      if (result) setFilePath(result.filename);
    });
  }, [content, exceeds, label]);

  const statusDotColor =
    status === "pending" ? "bg-boss-text-muted"
    : status === "running" ? "bg-boss-warning"
    : status === "completed" ? "bg-boss-success"
    : "bg-boss-error";

  return (
    <div className={`node-card group ${selected ? "selected" : ""}`}
      style={{ width: currentW, height: currentH, minWidth: 320, minHeight: 200 }}>
      <Handle type="target" position={Position.Top} className="!bg-emerald-400 !w-3 !h-3 !border-2 !border-boss-surface" />

      <button onClick={(e) => { e.stopPropagation(); removeNode(id); }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-boss-surface border border-boss-border text-boss-text-muted hover:text-boss-error hover:border-boss-error/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t.node.output}
            {saved && <span className="text-[8px] bg-emerald-500/20 px-1 rounded ml-0.5">🔒</span>}
            {wasCached && <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1 rounded ml-0.5">⚡</span>}
          </span>
          <div className="flex items-center gap-1.5">
            {outputCache && !saved && hasFolderAccess() && (
              <button
                onClick={(e) => { e.stopPropagation(); updateNode(id, { saved: true }); }}
                className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
              >
                {t.outputNode.save}
              </button>
            )}
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${status === "running" ? "animate-pulse" : ""}`} />
          </div>
        </div>

        {/* Preview with type badge */}
        <div className="rounded-lg overflow-hidden border border-boss-border">
          {isImage ? (
            <div className="bg-boss-bg relative">
              <img
                src={displaySrc}
                className="w-full h-auto max-h-48 object-contain"
                alt={t.outputNode.imageAlt}
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.nextElementSibling && ((el.nextElementSibling as HTMLElement).style.display = "flex");
                }}
              />
              <div className="hidden absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="text-3xl">🖼️</span>
                <span className="text-[10px] text-boss-text-muted/50">{t.outputNode.imageFallback}</span>
              </div>
              <div className="px-2 py-1 flex items-center gap-2 border-t border-boss-border">
                <span className="text-sm">{typeIcon}</span>
                <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">{typeLabel}</span>
                {mediaCount > 1 && (
                  <span className="text-[9px] text-boss-text-muted/50">+{mediaCount - 1} more</span>
                )}
              </div>
            </div>
          ) : isVideo ? (
            <div className="bg-boss-bg">
              <video src={displaySrc} controls className="w-full h-auto max-h-48" />
              <div className="px-2 py-1 flex items-center gap-2 border-t border-boss-border">
                <span className="text-sm">{typeIcon}</span>
                <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">{typeLabel}</span>
              </div>
            </div>
          ) : (
            <div className="bg-boss-bg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">{typeIcon}</span>
                <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded">{typeLabel}</span>
                {fileItems.length > 0 && (
                  <span className="text-[9px] text-blue-400/70 bg-blue-500/10 px-2 py-0.5 rounded">{fileItems.length} file{fileItems.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              <p className={`text-[11px] leading-relaxed text-boss-text-muted ${isCode ? "font-mono" : ""}`}>
                {truncated || "(empty)"}
                {exceeds && <span className="text-boss-text-muted/40">...</span>}
              </p>
            </div>
          )}
        </div>

        {/* File links for downloadable items */}
        {fileItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {fileItems.map((f, i) => (
              <a key={i} href={f.src} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 p-1.5 rounded hover:bg-blue-500/5 transition-colors group/file"
              >
                <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className="text-[10px] text-blue-400 group-hover/file:underline truncate">{f.filename}</span>
              </a>
            ))}
          </div>
        )}

        {/* File link for overflow */}
        {exceeds && (
          <div className="mt-2 p-2 rounded bg-boss-bg border border-boss-border">
            <button
              onClick={() => openProjectFolder()}
              disabled={!filePath}
              className="flex items-center gap-2 text-[10px] text-boss-accent hover:text-boss-accent-hover transition-colors w-full text-left disabled:opacity-50 disabled:cursor-default"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <span className="underline underline-offset-2 truncate">
                {filePath ? filePath.split("/").pop()?.split("\\").pop() || filePath : t.outputNode.charsNeedsFolder.replace("{count}", content.length.toLocaleString())}
              </span>
            </button>
            {filePath ? (
              <p className="text-[9px] text-boss-text-muted/50 mt-1">{t.outputNode.clickToOpen}</p>
            ) : (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const name = await selectProjectFolder();
                  if (!name) return;
                  updateProjectFolder(name);
                  const safeName = (label || "output").replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 30);
                  const result = await saveOutputToFolder(safeName, content, "output");
                  if (result) setFilePath(result.filename);
                }}
                className="text-[9px] text-boss-accent hover:text-boss-accent-hover underline underline-offset-2 mt-1 transition-colors"
              >
                {t.outputNode.createFolder}
              </button>
            )}
          </div>
        )}

        {/* Resize grip */}
        <div onMouseDown={onMouseDown}
          className="nodrag absolute bottom-0.5 right-0.5 w-5 h-5 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <svg className="w-3 h-3 text-boss-text-muted/30 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M22 22H2L12 2l10 20z" /></svg>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-3 !h-3 !border-2 !border-boss-surface" />
    </div>
  );
}

export default memo(OutputNodeComponent);
