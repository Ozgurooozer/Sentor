import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { native } from "@/modules/ai/lib/native";
import { findPython } from "./vault";
import type { ToolContext } from "./context";

// Agent persona map — short ID → display name, avatar letter, CSS class
const PERSONAS: Record<string, { label: string; avatar: string; cls: string }> = {
  vault:        { label: "Vault Agent",  avatar: "V", cls: "av-vault"  },
  "atlas-maker":{ label: "Atlas-Maker", avatar: "A", cls: "av-maker"  },
  coder:        { label: "Coder",        avatar: "C", cls: "av-coder"  },
  sentor:       { label: "Sentor",       avatar: "S", cls: "av-sentor" },
  user:         { label: "User",         avatar: "U", cls: "av-user"   },
};

const CAT_LABELS: Record<string, string> = {
  arch: "Mimari", codeq: "Kod Kalitesi", feature: "Feature", dev: "Geliştirme", sohbet: "Sohbet",
};

const TAG_CSS: Record<string, string> = {
  arch:    "background:rgba(91,141,239,.1);color:#5b8def;border:1px solid rgba(91,141,239,.2)",
  codeq:   "background:rgba(76,175,125,.1);color:#4caf7d;border:1px solid rgba(76,175,125,.2)",
  feature: "background:rgba(212,168,83,.1);color:#d4a853;border:1px solid rgba(212,168,83,.2)",
  dev:     "background:rgba(139,126,216,.1);color:#8b7ed8;border:1px solid rgba(139,126,216,.2)",
  sohbet:  "background:rgba(136,136,136,.1);color:#888888;border:1px solid rgba(136,136,136,.2)",
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function replyBlock(author: string, text: string): string {
  const p = PERSONAS[author] ?? { label: author, avatar: author[0]?.toUpperCase() ?? "?", cls: "av-default" };
  const date = new Date().toISOString().slice(0, 10);
  const lines = text.split("\n").map(l => `<p>${escHtml(l)}</p>`).join("\n  ");
  return `
<div class="reply">
  <div class="reply-head">
    <span class="avatar ${p.cls}">${p.avatar}</span>
    <span class="reply-author">${escHtml(p.label)}</span>
    <span class="reply-date">${date}</span>
  </div>
  <div class="reply-text">
  ${lines}
  </div>
</div>`;
}

function threadTemplate(opts: {
  title: string;
  category: string;
  description: string;
  author: string;
  body: string;
}): string {
  const { title, category, description, author, body } = opts;
  const p = PERSONAS[author] ?? { label: author, avatar: author[0]?.toUpperCase() ?? "?", cls: "av-default" };
  const date = new Date().toISOString().slice(0, 10);
  const catLabel = CAT_LABELS[category] ?? category;
  const tagStyle = TAG_CSS[category] ?? "";

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)} — Atlas Forum</title>
<meta name="description" content="[${category}] ${escHtml(description)}">
<meta name="created" content="${date}">
<style>
  :root{--bg:#0a0a0a;--surface:#111111;--elevated:#1a1a1a;--subtle:#2a2a2a;--mid:#404040;--ink:#f5f5f5;--dim:#888888;--muted:#555555;--accent:#5b8def;--green:#4caf7d;--amber:#d4a853;--purple:#8b7ed8;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;line-height:1.7;padding:2rem 1.5rem 4rem;max-width:800px;margin:0 auto}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  code{font-family:ui-monospace,monospace;font-size:.82em;color:var(--accent);background:var(--elevated);padding:.1rem .35rem;border-radius:3px;border:1px solid var(--subtle)}
  .back{display:inline-block;font-size:.78rem;color:var(--dim);margin-bottom:1.5rem}.back:hover{color:var(--accent)}
  h1{font-size:1.5rem;font-weight:700;line-height:1.25;margin-bottom:.3rem}
  .meta{font-size:.78rem;color:var(--muted);margin-bottom:2rem;display:flex;gap:.8rem;flex-wrap:wrap;align-items:center}
  .tag{font-size:.65rem;padding:.15rem .45rem;border-radius:3px;font-family:ui-monospace;text-transform:uppercase;letter-spacing:.04em;${tagStyle}}
  h2{font-size:1rem;font-weight:600;margin:1.5rem 0 .5rem;color:var(--ink)}
  p{margin-bottom:.7rem;color:var(--dim)}
  ul,ol{padding-left:1.3rem;margin-bottom:.7rem}
  li{margin-bottom:.2rem;color:var(--dim)}
  hr{border:none;border-top:1px solid var(--subtle);margin:1.5rem 0}
  .replies-title{font-size:.9rem;font-weight:600;color:var(--dim);margin-bottom:.75rem}
  /* agent persona */
  .reply{background:var(--surface);border:1px solid var(--subtle);border-radius:6px;padding:.85rem 1rem;margin:.5rem 0}
  .reply-head{display:flex;align-items:center;gap:.55rem;margin-bottom:.35rem}
  .avatar{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;flex-shrink:0}
  .av-vault  {background:#5b8def}.av-maker{background:#d4a853}.av-coder{background:#4caf7d}
  .av-sentor {background:#8b7ed8}.av-user{background:#555555}.av-default{background:#444444}
  .reply-author{font-weight:600;font-size:.78rem;color:var(--dim)}
  .reply-date{font-size:.68rem;color:var(--muted);margin-left:auto}
  .reply-text{font-size:.82rem;color:var(--dim);line-height:1.6}
  .reply-text p{margin-bottom:.4rem}
  .reply-text p:last-child{margin-bottom:0}
  .no-reply{font-size:.8rem;color:var(--muted);font-style:italic}
</style>
</head>
<body>
<a href="../index.html" class="back">← Foruma Dön</a>
<h1>${escHtml(title)}</h1>
<div class="meta">
  <span class="tag">${catLabel}</span>
  <span class="reply-head" style="gap:.45rem;display:inline-flex;align-items:center">
    <span class="avatar ${p.cls}" style="width:20px;height:20px;font-size:.6rem">${p.avatar}</span>
    ${escHtml(p.label)}
  </span>
  <span>${date}</span>
</div>

${body}

<hr>
<div class="replies-title">Yanıtlar</div>
<!-- replies:start -->
<p class="no-reply" id="noReply">Henüz yanıt yok.</p>
<!-- replies:end -->
</body>
</html>`;
}

export function buildForumTools(ctx: ToolContext) {
  return {
    forum_search: tool({
      description: `Search Atlas Forum threads. Use this to find existing discussions before opening a new topic. Returns thread titles, categories, descriptions, and IDs. Read-only — auto-executes.`,
      inputSchema: z.object({
        query: z.string().describe("Search query — topic, keyword, or question"),
        category: z.enum(["arch", "codeq", "feature", "dev", "sohbet"]).optional()
          .describe("Filter to a specific forum category"),
        limit: z.number().int().min(1).max(20).optional().describe("Max results (default 8)"),
      }),
      execute: async ({ query, category, limit = 8 }) => {
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };
        try {
          const sep = root.includes("\\") ? "\\" : "/";
          const path = `${root}${sep}.index${sep}pages.json`;
          const result = await native.readFile(path);
          if (result.kind !== "text") return { error: "Index unreadable" };
          const { pages } = JSON.parse(result.content) as { pages: Array<{ id: string; title: string; description: string; modified?: string; text?: string }> };
          const SKIP = new Set(["forum/index", "forum/rehber", "forum/arch", "forum/codeq", "forum/dev", "forum/feature", "forum/sohbet"]);
          const q = query.toLowerCase();
          const catMatch = (desc: string) => { const m = desc.match(/^\[([a-z]+)\]/); return m ? m[1] : null; };
          const forum = pages
            .filter(p => p.id.startsWith("forum/") && !SKIP.has(p.id))
            .filter(p => !category || catMatch(p.description) === category);
          // score
          const scored = forum.map(p => {
            let s = 0;
            if (p.title.toLowerCase().includes(q)) s += 3;
            if ((p.description || "").toLowerCase().includes(q)) s += 2;
            if ((p.text || "").toLowerCase().includes(q)) s += 1;
            return { ...p, score: s };
          }).filter(p => !q || p.score > 0 || query === "")
            .sort((a, b) => b.score - a.score || new Date(b.modified ?? 0).getTime() - new Date(a.modified ?? 0).getTime())
            .slice(0, limit);
          return {
            query, category: category ?? "all",
            results: scored.map(p => ({
              id: p.id,
              slug: p.id.replace("forum/", ""),
              title: p.title,
              category: catMatch(p.description) ?? "?",
              description: p.description.replace(/^\[[a-z]+\]\s*/, ""),
              modified: p.modified,
              score: p.score,
            })),
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    forum_read: tool({
      description: `Read the full content of a specific forum thread by its slug. Returns the raw HTML content so you can understand the discussion and existing replies. Read-only — auto-executes.`,
      inputSchema: z.object({
        slug: z.string().describe("Forum thread slug, e.g. 'plain-html-vs-db'. Get this from forum_search."),
      }),
      execute: async ({ slug }) => {
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };
        const sep = root.includes("\\") ? "\\" : "/";
        const path = `${root}${sep}vault${sep}forum${sep}${slug}${sep}index.html`;
        try {
          const result = await native.readFile(path);
          if (result.kind !== "text") return { error: `Thread not found: forum/${slug}` };
          // Strip HTML tags for readable output
          const text = result.content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 6000);
          return { slug, id: `forum/${slug}`, content_text: text, path };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    forum_reply: tool({
      description: `Add a reply to an existing forum thread using your agent persona. The reply is appended to the thread's vault HTML file and re-indexed so it appears immediately. Use your agent name as 'author' (vault, atlas-maker, coder, sentor) so your identity shows correctly. Requires approval — modifies a vault file.`,
      inputSchema: z.object({
        slug: z.string().describe("Forum thread slug to reply to, e.g. 'plain-html-vs-db'"),
        text: z.string().min(10).describe("Your reply text. Plain text; line breaks become paragraphs."),
        author: z.string().default("vault").describe("Your agent persona ID: vault | atlas-maker | coder | sentor | user"),
      }),
      execute: async ({ slug, text, author }) => {
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };
        const sep = root.includes("\\") ? "\\" : "/";
        const path = `${root}${sep}vault${sep}forum${sep}${slug}${sep}index.html`;
        try {
          const current = await native.readFile(path);
          if (current.kind !== "text") return { error: `Thread not found: forum/${slug}` };
          let html = current.content;
          const block = replyBlock(author, text);
          // Remove the "no replies yet" placeholder if present
          html = html.replace(/<p class="no-reply"[^>]*>.*?<\/p>/s, "");
          // Insert before <!-- replies:end --> or </body>
          if (html.includes("<!-- replies:end -->")) {
            html = html.replace("<!-- replies:end -->", block + "\n<!-- replies:end -->");
          } else {
            html = html.replace("</body>", block + "\n</body>");
          }
          await native.writeFile(path, html);
          // Re-index async
          const py = await findPython(root);
          if (py) {
            await invoke<void>("shell_bg_spawn", { command: `${py} tools${sep}indexer.py`, cwd: root }).catch(() => {});
          }
          return { success: true, thread: `forum/${slug}`, author, replied_at: new Date().toISOString() };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    forum_new_thread: tool({
      description: `Create a new forum thread as a vault HTML page. The thread is immediately indexed and appears in the forum. Use your agent persona as 'author'. Category must be one of: arch (architecture decisions), codeq (code quality), feature (feature requests), dev (development), sohbet (general). Requires approval — creates a vault file.`,
      inputSchema: z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/).describe("URL slug for the thread, e.g. 'tauri-upgrade-plan'. Lowercase, hyphens only."),
        title: z.string().min(5).describe("Thread title"),
        category: z.enum(["arch", "codeq", "feature", "dev", "sohbet"]).describe("Forum category"),
        description: z.string().describe("One-sentence summary shown in the forum listing"),
        body: z.string().describe("Thread body as HTML. Use <h2>, <p>, <ul>, <li>, <code> tags. Start with a problem/context section."),
        author: z.string().default("vault").describe("Your agent persona: vault | atlas-maker | coder | sentor | user"),
      }),
      execute: async ({ slug, title, category, description, body, author }) => {
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };
        const sep = root.includes("\\") ? "\\" : "/";
        const dir = `${root}${sep}vault${sep}forum${sep}${slug}`;
        const path = `${dir}${sep}index.html`;
        // Check if thread already exists
        const existing = await native.readFile(path).catch(() => null);
        if (existing && existing.kind === "text") {
          return { error: `Thread already exists: forum/${slug}. Use forum_reply to add a reply instead.` };
        }
        try {
          await invoke<void>("create_directory", { path: dir }).catch(() => {});
          const html = threadTemplate({ title, category, description, author, body });
          await native.writeFile(path, html);
          const py = await findPython(root);
          if (py) {
            await invoke<void>("shell_bg_spawn", { command: `${py} tools${sep}indexer.py`, cwd: root }).catch(() => {});
          }
          return { success: true, id: `forum/${slug}`, path, category, author, created_at: new Date().toISOString() };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
