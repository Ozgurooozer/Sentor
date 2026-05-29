import { useCallback, useRef, useState } from "react";

 
const getSR = (): (new () => any) | null =>
  typeof window === "undefined"
    ? null
     
    : (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

export function useSpeechRecognition({ onResult }: { onResult: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
   
  const recRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(async () => {
    const SR = getSR();
    if (!SR || recRef.current) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "";

     
    rec.onresult = (e: any) => {
      const parts: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) parts.push(e.results[i][0].transcript);
      }
      const transcript = parts.join(" ").trim();
      if (transcript) onResultRef.current(transcript);
    };

    rec.onerror = () => {
      setRecording(false);
      setTranscribing(false);
      recRef.current = null;
    };

    rec.onend = () => {
      setRecording(false);
      setTranscribing(false);
      recRef.current = null;
    };

    recRef.current = rec;
    rec.start();
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    recRef.current.stop();
    recRef.current = null;
    setRecording(false);
    setTranscribing(true);
  }, []);

  return {
    state: recording
      ? ("recording" as const)
      : transcribing
        ? ("transcribing" as const)
        : ("idle" as const),
    recording,
    transcribing,
    start,
    stop,
    supported,
    hasKey: supported,
  };
}
