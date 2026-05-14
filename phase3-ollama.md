# Atlas OS — Phase 3: Ollama Entegrasyonu

## Hedef
Yerel AI agent'ların (Qwen2.5-Coder vb.) Atlas OS bilgi tabanını
`search_knowledge` ve `get_page` tool'ları ile sorgulaması.

---

## 3.1 Ollama Agent Test Script
**Dosya:** `tools/test_ollama.py`

**Claude Code prompt:**
```
Build tools/test_ollama.py

Requirements:
- Starts atlas serve in a subprocess (port 4242)
- Calls Ollama API at localhost:11434 with model qwen2.5-coder
- Sends: "What does the html-quality page say about semantic HTML?"
- Includes search_knowledge and get_page as tools (from ollama-tools.json)
- Runs the full tool-use loop:
  1. Ollama calls search_knowledge
  2. Script executes search via HTTP to atlas API
  3. Returns result to Ollama
  4. Ollama calls get_page
  5. Script fetches page text
  6. Returns to Ollama
  7. Ollama produces final answer
- Prints each step with [STEP N] prefix
- Single dep: pip install ollama

Test: python tools/test_ollama.py
Pass criteria: Ollama answers using Atlas content, not training data
```

---

## 3.2 Reusable Tool Wrapper
**Dosya:** `tools/atlas_tool.py`

**Claude Code prompt:**
```
Build tools/atlas_tool.py

Class AtlasTool:
- Connects to atlas API at configurable host:port (default localhost:4242)
- execute(tool_name, tool_args) → dict ready for Ollama tool_result
- Handles: search_knowledge, get_page
- Raises AtlasToolError if API unreachable
- Import only, no CLI

Refactor test_ollama.py to use AtlasTool.
Existing test must still pass after refactor.
```

---

## Test Kriterleri

- [ ] `python tools/test_api.py` → 4/4 PASS
- [ ] `python tools/test_ollama.py` → Ollama Atlas içeriğinden yanıt veriyor
- [ ] `atlas serve` + `atlas search` aynı anda çalışıyor
- [ ] Cache stale data dönmüyor (mtime check)
