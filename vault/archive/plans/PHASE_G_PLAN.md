# Sentor — Phase G: Nested Canvas + Chat Redesign

## Mevcut Durum Raporu

### Canvas (canvasStore + InfiniteCanvas)

| Bileşen | Mevcut Hali |
|---------|-------------|
| Depo yapısı | Düz liste: `panels: CanvasPanelNode[]` |
| Viewport | Tek global: `viewport: { x, y, scale }` |
| Panel tipleri | `terminal, editor, preview, vault-home, web` (5 adet) |
| PanelMenu (+) | `FocusedChatCenter` header row'unda (sağ üst), canvas içinde değil |
| Bağlantılar | `ConnectionLayer.tsx` ile Bezier SVG (Phase G başında eklendi) |
| Pinned paneller | `panel.pinned = true` → `position:fixed`, `PinnedPanelsPortal` ile body'e portal |
| Sub canvas | **YOK** — düz hiyerarşi, iç içe canvas mevcut değil |

### Chat UI (AiMiniWindow)

| Özellik | Mevcut Hali |
|---------|-------------|
| Konum | `fixed right-4 bottom-[96px]` — klasik modda CSS, focused modda drag ile |
| Render yöntemi | `createPortal(…, document.body)` |
| Tasarım | Yoğun backdrop-blur, glassmorphism, `bg-card/90 shadow-2xl` |
| Canvas paneli olarak | **YOK** — canvas'a eklenemez |
| Backend | `chatStore`, `agent.ts`, `transport.ts` — sağlam, değişmeyecek |

### ZoneType Enum

Rust (`zone_type.rs`) + TypeScript (`types.ts`) uyumlu 5 değer:
```
Passthrough = 0, Interactive = 1, Canvas = 2, Bar = 3, Panel = 4
```

Sub canvas ve pinned panel'ler için ayrım **yok**.

### Sorun Özeti

1. Canvas düz liste — iç içe viewport yok, sub canvas imkânsız.
2. `+` butonu canvas içinde değil; focused modda FocusedChatCenter'a gömülü, classic modda hiç yok.
3. Chat sadece floating window — canvas'a eklenemiyor, glassmorphism tasarımı canvas temasıyla uyumsuz.
4. ZoneType `PinnedPanel` ve `SubCanvas` arasında ayrım yapamıyor.

---

## Mimari Kararlar

### 1. Sub Canvas = Canvas Tipi Panel

Sub canvas, `type: "canvas"` olan bir `CanvasPanelNode`'dur. İçinde kendi `viewport`'u ve `children: CanvasPanelNode[]` dizisi vardır. Ana canvas'ta sürüklenebilir bir floating penceredir. Taşındığında içindeki çocukları da taşır (lokal koordinat sistemi).

```
MainCanvas.viewport { x, y, scale }
  ├── CanvasPanelNode { type: "canvas", viewport: {...}, children: [...] }
  │     └── CanvasPanelNode { type: "editor", ... }    ← sub canvas koordinatında
  ├── CanvasPanelNode { type: "terminal", ... }         ← ana canvas koordinatında
  └── CanvasPanelNode { type: "web", pinned: true, ... } ← pinned
```

**Neden doğru yaklaşım:** Sub canvas taşınınca içindekiler otomatik taşınır — çünkü içindekiler sub canvas'ın lokal koordinat sisteminde saklanır, global koordinatlarda değil.

### 2. PanelMenu → Canvas Sol Alt Köşe

Floating overlay buton — `InfiniteCanvas` container'ının içinde, `position: absolute bottom-4 left-4`. Her iki modda (classic + focused) görünür. FocusedChatCenter'dan kaldırılır. Panel listesine "Chat" ve "Sub Canvas" tipleri eklenir.

### 3. Chat Panel Tipi

`type: "chat"` yeni panel tipi. Canvas'a eklenebilir. İçinde:
- `AiChatView` (mevcut) — mesaj akışı
- `AiInputBar` (mevcut) — input
- `AgentSwitcher` (mevcut) — ajan seçimi
- Minimize butonu: sadece title bar görünür (collapsed state)

Backend tamamen aynı kalır — `chatStore`, `agent.ts`, `transport.ts` dokunulmaz.

### 4. AiMiniWindow Tasarım Yenileme

`AiMiniWindow` hâlâ kullanılır (classic + focused mod floating chat). Tasarım canvas panel temasına uygun hale getirilir:
- `bg-[#0a0a0a]/95` (glassmorphism kaldırılır)
- `border-[#2a2a2a]` (tek border, shadow yok)
- Title bar canvas panel ile aynı stilde
- Blur yalnızca düşük opacity backdrop (`backdrop-blur-sm`)

