import { useEffect, useState, useRef, useCallback } from "react";
import { todosApi, customersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import type { User, TodoItem, Customer } from "../types";

const PRIORITY_COLORS = {
  HIGH: "bg-[#ff453a]",
  MEDIUM: "bg-[#ff9f0a]",
  LOW: "bg-[#30d158]",
};

export default function TodosPage({ user }: { user: User }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [filterUser, setFilterUser] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  function reload() {
    todosApi.list().then(setTodos);
  }

  useEffect(() => {
    Promise.all([todosApi.list(), customersApi.list()])
      .then(([t, c]) => {
        setTodos(t);
        setCustomers(c);
      })
      .finally(() => setLoading(false));
  }, []);

  // Live updates
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/todos", () => {
      clearTimeout(timeout);
      timeout = setTimeout(reload, 500);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  // Also reload customers on changes
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/customers", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => customersApi.list().then(setCustomers), 1000);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);

      const cursor = e.target.selectionStart ?? val.length;

      // Find the last @ before cursor
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");

      if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " ")) {
        const query = before.slice(atIdx + 1).toLowerCase();
        const matches = customers.filter((c) =>
          c.name.toLowerCase().includes(query),
        );
        if (matches.length > 0 && query.length > 0) {
          setSuggestions(matches.slice(0, 5));
          setSelectedIdx(0);
          setMentionStart(atIdx);
          return;
        }
      }

      setSuggestions([]);
      setMentionStart(null);
    },
    [customers],
  );

  function insertMention(customer: Customer) {
    if (mentionStart === null) return;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionStart);
    const after = input.slice(cursor);
    const newVal = `${before}${customer.name} ${after}`;
    setInput(newVal);
    setSuggestions([]);
    setMentionStart(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      if (suggestions.length > 0) {
        e.preventDefault();
        insertMention(suggestions[selectedIdx]);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setMentionStart(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (suggestions.length > 0) return; // don't submit while picking
    if (!input.trim()) return;
    const created = await todosApi.create({
      title: input.trim(),
      done: false,
      priority: "MEDIUM",
      createdBy: user.id,
      createdByUsername: user.username,
    });
    setTodos((prev) => [created, ...prev]);
    setInput("");
    setSuggestions([]);
    setMentionStart(null);
    inputRef.current?.focus();
  }

  async function handleToggleDone(todo: TodoItem) {
    const updated = await todosApi.update(todo.id, { ...todo, done: !todo.done });
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }

  async function handleUpdate(id: string, changes: Partial<TodoItem>) {
    const updated = await todosApi.update(id, changes as Partial<TodoItem>);
    setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }

  async function handleDelete(id: string) {
    await todosApi.delete(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  // Unique users for filter
  const users = Array.from(
    new Map(
      todos.map((t) => [t.createdBy, t.createdByUsername ?? t.createdBy]),
    ),
  );

  const byUser =
    filterUser === "ALL" ? todos : todos.filter((t) => t.createdBy === filterUser);

  const byPriority =
    filterPriority === "ALL" ? byUser : byUser.filter((t) => t.priority === filterPriority);

  const openTodos = byPriority.filter((t) => !t.done);
  const completedTodos = byPriority.filter((t) => t.done);
  const totalOpen = todos.filter((t) => !t.done).length;

  if (loading) {
    return <p className="text-sm text-text-secondary">Lade Todos...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold text-text-bright">Todos</h1>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
          {totalOpen} offen
        </span>
      </div>

      {/* Apple-style input bar with autocomplete */}
      <form onSubmit={handleAdd} className="relative z-10 mb-6">
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Neues Todo hinzufügen... (@Kunde für Erwähnung)"
          className="glass-input w-full rounded-xl px-4 py-3 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
        />

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && (
          <div className="glass-strong absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl shadow-lg">
            {suggestions.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => insertMention(c)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === selectedIdx
                    ? "bg-accent/10 text-accent"
                    : "text-text-bright hover:bg-white/50"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                  {c.name[0].toUpperCase()}
                </span>
                <span className="font-medium">{c.name}</span>
                {c.company && (
                  <span className="text-xs text-text-secondary">
                    {c.company}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {/* Priority filter */}
        <div className="flex items-center gap-1.5">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filterPriority === p
                  ? "bg-accent text-white"
                  : "glass-chip text-text-secondary hover:text-text-bright"
              }`}
            >
              {p !== "ALL" && (
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_COLORS[p]}`} />
              )}
              {p === "ALL" ? "Alle" : p === "HIGH" ? "Hoch" : p === "MEDIUM" ? "Mittel" : "Niedrig"}
            </button>
          ))}
        </div>

        {/* User filter (only when multiple users) */}
        {users.length > 1 && (
          <>
            <span className="text-border">|</span>
            <button
              onClick={() => setFilterUser("ALL")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filterUser === "ALL"
                  ? "bg-accent text-white"
                  : "glass-chip text-text-secondary hover:text-text-bright"
              }`}
            >
              Alle
            </button>
            {users.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setFilterUser(id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  filterUser === id
                    ? "bg-accent text-white"
                    : "glass-chip text-text-secondary hover:text-text-bright"
                }`}
              >
                {name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Open todos */}
      {openTodos.length === 0 ? (
        <p className="text-sm text-text-secondary">Keine offenen Todos.</p>
      ) : (
        <ul className="space-y-1">
          {openTodos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onToggle={handleToggleDone}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              customers={customers}
              userId={user.id}
            />
          ))}
        </ul>
      )}

      {/* Completed section */}
      {completedTodos.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setCompletedExpanded((v) => !v)}
            className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-bright transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform ${completedExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Erledigt ({completedTodos.length})
          </button>

          {completedExpanded && (
            <ul className="space-y-1 opacity-60">
              {completedTodos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  onToggle={handleToggleDone}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  customers={customers}
                  userId={user.id}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  expandedId,
  setExpandedId,
  onToggle,
  onUpdate,
  onDelete,
  customers,
  userId,
}: {
  todo: TodoItem;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onToggle: (todo: TodoItem) => void;
  onUpdate: (id: string, changes: Partial<TodoItem>) => void;
  onDelete: (id: string) => void;
  customers: Customer[];
  userId: string;
}) {
  return (
    <li>
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
          expandedId === todo.id ? "glass" : "hover:bg-white/40"
        }`}
      >
        <button
          onClick={() => onToggle(todo)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
            todo.done
              ? "border-accent bg-accent text-white"
              : "border-border hover:border-accent/50"
          }`}
        >
          {todo.done && (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_COLORS[todo.priority]}`} />

        <button
          onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`truncate text-sm ${todo.done ? "text-text-secondary line-through" : "text-text-bright"}`}>
            <HighlightMentions
              text={todo.title}
              customerNames={customers.map((c) => c.name)}
              dimmed={todo.done}
            />
          </span>
          {todo.dueDate && (
            <span className="shrink-0 font-mono text-[11px] text-text-secondary">
              {new Date(todo.dueDate).toLocaleDateString("de-DE")}
            </span>
          )}
        </button>

        <span className="shrink-0 text-[11px] text-text-secondary">{todo.createdByUsername}</span>
      </div>

      {expandedId === todo.id && (
        <TodoDetail
          todo={todo}
          isOwner={todo.createdBy === userId}
          customerNames={customers.map((c) => c.name)}
          onUpdate={(changes) => onUpdate(todo.id, changes)}
          onDelete={() => onDelete(todo.id)}
        />
      )}
    </li>
  );
}

/** Renders text with @CustomerName highlighted in accent color */
function HighlightMentions({
  text,
  customerNames,
  dimmed,
}: {
  text: string;
  customerNames: string[];
  dimmed?: boolean;
}) {
  if (customerNames.length === 0) return <>{text}</>;

  // Build regex that matches customer names (with or without @ prefix)
  const escaped = customerNames.map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`(@?(?:${escaped.join("|")}))`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span
            key={i}
            className={dimmed ? "text-accent/50" : "font-semibold text-accent"}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function TodoDetail({
  todo,
  isOwner,
  customerNames,
  onUpdate,
  onDelete,
}: {
  todo: TodoItem;
  isOwner: boolean;
  customerNames: string[];
  onUpdate: (changes: Partial<TodoItem>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState(todo.priority);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");
  const [notes, setNotes] = useState(todo.notes ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  function save(changes: Partial<TodoItem>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(changes), 400);
  }

  return (
    <div className="ml-4 mr-2 mb-2 glass rounded-xl p-3 sm:ml-11 sm:mr-4 sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Titel</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              save({ title: e.target.value });
            }}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          />
          {/* Preview with highlights */}
          {customerNames.some((n) => title.toLowerCase().includes(`@${n.toLowerCase()}`)) && (
            <p className="mt-1.5 text-xs text-text-secondary">
              Vorschau:{" "}
              <HighlightMentions text={title} customerNames={customerNames} />
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Priorität</label>
          <select
            value={priority}
            onChange={(e) => {
              const v = e.target.value as TodoItem["priority"];
              setPriority(v);
              onUpdate({ priority: v });
            }}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="LOW">Niedrig</option>
            <option value="MEDIUM">Mittel</option>
            <option value="HIGH">Hoch</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Fällig am</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              onUpdate({ dueDate: e.target.value || null });
            }}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Notizen</label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              save({ notes: e.target.value });
            }}
            rows={2}
            className="glass-input w-full resize-none rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          />
        </div>
      </div>
      {isOwner && (
        <button
          onClick={onDelete}
          title="Todo löschen"
          className="mt-3 rounded-lg p-1.5 text-text-secondary hover:bg-status-churned/10 hover:text-status-churned transition-all"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      )}
    </div>
  );
}
