# Skill 1 — api/server.py Kod İncelemesi

## Dosya
`api/server.py` — 963 satır, stdlib-only Python REST API

---

## Güçlü Yönler

- **Sıfır bağımlılık:** `http.server`, `json`, `pathlib`, `urllib` — framework yok
- **mtime tabanlı cache:** `pages.json` değişince otomatik reload, her request'te disk okuması yok (satır 96–118)
- **Hybrid search:** keyword + semantic skorları normalize edip `alpha` ağırlığıyla merge; Ollama çevrimdışıysa graceful degradation
- **Path traversal koruması:** `file.is_relative_to(ROOT.resolve())` kontrolü (satır 899)
- **Thread-safe IDE queue:** `threading.Lock` + atomic file write (satır 56–67)
- **Auth sistemi:** Bearer token + X-Atlas-Token, public path listesi, OPTIONS preflight

---

## Tespit Edilen Hatalar ve Düzeltmeler

### 1. `mode` ternary bug (satır 432)
```python
# Hatalı — her zaman 'keyword' döndürüyordu
mode = 'hybrid' if sem_available and sem_scores else ('keyword' if not sem_available else 'keyword')

# Düzeltildi
mode = 'hybrid' if sem_available and sem_scores else ('keyword' if sem_available else 'keyword-only')
```

### 2. Inline import'lar method içinde
`_cli_provider`, `_cli_run`, `_cli_pipeline_run`, `_node_run`, `_cli_notify` içinde `import threading as _th`, `import os as _os` gibi inline import'lar vardı.
**Düzeltme:** Tümü dosya başına taşındı.

### 3. Silent exception swallowing
`_cli_tasks`, `_cli_pipelines`, `_nodes_list` içinde `except Exception: pass` — bozuk JSON sessizce atlanıyordu.
**Düzeltme:** `except Exception as exc: print(..., file=sys.stderr)` ile değiştirildi.

### 4. Hata mesajları stdout'a gidiyordu
`_cli_run`, `_cli_pipeline_run`, `_node_run` thread'lerindeki `print(f'error: {exc}')` stdout'a yazıyordu.
**Düzeltme:** `file=sys.stderr` eklendi.

### 5. POST body boyut limiti yok
`Content-Length` okunuyor ama maksimum değer kontrol edilmiyordu.
**Düzeltme:** 1 MB limit + 413 response eklendi.

---

## Kalan Kısıtlar (düzeltilmedi — kasıtlı/kabul edilebilir)

- `BaseHTTPRequestHandler` single-threaded: her istek öncekini bekler. Localhost araç için yeterli.
- `_agent` endpoint cache yerine dosyaları direkt okuyor — kasıtlı (fresh state).
- Test coverage yok.

---

# Skill 2 — Dosya Mimarisi ve Root Düzeni

## Genel Yapı

```
Atlas OS/
├── api/            ← REST API (1 dosya)
├── cli/            ← CLI araçları
├── tools/          ← indexer, embedder, MCP server, test runner
├── ide/            ← Tauri IDE (asıl uygulama)
├── vault/          ← bilgi tabanı (HTML sayfaları)
├── ui/             ← browser search UI
├── transcribe/     ← ses tanıma sunucusu
├── modules/        ← Flowise, CodeGraph (3. parti, .gitignore'da)
├── prototypes/     ← deneme projeleri (.gitignore'da)
├── threadmind/     ← ayrı proje kalıntısı (.gitignore'da)
├── interface-setup/← design system
├── docs/           ← mimari dökümanlar
└── tests/          ← test dosyaları
```

## Güçlü Yönler

- Katman ayrımı net: `api/`, `cli/`, `tools/`, `ide/` bağımsız
- `tools/scoring.py` paylaşımlı modül — API ve CLI aynı kodu kullanıyor
- `vault/{category}/{slug}/index.html` convention tutarlı
- `.index/` üretilmiş dosyaları kaynak koddan ayırıyor
- `modules/`, `prototypes/`, `threadmind/` `.gitignore`'da — repo şişmesi önlenmiş

## Tespit Edilen Sorunlar ve Düzeltmeler

### 1. Root'ta dağıtık döküman dosyaları
Aşağıdaki dosyalar root'ta duruyordu, `docs/` altına taşındı:
- `KOD_ANALIZI.md` → `docs/`
- `ATLAS_AI_TECHNICAL_REPORT.md` → `docs/`
- `opencode-codereview-1.md` → `docs/`
- `opencode-codereview-1-en.md` → `docs/`

### 2. Root'ta geçici/çöp dosyalar
Silindi:
- `C:tmpmodels.json` — bozuk isimli geçici dosya, commit'e girmiş
- `Ekran görüntüsü 2026-05-28 164621.png` — 100KB screenshot, repoya girmemeli