---

## Uygulama Planı

### G1 — Ağaç Tabanlı Canvas Store

**Etkilenen dosyalar:**
- `ide/src/modules/canvas/types.ts`
- `ide/src/modules/canvas/canvasStore.ts`

**Değişiklikler:**

```ts
// types.ts — güncellenen CanvasPanelNode
export type PanelType = "terminal" | "editor" | "preview" | "vault-home" | "web" | "chat" | "canvas";

export interface CanvasPanelNode {
  id: string;
  type: PanelType;
  x: number; y: number;
  width: number; height: number;
  zIndex: number;
  title: string;
  meta: Record<string, unknown>;
  pinned?: boolean;
  screenX?: number; screenY?: number;
  // Sub-canvas only:
  viewport?: Viewport;         // kendi pan/zoom durumu
  children?: CanvasPanelNode[]; // lokal koordinatlarda çocuklar
}
```

**Store yeni action'ları:**

```ts
// Sub canvas oluştur (ana canvas'ta bir panel olarak)
addSubCanvas(at?: { x: number; y: number }): string;

// Sub canvas'ın kendi viewport'unu güncelle
setSubViewport(subId: string, patch: Partial<Viewport>): void;

// Sub canvas'a çocuk panel ekle
addChildPanel(parentId: string, type: PanelType): string;

// Çocuk panel güncelle
updateChildPanel(parentId: string, childId: string, patch: Partial<CanvasPanelNode>): void;

// Çocuk panel sil
removeChildPanel(parentId: string, childId: string): void;

// Çocuk paneli öne getir
bringChildToFront(parentId: string, childId: string): void;
```

**Mevcut action'lar değişmez** — `addPanel`, `removePanel`, `updatePanel` ana canvas içindir, geriye uyumlu kalır.

---

### G2 — PanelMenu → InfiniteCanvas Sol Alt Köşe

**Etkilenen dosyalar:**
- `ide/src/modules/canvas/PanelMenu.tsx` — yeni layout
- `ide/src/modules/canvas/InfiniteCanvas.tsx` — PanelMenu mount
- `ide/src/app/FocusedChatCenter.tsx` — PanelMenu kaldırılır

**PanelMenu yeni tasarımı:**

```
[+]  ← 36×36 yuvarlak buton, sol alt köşe
 │
 ▼  (liste açılır, yukarı doğru)
┌─────────────────────┐
│ >_  Terminal        │
│ {}  Editor          │
│ ◻   Preview        │
│ ⌂   Vault Home     │
│ ⊕   Web            │
│ ─── ────────────── │
│ 💬  Chat            │
│ ⊞   Sub Canvas     │
└─────────────────────┘
```

`InfiniteCanvas.tsx` içine ekleme:
```tsx
{/* Floating + button — canvas sol alt */}
<div className="pointer-events-none absolute inset-0 z-20">
  <div className="pointer-events-auto absolute bottom-4 left-4">
    <PanelMenu />
  </div>
</div>
```

`FocusedChatCenter.tsx`'ten `<PanelMenu />` kaldırılır.

---

### G3 — Chat Panel Bileşeni

**Yeni dosya:** `ide/src/modules/ai/components/ChatPanel.tsx`

