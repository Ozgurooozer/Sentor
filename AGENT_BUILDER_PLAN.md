# Atlas Agent Builder + Orkestra — Implementation Plan

> **Vision:** Canvas üzerinde her pencere (vault HTML, terminal, web, editor, sub-canvas) bir node'dur. Bunları blueprint mantığı ile birbirine bağla, agent oluştur, vault'a kaydet, başka canvas'ta yeniden kullan. Sentor agent üretir; Orkestra orchestrate eder; Vault hafızadır.

İlham: [Flowise 3.1.2](modules/Flowise-flowise-3.1.2/) `agentflow` node taksonomisi (Start, Agent, LLM, Tool, Condition, Iteration, Loop, HumanInput, ExecuteFlow, DirectReply, HTTP, StickyNote) + `multiagents` Supervisor/Worker deseni. Atlas'a uyarladık: hafif, vault-native, JSON blueprint.

---

## Üç katman — sorumluluklar

```
┌───────────────────────────────────────────────────────────────┐
│  AGENT KATMANI                                                │
│  • Sentor       — agent inşa eden builder agent                │
│  • Orkestra     — agentleri yöneten/route eden conductor       │
│  • Vault-Exporter — sub canvas içeriğini vault'a yazan agent   │
│  • Kullanıcı agentleri — Sentor'un ürettikleri                  │
└──────────────────────▲────────────────────────────────────────┘
                       │ tool call · canvas state
┌──────────────────────┴────────────────────────────────────────┐
│  BLUEPRINT KATMANI                                            │
│  • Blueprint = (nodes[], edges[], metadata) JSON              │
│  • vault/blueprints/{slug}/blueprint.json + index.html         │
│  • Node tipleri: Vault, Terminal, Web, Editor, Agent,         │
│    SubCanvas, LLM, Tool, Condition, HumanInput, Output        │
│  • Edge: { from: nodeId.port, to: nodeId.port, kind }         │
└──────────────────────▲────────────────────────────────────────┘
                       │ load · save · execute
┌──────────────────────┴────────────────────────────────────────┐
│  CANVAS KATMANI                                               │
│  • InfiniteCanvas + CanvasPanel (Phase 1-2'den)                │
│  • Sağ tık menüsü, port sürükleme, sub-canvas                  │
│  • "Projeye Çevir" sub-canvas toolbar butonu                   │
└───────────────────────────────────────────────────────────────┘
```

---

## Node taksonomisi (Atlas adapte)

Flowise `agentflow`'dan süzülmüş, Atlas'a minimal:

| Node | Giriş | Çıkış | Görev |
|---|---|---|---|
| `Start` | — | trigger | Akışın giriş noktası. Kullanıcı promptu burada gelir. |
| `Vault` | path | content | Vault HTML/MD dosyasını okur. |
| `Terminal` | — | stream | Aktif terminal çıktısını dinler. |
| `Web` | url/query | text | Web sayfası veya search sonucu. |
| `Editor` | path | text | Açık editor selection veya tam içerik. |
| `Agent` | context | response, tool_calls | LLM + system prompt + tool seti. |
| `LLM` | prompt | text | Düz LLM çağrısı, tool yok. |
| `Tool` | args | result | Tek tool çağrısı (vault_search, web_fetch...) |
| `Condition` | value | true/false branch | If/else routing. |
| `HumanInput` | prompt | text | Akışı durdur, kullanıcıdan input bekle. |
| `SubCanvas` | input | output | Başka bir canvas'ı child olarak göm. |
| `Output` | text | — | Akışın çıkış noktası, ana chat'e döner. |

Her node'un standart yapısı: `{ id, type, position, data: {...}, inputs: PortDef[], outputs: PortDef[] }`. Port tipleri: `text | json | trigger | stream`.

---

## Sentor — Agent Builder

**Kimlik:** `builtin:sentor` (4. built-in agent).

**Görev:** Kullanıcının söylediklerinden + canvas state'inden çalışan bir agent tanımı üretmek.

