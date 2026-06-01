#!/usr/bin/env node
/**
 * Sentor OS — CodeGraph Bridge
 * Node.js HTTP server (port 4245) that wraps the CodeGraph library.
 * Gives the Coder agent code intelligence: search, callers, callees, impact.
 *
 * Start: node tools/codegraph_bridge.js [workspace-root] [--port 4245]
 * The IDE starts this automatically via shell_bg_spawn when Coder is active.
 */

import { createServer } from 'http';
import { join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CODEGRAPH_DIST = pathToFileURL(resolve(__dirname, '../modules/codegraph-0.7.10/dist/index.js')).href;

// ── Args ────────────────────────────────────────────────────────────────────

let workspaceRoot = process.argv[2] || process.cwd();
let port = 4245;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    port = parseInt(process.argv[i + 1], 10);
    i++;
  } else if (!process.argv[i].startsWith('--')) {
    workspaceRoot = process.argv[i];
  }
}
workspaceRoot = resolve(workspaceRoot);

// ── CodeGraph init ───────────────────────────────────────────────────────────

let cg = null;
let cgError = null;
let cgStatus = 'initializing'; // initializing | indexing | ready | error

async function initCodeGraph() {
  try {
    const mod = await import(CODEGRAPH_DIST);
    const CodeGraph = mod.CodeGraph;
    const isInitialized = mod.isInitialized;

    const initialized = await isInitialized(workspaceRoot);
    cgStatus = 'indexing';

    if (!initialized) {
      log(`No .codegraph/ found — initializing ${workspaceRoot} ...`);
      cg = await CodeGraph.init(workspaceRoot);
      log('Indexing files (first run — this may take a moment)...');
      await cg.indexAll();
      log('Index complete.');
    } else {
      log(`Opening existing index at ${workspaceRoot}`);
      cg = await CodeGraph.open(workspaceRoot);
      await cg.sync();
    }

    cgStatus = 'ready';
    const stats = await cg.getStats?.() ?? {};
    log(`CodeGraph ready — ${stats.nodeCount ?? '?'} symbols, ${stats.fileCount ?? '?'} files`);
  } catch (err) {
    cgError = String(err);
    cgStatus = 'error';
    log(`CodeGraph init failed: ${err}`);
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function err(res, msg, status = 500) {
  json(res, { error: msg }, status);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

function notReady(res) {
  return err(res, `CodeGraph ${cgStatus}${cgError ? ': ' + cgError : ''}. Retry shortly.`, 503);
}

function log(msg) {
  process.stderr.write(`[codegraph-bridge] ${msg}\n`);
}

// ── Truncate large outputs ───────────────────────────────────────────────────

function truncate(obj, maxChars = 12000) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n...[truncated ${s.length - maxChars} chars]`;
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleStatus(req, res) {
  if (cgStatus !== 'ready') {
    json(res, { status: cgStatus, error: cgError, root: workspaceRoot });
    return;
  }
  try {
    const stats = await cg.getStats?.() ?? {};
    json(res, { status: 'ready', root: workspaceRoot, ...stats });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleSearch(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const query = body.query || body.q || '';
  const limit = Math.min(parseInt(body.limit ?? '20', 10), 50);
  const kind   = body.kind ?? undefined;
  if (!query) return err(res, 'query required', 400);
  try {
    const results = await cg.searchNodes(query, { limit, kind });
    json(res, { results: results ?? [], query });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleContext(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const task = body.task || body.query || '';
  if (!task) return err(res, 'task required', 400);
  const maxNodes = parseInt(body.maxNodes ?? '20', 10);
  try {
    const ctx = await cg.buildContext({ task, maxNodes, includeCode: body.includeCode !== false });
    const text = typeof ctx === 'string' ? ctx : ctx?.markdown ?? ctx?.text ?? JSON.stringify(ctx);
    json(res, { context: truncate(text), task });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleExplore(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const query = body.query || '';
  const maxFiles = parseInt(body.maxFiles ?? '10', 10);
  if (!query) return err(res, 'query required', 400);
  try {
    // findRelevantContext is the codegraph_explore equivalent
    const ctx = await cg.findRelevantContext?.({ query, maxFiles })
      ?? await cg.buildContext({ task: query, maxNodes: 25, includeCode: true });
    const text = typeof ctx === 'string' ? ctx : ctx?.markdown ?? ctx?.text ?? JSON.stringify(ctx);
    json(res, { context: truncate(text), query });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleCallers(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const symbol = body.symbol || '';
  const limit  = Math.min(parseInt(body.limit ?? '20', 10), 50);
  if (!symbol) return err(res, 'symbol required', 400);
  try {
    const results = await cg.getCallers(symbol, { limit });
    json(res, { callers: results ?? [], symbol });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleCallees(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const symbol = body.symbol || '';
  const limit  = Math.min(parseInt(body.limit ?? '20', 10), 50);
  if (!symbol) return err(res, 'symbol required', 400);
  try {
    const results = await cg.getCallees(symbol, { limit });
    json(res, { callees: results ?? [], symbol });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleImpact(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const symbol = body.symbol || '';
  const depth  = Math.min(parseInt(body.depth ?? '2', 10), 4);
  if (!symbol) return err(res, 'symbol required', 400);
  try {
    const result = await cg.getImpactRadius(symbol, { depth });
    json(res, { impact: result, symbol });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleNode(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const symbol = body.symbol || '';
  if (!symbol) return err(res, 'symbol required', 400);
  try {
    const results = await cg.searchNodes(symbol, { limit: 5 });
    const node = results?.[0] ?? null;
    json(res, { node, symbol });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleFiles(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  try {
    const files = await cg.getFiles?.({ path: body.path, pattern: body.pattern }) ?? [];
    json(res, { files });
  } catch (e) {
    err(res, String(e));
  }
}

async function handleIndex(req, res) {
  if (!cg) return notReady(res);
  cgStatus = 'indexing';
  cg.indexAll()
    .then(() => { cgStatus = 'ready'; })
    .catch((e) => { cgStatus = 'error'; cgError = String(e); });
  json(res, { ok: true, status: 'indexing' });
}

async function handleGraph(req, res) {
  if (cgStatus !== 'ready') return notReady(res);
  const body = await readBody(req);
  const limit = Math.min(parseInt(body.limit ?? '200', 10), 500);
  try {
    const nodes = await cg.searchNodes('', { limit }) ?? [];
    // Build edge list from callers of each node (sample)
    const graphNodes = nodes.map((n) => ({
      id: n.id ?? n.qualifiedName ?? n.name,
      name: n.name,
      kind: n.kind,
      file: n.filePath ?? n.file,
      line: n.startLine ?? n.line,
    }));
    json(res, { nodes: graphNodes, total: graphNodes.length });
  } catch (e) {
    err(res, String(e));
  }
}

// ── Request router ───────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  const path = req.url?.split('?')[0] ?? '/';

  if (req.method === 'GET') {
    if (path === '/' || path === '/status') return handleStatus(req, res);
    return err(res, `No GET endpoint: ${path}`, 404);
  }

  if (req.method === 'POST') {
    if (path === '/search')  return handleSearch(req, res);
    if (path === '/context') return handleContext(req, res);
    if (path === '/explore') return handleExplore(req, res);
    if (path === '/callers') return handleCallers(req, res);
    if (path === '/callees') return handleCallees(req, res);
    if (path === '/impact')  return handleImpact(req, res);
    if (path === '/node')    return handleNode(req, res);
    if (path === '/files')   return handleFiles(req, res);
    if (path === '/index')   return handleIndex(req, res);
    if (path === '/graph')   return handleGraph(req, res);
    return err(res, `No endpoint: ${path}`, 404);
  }

  err(res, 'Method not allowed', 405);
});

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(port, '127.0.0.1', () => {
  log(`Listening on http://localhost:${port}`);
  log(`Workspace: ${workspaceRoot}`);
  log('Endpoints: /status /search /context /explore /callers /callees /impact /node /files /index /graph');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`Port ${port} already in use — another bridge instance may be running`);
    process.exit(0);
  }
  log(`Server error: ${e}`);
});

// Init async after server is listening
void initCodeGraph();
