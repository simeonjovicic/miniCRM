import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer } from "../types";

/**
 * Textfeld, das beim Tippen von "@" eine Kundenliste einblendet.
 *
 * Ausgewählt wird der Name in den Text eingesetzt und der Kunde separat
 * gemeldet — der Eintrag hängt danach an einer Kunden-ID, nicht an der
 * Schreibweise im Text. Wird die Verknüpfung wieder entfernt, bleibt der
 * getippte Text stehen; nur die Zuordnung fällt weg.
 */
export default function CustomerMentionInput({
  value,
  onChange,
  customers,
  linkedCustomerName,
  onPick,
  onUnlink,
  placeholder,
  "aria-label": ariaLabel,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  customers: Customer[];
  linkedCustomerName?: string;
  onPick: (customer: Customer) => void;
  onUnlink: () => void;
  placeholder?: string;
  "aria-label"?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /** Das gerade getippte @-Token samt Position, oder null wenn keins offen ist. */
  const [token, setToken] = useState<{ query: string; start: number; end: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [token, customers]);

  useEffect(() => setHighlight(0), [token?.query]);

  // Klick außerhalb schließt die Liste
  useEffect(() => {
    if (!token) return;
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setToken(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [token]);

  /** Sucht ein @-Token unmittelbar links vom Cursor. */
  function detectToken(text: string, caret: number) {
    const before = text.slice(0, caret);
    const match = /@([^\s@]*)$/u.exec(before);
    if (!match) return null;
    return { query: match[1], start: caret - match[0].length, end: caret };
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    onChange(text);
    setToken(detectToken(text, e.target.selectionStart ?? text.length));
  }

  function pick(customer: Customer) {
    const current = token;
    if (!current) return;

    const next = value.slice(0, current.start) + customer.name + value.slice(current.end);
    onChange(next);
    onPick(customer);
    setToken(null);

    // Cursor hinter den eingesetzten Namen setzen
    const caret = current.start + customer.name.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!token || matches.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Verhindert das Absenden des Formulars, solange die Liste offen ist
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setToken(null);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        required={required}
        autoComplete="off"
        className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
      />

      {linkedCustomerName && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
            @{linkedCustomerName}
          </span>
          <button
            type="button"
            onClick={onUnlink}
            className="text-[11px] text-text-secondary transition-colors hover:text-status-churned"
          >
            Verknüpfung lösen
          </button>
        </div>
      )}

      {token && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Kundenvorschläge"
          className="glass-strong absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl p-1"
        >
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(c)}
                className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  i === highlight ? "bg-accent text-white" : "text-text-bright hover:bg-white/50"
                }`}
              >
                <span className="truncate text-sm">{c.name}</span>
                {c.company && (
                  <span
                    className={`shrink-0 text-[11px] ${i === highlight ? "text-white/70" : "text-text-secondary"}`}
                  >
                    {c.company}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
