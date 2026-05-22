# Vault — Decisions

Karar kaydı. Yeni karar `vault_agent_log(agent, "decision", msg)` ile otomatik buraya da düşer (K16, Faz 3 sonrası).

## D1 — Sentor agent BUILTIN_AGENTS'tan kaldırıldı
**Tarih:** 2026-05-19
**Status:** accepted
**Decision:** `ide/src/modules/ai/lib/agents.ts` içindeki BUILTIN_AGENTS sabitinden Sentor entry'si silindi. Built-in agent sayısı 4 → 3 (Vault, Atlas-Maker, Coder).
**Reason:** Sentor canvas/tools altyapısı vault sorunsalının dışında; built-in liste vault-merkezli üç agent'a daraltıldı.
**Alternatives:** Custom'a düşürmek — reddedildi, kullanıcı net "sil" dedi.
**Impact:** UI built-in agent listesi; Sentor canvas/tools modülleri intact kaldı.

## D2 — `vault/prototypes/` vault dışına çıktı
**Tarih:** 2026-05-19
**Status:** accepted
**Decision:** 6 prototip varyantı (htlas, otlas, qtlas, taslak, tlas, atlas-root) kök seviyede `prototypes/` altına `git mv` ile taşındı.
**Reason:** Prototipler ayrı bir sistem — indexer/search vault'un içeriğini temiz tutmalı, prototip artıkları search'i kirletmemeli.
**Alternatives:** Archive'a taşımak — reddedildi, prototipler hâlâ "canlı" sistem değil ama arşiv de değil; ayrı katman doğru sınıflandırma.
**Impact:** Vault index'i 5 sayfaya düştü, prototypes kökten ayrı yönetilecek.

## D3 — Indexer derinlik sabiti kaldırıldı
**Tarih:** 2026-05-19
**Status:** accepted
**Decision:** Eski `len(parts) != 3` kısıtı kaldırıldı. Indexer artık herhangi bir derinlikteki `index.html` veya tanımlı `.md` dosyalarını (`state.md`, `log.md`, `decisions.md`, `profile.md`) parse eder.
**Reason:** Agent ofis kontratı (`agents/{slug}/projects/{name}/...`) 4 seviye derinlik gerektiriyor; eski kısıt bunu olanaksız kılıyordu.
**Alternatives:** Agent ofislerini ayrı indeksle — reddedildi, tek index + scope filtresi daha temiz (K2/K4).
**Impact:** `tools/indexer.py` tam revize; `pages.json` her record'a `type`, `scope`, `depth`, `frontmatter`, `content_hash` alanları eklendi.

## D4 — Embedder Ollama-only + degraded fallback
**Tarih:** 2026-05-19
**Status:** accepted
**Decision:** Sentence-transformers backend kaldırıldı. Sadece Ollama (`all-minilm`). Ollama erişilemezse embedder ve `/api/semantic` 503 + kurulum mesajı döner; keyword search çalışmaya devam eder.
**Reason:** Sentence-transformers ~2 GB indir + 5 dk setup; Atlas "sıfır bağımlılık" hedefiyle çelişir.
**Alternatives:** Her ikisini de tut — reddedildi, iki backend bakım yükü; kullanıcı için Ollama tek komut.
**Impact:** `tools/embedder.py` ve `api/server.py:_embed_query` revize; CONFIG_FILE (`.atlas-embed.json`) sadece `ollamaUrl`/`ollamaModel` taşır.
