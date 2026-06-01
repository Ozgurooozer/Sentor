# Phase L — Blueprint / Variable Node Sistemi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas'a Unreal Engine tarzı Variable sistemi ve temel kontrol akışı node'ları (Variable, If/Else, For-Each) eklemek; tüm output'lar isimli değişken olarak kaydedilip canvas genelinde kullanılabilecek.

**Architecture:** `variableStore.ts` isimli Zustand store tüm değişkenleri tutar ve persist eder. Her `variable` panel belirli bir değişkeni gösterir/yazar; gelen wire yeni bir değer atadığında store güncellenir ve output wire ile downstream'e iletilir. `if-else` ve `for-each` node'ları saf dataflow: input aldığında output üretir, Orkestra bunların yanından geçerken kontrol akışını yürütür.

**Tech Stack:** React + Zustand + Tauri v2 + TypeScript; mevcut canvasStore/portDefs/CanvasPanelContent pattern'ine uygun; Phase J glass aesthetic (rgba token'lar).

---

## Dosya Haritası

| Durum | Dosya | Sorumluluk |
|-------|-------|------------|
| Yeni | `ide/src/modules/canvas/variableStore.ts` | Global değişken store (Zustand + LazyStore persist) |
| Yeni | `ide/src/modules/canvas/VariablePanel.tsx` | Variable node UI |
| Yeni | `ide/src/modules/canvas/IfElsePanel.tsx` | If/Else node UI |
| Yeni | `ide/src/modules/canvas/ForEachPanel.tsx` | For-Each node UI |
| Değiştirilecek | `ide/src/modules/canvas/types.ts` | PanelType union'a 3 yeni tip |
| Değiştirilecek | `ide/src/modules/canvas/portDefs.ts` | 3 yeni panel için PORT_DEFS |
| Değiştirilecek | `ide/src/modules/canvas/canvasStore.ts` | PANEL_DEFAULTS'e 3 yeni tip |
| Değiştirilecek | `ide/src/modules/canvas/CanvasPanelContent.tsx` | PANEL_REGISTRY'ye 3 yeni renderer |
| Değiştirilecek | `ide/src/modules/canvas/orkestraStore.ts` | `var_set`, `var_get`, `var_list` Orkestra tool'ları |
| Değiştirilecek | `ide/src/modules/ai/tools/canvas.ts` | `variable_set`, `variable_get`, `variable_list` AI SDK tool'ları |

---

## Task 1: variableStore.ts — Global Değişken Store

**Files:**
- Create: `ide/src/modules/canvas/variableStore.ts`

### Tasarım

Her canvas session'ında değişkenler `LazyStore` (Tauri plugin-store) üzerinde persist edilir. Key: `sentor-variables.json`. Store global'dir — canvas'lar arası paylaşım.

- [ ] **Adım 1.1 — variableStore.ts yaz:**

