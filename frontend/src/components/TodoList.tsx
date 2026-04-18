import { useState } from "react";

interface Todo {
  title: string;
  done: boolean;
  priority: string;
}

interface TodoListProps {
  todos: Map<string, unknown>;
  onAdd: (value: Todo) => void;
  onRemove: (elementId: string) => void;
}

export default function TodoList({ todos, onAdd, onRemove }: TodoListProps) {
  const [newTitle, setNewTitle] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAdd({ title: newTitle.trim(), done: false, priority: "MEDIUM" });
    setNewTitle("");
  }

  const entries = Array.from(todos.entries());

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-text-bright">Todos</h3>

      <form onSubmit={handleAdd} className="mb-3 flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Neues Todo..."
          className="glass-input flex-1 rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
        />
        <button
          type="submit"
          className="btn-shimmer rounded-lg px-3 py-2 text-sm font-medium text-white active:scale-95 transition-all"
        >
          +
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-xs text-text-secondary">Keine Todos vorhanden.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(([id, raw]) => {
            const todo = raw as Todo;
            return (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg bg-white/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      todo.priority === "HIGH"
                        ? "bg-status-churned"
                        : todo.priority === "LOW"
                          ? "bg-status-customer"
                          : "bg-status-lead"
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      todo.done
                        ? "line-through text-text-secondary"
                        : "text-text-bright"
                    }`}
                  >
                    {todo.title}
                  </span>
                </div>
                <button
                  onClick={() => onRemove(id)}
                  className="text-xs text-text-secondary hover:text-status-churned transition-colors"
                >
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
