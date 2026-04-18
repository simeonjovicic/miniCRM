import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usersApi } from "../services/api";
import type { User } from "../types";

export default function LoginPage({
  onLogin,
}: {
  onLogin: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<User["role"]>("SALES");
  const [error, setError] = useState("");

  useEffect(() => {
    usersApi.list().then(setUsers).catch(() => setError("Backend nicht erreichbar"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const user = await usersApi.create({ username, email, role });
      onLogin(user);
      navigate("/");
    } catch {
      setError("User konnte nicht erstellt werden");
    }
  }

  function handleSelect(user: User) {
    onLogin(user);
    navigate("/");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="glass-strong w-full max-w-md rounded-2xl p-8">
        <h1 className="mb-1 text-2xl font-bold text-text-bright">
          MiniCRM
        </h1>
        <p className="mb-6 text-sm text-text-secondary">Melde dich an, um loszulegen.</p>

        {error && (
          <div className="mb-4 rounded-xl bg-[#ff453a]/10 p-3 text-sm text-[#ff453a]">
            {error}
          </div>
        )}

        {mode === "select" ? (
          <>
            <p className="mb-3 text-sm font-medium text-text-bright">User auswählen</p>
            {users.length === 0 ? (
              <p className="mb-4 text-sm text-text-secondary">
                Noch keine User vorhanden.
              </p>
            ) : (
              <div className="mb-4 space-y-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelect(u)}
                    className="glass-chip flex w-full items-center justify-between rounded-xl p-3 text-left hover:bg-white/60 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-text-bright">
                          {u.username}
                        </span>
                        <span className="ml-2 text-xs text-text-secondary">
                          {u.email}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setMode("create")}
              className="btn-shimmer w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition-all"
            >
              Neuen User erstellen
            </button>
          </>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-xs font-medium text-text-secondary">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-text-secondary">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </div>
            <div>
              <label htmlFor="role" className="mb-1 block text-xs font-medium text-text-secondary">Rolle</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as User["role"])}
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              >
                <option value="ADMIN">Admin</option>
                <option value="SALES">Sales</option>
                <option value="SUPPORT">Support</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("select")}
                className="glass-chip flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-text-bright hover:bg-white/60 transition-all"
              >
                Zurück
              </button>
              <button
                type="submit"
                className="btn-shimmer flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition-all"
              >
                Erstellen & Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
