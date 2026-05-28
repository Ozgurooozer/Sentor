import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useChat, type UIMessage } from "@ai-sdk/react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { cn } from "@/lib/utils";
import { getOrCreateChat, useChatStore } from "@/modules/ai/store/chatStore";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { BUILTIN_AGENTS } from "@/modules/ai/lib/agents";
import { getAllKeys } from "@/modules/ai";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { V3Cursor } from "./V3Cursor";
import { useProjectStore } from "./projectStore";

// ─── Şeffaflık seviyeleri ─────────────────────────────────────────────────
const GLASS_LEVELS = [0.70, 0.83, 0.93] as const;
type GlassLevel = (typeof GLASS_LEVELS)[number];

// ─── Three.js arka plan — mouse reactive + thinking pulse ────────────────
interface ThreeBgProps {
  mouseRef: React.RefObject<{ x: number; y: number }>;
  thinkingRef: React.RefObject<boolean>;
  queryBurstRef: React.RefObject<number>; // increments on each user message
}

function ThreeBg({ mouseRef, thinkingRef, queryBurstRef }: ThreeBgProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // premultipliedAlpha: false is critical for Tauri transparent windows —
    // prevents dark halos on semi-transparent particles against the desktop
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power", premultipliedAlpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.z = 60;

    // ── EffectComposer — subtle bloom on emissive particles ──────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // strength=0.35 keeps the bloom subtle; threshold=0.80 only blooms bright particles
    const bloom = new UnrealBloomPass(new THREE.Vector2(480, 640), 0.35, 0.4, 0.80);
    composer.addPass(bloom);

    // ── Parçacıklar ──────────────────────────────────────────────────────
    const COUNT = 130;
    const ptPos = new Float32Array(COUNT * 3);
    const ptVel = new Float32Array(COUNT * 3);
    const ptCol = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      ptPos[i*3]   = (Math.random() - 0.5) * 100;
      ptPos[i*3+1] = (Math.random() - 0.5) * 70;
      ptPos[i*3+2] = (Math.random() - 0.5) * 50;
      ptVel[i*3]   = (Math.random() - 0.5) * 0.022;
      ptVel[i*3+1] = (Math.random() - 0.5) * 0.022;
      ptVel[i*3+2] = (Math.random() - 0.5) * 0.010;
      // Renk varyasyonu: mavi-mor arası
      const t = Math.random();
      ptCol[i*3]   = 0.22 + t * 0.18;   // r
      ptCol[i*3+1] = 0.28 + t * 0.28;   // g
      ptCol[i*3+2] = 0.55 + t * 0.38;   // b
    }

    const ptGeo = new THREE.BufferGeometry();
    const ptPosAttr = new THREE.BufferAttribute(ptPos, 3);
    const ptColAttr = new THREE.BufferAttribute(ptCol, 3);
    ptPosAttr.setUsage(THREE.DynamicDrawUsage);
    ptGeo.setAttribute("position", ptPosAttr);
    ptGeo.setAttribute("color", ptColAttr);

    const ptMat = new THREE.PointsMaterial({
      size: 0.65,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(ptGeo, ptMat));

    // ── Bağlantı çizgileri — pre-allocated ───────────────────────────────
    const MAX_LINES = COUNT * 5;
    const lnPos = new Float32Array(MAX_LINES * 6);
    const lnGeo = new THREE.BufferGeometry();
    const lnAttr = new THREE.BufferAttribute(lnPos, 3);
    lnAttr.setUsage(THREE.DynamicDrawUsage);
    lnGeo.setAttribute("position", lnAttr);
    lnGeo.setDrawRange(0, 0);
    const lnMat = new THREE.LineBasicMaterial({
      color: 0x5b8def,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.LineSegments(lnGeo, lnMat));

    const THRESH_SQ = 22 * 22;
    const REPEL_RADIUS_SQ = 24 * 24;

    const setSize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(el);

    // Görünür alan hesabı (mouse → world dönüşümü için)
    const getVisibleExtents = () => {
      const h = el.clientHeight, w = el.clientWidth;
      const visH = 2 * 60 * Math.tan((60 * Math.PI / 180) / 2);
      const visW = visH * (w / h);
      return { visW, visH };
    };

    let raf = 0, frame = 0;
    let camTargetX = 0, camTargetY = 0;
    let lastQueryBurst = 0;   // tracks queryBurstRef value to detect new bursts
    let thinkingWaveT = 0;    // wave timer for thinking pulse

    const animate = () => {
      raf = requestAnimationFrame(animate);
      frame++;

      const p = ptPosAttr.array as Float32Array;
      const W = el.clientWidth, H = el.clientHeight;

      // Mouse → world coords
      const { visW, visH } = getVisibleExtents();
      const m = mouseRef.current;
      const mwx = (m.x / W * 2 - 1) * visW / 2;
      const mwy = -(m.y / H * 2 - 1) * visH / 2;

      const thinking = thinkingRef.current;

      // Detect new query burst → scatter particles outward from center
      const curBurst = queryBurstRef.current;
      if (curBurst !== lastQueryBurst) {
        lastQueryBurst = curBurst;
        for (let i = 0; i < COUNT; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.6 + Math.random() * 1.2;
          ptVel[i*3]   += Math.cos(angle) * speed;
          ptVel[i*3+1] += Math.sin(angle) * speed;
        }
      }

      // Thinking pulse: slow wave from center every ~144 frames (~2.4s at 60fps)
      if (thinking) {
        thinkingWaveT++;
        if (thinkingWaveT % 144 === 0) {
          // wave — particles within expanding radius spike speed toward center
          for (let i = 0; i < COUNT; i++) {
            const dx = p[i*3], dy = p[i*3+1];
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d > 0.01) {
              ptVel[i*3]   -= (dx / d) * 0.18;
              ptVel[i*3+1] -= (dy / d) * 0.18;
            }
          }
        }
      } else {
        thinkingWaveT = 0;
      }

      // Parçacık güncelle + mouse itme kuvveti
      for (let i = 0; i < COUNT; i++) {
        const dx = p[i*3] - mwx;
        const dy = p[i*3+1] - mwy;
        const dSq = dx*dx + dy*dy;

        if (dSq < REPEL_RADIUS_SQ && dSq > 0.001) {
          const d = Math.sqrt(dSq);
          const force = ((24 - d) / 24) * 0.25;
          ptVel[i*3]   += (dx / d) * force;
          ptVel[i*3+1] += (dy / d) * force;
        }

        // Drag — slightly less during thinking (particles stay livelier)
        const drag = thinking ? 0.980 : 0.972;
        ptVel[i*3]   *= drag;
        ptVel[i*3+1] *= drag;
        ptVel[i*3+2] *= 0.985;

        p[i*3]   += ptVel[i*3];
        p[i*3+1] += ptVel[i*3+1];
        p[i*3+2] += ptVel[i*3+2];

        if (Math.abs(p[i*3])   > 52) ptVel[i*3]   *= -1;
        if (Math.abs(p[i*3+1]) > 37) ptVel[i*3+1] *= -1;
        if (Math.abs(p[i*3+2]) > 27) ptVel[i*3+2] *= -1;
      }
      ptPosAttr.needsUpdate = true;

      // Bağlantı çizgilerini güncelle (her 2 frame)
      if (frame % 2 === 0) {
        const lp = lnAttr.array as Float32Array;
        let lc = 0;
        outer: for (let i = 0; i < COUNT; i++) {
          for (let j = i + 1; j < COUNT; j++) {
            if (lc >= MAX_LINES) break outer;
            const dx = p[i*3] - p[j*3];
            const dy = p[i*3+1] - p[j*3+1];
            const dz = p[i*3+2] - p[j*3+2];
            if (dx*dx + dy*dy + dz*dz < THRESH_SQ) {
              const b = lc * 6;
              lp[b]   = p[i*3];   lp[b+1] = p[i*3+1]; lp[b+2] = p[i*3+2];
              lp[b+3] = p[j*3];   lp[b+4] = p[j*3+1]; lp[b+5] = p[j*3+2];
              lc++;
            }
          }
        }
        lnAttr.needsUpdate = true;
        lnGeo.setDrawRange(0, lc * 2);
      }

      // Kamera parallax — mouse'u yavaşça takip eder
      const t = frame * 0.0007;
      camTargetX = (m.x / W - 0.5) * 10 + Math.sin(t) * 3;
      camTargetY = -(m.y / H - 0.5) * 6 + Math.cos(t * 0.6) * 2;
      camera.position.x += (camTargetX - camera.position.x) * 0.018;
      camera.position.y += (camTargetY - camera.position.y) * 0.018;
      camera.lookAt(0, 0, 0);

      composer.render();
    };
    animate();

    // Resize: update composer size too
    const origSetSize = setSize;
    const setSizeWithComposer = () => {
      origSetSize();
      const w = el.clientWidth, h = el.clientHeight;
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
    };
    ro.disconnect();
    const ro2 = new ResizeObserver(setSizeWithComposer);
    ro2.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro2.disconnect();
      ptGeo.dispose(); ptMat.dispose();
      lnGeo.dispose(); lnMat.dispose();
      composer.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [mouseRef]);

  return (
    <div ref={mountRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]" style={{ zIndex: 0 }} />
  );
}

