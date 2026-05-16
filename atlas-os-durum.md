# Atlas OS — Proje Durum Raporu

*15 Mayıs 2026*

---

## Genel Bakış

Atlas OS; vault (kişisel offline web), CLI, API ve tam donanımlı bir AI IDE'den oluşan sıfır-bağımlılıklı bir kişisel işletim sistemi / bilgi tabanıdır. Phase 1–2 tamamlandı, Phase 2.5 (AI IDE) aktif geliştirmede, Phase 3 CLI kısmı tamamlandı.

---

## Mimari Şeması

```
vault/{category}/{slug}/index.html   ← kaynak gerçek; HTML sayfalar
         │
tools/indexer.py                     ← HTML parse → index yazar
         │
.index/pages.json                    ← makine-okunabilir (API + CLI)
.index/pages.js                      ← tarayıcı-yüklenebilir (window.ATLAS_INDEX)
.index/embeddings.json               ← semantik vektörler (384-dim)
         │
         ├── ui/index.html           ← istemci-taraflı fuzzy arama (Fuse.js)
         ├── api/server.py           ← REST API (port 4242)
         ├── cli/atlas.py            ← terminal CLI
         └── ide/                    ← Tauri + React AI IDE
```

---

## Modül Durumları

### Phase 1 — Vault + UI (TAMAMLANDI)

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| Vault sayfa formatı | `vault/{cat}/{slug}/index.html` | Aktif |
| İndeksleyici | `tools/indexer.py` | Aktif (264 satır) |
| Tarayıcı arama UI | `ui/index.html + app.js + style.css` | Aktif |
| Sayfa indeksi (JSON) | `.index/pages.json` | 2 sayfa |
| Sayfa indeksi (JS) | `.index/pages.js` | Aktif |

### Phase 2 — API + CLI (TAMAMLANDI)

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| REST API server | `api/server.py` | Aktif (374 satır) |
| Keyword search | `GET /api/search?q=` | Aktif |
| Semantic search | `GET /api/semantic?q=` | Aktif |
| Sayfa okuma | `GET /api/page/{cat}/{slug}` | Aktif |
| CLI | `cli/atlas.py` | Aktif (416 satır) |
| Semantic embedder | `tools/embedder.py` | Aktif (136 satır) |
| Embedding modeli | all-MiniLM-L6-v2 (22 MB) | Kurulu |

### Phase 2.5 — AI IDE (AKTİF GELİŞTİRME)

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| Tauri + React çerçeve | `ide/` | Aktif |
| Agent sistemi | `ide/src/modules/ai/lib/agents.ts` | 10 built-in agent |
| Agent çalıştırıcı | `ide/src/modules/ai/lib/agent.ts` | Aktif |
| Provider/Model config | `ide/src/modules/ai/config.ts` | 2 provider (LM Studio, Ollama) |
| Vault araçları | `ide/src/modules/ai/tools/vault.ts` | vault_search (hibrit) / vault_read / vault_write |
| Tam araç seti | `ide/src/modules/ai/tools/tools.ts` | buildTools (17 araç) |
| Local-lite araç seti | `ide/src/modules/ai/tools/tools.ts` | buildLiteTools (8 araç) |
| Hibrit semantik arama | `ide/src/modules/ai/tools/vault.ts` | keyword + /api/semantic fallback, mode param |

---

## AI Provider & Model Listesi

IDE şu an **yerel modeller** ile çalışır (API key gerektirmez):

| Provider | Model | Özellik |
|----------|-------|---------|
| LM Studio | lmstudio-local | Kullanıcı tarafından yapılandırılan yerel model |
| Ollama | ollama-local | Kullanıcı tarafından yapılandırılan yerel model |

- Varsayılan model: `lmstudio-local`
- Autocomplete: LM Studio (`qwen2.5-coder-7b-instruct` varsayılan)
- Her iki provider lite modda çalışır: sistem prompt ~120 token, 8 araç, max 8 adım

---

## Built-in Agent Listesi

