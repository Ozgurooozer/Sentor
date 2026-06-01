# Sentor — AI Agents

Sentor ships with five built-in agents. Each has a specific role and a set of tools.

## Vault Agent (default)

**Purpose:** Research assistant for your personal knowledge base.

**What it does:**
- Searches the vault for relevant pages (`vault_search`)
- Reads full page content (`vault_read`)
- Fetches web pages for context (`web_fetch`)
- Searches the web (`web_search`)

**Best for:** "What do I know about X?", "Summarise my notes on Y", "Find pages related to Z"

---

## Sentor-Maker

**Purpose:** Writes new vault pages from conversations, voice notes, or research.

**What it does:**
- Creates and updates vault HTML pages (`vault_write`)
- Triggers re-indexing automatically after writing
- Follows the vault HTML template structure

**Best for:** "Create a page about X", "Write a meeting note for today", voice-to-vault transcription

**Tip:** After Sentor-Maker writes a page, the vault re-indexes automatically. You can search for it immediately.

---

## Coder

**Purpose:** Edits source files in your workspace.

**What it does:**
- Reads files (`read_file`)
- Writes and edits files (`write_file`, `edit_file`, `multi_edit`)
- Runs shell commands (`bash_run`)
- Searches with grep and glob

**Best for:** Code refactoring, writing scripts, editing config files, fixing bugs

**Safety:** Mutating tools (write, edit, bash) require explicit user approval before executing.

---

## Sentor

**Purpose:** Orchestrates Flowise visual-agent flows.

**What it does:**
- Lists available Flowise flows (`sentor_list_flows`)
- Runs a selected flow with a prompt (`sentor_run_flow`)
- Auto-starts the Flowise server if it isn't running

**Prerequisite:** Set the Sentor path in Settings → Sentor before using this agent.

---

## Orkestra

**Purpose:** Meta-agent that spawns and coordinates other agents.

**What it does:**
- Invokes sub-agents (`agent_invoke`, `agent_spawn`)
- Reads and writes canvas state (`canvas_read_state`)
- Saves agent blueprints (`blueprint_save`)

**Best for:** Complex multi-step tasks that need more than one agent working together.

---

## Agent Offices

Each agent has a "vault office" — a set of vault pages under `vault/agents/{agent-name}/` that store the agent's memory, logs, and configuration. The agent reads these on startup (Self-RAG) to pick up context from previous sessions.

To open an agent's office: `Ctrl+Shift+A` → select agent → click **Office**.

## Slash Commands

Type `/` in the chat input to see available slash commands:

| Command | Description |
|---|---|
| `/search {query}` | Instant vault search without an LLM turn |
| `/decision {text}` | Log a decision to the active agent's log |
| `/meeting {topic}` | Generate a meeting note |
| `/voice {transcript}` | Send voice transcript to Sentor-Maker |
