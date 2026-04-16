import { useEffect, useState } from "react";
import { financeApi, type FinanceStats } from "../services/api";
import { subscribe } from "../services/websocket";
import type { User, FinanceEntry } from "../types";

export default function FinancePage({ user }: { user: User }) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function reload() {
    financeApi.list().then(setEntries);
    financeApi.stats().then(setStats);
  }

  useEffect(() => {
    Promise.all([financeApi.list(), financeApi.stats()])
      .then(([e, s]) => {
        setEntries(e);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  // Live updates
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/finance", () => {
      clearTimeout(timeout);
      timeout = setTimeout(reload, 500);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !description.trim()) return;

    const created = await financeApi.create({
      amount: parsed,
      type,
      description: description.trim(),
      date,
      createdBy: user.id,
      createdByUsername: user.username,
    });
    setEntries((prev) => [created, ...prev]);
    financeApi.stats().then(setStats);
    setAmount("");
    setDescription("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await financeApi.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    financeApi.stats().then(setStats);
  }

  if (loading) {
    return <p className="text-sm text-text-secondary">Lade Finanzen...</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Finanzen</h1>

      {/* Stats Overview */}
      {stats && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <StatCard
              label="Einnahmen"
              value={stats.totalIncome}
              color="text-[#30d158]"
            />
            <StatCard
              label="Ausgaben"
              value={stats.totalExpense}
              color="text-[#ff453a]"
            />
            <StatCard
              label="Gewinn"
              value={stats.profit}
              color={stats.profit >= 0 ? "text-[#007aff]" : "text-[#ff453a]"}
            />
          </div>

          {/* Per User Breakdown */}
          {stats.perUser.length > 0 && (
            <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-text-bright">
                Pro Person
              </h2>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary">
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 text-right font-medium">Einnahmen</th>
                      <th className="px-4 py-2.5 text-right font-medium">Ausgaben</th>
                      <th className="px-4 py-2.5 text-right font-medium">Gewinn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perUser.map((u) => (
                      <tr
                        key={u.username}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-2.5 font-medium text-text-bright">
                          {u.username}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[#30d158]">
                          {formatCurrency(u.income)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[#ff453a]">
                          {formatCurrency(u.expense)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono ${u.profit >= 0 ? "text-[#007aff]" : "text-[#ff453a]"}`}
                        >
                          {formatCurrency(u.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Entry Form */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-bright">
          Neuer Eintrag
        </h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")}
            className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="INCOME">Einnahme</option>
            <option value="EXPENSE">Ausgabe</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Betrag"
            required
            className="w-32 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschreibung"
            required
            className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dim active:scale-[0.98] transition-all"
          >
            Hinzufügen
          </button>
        </form>
      </div>

      {/* Entries List */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text-bright">
          Einträge
        </h2>
        {entries.length === 0 ? (
          <p className="text-xs text-text-secondary">Keine Einträge vorhanden.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary">
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
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-bg"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">
                      {new Date(entry.date).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          entry.type === "INCOME"
                            ? "bg-[#30d158]/10 text-[#30d158]"
                            : "bg-[#ff453a]/10 text-[#ff453a]"
                        }`}
                      >
                        {entry.type === "INCOME" ? "Einnahme" : "Ausgabe"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-bright">
                      {entry.description}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-text-secondary">
                      {entry.createdByUsername ?? "—"}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-mono ${
                        entry.type === "INCOME"
                          ? "text-[#30d158]"
                          : "text-[#ff453a]"
                      }`}
                    >
                      {entry.type === "EXPENSE" ? "−" : "+"}
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {entry.createdBy === user.id && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-xs text-text-secondary hover:text-[#ff453a] transition-colors"
                        >
                          Löschen
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