**Tools:**
- `canvas_read_state` — açık node'ları, bağlantıları, vault dosyalarını listeler
- `agent_spawn(name, instructions, tools[], baseAgentId?)` — yeni custom agent oluşturur (agentsStore'a yazar)
- `blueprint_save(name, nodes, edges)` — canvas seçimini vault/blueprints'e yazar
- `vault_search`, `vault_read`, `vault_agent_log`

**Sub-canvas:** FocusedBar'da Sentor ikonu → kendi sub-canvas'ı açılır. Diğer agentlerin bu canvas'a yazma izni yok (okuma var).

**Sistem promptu özeti:**
```
You are Sentor, Atlas's Agent Builder. Read the current canvas (panels, edges,
vault files) via canvas_read_state. Propose an agent design in 3-5 lines:
name, role, tools needed, optional base agent. Wait for user confirmation,
then call agent_spawn. If the user wires nodes in your sub-canvas, save as
blueprint via blueprint_save when they hit "Save Blueprint".
```

---

## Orkestra — Conductor

**Kimlik:** `builtin:orkestra`.

**Görev:** Ana chat'te gelen istekleri doğru agent'a route etmek; yeni agent gerekiyorsa Sentor'u tetiklemek.

**Tools:**
- `agent_list` — mevcut agentleri yetenekleriyle listeler
- `agent_invoke(id, prompt, context)` — bir agent'ı child process olarak çalıştırır
- `sentor_trigger(reason)` — Sentor sub-canvas'ı açar ve seed context geçirir
- `canvas_read_state`

**Karar akışı:**
```
user msg → orkestra.classify(intent)
  ├─ matches existing agent  → agent_invoke
  ├─ needs new agent         → sentor_trigger(reason)
  ├─ pure orchestration      → spawn parallel agents + merge
  └─ unsure                  → ask user
```

**Tetik:** Kullanıcı Settings → General'da `"Orkestra'yı varsayılan ana chat agentı yap"` toggle'lar. Aksi halde manuel `@orkestra` mention.

---

## Blueprint sistemi

**Disk formatı:**
```
vault/blueprints/{slug}/
  blueprint.json      // { name, version, nodes[], edges[], created, updated }
  index.html          // human-readable preview (Atlas-Maker stili)
```

**Spawn:** Herhangi bir canvas'ta sağ tık → **Blueprint İmport** → vault tarama → seç → tüm node'lar viewport merkezinde spawn olur, edge'ler bağlanır.

**Çoğaltma:** Bir blueprint başka bir blueprint içinde `SubCanvas` node'u olarak da kullanılabilir → fonksiyon-içinde-fonksiyon (Flowise'ın `ExecuteFlow` muadili).

**Kayıt tetikleyici:** Canvas toolbar **Blueprint Kaydet** butonu veya seçimli sağ tık → "Save Selection as Blueprint".

---

## "Projeye Çevir" akışı

Sub-canvas toolbar'da buton. Tıklanınca:

1. Vault-Exporter agent devreye girer (`builtin:vault-exporter`).
2. Sub-canvas içindeki tüm node'ların state'ini toplar.
3. Atlas-Maker HTML kurallarına göre tek bir `index.html` üretir (Mermaid diagram dahil).
4. Vault format validation (CSS variables, inline style, no CDN, etc.).
5. `vault/projects/{slug}/index.html` olarak yazar, indexer tetiklenir.
6. **"Vault'a Hazır"** native bildirim (Tauri notification API).

---

## Implementation fazları

| Faz | İçerik | Bağımlılık | Tasks |
|---|---|---|---|
| **A0** | Önkoşul | CANVAS_PLAN P0-P2 + WEB_LAYER P-W1/W2 | sub-canvas, infinite pan/zoom, hit-bitmap |
| **A1** | Sağ tık menüsü + Agent node | A0 | `ContextMenu.tsx`, `AgentNode.tsx`, `AgentEditorPanel.tsx`, `canvasStore.agents[]` |
| **A2** | Sentor agent + sub-canvas | A1 | `builtin:sentor` agents.ts'e, `sentorCanvasStore.ts`, FocusedBar ikon |
| **A3** | Node port'ları + edge sürükleme | A1 | `NodePort.tsx`, `connections.ts` bezier, drag handler |
| **A4** | Blueprint kayıt + import | A3 | `blueprintStore.ts`, Tauri `blueprint_save`/`blueprint_load`, vault/blueprints/ |
| **A5** | Vault-Exporter + Projeye Çevir | A4 | `builtin:vault-exporter`, sub-canvas toolbar btn, format validator, native notif |
| **A6** | Orkestra agent + routing | A2, A4 | `builtin:orkestra`, `agent_invoke` tool, settings toggle |
| **A7** | Sentor canvas-aware tool seti | A2, A3 | `canvas_read_state`, `agent_spawn`, `blueprint_save` tool implementations |
| **A8** | MCP önerisi (Sentor) | A7 | Sentor pencereye bağlandığında MCP gerekli mi analizi |
| **A9** | Memory toggle (per-agent) | A1 | Per-agent: `memory: "session" | "ephemeral"` ayarı |

