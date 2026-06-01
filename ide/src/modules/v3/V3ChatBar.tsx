import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function V3ChatBar() {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = () => {
    const text = val.trim();
    if (!text) return;
    // TODO: gerçek AI bağlantısı
    setVal("");
  };

  return (
    <div
      className="flex h-full w-full items-center gap-3 px-4"
      style={{
        background: "rgba(10, 10, 16, 0.90)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Logo mark */}
      <div
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, #5b8def, #9b72ef)" }}
      >
        A
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
        placeholder="Sentor'a bir şey sor…"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#e8e8ec] outline-none"
        style={{ caretColor: "#5b8def" }}
      />

      {/* Send */}
      <button
        type="button"
        onClick={send}
        disabled={!val.trim()}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-out",
          val.trim()
            ? "bg-[rgba(91,141,239,0.18)] text-[#5b8def] hover:bg-[rgba(91,141,239,0.30)]"
            : "text-[#282830]",
        )}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
