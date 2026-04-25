import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { TimeEntry, User } from "../types";
import { timeEntriesApi } from "../services/api";

interface TimerContextValue {
  activeEntry: TimeEntry | null;
  elapsed: number;       // net seconds (excludes paused time)
  paused: boolean;
  start: (description?: string) => Promise<void>;
  startTogether: (partners: { userId: string; username: string }[], description?: string) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  updateDescription: (desc: string) => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  // track paused time so stop sends correct net duration
  const pausedSecsRef = useRef(0);   // total seconds spent paused
  const pausedAtRef = useRef<number | null>(null); // timestamp when current pause started
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On mount: resume any running entry
  useEffect(() => {
    timeEntriesApi.getActive(user.id).then((entry) => {
      if (entry) {
        setActiveEntry(entry);
        const secs = Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 1000);
        setElapsed(secs);
      }
    });
  }, [user.id]);

  // Tick while running (not paused) — compute from wall clock, not counter
  useEffect(() => {
    if (!activeEntry || paused) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }

    const startMs = new Date(activeEntry.startedAt).getTime();

    function tick() {
      const wallSecs = Math.floor((Date.now() - startMs) / 1000);
      setElapsed(Math.max(0, wallSecs - pausedSecsRef.current));
    }

    tick(); // immediate update when resuming / switching back
    tickRef.current = setInterval(tick, 1000);

    // Force refresh when tab becomes visible again
    function onVisible() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeEntry?.id, activeEntry?.startedAt, paused]);

  const start = useCallback(async (description = "") => {
    pausedSecsRef.current = 0;
    pausedAtRef.current = null;
    setPaused(false);
    const entry = await timeEntriesApi.start(user.id, user.username, description);
    setActiveEntry(entry);
    setElapsed(0);
  }, [user.id, user.username]);

  const startTogether = useCallback(async (partners: { userId: string; username: string }[], description = "") => {
    pausedSecsRef.current = 0;
    pausedAtRef.current = null;
    setPaused(false);
    const participants = [{ userId: user.id, username: user.username }, ...partners];
    const entries = await timeEntriesApi.startTogether(participants, description);
    const myEntry = entries.find((e) => e.userId === user.id) ?? entries[0];
    setActiveEntry(myEntry);
    setElapsed(0);
  }, [user.id, user.username]);

  const pause = useCallback(() => {
    if (!activeEntry || paused) return;
    pausedAtRef.current = Date.now();
    setPaused(true);
  }, [activeEntry, paused]);

  const resume = useCallback(() => {
    if (!activeEntry || !paused) return;
    if (pausedAtRef.current) {
      pausedSecsRef.current += Math.floor((Date.now() - pausedAtRef.current) / 1000);
      pausedAtRef.current = null;
    }
    setPaused(false);
  }, [activeEntry, paused]);

  const stop = useCallback(async () => {
    if (!activeEntry) return;
    // Finalise any ongoing pause before stopping
    let totalPaused = pausedSecsRef.current;
    if (paused && pausedAtRef.current) {
      totalPaused += Math.floor((Date.now() - pausedAtRef.current) / 1000);
    }
    const netDuration = Math.max(0, elapsed - (paused ? 0 : 0) + (paused ? elapsed : 0) - totalPaused);
    // elapsed already excludes ticking during pause, so net = elapsed
    await timeEntriesApi.stop(activeEntry.id, elapsed);
    setActiveEntry(null);
    setElapsed(0);
    setPaused(false);
    pausedSecsRef.current = 0;
    pausedAtRef.current = null;
    // suppress unused warning
    void netDuration;
  }, [activeEntry, elapsed, paused]);

  const updateDescription = useCallback((desc: string) => {
    if (!activeEntry) return;
    setActiveEntry((e) => (e ? { ...e, description: desc } : null));
    timeEntriesApi.updateDescription(activeEntry.id, desc);
  }, [activeEntry]);

  return (
    <TimerContext.Provider value={{ activeEntry, elapsed, paused, start, startTogether, stop, pause, resume, updateDescription }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used inside TimerProvider");
  return ctx;
}