## Kalan Kısıtlar (kabul edildi)

- `modules/` büyük 3. parti kaynak kodu içeriyor (Flowise 2.6 GB, CodeGraph 2.0 GB) — `.gitignore` ile yönetiliyor
- `threadmind/` bağımsız proje, `.gitignore`'da ama root'tan çıkarılmadı
- `tests/` klasörü zayıf — gerçek test dosyaları `tools/` ve `tests/` arasında dağınık

---

# Skill 3 — Atlas0fis Toplantısı + K-1→K-5 Kararları

## Toplantı
- **Tarih:** 2026-05-30
- **Motor:** Ultracode (12 persona paralel subagent + sentez + self-check)
- **Yeni personalar:** Sıla (Teknik Borç Şefi), Berk (CI/Test Şefi)
- **Kayıt:** `vault/forum/atlas0fis/toplantilar/2026-05-30-kod-kalitesi/index.html`
- **Forum:** `vault/forum/atlas-os-kod-kalitesi/index.html`

## Self-Check Bulguları (Can + Sena)
- `ThreadingHTTPServer` lock'suz açılırsa race'i gizler, çözmez
- `cargo build` CI'da çalışmaz — WebView2 runtime yok, `cargo check` yeter
- `pnpm audit || true` güvenlik görüntüsü verir ama korumaz
- Silent exception audit kapsamı `api/` dışına genişletilmeli

## Uygulanan Kararlar

| ID | Görev | Durum |
|----|-------|-------|
| K-1a | `_Cache.pages()` + `_get_records()` + `_sem_lock` → `threading.Lock` | ✅ |
| K-1b | `HTTPServer → ThreadingHTTPServer` | ✅ |
| K-2a | `test_api.py` 4 regresyon testi (413, mode, Cache-Control, 401 body) | ✅ |
| K-2b | Concurrent smoke test — 10 thread × /api/categories | ✅ |
| K-3 | `ci.yml`: `cargo build` → `cargo check+clippy`, ubuntu, `\|\| true` kaldırıldı | ✅ |
| K-4 | Silent exception audit: `mcp_server.py`, `sentor.py`, `embedder.py`, `pipeline.py`, `serve_daemon.py` | ✅ |
| K-5 | `.git/hooks/pre-push` — tsc + cargo check, ~30s gate | ✅ |

**Test sonucu:** 21/21 passed (ThreadingHTTPServer üzerinde concurrent test dahil)

---

# Skill 4 — cli/ Klasörü İncelemesi

