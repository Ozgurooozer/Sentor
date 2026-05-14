import {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { invoke } from "@tauri-apps/api/core";

export async function wikiLinkCompletion(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  const word = context.matchBefore(/\[\[([^\]]*)$/);
  if (!word) return null;

  const query = word.text.slice(2);
  // Veritabanından veya dosya sisteminden not başlıklarını getir
  const notes: string[] = await invoke("vault_get_note_titles", { query });

  return {
    from: word.from + 2,
    options: notes.map((title) => ({
      label: title,
      type: "variable",
      apply: title + "]]",
    })),
    filter: false,
  };
}
