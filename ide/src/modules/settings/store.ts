import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_MODEL_ID,
  LMSTUDIO_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  type AutocompleteProviderId,
  type ModelId,
} from "@/modules/ai/config";
import type { KeyBinding, ShortcutId } from "@/modules/shortcuts/shortcuts";

export type ThemePref = "system" | "light" | "dark";

export const EDITOR_THEMES = [
  "atomone",
  "aura",
  "copilot",
  "github-dark",
  "github-light",
  "nord",
  "tokyo-night",
  "xcode-dark",
  "xcode-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEMES)[number];

export const EDITOR_THEME_LABELS: Record<EditorThemeId, string> = {
  atomone: "Atom One",
  aura: "Aura",
  copilot: "Copilot",
  "github-dark": "GitHub Dark",
  "github-light": "GitHub Light",
  nord: "Nord",
  "tokyo-night": "Tokyo Night",
  "xcode-dark": "Xcode Dark",
  "xcode-light": "Xcode Light",
};

export type EmbeddingBackend = "sentence-transformers" | "ollama";

export type LayoutMode = "classic" | "focused" | "canvas";

export type Preferences = {
  theme: ThemePref;
  defaultModelId: ModelId;
  editorTheme: EditorThemeId;
  customInstructions: string;
  autostart: boolean;
  restoreWindowState: boolean;
  autocompleteEnabled: boolean;
  autocompleteProvider: AutocompleteProviderId;
  autocompleteModelId: string;
  lmstudioBaseURL: string;
  ollamaBaseURL: string;
  vimMode: boolean;
  shortcuts: Record<ShortcutId, KeyBinding[]>;
  workspaceRoot: string | null;
  searxngUrl: string;
  embeddingBackend: EmbeddingBackend;
  embeddingOllamaModel: string;
  layoutMode: LayoutMode;
  sentorPath: string;
  onboarded: boolean;
  barCollapsed: boolean;
  focusedTopOpen: boolean;
  focusedLeftOpen: boolean;
  /** OpenCode Zen model identifier (e.g. "deepseek-v4-flash-free"). Empty = use provider default. */
  opencodeChatModelId: string;
};

const STORE_PATH = "sentor-settings.json";
const KEY_THEME = "theme";
const KEY_DEFAULT_MODEL = "defaultModelId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_CUSTOM_INSTRUCTIONS = "customInstructions";
const KEY_AUTOSTART = "autostart";
const KEY_RESTORE_WINDOW = "restoreWindowState";
const KEY_AUTOCOMPLETE_ENABLED = "autocompleteEnabled";
const KEY_AUTOCOMPLETE_PROVIDER = "autocompleteProvider";
const KEY_AUTOCOMPLETE_MODEL = "autocompleteModelId";
const KEY_LMSTUDIO_BASE_URL = "lmstudioBaseURL";
const KEY_OLLAMA_BASE_URL = "ollamaBaseURL";
const KEY_VIM_MODE = "vimMode";
const KEY_SHORTCUTS = "shortcuts";
const KEY_WORKSPACE_ROOT = "workspaceRoot";
const KEY_SEARXNG_URL = "searxngUrl";
const KEY_EMBEDDING_BACKEND = "embeddingBackend";
const KEY_EMBEDDING_OLLAMA_MODEL = "embeddingOllamaModel";
const KEY_LAYOUT_MODE = "layoutMode";
const KEY_SENTOR_PATH = "sentorPath";
const KEY_BAR_COLLAPSED = "barCollapsed";
const KEY_FOCUSED_TOP_OPEN = "focusedTopOpen";
const KEY_FOCUSED_LEFT_OPEN = "focusedLeftOpen";
const KEY_OPENCODE_CHAT_MODEL = "opencodeChatModelId";
const KEY_ONBOARDED = "onboarded";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  defaultModelId: DEFAULT_MODEL_ID,
  editorTheme: "atomone",
  customInstructions: "",
  autostart: false,
  restoreWindowState: true,
  autocompleteEnabled: false,
  autocompleteProvider: "lmstudio",
  autocompleteModelId: DEFAULT_AUTOCOMPLETE_MODEL.lmstudio,
  lmstudioBaseURL: LMSTUDIO_DEFAULT_BASE_URL,
  ollamaBaseURL: OLLAMA_DEFAULT_BASE_URL,
  vimMode: false,
  shortcuts: {} as Record<ShortcutId, KeyBinding[]>,
  workspaceRoot: null,
  searxngUrl: "https://searx.be",
  embeddingBackend: "sentence-transformers",
  embeddingOllamaModel: "all-minilm",
  layoutMode: "canvas",
  sentorPath: "",
  barCollapsed: false,
  focusedTopOpen: true,
  focusedLeftOpen: false,
  opencodeChatModelId: "deepseek-v4-flash-free",
  onboarded: false,
};

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

const PREFS_CHANGED_EVENT = "sentor://prefs-changed";

async function writePref<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
  await emit(PREFS_CHANGED_EVENT, { key, value });
}

