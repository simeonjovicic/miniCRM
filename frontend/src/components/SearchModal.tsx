import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { customersApi, todosApi, financeApi, storageApi } from "../services/api";
import type { Customer, TodoItem, FinanceEntry } from "../types";

interface SearchResult {
  type: "customer" | "todo" | "finance" | "file";
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<{
    customers: Customer[];
    todos: TodoItem[];
    finance: FinanceEntry[];
  } | null>(null);

  // Load all data once when modal opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedIdx(0);
    setLoading(true);

    Promise.all([customersApi.list(), todosApi.list(), financeApi.list()])
      .then(([c, t, f]) => {
        dataRef.current = { customers: c, todos: t, finance: f };
      })
      .finally(() => setLoading(false));

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      setSelectedIdx(0);

      if (!q.trim() || !dataRef.current) {
        setResults([]);
        return;
      }

      const lower = q.toLowerCase();
      const found: SearchResult[] = [];

      // Search customers
      for (const c of dataRef.current.customers) {
        if (
          c.name.toLowerCase().includes(lower) ||
          c.company?.toLowerCase().includes(lower) ||
          c.email?.toLowerCase().includes(lower)
        ) {
          found.push({
            type: "customer",
            id: c.id,
            title: c.name,
            subtitle: [c.company, c.status].filter(Boolean).join(" · "),
            path: `/customers/${c.id}`,
          });
        }
      }

      // Search todos
      for (const t of dataRef.current.todos) {
        if (
          t.title.toLowerCase().includes(lower) ||
          t.notes?.toLowerCase().includes(lower)
        ) {
          found.push({
            type: "todo",
            id: t.id,
            title: t.title,
            subtitle: [
              t.done ? "Erledigt" : "Offen",
              t.createdByUsername,
            ]
              .filter(Boolean)
              .join(" · "),
            path: "/todos",
          });
        }
      }

      // Search finance
      for (const f of dataRef.current.finance) {
        if (f.description.toLowerCase().includes(lower)) {
          found.push({
            type: "finance",
            id: f.id,
            title: f.description,
            subtitle: `${f.type === "INCOME" ? "Einnahme" : "Ausgabe"} · ${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(f.amount)}`,
            path: "/finance",
          });
        }
      }

      setResults(found.slice(0, 10));

      // Debounced storage search (async, hits backend)
      if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
      if (q.trim().length >= 2) {
        storageTimerRef.current = setTimeout(() => {
          storageApi.search(q.trim()).then((files) => {
            const fileResults: SearchResult[] = files.map((f) => {
              const parts = f.name.split("/");
              const fileName = parts[parts.length - 1];
              const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
              return {
                type: "file" as const,
                id: f.name,
                title: fileName,
                subtitle: [
                  f.directory ? "Ordner" : formatFileSize(f.size),
                  folder ? `in ${folder}` : "Storage",
                ].join(" · "),
                path: "/storage",
              };
            });
            setResults((prev) => [
              ...prev.filter((r) => r.type !== "file"),
              ...fileResults,
            ].slice(0, 15));
          }).catch(() => { /* ignore storage search errors */ });
        }, 300);
      }
    },
    [],
  );

  function handleSelect(result: SearchResult) {
    onClose();
    navigate(result.path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const TYPE_ICON: Record<string, { label: string; color: string }> = {
    customer: { label: "Kunde", color: "bg-accent/10 text-accent" },
    todo: { label: "Todo", color: "bg-[#ff9f0a]/10 text-[#c77d08]" },
    finance: { label: "Finanzen", color: "bg-[#30d158]/10 text-[#1fa03f]" },
    file: { label: "Datei", color: "bg-[#5856d6]/10 text-[#5856d6]" },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-[20%] z-[201] w-full max-w-lg -translate-x-1/2">
        <div className="glass-strong overflow-hidden rounded-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-white/40 px-4 py-3">
            <svg
              className="h-5 w-5 shrink-0 text-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => search(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Kunden, Todos, Finanzen, Dateien suchen..."
              className="flex-1 bg-transparent text-sm text-text-bright outline-none placeholder:text-text-secondary"
            />
            <kbd className="glass-chip rounded-md px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">
                Laden...
              </p>
            ) : query && results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">
                Keine Ergebnisse für "{query}"
              </p>
            ) : !query ? (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">
                Tippe, um zu suchen...
              </p>
            ) : (
              <ul>
                {results.map((r, i) => {
                  const icon = TYPE_ICON[r.type];
                  return (
                    <li key={`${r.type}-${r.id}`}>
                      <button
                        onClick={() => handleSelect(r)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          i === selectedIdx ? "bg-accent/10" : "hover:bg-white/50"
                        }`}
                      >
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${icon.color}`}
                        >
                          {icon.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-bright">
                            {r.title}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {r.subtitle}
                          </p>
                        </div>
                        {i === selectedIdx && (
                          <kbd className="glass-chip rounded-md px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                            ↵
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="flex items-center gap-4 border-t border-white/40 px-4 py-2 text-[11px] text-text-secondary">
              <span>
                <kbd className="glass-chip rounded px-1 py-0.5 font-mono">↑↓</kbd>{" "}
                navigieren
              </span>
              <span>
                <kbd className="glass-chip rounded px-1 py-0.5 font-mono">↵</kbd>{" "}
                öffnen
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
