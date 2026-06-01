# Sentor — v0.6 Cleanup Sonrası Eleştiri Raporu

> Hazırlanma tarihi: 2026-05-21
> Kapsam: v0.6 "yayına hazırlık" cleanup'ı bittikten sonraki proje durumu
> Yöntem: Kanıta dayalı — sayılar, dosya boyutları, git geçmişi, gerçek config

---

## 1. Proje ne olmaya çalışıyor — hedef şaşması analizi

README üç iş tanımlıyor: AI ile cevap → vault'a yaz → web tara.

Gerçek dosya dağılımı:

| Modül | Dosya sayısı | Yorum |
|-------|--------------|-------|
| `ide/src/modules/ai/` | 51 | Üç ajanın + araçlarının yuvası |
| `ide/src/modules/canvas/` | 22 | "Üç iş"te bahsedilmeyen InfiniteCanvas/Agent Builder/blueprint |
| `ide/src/modules/editor/` | 16 | CodeMirror tabanlı IDE |
| `ide/src/modules/explorer/` | 12 | Dosya ağacı |
| `ide/src/modules/terminal/` | 8 | PTY + xterm |
| `ide/src/modules/browser/` | 7 | Web + Vault sekme tipleri |

Sentor aslında üç ayrı ürünün toplamı:

1. **"Second brain"** (vault + indexer + MCP) — tarifi sade, kodu temiz
2. **AI IDE** (editor + terminal + AI agents + code graph + autocomplete) — kapsam belli, yöntem net
3. **Visual agent builder** (Canvas, CanvasDock, blueprints, Sentor/Flowise, Orkestra) — README'de tek satır yok ama 22 dosya

**Sonuç:** Evet, **scope creep var.** Üçüncü kova bağımsız bir ürün gibi. Bir kullanıcı "second brain istiyorum" diye gelirse %30'unu kullanır; "agent builder istiyorum" diye gelirse %40 hazır ama sunum yok.

İsim de yardımcı olmuyor: `tauri.conf.json` "Sentor" diyor, README "Sentor" diyor, bundle short description "Local-first AI knowledge base and IDE" diyor — üç farklı kimlik. Üstelik `sentoros.dev` ünlü bir Windows debloater'ın markası; pratik bir karışıklık riski.

---

## 2. Yayına hazırlık

### İYİ DURUM (gerçekten production-grade)

| Alan | Kanıt |
|------|-------|
| Güvenlik tabanı | CSP sıkı (`script-src 'self' 'wasm-unsafe-eval'`), Bearer token auth, asset scope kısıtlı, `is_relative_to()` path guard, SO_REUSEADDR, atomic writes |
| Schema migration | `tools/migrate.py`, `pages.json` ve `embeddings.json` `schema_version`, stale index tespit + backup |
| Onboarding | 5 adımlı wizard: vault → provider (Ollama/LM Studio ping + `all-minilm` pull) → index build → SearXNG → done |
| Error boundary | React `ErrorBoundary` (root + app seviyesi), Rust `panic = "unwind"`, agent error UI'da banner |
| Tauri config | Updater pubkey gömülü, NSIS/MSI/deb/rpm/appimage hedefleri açık, asset scope makul |
| Lisans + 3rd-party notices | `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/security.md` var |
| Code review surface | Tool approval policy, read-before-edit invariant, sensitive path deny-list |
| CSS tasarım sistemi | Tailwind v4 + oklch + radix + shadcn, lean keyframes, motion runtime kaldırıldı |
| MCP iki yön | Queue-watcher (dış→IDE) + stdio server (dış→vault okuma) |

### EKSİK / RİSKLİ

| Sorun | Etki |
|-------|------|
| **30 günde 3 commit, 60+ unstaged değişiklik** | Geliştirme ile yayınlanabilir state arasında uçurum. `git log` bu seansın işini yansıtmıyor; bir release tag çıkarmaya hazır değil. |
| **Updater endpoints boş** (`"endpoints": []`) | Pubkey var ama Sentor yayınlandıktan sonra OTA güncelleme yapamaz. İlk release'den hemen sonra "update available" altyapısı çalışmaz. |
| **Windows-dışı gerçek test yok** | `#[cfg(target_os="windows")]` guard'lar var; ama macOS/Linux'ta açılış-vault-indeksleme-yazma akışı denenmemiş. `bundle.linux.deb.depends` doğru paketleri listeliyor ama doğrulanmamış. |
| **`webviewInstallMode: downloadBootstrapper`** | İlk açılışta WebView2 yoksa internet gerek. "Tamamen offline" mottosuyla çelişir; embed mode (`embedBootstrapper`) daha sağlam. |
| **Vault dogfooding zayıf** | 377KB, 16 sayfa — çoğu prototype/agent-state. Geliştirici kendi tool'unu kullanmıyor; ergonomi edge case'leri yakalanmamış. |
| **`.index/pages.js` git'te modified** | Bu üretilen artefakt; gitignore'a girmeliydi, sürekli diff şişiriyor. |
| **App.tsx hâlâ 1517 satır** | 5 hook çıkardık, ama JSX trunk parçalanmadı. Yeni bir kontribütör için entry barrier yüksek. |
| **`fileIcons.ts` 2681 satır** | Static lookup table — bundle'da ham, code-split yok. Lazy chunk yapılabilir. |
| **macOS code signing yok** | Apple Developer ID, notarization workflow yok → macOS'ta Gatekeeper engelleyecek. |
| **Voice "offline" değil** | Chromium SpeechRecognition kullanıyor; çoğu sistemde bulut. "All offline" iddiasının istisnası. |
| **CI sadece type/build kontrol ediyor olabilir** | `ci.yml` (~2KB) küçük; e2e veya gerçek Tauri build test'i barındırması zor. Release imzasız çıkma riski. |
| **`ort` rc dependency** | Bu seans `tls-rustls` ekleyerek build'i tamir ettik, ama `ort 2.0.0-rc.12` hâlâ release candidate. Stable çıkana kadar break-prone bir blast radius. |

