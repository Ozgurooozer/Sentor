import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  speaking: boolean;
  onClose: () => void;
}

const W = 160, H = 160;

export function V3TtsOverlay({ speaking, onClose }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const speakRef   = useRef(speaking);
  speakRef.current = speaking;

  useEffect(() => {
    if (!mountRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;

    // Central glow dot
    const dotGeo = new THREE.CircleGeometry(0.10, 64);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x9b72ef, transparent: true, opacity: 0.9 });
    const dot    = new THREE.Mesh(dotGeo, dotMat);
    scene.add(dot);

    // Emanating rings
    const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number; speed: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const r   = 0.16 + i * 0.13;
      const geo = new THREE.RingGeometry(r, r + 0.013, 128);
      const mat = new THREE.MeshBasicMaterial({
        color:       i < 2 ? 0x9b72ef : 0x5b8def,
        transparent: true,
        opacity:     0,
        side:        THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      rings.push({ mesh, mat, phase: i * (Math.PI * 2 / 5), speed: 0.9 + i * 0.35 });
    }

    let frame = 0;
    let raf: number;
    const animate = () => {
      frame++;
      const t      = frame * 0.016;
      const active = speakRef.current;

      const pulse    = active ? 1 + Math.sin(t * 4.5) * 0.18 : 0.75;
      dot.scale.set(pulse, pulse, 1);
      dotMat.opacity = active ? 0.80 + Math.sin(t * 4.5) * 0.18 : 0.25;

      rings.forEach(({ mesh, mat, phase, speed }) => {
        if (active) {
          const wave = Math.max(0, Math.sin(t * speed * 2 - phase));
          mat.opacity = wave * 0.65;
          const s    = 1 + wave * 0.07;
          mesh.scale.set(s, s, 1);
        } else {
          mat.opacity = Math.max(0, mat.opacity - 0.03);
        }
      });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      style={{
        position:       "fixed",
        bottom:         72,
        right:          16,
        zIndex:         300,
        background:     "rgba(8,8,14,0.90)",
        backdropFilter: "blur(24px) saturate(160%)",
        border:         `1px solid ${speaking ? "rgba(155,114,239,0.40)" : "rgba(255,255,255,0.07)"}`,
        borderRadius:   16,
        overflow:       "hidden",
        transition:     "border-color 200ms ease-out",
        outline:        speaking ? "1px solid rgba(155,114,239,0.20)" : "none",
      }}
    >
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "6px 10px 4px",
        borderBottom:   "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width:       6,
            height:      6,
            borderRadius:"50%",
            background:  speaking ? "#9b72ef" : "#2a2a2a",
            display:     "inline-block",
            transition:  "background 200ms ease-out",
            animation:   speaking ? "sentor-pulse 1s ease-in-out infinite" : "none",
          }} />
          <span style={{
            fontFamily:    "monospace",
            fontSize:      9,
            letterSpacing: "0.05em",
            color:         speaking ? "#9b72ef" : "#333",
            transition:    "color 200ms ease-out",
          }}>
            {speaking ? "KONUŞUYOR" : "BEKLIYOR"}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#333", fontSize: 10, padding: "2px 4px", lineHeight: 1, transition: "color 150ms ease-out" }}
          onMouseEnter={(e) => ((e.currentTarget).style.color = "#888")}
          onMouseLeave={(e) => ((e.currentTarget).style.color = "#333")}
        >
          ✕
        </button>
      </div>

      {/* Three.js canvas */}
      <div ref={mountRef} style={{ width: W, height: H }} />
    </div>
  );
}
