import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  dashboardApi,
  type DashboardInvoice,
  type DashboardStats,
  type DashboardUserProfit,
  type UserPresence,
} from "../services/api";
import { subscribe } from "../services/websocket";
import ErrorBanner from "../components/ErrorBanner";
import type { User } from "../types";

/** Lesbare relative Zeit auf Deutsch, z.B. "vor 5 Min" */
function formatRelative(iso: string | null): string {
  if (!iso) return "noch nie online";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std`;
  return `vor ${Math.floor(diffH / 24)} d`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value ?? 0);
}

export default function DashboardPage({ user }: { user: User }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [presence, setPresence] = useState<UserPresence[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    dashboardApi
      .stats()
      .then((data) => {
        setStats(data);
        setPresence(data.onlineUsers);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => reload(), [reload]);

  // Anwesenheit kommt live, alles andere wird nach Änderungen nachgeladen
  useEffect(() => {
    const unsub = subscribe("/topic/presence/online", (data) =>
      setPresence(data as UserPresence[]),
    );
    return unsub;
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(reload, 1500);
    };
    const unsubs = [subscribe("/topic/todos", refresh), subscribe("/topic/finance", refresh)];
    return () => {
      unsubs.forEach((u) => u());
      clearTimeout(timeout);
    };
  }, [reload]);

  if (!stats) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-bright">Dashboard</h1>
        <ErrorBanner message={error} onRetry={reload} />
        {!error && <p className="text-sm text-text-secondary">Lade Dashboard...</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-text-bright">Dashboard</h1>
        <span className="text-xs text-text-secondary">Gewinn im Jahr {stats.year}</span>
      </div>

      <ErrorBanner message={error} onRetry={reload} />

      {/* Gewinn je Person */}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
        {stats.perUser.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Noch keine Finanzeinträge in {stats.year}.
          </p>
        ) : (
          stats.perUser.map((person) => <ProfitCard key={person.userId ?? person.username} person={person} />)
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-6">
        <OpenTodos stats={stats} />

        <div className="space-y-4 sm:space-y-6">
          <Members presence={presence} currentUserId={user.id} />
          <OpenInvoices stats={stats} />
        </div>
      </div>
    </div>
  );
}

function ProfitCard({ person }: { person: DashboardUserProfit }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-text-bright">{person.username}</span>
        <span
          className={`font-mono text-2xl font-bold ${
            person.profit >= 0 ? "text-accent" : "text-status-churned"
          }`}
        >
          {formatCurrency(person.profit)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-secondary">
        <span>
          Umsatz <span className="font-mono text-text-bright">{formatCurrency(person.revenueGross)}</span>
        </span>
        {person.openReceivables > 0 && (
          <span>
            offen <span className="font-mono text-status-lead">{formatCurrency(person.openReceivables)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function OpenTodos({ stats }: { stats: DashboardStats }) {
  const navigate = useNavigate();
  const hidden = stats.openTodoCount - stats.openTodos.length;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 lg:col-span-2">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Offene Todos</h2>
        <Link to="/todos" className="text-xs text-accent hover:underline">
          {stats.openTodoCount} offen
        </Link>
      </div>

      {stats.openTodos.length === 0 ? (
        <p className="text-xs text-text-secondary">Nichts offen — alles erledigt.</p>
      ) : (
        <ul className="space-y-1.5">
          {stats.openTodos.map((todo) => (
            <li
              key={todo.id}
              onClick={() => navigate("/todos")}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/40 px-4 py-2.5 transition-all hover:bg-white/65"
            >
                {/* Wartendes steht ohnehin am Ende — hier nur noch der Grund dafür */}
                {todo.waiting && (
                  <span
                    title="Wartet auf den Kunden"
                    className="shrink-0 rounded-full bg-[#ff9f0a]/15 px-2 py-0.5 text-[10px] font-medium text-[#b06f00]"
                  >
                    wartet
                  </span>
                )}
              <span className="min-w-0 flex-1 truncate text-sm text-text-bright">{todo.title}</span>

              {todo.customerName && (
                <span className="shrink-0 rounded-full bg-status-prospect/15 px-2 py-0.5 text-[10px] font-medium text-status-prospect">
                  @{todo.customerName}
                </span>
              )}
              {todo.dueDate && <DueDate date={todo.dueDate} />}
              <span className="shrink-0 text-[11px] text-text-secondary">
                {todo.createdByUsername}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-text-secondary">
          … und {hidden} weitere
        </p>
      )}
    </div>
  );
}

/** Überfällige Fristen sollen ins Auge springen, nicht nur dastehen. */
function DueDate({ date }: { date: string }) {
  const due = new Date(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);

  const label = days < 0 ? "überfällig" : days === 0 ? "heute" : days === 1 ? "morgen" : null;
  const overdue = days < 0;

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${
        overdue
          ? "bg-status-churned/15 text-status-churned"
          : days <= 1
            ? "bg-status-lead/15 text-status-lead"
            : "text-text-secondary"
      }`}
    >
      {label ?? due.toLocaleDateString("de-DE")}
    </span>
  );
}

