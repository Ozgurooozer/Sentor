// Voice transcription via Whisper requires an OpenAI API key.
// Atlas is local-only — this hook is disabled.

export function useWhisperRecording(_opts: { onResult: (text: string) => void }) {
  return {
    state: "idle" as const,
    recording: false,
    transcribing: false,
    start: async () => {},
    stop: () => {},
    supported: false,
    hasKey: false,
  };
}
