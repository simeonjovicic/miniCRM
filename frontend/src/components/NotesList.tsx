import { useState } from "react";

interface Note {
  text: string;
  createdAt: string;
}

interface NotesListProps {
  notes: Map<string, unknown>;
  onAdd: (value: Note) => void;
  onRemove: (elementId: string) => void;
}

export default function NotesList({ notes, onAdd, onRemove }: NotesListProps) {
  const [newText, setNewText] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    onAdd({ text: newText.trim(), createdAt: new Date().toISOString() });
    setNewText("");
  }

  const entries = Array.from(notes.entries()).sort((a, b) => {
    const dateA = (a[1] as Note).createdAt ?? "";
    const dateB = (b[1] as Note).createdAt ?? "";
    return dateB.localeCompare(dateA);
  });

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-text-bright">Notizen</h3>

      <form onSubmit={handleAdd} className="mb-3">
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd(e);
            }
          }}
          placeholder="Notiz hinzufuegen (z.B. Angebot, Gespraechsnotiz...)"
          rows={2}
          className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all resize-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-text-secondary">Cmd+Enter zum Speichern</span>
          <button
            type="submit"
            className="btn-shimmer rounded-lg px-3 py-1.5 text-[12px] font-medium text-white active:scale-95 transition-all"
          >
            Hinzufuegen
          </button>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="text-xs text-text-secondary">Keine Notizen vorhanden.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([id, raw]) => {
            const note = raw as Note;
            // Support old todo format gracefully
            const text = note.text ?? (raw as { title?: string }).title ?? "";
            const date = note.createdAt
              ? new Date(note.createdAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null;

            return (
              <li
                key={id}
                className="rounded-xl bg-white/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-text-bright whitespace-pre-wrap flex-1">
                    {text}
                  </p>
                  <button
                    onClick={() => onRemove(id)}
                    title="Entfernen"
                    className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-status-churned/10 hover:text-status-churned transition-all"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
                {date && (
                  <p className="mt-1.5 text-[11px] text-text-secondary">{date}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