```typescript
// ide/src/modules/canvas/variableStore.ts
import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";

export interface VariableRecord {
  id: string;
  name: string;           // unique key, e.g. "myVar"
  value: unknown;         // current value
  dataType: "text" | "json" | "number" | "any";
  updatedAt: number;      // Date.now() timestamp
}

interface VariableState {
  variables: VariableRecord[];
  hydrated: boolean;
}

interface VariableActions {
  setVariable(name: string, value: unknown, dataType?: VariableRecord["dataType"]): void;
  getVariable(name: string): VariableRecord | undefined;
  removeVariable(name: string): void;
  listVariables(): VariableRecord[];
  hydrate(): Promise<void>;
}

const _store = new LazyStore("sentor-variables.json", { autoSave: 400 });

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(state: VariableState) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    await _store.set("variables", state.variables).catch(() => undefined);
    await _store.save().catch(() => undefined);
  }, 400);
}

export const useVariableStore = create<VariableState & VariableActions>((set, get) => ({
  variables: [],
  hydrated: false,

  setVariable(name, value, dataType = "any") {
    const existing = get().variables.find((v) => v.name === name);
    let updated: VariableRecord[];
    if (existing) {
      updated = get().variables.map((v) =>
        v.name === name ? { ...v, value, dataType, updatedAt: Date.now() } : v,
      );
    } else {
      const newVar: VariableRecord = {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        value,
        dataType,
        updatedAt: Date.now(),
      };
      updated = [...get().variables, newVar];
    }
    set({ variables: updated });
    scheduleFlush({ variables: updated, hydrated: true });
  },

  getVariable(name) {
    return get().variables.find((v) => v.name === name);
  },

  removeVariable(name) {
    const updated = get().variables.filter((v) => v.name !== name);
    set({ variables: updated });
    scheduleFlush({ variables: updated, hydrated: true });
  },

  listVariables() {
    return get().variables;
  },

  async hydrate() {
    if (get().hydrated) return;
    try {
      const saved = await _store.get<VariableRecord[]>("variables");
      if (Array.isArray(saved)) set({ variables: saved, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
```

- [ ] **Adım 1.2 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 1.3 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/variableStore.ts
git commit -m "feat(canvas): add variableStore — Zustand + LazyStore persist"
```

---

## Task 2: types.ts + portDefs.ts + canvasStore.ts — Yeni Panel Tipleri

**Files:**
- Modify: `ide/src/modules/canvas/types.ts`
- Modify: `ide/src/modules/canvas/portDefs.ts`
- Modify: `ide/src/modules/canvas/canvasStore.ts`

### Tasarım

3 yeni PanelType: `"variable"`, `"if-else"`, `"for-each"`.

Port tasarımı:
- **variable** → inputs: `set` (data, any), outputs: `value` (data, any)
- **if-else** → inputs: `condition` (data, text), `true_val` (data, any), `false_val` (data, any), outputs: `result` (data, any)
- **for-each** → inputs: `items` (data, any), outputs: `items_json` (data, json), `item_count` (data, text)

- [ ] **Adım 2.1 — types.ts'e 3 yeni tip ekle:**

`ide/src/modules/canvas/types.ts` içindeki `PanelType` union'ın son satırından önce ekle:

```typescript
  | "variable"
  | "if-else"
  | "for-each"
```

Dosyada `type PanelType =` ile başlayan bloğu bul, en sona `| "audio"` gibi bir satırın arkasına ekle.

- [ ] **Adım 2.2 — portDefs.ts'e 3 yeni port tanımı ekle:**

`ide/src/modules/canvas/portDefs.ts` içindeki `PORT_DEFS` nesnesine ekle (dosyanın sonundaki `} as const;`'tan önce):

```typescript
  "variable": {
    inputs:  [{ id: "set",       label: "Set",      kind: "data",    dataType: "any"  }],
    outputs: [{ id: "value",     label: "Value",    kind: "data",    dataType: "any"  }],
  },
  "if-else": {
    inputs:  [
      { id: "condition", label: "Condition", kind: "data", dataType: "text" },
      { id: "true_val",  label: "True",      kind: "data", dataType: "any"  },
      { id: "false_val", label: "False",     kind: "data", dataType: "any"  },
    ],
    outputs: [{ id: "result", label: "Result", kind: "data", dataType: "any" }],
  },
  "for-each": {
    inputs:  [{ id: "items",      label: "Items",      kind: "data", dataType: "any"  }],
    outputs: [
      { id: "items_json",  label: "Items JSON", kind: "data", dataType: "json" },
      { id: "item_count",  label: "Count",      kind: "data", dataType: "text" },
    ],
  },
```

- [ ] **Adım 2.3 — canvasStore.ts PANEL_DEFAULTS'e 3 yeni tip ekle:**

`PANEL_DEFAULTS` nesnesine (tüm tipler orada tanımlı) şunları ekle:

```typescript
  "variable":  { width: 220, height: 120, title: "Variable" },
  "if-else":   { width: 260, height: 160, title: "If / Else" },
  "for-each":  { width: 260, height: 160, title: "For Each" },
