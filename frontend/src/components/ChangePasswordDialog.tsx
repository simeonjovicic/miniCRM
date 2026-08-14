import { useEffect, useState } from "react";
import { authApi } from "../services/api";

/**
 * Passwort ändern.
 *
 * Das aktuelle Passwort wird mit abgefragt, damit an einem offen stehenden
 * Rechner niemand einfach das Passwort übernehmen kann.
 */
export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
    setDone(false);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1200);
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
        aria-label="Passwort ändern"
        className="glass-strong fixed left-1/2 top-1/2 z-[81] w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
      >
        <h2 className="mb-4 text-sm font-semibold text-text-bright">Passwort ändern</h2>

        {done ? (
          <p className="text-sm text-status-customer">Passwort geändert.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="rounded-xl bg-status-churned/10 px-3 py-2 text-sm text-status-churned">
                {error}
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Aktuelles Passwort
              </span>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                aria-label="Aktuelles Passwort"
                autoFocus
                required
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Neues Passwort
              </span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                aria-label="Neues Passwort"
                required
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Noch einmal
              </span>
              <input
                type="password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                aria-label="Neues Passwort wiederholen"
                required
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm text-text-secondary transition-colors hover:text-text-bright"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-shimmer flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Moment..." : "Ändern"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
