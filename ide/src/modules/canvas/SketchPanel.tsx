import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "pen" | "select" | "eraser";

interface Path {
  points: [number, number][];
  color: string;
  width: number;
}

export function SketchPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [paths, setPaths] = useState<Path[]>([]);
  const [activePath, setActivePath] = useState<Path | null>(null);
  const isDrawing = useRef(false);

  const color = "#f5f5f5";
  const lineWidth = tool === "eraser" ? 12 : 2;

  const redraw = useCallback((allPaths: Path[], active: Path | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawPath = (p: Path) => {
      if (p.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(p.points[0][0], p.points[0][1]);
      for (let i = 1; i < p.points.length; i++) {
        ctx.lineTo(p.points[i][0], p.points[i][1]);
      }
      ctx.stroke();
    };
    for (const p of allPaths) drawPath(p);
    if (active) drawPath(active);
  }, []);

  useEffect(() => {
    redraw(paths, activePath);
  }, [paths, activePath, redraw]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = canvas.parentElement!;
      canvas.width = clientWidth;
      canvas.height = clientHeight;
      redraw(paths, null);
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [paths, redraw]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (tool === "select") return;
    isDrawing.current = true;
    const pt = getPos(e);
    setActivePath({ points: [pt], color: tool === "eraser" ? "#0a0a0a" : color, width: lineWidth });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!isDrawing.current || !activePath) return;
    setActivePath((p) => p ? { ...p, points: [...p.points, getPos(e)] } : null);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!isDrawing.current || !activePath) return;
    isDrawing.current = false;
    setPaths((prev) => [...prev, activePath]);
    setActivePath(null);
  };

  const toolBtn = (t: Tool, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTool(t)}
      className={[
        "h-6 rounded px-2 text-[10.5px] transition-colors duration-150 ease-out",
        tool === t
          ? "bg-[#2a2a2a] text-[#f5f5f5]"
          : "text-[#555555] hover:text-[#888888]",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[#2a2a2a] bg-[#111111] px-2 py-1">
        {toolBtn("select", "Select")}
        {toolBtn("pen", "Pen")}
        {toolBtn("eraser", "Eraser")}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setPaths([]); setActivePath(null); }}
          className="h-6 rounded px-2 text-[10.5px] text-[#555555] transition-colors duration-150 ease-out hover:text-[#888888]"
        >
          Clear
        </button>
      </div>

      {/* Drawing surface */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ cursor: tool === "select" ? "default" : tool === "eraser" ? "cell" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    </div>
  );
}