**Sıkı sıra:** A1 → A2 → A3 → A4 → A5 paralel A6 → A7. A8/A9 polish.

---

## Veri modeli (TypeScript) — detaylı

### Node + Port

```ts
export type NodeType =
  | "start" | "vault" | "terminal" | "web" | "editor"
  | "agent" | "llm" | "tool" | "condition" | "human-input"
  | "sub-canvas" | "output";

export type PortDataType = "text" | "json" | "trigger" | "stream" | "any";

export type PortDef = {
  id: string;              // unique within node
  label: string;           // shown in UI
  dataType: PortDataType;
  multi?: boolean;         // can accept/emit multiple edges (default false)
  required?: boolean;      // for inputs: must be connected before run
};

export type CanvasNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  size: { w: number; h: number };
  data: NodeData;          // discriminated by type — see below
  inputs: PortDef[];
  outputs: PortDef[];
  parentCanvasId: string | null;   // null = root canvas
};

// Discriminated payload per node type:
export type NodeData =
  | { type: "vault"; path: string }
  | { type: "terminal"; sessionId: string; mode: "read" | "exec" }
  | { type: "web"; url?: string; query?: string }
  | { type: "editor"; path: string; selectionOnly: boolean }
  | { type: "agent"; agentId: string }
  | { type: "llm"; model: ModelId; systemPrompt?: string }
  | { type: "tool"; toolName: string; argsTemplate: string }
  | { type: "condition"; expression: string }  // JS-like: "input.score >= 6"
  | { type: "human-input"; prompt: string }
  | { type: "sub-canvas"; blueprintSlug: string }
  | { type: "output"; sink: "chat" | "vault" | "terminal" }
  | { type: "start"; trigger: "manual" | "on-message" };
```

### Edge

```ts
export type Edge = {
  id: string;
  from: { nodeId: string; portId: string };
  to:   { nodeId: string; portId: string };
  kind: PortDataType;       // must match both port dataTypes (any → ok)
};
```

**Port uyum matrisi** (from → to):

```
          text   json   trigger  stream  any
text       ✓     ✗      ✗        ✗       ✓
json       ✗     ✓      ✗        ✗       ✓
trigger    ✗     ✗      ✓        ✗       ✓
stream     ✓     ✗      ✗        ✓       ✓
any        ✓     ✓      ✓        ✓       ✓
```

Drag sırasında UI uyumsuz hedefte kırmızı highlight + bağlantı reddi.

### Agent (extended)

```ts
export type AgentMemory = "session" | "ephemeral";

export type Agent = {
  id: string;
  name: string;
  instructions: string;
  icon: AgentIconId;
  builtIn: boolean;
  toolset?: string[];          // tool whitelist; undefined = all tools allowed
  memory?: AgentMemory;        // default: session
  baseAgentId?: string;        // inheritance: spreads parent instructions
  parentCanvasId?: string;     // null = global; non-null = owned by canvas/sub-canvas
  createdBy?: "user" | "sentor" | "orkestra";
  createdAt?: string;
};
```

### Blueprint (disk format v1)

```ts
export type BlueprintFile = {
  $schema: "atlas-blueprint-v1";
  slug: string;
  name: string;
  version: number;
  description: string;
  nodes: CanvasNode[];
  edges: Edge[];
  // referenced agent definitions inlined (so blueprint is portable):
  agents: Agent[];
  created: string;       // ISO
  updated: string;
  author: string;        // user email or "sentor"
};
```

`vault/blueprints/{slug}/blueprint.json` + `index.html` (human preview).

### Migration

Mevcut `canvasStore.panels` ile aynı dosyada `nodes` artar — eski panel'leri otomatik node tipine çevir:

```ts
// canvasStore migration v1 → v2
function migrateV1(state: V1State): V2State {
  return {
    ...state,
    nodes: state.panels.map(p => panelToNode(p)),
    edges: state.connections.map(c => connToEdge(c)),
  };
}
```