export async function loadPreferences(): Promise<Preferences> {
  const entries = await store.entries();
  const map = new Map<string, unknown>(entries);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  return {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    defaultModelId: (() => {
      const saved = get<ModelId>(KEY_DEFAULT_MODEL);
      // Always use opencode-chat — only provider
      if (!saved || saved !== "opencode-chat") return "opencode-chat";
      return saved;
    })(),
    editorTheme:
      get<EditorThemeId>(KEY_EDITOR_THEME) ?? DEFAULT_PREFERENCES.editorTheme,
    customInstructions:
      get<string>(KEY_CUSTOM_INSTRUCTIONS) ??
      DEFAULT_PREFERENCES.customInstructions,
    autostart: get<boolean>(KEY_AUTOSTART) ?? DEFAULT_PREFERENCES.autostart,
    restoreWindowState:
      get<boolean>(KEY_RESTORE_WINDOW) ??
      DEFAULT_PREFERENCES.restoreWindowState,
    autocompleteEnabled:
      get<boolean>(KEY_AUTOCOMPLETE_ENABLED) ??
      DEFAULT_PREFERENCES.autocompleteEnabled,
    autocompleteProvider:
      get<AutocompleteProviderId>(KEY_AUTOCOMPLETE_PROVIDER) ??
      DEFAULT_PREFERENCES.autocompleteProvider,
    autocompleteModelId:
      get<string>(KEY_AUTOCOMPLETE_MODEL) ??
      DEFAULT_PREFERENCES.autocompleteModelId,
    lmstudioBaseURL:
      get<string>(KEY_LMSTUDIO_BASE_URL) ?? DEFAULT_PREFERENCES.lmstudioBaseURL,
    ollamaBaseURL:
      get<string>(KEY_OLLAMA_BASE_URL) ?? DEFAULT_PREFERENCES.ollamaBaseURL,
    vimMode: get<boolean>(KEY_VIM_MODE) ?? DEFAULT_PREFERENCES.vimMode,
    shortcuts:
      get<Record<ShortcutId, KeyBinding[]>>(KEY_SHORTCUTS) ??
      DEFAULT_PREFERENCES.shortcuts,
    workspaceRoot: get<string>(KEY_WORKSPACE_ROOT) ?? null,
    searxngUrl: get<string>(KEY_SEARXNG_URL) ?? DEFAULT_PREFERENCES.searxngUrl,
    embeddingBackend:
      get<EmbeddingBackend>(KEY_EMBEDDING_BACKEND) ?? DEFAULT_PREFERENCES.embeddingBackend,
    embeddingOllamaModel:
      get<string>(KEY_EMBEDDING_OLLAMA_MODEL) ?? DEFAULT_PREFERENCES.embeddingOllamaModel,
    layoutMode: "canvas" as LayoutMode,
    sentorPath:
      get<string>(KEY_SENTOR_PATH) ?? DEFAULT_PREFERENCES.sentorPath,
    barCollapsed:
      get<boolean>(KEY_BAR_COLLAPSED) ?? DEFAULT_PREFERENCES.barCollapsed,
    opencodeChatModelId: (() => {
      const raw = get<string>(KEY_OPENCODE_CHAT_MODEL) ?? DEFAULT_PREFERENCES.opencodeChatModelId;
      // Strip "provider/" prefix — old default was "deepseek/deepseek-v4-flash-free"
      const slash = raw.lastIndexOf("/");
      return slash !== -1 && raw.lastIndexOf(".") === -1 ? raw.slice(slash + 1) : raw;
    })(),
    onboarded: get<boolean>(KEY_ONBOARDED) ?? DEFAULT_PREFERENCES.onboarded,
    focusedTopOpen: get<boolean>(KEY_FOCUSED_TOP_OPEN) ?? DEFAULT_PREFERENCES.focusedTopOpen,
    focusedLeftOpen: get<boolean>(KEY_FOCUSED_LEFT_OPEN) ?? DEFAULT_PREFERENCES.focusedLeftOpen,
  };
}

export async function setTheme(value: ThemePref): Promise<void> {
  await writePref(KEY_THEME, value);
}

export async function setDefaultModel(value: ModelId): Promise<void> {
  await writePref(KEY_DEFAULT_MODEL, value);
}

export async function setEditorTheme(value: EditorThemeId): Promise<void> {
  await writePref(KEY_EDITOR_THEME, value);
}

export async function setCustomInstructions(value: string): Promise<void> {
  await writePref(KEY_CUSTOM_INSTRUCTIONS, value);
}

export async function setAutostart(value: boolean): Promise<void> {
  await writePref(KEY_AUTOSTART, value);
}

export async function setRestoreWindowState(value: boolean): Promise<void> {
  await writePref(KEY_RESTORE_WINDOW, value);
}

export async function setAutocompleteEnabled(value: boolean): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_ENABLED, value);
}

export async function setAutocompleteProvider(
  value: AutocompleteProviderId,
): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_PROVIDER, value);
}

