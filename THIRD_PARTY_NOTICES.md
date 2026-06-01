# Third-Party Notices

Sentor includes third-party software. This file lists major dependencies and their licenses.

## How to regenerate this file

```bash
# npm/pnpm packages
cd ide && npx license-checker --summary > ../THIRD_PARTY_NOTICES_npm.txt

# Rust crates
cd ide/src-tauri && cargo install cargo-about && cargo about generate about.hbs > ../../THIRD_PARTY_NOTICES_cargo.txt
```

---

## Rust Dependencies

| Crate | Version | License |
|---|---|---|
| tauri | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-log | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-store | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-updater | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-dialog | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-os | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-process | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-autostart | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-opener | 2.x | MIT OR Apache-2.0 |
| tauri-plugin-window-state | 2.x | MIT OR Apache-2.0 |
| tokio | 1.x | MIT |
| serde | 1.x | MIT OR Apache-2.0 |
| serde_json | 1.x | MIT OR Apache-2.0 |
| portable-pty | 0.9 | MIT |
| reqwest | 0.12 | MIT OR Apache-2.0 |
| scraper | 0.22 | MIT |
| walkdir | 2.x | MIT OR Apache-2.0 |
| notify | 6.x | MIT OR Apache-2.0 |
| regex | 1.x | MIT OR Apache-2.0 |
| keyring | 3.x | MIT OR Apache-2.0 |
| rusqlite | 0.31 | MIT |
| chrono | 0.4 | MIT OR Apache-2.0 |
| uuid | 1.x | MIT OR Apache-2.0 |
| ort | 2.x | MIT |
| ndarray | 0.15 | MIT OR Apache-2.0 |
| tokenizers | 0.19 | Apache-2.0 |
| log | 0.4 | MIT OR Apache-2.0 |
| base64 | 0.22 | MIT OR Apache-2.0 |
| dirs | 5.x | MIT OR Apache-2.0 |
| ignore | 0.4 | MIT OR Apache-2.0 |
| globset | 0.4 | MIT OR Apache-2.0 |
| windows-sys | 0.59 | MIT OR Apache-2.0 |

## npm/pnpm Dependencies (Frontend)

| Package | License |
|---|---|
| react | MIT |
| react-dom | MIT |
| vite | MIT |
| @tauri-apps/api | MIT OR Apache-2.0 |
| @tauri-apps/plugin-* | MIT OR Apache-2.0 |
| @ai-sdk/* (Vercel AI SDK) | Apache-2.0 |
| @codemirror/* | MIT |
| xterm | MIT |
| tailwindcss | MIT |
| zustand | MIT |
| mermaid | MIT |

## Python Standard Library

Python components (`api/server.py`, `cli/main.py`, `tools/*.py`) use only the Python standard library (PSF License).

---

> This file is manually maintained. Run the commands above to get a complete, auto-generated list.