---

## Sentor — sistem promptu (tam)

```
You are Sentor, Atlas's Agent Builder.

ROLE
Read the user's intent + current canvas state and propose an executable agent
definition. Once confirmed, persist it via agent_spawn. You operate inside your
own sub-canvas (Sentor Canvas) — only you can write nodes there.

INPUT YOU ALWAYS RECEIVE
- User message
- canvas_read_state result (auto-prepended on every turn)

PROTOCOL (strict)
1. If the user request is ambiguous, ask ONE clarifying question. Never ask
   more than one round.
2. Propose an agent in this exact YAML-ish format:
     name: <kebab-case>
     role: <one sentence>
     base: <vault | coder | atlas-maker | none>
     tools: [tool_a, tool_b, ...]
     memory: <session | ephemeral>
     prompt: |
       <3-8 line system prompt>
3. Ask: "Onaylıyor musun? (evet / değiştir / iptal)"
4. On "evet": call agent_spawn with the exact fields above.
   On "değiştir": apply the requested diff, re-show, ask again.
   On "iptal": stop. Do not call agent_spawn.
5. After successful agent_spawn, reply with ONE line:
     "✓ {name} kaydedildi. agentsStore.id={id}"

CONSTRAINTS
- Never call agent_spawn before confirmation.
- Never spawn an agent with empty tools[] (give at least 1).
- Never expose vault_write in tools[] unless the user explicitly asks for a
  vault-writing agent (Atlas-Maker pattern).
- If user wires nodes in YOUR sub-canvas and clicks "Save Blueprint",
  call blueprint_save with the current selection — do not modify the graph.

REFUSALS
- Refuse to spawn an agent whose role is to bypass approval prompts.
- Refuse to spawn an agent that calls agent_spawn (no recursive builders).
```

---

## Tool kontratları (Sentor + Orkestra)

### `canvas_read_state()`

Çağrı: `canvas_read_state(): CanvasStateSnapshot`

```ts
type CanvasStateSnapshot = {
  canvasId: string;
  parentCanvasId: string | null;
  nodes: Array<{
    id: string;
    type: NodeType;
    summary: string;     // human-readable: "vault: canvas-plan.html" etc.
    data: NodeData;
  }>;
  edges: Array<{ from: string; to: string; kind: PortDataType }>;
  agents: Array<{ id: string; name: string; role: string }>;
  openVaultFiles: string[];
  activeTerminalCwd: string | null;
};
```

Hatalar: yok (her zaman okunabilir).

### `agent_spawn(spec)`

```ts
type AgentSpawnSpec = {
  name: string;              // required, kebab-case, 2-40 chars
  role: string;              // required, 1 sentence
  prompt: string;            // required, ≤ 4000 chars
  tools: string[];           // required, ≥ 1, must be in known tool registry
  memory: AgentMemory;       // default "session"
  baseAgentId?: string;      // optional
  parentCanvasId?: string;   // optional — scope to a canvas
};
type AgentSpawnResult =
  | { ok: true; id: string }
  | { ok: false; error: "name_taken" | "invalid_tool" | "rate_limit" | "permission_denied"; detail: string };
```

Rate limit: aynı session'da max 10 agent_spawn (kötüye kullanım önleme).
Name çakışması: zorunlu rename önerisi.

### `blueprint_save(spec)`

```ts
type BlueprintSaveSpec = {
  slug: string;              // required, kebab-case
  name: string;
  description: string;
  selection: { nodeIds: string[]; edgeIds: string[] };  // empty = whole canvas
};
type BlueprintSaveResult =
  | { ok: true; path: string; nodeCount: number; edgeCount: number }
  | { ok: false; error: "slug_taken" | "empty_selection" | "invalid_graph"; detail: string };
```

`invalid_graph`: dangling edge'ler, cyclic agent dependency, vb.

### `agent_invoke(id, prompt, context?)` — Orkestra only

```ts
type AgentInvokeArgs = {
  id: string;
  prompt: string;
  context?: { canvasStateRef?: boolean; vaultPaths?: string[] };
};
type AgentInvokeResult =
  | { ok: true; output: string; toolCallsUsed: number }
  | { ok: false; error: "agent_not_found" | "timeout" | "user_denied" | "tool_failure"; detail: string };
```

