import { useCallback, useEffect, useState } from "react";
import { storageApi, type StorageFile } from "../services/api";

/**
 * Auswahldialog für eine Datei aus dem Samba-Share.
 *
 * Bewusst nur Auswählen, kein Hochladen: die Rechnung muss vorher im Storage
 * liegen. Dadurch bleibt der Share die einzige Ablage und es entstehen keine
 * Dubletten neben der Buchhaltung.
 */
export default function StoragePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (file: { path: string; name: string }) => void;
}) {
  const [path, setPath] = useState("");
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((target: string) => {
    setLoading(true);
    setError(null);
    storageApi
      .list(target)
      .then(setFiles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    load(path);
  }, [open, path, load]);

  // Escape schließt den Dialog
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const segments = path ? path.split("/").filter(Boolean) : [];

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      load(path);
      return;
    }
    setLoading(true);
    setError(null);
    storageApi
      .search(query.trim())
      .then(setFiles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  const visible = files.filter((f) => f.directory || !f.name.startsWith("."));

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Rechnung auswählen"
        className="glass-strong fixed left-1/2 top-1/2 z-[81] flex max-h-[80vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-bright">Rechnung auswählen</h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-lg p-1 text-text-secondary transition-colors hover:text-text-bright"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={runSearch} className="mb-3 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Im Share suchen..."
            aria-label="Im Share suchen"
            className="glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-text-bright"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white"
          >
            Suchen
          </button>
        </form>

        {/* Breadcrumb */}
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-text-secondary">
          <button
            onClick={() => setPath("")}
            className="rounded px-1.5 py-0.5 transition-colors hover:text-text-bright"
          >
            Share
          </button>
          {segments.map((seg, i) => (
            <span key={`${seg}-${i}`} className="flex items-center gap-1">
              <span>/</span>
              <button
                onClick={() => setPath(segments.slice(0, i + 1).join("/"))}
                className="rounded px-1.5 py-0.5 transition-colors hover:text-text-bright"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {error && (
          <p className="mb-2 rounded-xl bg-status-churned/10 px-3 py-2 text-xs text-status-churned">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white/30 p-1">
          {loading ? (
            <p className="px-3 py-4 text-xs text-text-secondary">Lade...</p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-secondary">Nichts gefunden.</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>
                  <button
                    onClick={() =>
                      file.directory
                        ? setPath(path ? `${path}/${file.name}` : file.name)
                        : onSelect({
                            path: path ? `${path}/${file.name}` : file.name,
                            name: file.name,
                          })
                    }
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/60"
                  >
                    <span className="shrink-0 text-base">{file.directory ? "📁" : "📄"}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-bright">{file.name}</span>
                    {!file.directory && (
                      <span className="shrink-0 font-mono text-[10px] text-text-secondary">
                        {formatSize(file.size)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-2 text-[11px] text-text-secondary">
          Die Datei muss bereits im Share liegen. Hochladen geht unter Misc → Storage.
        </p>
      </div>
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
