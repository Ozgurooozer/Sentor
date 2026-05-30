# Atlas OS — AI & Tool Calling Teknik Rapor
**Tarih:** 28 Mayıs 2026  
**Kapsam:** Çift input bar sorunu · Orkestra vs AI SDK mimarisi · Tool calling neden çalışmıyor · Chat output port davranışı

---

## 1. Ekrandaki Sorun: Çift Input Bar

### Gözlemlenen durum (screenshot)
Ekranda **iki ayrı Orkestra input bar** görünüyor:

```
[canvas'a komut ver…]           ← CanvasOrkestraBar (BU SOHBETTE EKLENDİ)
[Canvas'ı yönet — node ekle…]   ← V3InputShell (zaten vardı, ayrı Tauri penceresi)
```

### Neden oldu?
`CanvasOrkestraBar` bu sohbette "canvas chat input görünmüyor" sorununu çözmek için eklendi. Ama V3InputShell zaten mevcuttu — sadece **ayrı bir Tauri penceresi** olarak açılıyor, canvas'ın içinde değil.

**V3InputShell** (`ide/src/modules/v3/V3InputShell.tsx`):
- Ayrı Tauri window (`v3-input` label)
- `hash = "#v3-input"` ile `App.tsx` tarafından route ediliyor
- `atlas:canvas-prompt` event'i emit ediyor → `CanvasAppShell` dinliyor → `orkestraStore.send()` çağırıyor
- Ses kaydı (Whisper), TTS, vault route, canvas-link toggle içeriyor
- `useOrkestraStore` üzerinden aynı mesaj listesine yazıyor

**CanvasOrkestraBar** (`ide/src/modules/canvas/CanvasOrkestraBar.tsx`):
- `CanvasAppShell` içine gömülü, canvas üzerinde fixed konumda
- Doğrudan `orkestraStore.send()` çağırıyor
- Aynı mesaj listesini gösteriyor

**Sonuç:** İkisi de aynı store'a yazıyor, aynı mesajları görüntülüyor. Tek fark V3InputShell'in ses/TTS/vault özellikleri var.

### Düzeltme
`CanvasOrkestraBar` kaldırılmalı veya V3InputShell penceresi açık değilken fallback olarak gösterilmeli.

---

## 2. İki Farklı AI Sistemi: Mimari Fark

Atlas OS'ta birbirinden tamamen bağımsız iki AI motoru var:

### 2A. Orkestra (OrkestraStore)
**Dosya:** `ide/src/modules/canvas/orkestraStore.ts`

```
Kullanıcı mesajı
      ↓
buildSystem() → system prompt oluştur (node listesi, alias map)
      ↓
fetch(ollama/lmstudio) → streaming HTTP
      ↓
extractCalls(responseText) → JSON tarama
{"tool":"add","type":"terminal"} gibi blokları bul
      ↓
execTool(call) → canvasStore'u doğrudan mutate et
```

**Nasıl çalışır:**
- Model yanıtının düz metnine `{...}` JSON blokları gömmesi beklenir
- `extractCalls()` brace-balanced scanner ile bu JSON'ları bulur
- `execTool()` bunları canvasStore action'larına çevirir

**Araçlar:**
| Tool | Ne yapar |
|---|---|
| `add` | Yeni panel ekle |
| `connect` | İki paneli wire'la bağla |
| `wire` | Otomatik port eşleşmeyle bağla |
| `build` | Pipeline oluştur (node dizisi + wire listesi) |
| `run` | Terminal'e komut gönder |
| `set` | Input panel değerini set et |
| `remove` | Panel kaldır |
| `clear` | Tüm canvas'ı temizle |
| `rename` | Panel adını değiştir |
| `list` | Mevcut node'ları listele |
| `var_set/get/list` | Variable store |

**Zayıflık:** Model `{"tool":"add",...}` formatını üretmezse araçlar **sessizce çalışmaz**. Hata console'a düşer ama kullanıcı görmez.

---

### 2B. AI SDK (Chat Node, Agent)
**Dosyalar:** `ide/src/modules/ai/lib/agent.ts`, `transport.ts`, `tools/`

```
ChatPanel → AiInputBar → AiComposerProvider
      ↓
createContextAwareTransport(deps)
      ↓
createAtlasAgent({ keys, modelId, toolContext, ... })
      ↓
buildLanguageModel(provider, keys, modelId)
  → @ai-sdk/openai-compatible veya @ai-sdk/anthropic vb.
      ↓
DirectChatTransport({ agent }) → streaming
      ↓
AI SDK structured function calling
  (model `tools` field'i görür, type-safe JSON schema)
      ↓
tool.execute() → React state / Tauri invoke / dosya sistemi
```

