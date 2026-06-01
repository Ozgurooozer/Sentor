# Changelog

All notable changes to Sentor are documented here.

## [Unreleased] — v0.7.0

### Security
- Added Bearer token authentication to REST API (port 4242) and MCP server (port 4244)
- Token generated with 256 bits of entropy on first launch; stored at `~/.sentor/api-token` (mode 600)
- Restricted `Access-Control-Allow-Origin` from wildcard `*` to Tauri webview origins
- Enabled Tauri Content Security Policy (CSP) — disables untrusted script execution
- Scoped `asset://` protocol to vault and app directories only (was `**`)
- Added SSRF protection to `web_fetch` MCP tool (blocks RFC 1918, link-local, loopback)
- Added path traversal protection to `vault_write` MCP tool (slug regex + resolve check)
- Atomic writes for `.mcp-queue.json` and `.index/*.json` (write-tmp + rename)
- `panic = "unwind"` in Rust release profile (was `abort`) — prevents process crash on thread failure

### New Features
- **Onboarding wizard** — first-run wizard detects LM Studio/Ollama/SearXNG, guides vault setup
- **Schema versioning** — `pages.json` carries `schema_version: 2`, `embeddings.json` carries `schema_version: 1`
- **Migration runner** — `tools/migrate.py` detects stale indexes and re-runs indexer/embedder with backup
- **Index backups** — migration and re-index create timestamped backup in `.index/backups/` (keeps last 3)
- **React ErrorBoundary** — global + per-app boundary catches render errors; shows "Try again" / "Copy error" UI
- **CI workflow** — `.github/workflows/ci.yml` (TypeScript + Rust + Python tests)
- **Release workflow** — `.github/workflows/release.yml` (tag push → NSIS build → GitHub Release)
- **docs/** — security model, keyboard shortcuts, agents guide, release checklist

### Fixes
- Settings window `always_on_top` changed to `false` (was blocking multi-monitor workflows)
- Hardcoded `c:\Sentor` fallback paths extracted to `DEFAULT_WORKSPACE` constant
- `npm install` → `pnpm install` in README Quick Start
- Updater endpoint now empty (was pointing to non-existent GitHub repo `sentor-ide/sentor`)

### Legal
- Added `LICENSE` file (MIT)
- Added `ide/package.json` `"license": "MIT"` field
- Added `THIRD_PARTY_NOTICES.md`

## [0.6.1] — 2026-05-20

### Features
- Sentor branding (renamed from Sentor IDE)
- Build versioning system (`sentor.bat → [B] → [V]`)
- Sentor Instance canvas panel — embed other vault UIs via iframe
- Launcher screen with workspace selector and build cards
- MCP server (`mcp/server.py`) with 13 tools and HTTP+stdio transports
- REST IDE Control API on port 4242

## [0.6.0] — 2026-05 (Phase 0–F complete)

### Features
- Phase 0–E: Fast Refresh fixes, web tools, agent consolidation, auto re-index, Browser tabs, Vault Home
- Phase F: BacklinkPanel, Mermaid preview, browser history, graph view, voice input, Canvas UX
- Vault Agent Roadmap (Faz 0–7): agent offices, Self-RAG, slash commands, Sentor integration
- Agent Builder (A1–A9): canvas node editor, blueprint save/import, Orkestra agent
- Focused Overlay Mode: transparent window + click-through
