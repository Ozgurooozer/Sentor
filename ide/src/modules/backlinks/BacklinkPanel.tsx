import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type BacklinkItem = { id: string; title: string; type?: string; url?: string };
type SimilarItem = { id: string; title: string; score: number };

export function BacklinkPanel({
  noteId,
  onNavigate,
}: {
  noteId: string;
  onNavigate?: (id: string) => void;
}) {
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);

  const load = () => {
    if (!noteId) return;
    void invoke<BacklinkItem[]>("vault_get_backlinks", { noteId }).then(setBacklinks);
    void invoke<SimilarItem[]>("vault_get_similar_notes", { noteId }).then(setSimilar);
  };

  useEffect(() => {
    setBacklinks([]);
    setSimilar([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    const unsub = listen("vault:reindexed", load);
    return () => { void unsub.then((fn) => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto no-scrollbar"
      style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* Backlinks section */}
      <div className="px-2.5 pt-3 pb-1">
        <div
          className="mb-2 flex items-center gap-1.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6 }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8H2a2 2 0 010-4h2M8 4h2a2 2 0 010 4H8M4 6h4"/>
          </svg>
          <span
            className="font-mono text-[8px] uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Links
          </span>
          {backlinks.length > 0 && (
            <span
              className="ml-auto rounded-[4px] px-1.5 font-mono text-[8px]"
              style={{ background: "rgba(91,141,239,0.10)", color: "rgba(91,141,239,0.65)" }}
            >
              {backlinks.length}
            </span>
          )}
        </div>

        {backlinks.length === 0 ? (
          <div className="py-3 text-center">
            <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.15)" }}>
              —
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {backlinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigate?.(link.id)}
                className="w-full truncate rounded-[5px] px-2 py-1 text-left text-[10px] transition-colors duration-150"
                style={{ color: "rgba(255,255,255,0.40)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.40)";
                }}
                title={link.id}
              >
                {link.title || link.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", margin: "4px 0" }} />

      {/* Similar section */}
      <div className="px-2.5 pb-3">
        <div
          className="mb-2 flex items-center gap-1.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6 }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="4"/><path d="M6 4v4M4 6h4"/>
          </svg>
          <span
            className="font-mono text-[8px] uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Similar
          </span>
          {similar.length > 0 && (
            <span
              className="ml-auto rounded-[4px] px-1.5 font-mono text-[8px]"
              style={{ background: "rgba(155,114,239,0.10)", color: "rgba(155,114,239,0.65)" }}
            >
              {similar.length}
            </span>
          )}
        </div>

        {similar.length === 0 ? (
          <div className="py-3 text-center">
            <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.15)" }}>
              —
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {similar.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onNavigate?.(note.id)}
                className="flex w-full flex-col gap-1 rounded-[5px] px-2 py-1 text-left transition-colors duration-150"
                style={{ color: "rgba(255,255,255,0.40)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.40)";
                }}
                title={`${note.id} (${(note.score * 100).toFixed(0)}%)`}
              >
                <span className="truncate text-[10px]">
                  {note.title || note.id}
                </span>
                <div
                  className="h-[2px] w-full overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(note.score * 100, 100)}%`,
                      background: note.score > 0.75 ? "#9b72ef" : note.score > 0.5 ? "#5b8def" : "rgba(255,255,255,0.20)",
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
