import { useState, useRef, useEffect } from "react";
import { useTimer } from "../context/TimerContext";
import { usersApi } from "../services/api";
import type { User } from "../types";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimerWidget() {
  const { activeEntry, elapsed, paused, start, startTogether, stop, pause, resume, updateDescription } = useTimer();
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Together mode state
  const [togetherOpen, setTogetherOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const togetherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDesc(activeEntry?.description ?? "");
    setEditingDesc(false);
  }, [activeEntry?.id]);

  // Close together panel on outside click
  useEffect(() => {
    if (!togetherOpen) return;
    function handleClick(e: MouseEvent) {
      if (togetherRef.current && !togetherRef.current.contains(e.target as Node)) {
        setTogetherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [togetherOpen]);

  function handleDescClick() {
    setEditingDesc(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function handleDescBlur() {
    setEditingDesc(false);
    updateDescription(desc);
  }

  async function openTogether() {
    if (!togetherOpen) {
      const users = await usersApi.list();
      setAllUsers(users);
      setSelectedPartners([]);
    }
    setTogetherOpen((v) => !v);
  }

  async function handleStartTogether() {
    const partners = allUsers
      .filter((u) => selectedPartners.includes(u.id))
      .map((u) => ({ userId: u.id, username: u.username }));
    setTogetherOpen(false);
    await startTogether(partners, desc);
  }

  function togglePartner(id: string) {
    setSelectedPartners((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // ── Idle ─────────────────────────────────────────────────────
  if (!activeEntry) {
    return (
      <div ref={togetherRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Together picker panel */}
        {togetherOpen && (
          <div className="glass-strong rounded-2xl p-4 shadow-xl w-56">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Mit wem?
            </p>
            <div className="space-y-1 mb-3">
              {allUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-white/40 transition-colors"
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                    selectedPartners.includes(u.id)
                      ? "border-accent bg-accent"
                      : "border-border-strong bg-transparent"
                  }`}>
                    {selectedPartners.includes(u.id) && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-text-bright">{u.username}</span>
                </label>
              ))}
            </div>
            <button
              disabled={selectedPartners.length === 0}
              onClick={handleStartTogether}
              className="w-full rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-all hover:bg-accent-dim active:scale-95"
            >
              Zusammen starten
            </button>
          </div>
        )}

        {/* Button row */}
        <div className="flex items-center gap-2">
          {/* Together button */}
          <button
            onClick={openTogether}
            title="Zusammen tracken"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all shadow-md ${
              togetherOpen
                ? "bg-accent text-white shadow-accent/30"
                : "glass text-text-secondary hover:text-accent hover:scale-105"
            }`}
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="3" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
            </svg>
          </button>

          {/* Main start button */}
          <button
            onClick={() => start()}
            title="Timer starten"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent
              shadow-[0_0_20px_4px_rgba(0,122,255,0.45)]
              animate-[float_3s_ease-in-out_infinite]
              transition-all
              hover:scale-110
              hover:shadow-[0_0_32px_8px_rgba(0,122,255,0.65)]
              active:scale-95"
          >
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="13" r="7" />
              <polyline points="12 10 12 13 14 15" />
              <path d="M9.5 2h5" />
              <path d="M12 2v2" />
              <path d="M19.5 6.5l-1.5 1.5" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Running or Paused ─────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Together indicator */}
      {activeEntry.sessionGroupId && (
        <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1 shadow-md">
          <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
          </svg>
          <span className="text-[11px] font-medium text-accent">Zusammen</span>
        </div>
      )}

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
