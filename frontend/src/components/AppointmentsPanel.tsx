import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi } from "../services/api";
import { subscribe } from "../services/websocket";
import CustomerMentionInput from "./CustomerMentionInput";
import type { Appointment, Customer, User } from "../types";

/** Leeres Formular mit sinnvoller Vorbelegung: morgen um 10. */
function emptyForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    title: "",
    date: tomorrow.toISOString().slice(0, 10),
    time: "10:00",
    location: "",
    description: "",
    customerId: "",
    customerName: "",
  };
}

type FormState = ReturnType<typeof emptyForm>;

/**
 * Termine mit Erinnerung. Der Pi schickt zwei und einen Tag vorher eine
 * Push-Nachricht — dafür muss er laufen, was er ohnehin tut.
 */
export default function AppointmentsPanel({
  user,
  customers,
}: {
  user: User;
  customers: Customer[];
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const reload = useCallback(() => {
    appointmentsApi
      .list()
      .then(setAppointments)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    appointmentsApi
      .list()
      .then(setAppointments)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = subscribe("/topic/appointments", () => {
      clearTimeout(timeout);
      timeout = setTimeout(reload, 500);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [reload]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    return {
      upcoming: appointments.filter((a) => new Date(a.startsAt) >= now),
      past: appointments.filter((a) => new Date(a.startsAt) < now).reverse(),
    };
  }, [appointments]);

  function patch(changes: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...changes }));
  }

  function reset() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date) return;
    setError(null);

    const payload: Partial<Appointment> = {
      title: form.title.trim(),
      // Jackson liest daraus eine lokale Zeit ohne Zeitzonen-Umrechnung
      startsAt: `${form.date}T${form.time || "00:00"}:00`,
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined,
      customerId: form.customerId || undefined,
      customerName: form.customerName || undefined,
      createdBy: user.id,
      createdByUsername: user.username,
    };

    try {
      if (editingId) {
        await appointmentsApi.update(editingId, payload);
      } else {
        await appointmentsApi.create(payload);
      }
      reset();
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(appointment: Appointment) {
    setEditingId(appointment.id);
    setError(null);
    setForm({
      title: appointment.title,
      date: appointment.startsAt.slice(0, 10),
      time: appointment.startsAt.slice(11, 16),
      location: appointment.location ?? "",
      description: appointment.description ?? "",
      customerId: appointment.customerId ?? "",
      customerName: appointment.customerName ?? "",
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Termin wirklich löschen?")) return;
    try {
      await appointmentsApi.delete(id);
      if (editingId === id) reset();
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="text-sm text-text-secondary">Lade Termine...</p>;

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl bg-status-churned/10 px-4 py-3 text-sm text-status-churned">
          {error}
        </div>
      )}

      <div className={`glass mb-6 rounded-2xl p-4 sm:p-5 ${editingId ? "ring-2 ring-accent/40" : ""}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-bright">
            {editingId ? "Termin bearbeiten" : "Neuer Termin"}
          </h2>
          {editingId && (
            <button onClick={reset} className="text-xs text-text-secondary hover:text-text-bright">
              Abbrechen
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <CustomerMentionInput
            value={form.title}
            onChange={(title) => patch({ title })}
            customers={customers}
            linkedCustomerName={form.customerId ? form.customerName : undefined}
            onPick={(c) => patch({ customerId: c.id, customerName: c.name })}
            onUnlink={() => patch({ customerId: "", customerName: "" })}
            placeholder="Worum geht es? — @ verknüpft einen Kunden"
            aria-label="Titel"
            required
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Datum</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => patch({ date: e.target.value })}
                required
                aria-label="Datum"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Uhrzeit</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => patch({ time: e.target.value })}
                aria-label="Uhrzeit"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11px] text-text-secondary">Ort oder Link</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => patch({ location: e.target.value })}
                placeholder="Büro, Adresse, Videolink..."
                aria-label="Ort"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>
          </div>

          <textarea
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder="Notizen zum Termin (optional)"
            aria-label="Beschreibung"
            className="glass-input w-full resize-none rounded-xl px-3 py-2.5 text-sm text-text-bright"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="btn-shimmer rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              {editingId ? "Speichern" : "Termin anlegen"}
            </button>
            <span className="text-[11px] text-text-secondary">
              Erinnerung kommt 2 Tage und 1 Tag vorher aufs Handy.
            </span>
          </div>
        </form>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-text-secondary">Keine anstehenden Termine.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((a) => (
            <AppointmentRow
              key={a.id}
              appointment={a}
              canEdit={user.role === "ADMIN" || a.createdBy === user.id}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-bright"
          >
            <svg
              className={`h-4 w-4 transition-transform ${showPast ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Vergangen ({past.length})
          </button>

          {showPast && (
            <ul className="space-y-2 opacity-60">
              {past.map((a) => (
                <AppointmentRow
                  key={a.id}
                  appointment={a}
                  canEdit={user.role === "ADMIN" || a.createdBy === user.id}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  canEdit,
  onEdit,
  onDelete,
}: {
  appointment: Appointment;
  canEdit: boolean;
  onEdit: (a: Appointment) => void;
  onDelete: (id: string) => void;
}) {
  const start = new Date(appointment.startsAt);
  const countdown = describeCountdown(start);

  return (
    <li className="glass flex items-start gap-3 rounded-xl px-4 py-3">
      {/* Datumsblock */}
      <div className="shrink-0 text-center">
        <p className="text-[10px] font-medium uppercase text-text-secondary">
          {start.toLocaleDateString("de-DE", { month: "short" })}
        </p>
        <p className="font-mono text-lg font-bold leading-none text-text-bright">
          {start.getDate()}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-text-secondary">
          {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-text-bright">{appointment.title}</span>
          {appointment.customerId && appointment.customerName && (
            <Link
              to={`/customers/${appointment.customerId}`}
              className="rounded-full bg-status-prospect/15 px-2 py-0.5 text-[10px] font-medium text-status-prospect transition-colors hover:bg-status-prospect/25"
            >
              @{appointment.customerName}
            </Link>
          )}
          {countdown && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              {countdown}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[11px] text-text-secondary">
          {start.toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          {appointment.location ? ` · ${appointment.location}` : ""}
          {appointment.createdByUsername ? ` · ${appointment.createdByUsername}` : ""}
        </p>

        {appointment.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">
            {appointment.description}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onEdit(appointment)}
            aria-label={`${appointment.title} bearbeiten`}
            className="rounded-lg p-1.5 text-text-secondary transition-all hover:bg-accent/10 hover:text-accent"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(appointment.id)}
            aria-label={`${appointment.title} löschen`}
            className="rounded-lg p-1.5 text-text-secondary transition-all hover:bg-status-churned/10 hover:text-status-churned"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

/** "heute" / "morgen" / "in 3 Tagen" — null für alles, was weiter weg oder vorbei ist. */
function describeCountdown(start: Date): string | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) return null;
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days <= 7) return `in ${days} Tagen`;
  return null;
}
