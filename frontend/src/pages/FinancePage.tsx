import { useEffect, useState } from "react";
import { financeApi, type FinanceStats } from "../services/api";
import { subscribe } from "../services/websocket";
import type { User, FinanceEntry } from "../types";

export default function FinancePage({ user }: { user: User }) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function reload() { financeApi.list().then(setEntries); financeApi.stats().then(setStats); }

  useEffect(() => {
    Promise.all([financeApi.list(), financeApi.stats()])
      .then(([e, s]) => { setEntries(e); setStats(s); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/finance", () => { clearTimeout(timeout); timeout = setTimeout(reload, 500); });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !description.trim()) return;
    const created = await financeApi.create({ amount: parsed, type, description: description.trim(), date, createdBy: user.id, createdByUsername: user.username });
    setEntries((prev) => [created, ...prev]);
    financeApi.stats().then(setStats);
    setAmount(""); setDescription("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await financeApi.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    financeApi.stats().then(setStats);
  }

  if (loading) return <p className="text-sm text-text-secondary">Lade Finanzen...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Finanzen</h1>

      {stats && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <StatCard label="Einnahmen" value={stats.totalIncome} color="text-status-customer" />
            <StatCard label="Ausgaben" value={stats.totalExpense} color="text-status-churned" />
            <StatCard label="Gewinn" value={stats.profit} color={stats.profit >= 0 ? "text-accent" : "text-status-churned"} />
          </div>

          {stats.perUser.length > 0 && (
            <div className="glass mb-8 rounded-2xl p-5">
              <h2 className="mb-3 text-sm font-semibold text-text-bright">Pro Person</h2>
              <div className="overflow-hidden rounded-xl border border-white/40">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/40 text-xs uppercase tracking-wider text-text-secondary">
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 text-right font-medium">Einnahmen</th>
                      <th className="px-4 py-2.5 text-right font-medium">Ausgaben</th>
                      <th className="px-4 py-2.5 text-right font-medium">Gewinn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perUser.map((u) => (
                      <tr key={u.username} className="border-b border-white/30 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-text-bright">{u.username}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-status-customer">{formatCurrency(u.income)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-status-churned">{formatCurrency(u.expense)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${u.profit >= 0 ? "text-accent" : "text-status-churned"}`}>{formatCurrency(u.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="glass mb-6 rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-bright">Neuer Eintrag</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <select value={type} onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")} className="glass-input rounded-xl px-3 py-2.5 text-sm text-text-bright">
            <option value="INCOME">Einnahme</option>
            <option value="EXPENSE">Ausgabe</option>
          </select>
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" required className="glass-input w-32 rounded-xl px-3 py-2.5 text-sm text-text-bright" />
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beschreibung" required className="glass-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm text-text-bright" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-sm text-text-bright" />
          <button type="submit" className="btn-shimmer rounded-xl px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition-all">Hinzufügen</button>
        </form>
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-bright">Einträge</h2>
        {entries.length === 0 ? (
          <p className="text-xs text-text-secondary">Keine Einträge vorhanden.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/40 text-xs uppercase tracking-wider text-text-secondary">
                  <th className="px-5 py-3 font-medium">Datum</th>
                  <th className="px-5 py-3 font-medium">Typ</th>
                  <th className="px-5 py-3 font-medium">Beschreibung</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 text-right font-medium">Betrag</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/30 last:border-0 transition-colors hover:bg-white/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">{new Date(entry.date).toLocaleDateString("de-DE")}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.type === "INCOME" ? "bg-status-customer/10 text-status-customer" : "bg-status-churned/10 text-status-churned"}`}>
                        {entry.type === "INCOME" ? "Einnahme" : "Ausgabe"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-bright">{entry.description}</td>
                    <td className="px-5 py-3.5 text-xs text-text-secondary">{entry.createdByUsername ?? "—"}</td>
                    <td className={`px-5 py-3.5 text-right font-mono ${entry.type === "INCOME" ? "text-status-customer" : "text-status-churned"}`}>
                      {entry.type === "EXPENSE" ? "−" : "+"}{formatCurrency(entry.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {entry.createdBy === user.id && (
                        <button onClick={() => handleDelete(entry.id)} title="Löschen" className="rounded-lg p-1.5 text-text-secondary hover:bg-status-churned/10 hover:text-status-churned transition-all">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
