# Atlas OS — Release Checklist

Complete every item before tagging a new release.

## 1 — Code Quality

- [ ] `cd ide && npx tsc --noEmit` → 0 errors
- [ ] `cd ide/src-tauri && cargo clippy -- -D warnings` → 0 warnings
- [ ] `cd ide/src-tauri && cargo fmt --check` → no formatting issues
- [ ] `cd ide/src-tauri && cargo test` → all tests pass
- [ ] `python tests/test_api.py` → all tests pass (including new auth tests)

## 2 — Security

- [ ] `curl http://localhost:4242/api/pages` (no auth header) → `401 Unauthorised`
- [ ] `curl -H "Authorization: Bearer $(cat ~/.atlas/api-token)" http://localhost:4242/api/pages` → 200
- [ ] `curl http://localhost:4242/api/categories` (no auth) → 200 (public endpoint)
- [ ] Open a malicious page in the Web tab that tries `fetch('http://localhost:4242/api/pages')` → network error (CORS blocked)
- [ ] Check CSP in DevTools → no CSP violations in console

## 3 — First-Run Experience

- [ ] On a clean system (no `~/.atlas/` directory), launch Atlas OS
- [ ] Onboarding wizard appears automatically
- [ ] Wizard correctly detects Ollama / LM Studio as present/absent
- [ ] "Download Ollama" button opens browser (doesn't crash)
- [ ] Completing the wizard sets `onboarded: true` — relaunch doesn't show wizard again
- [ ] Settings → "Run setup again" re-opens the wizard

## 4 — Core Features

- [ ] Vault Home opens on first tab, search works
- [ ] AI Chat responds (with any local provider)
- [ ] Atlas-Maker writes a vault page → page appears in search
- [ ] Vault browser tab opens a vault page via `asset://`
- [ ] Web tab opens `https://example.com`
- [ ] Graph view (`Ctrl+Shift+G`) renders vault nodes
- [ ] Terminal tab runs a command
- [ ] Editor tab opens and saves a file

## 5 — Build & Installer

- [ ] `cd ide && pnpm tauri build` succeeds
- [ ] NSIS installer (.exe) produced in `target/release/bundle/nsis/`
- [ ] Install on a clean Windows VM: no SmartScreen block (or if unsigned, document the workaround)
- [ ] Installer creates Desktop shortcut
- [ ] Installer creates Start Menu entry
- [ ] Uninstaller works (Settings → Apps → Atlas OS Studio → Uninstall)

## 6 — Updater (if signing configured)

- [ ] `~/.atlas/api-token` exists after install
- [ ] `tauri.conf.json` updater endpoint points to correct GitHub repo
- [ ] Simulate update: deploy v+1 release, launch old version → update notification appears

## 7 — Migration

- [ ] `python tools/migrate.py --check` on fresh vault → exits 0 (no migration needed)
- [ ] Downgrade pages.json to `schema_version: 1` → `migrate.py` detects and re-indexes
- [ ] Backup appears in `.index/backups/` after migration

## 8 — Release Artifacts

- [ ] `LICENSE` file present in repo root
- [ ] `THIRD_PARTY_NOTICES.md` up to date
- [ ] `CHANGELOG.md` updated with new version entry
- [ ] GitHub Release draft created with release notes
- [ ] NSIS installer uploaded to release

## 9 — Tagging

```bash
git tag -a v0.X.Y -m "Release v0.X.Y"
git push origin v0.X.Y
```

CI release workflow triggers automatically on tag push.