**Davranış:**
- Canvas içinde bir `CanvasPanelNode` olarak render edilir (`CanvasPanel.tsx` wrapper'ı kullanır)
- `collapsed` state: sadece title bar görünür (32px)
- `expanded` state: tam chat arayüzü

**İçerik:**
```tsx
function ChatPanel({ sessionId }: { sessionId?: string }) {
  // chatStore'dan mevcut session ya da yeni session başlat
  // Aynı getOrCreateChat(sessionId) pattern'i
  
  return (
    <div className="flex h-full flex-col">
      {/* AgentSwitcher + session seçimi */}
      <div className="border-b border-[#2a2a2a] px-2 py-1">
        <AgentSwitcher />
      </div>
      {/* Mesaj akışı */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AiChatView ... />
      </div>
      {/* Input */}
      <div className="border-t border-[#2a2a2a]">
        <AiInputBar />
      </div>
    </div>
  );
}
```

**`CanvasPanel.tsx` değişikliği:** `children` prop boşsa panel tipine göre varsayılan içerik render edilir:
```tsx
// Mevcut:
{children ?? <div className="...">placeholder</div>}

// Güncellenen:
{children ?? <DefaultPanelContent panel={panel} />}
```

```tsx
function DefaultPanelContent({ panel }: { panel: CanvasPanelNode }) {
  if (panel.type === "chat") return <ChatPanel />;
  if (panel.type === "canvas") return <SubCanvasContent panel={panel} />;
  return <div className="...text-[#444]">{panel.type}</div>;
}
```

---

### G4 — Sub Canvas Renderer

**Etkilenen dosya:** `ide/src/modules/canvas/CanvasPanel.tsx` (veya yeni `SubCanvasContent.tsx`)

Sub canvas tipi panel, kendi içinde miniature bir InfiniteCanvas render eder:
```tsx
function SubCanvasContent({ panel }: { panel: CanvasPanelNode }) {
  const vp = panel.viewport ?? { x: 0, y: 0, scale: 1 };
  const children = panel.children ?? [];
  const setSubViewport = useCanvasStore(s => s.setSubViewport);
  
  // Wheel → kendi viewport'u güncelle, parent'a yayma
  // Drag → kendi viewport
  // Paneller → kendi CanvasPanel instance'ları
  
  return (
    <div className="relative h-full w-full overflow-hidden" style={DOT_GRID_STYLE}>
      <div style={{ transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.scale})`, transformOrigin: "0 0" }}>
        {children.map(child => (
          <CanvasPanel key={child.id} panel={child} viewport={vp}
            onDragStart={noop} onDragEnd={noop} />
        ))}
        <ConnectionLayer panels={children} connections={[]} ... />
      </div>
    </div>
  );
}
```

`onWheel` event üzerinde `e.stopPropagation()` ile parent canvas'a yayılma engellenir.

---

### G5 — ZoneType Genişletme

**Etkilenen dosyalar:**
- `ide/src-tauri/src/modules/input/zone_type.rs`
- `ide/src/modules/input/types.ts`

```rust
// zone_type.rs — yeni değerler eklenir
#[repr(u8)]
pub enum ZoneType {
    Passthrough  = 0,
    Interactive  = 1,
    Canvas       = 2,
    Bar          = 3,
    Panel        = 4,
    SubCanvas    = 5,  // NEW: sub canvas viewport alanı
    PinnedPanel  = 6,  // NEW: pinned panel (pan/zoom dışı)
}
```

```ts
// types.ts — mirror güncellenir
export enum ZoneType {
  Passthrough = 0,
  Interactive = 1,
  Canvas      = 2,
  Bar         = 3,
  Panel       = 4,
  SubCanvas   = 5,
  PinnedPanel = 6,
}
```

`ZoneType.SubCanvas.claims_input()` → `true` (sub canvas içi tıklamalar alınır)
`ZoneType.PinnedPanel.claims_input()` → `true` (pinned panel tıklamaları alınır)

`CanvasPanel.tsx`'teki `useZoneRegistration`: pinned panel için `ZoneType.PinnedPanel` kullan.

---

### G6 — AiMiniWindow Tasarım Yenileme

**Etkilenen dosya:** `ide/src/modules/ai/components/AiMiniWindow.tsx`

**Değişecekler:**
```tsx
// Kaldırılacak:
"bg-card/90 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl dark:ring-white/5"

// Eklenecek (canvas panel temasıyla uyumlu):
"bg-[#0a0a0a]/97 border-[#2a2a2a] backdrop-blur-sm"
```

Title bar:
```tsx
// Mevcut — karmaşık session/agent dropdown
// Yeni — canvas panel title bar stili
<div className="flex h-8 shrink-0 cursor-move items-center gap-2 border-b border-[#2a2a2a] bg-[#111111] px-2">
  <span className="text-[10px] text-[#555]">💬</span>
  <AgentSwitcher /> {/* mevcut, değişmez */}
  <span className="flex-1" />
  {/* session new / close butonları */}