| ID | Ad | Açıklama |
|----|-----|---------|
| builtin:coder | Coder | Genel kodlama asistanı |
| builtin:architect | Architect | Tasarım ve trade-off analizi |
| builtin:reviewer | Code Reviewer | Diff inceleme; mantık, perf, güvenlik |
| builtin:security | Security | Tehdit modelleme ve açık tespiti |
| builtin:designer | Designer | UI/UX eleştiri ve iyileştirme |
| builtin:debug | Debugger | Hızlı hata tespiti, kök neden analizi |
| builtin:explain | Explain | Kod açıklama, sadece okur |
| builtin:tests | Test Writer | Unit ve entegrasyon testi yazımı |
| builtin:web | Web | Her cevap vault'a HTML sayfa olarak kaydedilir |
| builtin:vault | Vault | Hafıza döngüsü: vault_search → cevap → vault_write |

---

## Local Model Optimizasyonu

Yerel modeller (LM Studio, Ollama) otomatik algılanır ve lite moda geçilir:

- **Sistem promptu**: 800 token → ~120 token (LOCAL_SYSTEM_PROMPT)
- **Araç sayısı**: 17 → 8 (buildLiteTools)
- **Max adım**: 24 → 8 (LOCAL_MAX_AGENT_STEPS)
- **Vault memory loop**: Context limiti sorununu çözer — her cevap HTML olarak kaydedilir, sonraki soruda vault_search ile geri çekilir

---

## Vault Memory Döngüsü

```
Kullanıcı sorar
    │
vault_search (geçmiş bağlam)
    │
vault_read (ilgili sayfalar)
    │
Agent cevap üretir
    │
vault_write → tools/indexer.py çalışır → aranabilir HTML
    │
Sonraki konuşmada vault_search geri çeker
    └── Context window sınırı artık sorun değil
```

---

## API Endpoint'leri (port 4242)

| Method | Endpoint | Açıklama |
|--------|----------|---------|
| GET | `/api/search?q=&limit=&category=` | Keyword arama (TF-IDF benzeri skor) |
| GET | `/api/semantic?q=&limit=` | Semantik arama (cosine similarity) |
| GET | `/api/page/{category}/{slug}` | Tam sayfa metni |
| GET | `/api/categories` | Kategori listesi |
| GET | `/api/pages` | Tüm index |

---

## Tasarım Sistemi Renk Tokenleri

| Token | Değer |
|-------|-------|
| bg-base | #0a0a0a |
| bg-surface | #111111 |
| bg-elevated | #1a1a1a |
| bg-overlay | #222222 |
| border-subtle | #2a2a2a |
| border-active | #404040 |
| text-primary | #f5f5f5 |
| text-secondary | #888888 |
| accent | #5b8def |
| accent-hover | #4a7de0 |

**Kurallar:** Border-only derinlik (box-shadow yasak), 150ms ease-out, system-ui font, rounded-lg maksimum.

---

## Dosya Satır Sayıları

| Dosya | Satır |
|-------|-------|
| api/server.py | 374 |
| cli/atlas.py | 416 |
| tools/indexer.py | 264 |
| tools/embedder.py | 136 |
| ide/.../config.ts | 193 |
| ide/.../agent.ts | 232 |
| ide/.../agents.ts | 244 |
| ide/.../vault.ts | 417 |
| ide/.../tools.ts | 60 |

---

## Phase 3 — Ollama Tool-Calling (TAMAMLANDI)

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| CLI Ollama tool-calling | `cli/atlas.py:216–339` + `tools/ollama-tools.json` | Tamamlandı |
| `search_knowledge` aracı | `ollama-tools.json` → `/api/search` | Tamamlandı |
| `get_page` aracı | `ollama-tools.json` → `/api/page/{cat}/{slug}` | Tamamlandı |
| CLI agentic loop | `cmd_chat()` — tool_calls döngüsü | Tamamlandı |
| Test paketi | `tests/test_ollama.py`, `tests/test_multiturn.py` | Tamamlandı |
| IDE hibrit vault_search | `ide/.../vault.ts` — keyword + semantic fallback | Tamamlandı |

---

## Sonraki Adımlar (Phase 4)

- [ ] Vault sayfa sayısını artır
- [ ] Semantic search otomatik embed tetikleme (indexer'a ekle)
- [ ] IDE: AtlasPanel ve Graf görünümü tamamlama
- [ ] Auto-embed on index: `tools/indexer.py` → `tools/embedder.py` bağlantısı