function Members({
  presence,
  currentUserId,
}: {
  presence: UserPresence[];
  currentUserId: string;
}) {
  const onlineCount = presence.filter((u) => u.online || u.userId === currentUserId).length;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Mitglieder</h2>
        <span className="text-xs text-text-secondary">{onlineCount} online</span>
      </div>

      {presence.length === 0 ? (
        <p className="text-xs text-text-secondary">Noch keine Mitglieder bekannt.</p>
      ) : (
        <ul className="space-y-2.5">
          {presence.map((member) => {
            // Sich selbst immer als online zeigen: nach einem Reload kann der
            // REST-Stand vor der WebSocket-Verbindung da sein und würde einen
            // sonst fälschlich als offline führen.
            const isOnline = member.online || member.userId === currentUserId;
            return (
              <li key={member.userId} className="flex items-center gap-3">
                <span className="relative flex h-2 w-2 shrink-0">
                  {isOnline && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-customer opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isOnline ? "bg-status-customer" : "bg-slate-400"
                    }`}
                  />
                </span>
                <span className={`text-sm ${isOnline ? "text-text-bright" : "text-text-secondary"}`}>
                  {member.username}
                  {member.userId === currentUserId && (
                    <span className="ml-1.5 text-xs opacity-60">(du)</span>
                  )}
                </span>
                {!isOnline && (
                  <span className="ml-auto text-[11px] text-text-secondary opacity-70">
                    {formatRelative(member.lastSeenAt)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OpenInvoices({ stats }: { stats: DashboardStats }) {
  const hidden = stats.openInvoiceCount - stats.openInvoices.length;

  return (
    /*
      Die ganze Karte ist der Link in die Finanzen — nicht nur die Überschrift.
      Deshalb darf hier drin nichts weiter klickbar sein: verschachtelte Links
      sind ungültiges HTML. Die Rechnungszeilen sind reiner Text, das passt.
    */
    <Link
      to="/finance"
      className="glass block rounded-2xl p-4 transition-all hover:bg-white/60 active:scale-[0.99] sm:p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Unbezahlt</h2>
        <span className="font-mono text-xs font-semibold text-status-lead">
          {formatCurrency(stats.openInvoiceTotal)}
        </span>
      </div>

      {stats.openInvoices.length === 0 ? (
        <p className="text-xs text-text-secondary">Alles bezahlt.</p>
      ) : (
        <ul className="space-y-2">
          {stats.openInvoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-text-secondary">… und {hidden} weitere</p>
      )}
    </Link>
  );
}

function InvoiceRow({ invoice }: { invoice: DashboardInvoice }) {
  const daysOpen = Math.floor(
    (Date.now() - new Date(invoice.date).getTime()) / 86_400_000,
  );

  return (
    <li className="flex items-baseline gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-bright">{invoice.description}</p>
        <p className="text-[11px] text-text-secondary">
          {new Date(invoice.date).toLocaleDateString("de-DE")}
          {daysOpen > 0 ? ` · seit ${daysOpen} Tagen` : ""}
          {invoice.username ? ` · ${invoice.username}` : ""}
          {invoice.paid > 0 ? ` · ${formatCurrency(invoice.paid)} angezahlt` : ""}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold text-status-lead">
        {formatCurrency(invoice.open)}
      </span>
    </li>
  );
}
