import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Tüm V3 pencereleri için özel cursor:
 * - OS cursor'u gizler
 * - DOM: lagged outer ring + exact inner dot
 * - Three.js: mouse trail parçacıkları (additive blending) + click burst
 */
export function V3Cursor() {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const ringRef       = useRef<HTMLDivElement>(null);
  const dotRef        = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.style.cursor = "none";

    const el = canvasWrapRef.current;
    const ring = ringRef.current;
    const dot  = dotRef.current;
    if (!el) return;

    let W = window.innerWidth, H = window.innerHeight;

    /* ── Renderer ──────────────────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power", premultipliedAlpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Orthographic: screen coordinates. Y flipped (top=0, bottom=-H).
    const camera = new THREE.OrthographicCamera(0, W, 0, -H, -1, 1);

    /* ── Parçacık havuzu ────────────────────────────────────────────────── */
    const POOL = 180;
    type P = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number; g: number; b: number };
    const pool: P[] = Array.from({ length: POOL }, () =>
      ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, r: 0.357, g: 0.557, b: 0.937 }));
    let nextSlot = 0;

    const spawn = (x: number, y: number, vx: number, vy: number, maxLife: number, r = 0.357, g = 0.557, b = 0.937) => {
      const p = pool[nextSlot % POOL];
      nextSlot++;
      Object.assign(p, { x, y, vx, vy, life: maxLife, maxLife, r, g, b });
    };

    const positions = new Float32Array(POOL * 3);
    const colors    = new Float32Array(POOL * 3);

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("color", colAttr);

    // ShaderMaterial: yumuşak daire + additive blend
    const mat = new THREE.ShaderMaterial({
      uniforms: { size: { value: 5.0 } },
      vertexShader: `
        uniform float size;
        varying vec3 vCol;
        attribute vec3 color;
        void main() {
          vCol = color;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = 1.0 - smoothstep(0.15, 0.5, d);
          gl_FragColor = vec4(vCol * a, a);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
    });

    scene.add(new THREE.Points(geo, mat));

    /* ── Click ripple ring ─────────────────────────────────────────────── */
    const RIPPLE_MAX = 6;
    type Ripple = { x: number; y: number; r: number; life: number; line: THREE.Line };
    const ripples: Ripple[] = [];

    const rippleMat = new THREE.LineBasicMaterial({ color: 0x5b8def, transparent: true, opacity: 0 });

    const addRipple = (x: number, y: number) => {
      if (ripples.length >= RIPPLE_MAX) {
        const old = ripples.shift();
        if (old) scene.remove(old.line);
      }
      const segs = 32;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      }
      const rGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const m = rippleMat.clone();
      const line = new THREE.Line(rGeo, m);
      line.position.set(x, -y, 0);
      line.scale.set(0, 0, 1);
      scene.add(line);
      ripples.push({ x, y, r: 0, life: 1, line });
    };

    /* ── Mouse state ───────────────────────────────────────────────────── */
    let mx = W / 2, my = H / 2;
    let ringX = mx, ringY = my;
    let prevMX = mx, prevMY = my;
    let isHoveringInteractive = false;

    /* ── Animate ───────────────────────────────────────────────────────── */
    let raf = 0, frame = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      frame++;

      // Spawn trail (every other frame, only if mouse moved)
      if (frame % 2 === 0) {
        const moved = Math.abs(mx - prevMX) + Math.abs(my - prevMY) > 2;
        if (moved) {
          prevMX = mx; prevMY = my;
          spawn(
            mx + (Math.random() - 0.5) * 3,
            my + (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 0.6,
            -(Math.random() * 0.5 + 0.1),
            22 + Math.random() * 14,
          );
        }
      }

      // Update particles → fill GPU buffers
      const pos = posAttr.array as Float32Array;
      const col = colAttr.array as Float32Array;
      for (let i = 0; i < POOL; i++) {
        const p = pool[i];
        if (p.life <= 0) {
          pos[i*3] = -9999; pos[i*3+1] = 0; pos[i*3+2] = 0;
          col[i*3] = 0; col[i*3+1] = 0; col[i*3+2] = 0;
          continue;
        }
        p.life--;
        p.x += p.vx; p.y += p.vy;
        const t = p.life / p.maxLife;
        pos[i*3] = p.x; pos[i*3+1] = -p.y; pos[i*3+2] = 0;
        col[i*3] = p.r * t; col[i*3+1] = p.g * t; col[i*3+2] = p.b * t;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.life -= 0.045;
        rp.r += 1.8;
        if (rp.life <= 0) {
          scene.remove(rp.line);
          ripples.splice(i, 1);
          continue;
        }
        rp.line.scale.set(rp.r, rp.r, 1);
        (rp.line.material as THREE.LineBasicMaterial).opacity = rp.life * 0.7;
      }

      renderer.render(scene, camera);

      // DOM cursor smooth follow
      ringX += (mx - ringX) * 0.14;
      ringY += (my - ringY) * 0.14;

      const targetSize = isHoveringInteractive ? 28 : 20;
      if (ring) {
        ring.style.transform = `translate(${ringX - targetSize / 2}px, ${ringY - targetSize / 2}px)`;
        ring.style.width  = `${targetSize}px`;
        ring.style.height = `${targetSize}px`;
      }
      if (dot) {
        dot.style.transform = `translate(${mx - 2.5}px, ${my - 2.5}px)`;
        dot.style.opacity = isHoveringInteractive ? "0" : "1";
      }
    };

    animate();

    /* ── Event listeners ───────────────────────────────────────────────── */
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      const t = e.target as HTMLElement;
      isHoveringInteractive = !!(t?.closest("button, input, a, textarea, select, [role='button']"));
    };

    const onDown = (e: MouseEvent) => {
      addRipple(e.clientX, e.clientY);
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.5;
        // Purple-ish burst color
        spawn(e.clientX, e.clientY, Math.cos(angle) * speed, Math.sin(angle) * speed, 18 + Math.random() * 10, 0.6, 0.45, 0.95);
      }
    };

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      renderer.setSize(W, H);
      camera.right = W; camera.bottom = -H;
      camera.updateProjectionMatrix();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
      document.documentElement.style.cursor = "";
      geo.dispose(); mat.dispose();
      ripples.forEach(r => { scene.remove(r.line); });
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      {/* Three.js trail canvas — tüm ekranı kaplar, pointer olaylarını geçirir */}
      <div ref={canvasWrapRef} className="pointer-events-none fixed inset-0" style={{ zIndex: 99990 }} />
      {/* Outer ring — mouse'u gecikmeyle takip eder */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed rounded-full"
        style={{
          width: 20, height: 20,
          border: "1px solid rgba(91,141,239,0.55)",
          boxShadow: "0 0 6px rgba(91,141,239,0.2)",
          transition: "width 120ms ease, height 120ms ease",
          zIndex: 99991,
        }}
      />
      {/* Inner dot — tam mouse pozisyonu */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed rounded-full"
        style={{
          width: 5, height: 5,
          background: "rgba(91,141,239,0.9)",
          boxShadow: "0 0 4px rgba(91,141,239,0.5)",
          transition: "opacity 120ms ease",
          zIndex: 99992,
        }}
      />
    </>
  );
}
