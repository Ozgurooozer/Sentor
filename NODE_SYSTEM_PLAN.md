# NODE CANVAS SYSTEM — Atlas OS Phase N
## Eksiksiz Teknik Plan

> **✅ TAMAMLANDI — 2026-05-22**
>
> N1 (wire MVP) + N1.5 (görsel canvas) + N2 (akıllı teller + yeni node'lar) + N3 (komut modu)
> hepsi koda indirildi. Bu plan tarihsel referans olarak duruyor — yapılan iş
> CLAUDE.md "Phase F notes" + `app/hooks/` + `modules/canvas/` ağacında somut.
>
> Son büyük özellik. Proje bu ile sabitlenir.
>
> Vizyon: Unreal Engine Blueprint mantığında sonsuz canvas.  
> Her node'un input/output pinleri var. Pinler arasına tel çekiyorsun.  
> Veri akar. AI chat node'u tüm upstream node'ların çıktısını toplar, context olarak kullanır.  
> Sonuç: sonsuz canvas'ta çalışan, birbirine bağlı canlı düğümlerden oluşan bir düşünce makinesi.

---

## İçindekiler

1. [Vizyon ve Paradigma](#1-vizyon-ve-paradigma)
2. [Referans Analizi](#2-referans-analizi)
3. [Mevcut Altyapı (koddan çıkarılan)](#3-mevcut-altyapı-koddan-çıkarılan)
4. [Node Sistemi Veri Modeli](#4-node-sistemi-veri-modeli)
5. [Node Tipleri ve Pin Tanımları](#5-node-tipleri-ve-pin-tanımları)
6. [Tel (Wire) Sistemi](#6-tel-wire-sistemi)
7. [Faz N1 — MVP (1–2 gün)](#7-faz-n1--mvp-12-gün)
8. [Faz N1.5 — Görsel Canvas (1–2 gün)](#8-faz-n15--görsel-canvas-12-gün)
9. [Faz N2 — Akıllı Teller (3–5 gün)](#9-faz-n2--akıllı-teller-35-gün)
10. [Faz N3 — Komut Modu (2–3 gün)](#10-faz-n3--komut-modu-23-gün)
11. [Etkilenen Dosyalar — Tam Liste](#11-etkilenen-dosyalar--tam-liste)
12. [Mimari Kurallar](#12-mimari-kurallar)
13. [Başlangıç Sırası](#13-başlangıç-sırası)
14. [Fırsatlar](#14-fırsatlar)

---

## 1. Vizyon ve Paradigma

### Blueprint Analogisi

Unreal Engine'de her node şunu yapar:
- Soldan **input pinleri** alır (beyaz exec, renkli data)
- İçinde bir işlem yapar
- Sağdan **output pinleri** verir
- Pinler arası tel çekince veri veya kontrol akışı oluşur

**Atlas OS canvas'ta tam aynı mantık:**

```
┌─────────────────┐         ┌──────────────────┐
│  Terminal Node  │         │  Chat/Agent Node  │
│                 │         │                   │
│  ┌──────────┐  ●━━━━━━━━━●  ctx: ■ Terminal  │
│  │ last 80  │  │  data   │   ■ Editor        │
│  │ lines    │  │  wire   │   ■ Web           │
│  └──────────┘  │         │                   │
│                 │         │  [Type message...]│
└─────────────────┘         └──────────────────┘
        ● = output pin              ● = input pin (çoklu kabul eder)
```

Fark: Unreal'de pinler statik tip. Bizde `WireData = {kind: "text"|"image"|"json", value}` — tel kendisi tip bilgisi taşır.

### Vizyon Cümlesi

> Her canvas paneli bir canlı veri düğümüdür.  
> Panellerden chat'e tel çekilir.  
> O panelin içeriği anında AI context'i olur.  
> Sonsuz canvas'ta istediğin kadar node ekleyip bağlarsın.

### Mevcut vs Hedef

```
MEVCUT:
  Canvas = panel yöneticisi
  [ Terminal ] [ Editor ] [ Chat ]  ← yan yana paneller, bağımsız

HEDEF:
  Canvas = thinking workspace (ifelse / Blueprint style)
  
  [Header: Proje]
       │
  ┌────┴────┐  ┌─────────┐  ┌─────────┐
  │Terminal │  │ Editor  │  │   Web   │
  │  ●──────┼──┼──────●  │  │  ●──┐  │
  └─────────┘  └─────────┘  └─────┘  │
       │                              │
       └──────────────┬───────────────┘
                      ▼
               ┌─────────────┐
               │  Atlas Chat │  ← tüm upstream context burada toplanır
               │  ctx: ■ ■ ■ │
               └─────────────┘
```

---

## 2. Referans Analizi

Paylaşılan ekran görüntüsü: dark canvas workspace ("ifelse" projesi)

### Gözlemlenen Node Tipleri

| Ekrandaki Node | Atlas Karşılığı | Notlar |
|---|---|---|
| `ifelse` kırmızı header | `header` node | Sadece başlık, renkli kenarlık |
| `Research & Development` sarı | `header` node | Renk kullanıcı seçer |
| `What is Velari?` mor | `header` node | Altında text node'lar |
| `Velari Color System` mavi | `header` node | Altında gallery node |
| `Typography & Layout` yeşil | `header` node | Altında spec node |
| Browser screenshot kartı | `browser` / `web` node | iframe + caption |
| Text açıklama kartı | `text` / `input` node | Mevcut InputPanel |
| Checkbox listesi | `checklist` node | **YENİ** |
| Renk paleti grid | `gallery` node | **YENİ** |
| Typography spec kartı | `editor` node | Zaten var |
| "ChatGPT Node Agent" | `chat` / `agent` node | Zaten var |
| `Category Summary` label | `header` node küçük varyant | |

### Görsel Dil Kuralları (referanstan çıkarılan)

1. **Background**: `#050505` — neredeyse siyah, dot-grid pattern
2. **Node kart**: `#111` arkaplan, `1.5px solid {typeColor}` kenarlık
3. **Glow**: `box-shadow: 0 0 12px {typeColor}20` — çok hafif
4. **Bağlantı noktası (port)**: `6px` dolu daire, node kenarında ortalı
5. **Tel (wire)**: `1.5px` stroke, hafif eğri (cubic bezier)
6. **Yürüme noktası (midpoint)**: Tel üzerinde × butonu (silme)
7. **Seçili node**: kenarlık daha parlak, `2px solid {typeColor}`
8. **Font**: system-ui, monospace değil (başlıklar için)

---

## 3. Mevcut Altyapı (koddan çıkarılan)

### ✅ Tamamen Hazır — Dokunmaya Gerek Yok

| Bileşen | Dosya | Satır | Detay |
|---|---|---|---|
| Port noktaları (◉) | `ConnectionLayer.tsx` | `PortDots` component | 4 kenarda, hover'da görünür |
| Drag-to-connect | `ConnectionLayer.tsx` | `PendingConn` state | Rubber-band bezier, pointer capture |
| Bezier tel render | `ConnectionLayer.tsx` | `conn.kind === "trigger"` | Mavi/yeşil stroke, dashed |
| Tel silme butonu | `ConnectionLayer.tsx` | de Casteljau t=0.5 | Bezier ortasında × |
| `Connection` tipi | `types.ts` | — | `{id, fromPanel, fromSide, toPanel, toSide, kind?}` |
| `setOutputData(id, data)` | `canvasStore.ts` | — | `panel.meta.outputData` alanına yazar |
| `InputPanel` tam çalışıyor | `InputPanel.tsx` | — | text/image/file → outputData ✅ |
| `useIncomingWireData` | `CanvasPanelContent.tsx` | :44 | İlk upstream bağlantıyı okur (sınırlı) |
| `ChatPanel` wire banner | `ChatPanel.tsx` | :81-104 | "Insert" butonu, image auto-attach |
| `canvas_read_state` AI tool | `tools/canvas.ts` | — | Tüm canvas state'ini AI'ya açar |
| Blueprint kaydetme | `tools/canvas.ts` | `blueprint_save` | vault/blueprints'e JSON+HTML |
| Canvas persist | `canvasStore.ts` | LazyStore | `atlas-canvas.json`, 200ms debounce |

### ❌ Eksik — Yapılacaklar

| Eksik | Neden Önemli | Faz |
|---|---|---|
| `CanvasTerminal` → outputData | Terminal çıktısı wire'a akmıyor | N1.1 |
| `CanvasEditor` → outputData | Dosya içeriği wire'a akmıyor | N1.1 |
| Multi-wire aggregation hook | Sadece ilk upstream okunuyor | N1.2 |
| ChatPanel auto-context prepend | "Insert" var ama otomatik değil | N1.3 |
| ChatPanel bağlı panel badge'leri | Hangi node'ların bağlı olduğu görünmüyor | N1.3 |
| `header` node tipi | Organize edici başlık node'u yok | N1.5 |
| `checklist` node tipi | Görev listesi node'u yok | N1.5 |
| Node kenarlık renk sistemi | Tip bazlı renkli kenarlık yok | N1.5 |
| `gallery` node tipi | Resim grid node'u yok | N2.1 |
| `Connection.kind` seçim UI | Tel tipini kullanıcı seçemiyor | N2.2 |
| Web panel → outputData | URL/başlık wire'a akmıyor | N2.3 |
| Vault panel → outputData | Sayfa metni wire'a akmıyor | N2.4 |
| Mor "context" tel türü | Chat'e özel otomatik wire yok | N2.5 |
| Trigger tel mekaniği | Chat → Terminal komut yok | N2.6 |
| "Apply to all" modu | Tüm bağlı node'lara emir verme | N3.1 |
| Snapshot modu | Anındaki wire data'yı dondurma | N3.2 |
| Tel char limit ayarı | Per-wire 4000 char limiti UI'ı | N3.3 |

### Kritik Kod Noktaları

**`CanvasPanelContent.tsx:44` — şu anki sınırlı hook:**
```typescript
function useIncomingWireData(panelId: string) {
  const connections = useCanvasStore((s) => s.connections);
  const panels = useCanvasStore((s) => s.panels);
  const incoming = connections.find((c) => c.toPanel === panelId); // ← sadece İLK!
  if (!incoming) return null;
  const src = panels.find((p) => p.id === incoming.fromPanel);
  const data = src?.meta?.outputData as WireData | undefined;
  return data ?? null;
}
```

**`ChatPanel.tsx:67-72` — manuel insert, otomatik değil:**
```typescript
const injectText = () => {
  if (!injectedContext?.value) return;
  setInput((prev) => String(injectedContext.value) + "\n\n" + prev);
};
// ← Kullanıcı "Insert" butonuna tıklamalı. Gönderimde otomatik eklenmiyor!
```

---

## 4. Node Sistemi Veri Modeli

### WireData (tek output değeri)

```typescript
// Zaten var, canvasStore.ts içinde
type WireData = {
  kind: "text" | "image" | "json";
  value: unknown; // text→string, image→dataUrl string, json→object
};
```

### WireBlock (chat'in gördüğü aggregated form)

```typescript
// types.ts'e eklenecek
export type WireBlock = {
  panelId: string;       // kaynak panel ID
  panelTitle: string;    // kullanıcının verdiği başlık
  panelType: PanelType;  // "terminal", "editor" vb.
  connectionKind: "data" | "context" | "trigger"; // tel tipi
  charLimit: number;     // default 4000, per-wire ayarlanabilir
  data: WireData | null; // outputData
};
```

### Panel.meta genişletmesi

```typescript
// types.ts'deki Panel.meta alanına yazılan alanlar
// (tip değişikliği yok, meta: Record<string, unknown> esnek kalır)

// Tüm panellerde:
panel.meta.outputData: WireData       // ne ürettiği

// Checklist panelinde:
panel.meta.items: ChecklistItem[]     // görev listesi
// ChecklistItem = { id: string; text: string; done: boolean }

// Header panelinde:
panel.meta.headerColor: string        // seçilen renk hex kodu

// Connection'da (bağlantı başına):
connection.charLimit?: number         // bu wire için max char (default 4000)
```

### Güncellenmiş PanelType

```typescript
// types.ts — mevcut satıra eklenecek
export type PanelType =
  | "terminal"   // PTY terminal, son N satırı wire'a yazar
  | "editor"     // CodeMirror editör, dosya içeriğini wire'a yazar
  | "preview"    // dosya önizleme
  | "vault-home" // vault ana sayfası
  | "web"        // native WebView, URL+başlık wire'a yazar
  | "chat"       // AI chat, input alan node
  | "canvas"     // alt-canvas (iç içe)
  | "agent"      // özel agent node
  | "instance"   // canvas instance
  | "codegraph"  // kod grafı
  | "input"      // kullanıcı girdisi (text/image/file) ✅ zaten var
  | "pipeline"   // pipeline node
  | "header"     // ← YENİ: organize edici başlık
  | "checklist"  // ← YENİ: checkbox görev listesi
  | "gallery";   // ← YENİ: resim/medya grid (N2)
```

---

## 5. Node Tipleri ve Pin Tanımları

> Blueprint analogisi: her node'un kaç input, kaç output pini olduğu ve tipi

### Terminal Node

```
┌─────────────────────────────┐
│  ◉  Terminal               ●  ─── data wire (text)
│  ─────────────────────────  │
│  $ npm run build            │
│  > compiled 42 modules      │
│  > done in 3.2s             │
│  [⚫ bash]                  │
└─────────────────────────────┘

Input pinleri:  trigger wire (komut tetikleme, N2)
Output pinleri: data wire → {kind:"text", value: last80lines}
Update sıklığı: 3 saniyede bir (setInterval), debounce yok
Char limiti:    4000 (son 80 satır ~4000 char içinde kalır)
```

**Implementasyon:**
```typescript
// CanvasPanelContent.tsx → CanvasTerminal bileşeni içinde
const paneRef = useRef<TerminalPaneHandle | null>(null);

useEffect(() => {
  const timer = setInterval(() => {
    const buf = paneRef.current?.getLastLines(80) ?? "";
    if (buf.trim()) {
      setOutputData(panel.id, { kind: "text", value: buf.slice(0, 4000) });
    }
  }, 3000);
  return () => clearInterval(timer);
}, [panel.id]);
```

**TerminalPane'e eklenecek handle:**
```typescript
// TerminalPane.tsx — useImperativeHandle içine
getLastLines: (n: number): string => {
  const buf = termRef.current?.buffer.active;
  if (!buf) return "";
  const lines: string[] = [];
  const start = Math.max(0, buf.length - n);
  for (let i = start; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join("\n").trimEnd();
},
```

---

### Editor Node

```
┌─────────────────────────────┐
│  ◉  Editor: server.py      ●  ─── data wire (text)
│  ─────────────────────────  │
│  1  from http.server...     │
│  2  import json, os         │
│  3                           │
│  [python] [utf-8] [ln 1]    │
└─────────────────────────────┘

Input pinleri:  yok (edit komutları AI tool üzerinden)
Output pinleri: data wire → {kind:"text", value: fileContent}
Update trigger: dosya yüklenince + onChange 1.5s debounce
Char limiti:    4000 (dosyanın ilk 4000 karakteri)
```

**Implementasyon:**
```typescript
// CanvasPanelContent.tsx → CanvasEditor bileşeni içinde
const path = panel.meta?.path as string | undefined;

// Dosya yüklenince
useEffect(() => {
  if (!path) return;
  invoke<string>("fs_read_file", { path })
    .then((content) =>
      setOutputData(panel.id, { kind: "text", value: content.slice(0, 4000) })
    )
    .catch(() => undefined);
}, [path, panel.id]);

// Edit sırasında debounce
const debouncedOutputWrite = useMemo(
  () =>
    debounce((val: string) => {
      setOutputData(panel.id, { kind: "text", value: val.slice(0, 4000) });
    }, 1500),
  [panel.id]
);

// EditorPane'in onChange prop'una bağla:
// <EditorPane ... onChange={debouncedOutputWrite} />
```

---

### Input Node (zaten hazır ✅)

```
┌─────────────────────────────┐
│  ◉  Input                  ●  ─── data wire (text | image)
│  ─────────────────────────  │
│  [ Text ] [ Image ] [ File ]│
│  ┌─────────────────────┐   │
│  │ Bu metni yaz...     │   │
│  └─────────────────────┘   │
└─────────────────────────────┘

Output:  text → {kind:"text", value}
         image → {kind:"image", value: dataUrl}
         file  → {kind:"text", value: fileContent}
```

Tamamen çalışıyor. Referans implementasyon olarak kullanılır.

---

### Chat / Agent Node

```
   ●  ─── data wire (text)    ┐
   ●  ─── data wire (image)   ├──► ┌────────────────────────────┐
   ●  ─── context wire        ┘    │  ◎  Atlas Chat             │
                                    │  ───────────────────────── │
                                    │  ctx: ■ Terminal  ■ Editor  │  ← badge satırı
                                    │  ───────────────────────── │
                                    │  AI: "server.py'deki       │
                                    │   hata satır 42'de..."     │
                                    │  ───────────────────────── │
                                    │  [Type message...      ▶]  │
                                    └────────────────────────────┘

Input pinleri:  N adet data/context wire (sınırsız)
Output pinleri: yok (AI yanıtı chat'te kalır, trigger wire N2'de)
Context format: <connected-context>
                [■ Terminal] son 80 satır...
                ---
                [◈ Editor] dosya içeriği...
                </connected-context>
```

---

### Header Node (YENİ — N1.5)

```
┌──────────────────────────────────────┐  ← 1.5px solid #d4a843 (sarı)
│  Research & Development              │     box-shadow: 0 0 12px #d4a84320
│                           [◉ renk]  │
└──────────────────────────────────────┘

Boyut:       varsayılan 240×52px, sadece genişliği resize edilebilir
İçerik:      sadece panel.title (büyük, ortalı)
Renk seçimi: 6 preset dot — sarı, mor, mavi, yeşil, kırmızı, nötr
Input/Output: hiçbiri (organizasyon node'u, wire bağlanamaz)
Persist:     panel.meta.headerColor = "#d4a843"
```

---

### Checklist Node (YENİ — N1.5)

```
┌─────────────────────────────┐
│  ◉  Görev Listesi          ●  ─── data wire (tamamlanmamış görevler)
│  ─────────────────────────  │
│  ✓ API endpoint'i yaz       │  (strikethrough + opacity 0.4)
│  ✓ Test yaz                 │
│  ☐ Deploy et                │
│  ☐ Dokümantasyon            │
│  ─────────────────────────  │
│  + Add item                 │
└─────────────────────────────┘

Data model:  panel.meta.items = [{id, text, done}]
Output wire: tamamlanmamış item'lar → {kind:"text", value: "- Deploy et\n- Dokümantasyon"}
Update:      item eklenince/işaretlenince anında setOutputData
```

---

### Web Node (N2 — outputData için)

```
┌─────────────────────────────┐
│  ◉  Web Browser            ●  ─── data wire (URL + başlık)
│  ─────────────────────────  │
│  [← →] https://github.com  │
│  ┌─────────────────────┐   │
│  │  [native WebView]   │   │
│  └─────────────────────┘   │
└─────────────────────────────┘

Output: {kind:"text", value: "GitHub: Where the world builds software | https://github.com"}
Update: web://nav-changed Tauri event'i ile
```

---

### Gallery Node (YENİ — N2)

```
┌─────────────────────────────┐
│  ◉  Galeri                 ●  ─── data wire (seçili resim)
│  ─────────────────────────  │
│  🖼 🖼 🖼 🖼                │
│  🖼 🖼 🖼 🖼                │
│  ─────────────────────────  │
│  [+ Klasör ekle]            │
└─────────────────────────────┘

İçerik:  folder path → fs_list_dir → resim dosyaları → asset:// thumbnail
Seçim:   tıklanan resim → {kind:"image", value: dataUrl}
Kullanım: renk paleti, moodboard, referans görsel → chat'e bağla
```

---

## 6. Tel (Wire) Sistemi

### Wire Türleri

| Tür | Renk | Kullanım | Davranış |
|---|---|---|---|
| `data` | `#5b8def` (mavi) | Panel → Chat | outputData'yı context'e prepend eder |
| `context` | `#9b72ef` (mor) | Panel → Chat | Her mesajda otomatik inject, kullanıcı göremez |
| `trigger` | `#4db89a` (yeşil) | Chat → Terminal | Mesaj gönderilince terminal'e komut yazar |

### Mevcut Wire Render (ConnectionLayer.tsx — değişmez)

```typescript
// Zaten çalışıyor:
const strokeColor = conn.kind === "trigger" ? "#4db89a" : "#5b8def";
// N2'de "context" türü için mor eklenir:
const strokeColor =
  conn.kind === "trigger" ? "#4db89a" :
  conn.kind === "context"  ? "#9b72ef" :
  "#5b8def";
```

### Wire Bağlantı Validasyonu

```typescript
// ConnectionLayer.tsx handleDrop — şu an var:
if (from.panelId === drop.panelId) return; // self-loop engeli

// Eklenecek validasyonlar (N2'de):
// 1. Trigger wire sadece Chat→Terminal olabilir
// 2. Context wire sadece *→Chat olabilir
// 3. Header node'a hiçbir wire bağlanamaz
```

### Aggregation — Chat'in Upstream'i Okuma Şekli

```typescript
// CanvasPanelContent.tsx — useAllIncomingWireData hook (YENİ)
function useAllIncomingWireData(panelId: string): WireBlock[] {
  const connections = useCanvasStore((s) => s.connections);
  const panels = useCanvasStore((s) => s.panels);
  const panelMap = new Map(panels.map((p) => [p.id, p]));

  return connections
    .filter((c) => c.toPanel === panelId)
    .map((c) => {
      const src = panelMap.get(c.fromPanel);
      const data = (src?.meta?.outputData as WireData | undefined) ?? null;
      const charLimit = (c as Connection & { charLimit?: number }).charLimit ?? 4000;
      return {
        panelId: c.fromPanel,
        panelTitle: src?.title ?? "Unknown",
        panelType: (src?.type ?? "input") as PanelType,
        connectionKind: c.kind ?? "data",
        charLimit,
        data: data
          ? { ...data, value: typeof data.value === "string"
              ? data.value.slice(0, charLimit)
              : data.value }
          : null,
      } satisfies WireBlock;
    })
    .filter((b) => b.data?.value != null);
}
```

### Context Block Format (AI'ya giden metin)

```
<connected-context>
[⬛ Terminal · bash]
npm run build
> compiled 42 modules
> done in 3.2s

---

[◈ Editor · server.py]
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os
...

---

[□ Input · Not]
Bu dosyayı düzenlerken dikkat et: satır 42'de hardcoded port var.
</connected-context>

[kullanıcı mesajı buraya]
```

---

## 7. Faz N1 — MVP (1–2 gün)

> En düşük riskli, en yüksek değerli adımlar. Bu faz bitmeden N2'ye geçilmez.

### N1.1 — Terminal → outputData

**Etkilenen dosyalar:**
- `ide/src/modules/terminal/TerminalPane.tsx`
- `ide/src/modules/canvas/CanvasPanelContent.tsx`

**Adım 1 — TerminalPane'e handle metodu ekle:**

```typescript
// TerminalPane.tsx
// useImperativeHandle içindeki mevcut handle objesine ekle:
export type TerminalPaneHandle = {
  // ... mevcut metodlar ...
  getLastLines: (n: number) => string; // ← YENİ
};

// Implementasyon:
getLastLines: (n: number): string => {
  const buf = termRef.current?.buffer.active;
  if (!buf) return "";
  const lines: string[] = [];
  const start = Math.max(0, buf.length - n);
  for (let i = start; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join("\n").trimEnd();
},
```

**Adım 2 — CanvasTerminal'e interval ekle:**

```typescript
// CanvasPanelContent.tsx → function CanvasTerminal bileşeni içinde
const paneRef = useRef<TerminalPaneHandle | null>(null);
const { setOutputData } = useCanvasStore.getState();

useEffect(() => {
  const tick = () => {
    const buf = paneRef.current?.getLastLines(80) ?? "";
    if (buf.trim()) {
      setOutputData(panel.id, { kind: "text", value: buf.slice(0, 4000) });
    }
  };
  const timer = setInterval(tick, 3000);
  return () => clearInterval(timer);
}, [panel.id]);

// TerminalPane'e ref bağla:
// <TerminalPane ref={paneRef} ... />
```

**Test:** Terminal'de `ls -la` çalıştır → 3s bekle → canvas_read_state AI tool ile `meta.outputData` var mı kontrol et.

---

### N1.2 — Editor → outputData

**Etkilenen dosyalar:**
- `ide/src/modules/canvas/CanvasPanelContent.tsx`

**Adım 1 — Dosya yüklenince write:**

```typescript
// CanvasPanelContent.tsx → function CanvasEditor içinde
const path = panel.meta?.path as string | undefined;
const { setOutputData } = useCanvasStore.getState();

useEffect(() => {
  if (!path) return;
  invoke<string>("fs_read_file", { path })
    .then((content) => {
      setOutputData(panel.id, { kind: "text", value: content.slice(0, 4000) });
    })
    .catch(() => undefined);
}, [path, panel.id]);
```

**Adım 2 — onChange debounce:**

```typescript
// useMemo ile debounce instance'ı oluştur (panel.id değişince yenile)
const debouncedWrite = useMemo(
  () =>
    debounce((val: string) => {
      setOutputData(panel.id, { kind: "text", value: val.slice(0, 4000) });
    }, 1500),
  [panel.id]
);

// EditorPane prop'u:
// <EditorPane ... onChange={(val) => debouncedWrite(val)} />
// Not: EditorPane'in onChange prop'u zaten var mı? Yoksa ekle.
```

**`debounce` yardımcısı** (yoksa aynı dosyaya ekle, bağımlılık yok):
```typescript
function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

**Test:** Bir dosya aç → `meta.outputData` dolmalı. Bir karakter yaz → 1.5s sonra güncellenmeli.

---

### N1.3 — Multi-wire aggregation + ChatPanel auto-context

**Etkilenen dosyalar:**
- `ide/src/modules/canvas/CanvasPanelContent.tsx` — yeni hook
- `ide/src/modules/ai/components/ChatPanel.tsx` — badge + auto-prepend

**Adım 1 — Hook'u ekle (`CanvasPanelContent.tsx` en üstüne):**

```typescript
// Dosyanın üstünde, export'ların dışında:
function useAllIncomingWireData(panelId: string): WireBlock[] {
  const connections = useCanvasStore((s) => s.connections);
  const panels = useCanvasStore((s) => s.panels);
  const panelMap = useMemo(
    () => new Map(panels.map((p) => [p.id, p])),
    [panels]
  );

  return useMemo(
    () =>
      connections
        .filter((c) => c.toPanel === panelId)
        .map((c) => {
          const src = panelMap.get(c.fromPanel);
          const data = (src?.meta?.outputData as WireData | undefined) ?? null;
          return {
            panelId: c.fromPanel,
            panelTitle: src?.title ?? "Unknown",
            panelType: (src?.type ?? "input") as PanelType,
            connectionKind: (c.kind ?? "data") as WireBlock["connectionKind"],
            charLimit: 4000,
            data: data
              ? {
                  ...data,
                  value:
                    typeof data.value === "string"
                      ? data.value.slice(0, 4000)
                      : data.value,
                }
              : null,
          } satisfies WireBlock;
        })
        .filter((b) => b.data?.value != null),
    [connections, panelId, panelMap]
  );
}
```

**Adım 2 — ChatPanel'e badge satırı ve auto-prepend:**

```typescript
// ChatPanel.tsx — mevcut props'a `panelId: string` ekle (zaten gelmeli)
// Veya ChatPanel canvas context'ten panelId'yi okur

const wireBlocks = useAllIncomingWireData(panelId);

// Panel icon map (dosyanın en üstüne sabit olarak):
const PANEL_ICONS: Partial<Record<PanelType, string>> = {
  terminal:  "⬛",
  editor:    "◈",
  input:     "□",
  web:       "◌",
  "vault-home": "◎",
  checklist: "✓",
  gallery:   "⊞",
};

// Badge satırı — ChatPanel header'ının hemen altına:
{wireBlocks.length > 0 && (
  <div className="flex items-center gap-1 border-b border-[#2a2a2a] px-2 py-0.5 flex-wrap">
    <span className="text-[8px] text-[#555] shrink-0">ctx:</span>
    {wireBlocks.map((b) => (
      <span
        key={b.panelId}
        className="rounded bg-[#5b8def]/10 px-1.5 py-0.5 text-[8px] text-[#5b8def] flex items-center gap-0.5"
        title={`${b.panelTitle} · ${b.panelType} · ${typeof b.data?.value === "string" ? b.data.value.length : 0} chars`}
      >
        <span>{PANEL_ICONS[b.panelType] ?? "◉"}</span>
        <span>{b.panelTitle}</span>
      </span>
    ))}
  </div>
)}

// Auto-prepend — mesaj gönderilmeden önce çağrılacak fonksiyon:
const buildContextPrefix = useCallback((): string => {
  const blocks = wireBlocks
    .filter((b) => b.data?.kind === "text" && b.data.value)
    .map(
      (b) =>
        `[${PANEL_ICONS[b.panelType] ?? "◉"} ${b.panelTitle} · ${b.panelType}]\n${String(b.data!.value)}`
    )
    .join("\n\n---\n\n");

  return blocks
    ? `<connected-context>\n${blocks}\n</connected-context>\n\n`
    : "";
}, [wireBlocks]);

// Mevcut send handler'ına (handleSend veya onSend) ekle:
const handleSend = async (userMessage: string) => {
  const prefix = buildContextPrefix();
  const fullMessage = prefix + userMessage;
  // mevcut send logic ile fullMessage'ı gönder
};
```

**Image wire otomatik attachment** (mevcut "Insert" logic'ini extend et):
```typescript
// Mesaj gönderilirken image wire'ları da otomatik attach:
const imageBlocks = wireBlocks.filter((b) => b.data?.kind === "image");
for (const block of imageBlocks) {
  if (typeof block.data?.value === "string") {
    attachImageDataUrl(block.data.value); // zaten var
  }
}
```

**Test:** Terminal → Chat'e wire çek → Chat header'ında `⬛ Terminal` badge görünmeli. Mesaj yaz ve gönder → terminat içeriği mesajın önüne otomatik eklenmeli.

---

### N1 Tamamlama Kriterleri

- [ ] Terminal'de komut çalıştır → 3s içinde `meta.outputData` dolar
- [ ] Editor'da dosya aç → `meta.outputData` dolar
- [ ] Terminal → Chat wire → badge görünür
- [ ] Editor → Chat wire → badge görünür
- [ ] İkisi birden Chat'e bağlı → iki badge görünür
- [ ] Chat mesajı gönder → her iki kaynak da `<connected-context>` içinde geliyor
- [ ] Image wire → mesajda otomatik attach
- [ ] `npx tsc --noEmit` → 0 hata

---

## 8. Faz N1.5 — Görsel Canvas (1–2 gün)

> Blueprint stil görsel dil. Fonksiyonel değişiklik yok, saf görsel.

### N1.5.1 — Node Kenarlık Renk Sistemi

**Dosya:** `ide/src/modules/canvas/CanvasPanelContent.tsx` veya panel kart bileşeni

```typescript
// Sabit renk map:
export const NODE_ACCENT: Partial<Record<PanelType, string>> = {
  terminal:    "#4db89a",  // yeşil
  editor:      "#9b72ef",  // mor
  chat:        "#5b8def",  // mavi
  agent:       "#5b8def",  // mavi
  input:       "#d4a843",  // sarı/altın
  checklist:   "#888888",  // nötr gri
  web:         "#666666",  // koyu gri
  "vault-home":"#666666",
  pipeline:    "#e07b54",  // turuncu
  gallery:     "#888888",
};
const DEFAULT_ACCENT = "#333333";

// Panel card container'ına uygula:
const accent = (panel.type === "header"
  ? panel.meta?.headerColor as string | undefined
  : NODE_ACCENT[panel.type]) ?? DEFAULT_ACCENT;

// Inline style veya CSS variable:
style={{
  borderColor: accent,
  boxShadow: `0 0 12px ${accent}20`,
}}
// class: "border rounded-lg" (border genişliği Tailwind'den)
```

### N1.5.2 — Header Node

**Yeni dosya:** `ide/src/modules/canvas/HeaderPanel.tsx`

```typescript
// Sadece başlık + renk seçici
const HEADER_COLORS = [
  { hex: "#d4a843", label: "Sarı" },
  { hex: "#9b72ef", label: "Mor" },
  { hex: "#5b8def", label: "Mavi" },
  { hex: "#4db89a", label: "Yeşil" },
  { hex: "#e07b54", label: "Kırmızı" },
  { hex: "#555555", label: "Nötr" },
];

export function HeaderPanel({ panel }: { panel: Panel }) {
  const { updatePanel } = useCanvasStore.getState();
  const color = (panel.meta?.headerColor as string) ?? "#d4a843";

  return (
    <div
      className="flex h-full w-full items-center justify-between px-4"
      style={{ borderColor: color, boxShadow: `0 0 16px ${color}25` }}
    >
      <span
        className="text-[15px] font-semibold tracking-tight"
        style={{ color }}
        onDoubleClick={(e) => {
          // inline edit — contentEditable
        }}
      >
        {panel.title}
      </span>
      <div className="flex items-center gap-1">
        {HEADER_COLORS.map((c) => (
          <button
            key={c.hex}
            onClick={() => updatePanel(panel.id, { meta: { ...panel.meta, headerColor: c.hex } })}
            style={{ background: c.hex }}
            className="size-3 rounded-full opacity-70 hover:opacity-100 transition-opacity duration-150"
            title={c.label}
          />
        ))}
      </div>
    </div>
  );
}
```

**CanvasPanelContent.tsx switch'e ekle:**
```typescript
case "header":
  return <HeaderPanel panel={panel} />;
```

### N1.5.3 — Checklist Node

**Yeni dosya:** `ide/src/modules/canvas/ChecklistPanel.tsx`

```typescript
type ChecklistItem = { id: string; text: string; done: boolean };

export function ChecklistPanel({ panel }: { panel: Panel }) {
  const { updatePanel, setOutputData } = useCanvasStore.getState();
  const items = (panel.meta?.items as ChecklistItem[] | undefined) ?? [];

  const saveItems = (next: ChecklistItem[]) => {
    updatePanel(panel.id, { meta: { ...panel.meta, items: next } });
    // outputData: tamamlanmamışları wire'a yaz
    const pending = next.filter((i) => !i.done).map((i) => `- ${i.text}`).join("\n");
    setOutputData(panel.id, { kind: "text", value: pending });
  };

  const toggle = (id: string) =>
    saveItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const addItem = () =>
    saveItems([...items, { id: crypto.randomUUID(), text: "Yeni görev", done: false }]);

  const deleteItem = (id: string) =>
    saveItems(items.filter((i) => i.id !== id));

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 group">
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => toggle(item.id)}
            className="size-3.5 accent-[#5b8def] shrink-0"
          />
          <span
            className={`flex-1 text-[12px] ${item.done ? "line-through opacity-40" : "text-[#f5f5f5]"}`}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) =>
              saveItems(
                items.map((i) =>
                  i.id === item.id ? { ...i, text: e.currentTarget.textContent ?? i.text } : i
                )
              )
            }
          >
            {item.text}
          </span>
          <button
            onClick={() => deleteItem(item.id)}
            className="opacity-0 group-hover:opacity-50 text-[10px] text-[#555] hover:text-[#f55] transition-opacity duration-150"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addItem}
        className="mt-1 text-left text-[11px] text-[#555] hover:text-[#888] transition-colors duration-150"
      >
        + Add item
      </button>
    </div>
  );
}
```

### N1.5 Tamamlama Kriterleri

- [ ] Terminal panel → yeşil kenarlık + çok hafif glow
- [ ] Editor panel → mor kenarlık
- [ ] Chat panel → mavi kenarlık
- [ ] Header node oluşturulabiliyor, renk seçiliyor
- [ ] Checklist node'da item ekle/işaretle/sil çalışıyor
- [ ] Checklist outputData wire'a akıyor
- [ ] Tasarım `system.md` ile çakışmıyor (box-shadow çok hafif, `20` opacity ile)

---

## 9. Faz N2 — Akıllı Teller (3–5 gün)

### N2.1 — Gallery Node

**Yeni dosya:** `ide/src/modules/canvas/GalleryPanel.tsx`

- Kullanıcı bir klasör seçer → `fs_list_dir` ile resim dosyaları listelenir
- Her resim `asset://` URL ile thumbnail olarak gösterilir (32×32 veya 64×64)
- Tıklanan resim: `FileReader` veya `fs_read_file` + base64 → `setOutputData({kind:"image", value: dataUrl})`
- Kullanım alanı: renk paleti referansı, moodboard, referans görsel → chat'e wire

### N2.2 — Web Panel → outputData

**Dosya:** `ide/src/modules/canvas/CanvasPanelContent.tsx → CanvasWeb`

```typescript
// web://nav-changed Tauri event'ini dinle
useEffect(() => {
  const unlisten = listen<{ url: string; title: string }>(
    "web://nav-changed",
    (event) => {
      if (event.payload.url) {
        setOutputData(panel.id, {
          kind: "text",
          value: `${event.payload.title || "Sayfa"} | ${event.payload.url}`,
        });
      }
    }
  );
  return () => { unlisten.then((fn) => fn()); };
}, [panel.id]);
```

### N2.3 — Vault Panel → outputData

**Yaklaşım:** iframe postMessage bridge

```typescript
// CanvasVaultHome içinde:
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === "atlas-vault-content") {
      setOutputData(panel.id, {
        kind: "text",
        value: `${event.data.title}\n\n${event.data.body}`.slice(0, 4000),
      });
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, [panel.id]);

// vault/index.html'e eklenecek script (her sayfa yüklenince):
// window.parent.postMessage({
//   type: "atlas-vault-content",
//   title: document.title,
//   body: document.body.innerText.slice(0, 4000)
// }, "*");
```

### N2.4 — Connection Kind Seçim UI

Tel bırakılınca küçük popup:

```typescript
// ConnectionLayer.tsx — handleDrop sonrasında state aç
const [pendingKindSelect, setPendingKindSelect] = useState<{
  connId: string;
  x: number;
  y: number;
} | null>(null);

// Tel çizilince:
const conn = addConnection(from.panelId, from.side, drop.panelId, drop.side);
setPendingKindSelect({ connId: conn.id, x: midX, y: midY });

// Popup render:
{pendingKindSelect && (
  <div
    style={{ left: pendingKindSelect.x, top: pendingKindSelect.y }}
    className="absolute z-50 flex gap-1 rounded-md border border-[#2a2a2a] bg-[#111] p-1 shadow-md"
  >
    {(["data", "context", "trigger"] as const).map((kind) => (
      <button
        key={kind}
        onClick={() => {
          updateConnectionKind(pendingKindSelect.connId, kind);
          setPendingKindSelect(null);
        }}
        className="rounded px-2 py-1 text-[10px] hover:bg-[#1a1a1a] transition-colors"
        style={{ color: kind === "trigger" ? "#4db89a" : kind === "context" ? "#9b72ef" : "#5b8def" }}
      >
        {kind}
      </button>
    ))}
  </div>
)}
```

### N2.5 — Trigger Tel Mekaniği

Chat → Terminal trigger wire bağlandığında, chat mesajı gönderilince terminal'e komut yazılır:

```typescript
// ChatPanel.tsx handleSend içinde:
const triggerWires = wireBlocks.filter((b) => b.connectionKind === "trigger");
for (const wire of triggerWires) {
  // terminal panelini bul, komut yaz
  const termHandle = terminalHandles.get(wire.panelId);
  if (termHandle) {
    termHandle.sendInput(userMessage + "\r");
  }
}
```

### N2 Tamamlama Kriterleri

- [ ] Gallery node: klasör seç, resimler görünür, tıklayınca chat'e wire olarak geçer
- [ ] Web node: URL değişince output wire güncellenir
- [ ] Vault node: sayfa açılınca içerik wire'a akar
- [ ] Tel çekilince kind seçim popup'ı görünür
- [ ] Trigger wire: chat mesajı → terminal'de çalışır

---

## 10. Faz N3 — Komut Modu (2–3 gün)

### N3.1 — "Apply to All" Toggle

ChatPanel veya AiInputBar'da toggle butonu:

```typescript
const [applyToAll, setApplyToAll] = useState(false);

// Input bar'a buton:
<button
  onClick={() => setApplyToAll((v) => !v)}
  className={cn(
    "rounded px-2 py-0.5 text-[10px] transition-colors duration-150",
    applyToAll
      ? "bg-[#5b8def]/20 text-[#5b8def]"
      : "text-[#555] hover:text-[#888]"
  )}
>
  ⊞ Tümüne uygula
</button>

// applyToAll aktifken badge'ler lit görünür (opacity 1 vs 0.6)
// Context prefix her zaman eklenir (data + context wire'lar)
```

### N3.2 — Snapshot Modu

Panel başlık barında 📌 butonu — tıklayınca o anki outputData dondurulur:

```typescript
// Panel meta'ya:
panel.meta.snapshotData: WireData | null  // dondurulmuş veri
panel.meta.isSnapshot: boolean

// useAllIncomingWireData'da:
const data = src?.meta?.isSnapshot
  ? (src?.meta?.snapshotData as WireData)
  : (src?.meta?.outputData as WireData);
```

### N3.3 — Per-Wire Char Limit

Tel üzerine tıklayınca ayar popover'ı:

```typescript
// Connection tipine charLimit ekle (zaten WireBlock'ta var):
// connection.charLimit = 4000 (default)

// Tel midpoint'ine tıklanınca slider popup:
<input
  type="range"
  min={500}
  max={16000}
  step={500}
  value={conn.charLimit ?? 4000}
  onChange={(e) => updateConnectionCharLimit(conn.id, Number(e.target.value))}
/>
<span>{(conn.charLimit ?? 4000).toLocaleString()} chars</span>
```

---

## 11. Etkilenen Dosyalar — Tam Liste

### N1 (Core Wire System)

| Dosya | Değişiklik |
|---|---|
| `ide/src/modules/terminal/TerminalPane.tsx` | `getLastLines(n)` handle metodu ekle |
| `ide/src/modules/canvas/CanvasPanelContent.tsx` | `useAllIncomingWireData` hook, Terminal interval, Editor debounce |
| `ide/src/modules/ai/components/ChatPanel.tsx` | Badge satırı, auto-context prepend, image auto-attach |
| `ide/src/modules/canvas/types.ts` | `WireBlock` tipi, `header`+`checklist`+`gallery` PanelType |

### N1.5 (Visual Canvas)

| Dosya | Değişiklik |
|---|---|
| `ide/src/modules/canvas/CanvasPanelContent.tsx` | Node accent renk sistemi, header+checklist case |
| `ide/src/modules/canvas/HeaderPanel.tsx` | **YENİ** — header node bileşeni |
| `ide/src/modules/canvas/ChecklistPanel.tsx` | **YENİ** — checklist node bileşeni |
| `ide/src/modules/canvas/canvasStore.ts` | Checklist item CRUD helper'ları (opsiyonel) |

### N2 (Smart Wires + New Nodes)

| Dosya | Değişiklik |
|---|---|
| `ide/src/modules/canvas/GalleryPanel.tsx` | **YENİ** — gallery node |
| `ide/src/modules/canvas/CanvasPanelContent.tsx` | Web+Vault outputData |
| `ide/src/modules/canvas/ConnectionLayer.tsx` | Kind seçim popup, mor tel rengi |
| `ide/src/modules/canvas/canvasStore.ts` | `updateConnectionKind`, `updateConnectionCharLimit` |
| `ide/src/modules/canvas/types.ts` | `Connection.charLimit`, `Connection.kind += "context"` |

### N3 (Command Mode)

| Dosya | Değişiklik |
|---|---|
| `ide/src/modules/ai/components/ChatPanel.tsx` | Apply-to-all toggle, snapshot badge |
| `ide/src/modules/canvas/CanvasPanelContent.tsx` | Snapshot button + logic |
| `ide/src/modules/canvas/ConnectionLayer.tsx` | Per-wire limit popup |

---

## 12. Mimari Kurallar

### Yapılacaklar ✅

- Her panel tipi kendi `setOutputData` sorumluluğunu taşır (CanvasPanelContent içinde, dışarıda değil)
- `useAllIncomingWireData` sadece chat/agent panellerinde kullanılır — global event değil
- Wire data 4000 char ile sınırlandırılır — token overflow önlenir
- Context prepend — AI SDK'nın `append` veya message prefix yöntemi ile, chat history bozulmaz
- Tüm `setOutputData` çağrıları debounce edilir (terminal: 3s interval, editor: 1.5s debounce)
- Node kenarlık rengi CSS custom property veya inline style ile — Tailwind `ring-` değil (dinamik renk)
- Yeni panel tipleri mevcut `CanvasPanelContent.tsx` switch case'e eklenir — yeni ana dosya açılmaz
- `WireBlock` tipi `types.ts`'e eklenir — ayrı dosya açılmaz
- Canvas persist `canvasStore.ts`'deki LazyStore mekanizması ile — ek store yok

### Yapılmayacaklar ❌

- Terminal içeriğini < 1s interval ile okumak — CPU israfı, 3s yeterli
- Wire data için boyut limiti koymamak — mutlaka 4000 char max (daha yüksek per-wire N3'te)
- Wire data'yı AI tool call'dan geçirmek — doğrudan chat message prefix'e eklenir
- Yeni Zustand store açmak — `canvasStore.meta.outputData` zaten esnek
- Web panel için tam sayfa scraping — native WebView erişimi olmadığından URL+başlık yeterli
- Header node'a wire bağlamak — organizasyon amaçlı, data akışına dahil değil
- `framer-motion` veya dış animasyon kütüphanesi — proje bunları çıkardı, CSS keyframe yeterli
- Node'ları drag sırasında React re-render etmek — CSS transform ile taşı, state'i bırakma sırasında güncelle
- `getLastLines` gibi buffer API'larını React render döngüsünde çağırmak — interval callback içinde çağır

### Veri Akışı Tek Yönlü

```
Producer Panel → setOutputData → canvasStore.panel.meta.outputData
                                         ↓
                             useAllIncomingWireData (chat'te)
                                         ↓
                             buildContextPrefix()
                                         ↓
                             handleSend(prefix + userMessage)
                                         ↓
                             AI SDK → model yanıtı
```

Wire'lar sadece aşağı akar. Chat'ten producer panellere geri veri dönmez (trigger wire N2'de ayrı mekanizma).

---

## 13. Başlangıç Sırası

```
N1.1 → N1.2 → N1.3 → N1.5 → N2 → N3
  │       │       │
  │       │       └── useAllIncomingWireData hook + ChatPanel badge/auto-prepend
  │       └────────── Editor → outputData (dosya yükle + debounce)
  └────────────────── Terminal → outputData (getLastLines + 3s interval)
```

**Neden bu sıra:**

1. **N1.1 Terminal** — En somut test: terminal çalıştır, 3s bekle, wire doldu mu gör
2. **N1.2 Editor** — Dosya API'ı zaten var, en kısa implementasyon
3. **N1.3 Hook + Chat** — Saf TypeScript + React, sıfır altyapı değişikliği — en düşük risk
4. **N1.5 Görsel** — Fonksiyonel sistem hazır, şimdi güzel görünsün
5. **N2** — Yeni node tipleri + akıllı teller
6. **N3** — Güç kullanıcı özellikleri

Her adım bağımsız çalışır. Her commit test edilebilir durumdadır.

---

## 14. Fırsatlar

| Fırsat | Açıklama | Öneri |
|---|---|---|
| **Agent chaining** | Agent node → Chat → başka agent: pipeline AI workflow. Bir agent'ın yanıtı başka bir agent'ın inputu. | N2 sonrası |
| **Blueprint kaydetme + yükleme** | Mevcut `blueprint_save` wire layout'ı da kaydetsin, yüklenince bağlantılar geri gelsin | N2 ile birlikte |
| **Vault graph wiring** | Vault sayfaları arası tel: backlink = data wire. Graph view'da tel görünür. | N3 sonrası |
| **CRON panel** | Zamanlayıcı node → trigger tel → chat/terminal otomatik tetikler. "Her saat başı çalıştır." | N3 sonrası |
| **Diff wires** | İki editor node → chat: "Bu iki dosyayı karşılaştır." Diff view chat'te render. | N3 |
| **Gallery → araştırma pipeline** | Resim → web search → chat: görsel araştırma. | N2 sonrası |
| **Exportable workflow** | Wire layout + panel config → tek JSON → paylaşılabilir "recipe". QR kod ile paylaş. | İleride |
| **Moodboard modu** | Sadece header + gallery + text node'larla fikir panosu. Wire yok, organize mode. | İleride |
| **Live feedback loop** | Terminal output → AI analiz → terminal'e komut → döngü. Otomatik hata düzeltme pipeline. | İleride |
| **Multi-model pipeline** | Bir chat node farklı model kullanır, wire ile başka chat'e bağlanır. GPT-4o → Llama chain. | İleride |

---

## Canvas Vizyon Özeti

```
Sonsuz canvas'ta düşünce makinesi:

  ┌──────────────────────────────────────────────────────────────┐
  │  [◆ Proje Başlığı]  ←── sarı header node                    │
  │       │                                                       │
  │  ┌────┴──────────┐  ┌─────────────┐  ┌──────────────────┐  │
  │  │  ⬛ Terminal  │  │ ◈ Editor    │  │  ◌ Web Browser   │  │
  │  │  yeşil glow  ●━━━━━━━━━━━━━━━━━━━━━━●  gri           │  │
  │  └───────────────┘  │ mor glow    │  └──────────────────┘  │
  │                      └─────────────┘           │             │
  │   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●            │
  │                            ▼                                  │
  │                   ┌──────────────────┐                       │
  │                   │  ◎ Atlas Chat   │  ← mavi glow           │
  │                   │  ctx: ⬛ ◈ ◌   │  ← badge satırı        │
  │                   │  AI yanıtı...   │                       │
  │                   │  [Mesaj yaz ▶] │                       │
  │                   └──────────────────┘                       │
  │                                                               │
  │  ┌──────────────────┐  ┌──────────────────┐                 │
  │  │  ✓ Checklist     │  │  ⊞ Gallery       │                 │
  │  │  ☑ Görev 1      ●  │  🖼 🖼 🖼 🖼    ●  │                 │
  │  │  ☐ Görev 2      │  │  🖼 🖼 🖼 🖼     │                 │
  │  └──────────────────┘  └──────────────────┘                 │
  └──────────────────────────────────────────────────────────────┘

Her ● output pin. Her wire veri taşır. Chat node hepsini toplar.
Bu artık bir panel manager değil — bir düşünce makinesi.
```

---

*Plan yazım tarihi: 2026-05-21*  
*Referans: Unreal Engine Blueprint paradigması + ifelse.io dark canvas vizyon*  
*Koddan çıkarılan gerçek altyapı durumuna göre hazırlanmıştır.*  
*Bu son özellik. Proje bu ile sabitlenir.*
