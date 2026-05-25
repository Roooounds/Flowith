import { useState, useCallback, useRef } from "react";

interface DragState {
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  lastDx: number;
  lastDy: number;
}

export function useResize(
  nodeId: string,
  defaultW: number,
  defaultH: number,
  onResize: (nodeId: string, width: number, height: number) => void,
) {
  const [localW, setLocalW] = useState<number | null>(null);
  const [localH, setLocalH] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const currentW = localW ?? defaultW;
  const currentH = localH ?? defaultH;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: currentW,
        startH: currentH,
        lastDx: 0,
        lastDy: 0,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        dragRef.current.lastDx = dx;
        dragRef.current.lastDy = dy;
        setLocalW(Math.max(180, dragRef.current.startW + dx));
        setLocalH(Math.max(120, dragRef.current.startH + dy));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        const d = dragRef.current;
        if (d) {
          const finalW = Math.max(180, d.startW + d.lastDx);
          const finalH = Math.max(120, d.startH + d.lastDy);
          onResize(nodeId, finalW, finalH);
        }
        dragRef.current = null;
        setLocalW(null);
        setLocalH(null);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [nodeId, currentW, currentH, onResize],
  );

  return { currentW, currentH, onMouseDown };
}
