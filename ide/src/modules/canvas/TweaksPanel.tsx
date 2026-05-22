import { useTweaksStore, type BgStyle, type WireAnim, type WireStyle, type DensityMode, type QualityMode, type HeaderStyle } from "./canvasTweaksStore";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-[#555555]">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Radio<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={[
            "rounded border px-1.5 py-0.5 font-mono text-[9px] capitalize transition-colors duration-150 ease-out",
            value === o
              ? "border-[#5b8def] bg-[#5b8def]/10 text-[#5b8def]"
              : "border-[#2a2a2a] text-[#555555] hover:border-[#404040] hover:text-[#888888]",
          ].join(" ")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={[
        "h-4 w-7 rounded-full transition-colors duration-150 ease-out",
        value ? "bg-[#5b8def]/60" : "bg-[#2a2a2a]",
      ].join(" ")}
    >
      <div
        className={[
          "mx-0.5 h-3 w-3 rounded-full bg-[#f5f5f5] transition-transform duration-150 ease-out",
          value ? "translate-x-3" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export function TweaksPanel({ onClose }: { onClose: () => void }) {
  const tw = useTweaksStore();

  return (
    <div
      className="absolute right-0 top-0 z-40 flex h-full w-56 flex-col border-l border-[#2a2a2a] bg-[#0a0a0a]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#555555]">Tweaks</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-[#555555] hover:text-[#888888]"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-3">
        {/* Mode */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-[#333333]">Mode</div>
          <Row label="Quality">
            <Radio<QualityMode>
              options={["performance", "quality"]}
              value={tw.qualityMode}
              onChange={(v) => tw.set("qualityMode", v)}
            />
          </Row>
          <Row label="Density">
            <Radio<DensityMode>
              options={["compact", "comfy", "spacious"]}
              value={tw.density}
              onChange={(v) => tw.set("density", v)}
            />
          </Row>
        </div>

        {/* Canvas */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-[#333333]">Canvas</div>
          <Row label="Bg style">
            <Radio<BgStyle>
              options={["dot", "grid", "solid", "radial", "noise"]}
              value={tw.bgStyle}
              onChange={(v) => tw.set("bgStyle", v)}
            />
          </Row>
          <Row label="Minimap">
            <Toggle value={tw.showMinimap} onChange={(v) => tw.set("showMinimap", v)} />
          </Row>
          <Row label="Guides">
            <Toggle value={tw.showGuides} onChange={(v) => tw.set("showGuides", v)} />
          </Row>
        </div>

        {/* Nodes */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-[#333333]">Nodes</div>
          <Row label={`Radius (${tw.panelRadius}px)`}>
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={tw.panelRadius}
              onChange={(e) => tw.set("panelRadius", Number(e.target.value))}
              className="w-20 cursor-pointer accent-[#5b8def]"
            />
          </Row>
          <Row label="Header">
            <Radio<HeaderStyle>
              options={["stripe", "fill", "none"]}
              value={tw.headerStyle}
              onChange={(v) => tw.set("headerStyle", v)}
            />
          </Row>
        </div>

        {/* Wires */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-[#333333]">Wires</div>
          <Row label="Style">
            <Radio<WireStyle>
              options={["bezier", "orthogonal"]}
              value={tw.wireStyle}
              onChange={(v) => tw.set("wireStyle", v)}
            />
          </Row>
          <Row label="Animation">
            <Radio<WireAnim>
              options={["off", "pulse", "flow"]}
              value={tw.wireAnim}
              onChange={(v) => tw.set("wireAnim", v)}
            />
          </Row>
        </div>
      </div>
    </div>
  );
}
