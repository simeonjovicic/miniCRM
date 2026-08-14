import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { todosApi, customersApi, usersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import CustomerMentionInput from "../components/CustomerMentionInput";
import AppointmentsPanel from "../components/AppointmentsPanel";
import ErrorBanner from "../components/ErrorBanner";
import { useToast } from "../components/Toast";
import { RECURRENCE_LABELS } from "../types";
import { moveAfter, moveBefore, moveDown, moveUp } from "../utils/reorder";
import type { User, TodoItem, TodoComment, TodoRecurrence, Customer } from "../types";


export default function TodosPage({ user }: { user: User }) {
  const { show } = useToast();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [filterUser, setFilterUser] = useState<string>("ALL");
  /** Was gerade gezogen wird — null, solange niemand zieht. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  /** Kunde, der für das neue Todo per @ ausgewählt wurde */
  const [newCustomer, setNewCustomer] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<"TODOS" | "TERMINE">("TODOS");

  function reload() {
    todosApi
      .list()
      .then((t) => {
        setTodos(t);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    Promise.all([todosApi.list(), customersApi.list(), usersApi.list()])
      .then(([t, c, u]) => {
        setTodos(t);
        setCustomers(c);
        setMembers(u);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const created = await todosApi.create({
      title: input.trim(),
      done: false,
      customerId: newCustomer?.id,
      customerName: newCustomer?.name,
      createdBy: user.id,
      createdByUsername: user.username,
    });
    setTodos((prev) => [created, ...prev]);
    setInput("");
    setNewCustomer(null);
  }

  async function handleToggleDone(todo: TodoItem) {
    const updated = await todosApi.update(todo.id, { ...todo, done: !todo.done });
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }

  /**
   * Der Server ersetzt das Todo vollständig, deshalb wird der bestehende Stand
   * mitgeschickt. Nur die Änderung zu senden würde Fälligkeit, Notizen und die
   * Kundenverknüpfung löschen.
   */
  async function handleUpdate(id: string, changes: Partial<TodoItem>) {
    const current = todos.find((t) => t.id === id);
    if (!current) return;
    const updated = await todosApi.update(id, { ...current, ...changes });
    setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }

  /**
   * Warten an- und abschalten, mit Ansage.
   *
   * Die Zeile springt dabei in einen anderen Abschnitt — ohne Hinweis sieht das
   * aus, als wäre sie verschwunden.
   */
  async function handleToggleWaiting(todo: TodoItem) {
    const nowWaiting = !todo.waiting;
    await handleUpdate(todo.id, { waiting: nowWaiting });
    show(
      nowWaiting
        ? `„${todo.title}" wartet jetzt auf den Kunden — steht unten im eigenen Abschnitt`
        : `„${todo.title}" ist wieder dran`,
      "info",
    );
  }

  async function handleDelete(id: string) {
    await todosApi.delete(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  /**
   * Gefiltert wird nach Zustaendigkeit, nicht nach Ersteller — zu zweit ist
   * "was ist mein Ball" die interessante Frage. UNASSIGNED sind die, ueber die
   * noch niemand entschieden hat.
   */
  const byUser =
    filterUser === "ALL"
      ? todos
      : filterUser === "UNASSIGNED"
        ? todos.filter((t) => !t.assigneeId)
        : todos.filter((t) => t.assigneeId === filterUser);

  /**
   * Drei Listen statt zwei: Wartendes ist offen, aber nicht dran. Es zwischen
   * die anderen zu mischen, macht die obere Liste unbrauchbar für die Frage
   * "womit fange ich an".
   */
  const openTodos = byUser.filter((t) => !t.done && !t.waiting);
  const waitingTodos = byUser.filter((t) => !t.done && t.waiting);
  const completedTodos = byUser.filter((t) => t.done);
  const totalOpen = todos.filter((t) => !t.done).length;

  /** Alle offenen in der Gesamtreihenfolge — die Grundlage jedes Verschiebens. */
  const allOpenIds = todos.filter((t) => !t.done).map((t) => t.id);

  /**
   * Übernimmt eine neue Reihenfolge: erst sichtbar machen, dann speichern.
   *
   * Ohne das sofortige Umsortieren würde die Zeile beim Loslassen zurück-
   * springen und erst nach der Antwort an den neuen Platz hüpfen.
   */
  async function applyOrder(nextIds: string[]) {
    const byId = new Map(todos.map((t) => [t.id, t]));
    const moved = nextIds.map((id) => byId.get(id)).filter((t): t is TodoItem => !!t);
    const untouched = todos.filter((t) => !nextIds.includes(t.id));
    setTodos([...moved, ...untouched]);

    try {
      await todosApi.reorder(nextIds);
      setError(null);
    } catch (err) {
      // Serverstand holen, sonst zeigt die Liste eine Reihenfolge, die es nicht gibt
      setError((err as Error).message);
      reload();
    }
  }

  function handleDropOn(targetId: string) {
    const dragged = draggingId;
    setDraggingId(null);
    if (!dragged || dragged === targetId) return;

    // Nach unten ziehen heisst "dahinter", nach oben "davor" — sonst landet die
    // Zeile beim Ziehen nach unten eine Position zu weit oben.
    const from = allOpenIds.indexOf(dragged);
    const to = allOpenIds.indexOf(targetId);
    void applyOrder(
      from < to
        ? moveAfter(allOpenIds, dragged, targetId)
        : moveBefore(allOpenIds, dragged, targetId),
    );
  }

  if (loading) {
    return <p className="text-sm text-text-secondary">Lade Todos...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-white/50 p-1">
          <button
            onClick={() => setTab("TODOS")}
            aria-pressed={tab === "TODOS"}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
              tab === "TODOS" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-bright"
            }`}
          >
            Todos
            {totalOpen > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === "TODOS" ? "bg-white/25" : "bg-accent/15 text-accent"
                }`}
              >
                {totalOpen}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("TERMINE")}
            aria-pressed={tab === "TERMINE"}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
              tab === "TERMINE" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-bright"
            }`}
          >
            Termine
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={reload} />

      {tab === "TERMINE" && <AppointmentsPanel user={user} customers={customers} />}

      {tab === "TODOS" && (
        <>
        {/* Schnelleingabe — @ verknüpft einen Kunden */}
        <form onSubmit={handleAdd} className="relative z-10 mb-6">
          <CustomerMentionInput
            value={input}
            onChange={setInput}
            customers={customers}
            linkedCustomerName={newCustomer?.name}
            onPick={(c) => setNewCustomer({ id: c.id, name: c.name })}
            onUnlink={() => setNewCustomer(null)}
            placeholder="Neues Todo hinzufügen... (@ verknüpft einen Kunden)"
            aria-label="Neues Todo"
          />
        </form>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Zustaendigkeit — wessen Ball ist es */}
          {members.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Zuständigkeit filtern">
              <span className="text-border">|</span>
              {[
                { key: "ALL", label: "Alle" },
                { key: user.id, label: "Meine" },
                ...members
                  .filter((m) => m.id !== user.id)
                  .map((m) => ({ key: m.id, label: m.username })),
                { key: "UNASSIGNED", label: "Offen" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterUser(key)}
                  aria-pressed={filterUser === key}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    filterUser === key
                      ? "bg-accent text-white"
                      : "glass-chip text-text-secondary hover:text-text-bright"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Was dran ist — hier wird sortiert */}
        {openTodos.length === 0 ? (
          <p className="text-sm text-text-secondary">Keine offenen Todos.</p>
        ) : (
          <ul className="space-y-1" aria-label="Offene Todos">
            {openTodos.map((todo, index) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                onToggle={handleToggleDone}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                customers={customers}
                members={members}
                user={user}
                onToggleWaiting={() => handleToggleWaiting(todo)}
                sortable
                isFirst={index === 0}
                isLast={index === openTodos.length - 1}
                dragging={draggingId === todo.id}
                onDragStart={() => setDraggingId(todo.id)}
                onDragEnd={() => setDraggingId(null)}
                onDropOn={() => handleDropOn(todo.id)}
                onMoveUp={() =>
                  applyOrder(moveUp(allOpenIds, openTodos.map((t) => t.id), todo.id))
                }
                onMoveDown={() =>
                  applyOrder(moveDown(allOpenIds, openTodos.map((t) => t.id), todo.id))
                }
              />
            ))}
          </ul>
        )}

        {/*
          Wartendes steht abgesetzt darunter: es ist offen, aber man kann nichts
          tun — zwischen den anderen würde es die Liste nur verstopfen.
        */}
        {waitingTodos.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Wartet auf Kunden ({waitingTodos.length})
            </h2>
            <ul className="space-y-1 opacity-75" aria-label="Wartet auf Kunden">
              {waitingTodos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  onToggle={handleToggleDone}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  customers={customers}
                  members={members}
                  user={user}
                  onToggleWaiting={() => handleToggleWaiting(todo)}
                />
              ))}
            </ul>
          </div>
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
                    members={members}
                    user={user}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
        </>
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
  members,
  user,
  sortable = false,
  isFirst = false,
  isLast = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  onDropOn,
  onMoveUp,
  onMoveDown,
  onToggleWaiting,
}: {
  todo: TodoItem;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onToggle: (todo: TodoItem) => void;
  onUpdate: (id: string, changes: Partial<TodoItem>) => void;
  onDelete: (id: string) => void;
  customers: Customer[];
  members: User[];
  user: User;
  /** Nur in der Liste der offenen Todos — Wartendes und Erledigtes wird nicht sortiert. */
  sortable?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropOn?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggleWaiting?: () => void;
}) {
  return (
    <li
      draggable={sortable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={sortable ? (e) => e.preventDefault() : undefined}
      onDrop={
        sortable
          ? (e) => {
              e.preventDefault();
              onDropOn?.();
            }
          : undefined
      }
      className={dragging ? "opacity-40" : undefined}
    >
      <div
        className={`group flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
          expandedId === todo.id ? "glass" : "hover:bg-white/40"
        }`}
      >
        {sortable && (
          /*
            Ziehen geht nur mit der Maus. Die beiden Pfeile sind der Weg per
            Tastatur und auf dem Handy — ohne sie waere die Reihenfolge dort
            gar nicht zu aendern.
          */
          <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label={`"${todo.title}" nach oben`}
              className="text-text-secondary transition-colors hover:text-text-bright disabled:opacity-25"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              aria-label={`"${todo.title}" nach unten`}
              className="text-text-secondary transition-colors hover:text-text-bright disabled:opacity-25"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
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

        {/*
          Direkt anklickbar statt über den Detailbereich: den Zustand umzustellen
          ist der häufigste Handgriff daran.

          Immer sichtbar, nicht erst beim Überfahren: sonst findet man den Knopf
          nie, und am Handy gäbe es ihn faktisch gar nicht — dort gibt es kein
          Überfahren. Aus heisst blasse Uhr, an heisst gefülltes "wartet".
        */}
        {!todo.done && (
          <button
            onClick={() => onToggleWaiting?.()}
            aria-pressed={!!todo.waiting}
            aria-label={
              todo.waiting
                ? `"${todo.title}" wartet auf den Kunden — wieder aufnehmen`
                : `"${todo.title}" auf den Kunden warten lassen`
            }
            title={
              todo.waiting
                ? "Wartet auf den Kunden — klicken, um es wieder aufzunehmen"
                : "Auf den Kunden warten lassen — rutscht nach unten in den eigenen Abschnitt"
            }
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
              todo.waiting
                ? "bg-[#ff9f0a]/20 text-[#8a5600]"
                : "text-text-secondary/50 hover:bg-white/70 hover:text-text-bright"
            }`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {todo.waiting && "wartet"}
          </button>
        )}

        {todo.assigneeUsername && (
          <span
            title="Zuständig"
            className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
          >
            → {todo.assigneeUsername}
          </span>
        )}

        {todo.recurrence && todo.recurrence !== "NONE" && (
          <span
            title="Wiederkehrend — der nächste Durchlauf entsteht automatisch"
            className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
          >
            ↻ {RECURRENCE_LABELS[todo.recurrence]}
          </span>
        )}

        {todo.customerId && todo.customerName && (
          <Link
            to={`/customers/${todo.customerId}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-full bg-status-prospect/15 px-2 py-0.5 text-[10px] font-medium text-status-prospect transition-colors hover:bg-status-prospect/25"
          >
            @{todo.customerName}
          </Link>
        )}

        {todo.commentCount > 0 && (
          <button
            onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
            aria-label={`${todo.commentCount} Kommentare`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary transition-colors hover:text-text-bright"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {todo.commentCount}
          </button>
        )}

        <span className="shrink-0 text-[11px] text-text-secondary">{todo.createdByUsername}</span>
      </div>

      {expandedId === todo.id && (
        <TodoDetail
          todo={todo}
          user={user}
          members={members}
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
  user,
  members,
  customerNames,
  onUpdate,
  onDelete,
}: {
  todo: TodoItem;
  user: User;
  members: User[];
  customerNames: string[];
  onUpdate: (changes: Partial<TodoItem>) => void;
  onDelete: () => void;
}) {
  const isOwner = todo.createdBy === user.id;
  const [title, setTitle] = useState(todo.title);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [recurrence, setRecurrence] = useState<TodoRecurrence>(todo.recurrence ?? "NONE");
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
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Zuständig</label>
          <select
            value={todo.assigneeId ?? ""}
            onChange={(e) => {
              const member = members.find((m) => m.id === e.target.value);
              onUpdate({
                assigneeId: member?.id,
                assigneeUsername: member?.username,
              });
            }}
            aria-label="Zuständig"
            className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none transition-all focus:ring-2 focus:ring-accent/20"
          >
            <option value="">— niemand —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === user.id ? `${m.username} (du)` : m.username}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
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
          <label className="mb-1 block text-xs font-medium text-text-secondary">Wiederholung</label>
          <select
            value={recurrence}
            onChange={(e) => {
              const value = e.target.value as TodoRecurrence;
              setRecurrence(value);
              onUpdate({ recurrence: value });
            }}
            aria-label="Wiederholung"
            className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          >
            {(Object.keys(RECURRENCE_LABELS) as TodoRecurrence[]).map((r) => (
              <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
            ))}
          </select>
          {recurrence !== "NONE" && (
            <p className="mt-1 text-[11px] text-text-secondary">
              {dueDate
                ? "Beim Abhaken entsteht der nächste Durchlauf automatisch. Bleibt es liegen, kommt er nach Ablauf der Frist."
                : "Braucht ein Fälligkeitsdatum — sonst gibt es keinen nächsten Termin."}
            </p>
          )}
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
      <TodoComments todoId={todo.id} user={user} />

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

/**
 * Der Verlauf am Todo. Ersetzt die Absprache im Chat: die Wortmeldungen stehen
 * dort, wo die Aufgabe steht, und bleiben auch nach dem Abhaken erhalten.
 *
 * Geladen wird erst beim Aufklappen — die Liste zeigt nur den Zähler.
 */
function TodoComments({ todoId, user }: { todoId: string; user: User }) {
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    todosApi
      .comments(todoId)
      .then((c) => active && setComments(c))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [todoId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const created = await todosApi.addComment(todoId, {
        text: text.trim(),
        createdBy: user.id,
        createdByUsername: user.username,
      });
      setComments((prev) => [...prev, created]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await todosApi.deleteComment(todoId, id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mt-3 border-t border-white/40 pt-3">
      <p className="mb-2 text-xs font-medium text-text-secondary">
        Verlauf {comments.length > 0 && `(${comments.length})`}
      </p>

      {loading ? (
        <p className="text-xs text-text-secondary">Lade...</p>
      ) : (
        comments.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {comments.map((c) => (
              <li key={c.id} className="group flex items-baseline gap-2">
                <span className="shrink-0 text-xs font-semibold text-accent">
                  {c.createdByUsername ?? "?"}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-text-bright">
                  {c.text}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-text-secondary">
                  {formatCommentTime(c.createdAt)}
                </span>
                {c.createdBy === user.id && (
                  <button
                    onClick={() => remove(c.id)}
                    aria-label="Kommentar löschen"
                    className="shrink-0 text-[10px] text-text-secondary opacity-0 transition-opacity hover:text-status-churned group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Antworten..."
          aria-label="Kommentar schreiben"
          className="glass-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm text-text-bright outline-none transition-all focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
        >
          Senden
        </button>
      </form>
    </div>
  );
}

/** Heute nur die Uhrzeit, sonst zusätzlich das Datum. */
function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? time : `${date.toLocaleDateString("de-DE")} ${time}`;
}