</div>
```

**Değişmeyecekler:** `AiChatView`, `AiInputBar`, `AgentSwitcher`, `PlanModeStrip`, `TodoStrip`, tüm backend bağlantıları, drag/resize logic.

---

## Dosya Değişiklik Tablosu

| Dosya | Değişim Tipi | Açıklama |
|-------|-------------|----------|
| `canvas/types.ts` | Güncelleme | `PanelType` genişletme; `children`, `viewport` alanları |
| `canvas/canvasStore.ts` | Güncelleme | Tree actions: `addSubCanvas`, `setSubViewport`, `addChildPanel`, ... |
| `canvas/PanelMenu.tsx` | Güncelleme | "Chat" + "Sub Canvas" ekleme; layout yok, sadece items |
| `canvas/InfiniteCanvas.tsx` | Güncelleme | `<PanelMenu>` overlay olarak mount |
| `canvas/CanvasPanel.tsx` | Güncelleme | `DefaultPanelContent` ile chat/canvas içerik routing |
| `canvas/SubCanvasContent.tsx` | **YENİ** | Sub canvas iç renderer (kendi pan/zoom, çocuk paneller) |
| `ai/components/ChatPanel.tsx` | **YENİ** | Canvas içi chat panel bileşeni |
| `ai/components/AiMiniWindow.tsx` | Güncelleme | Tasarım yenileme (yalnızca CSS/markup, logic dokunulmaz) |
| `app/FocusedChatCenter.tsx` | Güncelleme | `<PanelMenu />` kaldırılır |
| `input/zone_type.rs` | Güncelleme | `SubCanvas = 5`, `PinnedPanel = 6` eklenir |
| `input/types.ts` | Güncelleme | Mirror güncelleme |

**Dokunulmayacaklar (backend):**
- `ai/store/chatStore.ts`
- `ai/lib/agent.ts`
- `ai/lib/transport.ts`
- `ai/lib/agents.ts`
- `ai/tools/*.ts`
- `api/server.py`
- `tools/indexer.py`
- Tüm Rust modülleri (input/subclass.rs, pty, shell, fs, vb.)

---

## Uygulama Sırası

```
G5 (ZoneType) → G1 (store) → G2 (PanelMenu) → G4 (sub canvas renderer) → G3 (chat panel) → G6 (mini window redesign)
```

**Neden bu sıra:**
- G5 bağımsız, Rust + TS iki satır — hemen halledilebilir
- G1 store temeli — G3 ve G4 buna bağımlı
- G2 bağımsız, store gerektirmiyor
- G4 sub canvas'ı render etmek için G1'e bağımlı
- G3 chat paneli G1'e bağımlı (`addPanel("chat")`)
- G6 tamamen bağımsız, en sona bırakılabilir

---

## Kabul Kriterleri

- [ ] `+` butonu canvas sol alt köşede, her iki modda görünür
- [ ] Listede Terminal / Editor / Preview / Vault Home / Web / Chat / Sub Canvas var
- [ ] "Chat" → canvas'a chat paneli ekler, mesaj gönderilir
- [ ] Chat paneli collapse/expand edilebilir (canvas panel minimize)
- [ ] "Sub Canvas" → ana canvas'ta sub canvas penceresi açılır
- [ ] Sub canvas içine panel eklenebilir (`+` listesi sub canvas içinde çalışır)
- [ ] Sub canvas sürüklendiğinde içindeki paneller beraber taşınır
- [ ] Sub canvas kendi zoom/pan'ına sahip, ana canvas'ı etkilemez
- [ ] Pinned paneller `ZoneType.PinnedPanel` ile kayıtlı
- [ ] `npx tsc --noEmit` → sıfır hata
- [ ] `cargo build` → sıfır hata (zone_type.rs güncellendi)
- [ ] AiMiniWindow yeni tema ile açılıyor, tüm fonksiyonlar çalışıyor

---

## Açık Sorular / Riskler

1. **Sub canvas içinde `+` butonu:** Sub canvas `SubCanvasContent` kendi PanelMenu'suna sahip mi, yoksa ana PanelMenu "içinde mi" çalışacak? → Öneri: Sub canvas içinde de `+` butonu, `addChildPanel(subId, type)` çağırır.

2. **Sub canvas ConnectionLayer:** Sub canvas'ın kendi connection layer'ı olacak mı? → Evet, `SubCanvasContent` kendi `ConnectionLayer`'ını mount eder.

3. **Pinned panel + sub canvas:** Sub canvas içindeki bir panel pin'lenirse ne olur? → Phase G scope dışında — şimdilik sub canvas içindeki paneller pinlenemiyor.

4. **AiMiniWindow session seçimi:** Yeni tasarımda session geçmişine nasıl erişilecek? → Header'da küçük bir dropdown yeterli (mevcut `sessions` state mevcuttur).

5. **Chat panel ile AiMiniWindow çakışması:** İkisi aynı `activeSessionId`'yi mi kullanır? → Evet. `chatStore.activeSessionId` tek, her iki bileşen de aynı session'a bağlanır. Birinden yazılan mesaj diğerinde de görünür — bu bir özellik, bug değil.

---

*Oluşturuldu: 2026-05-18 | Hedef: Phase G*
