import { useState, useRef, useEffect } from "react";
import { useTimer } from "../context/TimerContext";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimerWidget() {
  const { activeEntry, elapsed, paused, start, stop, pause, resume, updateDescription } = useTimer();
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync desc when a new entry starts
  useEffect(() => {
    setDesc(activeEntry?.description ?? "");
    setEditingDesc(false);
  }, [activeEntry?.id]);

  function handleDescClick() {
    setEditingDesc(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function handleDescBlur() {
    setEditingDesc(false);
    updateDescription(desc);
  }

  // ── Idle ─────────────────────────────────────────────────────
  if (!activeEntry) {
    return (
      <button
        onClick={() => start()}
        title="Timer starten"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent
          shadow-[0_0_20px_4px_rgba(0,122,255,0.45)]
          animate-[float_3s_ease-in-out_infinite]
          transition-all
          hover:scale-110
          hover:shadow-[0_0_32px_8px_rgba(0,122,255,0.65)]
          active:scale-95"
      >
        {/* Stopwatch icon */}
        <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="7" />
          <polyline points="12 10 12 13 14 15" />
          <path d="M9.5 2h5" />
          <path d="M12 2v2" />
          <path d="M19.5 6.5l-1.5 1.5" />
        </svg>
      </button>
    );
  }

  // ── Running or Paused ─────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Description row */}
      <div className="glass flex items-center rounded-full border-white/50 px-3 py-1.5 shadow-lg">
        {editingDesc ? (
          <input
            ref={inputRef}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={handleDescBlur}
            onKeyDown={(e) => e.key === "Enter" && handleDescBlur()}
            placeholder="Woran arbeitest du?"
            className="w-48 bg-transparent text-sm text-text-bright outline-none placeholder:text-text-secondary"
          />
        ) : (
          <button
            onClick={handleDescClick}
            className="max-w-50 truncate text-sm text-text-secondary hover:text-text-bright transition-colors"
          >
            {desc || <span className="italic">Beschreibung hinzufügen…</span>}
          </button>
        )}
      </div>

      {/* Main timer pill */}
      <div
        className={`flex items-center gap-1 rounded-full shadow-lg transition-all ${
          paused
            ? "glass border-white/50"
            : "bg-status-customer shadow-status-customer/30"
        }`}
      >
        {/* Elapsed time */}
        <span
          className={`pl-4 font-mono text-sm font-semibold tabular-nums ${
            paused ? "text-text-secondary" : "text-white"
          }`}
        >
          {fmt(elapsed)}
        </span>

        {paused && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            pausiert
          </span>
        )}

        {/* Pause / Resume */}
        <button
          onClick={paused ? resume : pause}
          title={paused ? "Weiter" : "Pause"}
          className={`ml-2 flex h-9 w-9 items-center justify-center rounded-full transition-all ${
            paused
              ? "text-status-customer hover:bg-status-customer/10"
              : "text-white/80 hover:bg-white/20"
          }`}
        >
          {paused ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </button>

        {/* Stop */}
        <button
          onClick={stop}
          title="Stopp"
          className={`mr-1 flex h-9 w-9 items-center justify-center rounded-full transition-all ${
            paused
              ? "text-status-churned hover:bg-status-churned/10"
              : "text-white/80 hover:bg-white/20"
          }`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