Per-agent: ilk invoke kullanıcı onayı ister, "always allow" checkbox.

### `sentor_trigger(reason, seedContext?)` — Orkestra only

```ts
type SentorTriggerArgs = {
  reason: string;                              // shown to user
  seedContext?: { vaultPaths?: string[]; userIntent?: string };
};
type SentorTriggerResult =
  | { ok: true; sentorCanvasId: string }
  | { ok: false; error: "sentor_busy" | "user_denied" };
```

Sentor canvas zaten açıksa `sentor_busy` döner — Orkestra mevcut canvas'a mesaj iletir.

---

## Güvenlik & izolasyon (detaylı)

### Canvas izolasyonu

| Aktör | Sentor Canvas | User Canvas | Sub-Canvas (kullanıcı) |
|---|---|---|---|
| **Sentor** | RW | R (sadece state) | R |
| **Orkestra** | R | R | R |
| **User-spawned agent** | — | R (kendi parent'ı) | RW (kendi sub-canvas'ı) |
| **Vault-Exporter** | — | R | R (export hedefi) |

Yazma = node/edge ekleme/silme. Okuma = `canvas_read_state` veya snapshot.

### Tool whitelist

Her agent'ın `toolset` alanı varsa Tauri tool bridge bu listeyi enforce eder. Listede olmayan tool çağrısı → `permission_denied` döner. UI'da agent invoke öncesi tool listesi gösterilir.

### Blueprint import güvenliği

1. Sadece `vault/blueprints/` altından import (path traversal kontrolü, `..` reddi).
2. JSON schema validation (`$schema: "atlas-blueprint-v1"` zorunlu).
3. İçindeki agent tanımları otomatik spawn EDİLMEZ — ayrı bir onay diyaloğu:
   - "Bu blueprint 3 yeni agent içeriyor: research-agent, summarizer-agent. Onayla?"
4. Tool whitelist dış kaynaklı blueprint için "least privilege" — yalnız read-only tool'lar otomatik onaylı, mutating tool'lar manuel onay.

### Recursive builder koruması

- Sentor `agent_spawn` ile yeni agent oluştururken yeni agent'ın `tools` listesinde **`agent_spawn`** olamaz.
- Orkestra'nın `sentor_trigger` çağrısı user-spawned agent için yasak — sadece built-in Orkestra için izinli.

### Onay flow'u

Aynı zincir: mevcut Atlas tool approval sistemi (read-only auto-execute, mutating prompt). Eklendi:

- `agent_invoke` → ilk seferde "Always allow X?" checkbox (per-agent).
- `agent_spawn` → her zaman onay diyalogu (Sentor önerisini gösterir, kullanıcı tek tıkla onaylar).
- `blueprint_save` → otomatik onay (kullanıcı zaten "Save" tuşuna bastı).

### Vault path sandbox

`canvas_read_state` snapshot'ı `openVaultFiles` listelerken `vault/agents/{slug}/` (agent ofis dosyaları) hariç tutulur — gizlilik. Sadece `vault_self_context` ile erişilebilir, o da yalnız kendi office'ine.

---

## Sağ tık menüsü (A1 minimum)

Şimdilik **TEK** özellik: `Agent Ekle`. Sonra (A3+) genişler.

```
┌─ CANVAS ─────────────────┐
│  ⊕  Agent Ekle           │  ← A1
├──────────────────────────┤
│  V  Vault Paneli Aç      │  ← A0 (zaten var)
│  $  Terminal Aç          │  ← A0
│  ◻  Sub Canvas           │  ← A2
├──────────────────────────┤
│  ◈  Blueprint İmport     │  ← A4
│  →  Selection → Blueprint │  ← A4
└──────────────────────────┘
```

Node'a sağ tık → o node'a özel seçenekler (Vault: "agent'a bağla", Terminal: "çıktıyı yönlendir", Agent: "düzenle / sil / blueprint").

---

## Güvenlik & sınırlar

- Sentor sadece kendi sub-canvas'ında `agent_spawn` çağırabilir; başka canvas'lara node enjekte edemez.
- Orkestra `agent_invoke` çağırmadan önce kullanıcıdan ilk seferde onay alır (`"Always allow"` checkbox).
- Blueprint import: vault dışından gelen blueprint JSON'u açılmaz (path validation).
- Vault-Exporter `vault_write` çağrısı normal approval flow'undan geçer (mevcut sistem).