export async function setAutocompleteModelId(value: string): Promise<void> {
  await writePref(KEY_AUTOCOMPLETE_MODEL, value);
}

export async function setLmstudioBaseURL(value: string): Promise<void> {
  await writePref(KEY_LMSTUDIO_BASE_URL, value);
}

export async function setOllamaBaseURL(value: string): Promise<void> {
  await writePref(KEY_OLLAMA_BASE_URL, value);
}

export async function setVimMode(value: boolean): Promise<void> {
  await writePref(KEY_VIM_MODE, value);
}

export async function setWorkspaceRoot(value: string | null): Promise<void> {
  await writePref(KEY_WORKSPACE_ROOT, value);
}

export async function setSearxngUrl(value: string): Promise<void> {
  await writePref(KEY_SEARXNG_URL, value);
}

export async function setEmbeddingBackend(value: EmbeddingBackend): Promise<void> {
  await writePref(KEY_EMBEDDING_BACKEND, value);
}

export async function setEmbeddingOllamaModel(value: string): Promise<void> {
  await writePref(KEY_EMBEDDING_OLLAMA_MODEL, value);
}

export async function setLayoutMode(value: LayoutMode): Promise<void> {
  await writePref(KEY_LAYOUT_MODE, value);
}

export async function setSentorPath(value: string): Promise<void> {
  await writePref(KEY_SENTOR_PATH, value);
}

export async function setBarCollapsed(value: boolean): Promise<void> {
  await writePref(KEY_BAR_COLLAPSED, value);
}

export async function setOpencodeChatModelId(value: string): Promise<void> {
  await writePref(KEY_OPENCODE_CHAT_MODEL, value);
}

export async function setFocusedTopOpen(value: boolean): Promise<void> {
  await writePref(KEY_FOCUSED_TOP_OPEN, value);
}

export async function setFocusedLeftOpen(value: boolean): Promise<void> {
  await writePref(KEY_FOCUSED_LEFT_OPEN, value);
}

export async function setOnboarded(value: boolean): Promise<void> {
  await writePref(KEY_ONBOARDED, value);
}

export async function setShortcuts(
  value: Record<ShortcutId, KeyBinding[]> | {},
): Promise<void> {
  await store.set(KEY_SHORTCUTS, value);
  await store.save();
}

export async function resetShortcuts(): Promise<void> {
  await store.set(KEY_SHORTCUTS, DEFAULT_PREFERENCES.shortcuts);
  await store.save();
}

export type PrefKey = keyof Preferences;

/** Subscribe to changes from any window (settings → main). */
export async function onPreferencesChange(
  cb: (key: PrefKey, value: unknown) => void,
): Promise<UnlistenFn> {
  const map: Record<string, PrefKey> = {
    [KEY_THEME]: "theme",
    [KEY_DEFAULT_MODEL]: "defaultModelId",
    [KEY_EDITOR_THEME]: "editorTheme",
    [KEY_CUSTOM_INSTRUCTIONS]: "customInstructions",
    [KEY_AUTOSTART]: "autostart",
    [KEY_RESTORE_WINDOW]: "restoreWindowState",
    [KEY_AUTOCOMPLETE_ENABLED]: "autocompleteEnabled",
    [KEY_AUTOCOMPLETE_PROVIDER]: "autocompleteProvider",
    [KEY_AUTOCOMPLETE_MODEL]: "autocompleteModelId",
    [KEY_LMSTUDIO_BASE_URL]: "lmstudioBaseURL",
    [KEY_OLLAMA_BASE_URL]: "ollamaBaseURL",
    [KEY_VIM_MODE]: "vimMode",
    [KEY_SHORTCUTS]: "shortcuts",
    [KEY_WORKSPACE_ROOT]: "workspaceRoot",
    [KEY_SEARXNG_URL]: "searxngUrl",
    [KEY_EMBEDDING_BACKEND]: "embeddingBackend",
    [KEY_EMBEDDING_OLLAMA_MODEL]: "embeddingOllamaModel",
    [KEY_LAYOUT_MODE]: "layoutMode",
    [KEY_SENTOR_PATH]: "sentorPath",
    [KEY_BAR_COLLAPSED]: "barCollapsed",
    [KEY_OPENCODE_CHAT_MODEL]: "opencodeChatModelId",
  };
  const unsubLocal = await store.onChange<unknown>((key, value) => {
    const mapped = map[key];
    if (mapped) cb(mapped, value);
  });
  const unsubEvent = await listen<{ key: string; value: unknown }>(
    PREFS_CHANGED_EVENT,
    (e) => {
      const mapped = map[e.payload.key];
      if (mapped) cb(mapped, e.payload.value);
    },
  );
  return () => {
    unsubLocal();
    unsubEvent();
  };
}

const KEYS_CHANGED_EVENT = "sentor://ai-keys-changed";

export async function emitKeysChanged(): Promise<void> {
  await emit(KEYS_CHANGED_EVENT);
}

export function onKeysChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(KEYS_CHANGED_EVENT, () => cb());
}