**Araçlar (`ide/src/modules/ai/tools/`):**
- `fs.ts` — read_file, write_file, list_directory, create_directory
- `edit.ts` — edit, multi_edit (read-before-edit zorunlu)
- `search.ts` — grep, glob
- `shell.ts` — bash_run, bash_background, bash_logs
- `vault.ts` — vault_search, vault_read, vault_write
- `web.ts` — web_search, web_fetch
- `canvas.ts` — canvas_read_state, canvas_add_node, canvas_connect, canvas_clear, canvas_send_to_terminal, blueprint_save, agent_spawn, variable_set/get/list
- `subagent.ts` — run_subagent
- `terminal.ts` — terminal_write, terminal_read

**Güç:** Model API düzeyinde type-safe function calling kullanır. Model JSON üretmek zorunda değil — API protokolü üzerinden structured çağrı gelir.

---

## 3. Neden Tool Calling Çalışmıyor

### 3A. AI SDK (Chat Node) için

**Zincir:**
```
ChatPanel → AI SDK → buildLanguageModel → createOpenAICompatible → LM Studio
```

AI SDK, LM Studio'ya şu format'ta istek gönderir:
```json
{
  "model": "google/gemma-4-e4b",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "canvas_read_state",
        "description": "...",
        "parameters": { "type": "object", "properties": {} }
      }
    }
  ]
}
```

**Sorun:** Model bu `tools` field'ini görmezden geliyorsa ya da desteklemiyorsa, AI SDK tool call almaz. Yanıt sadece text olarak gelir, tools execute edilmez.

**Mevcut model: `google/gemma-4-e4b` (4B)**
- Gemma 4 E4B → Instruction tuned, ama tool calling desteği zayıf
- Test: Chat node'a "canvas_read_state çağır" yaz → tool call UI görmüyorsun = çalışmıyor

**Mevcut model: `qwen_qwen3.5-2b` (2B)**
- 2B parametre → tool calling imkansız

**Kök neden:** LM Studio'daki model function calling formatını desteklemiyor.

### 3B. Orkestra için

**Zincir:**
```
CanvasOrkestraBar / V3InputShell → orkestraStore.send() → fetch(LM Studio /v1/chat/completions)
```

Model bu prompt'u alır:
```
Atlas canvas AI. Node editor control. Reply in user's language. Be concise.
WS:C:\Atlas OS
NODES:
n1 | terminal      | "Terminal" | in:[cmd, trigger] | out:[stdout]
WIRES:  (none)
TOOLS (embed JSON):
add: {"tool":"add","type":"terminal","title":"T","x":100,"y":200}
...
```

Model bu JSON formatını kendi yanıtına gömmesi gerekiyor. `google/gemma-4-e4b` veya `qwen3.5-2b` bunu tutarlı yapmıyor.

**Sessiz başarısızlık:** `extractCalls()` hiç JSON bulamazsa `rawCalls = []`, tool execution loop çalışmaz, kullanıcıya sadece metin yanıt görünür.

### 3C. Hangi model çalışır?

| Model | LM Studio'da | AI SDK Tool Calling | Orkestra JSON |
|---|---|---|---|
| google/gemma-4-e4b (4B) | ✓ yüklü | ⚠ kısmi | ⚠ kısmi |
| qwen_qwen3.5-2b (2B) | ✓ yüklü | ✗ | ✗ |
| Qwen2.5-7B-Instruct | indir (~4.5GB) | ✓ güvenilir | ✓ güvenilir |
| Qwen3-8B-Instruct | indir (~5GB) | ✓ çok iyi | ✓ çok iyi |
| Qwen3-30B-A3B (MoE) | indir (~5GB) | ✓ mükemmel | ✓ mükemmel |

---

## 4. Chat Output Port Sorunu

### Beklenen davranış
Canvas'ta bir Chat panel'in output wire'ından yanıt metni akar. Örneğin:
```
Input Panel → Chat Panel → Pipe Panel
(metin)       (AI yanıtı)  (dönüştür)
```

### Mevcut durum
`ChatPanel.tsx` → `ChatBody` içinde:
```tsx
// Bu useEffect son assistant mesajını output wire'a yazar
useEffect(() => {
  if (!panelId || helpers.status === "streaming" || helpers.status === "submitted") return;
  const last = [...helpers.messages].reverse().find((m) => m.role === "assistant");
  if (!last) return;
  const text = last.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") ?? "";
  if (text) setOutputData(panelId, { kind: "text", value: text });
}, [helpers.messages, helpers.status, panelId, setOutputData]);
```

**Sorun:** `helpers.messages` ve `helpers.status` AI SDK'nın `useChat` hook'undan geliyor. Eğer model tool calling yapıyorsa ve status `"submitted"` ile `"streaming"` arasında takılırsa output hiç yazılmaz.

