import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardApi, type DashboardStats } from "../services/api";
import { subscribe } from "../services/websocket";
import type { User, Customer } from "../types";
import CustomerStatusBadge from "../components/CustomerStatusBadge";

export default function DashboardPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<
    { userId: string; username: string }[]
  >([]);

  useEffect(() => {
    dashboardApi.stats().then((data) => {
      setStats(data);
      setOnlineUsers(data.onlineUsers);
    });
  }, []);

  useEffect(() => {
    const unsub = subscribe("/topic/presence/online", (data) => {
      setOnlineUsers(data as { userId: string; username: string }[]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/customers", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        dashboardApi.stats().then(setStats);
      }, 2000);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  if (!stats) {
    return <p className="text-sm text-text-secondary">Lade Dashboard...</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Dashboard</h1>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kunden gesamt" value={stats.totalCustomers} />
        <StatCard label="Leads" value={stats.leads} color="text-[#c77d08]" />
        <StatCard label="Prospects" value={stats.prospects} color="text-[#1a8fc4]" />
        <StatCard label="Aktive Kunden" value={stats.activeCustomers} color="text-[#1fa03f]" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Customers */}
        <div className="col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">
            Zuletzt erstellt
          </h2>
          {stats.recentCustomers.length === 0 ? (
            <p className="text-xs text-text-secondary">Keine Kunden vorhanden.</p>
          ) : (
            <ul className="space-y-2">
              {stats.recentCustomers.map((c) => (
                <li
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="flex cursor-pointer items-center justify-between rounded-xl bg-bg px-4 py-3 transition-all hover:bg-card-hover active:scale-[0.995]"
                >
                  <div>
                    <span className="text-sm font-medium text-text-bright">
                      {c.name}
                    </span>
                    <span className="ml-3 font-mono text-xs text-text-secondary">
                      {new Date(c.createdAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  <CustomerStatusBadge
                    status={c.status as Customer["status"]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Online Users */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">
            Online
          </h2>
          {onlineUsers.length === 0 ? (
            <p className="text-xs text-text-secondary">Niemand online.</p>
          ) : (
            <ul className="space-y-2">
              {onlineUsers.map((u) => (
                <li key={u.userId} className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#30d158]" />
                  </span>
                  <span className="text-sm text-text-bright">{u.username}</span>
                  {u.userId === user.id && (
                    <span className="text-xs text-text-secondary">(du)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-text-bright",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>
        {value}
      </p>
    </div>
  );
}
