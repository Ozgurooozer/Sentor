export function V3CanvasBgAmbient() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 0, background: "#050507", overflow: "hidden" }}
    >
      {/* ── 3D perspective grid ───────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: "280px",
          perspectiveOrigin: "50% 58%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-120%", right: "-120%",
            top: "-10%", bottom: 0,
            transformOrigin: "50% 100%",
            transform: "rotateX(72deg)",
            backgroundImage: [
              "linear-gradient(rgba(91,141,239,0.32) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(91,141,239,0.32) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "80px 80px",
            animation: "sentor-grid-scroll 10s linear infinite",
          }}
        />
      </div>

      {/* ── Vignette — edges dark, grid converges at horizon ─────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: [
            "radial-gradient(ellipse 100% 55% at 50% 100%, transparent 62%, #050507 100%)",
            "radial-gradient(ellipse 60% 40% at 50% 0%, #050507 0%, transparent 100%)",
            "linear-gradient(to right, #050507 0%, transparent 15%, transparent 85%, #050507 100%)",
          ].join(", "),
        }}
      />

      {/* ── Soft blue horizon glow ────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          width: "80%", height: "35%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(91,141,239,0.18) 0%, transparent 70%)",
          bottom: "8%", left: "10%",
          animation: "sentor-orb-pulse 4s ease-in-out infinite alternate",
          willChange: "transform, opacity",
        }}
      />

      {/* ── Purple accent top-right ───────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          width: 500, height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,114,239,0.07) 0%, transparent 70%)",
          top: -120, right: -80,
        }}
      />

      {/* ── Noise grain ──────────────────────────────────────────────────── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.025, mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="sentor-canvas-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#sentor-canvas-noise)" />
      </svg>
    </div>
  );
}
