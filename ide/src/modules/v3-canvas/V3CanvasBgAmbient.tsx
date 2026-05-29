export function V3CanvasBgAmbient() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
      {/* Base */}
      <div className="absolute inset-0" style={{ background: "#050507" }} />

      {/* Orb 1 — blue, top-left */}
      <div
        className="absolute"
        style={{
          width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,141,239,0.11) 0%, transparent 68%)",
          top: -280, left: -180,
          animation: "atlas-orb-1 20s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 2 — violet, right */}
      <div
        className="absolute"
        style={{
          width: 760, height: 760, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,114,239,0.09) 0%, transparent 68%)",
          top: "18%", right: -200,
          animation: "atlas-orb-2 25s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 3 — teal, bottom-center */}
      <div
        className="absolute"
        style={{
          width: 640, height: 640, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,184,154,0.07) 0%, transparent 68%)",
          bottom: -120, left: "28%",
          animation: "atlas-orb-3 30s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 4 — blue, center drift */}
      <div
        className="absolute"
        style={{
          width: 520, height: 520, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,141,239,0.06) 0%, transparent 68%)",
          top: "38%", left: "38%",
          animation: "atlas-orb-4 35s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Noise grain — SVG feTurbulence, overlay blend */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.032, mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="atlas-canvas-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#atlas-canvas-noise)" />
      </svg>
    </div>
  );
}
