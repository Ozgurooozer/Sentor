/**
 * V3CanvasBgPanel — Three.js perspective grid + particles + bloom.
 * Fills its container via absolute inset-0.
 * Used both as the main canvas background and inside "canvas-3d" panels.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const COUNT = 40;

export function V3CanvasBgPanel() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.pointerEvents = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 300);
    camera.position.set(0, 12, 55);
    camera.lookAt(0, -4, 0);

    // Perspective grid
    const gridGeo = new THREE.WireframeGeometry(new THREE.PlaneGeometry(600, 600, 30, 30));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: 0x5b8def, opacity: 0.038, transparent: true, depthWrite: false,
    }));
    grid.rotation.x = -Math.PI * 0.52;
    grid.position.set(0, -8, -5);
    scene.add(grid);

    // Grid dots
    const gridVertices = new Float32Array(31 * 31 * 3);
    let di = 0;
    for (let ix = 0; ix <= 30; ix++) {
      for (let iz = 0; iz <= 30; iz++) {
        gridVertices[di++] = (ix - 15) * 20;
        gridVertices[di++] = 0;
        gridVertices[di++] = (iz - 15) * 20;
      }
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(gridVertices, 3));
    const gridDots = new THREE.Points(dotGeo, new THREE.PointsMaterial({
      color: 0x5b8def, size: 0.7, opacity: 0.07, transparent: true, depthWrite: false,
    }));
    gridDots.rotation.x = -Math.PI * 0.52;
    gridDots.position.set(0, -8, -5);
    scene.add(gridDots);

    // Particles
    const positions  = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const colors     = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * 120;
      positions[i3 + 1] = (Math.random() - 0.5) * 90;
      positions[i3 + 2] = (Math.random() - 0.5) * 60;
      velocities[i3]     = (Math.random() - 0.5) * 0.0044;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.0044;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.002;
      const t = Math.random();
      colors[i3]     = 0.13 + t * 0.18;
      colors[i3 + 1] = 0.20 + t * 0.26;
      colors[i3 + 2] = 0.56 + t * 0.34;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    partGeo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(partGeo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, opacity: 0.22, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(particles);

    // Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(el.clientWidth, el.clientHeight),
      0.20, 0.3, 0.85,
    ));

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    });
    ro.observe(el);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      grid.rotation.y     += 0.00015;
      gridDots.rotation.y += 0.00015;
      const pos = partGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        pos[i3]     += velocities[i3];
        pos[i3 + 1] += velocities[i3 + 1];
        pos[i3 + 2] += velocities[i3 + 2];
        if (Math.abs(pos[i3])     > 60) velocities[i3]     *= -1;
        if (Math.abs(pos[i3 + 1]) > 45) velocities[i3 + 1] *= -1;
        if (Math.abs(pos[i3 + 2]) > 30) velocities[i3 + 2] *= -1;
      }
      partGeo.attributes.position.needsUpdate = true;
      composer.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      partGeo.dispose();
      gridGeo.dispose();
      dotGeo.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
