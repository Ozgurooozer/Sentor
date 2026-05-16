# Layout Restructure Plan — Atlas IDE

*Drafted 2026-05-15*

Big UI restructure: left icon bar, right-side chat column with agent tabs, input bar moves into chat column, mini agent-activity terminal under the chat.

---

## Current state (App.tsx:761–888)

- Horizontal `ResizablePanelGroup`:
  - **Sidebar** — FileExplorer
  - **Workspace** — Editor/Preview + `AiInputBar` (bottom, full-width)
  - **AtlasPanel** — vault browser (NOT chat)
- Chat is a floating "Vault" popup (`AiMiniWindow`)
- Control Panel lives in `Header` (top-right)

---

## Target layout

```
+---+------------------+----------------+
| L | File Explorer    | Agent Tabs     |
| e |                  | [Coder|Vault|+]|
| f +------------------+----------------+
| t | Editor / Preview | Chat messages  |
|   |                  +----------------+
| b |                  | Input bar      |
| a |                  +----------------+
| r |                  | Mini terminal  |
|   |                  | (agent activity|
|   |                  |  for this tab) |
+---+------------------+----------------+
```

---

## Phase 1 — Left Icon Bar (new)

- **New**: `ide/src/modules/layout/LeftIconBar.tsx`
- 4 icons top → bottom: **Files**, **Search**, **Agents**, **Control Panel**
- Spacer + Settings cog pinned to bottom
- 44–48 px wide vertical strip
- Design system: `border-r border-subtle`, hover = `bg-elevated`, active = `border-l-2 border-accent`, 150 ms transitions, no shadows
- Each button toggles its panel; tooltip on hover

## Phase 2 — Restructure App.tsx layout

- Wrap current `<ResizablePanelGroup>` in horizontal flex: `<LeftIconBar/>` + `<main className="flex-1">`
- FileExplorer panel becomes **collapsible** via left-bar Files button (`react-resizable-panels` collapse API — already in use)
- Pull "Control Panel" trigger out of `Header` → wired to left-bar button
- Search button opens existing workspace search (rebind from header)

## Phase 3 — Right Chat Column (replaces current AtlasPanel slot)

- **New**: `ide/src/modules/ai/components/ChatColumn.tsx`
- Internal vertical `ResizablePanelGroup`:
  1. **Agent Tabs** (~32 px) — fixed
  2. **Chat messages** — flex, resizable
  3. **Mini agent-activity terminal** (~140 px default) — resizable
- Current floating `AiMiniWindow` content becomes the chat-messages section here
- `AtlasPanel` (vault browser) moves to a tab inside this column OR to the left bar as its own icon

## Phase 4 — Move AiInputBar into ChatColumn

- Delete `AiInputBar` from `App.tsx:866` (workspace bottom)
- Mount above the mini terminal, inside ChatColumn — width = chat column only
- `AiInputBarConnect` ("Add API key" prompt) follows the same path — disappears when chat is closed

## Phase 5 — Agent tabs (separate session per agent)

- Extend `chatStore` to sessions model: `sessions: Map<id, ChatSession>`, `activeSessionId`
- One session per agent persona — switching tabs swaps messages + agent
- **New**: `AgentTabs.tsx` — pinned built-in agents (`coder`, `vault`, `architect`, …) + `+` to spawn ad-hoc
- Close-tab affordance
- Persistence via `LazyStore` (already used in `agents.ts`)

## Phase 6 — Mini agent-activity terminal

- **New**: `AgentActivityLog.tsx` — read-only log subscribed to active session's `onStep` (already wired into `createContextAwareTransport` deps at `transport.ts:57`)
- Entries format:
  ```
  [12:04:18] vault_search  query="kdv"            → 3 hits  (hybrid)
  [12:04:19] vault_read    muhasebe/kdv-ocak-2026 → 1.2 KB
  [12:04:21] edit          api/server.py:120-135  ✓
  ```
- Monospace, dim timestamps, accent on tool name, status chip
- Auto-scroll to latest; clear button in header

---

## Files touched

**New**
- `ide/src/modules/layout/LeftIconBar.tsx`
- `ide/src/modules/ai/components/ChatColumn.tsx`
- `ide/src/modules/ai/components/AgentTabs.tsx`
- `ide/src/modules/ai/components/AgentActivityLog.tsx`

**Modified**
- `ide/src/app/App.tsx` — layout JSX rewrite
- `ide/src/modules/ai/store/chatStore.ts` — sessions model
- `ide/src/modules/header/...` — drop Control Panel button
- `ide/src/modules/atlas/AtlasPanel.tsx` — location move (tab or left-bar icon)

**No Rust changes.**

---

## Out of scope (later if wanted)

- Persisting layout sizes across restarts (LazyStore — easy add)
- Drag-reorder agent tabs
- Cross-session chat history search

---

## Recommended order

1. **Now** — Phases 1–4 (left bar + structural move + input bar relocation). Single visible change, no chatStore changes yet. Single-session chat keeps working.
2. **Next** — Phase 5 (agent tabs — needs chatStore refactor, biggest risk).
3. **Last** — Phase 6 (activity terminal — pure additive UI on top of existing `onStep` hook).

---

## Verification

After Phases 1–4:
- Left bar visible, all 4 icons clickable, tooltips appear
- Files button toggles FileExplorer
- Control Panel button opens existing popup
- Chat column on right; chat input bar inside it, not full-width
- Existing chat (single session) still works end-to-end against Ollama / LM Studio
- TypeScript `npx tsc --noEmit` clean
- No regressions in Editor / Preview / Terminal panes

After Phase 5:
- Switching agent tabs swaps the visible conversation
- New tab creates a fresh session bound to the chosen agent persona
- Closing a tab does not affect other sessions

After Phase 6:
- Tool calls from the active session appear in the mini terminal within < 500 ms
- Switching tabs swaps the activity log to that session's history
- Clear button empties the log without affecting chat messages