**Ama** — model çalışıyorsa (status `"ready"` olursa) output yazılıyor. Temel sorun yine model.

### wire semantiği
- Chat panel output port: `response` (data wire, text)
- Downstream paneller `useAllIncomingWireData` ile bunu reactive olarak okuyor
- Canvas run engine `outputs` Map'ine de yazılıyor artık

---

## 5. Değişiklik Özeti (Bu Sohbet)

### Eklenenler
| Değişiklik | Dosya | Durum |
|---|---|---|
| `CanvasOrkestraBar` gömülü input | `CanvasOrkestraBar.tsx` | ⚠ Duplikasyon — kaldırılmalı |
| Canvas Run Engine | `canvasEngine.ts` | ✓ Tamamlandı |
| Gate Panel | `GatePanel.tsx` | ✓ Tamamlandı |
| `"gate"` PanelType | `types.ts` | ✓ Tamamlandı |
| Gate portları | `portDefs.ts` | ✓ Tamamlandı |
| Gate rengi | `nodeAccent.ts` | ✓ Tamamlandı |
| ▶ Run → engine bağlantısı | `V3CanvasTopBar.tsx` | ✓ Tamamlandı |
| Chat output wire fix | `ChatPanel.tsx` | ✓ Tamamlandı |

### Kaldırılması gerekenler
- `CanvasOrkestraBar.tsx` — V3InputShell zaten bu işi yapıyor
- `CanvasAppShell.tsx` içindeki `<CanvasOrkestraBar />` render'ı

---

## 6. Çözüm Adımları

### Acil (bu oturum)
1. **`CanvasOrkestraBar` kaldır** — V3InputShell'i kullan, çift input'u bitir
2. **LM Studio'da Qwen2.5-7B-Instruct yükle** (zaten indiriliyor) — tool calling çalışmaya başlar

### Kısa vadeli
3. **Orkestra → AI SDK migration** — `orkestraStore.send()` direct fetch yerine `createAtlasAgent` kullanacak şekilde refactor. JSON text scanning kaldırılır, structured tool calling gelir.

### Mevcut durum sonrası beklenen tablo
```
Qwen2.5-7B + AI SDK (Chat node):
  ✓ canvas_add_node, canvas_connect, canvas_clear çalışır
  ✓ read_file, write_file, bash_run çalışır
  ✓ vault_search çalışır
  ✓ Chat output wire → downstream paneller beslenir

Qwen2.5-7B + Orkestra (V3InputShell):
  ✓ add, connect, wire, build JSON araçları çalışır
  ✓ var_set/get çalışır
  ⚠ run engine tetiklenemez (Orkestra'da yok, ▶ Run ile tetiklenir)
```

---

## 7. Ekran Görüntüsü Analizi

**Screenshot'ta görülenler:**
1. Sol tarafta terminal PTY output görünüyor (log scroll)
2. Canvas'ta Three.js particle background aktif
3. Alt orta: `CanvasOrkestraBar` — "canvas'a komut ver…" (bu sohbette eklendi)
4. Alt merkez-sağ: V3InputShell floating window — "Canvas'ı yönet — node ekle, bağla, çalıştır…" + ses/TTS butonları
5. Sağ alt köşe: LM Studio deepseek/deepseek-r1-0528-qwen model indirme notification

**Sonuç:** İki input var, her ikisi de `useOrkestraStore` üzerinden aynı session'a yazıyor. Yeni `CanvasOrkestraBar` gereksiz — V3InputShell tüm özelliklere sahip ve zaten çalışıyor.

---

## 8. Referans Dosyalar

| Dosya | Açıklama |
|---|---|
| `ide/src/modules/canvas/orkestraStore.ts` | Orkestra AI motoru, JSON tool scanning, execTool() |
| `ide/src/modules/ai/lib/agent.ts` | AI SDK agent factory, buildLanguageModel() |
| `ide/src/modules/ai/lib/transport.ts` | createContextAwareTransport, context injection |
| `ide/src/modules/ai/tools/canvas.ts` | canvas_add_node, canvas_connect vb. AI SDK tools |
| `ide/src/modules/ai/tools/tools.ts` | buildTools() — tüm araçları toplar |
| `ide/src/modules/v3/V3InputShell.tsx` | Ayrı Tauri window, ses kaydı, TTS, canvas link |
| `ide/src/modules/canvas/CanvasOrkestraBar.tsx` | Gömülü input (DUPLIKASYON — kaldırılmalı) |
| `ide/src/modules/ai/components/ChatPanel.tsx` | Canvas chat node, output wire fix |
| `ide/src/modules/canvas/canvasEngine.ts` | Topological run engine (YENİ) |
| `ide/src/modules/canvas/GatePanel.tsx` | Gate panel (YENİ) |
