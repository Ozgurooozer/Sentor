import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiViewIcon, Link01Icon } from "@hugeicons/core-free-icons";

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
    <div className="flex h-full flex-col overflow-y-auto border-l border-[#2a2a2a] bg-[#0a0a0a] px-3 py-3 gap-5">
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[#555]">
          <HugeiconsIcon icon={Link01Icon} size={11} strokeWidth={1.75} />
          Backlinks
          {backlinks.length > 0 && (
            <span className="ml-auto text-[#444]">{backlinks.length}</span>
          )}
        </div>
        {backlinks.length === 0 ? (
          <span className="text-[11px] italic text-[#444]">No backlinks</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {backlinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigate?.(link.id)}
                className="truncate rounded px-1 py-0.5 text-left text-[11px] text-[#888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
                title={link.id}
              >
                {link.title || link.id}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[#555]">
          <HugeiconsIcon icon={AiViewIcon} size={11} strokeWidth={1.75} />
          Similar
          {similar.length > 0 && (
            <span className="ml-auto text-[#444]">{similar.length}</span>
          )}
        </div>
        {similar.length === 0 ? (
          <span className="text-[11px] italic text-[#444]">No embeddings yet</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {similar.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onNavigate?.(note.id)}
                className="flex flex-col gap-0.5 rounded px-1 py-0.5 text-left hover:bg-[#1a1a1a]"
                title={`${note.id} (${(note.score * 100).toFixed(0)}%)`}
              >
                <span className="truncate text-[11px] text-[#888] hover:text-[#f5f5f5]">
                  {note.title || note.id}
                </span>
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                  <div
                    className="h-full rounded-full bg-[#5b8def]"
                    style={{ width: `${Math.min(note.score * 100, 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