```

- [ ] **Adım 2.4 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata (PANEL_DEFAULTS artık Record<PanelType, ...> olduğundan eksik key TS hatası verir; yukarıdaki ekleme bunları kapatamalı)

- [ ] **Adım 2.5 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/types.ts ide/src/modules/canvas/portDefs.ts ide/src/modules/canvas/canvasStore.ts
git commit -m "feat(canvas): add variable, if-else, for-each panel types + ports + defaults"
```

---

## Task 3: VariablePanel.tsx

**Files:**
- Create: `ide/src/modules/canvas/VariablePanel.tsx`
- Modify: `ide/src/modules/canvas/CanvasPanelContent.tsx`

### Tasarım

VariablePanel:
- Üstte isim alanı (değiştirilebilir, `meta.varName` kaydeder)
- Ortada mevcut değer (read-only, variableStore'dan)
- Gelen `set` wire → değeri variableStore'a yazar + setOutputData
- Eğer wire yoksa `meta.initialValue` kullanılır

- [ ] **Adım 3.1 — VariablePanel.tsx yaz:**

```typescript
// ide/src/modules/canvas/VariablePanel.tsx
import { useEffect, useRef } from "react";
import { useCanvasStore } from "./canvasStore";
import { useVariableStore } from "./variableStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props { panelId: string }

export function VariablePanel({ panelId }: Props) {
  const panel      = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutput  = useCanvasStore((s) => s.setOutputData);
  const { setVariable, getVariable } = useVariableStore();

  const wireBlocks = useAllIncomingWireData(panelId);
  const setWire    = wireBlocks.find((b) => b.toPort === "set" || !b.toPort);

  const varName    = String(panel?.meta?.varName ?? "myVar");
  const initial    = panel?.meta?.initialValue ?? "";

  // Write incoming wire value to the variable store + output wire
  const lastWireRef = useRef<unknown>(undefined);
  useEffect(() => {
    const incoming = setWire?.data?.value ?? initial;
    if (incoming === lastWireRef.current) return;
    lastWireRef.current = incoming;
    setVariable(varName, incoming);
    setOutput(panelId, { kind: "text", value: String(incoming) });
  }, [setWire?.data?.value, varName, initial, panelId, setVariable, setOutput]);

  // Hydrate on mount: if no wire, push initial/stored value
  useEffect(() => {
    const stored = getVariable(varName)?.value ?? initial;
    setOutput(panelId, { kind: "text", value: String(stored) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varName]);

  const currentVal = String(getVariable(varName)?.value ?? initial);

  const accent = "#5b8def";

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {/* Variable name */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "system-ui", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          VAR
        </span>
        <input
          value={varName}
          onChange={(e) => updatePanel(panelId, { meta: { ...panel?.meta, varName: e.target.value } })}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${accent}35`,
            borderRadius: 5,
            color: accent,
            fontSize: 12,
            fontFamily: "system-ui",
            padding: "2px 7px",
            outline: "none",
          }}
          placeholder="variableName"
          spellCheck={false}
        />
      </div>

      {/* Current value display */}
      <div style={{
        flex: 1,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 6,
        padding: "6px 8px",
        fontSize: 12,
        color: "#c8c8d0",
        fontFamily: "system-ui",
        overflow: "hidden",
        wordBreak: "break-all",
        whiteSpace: "pre-wrap",
        lineHeight: 1.5,
      }}>
        {currentVal || <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
      </div>

      {/* Wire indicator */}
      {setWire && (
        <div style={{ fontSize: 10, color: "rgba(91,141,239,0.6)", fontFamily: "system-ui" }}>
          ← {setWire.panelTitle}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Adım 3.2 — CanvasPanelContent.tsx'e ekle:**

`CanvasPanelContent.tsx` içinde import satırlarına ekle:

```typescript
import { VariablePanel } from "./VariablePanel";
```

`PANEL_REGISTRY` nesnesine ekle:

```typescript
  "variable": ({ panel }) => <VariablePanel panelId={panel.id} />,
```

- [ ] **Adım 3.3 — variableStore hydrate'i uygulama başlangıcında çağır:**

`ide/src/app/CanvasAppShell.tsx` içinde (diğer useEffect'lerle birlikte):

```typescript
import { useVariableStore } from "@/modules/canvas/variableStore";

// CanvasAppShell component içinde:
useEffect(() => {
  void useVariableStore.getState().hydrate();
}, []);
```

- [ ] **Adım 3.4 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 3.5 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/VariablePanel.tsx ide/src/modules/canvas/CanvasPanelContent.tsx ide/src/app/CanvasAppShell.tsx
git commit -m "feat(canvas): add VariablePanel — wire-to-variable assignment + glass UI"
```

---

## Task 4: IfElsePanel.tsx

**Files:**
- Create: `ide/src/modules/canvas/IfElsePanel.tsx`
- Modify: `ide/src/modules/canvas/CanvasPanelContent.tsx`

### Tasarım

If/Else saf dataflow: her input wire güncellendiğinde condition değerlendirilir, doğru branch output olarak emit edilir.

Condition değerlendirme kuralı:
- Boş string, `"0"`, `"false"`, `"null"`, `"undefined"` → false
- Diğer her şey → true

- [ ] **Adım 4.1 — IfElsePanel.tsx yaz:**

```typescript
// ide/src/modules/canvas/IfElsePanel.tsx
import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props { panelId: string }

function evalCondition(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "null" && s !== "undefined";
}

export function IfElsePanel({ panelId }: Props) {
  const setOutput  = useCanvasStore((s) => s.setOutputData);
  const wireBlocks = useAllIncomingWireData(panelId);

  const condWire  = wireBlocks.find((b) => b.toPort === "condition");
  const trueWire  = wireBlocks.find((b) => b.toPort === "true_val");
  const falseWire = wireBlocks.find((b) => b.toPort === "false_val");

  const condVal  = condWire?.data?.value;
  const trueVal  = trueWire?.data?.value;
  const falseVal = falseWire?.data?.value;

  useEffect(() => {
    if (condVal === undefined) return; // no condition wired yet
    const result = evalCondition(condVal) ? trueVal : falseVal;
    setOutput(panelId, { kind: "text", value: String(result ?? "") });
  }, [condVal, trueVal, falseVal, panelId, setOutput]);

  const isTrue   = condVal !== undefined && evalCondition(condVal);
  const isFalse  = condVal !== undefined && !evalCondition(condVal);
  const resultVal = condVal !== undefined ? String(evalCondition(condVal) ? trueVal ?? "" : falseVal ?? "") : null;

  const accent   = "#5b8def";
  const green    = "#4db89a";
  const orange   = "#e09060";

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%", fontFamily: "system-ui" }}>
      {/* Condition display */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>IF</span>
        <div style={{
          flex: 1,
          padding: "3px 8px",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${condWire ? accent + "40" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 5,
          fontSize: 11,
          color: condWire ? accent : "rgba(255,255,255,0.2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {condWire ? String(condVal ?? "") : "— wire condition port"}
        </div>
        {condVal !== undefined && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            background: isTrue ? green + "25" : orange + "25",
            color: isTrue ? green : orange,
            border: `1px solid ${isTrue ? green : orange}35`,
          }}>
            {isTrue ? "TRUE" : "FALSE"}
          </span>
        )}
      </div>

      {/* Branch rows */}
      {[
        { label: "THEN", wire: trueWire,  active: isTrue,  color: green  },
        { label: "ELSE", wire: falseWire, active: isFalse, color: orange },
      ].map(({ label, wire, active, color }) => (
        <div key={label} style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          background: active ? color + "15" : "rgba(255,255,255,0.03)",
          border: `1px solid ${active ? color + "35" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 6,
          transition: "background 150ms ease-out, border-color 150ms ease-out",
        }}>
          <span style={{ fontSize: 9, color: active ? color : "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 32 }}>{label}</span>
          <span style={{ fontSize: 11, color: wire ? "#c8c8d0" : "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {wire ? String(wire.data?.value ?? "") : "— wire port"}
          </span>
        </div>
      ))}

      {/* Result */}
      {resultVal !== null && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          → {resultVal || <em>empty</em>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Adım 4.2 — CanvasPanelContent.tsx'e ekle:**

Import:
```typescript
import { IfElsePanel } from "./IfElsePanel";
```

PANEL_REGISTRY:
```typescript
  "if-else": ({ panel }) => <IfElsePanel panelId={panel.id} />,
```

- [ ] **Adım 4.3 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 4.4 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/IfElsePanel.tsx ide/src/modules/canvas/CanvasPanelContent.tsx
git commit -m "feat(canvas): add IfElsePanel — dataflow conditional routing"
```

---

## Task 5: ForEachPanel.tsx

**Files:**
- Create: `ide/src/modules/canvas/ForEachPanel.tsx`
- Modify: `ide/src/modules/canvas/CanvasPanelContent.tsx`

### Tasarım

ForEach saf dataflow: items input'u ayrıştırır (JSON array veya newline-separated), items_json ve item_count output'larını emit eder.

Ayrıştırma kuralı:
1. JSON parse dene → array ise kullan
2. Başarısız olursa newline ile böl
3. Boş satırları filtrele

- [ ] **Adım 5.1 — ForEachPanel.tsx yaz:**

```typescript
// ide/src/modules/canvas/ForEachPanel.tsx
import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props { panelId: string }

function parseItems(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const s = String(raw);
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* not JSON */ }
  return s.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function ForEachPanel({ panelId }: Props) {
  const setOutput  = useCanvasStore((s) => s.setOutputData);
  const wireBlocks = useAllIncomingWireData(panelId);

  const itemsWire = wireBlocks.find((b) => b.toPort === "items" || !b.toPort);
  const rawValue  = itemsWire?.data?.value;

  useEffect(() => {
    const items = parseItems(rawValue);
    setOutput(panelId, {
      kind: "json",
      value: JSON.stringify(items),
    });
  }, [rawValue, panelId, setOutput]);

  const items = parseItems(rawValue);
  const accent = "#5b8def";

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          FOR EACH
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 4,
          background: items.length > 0 ? accent + "20" : "rgba(255,255,255,0.05)",
          color: items.length > 0 ? accent : "rgba(255,255,255,0.3)",
          border: `1px solid ${items.length > 0 ? accent + "35" : "rgba(255,255,255,0.08)"}`,
        }}>
          {items.length} items
        </span>
      </div>

      {/* Items preview */}
      <div style={{
        flex: 1,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 6,
        padding: "6px 8px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}>
        {items.length === 0 ? (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>— wire items port</span>
        ) : (
          items.slice(0, 8).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", minWidth: 16, textAlign: "right" }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: "#c8c8d0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item}
              </span>
            </div>
          ))
        )}
        {items.length > 8 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", paddingLeft: 22 }}>
            +{items.length - 8} more
          </span>
        )}
      </div>

      {/* Source indicator */}
      {itemsWire && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ← {itemsWire.panelTitle}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Adım 5.2 — CanvasPanelContent.tsx'e ekle:**

Import:
```typescript
import { ForEachPanel } from "./ForEachPanel";
```

PANEL_REGISTRY:
```typescript
  "for-each": ({ panel }) => <ForEachPanel panelId={panel.id} />,
```

- [ ] **Adım 5.3 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 5.4 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/ForEachPanel.tsx ide/src/modules/canvas/CanvasPanelContent.tsx
git commit -m "feat(canvas): add ForEachPanel — dataflow list splitter"
```

---

## Task 6: Orkestra Entegrasyonu — Variable + Control Flow Tools

**Files:**
- Modify: `ide/src/modules/canvas/orkestraStore.ts`

### Tasarım

3 yeni Orkestra tool'u: `var_set`, `var_get`, `var_list`. Bunlar JSON scanning yaklaşımıyla çalışır — küçük modeller bu araçları text olarak emit eder.

Ayrıca `buildSystem()` çıktısına mevcut değişkenlerin listesi eklenir; model hangi değişkenlerin mevcut olduğunu görür.

- [ ] **Adım 6.1 — orkestraStore.ts'i oku:**

Mevcut `execTool` switch bloğunun sonunu ve `buildSystem()` fonksiyonunu gözlemle (satır 105-322 arası).

- [ ] **Adım 6.2 — variableStore import ekle:**

`orkestraStore.ts` dosyasının başına:

```typescript
import { useVariableStore } from "./variableStore";
```

- [ ] **Adım 6.3 — execTool switch'e 3 yeni case ekle:**

`execTool` içindeki `// Legacy aliases` yorumundan önce:

```typescript
    case "var_set": {
      // {"tool":"var_set","name":"myVar","value":"hello"}
      const name  = String(call.name ?? "").trim();
      const value = call.value ?? "";
      if (!name) return "error: name is required";
      useVariableStore.getState().setVariable(name, value, "any");
      // Also find and update any variable panel with matching varName
      const varPanel = s.panels.find((p) => p.type === "variable" && p.meta?.varName === name);
      if (varPanel) s.setOutputData(varPanel.id, { kind: "text", value: String(value) });
      return `set $${name} = ${String(value).slice(0, 60)}`;
    }

    case "var_get": {
      // {"tool":"var_get","name":"myVar"}
      const name = String(call.name ?? "").trim();
      if (!name) return "error: name is required";
      const rec = useVariableStore.getState().getVariable(name);
      if (!rec) return `$${name} = (undefined)`;
      return `$${name} = ${String(rec.value).slice(0, 120)}`;
    }

    case "var_list": {
      // {"tool":"var_list"}
      const vars = useVariableStore.getState().listVariables();
      if (vars.length === 0) return "no variables set";
      return vars.map((v) => `$${v.name} = ${String(v.value).slice(0, 60)}`).join("\n");
    }
```

- [ ] **Adım 6.4 — buildSystem()'e değişken listesi ekle:**

`buildSystem()` içinde `RULES:` satırından önce (son birkaç satır):

```typescript
  // Variables
  const vars = useVariableStore.getState().listVariables();
  const varLines = vars.length > 0
    ? `VARIABLES:\n${vars.map((v) => `$${v.name}=${String(v.value).slice(0, 40)}`).join(" | ")}`
    : "VARIABLES: none";
```

Ve `return` satırından önce bu `varLines`'ı template literal'e ekle. Mevcut return'u bul ve `RULES:` satırının altına şunu ekle:

```
${varLines}
```

- [ ] **Adım 6.5 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 6.6 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/canvas/orkestraStore.ts
git commit -m "feat(canvas): Orkestra var_set/var_get/var_list tools + variable context in buildSystem"
```

---

## Task 7: AI SDK Canvas Tools — Variable Tools

**Files:**
- Modify: `ide/src/modules/ai/tools/canvas.ts`

### Tasarım

Tam ajanlar (Claude/GPT) için structured AI SDK tool'ları: `variable_set`, `variable_get`, `variable_list`. Bu araçlar `buildCanvasTools(ctx)` içine eklenir.

- [ ] **Adım 7.1 — canvas.ts'e variableStore import ekle:**

```typescript
import { useVariableStore } from "@/modules/canvas/variableStore";
```

- [ ] **Adım 7.2 — buildCanvasTools() içine 3 tool ekle** (closing `} as const;`'tan önce):

```typescript
    variable_set: tool({
      description:
        "Set a named variable in the canvas variable store. The value is available to all variable panels with matching name and to downstream agents via variable_get.",
      inputSchema: z.object({
        name:  z.string().min(1).describe("Variable name, e.g. 'myVar'"),
        value: z.unknown().describe("Value to store"),
      }),
      execute: async ({ name, value }) => {
        useVariableStore.getState().setVariable(name, value);
        const varPanel = useCanvasStore.getState().panels.find(
          (p) => p.type === "variable" && p.meta?.varName === name,
        );
        if (varPanel) {
          useCanvasStore.getState().setOutputData(varPanel.id, { kind: "text", value: String(value) });
        }
        return { ok: true, name, value: String(value).slice(0, 120) };
      },
    }),

    variable_get: tool({
      description: "Get the current value of a named canvas variable.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Variable name"),
      }),
      execute: async ({ name }) => {
        const rec = useVariableStore.getState().getVariable(name);
        if (!rec) return { found: false, name, value: null };
        return { found: true, name, value: rec.value, updatedAt: rec.updatedAt };
      },
    }),

    variable_list: tool({
      description: "List all named variables in the canvas variable store with their current values.",
      inputSchema: z.object({}),
      execute: async () => {
        const vars = useVariableStore.getState().listVariables();
        return { variables: vars.map((v) => ({ name: v.name, value: v.value, dataType: v.dataType })) };
      },
    }),
```

- [ ] **Adım 7.3 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

Beklenen: 0 hata

- [ ] **Adım 7.4 — Commit:**

```bash
cd "C:/Sentor" && git add ide/src/modules/ai/tools/canvas.ts
git commit -m "feat(canvas): add variable_set/get/list AI SDK tools for full agents"
```

---

## Task 8: AddPanel Paleti Güncellemesi

**Files:**
- Modify: `ide/src/modules/canvas/CanvasFab.tsx` veya `V3NodePalette.tsx` (hangisi add panel paletini tutuyor)

### Tasarım

Yeni node tipleri "Variables" veya "Logic" kategorisinde palette görünmeli.

- [ ] **Adım 8.1 — Mevcut palet yapısını bul:**

```bash
grep -n "variable\|if-else\|for-each\|category\|CATEGORIES\|NodeCategory" "C:/Sentor/ide/src/modules/v3-canvas/V3NodePalette.tsx" 2>/dev/null | head -30
grep -n "variable\|if-else\|for-each\|category\|AddPanel\|CATEGORIES" "C:/Sentor/ide/src/modules/canvas/CanvasFab.tsx" 2>/dev/null | head -30
```

Hangi dosyada kategori/panel listesi tutulduğunu gör.

- [ ] **Adım 8.2 — Yeni tipleri ilgili kategoriye ekle:**

Bulduğun dosyada "Logic" veya "Variables" kategorisinde şunları ekle:

```typescript
{ type: "variable",  label: "Variable",  icon: "$",  description: "Named variable — store + read values" },
{ type: "if-else",   label: "If / Else", icon: "?",  description: "Conditional routing — true/false branch" },
{ type: "for-each",  label: "For Each",  icon: "↻",  description: "Iterate over a list of items" },
```

Eğer kategori yoksa "Logic" kategorisi yarat ve bu 3 öğeyi ekle.

- [ ] **Adım 8.3 — TypeScript kontrolü:**

```bash
cd "C:/Sentor/ide" && npx tsc --noEmit 2>&1
```

- [ ] **Adım 8.4 — Commit:**

```bash
cd "C:/Sentor" && git add -p
git commit -m "feat(canvas): add variable/if-else/for-each to node palette"
```

---

## Task 9 (Opsiyonel): CLAUDE.md ve Roadmap Güncelleme

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Adım 9.1 — CLAUDE.md Phase L notunu güncelle:**

`CLAUDE.md` içindeki `### Phase L notes` (veya `### Next (Phase L)`) bölümünü şununla güncelle:

```markdown
### Phase L notes (v0.12 — Blueprint/Variable Node Sistemi)

**Variable Store (`variableStore.ts`):** Global Zustand + LazyStore persisted değişken deposu. `setVariable(name, value)` / `getVariable(name)` / `listVariables()`. Key: `sentor-variables.json`. Uygulama başında `hydrate()` çağrılır.

**Variable Panel (`type: "variable"`):** Gelen `set` wire'ı variableStore'a yazar ve output wire ile broadcast eder. `meta.varName` isimli değişkeni bağlar. Hiç wire yoksa `meta.initialValue` kullanılır.

**If/Else Panel (`type: "if-else"`):** Saf dataflow. `condition` wire'ı değerlendirilir (boş/"false"/"0" → false, diğerleri → true), `true_val` veya `false_val` wire'ından biri `result` output'una gönderilir.

**For-Each Panel (`type: "for-each"`):** `items` input'unu JSON array veya newline-separated text olarak ayrıştırır. Output: `items_json` (JSON array string) + `item_count`.

**Orkestra tools:** `var_set`, `var_get`, `var_list` — küçük modeller JSON scanning ile değişkenlere erişebilir. `buildSystem()` mevcut değişken listesini system prompt'a ekler.

**AI SDK tools:** `variable_set`, `variable_get`, `variable_list` — tam ajanlar (Claude/GPT) structured tool use ile değişkenlere erişir.

### Next (Phase M)

Canvas-as-function (sub-canvas → callable blueprint), Voice Variable node, drag-to-assign variable output, değişken inspector panel, canvas run engine (for-each gerçek iterasyon).
```

- [ ] **Adım 9.2 — Commit:**

```bash
cd "C:/Sentor" && git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase L notes"
```

---

## Self-Review

### Spec Coverage Check

| Kullanıcı isteği | Task |
|-----------------|------|
| Variable sistemi (Unreal tarzı) | Task 1 (store) + Task 3 (panel) |
| If/Else node | Task 4 |
| For-Each node | Task 5 |
| Her canvas output'u değişken olarak kaydet | Task 3 (VariablePanel + wire → store) |
| Orkestra entegrasyonu | Task 6 |
| AI SDK tool'ları | Task 7 |
| Paletten ekleme | Task 8 |
| Dokümantasyon | Task 9 |

**Kapsam dışı (Phase M'e ertelendi):**
- Voice Variable node (AudioPanel pattern — karmaşık, ayrı task)
- Canvas-as-function / sub-canvas callable blueprint
- For-Each gerçek runtime iterasyon (canvas execution engine yok)
- Drag-to-assign değişken output'u

### Placeholder Scan

- ✅ Tüm kod blokları dolu
- ✅ Tüm komutlar tam path ile
- ✅ "TBD", "TODO" yok
- ⚠️ Task 8 Adım 8.2: Dosya adı belirsiz (`V3NodePalette.tsx` veya `CanvasFab.tsx`) — Adım 8.1 bunu çözüyor

### Type Consistency Check

- `VariableRecord.id` — Task 1'de tanımlandı, Task 3 ve 7'de kullanıldı ✅
- `useVariableStore` import — Task 3, 6, 7 hepsinde tutarlı ✅
- `panel.meta?.varName` — Task 3'te hem VariablePanel hem orkestraStore kullanıyor ✅
- `PanelType` union'a "variable"|"if-else"|"for-each" eklendi — Task 2 başlangıçta yapıyor ✅
- `PANEL_DEFAULTS` — Task 2'de 3 yeni key ekleniyor, Record<PanelType,...> olduğu için tüm tiplerin tanımlanması zorunlu ✅
