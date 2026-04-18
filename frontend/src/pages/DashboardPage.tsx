import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardApi, type DashboardStats } from "../services/api";
import { subscribe } from "../services/websocket";
import type { User, Customer } from "../types";
import CustomerStatusBadge from "../components/CustomerStatusBadge";

type ContributorPresence = {
  userId: string;
  username: string;
  online: boolean;
  lastSeenAt: string | null;
};

/** Gibt eine lesbare relative Zeit auf Deutsch zurück, z.B. "vor 5 Min" */
function formatRelative(iso: string | null): string {
  if (!iso) return "noch nie online";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std`;
  return `vor ${Math.floor(diffH / 24)} d`;
}

export default function DashboardPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [contributors, setContributors] = useState<ContributorPresence[]>([]);

  useEffect(() => {
    dashboardApi.stats().then((data) => {
      setStats(data);
      setContributors(data.onlineUsers);
    });
  }, []);

  useEffect(() => {
    const unsub = subscribe("/topic/presence/online", (data) => {
      setContributors(data as ContributorPresence[]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/customers", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => dashboardApi.stats().then(setStats), 2000);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  if (!stats) return <p className="text-sm text-text-secondary">Lade Dashboard...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kunden gesamt" value={stats.totalCustomers} />
        <StatCard label="Leads" value={stats.leads} color="text-[#c77d08]" />
        <StatCard label="Prospects" value={stats.prospects} color="text-[#1a8fc4]" />
        <StatCard label="Aktive Kunden" value={stats.activeCustomers} color="text-[#1fa03f]" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass col-span-2 rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">Zuletzt erstellt</h2>
          {stats.recentCustomers.length === 0 ? (
            <p className="text-xs text-text-secondary">Keine Kunden vorhanden.</p>
          ) : (
            <ul className="space-y-2">
              {stats.recentCustomers.map((c) => (
                <li
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 px-4 py-3 transition-all hover:bg-white/65 active:scale-[0.995]"
                >
                  <div>
                    <span className="text-sm font-medium text-text-bright">{c.name}</span>
                    <span className="ml-3 font-mono text-xs text-text-secondary">
                      {new Date(c.createdAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  <CustomerStatusBadge status={c.status as Customer["status"]} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">Mitglieder</h2>
          {contributors.length === 0 ? (
            <p className="text-xs text-text-secondary">Noch keine Mitglieder bekannt.</p>
          ) : (
            <ul className="space-y-2.5">
              {contributors.map((u) => {
                // Always treat the currently logged-in user as online —
                // the REST snapshot may arrive before the WebSocket reconnects
                // after a page refresh, which would incorrectly mark self as offline.
                const isOnline = u.online || u.userId === user.id;
                return (
                  <li key={u.userId} className="flex items-center gap-3">
                    {isOnline ? (
                      /* Pulsierender grüner Dot — online */
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-customer opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-status-customer" />
                      </span>
                    ) : (
                      /* Statischer grauer Dot — offline */
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
                      </span>
                    )}
                    <span className={`text-sm ${isOnline ? "text-text-bright" : "text-text-secondary"}`}>
                      {u.username}
                      {u.userId === user.id && (
                        <span className="ml-1.5 text-xs opacity-60">(du)</span>
                      )}
                    </span>
                    {!isOnline && (
                      <span className="ml-auto text-[11px] text-text-secondary opacity-70">
                        {formatRelative(u.lastSeenAt)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "text-text-bright" }: { label: string; value: number; color?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