---

## Ek senaryolar + ekran akışı

### S6. Sentor ambiguous request (clarify path)

```
USER : "şu işi yapan bir agent yap"
SENT : "Hangi 'şu iş'? Canvas'ta açık olan canvas-plan.html'yi mi kastediyorsun yoksa
        terminal'deki cargo hatasını mı? (1) plan analiz / (2) hata özetleme"
USER : "2"
SENT : <agent spec yaml>
       Onaylıyor musun? (evet / değiştir / iptal)
USER : "evet"
SENT : ✓ cargo-error-summarizer kaydedildi. agentsStore.id=a-xy12-abc3
```

### S7. Blueprint import'tan agent çakışması

User import ediyor: `research-router.blueprint.json` içeriyor `web-fetcher` agent.
`agentsStore`'da zaten bir `web-fetcher` var (kullanıcının önceden ürettiği).

UI diyaloğu:
```
[!] Çakışma: "web-fetcher" zaten mevcut.
    [Mevcut'u kullan]   [Yeniden adlandır → web-fetcher-2]   [İptal]
```

Varsayılan: "Yeniden adlandır". Edge'ler yeni id'ye otomatik remap.

### S8. Recursive Sentor önleme

User: "Sentor agent'a bir tane Sentor daha içermesi için izin ver."
Sentor: `agent_spawn` çağrısı içinde `tools: ["agent_spawn"]` → API `permission_denied` döner.
Sentor → kullanıcıya: "Recursive builder yasak. Bunun yerine Orkestra üzerinden Sentor'u tetikleyebilirsin."

### S9. Sentor canvas'a kullanıcı yazmaya kalkarsa

User Sentor canvas'ta sağ tık → Agent Ekle: izinli (UI'dan manuel ekleme her zaman OK).
Başka bir user-spawned agent Sentor canvas'a `canvas_add_node` çağırırsa → `permission_denied` (sadece Sentor + UI yazabilir).

### S10. Orkestra parallel agent + merge (Supervisor desen)

User: "Bu üç vault sayfasını okuyup özet çıkar, ama her birini farklı agent yapsın."
Orkestra → `agent_invoke` × 3 (paralel) → her birinin output'unu topla → bir LLM node ile merge → tek özet.

UI'da: Orkestra alt akışı küçük bir progress bar ile gösterir, "3 agent çalışıyor (1/3 tamam)".

### S11. Memory toggle senaryo

User: "Bu agent her seferinde fresh başlasın, geçmişi tutmasın."
Editor panel'de `memory: ephemeral` seçilir. Agent invoke edildiğinde history hiç yüklenmez, sadece o anki prompt + canvas context. `vault/agents/{slug}/sessions/` dizini hiç oluşmaz.

### S12. Projeye Çevir başarısız format

Sub canvas'ta agent inline `<script src="https://cdn..."` yazdı (CDN forbidden).
Vault-Exporter format validator yakalar: "CDN link kullanılamaz, /vendor/mermaid.min.js mevcut. Otomatik düzeltsem mi?" → user evet → düzeltir → tekrar denetler → onay.

---

## Görsel prototip

[prototypes/agent-builder/index.html](prototypes/agent-builder/index.html) — Atlas dark theme, interactive context menu, agent editor panel, blueprint shelf, "Projeye Çevir" akış diyagramı.

---

## Bağlantılı planlar

- [CANVAS_PLAN.md](vault/archive/plans/CANVAS_PLAN.md) — infinite canvas çekirdek (önkoşul).
- [PHASE_G_PLAN.md](vault/archive/plans/PHASE_G_PLAN.md) — graph view, backlinks.
- [VAULT_FINAL_PLAN.md](vault/archive/plans/VAULT_FINAL_PLAN.md) — vault MVP tamamlandı.

---

## MVP definition

Agent Builder MVP = A1 + A2 + A3 + A4 tamam. Yani:
- Sağ tıkla agent ekleyebilirim ✓
- Sentor sub-canvas açabilirim ✓
- Node'ları port sürükleyerek bağlayabilirim ✓
- Blueprint kaydedip başka canvas'a import edebilirim ✓

Orkestra (A6) + Projeye Çevir (A5) MVP-sonrası, ama yakın takip.
