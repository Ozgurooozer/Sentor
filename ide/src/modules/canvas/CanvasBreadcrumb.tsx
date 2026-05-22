import { useCanvasStore } from "./canvasStore";

export function CanvasBreadcrumb() {
  const canvases = useCanvasStore((s) => s.canvases);
  const history = useCanvasStore((s) => s.canvasHistory);
  const switchCanvas = useCanvasStore((s) => s.switchCanvas);

  // Build breadcrumb from history — deduplicate adjacent
  const crumbs = history.reduce<string[]>((acc, id) => {
    if (acc[acc.length - 1] !== id) acc.push(id);
    return acc;
  }, []);

  if (crumbs.length <= 1) {
    const active = canvases.find((c) => c.id === crumbs[0]);
    return (
      <span className="text-[11px] text-[#555555]">
        {active?.title ?? "canvas"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {crumbs.map((id, i) => {
        const c = canvases.find((cv) => cv.id === id);
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${id}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-[#2a2a2a]">/</span>}
            <button
              type="button"
              disabled={isLast}
              onClick={() => void switchCanvas(id)}
              className={[
                "text-[11px] transition-colors duration-150 ease-out",
                isLast
                  ? "text-[#888888] cursor-default"
                  : "text-[#555555] hover:text-[#888888] cursor-pointer",
              ].join(" ")}
            >
              {c?.title ?? id.slice(0, 6)}
            </button>
          </span>
        );
      })}
    </div>
  );
}
