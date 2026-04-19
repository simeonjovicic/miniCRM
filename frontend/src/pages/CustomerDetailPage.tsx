import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { customersApi } from "../services/api";
import type { Customer } from "../types";
import { useCrdt } from "../hooks/useCrdt";
import CustomerStatusBadge from "../components/CustomerStatusBadge";
import EditableField from "../components/EditableField";
import NotesList from "../components/NotesList";
import ContactCounter from "../components/ContactCounter";
import PresenceIndicator from "../components/PresenceIndicator";

const STATUSES: Customer["status"][] = [
  "LEAD",
  "PROSPECT",
  "CUSTOMER",
  "CHURNED",
];

export default function CustomerDetailPage({
  userId,
}: {
  userId: string;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const nodeId = useMemo(() => `client-${userId}`, [userId]);

  const crdt = useCrdt("CUSTOMER", id ?? "", nodeId);

  useEffect(() => {
    if (!id) return;
    customersApi
      .get(id)
      .then(setCustomer)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!id || !confirm("Kunde wirklich löschen?")) return;
    await customersApi.delete(id);
    navigate("/customers");
  }

  function handleStatusChange(newStatus: string) {
    crdt.setField("status", newStatus);
  }

  useEffect(() => {
    if (crdt.deleted) {
      navigate("/customers");
    }
  }, [crdt.deleted, navigate]);

  if (loading) {
    return <p className="text-sm text-text-secondary">Lade...</p>;
  }
  if (!customer) {
    return <p className="text-sm text-[#ff453a]">Kunde nicht gefunden.</p>;
  }

  const displayName = crdt.getField("name") || customer.name;
  const displayStatus =
    (crdt.getField("status") as Customer["status"]) || customer.status;

  return (
    <div>
      <button
        onClick={() => navigate("/customers")}
        className="mb-4 text-sm text-text-secondary hover:text-accent transition-colors"
      >
        &larr; Zurück zur Liste
      </button>

      <div className="glass rounded-2xl p-6">
        {/* Presence */}
        {id && (
          <div className="mb-4">
            <PresenceIndicator customerId={id} currentUserId={userId} />
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-bright">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Erstellt am{" "}
              {new Date(customer.createdAt).toLocaleDateString("de-DE")}
            </p>
          </div>
          <CustomerStatusBadge status={displayStatus} />
        </div>

        {/* Editable Fields */}
        <div className="grid grid-cols-2 gap-4">
          <EditableField
            label="Name"
            value={crdt.getField("name") || customer.name}
            onChange={(v) => crdt.setField("name", v)}
          />
          <EditableField
            label="Firma"
            value={crdt.getField("company") || customer.company || ""}
            onChange={(v) => crdt.setField("company", v)}
          />
          <EditableField
            label="Email"
            value={crdt.getField("email") || customer.email || ""}
            type="email"
            onChange={(v) => crdt.setField("email", v)}
          />
          <EditableField
            label="Telefon"
            value={crdt.getField("phone") || customer.phone || ""}
            type="tel"
            onChange={(v) => crdt.setField("phone", v)}
          />
          <EditableField
            label="Adresse"
            value={crdt.getField("address") || customer.address || ""}
            onChange={(v) => crdt.setField("address", v)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Status</label>
            <select
              value={displayStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm text-text-bright outline-none focus:ring-2 focus:ring-accent/20 transition-all"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contact Counter */}
        <div className="mt-6 border-t border-white/40 pt-6">
          <ContactCounter
            label="Kontaktaufnahmen"
            value={crdt.getCounter("contactCount")}
            onIncrement={() => crdt.incrementCounter("contactCount")}
            onDecrement={() => crdt.decrementCounter("contactCount")}
          />
        </div>

        {/* Notizen */}
        <div className="mt-6 border-t border-white/40 pt-6">
          <NotesList
            notes={crdt.todos}
            onAdd={(note) => crdt.addTodo(note)}
            onRemove={(elemId) => crdt.removeTodo(elemId)}
          />
        </div>

        {/* Actions */}
        <div className="mt-6 border-t border-white/40 pt-6">
          <button
            onClick={handleDelete}
            className="rounded-xl border border-[#ff453a]/30 px-4 py-2 text-sm font-medium text-[#ff453a] hover:bg-[#ff453a]/5 active:scale-[0.98] transition-all"
          >
            Kunde löschen
          </button>
        </div>
      </div>
    </div>
  );
}
