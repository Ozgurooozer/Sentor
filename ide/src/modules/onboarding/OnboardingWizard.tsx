import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { setOnboarded, setWorkspaceRoot } from "../settings/store";
import { usePreferencesStore } from "../settings/preferences";

interface StepProps {
  onNext: () => void;
  onSkip: () => void;
}

// ── Step 1: Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext, onSkip }: StepProps) {
  return (
    <div style={styles.card}>
      <div style={styles.logo}>◈</div>
      <h1 style={styles.title}>Welcome to Sentor</h1>
      <p style={styles.body}>
        Sentor is your local-first second brain — a personal knowledge base,
        AI IDE, and web browser in one desktop app. Everything stays on your
        machine. No cloud, no subscriptions.
      </p>
      <p style={{ ...styles.body, color: "#888" }}>
        This wizard takes about 2 minutes and sets up your vault, AI provider,
        and search.
      </p>
      <div style={styles.row}>
        <button style={styles.btnPrimary} onClick={onNext}>
          Get started →
        </button>
        <button style={styles.btnGhost} onClick={onSkip}>
          Skip setup
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Vault folder ────────────────────────────────────────────────────

function StepVault({ onNext, onSkip }: StepProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFolder = async () => {
    const path = await invoke<string | null>("pick_folder");
    if (path) setPicked(path);
  };

  const confirm = async () => {
    if (!picked) { onNext(); return; }
    setSaving(true);
    await setWorkspaceRoot(picked);
    onNext();
  };

  return (
    <div style={styles.card}>
      <div style={styles.step}>Step 1 of 4</div>
      <h2 style={styles.title}>Choose your vault folder</h2>
      <p style={styles.body}>
        Sentor stores your knowledge as HTML pages inside a vault folder. Pick an
        existing folder or create a new one — anywhere on your machine.
      </p>
      <div style={styles.pathBox} onClick={pickFolder}>
        {picked ? (
          <span style={{ color: "#f5f5f5" }}>{picked}</span>
        ) : (
          <span style={{ color: "#555" }}>Click to choose a folder…</span>
        )}
      </div>
      <div style={styles.row}>
        <button
          style={saving ? styles.btnDisabled : styles.btnPrimary}
          onClick={confirm}
          disabled={saving}
        >
          {saving ? "Saving…" : picked ? "Use this folder →" : "Use default →"}
        </button>
        <button style={styles.btnGhost} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Step 3: AI Provider check ────────────────────────────────────────────────

type ProviderStatus = "checking" | "ok" | "missing";
type ModelStatus = "checking" | "ok" | "missing" | "pulling";

const EMBED_MODEL = "all-minilm";

function StepProvider({ onNext, onSkip }: StepProps) {
  const [lmstudio, setLmstudio] = useState<ProviderStatus>("checking");
  const [ollama, setOllama] = useState<ProviderStatus>("checking");
  const [embedModel, setEmbedModel] = useState<ModelStatus>("checking");
  const [pullError, setPullError] = useState<string | null>(null);

  // Probe `all-minilm` once Ollama is known reachable.
  const probeEmbedModel = async () => {
    try {
      const r = await fetch("http://localhost:11434/api/tags");
      if (!r.ok) {
        setEmbedModel("missing");
        return;
      }
      const tags = (await r.json()) as { models?: Array<{ name?: string }> };
      const names = (tags.models ?? []).map((m) => m.name ?? "");
      setEmbedModel(
        names.some((n) => n.startsWith(EMBED_MODEL)) ? "ok" : "missing",
      );
    } catch {
      setEmbedModel("missing");
    }
  };

  useEffect(() => {
    invoke<number>("http_ping", { url: "http://localhost:1234/v1/models" })
      .then((s) => setLmstudio(s >= 200 && s < 400 ? "ok" : "missing"))
      .catch(() => setLmstudio("missing"));

    invoke<number>("http_ping", { url: "http://localhost:11434/api/tags" })
      .then(async (s) => {
        const reachable = s >= 200 && s < 400;
        setOllama(reachable ? "ok" : "missing");
        if (reachable) await probeEmbedModel();
        else setEmbedModel("missing");
      })
      .catch(() => {
        setOllama("missing");
        setEmbedModel("missing");
      });
  }, []);

  const openOllamaInstall = () => {
    void openUrl("https://ollama.com/download/windows");
  };

  const pullEmbedModel = async () => {
    setEmbedModel("pulling");
    setPullError(null);
    try {
      // `ollama pull <model>` blocks until the download finishes. shell_run_command
      // returns when the process exits; output is captured but we only need exit code.
      await invoke("shell_run_command", {
        command: `ollama pull ${EMBED_MODEL}`,
        cwd: null,
      });
      await probeEmbedModel();
    } catch (e) {
      setPullError(String(e));
      setEmbedModel("missing");
    }
  };

  const icon = (s: ProviderStatus) =>
    s === "checking" ? "…" : s === "ok" ? "✓" : "✗";
  const color = (s: ProviderStatus) =>
    s === "checking" ? "#888" : s === "ok" ? "#4ade80" : "#f87171";

  const anyOk = lmstudio === "ok" || ollama === "ok";

  return (
    <div style={styles.card}>
      <div style={styles.step}>Step 2 of 4</div>
      <h2 style={styles.title}>Local AI provider</h2>
      <p style={styles.body}>
        Sentor works with LM Studio or Ollama — local AI that runs entirely on
        your hardware.
      </p>

      <div style={styles.providerRow}>
        <span style={{ color: color(lmstudio), width: 20 }}>{icon(lmstudio)}</span>
        <div>
          <div style={{ color: "#f5f5f5" }}>LM Studio</div>
          <div style={{ color: "#888", fontSize: 11 }}>localhost:1234</div>
        </div>
      </div>
      <div style={styles.providerRow}>
        <span style={{ color: color(ollama), width: 20 }}>{icon(ollama)}</span>
        <div>
          <div style={{ color: "#f5f5f5" }}>Ollama</div>
          <div style={{ color: "#888", fontSize: 11 }}>localhost:11434</div>
        </div>
      </div>

      {ollama === "ok" && (
        <div style={styles.providerRow}>
          <span
            style={{
              color:
                embedModel === "ok"
                  ? "#4ade80"
                  : embedModel === "pulling"
                    ? "#5b8def"
                    : embedModel === "missing"
                      ? "#f87171"
                      : "#888",
              width: 20,
            }}
          >
            {embedModel === "ok"
              ? "✓"
              : embedModel === "pulling"
                ? "…"
                : embedModel === "missing"
                  ? "✗"
                  : "…"}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#f5f5f5" }}>Embedding model</div>
            <div style={{ color: "#888", fontSize: 11 }}>
              {EMBED_MODEL} — required for semantic vault search
            </div>
          </div>
          {embedModel === "missing" && (
            <button style={styles.btnSecondary} onClick={pullEmbedModel}>
              Pull now
            </button>
          )}
          {embedModel === "pulling" && (
            <span style={{ color: "#888", fontSize: 11 }}>downloading…</span>
          )}
        </div>
      )}

      {pullError && (
        <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>
          Pull failed: {pullError}
        </div>
      )}

      {!anyOk && ollama === "missing" && (
        <div style={styles.hint}>
          <p style={{ margin: "0 0 8px", color: "#888", fontSize: 12 }}>
            No provider found. Install Ollama to get started (free, offline):
          </p>
          <button style={styles.btnSecondary} onClick={openOllamaInstall}>
            Download Ollama for Windows ↗
          </button>
        </div>
      )}

      <div style={styles.row}>
        <button style={styles.btnPrimary} onClick={onNext}>
          {anyOk ? "Continue →" : "Continue anyway →"}
        </button>
        <button style={styles.btnGhost} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Vault index ──────────────────────────────────────────────────────

type IndexStatus = "checking" | "ok" | "missing" | "building";

function StepIndex({ onNext, onSkip }: StepProps) {
  const [status, setStatus] = useState<IndexStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const root = usePreferencesStore.getState().workspaceRoot;

  const probeIndex = async () => {
    if (!root) {
      setStatus("missing");
      return;
    }
    const sep = root.includes("\\") ? "\\" : "/";
    const indexPath = `${root}${sep}.index${sep}pages.json`;
    try {
      const r = await invoke<{ kind: string }>("fs_read_file", { path: indexPath });
      setStatus(r && r.kind === "text" ? "ok" : "missing");
    } catch {
      setStatus("missing");
    }
  };

  useEffect(() => {
    void probeIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildIndex = async () => {
    if (!root) return;
    setStatus("building");
    setError(null);
    try {
      const sep = root.includes("\\") ? "\\" : "/";
      await invoke("shell_run_command", {
        command: `python tools${sep}indexer.py`,
        cwd: root,
      });
      await probeIndex();
    } catch (e) {
      setError(String(e));
      setStatus("missing");
    }
  };

  const dot = (s: IndexStatus) =>
    s === "ok"
      ? "✓"
      : s === "building"
        ? "…"
        : s === "missing"
          ? "✗"
          : "…";
  const dotColor = (s: IndexStatus) =>
    s === "ok" ? "#4ade80" : s === "building" ? "#5b8def" : s === "missing" ? "#f87171" : "#888";

  return (
    <div style={styles.card}>
      <div style={styles.step}>Step 3 of 4</div>
      <h2 style={styles.title}>Vault search index</h2>
      <p style={styles.body}>
        Sentor keeps a small JSON index of your vault pages for instant search.
        It's rebuilt automatically as you write — but it needs an initial build.
      </p>

      <div style={styles.providerRow}>
        <span style={{ color: dotColor(status), width: 20 }}>{dot(status)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f5f5f5" }}>.index/pages.json</div>
          <div style={{ color: "#888", fontSize: 11 }}>
            {root ?? "no workspace selected"}
          </div>
        </div>
        {status === "missing" && root && (
          <button style={styles.btnSecondary} onClick={buildIndex}>
            Build now
          </button>
        )}
        {status === "building" && (
          <span style={{ color: "#888", fontSize: 11 }}>indexing…</span>
        )}
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: 11 }}>
          Build failed: {error}
        </div>
      )}

      <div style={styles.row}>
        <button style={styles.btnPrimary} onClick={onNext}>
          Continue →
        </button>
        <button style={styles.btnGhost} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Step 5: SearXNG ──────────────────────────────────────────────────────────

function StepSearch({ onNext, onSkip }: StepProps) {
  const [status, setStatus] = useState<ProviderStatus>("checking");

  useEffect(() => {
    invoke<number>("http_ping", { url: "http://localhost:8888/search?q=test&format=json" })
      .then((s) => setStatus(s >= 200 && s < 400 ? "ok" : "missing"))
      .catch(() => setStatus("missing"));
  }, []);

  const dockerCmd =
    "docker run -d -p 8888:8080 --name searxng -e SEARXNG_SECRET=sentor searxng/searxng";

  const copyCmd = () => {
    void navigator.clipboard.writeText(dockerCmd);
  };

  return (
    <div style={styles.card}>
      <div style={styles.step}>Step 4 of 4</div>
      <h2 style={styles.title}>Web search (optional)</h2>
      <p style={styles.body}>
        Sentor can search the web through SearXNG — a self-hosted, private
        search engine. Entirely optional; all other features work without it.
      </p>

      <div style={styles.providerRow}>
        <span style={{ color: status === "ok" ? "#4ade80" : "#888", width: 20 }}>
          {status === "checking" ? "…" : status === "ok" ? "✓" : "○"}
        </span>
        <div>
          <div style={{ color: "#f5f5f5" }}>SearXNG</div>
          <div style={{ color: "#888", fontSize: 11 }}>localhost:8888</div>
        </div>
      </div>

      {status === "missing" && (
        <div style={styles.hint}>
          <p style={{ margin: "0 0 8px", color: "#888", fontSize: 12 }}>
            Start with Docker (one command):
          </p>
          <div
            style={{
              background: "#111",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 11,
              color: "#aaa",
              fontFamily: "monospace",
              marginBottom: 6,
              wordBreak: "break-all",
            }}
          >
            {dockerCmd}
          </div>
          <button style={styles.btnSecondary} onClick={copyCmd}>
            Copy command
          </button>
        </div>
      )}

      <div style={styles.row}>
        <button style={styles.btnPrimary} onClick={onNext}>
          Done →
        </button>
        <button style={styles.btnGhost} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Finish ───────────────────────────────────────────────────────────────────

function StepDone({ onFinish }: { onFinish: () => void }) {
  return (
    <div style={styles.card}>
      <div style={styles.logo}>✓</div>
      <h2 style={styles.title}>You're all set!</h2>
      <p style={styles.body}>
        Sentor is ready. Your vault is indexed, the AI chat is active. Open a
        file to edit, search your vault, or ask the AI anything.
      </p>
      <div style={styles.row}>
        <button style={styles.btnPrimary} onClick={onFinish}>
          Open Sentor
        </button>
      </div>
    </div>
  );
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  const advance = () => setStep((s) => s + 1);
  const skip = async () => {
    await setOnboarded(true);
    onComplete();
  };
  const finish = async () => {
    await setOnboarded(true);
    onComplete();
  };

  const steps = [
    <StepWelcome key="welcome" onNext={advance} onSkip={skip} />,
    <StepVault key="vault" onNext={advance} onSkip={advance} />,
    <StepProvider key="provider" onNext={advance} onSkip={advance} />,
    <StepIndex key="index" onNext={advance} onSkip={advance} />,
    <StepSearch key="search" onNext={advance} onSkip={advance} />,
    <StepDone key="done" onFinish={finish} />,
  ];

  return (
    <div style={styles.overlay}>
      <div style={styles.progress}>
        {Array.from({ length: steps.length }).map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.dot,
              background: i <= step ? "#5b8def" : "#2a2a2a",
            }}
          />
        ))}
      </div>
      {steps[step]}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

type CSSProps = React.CSSProperties;

const styles: Record<string, CSSProps> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#0a0a0a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    fontFamily: "system-ui, sans-serif",
  },
  progress: {
    display: "flex",
    gap: 6,
    marginBottom: 32,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    transition: "background 150ms ease-out",
  },
  card: {
    width: 440,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  logo: {
    fontSize: 32,
    color: "#5b8def",
    marginBottom: 4,
  },
  step: {
    fontSize: 11,
    color: "#555",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    color: "#f5f5f5",
    margin: 0,
  },
  body: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 1.6,
    margin: 0,
  },
  row: {
    display: "flex",
    gap: 10,
    marginTop: 8,
  },
  btnPrimary: {
    padding: "8px 20px",
    fontSize: 13,
    background: "#5b8def",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    transition: "background 150ms ease-out",
  },
  btnSecondary: {
    padding: "5px 12px",
    fontSize: 12,
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    color: "#f5f5f5",
    cursor: "pointer",
  },
  btnGhost: {
    padding: "8px 16px",
    fontSize: 13,
    background: "transparent",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#888",
    cursor: "pointer",
  },
  btnDisabled: {
    padding: "8px 20px",
    fontSize: 13,
    background: "#1a1a1a",
    border: "none",
    borderRadius: 6,
    color: "#555",
    cursor: "not-allowed",
  },
  pathBox: {
    padding: "10px 14px",
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    transition: "border-color 150ms ease-out",
  },
  providerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  hint: {
    padding: "10px 14px",
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
  },
};
