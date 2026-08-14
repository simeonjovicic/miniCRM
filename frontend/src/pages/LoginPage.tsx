import { useEffect, useState } from "react";
import { authApi, type LoginCandidate } from "../services/api";
import type { User } from "../types";

/**
 * Anmeldung mit Passwort.
 *
 * Drei Zustände:
 * <ul>
 *   <li>Es gibt noch keinen Benutzer → der erste wird angelegt</li>
 *   <li>Benutzer hat noch kein Passwort → er legt eines fest</li>
 *   <li>Sonst → Passwort eingeben</li>
 * </ul>
 *
 * Benutzer anlegen kann man hier bewusst nur, solange es gar keinen gibt —
 * vorher war das offen und damit die Hintertür ins ganze System.
 */
export default function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [candidates, setCandidates] = useState<LoginCandidate[]>([]);
  const [selected, setSelected] = useState<LoginCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    authApi
      .candidates()
      .then(setCandidates)
      .catch(() => setError("Backend nicht erreichbar"))
      .finally(() => setLoading(false));
  }, []);

  function reset() {
    setSelected(null);
    setPassword("");
    setPasswordAgain("");
    setError("");
  }

  async function run(action: () => Promise<User>) {
    setBusy(true);
    setError("");
    try {
      onLogin(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    run(() => authApi.login(selected.username, password));
  }

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (password !== passwordAgain) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    run(() => authApi.setPassword(selected.username, password));
  }

  function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordAgain) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    run(() => authApi.bootstrap(username, email, password));
  }

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="glass-strong w-full max-w-md rounded-2xl p-8">
        <h1 className="mb-1 text-2xl font-bold text-text-bright">MiniCRM</h1>
        {children}
      </div>
    </div>
  );

  if (loading) return shell(<p className="text-sm text-text-secondary">Lade...</p>);

  const errorBox = error && (
    <div className="mb-4 rounded-xl bg-status-churned/10 p-3 text-sm text-status-churned">
      {error}
    </div>
  );

  // ── Frische Installation: den ersten Benutzer anlegen ────────────
  if (candidates.length === 0) {
    return shell(
      <>
        <p className="mb-6 text-sm text-text-secondary">
          Noch kein Benutzer vorhanden — leg den ersten an.
        </p>
        {errorBox}
        <form onSubmit={handleBootstrap} className="space-y-4">
          <Field label="Benutzername" value={username} onChange={setUsername} autoFocus required />
          <Field label="E-Mail" type="email" value={email} onChange={setEmail} required />
          <Field label="Passwort" type="password" value={password} onChange={setPassword} required />
          <Field
            label="Passwort wiederholen"
            type="password"
            value={passwordAgain}
            onChange={setPasswordAgain}
            required
          />
          <Submit busy={busy}>Anlegen und anmelden</Submit>
        </form>
      </>,
    );
  }

  // ── Benutzer auswählen ───────────────────────────────────────────
  if (!selected) {
    return shell(
      <>
        <p className="mb-6 text-sm text-text-secondary">Wer bist du?</p>
        {errorBox}
        <div className="space-y-2">
          {candidates.map((c) => (
            <button
              key={c.username}
              onClick={() => {
                setSelected(c);
                setError("");
              }}
              className="glass-chip flex w-full items-center justify-between rounded-xl p-3 text-left transition-all hover:bg-white/60 active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                  {c.username[0].toUpperCase()}
                </span>
                <span className="text-sm font-medium text-text-bright">{c.username}</span>
              </span>
              {!c.hasPassword && (
                <span className="rounded-full bg-status-lead/15 px-2 py-0.5 text-[11px] font-medium text-status-lead">
                  Passwort fehlt
                </span>
              )}
            </button>
          ))}
        </div>
      </>,
    );
  }

  // ── Erstes Passwort festlegen ────────────────────────────────────
  if (!selected.hasPassword) {
    return shell(
      <>
        <p className="mb-1 text-sm text-text-bright">
          Hallo <strong>{selected.username}</strong>
        </p>
        <p className="mb-6 text-sm text-text-secondary">
          Für dich ist noch kein Passwort gesetzt. Leg jetzt eins fest, mindestens 8 Zeichen.
        </p>
        {errorBox}
        <form onSubmit={handleSetPassword} className="space-y-4">
          <Field label="Neues Passwort" type="password" value={password} onChange={setPassword} autoFocus required />
          <Field
            label="Noch einmal"
            type="password"
            value={passwordAgain}
            onChange={setPasswordAgain}
            required
          />
          <div className="flex gap-2">
            <BackButton onClick={reset} />
            <Submit busy={busy}>Festlegen und anmelden</Submit>
          </div>
        </form>
      </>,
    );
  }

  // ── Anmelden ─────────────────────────────────────────────────────
  return shell(
    <>
      <p className="mb-6 text-sm text-text-secondary">
        Hallo <strong className="text-text-bright">{selected.username}</strong>
      </p>
      {errorBox}
      <form onSubmit={handleLogin} className="space-y-4">
        <Field label="Passwort" type="password" value={password} onChange={setPassword} autoFocus required />
        <div className="flex gap-2">
          <BackButton onClick={reset} />
          <Submit busy={busy}>Anmelden</Submit>
        </div>
      </form>
    </>,
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        autoFocus={autoFocus}
        required={required}
        autoComplete={type === "password" ? "current-password" : "off"}
        className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
      />
    </label>
  );
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="btn-shimmer flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
    >
      {busy ? "Moment..." : children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-chip rounded-xl px-4 py-2.5 text-sm font-medium text-text-bright transition-all hover:bg-white/60"
    >
      Zurück
    </button>
  );
}
