import { useCallback, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export default function DraggableEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
}: EdgeProps) {
  const dragRef = useRef(0);
  const [offset, setOffset] = useState(0);

  // Fixed horizontal bar at a draggable Y position
  const midY = sourceY + (targetY - sourceY) / 2 + offset;
  const minY = sourceY + 20;
  const maxY = targetY - 20;
  const clampedY = Math.min(Math.max(midY, minY), maxY);

  // Build path: source → down → horizontal → down → target
  const path = [
    `M${sourceX},${sourceY}`,
    `L${sourceX},${clampedY}`,
    `L${targetX},${clampedY}`,
    `L${targetX},${targetY}`,
  ].join(" ");

  const labelX = sourceX + (targetX - sourceX) / 2;
  const labelY = clampedY;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const startY = e.clientY;
      const startOffset = dragRef.current;
      document.body.style.cursor = "ns-resize";
      const onMove = (ev: PointerEvent) => {
        dragRef.current = startOffset + (ev.clientY - startY);
        setOffset(dragRef.current);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    []
  );

  return (
    <>
      <BaseEdge id="draggable-edge" path={path} style={style} markerEnd={markerEnd} />
      {/* Invisible wide hit area on top of the horizontal bar */}
      <line
        x1={Math.min(sourceX, targetX)}
        y1={clampedY}
        x2={Math.max(sourceX, targetX)}
        y2={clampedY}
        stroke="transparent"
        strokeWidth={20}
        className="nodrag nopan"
        style={{ cursor: "ns-resize", pointerEvents: "all" }}
        onPointerDown={onPointerDown}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
            style={{ left: labelX, top: labelY, ...labelStyle }}
          >
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={labelBgStyle as any}>
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
