# Sentor — Security Model

## Threat Model

Sentor is a local-only desktop application. It does not send data to the internet except when you explicitly use web search or web fetch. The primary threat vectors are:

1. **Local network attackers** — other processes or web pages that try to abuse the local REST/MCP APIs
2. **Malicious vault pages** — crafted HTML that tries to escape the vault iframe into the host webview
3. **SSRF** — AI tools fetching internal network addresses on your behalf

## API Authentication

Both the REST API (`localhost:4242`) and the MCP HTTP server (`localhost:4244`) require a Bearer token:

```
Authorization: Bearer <token>
```

The token is generated with `secrets.token_hex(32)` (256 bits of entropy) on first launch and stored at:

```
~/.sentor/api-token
```

File permissions are set to `0600` (owner read/write only). The Tauri frontend reads the token via the OS keychain.

**Public endpoints** (no token required):
- `GET /api` — API info
- `GET /api/categories` — category list
- `GET /api/ide/status` — health check

All mutation endpoints (`POST`, `DELETE`) require the token regardless of path.

## CORS Policy

`Access-Control-Allow-Origin` is restricted to:
- `tauri://localhost` (Tauri production webview)
- `https://tauri.localhost` (Tauri WebKit variant)
- `http://localhost:1420` (Vite dev server)

Wildcard `*` is **not used**. This prevents browser-based cross-origin attacks.

## Content Security Policy (CSP)

The Tauri webview enforces:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self' http://127.0.0.1:* http://localhost:* https: ws://...;
frame-src asset: https:;
```

`'unsafe-inline'` for styles is required for Tailwind CSS runtime injection. Script injection from vault pages is blocked.

## Asset Protocol Scope

`asset://` serves files only from:
- `$HOME/Sentor/**`
- `$HOME/.sentor/**`
- `$APPDATA/sentor/**`

Arbitrary disk access via `asset://localhost/C:/Windows/...` is blocked.

## SSRF Protection

The `web_fetch` MCP tool blocks requests to:
- RFC 1918 ranges (10.x, 172.16.x, 192.168.x)
- Link-local (169.254.x — AWS/cloud metadata)
- Loopback (127.x)
- IPv6 private ranges

The scheme is restricted to `http` and `https` only.

## Path Traversal

`vault_write` validates `category` and `slug` against `^[a-z0-9][a-z0-9_-]*$` and resolves the full path, confirming it stays inside the vault directory before writing.

## Keyring

API keys for external AI providers (Anthropic, OpenAI, etc.) are stored in the OS native keychain via the `keyring` crate — not in config files or environment variables.

## Reporting Vulnerabilities

Please open a GitHub issue with the `security` label, or email the maintainer directly. Do not publicly disclose critical vulnerabilities before a fix is available.
