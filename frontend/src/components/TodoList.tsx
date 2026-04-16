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
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dim active:scale-95 transition-all"
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
                className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      todo.priority === "HIGH"
                        ? "bg-[#ff453a]"
                        : todo.priority === "LOW"
                          ? "bg-[#30d158]"
                          : "bg-[#ff9f0a]"
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
                  className="text-xs text-text-secondary hover:text-[#ff453a] transition-colors"
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
