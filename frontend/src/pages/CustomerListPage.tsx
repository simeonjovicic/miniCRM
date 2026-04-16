import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { customersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import type { Customer, User } from "../types";
import CustomerStatusBadge from "../components/CustomerStatusBadge";

export default function CustomerListPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const reload = useCallback(() => {
    customersApi.list().then(setCustomers);
  }, []);

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
  }, [reload]);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const created = await customersApi.create({
      name: newName,
      company: newCompany || null,
      email: newEmail || null,
      createdBy: user.id,
    });
    setCustomers((prev) => [...prev, created]);
    setNewName("");
    setNewCompany("");
    setNewEmail("");
    setShowCreate(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-bright">Kunden</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim active:scale-[0.98] transition-all"
        >
          {showCreate ? "Abbrechen" : "+ Neuer Kunde"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="grid grid-cols-3 gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name *"
              required
              className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Firma"
              className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
          </div>
          <button
            type="submit"
            className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim active:scale-[0.98] transition-all"
          >
            Erstellen
          </button>
        </form>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Suche nach Name oder Firma..."
        className="mb-4 w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
      />

      {loading ? (
        <p className="text-sm text-text-secondary">Lade Kunden...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary">Keine Kunden gefunden.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Firma</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-text-bright">
                    {c.name}
                  </td>
                  <td className="px-5 py-3.5 text-text-secondary">{c.company ?? "—"}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">
                    {c.email ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <CustomerStatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
