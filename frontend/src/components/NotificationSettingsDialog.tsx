import { useCallback, useEffect, useState } from "react";
import { authApi } from "../services/api";

/** Untergrenze wie im Backend — der Themenname ist das Passwort des Kanals. */
const MIN_LENGTH = 8;

/** Dieselben Zeichen, die ntfy im Themennamen zulässt. */
const ALLOWED = /^[A-Za-z0-9_-]+$/;

/** Lang und zufällig — genau das, was ein Thema sein soll. */
function suggestTopic() {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 14);
  return `minicrm-${random}`;
}

/**
 * Das eigene ntfy-Thema für die persönliche Morgen-Übersicht.
 *
 * Jeder hinterlegt hier sein eigenes und trägt denselben Namen in der
 * ntfy-App ein. Ab dann kommen um 8 Uhr die Todos, die auf einen selbst
 * zugewiesen sind — die gemeinsamen laufen weiter über das Thema, das auf
 * dem Pi konfiguriert ist.
 *
 * Ohne Thema kommt keine persönliche Übersicht. Das ist der reguläre Weg,
 * sie abzuschalten, kein Fehlerfall.
 */
export default function NotificationSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [savedTopic, setSavedTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await authApi.ntfyTopic();
      setTopic(current.topic);
      setSavedTopic(current.topic);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote(null);
    void load();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, load]);

  if (!open) return null;

  const trimmed = topic.trim();
  const unsaved = trimmed !== savedTopic;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Dieselben Regeln wie im Backend, nur früher — damit man den Grund
    // sieht, bevor die Anfrage rausgeht.
    if (trimmed && trimmed.length < MIN_LENGTH) {
      setError(`Das Thema braucht mindestens ${MIN_LENGTH} Zeichen.`);
      return;
    }
    if (trimmed && !ALLOWED.test(trimmed)) {
      setError("Erlaubt sind Buchstaben, Ziffern, Bindestrich und Unterstrich.");
      return;
    }

    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const saved = await authApi.setNtfyTopic(trimmed);
      setTopic(saved.topic);
      setSavedTopic(saved.topic);
      setNote(saved.configured ? "Gespeichert." : "Persönliche Übersicht abbestellt.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Die Probe geht an das gespeicherte Thema, nicht an das im Feld — sonst
   * würde sie etwas prüfen, das so noch gar nicht hinterlegt ist.
   */
  async function sendTest() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await authApi.testNtfy();
      setNote(
        result.sent
          ? "Probenachricht verschickt — sie sollte gleich am Handy sein."
          : "ntfy hat die Nachricht nicht angenommen. Stimmt das Thema?",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Benachrichtigungen"
        className="glass-strong fixed left-1/2 top-1/2 z-[81] w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
      >
        <h2 className="mb-1 text-sm font-semibold text-text-bright">Benachrichtigungen</h2>
        <p className="mb-4 text-xs leading-relaxed text-text-secondary">
          Um 8 Uhr kommen die Todos, die dir zugewiesen sind, auf dein Handy. Trag
          dasselbe Thema in der ntfy-App ein. Todos, die niemandem zugewiesen sind,
          laufen weiter über das gemeinsame Thema.
        </p>

        {loading ? (
          <p className="text-sm text-text-secondary">Lade...</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-status-churned/10 px-3 py-2 text-sm text-status-churned"
              >
                {error}
              </div>
            )}
            {note && (
              <div className="rounded-xl bg-status-customer/10 px-3 py-2 text-sm text-status-customer">
                {note}
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Mein ntfy-Thema
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                aria-label="Mein ntfy-Thema"
                placeholder="z. B. minicrm-a7f3k2m9x1"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="glass-input w-full rounded-xl px-3 py-2.5 font-mono text-sm text-text-bright"
              />
            </label>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTopic(suggestTopic())}
                className="text-xs text-text-secondary underline-offset-2 transition-colors hover:text-text-bright hover:underline"
              >
                Zufälliges vorschlagen
              </button>
              {savedTopic && (
                <button
                  type="button"
                  onClick={() => setTopic("")}
                  className="text-xs text-text-secondary underline-offset-2 transition-colors hover:text-status-churned hover:underline"
                >
                  Abbestellen
                </button>
              )}
            </div>

            {/*
              Wer es kennt, liest mit — deshalb der Hinweis direkt am Feld und
              nicht irgendwo in einer Anleitung.
            */}
            <p className="text-[11px] leading-relaxed text-text-secondary/80">
              Das Thema ist gleichzeitig das Passwort: wer es kennt, kann deine
              Übersicht mitlesen. Nimm einen langen, zufälligen Namen.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm text-text-secondary transition-colors hover:text-text-bright"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy || !savedTopic || unsaved}
                title={
                  unsaved
                    ? "Erst speichern, dann testen"
                    : !savedTopic
                      ? "Erst ein Thema hinterlegen"
                      : undefined
                }
                className="glass-chip rounded-xl px-4 py-2.5 text-sm text-text-bright transition-all disabled:opacity-40"
              >
                Probe senden
              </button>
              <button
                type="submit"
                disabled={busy || !unsaved}
                className="btn-shimmer flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Moment..." : "Speichern"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
