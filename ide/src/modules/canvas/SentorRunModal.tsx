import { useEffect, useState } from "react";

const API = "http://localhost:4242";

type TaskEntry    = { id: string; name: string; type: string; description?: string };
type PipelineEntry = { id: string; name: string; steps: number; trigger: string };

type Props = { onClose: () => void };

export function SentorRunModal({ onClose }: Props) {
  const [tab, setTab]             = useState<"task" | "pipeline">("task");
  const [tasks, setTasks]         = useState<TaskEntry[]>([]);
  const [pipelines, setPipelines] = useState<PipelineEntry[]>([]);
  const [selected, setSelected]   = useState<string>("");
  const [input, setInput]         = useState("");
  const [status, setStatus]       = useState<"idle" | "running" | "done" | "err">("idle");
  const [msg, setMsg]             = useState("");

  useEffect(() => {
    fetch(`${API}/api/cli/tasks`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => {});
    fetch(`${API}/api/cli/pipelines`)
      .then((r) => r.json())
      .then((d) => setPipelines(d.pipelines ?? []))
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!selected) return;
    setStatus("running");
    setMsg("");
    try {
      const body =
        tab === "task"
          ? { task_id: selected, input: input || undefined }
          : { pipeline_id: selected };
      const endpoint =
        tab === "task" ? `${API}/api/cli/run` : `${API}/api/cli/pipeline/run`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus("done");
        setMsg(`${selected} başlatıldı`);
      } else {
        throw new Error(d.error ?? "unknown");
      }
    } catch (e) {
      setStatus("err");
      setMsg(String(e));
    }
  };

  const items = tab === "task" ? tasks : pipelines;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="w-[420px] rounded-lg border border-[#2a2a2a] bg-[#111] p-4 shadow-none">
        {/* header */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#f5f5f5]">Run Sentor</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#555] hover:text-[#f5f5f5] text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        {/* tab bar */}
        <div className="mb-3 flex gap-1 border-b border-[#2a2a2a] pb-2">
          {(["task", "pipeline"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setSelected(""); }}
              className={[
                "rounded px-3 py-1 text-[11px] transition-colors",
                tab === t
                  ? "bg-[#1a1a1a] text-[#f5f5f5]"
                  : "text-[#555] hover:text-[#888]",
              ].join(" ")}
            >
              {t === "task" ? "Görev" : "Pipeline"}
            </button>
          ))}
        </div>

        {/* list */}
        <div className="mb-3 max-h-[200px] overflow-y-auto rounded border border-[#2a2a2a]">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-[#555]">
              {tab === "task" ? "Kayıtlı görev yok" : "Kayıtlı pipeline yok"}
              <br />
              <span className="text-[#333]">
                {tab === "task" ? "atlas new-task" : "atlas pipeline new <id>"}
              </span>
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={[
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                selected === item.id
                  ? "bg-[#5b8def22] border-l-2 border-[#5b8def]"
                  : "hover:bg-[#1a1a1a]",
              ].join(" ")}
            >
              <span className="text-[12px] text-[#f5f5f5]">{item.id}</span>
              <span className="text-[11px] text-[#555]">
                {tab === "task"
                  ? `${(item as TaskEntry).type} · ${(item as TaskEntry).description ?? item.name}`
                  : `${(item as PipelineEntry).steps} adım · ${(item as PipelineEntry).trigger}`}
              </span>
            </button>
          ))}
        </div>

        {/* optional input */}
        {tab === "task" && selected && (
          <input
            className="mb-3 w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-[12px] text-[#f5f5f5] placeholder-[#444] outline-none focus:border-[#404040]"
            placeholder="Ek girdi (opsiyonel)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        )}

        {/* status */}
        {msg && (
          <div
            className={[
              "mb-3 rounded px-3 py-1.5 text-[11px]",
              status === "done"
                ? "bg-[#1D9E7522] text-[#1D9E75]"
                : "bg-[#DD525222] text-[#DD5252]",
            ].join(" ")}
          >
            {msg}
          </div>
        )}

        {/* footer */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#2a2a2a] px-3 py-1.5 text-[12px] text-[#555] hover:text-[#888] transition-colors"
          >
            Kapat
          </button>
          <button
            type="button"
            disabled={!selected || status === "running"}
            onClick={run}
            className="rounded bg-[#5b8def] px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#4a7de0] disabled:opacity-40"
          >
            {status === "running" ? "Çalışıyor…" : "Çalıştır"}
          </button>
        </div>
      </div>
    </div>
  );
}
