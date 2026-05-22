import { create } from "zustand";

export type BgStyle = "dot" | "grid" | "solid" | "radial" | "noise";
export type WireAnim = "off" | "pulse" | "flow";
export type WireStyle = "bezier" | "orthogonal";
export type DensityMode = "compact" | "comfy" | "spacious";
export type QualityMode = "performance" | "quality";
export type HeaderStyle = "stripe" | "fill" | "none";

export interface CanvasTweaks {
  bgStyle: BgStyle;
  showMinimap: boolean;
  showGuides: boolean;
  wireAnim: WireAnim;
  wireStyle: WireStyle;
  panelRadius: number;
  panelBorder: number;
  headerStyle: HeaderStyle;
  density: DensityMode;
  qualityMode: QualityMode;
  glowAmount: number;
  ambientGlow: boolean;
}

export const TWEAK_DEFAULTS: CanvasTweaks = {
  bgStyle: "dot",
  showMinimap: true,
  showGuides: true,
  wireAnim: "flow",
  wireStyle: "bezier",
  panelRadius: 8,
  panelBorder: 1,
  headerStyle: "stripe",
  density: "compact",
  qualityMode: "performance",
  glowAmount: 0,
  ambientGlow: false,
};

interface TweaksState extends CanvasTweaks {
  set: <K extends keyof CanvasTweaks>(key: K, value: CanvasTweaks[K]) => void;
}

export const useTweaksStore = create<TweaksState>((set) => ({
  ...TWEAK_DEFAULTS,
  set: (key, value) => set({ [key]: value } as Partial<TweaksState>),
}));