// ─── Mesaj içeriği ─────────────────────────────────────────────────────────
function MessageContent({ parts }: { parts: UIMessage["parts"] }) {
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "text") {
      nodes.push(<span key={i} style={{ whiteSpace: "pre-wrap" }}>{part.text}</span>);
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      const p = part as { type: string; state: string; toolName?: string };
      const name = (p as { toolName?: string }).toolName ?? part.type.replace(/^tool-/, "");
      const done = p.state === "result" || p.state === "output-available";
      nodes.push(
        <div key={i} className="mt-1 flex items-center gap-1.5 text-[10px]"
          style={{ color: done ? "rgba(91,141,239,0.38)" : "rgba(91,141,239,0.75)" }}>
          <span>{done ? "✓" : "⋯"}</span>
          <span>{name.replace(/_/g, " ")}</span>
        </div>
      );
    }
  }
  return <>{nodes}</>;
}

// ─── Agent seçici — şık yatay pill'ler + tooltip ─────────────────────────
const AGENT_ICONS: Record<string, string> = {
  "builtin:vault":        "◈",
  "builtin:atlas-maker":  "✦",
  "builtin:coder":        "⟨/⟩",
};

function AgentSelector({
  agents,
  activeId,
  onSelect,
}: {
  agents: typeof BUILTIN_AGENTS[number][];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredAgent = agents.find(a => a.id === hovered);

  return (
    <div className="relative flex items-center gap-0.5">
      {agents.slice(0, 3).map(agent => {
        const isActive = agent.id === activeId;
        const icon = AGENT_ICONS[agent.id] ?? "·";
        return (
          <button
            key={agent.id}
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onSelect(agent.id)}
            onMouseEnter={() => setHovered(agent.id)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-all duration-150"
            style={{
              color:      isActive ? "#a5c0f0" : "rgba(255,255,255,0.22)",
              background: isActive ? "rgba(91,141,239,0.14)" : "transparent",
              border:     `1px solid ${isActive ? "rgba(91,141,239,0.28)" : "transparent"}`,
            }}
          >
            <span style={{ fontSize: 9, lineHeight: 1 }}>{icon}</span>
            <span>{agent.name}</span>
          </button>
        );
      })}

      {/* Tooltip */}
      {hovered && hoveredAgent && (
        <div
          className="pointer-events-none absolute top-full mt-2 left-0 z-50 w-[200px] rounded-[7px] px-3 py-2"
          style={{ background: "rgba(14,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", animation: "v3-fadein 0.12s ease" }}
        >
          <p className="text-[11px] font-medium" style={{ color: "#c8c8d0" }}>{hoveredAgent.name}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
            {hoveredAgent.description.slice(0, 90)}{hoveredAgent.description.length > 90 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Şeffaflık butonu ─────────────────────────────────────────────────────
function GlassButton({ level, onClick }: { level: GlassLevel; onClick: () => void }) {
  const pct = Math.round(level * 100);
  return (
    <button
      type="button"
      onMouseDown={e => e.stopPropagation()}
      onClick={onClick}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/5"
      style={{ color: "rgba(255,255,255,0.2)" }}
      title="Şeffaflık ayarla"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M6 1.5A4.5 4.5 0 0 1 10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      {pct}%
    </button>
  );
}

// ─── Mesaj metnini düz yazıya çevirir (TTS için) ─────────────────────────
function extractText(parts: UIMessage["parts"]): string {
  return (parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map(p => p.text)
    .join(" ")
    .trim();
}

// ─── TTS butonu ───────────────────────────────────────────────────────────
function SpeakButton({ text, speakingId, id, onSpeak }: {
  text: string;
  id: string;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
}) {
  const isSpeaking = speakingId === id;
  return (
    <button
      type="button"
      onClick={() => onSpeak(id, text)}
      title={isSpeaking ? "Durdur" : "Seslendir"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginTop: 5,
        padding: "2px 7px 2px 5px",
        borderRadius: 5,
        border: `1px solid ${isSpeaking ? "rgba(155,114,239,0.35)" : "rgba(255,255,255,0.07)"}`,
        background: isSpeaking ? "rgba(155,114,239,0.12)" : "rgba(255,255,255,0.02)",
        color: isSpeaking ? "#9b72ef" : "rgba(255,255,255,0.22)",
        fontSize: 10,
        fontFamily: '"Segoe UI Variable","Segoe UI",system-ui,sans-serif',
        cursor: "pointer",
        transition: "all 150ms ease-out",
      }}
    >
      {isSpeaking ? (
        // Stop icon
        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
          <rect x="1.5" y="1.5" width="7" height="7" rx="1.5"/>
        </svg>
      ) : (
        // Speaker icon
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4.5H1v3h1l3 2.5v-8L2 4.5z"/>
          <path d="M8 3.5a3 3 0 010 5"/>
        </svg>
      )}
      {isSpeaking ? "durdur" : "seslendir"}
    </button>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────
const SESSION_ID = "v3-main";

export function V3OutputShell() {
  const bottomRef      = useRef<HTMLDivElement>(null);
  const mouseRef       = useRef({ x: 0, y: 0 });
  const thinkingRef    = useRef(false);
  const queryBurstRef  = useRef(0);
  const [glassIdx, setGlassIdx] = useState(1); // varsayılan: 0.83
  const glassAlpha  = GLASS_LEVELS[glassIdx];
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const speak = useCallback((id: string, text: string) => {
    if (speakingId === id) {
      speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang  = "tr-TR";
    utt.rate  = 1.05;
    utt.onstart = () => setSpeakingId(id);
    utt.onend   = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    speechSynthesis.speak(utt);
  }, [speakingId]);

  // Mark this window as V3 so globals.css sets body to transparent
  useEffect(() => {
    document.documentElement.setAttribute("data-v3", "true");
    return () => document.documentElement.removeAttribute("data-v3");
  }, []);

  // Store hydration
  useEffect(() => {
    let alive = true;
    void usePreferencesStore.getState().init();
    void getAllKeys().then(keys => { if (alive) useChatStore.getState().setApiKeys(keys); });
    void useAgentsStore.getState().hydrate();
    void useProjectStore.getState().hydrate();
    return () => { alive = false; };
  }, []);

  // Aktif proje değişince workspace root'u güncelle
  const activeProject = useProjectStore(s => s.getActive());
  useEffect(() => {
    useChatStore.getState().setLive({
      getCwd:              () => activeProject.path,
      getWorkspaceRoot:    () => activeProject.path,
      getTerminalContext:  () => null,
      injectIntoActivePty: () => false,
      getActiveFile:       () => null,
      openPreview:         () => false,
    });
  }, [activeProject.path]);

  const activeId    = useAgentsStore(s => s.activeId);
  const setActiveId = useAgentsStore(s => s.setActiveId);
  const customAgents = useAgentsStore(s => s.customAgents);
  const allAgents   = useMemo(() => [...BUILTIN_AGENTS, ...customAgents], [customAgents]);

  const chat    = useMemo(() => getOrCreateChat(SESSION_ID), []);
  const helpers = useChat<UIMessage>({ chat });

  useEffect(() => {
    const unsub = listen<{ text: string }>("atlas:v3-message", (ev) => {
      queryBurstRef.current++;  // trigger particle burst in Three.js
      void chat.sendMessage({
        role: "user",
        parts: [{ type: "text", text: ev.payload.text }],
      } as Parameters<typeof chat.sendMessage>[0]);
    });
    return () => { unsub.then(fn => fn()); };
  }, [chat]);

  // Voice-to-vault: switch to Atlas-Maker, send, restore previous agent
  useEffect(() => {
    const unsub = listen<{ text: string }>("atlas:v3-vault-message", (ev) => {
      queryBurstRef.current++;
      const prev = useAgentsStore.getState().activeId;
      useAgentsStore.getState().setActiveId("builtin:atlas-maker");
      void chat.sendMessage({
        role: "user",
        parts: [{ type: "text", text: ev.payload.text }],
      } as Parameters<typeof chat.sendMessage>[0]).then(() => {
        // Restore after a tick so the agent sees the override during send
        setTimeout(() => useAgentsStore.getState().setActiveId(prev), 0);
      });
    });
    return () => { unsub.then(fn => fn()); };
  }, [chat]);

  // Canvas → V3 wire: inject context from linked canvas panels
  useEffect(() => {
    const unsub = listen<{ panelId: string; data: string }>("atlas:wire-data", (ev) => {
      // Silently prepend as system context — does not send a new user message
      useChatStore.getState().setLive({
        ...useChatStore.getState().live!,
        getWorkspaceRoot: () => activeProject.path,
        getCwd: () => activeProject.path,
        getTerminalContext: () => ev.payload.data,
        injectIntoActivePty: () => false,
        getActiveFile: () => null,
        openPreview: () => false,
      });
    });
    return () => { unsub.then(fn => fn()); };
  }, [activeProject.path]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [helpers.messages]);

  const isThinking = helpers.status === "submitted" || helpers.status === "streaming";
  const hasError   = helpers.status === "error";
  // Sync isThinking to ref for Three.js animate loop (avoids stale closure)
  thinkingRef.current = isThinking;

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    void getCurrentWindow().startDragging();
  }, []);

  const cycleGlass = useCallback(() => {
    setGlassIdx(i => (i + 1) % GLASS_LEVELS.length);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{
        background: `rgba(6,6,8,${glassAlpha})`,   // bg-void #060608
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        transition: "background 300ms ease",
        fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
        fontFeatureSettings: '"ss01", "cv01"',
      }}
      onMouseMove={onMouseMove}
    >
      <ThreeBg mouseRef={mouseRef} thinkingRef={thinkingRef} queryBurstRef={queryBurstRef} />
      <V3Cursor />

      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div
        className="relative z-20 flex shrink-0 cursor-grab select-none items-center justify-between px-3 py-2 active:cursor-grabbing"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        onMouseDown={startDrag}
      >
        {/* Sol: logo + agent seçici */}
        <div className="flex items-center gap-2">
          {/* Atlas logo — thinking ring via conic-gradient pseudo overlay */}
          <div className="relative flex h-[20px] w-[20px] shrink-0 items-center justify-center">
            <div
              className="flex h-full w-full items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#5b8def,#9b72ef)", fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif' }}
            >
              A
            </div>
            {/* Thinking arc ring — spins only while AI is active */}
            {isThinking && (
              <div
                className="pointer-events-none absolute inset-[-3px] rounded-[8px]"
                style={{
                  background: "conic-gradient(#5b8def 0deg 90deg, transparent 90deg 360deg)",
                  WebkitMask: "radial-gradient(transparent 60%, black 61%)",
                  mask: "radial-gradient(transparent 60%, black 61%)",
                  animation: "atlas-thinking 1200ms linear infinite",
                }}
              />
            )}
          </div>
          <AgentSelector agents={allAgents} activeId={activeId} onSelect={setActiveId} />
        </div>

        {/* Sağ: kontroller */}
        <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
          {isThinking && (
            <button type="button" onClick={() => helpers.stop()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/5"
              style={{ color: "rgba(91,141,239,0.7)" }}>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#5b8def]" />
              durdur
            </button>
          )}
          <GlassButton level={glassAlpha} onClick={cycleGlass} />
          <button type="button" onClick={() => void getCurrentWindow().minimize()}
            className="flex h-[20px] w-[20px] items-center justify-center rounded text-[#333] transition-colors hover:bg-white/5 hover:text-[#888]">
            <svg width="9" height="2" viewBox="0 0 10 2" fill="none"><path d="M0 1h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
          <button type="button" onClick={() => void getCurrentWindow().close()}
            className="flex h-[20px] w-[20px] items-center justify-center rounded text-[#333] transition-colors hover:bg-[rgba(255,70,70,0.12)] hover:text-[#ff4646]">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* ── Mesajlar ────────────────────────────────────────────────────── */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-4 py-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.04) transparent" }}
      >
        {helpers.messages.length === 0 && !isThinking && (
          <p className="mt-10 text-center text-[12px]" style={{ color: "rgba(255,255,255,0.06)" }}>
            bir şey sor
          </p>
        )}
        <div className="flex flex-col gap-3">
          {helpers.messages.map(msg => (
            <div
              key={msg.id}
              className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              style={{ animation: "v3-fadein 0.15s ease" }}
            >
              {msg.role === "assistant" && (
                <div className="mr-2 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#5b8def,#9b72ef)" }}>
                  A
                </div>
              )}
              <div className="flex max-w-[82%] flex-col">
                <div
                  className={cn("rounded-[10px] px-3 py-2 text-[13px] leading-relaxed",
                    msg.role === "user" ? "rounded-tr-[3px]" : "rounded-tl-[3px]"
                  )}
                  style={msg.role === "user"
                    ? { background: "rgba(91,141,239,0.12)", color: "#7aa4f0" }
                    : { background: "rgba(255,255,255,0.04)", color: "#c8c8d0", backdropFilter: "blur(8px)" }
                  }
                >
                  <MessageContent parts={msg.parts ?? []} />
                </div>
                {msg.role === "assistant" && extractText(msg.parts ?? []).length > 0 && (
                  <SpeakButton
                    id={msg.id}
                    text={extractText(msg.parts ?? [])}
                    speakingId={speakingId}
                    onSpeak={speak}
                  />
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start" style={{ animation: "v3-fadein 0.1s ease" }}>
              <div className="mr-2 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#5b8def,#9b72ef)" }}>
                A
              </div>
              <div className="flex items-center gap-1 rounded-[10px] rounded-tl-[3px] px-3 py-2"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                {[0, 120, 240].map(d => (
                  <span key={d} className="h-1 w-1 animate-bounce rounded-full bg-[#5b8def]"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}

          {hasError && (
            <div className="flex justify-start" style={{ animation: "v3-fadein 0.1s ease" }}>
              <div className="mr-2 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[7px] font-bold"
                style={{ background: "rgba(239,91,91,0.25)", color: "#ef5b5b" }}>
                !
              </div>
              <div className="max-w-[82%] rounded-[10px] rounded-tl-[3px] px-3 py-2 text-[12px]"
                style={{ background: "rgba(239,91,91,0.08)", color: "#ef8888", border: "1px solid rgba(239,91,91,0.15)" }}>
                <p className="mb-1 font-medium">Bağlantı hatası</p>
                <p style={{ color: "rgba(239,136,136,0.7)", fontSize: 11 }}>
                  {(helpers.error as Error | undefined)?.message ?? "AI sağlayıcısına bağlanılamadı."}
                </p>
                <p className="mt-1.5" style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                  LM Studio veya Ollama çalışıyor mu? Settings → Models bölümünden kontrol et.
                </p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
