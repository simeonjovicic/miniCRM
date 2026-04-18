import { useEffect, useState } from "react";
import { customersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import type { Customer } from "../types";

type Status = Customer["status"];

const STATUS_LABELS: Record<Status, string> = {
  LEAD: "Leads",
  PROSPECT: "Prospects",
  CUSTOMER: "Kunden",
  CHURNED: "Churned",
};

const STATUS_COLORS: Record<Status, string> = {
  LEAD: "bg-[#ff9f0a]",
  PROSPECT: "bg-[#007aff]",
  CUSTOMER: "bg-[#30d158]",
  CHURNED: "bg-[#ff453a]",
};

const STATUS_TEXT: Record<Status, string> = {
  LEAD: "text-[#c77d08]",
  PROSPECT: "text-[#1a8fc4]",
  CUSTOMER: "text-[#1fa03f]",
  CHURNED: "text-[#ff453a]",
};

export default function AnalyticsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    customersApi.list().then(setCustomers);
  }

  useEffect(() => {
    customersApi.list().then(setCustomers).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/customers", () => {
      clearTimeout(timeout);
      timeout = setTimeout(reload, 1000);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-text-secondary">Lade Analyse...</p>;
  }

  const total = customers.length;
  const byStatus = (s: Status) => customers.filter((c) => c.status === s);
  const count = (s: Status) => byStatus(s).length;
  const pct = (s: Status) => (total > 0 ? ((count(s) / total) * 100).toFixed(1) : "0");

  const conversionRate =
    total > 0
      ? (((count("CUSTOMER") + count("CHURNED")) / total) * 100).toFixed(1)
      : "0";
  const churnRate =
    count("CUSTOMER") + count("CHURNED") > 0
      ? ((count("CHURNED") / (count("CUSTOMER") + count("CHURNED"))) * 100).toFixed(1)
      : "0";
  const retentionRate = (100 - parseFloat(churnRate)).toFixed(1);

  // Monthly new customers (last 6 months)
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
    const monthCustomers = customers.filter((c) => {
      const cd = new Date(c.createdAt);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    });
    months.push({ label, count: monthCustomers.length });
  }
  const maxMonthly = Math.max(...months.map((m) => m.count), 1);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Analyse</h1>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Gesamt" value={total} />
        <KpiCard label="Conversion-Rate" value={`${conversionRate}%`} sub="Lead → Kunde/Churned" />
        <KpiCard label="Churn-Rate" value={`${churnRate}%`} color="text-[#ff453a]" />
        <KpiCard label="Retention" value={`${retentionRate}%`} color="text-[#30d158]" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Distribution */}
        <div className="glass rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">Status-Verteilung</h2>

          {/* Bar chart */}
          <div className="mb-4 flex items-end gap-3" style={{ height: 120 }}>
            {(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as Status[]).map((s) => {
              const h = total > 0 ? (count(s) / total) * 100 : 0;
              return (
                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-xs text-text-bright">{count(s)}</span>
                  <div
                    className={`w-full rounded-t-md ${STATUS_COLORS[s]} transition-all`}
                    style={{ height: `${Math.max(h, 4)}%`, minHeight: 4 }}
                  />
                  <span className="text-[10px] text-text-secondary">{STATUS_LABELS[s]}</span>
                </div>
              );
            })}
          </div>

          {/* Detail rows */}
          <div className="space-y-2">
            {(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as Status[]).map((s) => (
              <div key={s} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[s]}`} />
                  <span className="text-sm text-text-bright">{STATUS_LABELS[s]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm font-semibold ${STATUS_TEXT[s]}`}>
                    {count(s)}
                  </span>
                  <span className="w-12 text-right font-mono text-xs text-text-secondary">
                    {pct(s)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="glass rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">Neue Kunden (6 Monate)</h2>
          <div className="flex items-end gap-2" style={{ height: 160 }}>
            {months.map((m) => {
              const h = (m.count / maxMonthly) * 100;
              return (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-xs text-text-bright">
                    {m.count > 0 ? m.count : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-accent transition-all"
                    style={{ height: `${Math.max(h, 3)}%`, minHeight: 3 }}
                  />
                  <span className="text-[10px] text-text-secondary">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pipeline funnel */}
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">Pipeline</h2>
          <div className="space-y-2">
            {(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as Status[]).map((s) => {
              const w = total > 0 ? (count(s) / total) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-text-secondary">{STATUS_LABELS[s]}</span>
                  <div className="flex-1">
                    <div
                      className={`h-6 rounded-md ${STATUS_COLORS[s]}/20 flex items-center px-2 transition-all`}
                      style={{ width: `${Math.max(w, 3)}%` }}
                    >
                      <span className={`font-mono text-xs font-medium ${STATUS_TEXT[s]}`}>
                        {count(s)}
                      </span>
                    </div>
                  </div>
                  <span className="w-12 text-right font-mono text-xs text-text-secondary">
                    {pct(s)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color = "text-text-bright",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-text-secondary">{sub}</p>}
    </div>
  );
}