**Net cevap:** Yayına **soft beta** olarak çıkabilir — early adopter, Windows-only, internet'li (WebView2 bootstrapper için). v1.0 dağıtımı için 2-3 hafta polish + iki gerçek macOS/Linux duman testi gerek.

---

## 3. CSS desteği — projenin en güçlü teknik kası

`ide/src/styles/globals.css` 264 satır, üç katmanlı:

### Tabaka 1 — Modern temel

- Tailwind v4 (`@import "tailwindcss"`, `@theme inline`, `@custom-variant`)
- oklch renk uzayı (modern, geniş gamut, dark mode uyumlu)
- Inter Variable lokal gömülü (`@fontsource-variable/inter`) — Google Fonts yok, `system.md` kuralına sadık

### Tabaka 2 — Component lib

- `shadcn/tailwind.css` import — sidebar, card, popover, tooltip, kbd, ~30 component
- `radix-ui` 1.4.3 — accessible primitives
- `tw-animate-css` — `motion/react` yerini doldurdu, `animate-in fade-in slide-in-from-*` utility'leri
- `--radius-sm/md/lg/xl/2xl/3xl/4xl` — full token set tanımlı; **`4xl`/`3xl` atıl** (tasarım sistemi `rounded-lg`'yi yasaklıyor)

### Tabaka 3 — Sentor özel

- 2 custom keyframe (`launcherFadeIn`, `sentorShimmer`)
- 3 layout modu: default + `data-chrome="borderless"` (Linux custom chrome) + `data-layout="focused"` (overlay transparent)
- xterm.js + CodeMirror scrollbar override'ları (`!important` ile)
- Global scrollbar disable (Linux/Windows için, native chunky scrollbar yerine shadcn `<ScrollArea>`)

### Net değerlendirme

| Boyut | Durum |
|-------|-------|
| Token sistemi | ✓ Tamamı OKLCH, dark+light, sidebar varyantları |
| Component coverage | ✓ shadcn + radix = enterprise-grade |
| Animation strategy | ✓ Runtime kaldırıldı, CSS-only + utility classes |
| Cross-platform chrome | ✓ macOS native title bar, Linux/Windows custom borderless |
| Font strategy | ✓ Lokal Inter, system-ui fallback |
| Scrollbar discipline | ✓ Native gizlenip shadcn ScrollArea kullanılıyor |
| Design system tutarlılığı | ⚠ `interface-setup/.interface-design/system.md` "border-only, no shadows, 150ms transitions" diyor; shadcn defaults bu kurala uymuyor olabilir — manuel audit isteyen kısım |
| Atıl token | ⚠ `--radius-4xl/3xl/2xl/xl` kullanım sıfır olabilir; bundle'da ham CSS olarak yer kaplıyor |
| Bundle ağırlığı | ✓ motion gitti (~50KB), d3 named imports tree-shake olur, font Inter Variable tek family |

**Sonuç: CSS, bu projenin en olgun tarafı.** v0.6 cleanup'ta motion'ı kaldırıp tw-animate-css'e geçmek doğru bir kararmış. Tek pürüz: `system.md` tasarım sistemi belgesi ile shadcn varsayılan davranışı arasında küçük çatışmalar olabilir; bir görsel design audit ile 1-2 saatte temizlenir.

---

## 4. Tek paragraflık özet

Sentor teknik olarak iyi mühendislik (güvenlik, schema, MCP, CSS, Tauri config), zayıf ürün odaklılık (üç farklı kimlik aynı kod tabanında — second brain + IDE + agent builder). **Yayına yarı hazır:** Windows beta + power user için bugünden çıkabilir; gerçek 1.0 için commit hijyeni, macOS/Linux gerçek testi, updater endpoint, ve "Sentor mu, Studio mu, agent builder mı" sorusunun cevabı gerek. Geliştirici kendi tool'unu kullanmıyor (16 vault sayfa = dogfood yok) — en kritik açık.

---

## 5. Önerilen 1.0 yol haritası

| Öncelik | Madde | Süre |
|---------|-------|------|
| P0 | Commit hijyeni — bu seans değişikliklerini parçalanmış commit'lere böl, mevcut branş yayına hazır olsun | 1 saat |
| P0 | Updater endpoint URL → boş yerine GitHub release.json'a yönelt | 30 dk |
| P0 | macOS gerçek smoke test (kişisel cihaz veya GitHub Actions runner) | 2 saat |
| P1 | Ürün kimliği netleşsin: README başlığı + tauri productName tek isim, kapsam üç başlık | 1 saat |
| P1 | Vault dogfood — kendi notlarını Sentor içinde tut, en az 50+ sayfa | 1 hafta (sürekli) |
| P1 | NODE_SYSTEM_PLAN tamamla — N1 bitti, N1.5 sırada (canvas görsel dil) | 2-4 gün |
| P2 | App.tsx layout JSX split (`WorkspaceLayout` / `FocusedLayout`) | 1 gün |
| P2 | macOS code signing + notarization workflow | 1 gün |
| P2 | `system.md` ↔ shadcn defaults audit + token temizlik | 2 saat |
| P3 | Linux click-through (X11 shape veya Wayland passthrough) | 1-2 gün |
| P3 | Vault undo snackbar UI | 2 saat |
| P3 | Headless code graph indexer → MCP server'a `code_search` eklenebilir | 2-3 gün |

*Rapor yazım tarihi: 2026-05-21 — v0.6 cleanup seansı sonu*