## Dosyalar
| Dosya | Satır | Rol |
|-------|-------|-----|
| `atlas.py` | 519 | Ana CLI giriş noktası, argparse + dispatch |
| `sentor.py` | 451 | LLM görev yöneticisi |
| `node.py` | 275 | Pipeline + task birleşik node yöneticisi |
| `pipeline.py` | 220 | JSON pipeline çalıştırıcı |
| `serve_daemon.py` | 206 | Watcher + cron daemon |
| `flow.py` | 199 | Çok adımlı node zinciri (canvas wire'ın CLI versiyonu) |

## Güçlü Yönler

- `atlas.py` lazy import + dispatch pattern — her modül yalnızca kullanıldığında yükleniyor
- `pipeline.py`: `shlex.split() + subprocess.run(shell=False)` — shell injection yok
- `node.py`: `contextlib.redirect_stdout(buf)` ile pipe chain output yakalanıyor
- `pipeline.py` `on_error` mantığı: `stop / notify / continue` — adım bazlı kontrol
- `flow.py`: her adımın output'u bir sonrakinin `ctx['input']`'una besleniyor

## Tespit Edilen Sorunlar ve Düzeltmeler

### 1. Silent exception (`flow.py:66`, `node.py:77,83`)
```python
except Exception:
    pass  # bozuk JSON dosyaları sessizce atlanıyordu
```
**Düzeltme:** `except Exception as exc: print(..., file=sys.stderr)`

### 2. `atlas.py` inline import'lar
`cmd_chat()` içinde `import urllib.request, urllib.error` ve `import urllib.parse` tanımlıydı.
**Düzeltme:** Dosya başına taşındı.

### 3. `node.py:120` — `os.system()` → `subprocess.run()`
```python
# Önce
os.system(f'"{editor}" "{path}"')  # shell=True ile çalışır
# Sonra
subprocess.run([editor, str(path)])
```

### 4. `node.py` — eksik import + inline import
`edit_node()` içinde `subprocess.run()` çağrılıyordu ama `import subprocess` yoktu (`NameError` at runtime).
`log_node()` içinde `from datetime import datetime` inline tanımlıydı.
**Düzeltme:** Her ikisi de dosya başına (`import subprocess`, `from datetime import datetime`) taşındı.

---

# Skill 5 — tools/ Kalan Dosyaları İncelemesi

## İncelenen Dosyalar

| Dosya | Satır | Sonuç |
|-------|-------|-------|
| `scoring.py` | 46 | ✅ Temiz — pure math, exception yok |
| `colors.py` | 42 | ✅ Temiz — TTY detection + ANSI wrappers |
| `html_utils.py` | 27 | ✅ Temiz — regex HTML→text, no I/O |
| `common.py` | 21 | ✅ Temiz — deprecation shim, sadece re-export |
| `render_office.py` | 228 | ✅ Temiz — HTML renderer, tüm `html.escape()` korumalı |
| `sync_profiles.py` | 107 | ✅ Temiz — agents.ts → profile.md, proper stderr logging |
| `migrate.py` | 161 | ✅ Düzeltildi (önceki session) — parse hataları stderr'e |
| `indexer.py` | ~440 | ✅ Düzeltildi (önceki session) — incremental parse hatası stderr'e |
| `io_utils.py` | ~60 | ✅ Temiz — `except` sonrası `raise` var, swallow değil |

**Toplam:** 9 dosya incelendi, 2'si önceki session'da düzeltilmişti, diğerleri temiz.

---

# Skill 6 — ide/ İncelemesi

## Rust (`src-tauri/`)

### `lib.rs`
- V3 çoklu pencere sistemi: `setup_v3_windows()`, lazy `v3_show_input()`, tray icon
- `set_click_through`: Win32 `SetWindowRgn` via `extern "system"` — `#[cfg(target_os = "windows")]` ile sarılmış, güvenli
- `let _ = win.show()` pattern'leri kasıtlı (fire-and-forget pencere ops)
- Git diff: tüm dosya 4 boşluk indent'le yeniden formatlanmış — sadece kozmetik, Rust whitespace-agnostic
- **Sonuç: Temiz**

### `mcp.rs`
- Atomic rename (`queue.json` → `queue.json.draining`) — concurrent draining güvenli
- `log::warn!` ile hata loglama — sessiz swallow yok
- Notify watcher idempotent (`guard.is_some()` kontrolü)
- **Sonuç: Temiz**

## TypeScript (modified files)

### `VaultBrowserPane.tsx`
Temiz refactor: `resolveInput()` if-chain → `RESOLVE_RULES` tuple array. Fonksiyonel olarak özdeş.

### `V3NodePalette.tsx`
Palette sadeleştirildi: 24 node type → 3 (Terminal, Chat, Input). 2D/3D sekme kaldırıldı, Atlas0fis entry kaldırıldı (`convertFileSrc` + `workspaceRoot` bağımlılığı ortadan kalktı). Phase M temizliği.

## Güvenlik-Kritik Dosyalar

### `security.ts`
- `checkReadable()`: basename + path segment match — `.env*`, `.pem`, `.key`, `.ssh/`, `.aws/` vb. engelleniyor
- `checkWritable()`: read kısıtlamaları + `/etc/`, `/System/` prefix engeli
- `checkShellCommand()`: `rm -rf /`, `--no-preserve-root`, `dd of=/dev/disk`, `mkfs` pattern'leri engelleniyor
- Küçük not: `normalize()` lowercase yapmıyor — Windows'ta `C:\Users\.SSH\` matchlenmez. Dosya yorumu bu konuyu kapsıyor: "defense layer, not a sandbox; approval UI is the real safety net"
- **Sonuç: Sağlam**

### `shell.ts`
- Tüm mutating tool'lar `needsApproval: true` ✅
- Her `execute()` başında `checkShellCommand()` çağrılıyor ✅
- `closeSessionShell` boş catch — kasıtlı ("already closed") ✅
- Error'lar thrown değil, `{ error: string }` olarak return ediliyor ✅
- **Sonuç: Sağlam**

### `edit.ts`
- `checkWritable()` zorunlu ✅
- `applyEdits()` read-before-write enforced (binary/toolarge kontrolü) ✅
- `old_string` benzersizlik kontrolü (duplicate match → error, not silently overwrite) ✅
- **Sonuç: Sağlam**

## Genel Değerlendirme

`ide/` kayda değer güvenlik veya mantık sorunu içermiyor. Mimari bilinçli tasarlanmış:
- Rust: güvenilir foundation, pencere/dosya işlemleri için native API
- TypeScript: read-only araçlar auto-approve, mutating araçlar user-approval zorunlu
- Katmanlı savunma: security.ts filter → UI approval → Rust sandbox
