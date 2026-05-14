import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link01Icon, AiViewIcon } from "@hugeicons/core-free-icons";

export function BacklinkPanel({ noteId }: { noteId: string }) {
  const [backlinks, setBacklinks] = useState<{ title: string; path: string }[]>([]);
  const [similarNotes, setSimilarNotes] = useState<{ title: string; score: number }[]>([]);

  useEffect(() => {
    if (!noteId) return;
    // Backlinkleri getir
    void invoke("vault_get_backlinks", { noteId }).then((res: any) => setBacklinks(res));
    // Benzer notları getir (Semantik Arama)
    void invoke("vault_get_similar_notes", { noteId }).then((res: any) => setSimilarNotes(res));
  }, [noteId]);

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/50 overflow-y-auto p-4 gap-6">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <HugeiconsIcon icon={Link01Icon} size={12} />
          Backlinks
        </h3>
        <div className="flex flex-col gap-1">
          {backlinks.length > 0 ? backlinks.map(link => (
            <button key={link.path} className="text-[12px] text-left hover:underline truncate">
              {link.title}
            </button>
          )) : <span className="text-[11px] text-muted-foreground italic">No backlinks found</span>}
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <HugeiconsIcon icon={AiViewIcon} size={12} />
          Similar Notes (AI)
        </h3>
        <div className="flex flex-col gap-2">
          {similarNotes.map(note => (
            <div key={note.title} className="flex flex-col gap-1">
              <span className="text-[12px] truncate">{note.title}</span>
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${note.score * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
