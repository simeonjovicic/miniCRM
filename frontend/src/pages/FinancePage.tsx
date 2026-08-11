import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { customersApi, financeApi, storageApi, usersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import { splitVat } from "../utils/vat";
import { VAT_RATES } from "../types";
import CustomerMentionInput from "../components/CustomerMentionInput";
import StoragePicker from "../components/StoragePicker";
import type {
  Customer,
  FinanceEntry,
  FinanceStats,
  FinanceStatus,
  FinanceType,
  FinanceUserStats,
  ThresholdProgress,
  User,
  VatInputMode,
} from "../types";

/**
 * Ein Eintrag hat im Formular nur noch EIN Zustandsfeld. Rechnung/Anzahlung und
 * gesendet/bezahlt sind dort zusammengefasst, weil sich die Kombinationen in der
 * Praxis nicht kreuzen: eine Anzahlung ist immer Geld, das schon da ist.
 */
type StatusChoice = "SENT" | "PAID" | "DEPOSIT";

const STATUS_CHOICES: { value: StatusChoice; label: string; forType?: FinanceType }[] = [
  { value: "SENT", label: "Gesendet" },
  { value: "PAID", label: "Bezahlt" },
  { value: "DEPOSIT", label: "Anzahlung", forType: "INCOME" },
];

/** Beschriftung eines gespeicherten Eintrags — bei Ausgaben heißt "gesendet" schlicht "offen". */
function statusLabel(entry: Pick<FinanceEntry, "kind" | "status" | "type">): string {
  if (entry.kind === "DEPOSIT") return "Anzahlung";
  if (entry.status === "PAID") return "Bezahlt";
  if (entry.status === "DRAFT") return "Entwurf";
  return entry.type === "EXPENSE" ? "Offen" : "Gesendet";
}

/** Leeres Formular. Ausgaben sind meist schon bezahlt, Einnahmen gerade rausgegangen. */
function emptyForm(type: FinanceType = "INCOME") {
  return {
    type,
    amount: "",
    inputMode: "GROSS" as VatInputMode,
    vatRate: 20,
    vatDeductible: true,
    description: "",
    date: new Date().toISOString().slice(0, 10),
    status: (type === "EXPENSE" ? "PAID" : "SENT") as StatusChoice,
    parentId: "",
    sharedWithUserId: "",
    customerId: "",
    customerName: "",
    attachmentPath: "",
    attachmentName: "",
  };
}

type FormState = ReturnType<typeof emptyForm>;

/** Auf Cent runden — gleiche Regel wie im Backend. */
function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function FinancePage({ user }: { user: User }) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [showSettings, setShowSettings] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Leer = alle Personen. Trennt die beiden Bücher in der Liste. */
  const [personFilter, setPersonFilter] = useState("");

  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    Promise.all([financeApi.list(), financeApi.stats(year)])
      .then(([e, s]) => {
        setEntries(e);
        setStats(s);
      })
      .catch((err: Error) => setError(err.message));
  }, [year]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      financeApi.list(),
      financeApi.stats(year),
      usersApi.list(),
      customersApi.list(),
    ])
      .then(([e, s, u, c]) => {
        setEntries(e);
        setStats(s);
        setUsers(u);
        setCustomers(c);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [year]);

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
  }, [reload]);

  /**
   * Beim Sprung in den Bearbeiten-Modus das Formular in den Blick holen und den
   * Cursor hineinsetzen. Als Effekt statt direkt im Klick-Handler, damit es erst
   * läuft, wenn das Formular die neuen Werte tatsächlich im DOM stehen hat.
   */
  useEffect(() => {
    if (!editingId) return;
    // scrollIntoView gibt es in jsdom nicht — im Test zählt nur der Fokus.
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    amountRef.current?.focus();
  }, [editingId]);

  /** Die anderen Personen — bei zwei Leuten genau eine. */
  const partners = useMemo(() => users.filter((u) => u.id !== user.id), [users, user.id]);

  /** Der gerade bearbeitete Eintrag, wenn er Teil einer geteilten Buchung ist. */
  const editingHalf = useMemo(() => {
    const entry = entries.find((e) => e.id === editingId);
    return entry?.splitGroupId ? entry : null;
  }, [entries, editingId]);

  /** Rechnungen, auf die eine Anzahlung gehen kann. */
  const invoiceOptions = useMemo(
    () =>
      entries.filter(
        (e) => e.type === "INCOME" && e.kind === "INVOICE" && e.id !== editingId,
      ),
    [entries, editingId],
  );

  const preview = useMemo(
    () => splitVat(parseFloat(form.amount) || 0, form.inputMode, form.vatRate),
    [form.amount, form.inputMode, form.vatRate],
  );

  /**
   * Was bei einer geteilten Einnahme bei wem landet.
   *
   * Gerechnet wie im Backend: der Partneranteil wird gerundet, der Rest bleibt
   * beim Ersteller — so gehen bei ungeraden Cent-Beträgen keine auf. Jede Hälfte
   * behält den USt-Satz und trägt dadurch ihre halbe USt, beide stehen also gleich.
   */
  const split = useMemo(() => {
    if (!form.sharedWithUserId || preview.gross <= 0) return null;

    const shareGross = toCents(preview.gross / 2);
    const share = splitVat(shareGross, "GROSS", form.vatRate);
    const partner = partners.find((p) => p.id === form.sharedWithUserId);

    return {
      partnerName: partner?.username ?? "Partner",
      fullGross: preview.gross,
      fullVat: preview.vat,
      shareGross,
      shareVat: share.vat,
      // Der Ersteller versteuert den vollen Umsatz und setzt den Anteil ab.
      myProfit: toCents(preview.net - share.net),
      partnerProfit: share.net,
    };
  }, [form.sharedWithUserId, form.vatRate, preview, partners]);

  const visibleEntries = useMemo(
    () => (personFilter ? entries.filter((e) => e.createdBy === personFilter) : entries),
    [entries, personFilter],
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current, current - 1, year]);
    entries.forEach((e) => years.add(new Date(e.date).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [entries, year]);

  function patch(changes: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...changes }));
  }

  /**
   * Beim Wechsel der Art den Status auf die übliche Vorgabe ziehen: Ausgaben hat
   * man schon bezahlt, Einnahmen sind gerade rausgegangen. Nebenbei erledigt das
   * den Fall "Anzahlung" — den gibt es bei Ausgaben nicht.
   */
  function changeType(type: FinanceType) {
    patch({
      type,
      status: type === "EXPENSE" ? "PAID" : "SENT",
      sharedWithUserId: type === "EXPENSE" ? "" : form.sharedWithUserId,
      parentId: type === "EXPENSE" ? "" : form.parentId,
    });
  }

  function buildPayload(): Partial<FinanceEntry> {
    const partner = partners.find((p) => p.id === form.sharedWithUserId);
    const isDeposit = form.status === "DEPOSIT";
    return {
      amount: parseFloat(form.amount),
      inputMode: form.inputMode,
      vatRate: form.vatRate,
      type: form.type,
      kind: isDeposit ? "DEPOSIT" : "INVOICE",
      // Eine Anzahlung ist Geld, das schon geflossen ist.
      status: isDeposit ? "PAID" : (form.status as FinanceStatus),
      description: form.description.trim(),
      date: form.date,
      vatDeductible: form.type === "EXPENSE" ? form.vatDeductible : undefined,
      parentId: isDeposit && form.parentId ? form.parentId : undefined,
      customerId: form.customerId || undefined,
      customerName: form.customerName || undefined,
      attachmentPath: form.attachmentPath || undefined,
      attachmentName: form.attachmentName || undefined,
      // Anweisung zum Aufteilen — beim Bearbeiten einer bestehenden Hälfte
      // entfällt sie, sonst würde nochmal halbiert.
      sharedWithUserId: editingHalf ? undefined : partner?.id,
      sharedWithUsername: editingHalf ? undefined : partner?.username,
      createdBy: user.id,
      createdByUsername: user.username,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(form.amount);
    if (!parsed || parsed <= 0 || !form.description.trim()) return;

    try {
      if (editingId) {
        await financeApi.update(editingId, buildPayload());
      } else {
        await financeApi.create(buildPayload());
      }
      setForm(emptyForm(form.type));
      setEditingId(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(entry: FinanceEntry) {
    setEditingId(entry.id);
    setError(null);
    setForm({
      type: entry.type,
      // Im Formular steht der Betrag so, wie er ursprünglich eingetippt wurde.
      amount: String(entry.inputMode === "NET" ? entry.netAmount : entry.amount),
      inputMode: entry.inputMode,
      vatRate: entry.vatRate,
      vatDeductible: entry.vatDeductible ?? true,
      description: entry.description,
      date: entry.date.slice(0, 10),
      // Altdaten können noch DRAFT sein — Entwürfe gibt es nicht mehr, die gelten als gesendet.
      status: entry.kind === "DEPOSIT" ? "DEPOSIT" : entry.status === "PAID" ? "PAID" : "SENT",
      parentId: entry.parentId ?? "",
      sharedWithUserId: entry.sharedWithUserId ?? "",
      customerId: entry.customerId ?? "",
      customerName: entry.customerName ?? "",
      attachmentPath: entry.attachmentPath ?? "",
      attachmentName: entry.attachmentName ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  /** Statuswechsel direkt aus der Liste, ohne Umweg über das Formular. */
  async function handleStatusChange(entry: FinanceEntry, choice: StatusChoice) {
    const isDeposit = choice === "DEPOSIT";

    if (entry.parentId && !isDeposit) {
      const ok = confirm(
        "Das ist eine Anzahlung auf eine Rechnung. Wenn du sie zu einer normalen " +
          "Buchung machst, geht die Verknüpfung verloren. Fortfahren?",
      );
      if (!ok) return;
    }

    setError(null);
    try {
      await financeApi.setStatus(
        entry.id,
        isDeposit ? "PAID" : (choice as FinanceStatus),
        isDeposit ? "DEPOSIT" : "INVOICE",
      );
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    const entry = entries.find((e) => e.id === id);
    const question = entry?.splitGroupId
      ? `Das ist eine Hälfte einer geteilten Buchung. Beide Hälften${
          entry.splitPartnerUsername ? ` (deine und die von ${entry.splitPartnerUsername})` : ""
        } werden gelöscht. Fortfahren?`
      : "Eintrag wirklich löschen?";
    if (!confirm(question)) return;
    setError(null);
    try {
      await financeApi.delete(id);
      if (editingId === id) cancelEdit();
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const canEdit = (entry: FinanceEntry) =>
    user.role === "ADMIN" || entry.createdBy === user.id;

  if (loading) return <p className="text-sm text-text-secondary">Lade Finanzen...</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text-bright">Finanzen</h1>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Jahr"
            className="glass-input rounded-xl px-3 py-2 text-sm text-text-bright"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="glass-chip rounded-xl px-3 py-2 text-sm text-text-secondary transition-all hover:text-text-bright"
          >
            Einstellungen
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-status-churned/10 px-4 py-3 text-sm text-status-churned">
          {error}
        </div>
      )}

      {showSettings && stats && (
        <SettingsPanel
          stats={stats}
          year={year}
          onSaved={reload}
          onError={setError}
          onClose={() => setShowSettings(false)}
        />
      )}

      {stats && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-4">
            <StatCard label="Umsatz brutto" value={stats.totalRevenueGross} color="text-status-customer" />
            <StatCard label="Aufwand" value={stats.totalExpenseCost} color="text-status-churned" />
            <StatCard
              label="Gewinn"
              value={stats.totalProfit}
              color={stats.totalProfit >= 0 ? "text-accent" : "text-status-churned"}
            />
            <StatCard
              label="USt-Zahllast"
              value={stats.totalVatBalance}
              color={stats.totalVatBalance >= 0 ? "text-text-bright" : "text-status-customer"}
              hint={stats.totalVatBalance >= 0 ? "ans Finanzamt" : "Guthaben"}
            />
            <StatCard label="Offen" value={stats.totalOpen} color="text-status-lead" hint="verschickt, unbezahlt" />
          </div>

          {stats.perUser.map((u) => (
            <PersonCard key={u.userId ?? u.username} person={u} />
          ))}

          {stats.openEntries.length > 0 && <OpenList stats={stats} />}
        </>
      )}

      <div
        ref={formRef}
        className={`glass mb-6 rounded-2xl p-4 sm:p-5 ${editingId ? "ring-2 ring-accent/40" : ""}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-bright">
            {editingId ? "Eintrag bearbeiten" : "Neuer Eintrag"}
          </h2>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs text-text-secondary hover:text-text-bright">
              Abbrechen
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Zeile 1: Art, Betrag, Brutto/Netto, USt-Satz */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Art</span>
              <select
                value={form.type}
                onChange={(e) => changeType(e.target.value as FinanceType)}
                aria-label="Art"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              >
                <option value="INCOME">Einnahme</option>
                <option value="EXPENSE">Ausgabe</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Betrag</span>
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => patch({ amount: e.target.value })}
                placeholder="0,00"
                required
                aria-label="Betrag"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>

            <div>
              <span className="mb-1 block text-[11px] text-text-secondary">Eingabe</span>
              <div className="flex rounded-xl bg-white/50 p-0.5">
                {(["GROSS", "NET"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patch({ inputMode: mode })}
                    aria-pressed={form.inputMode === mode}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                      form.inputMode === mode
                        ? "bg-accent text-white shadow-sm"
                        : "text-text-secondary hover:text-text-bright"
                    }`}
                  >
                    {mode === "GROSS" ? "Brutto" : "Netto"}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">USt</span>
              <select
                value={form.vatRate}
                onChange={(e) => patch({ vatRate: Number(e.target.value) })}
                aria-label="USt-Satz"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              >
                {VAT_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? "keine USt" : `${r} %`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Live-Aufschlüsselung */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-white/40 px-4 py-2.5 text-xs">
            <span className="text-text-secondary">
              Netto <strong className="ml-1 font-mono text-text-bright">{formatCurrency(preview.net)}</strong>
            </span>
            <span className="text-text-secondary">
              USt <strong className="ml-1 font-mono text-text-bright">{formatCurrency(preview.vat)}</strong>
            </span>
            <span className="text-text-secondary">
              Brutto <strong className="ml-1 font-mono text-text-bright">{formatCurrency(preview.gross)}</strong>
            </span>
          </div>

          <CustomerMentionInput
            value={form.description}
            onChange={(description) => patch({ description })}
            customers={customers}
            linkedCustomerName={form.customerId ? form.customerName : undefined}
            onPick={(c) => patch({ customerId: c.id, customerName: c.name })}
            onUnlink={() => patch({ customerId: "", customerName: "" })}
            placeholder="Beschreibung — @ verknüpft einen Kunden"
            aria-label="Beschreibung"
            required
          />

          {/* Angehängte Rechnung aus dem Share */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="glass-chip rounded-xl px-3 py-2 text-xs font-medium text-text-secondary transition-all hover:text-text-bright"
            >
              {form.attachmentPath ? "Rechnung ändern" : "Rechnung wählen"}
            </button>
            {form.attachmentPath && (
              <>
                <a
                  href={storageApi.previewUrl(form.attachmentPath)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-status-prospect/15 px-2.5 py-1 text-[11px] font-medium text-status-prospect"
                >
                  📄 {form.attachmentName}
                </a>
                <button
                  type="button"
                  onClick={() => patch({ attachmentPath: "", attachmentName: "" })}
                  className="text-[11px] text-text-secondary transition-colors hover:text-status-churned"
                >
                  Entfernen
                </button>
              </>
            )}
          </div>

          {/* Zeile 3: Datum, Status, je nach Art unterschiedliche Zusatzfelder */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Datum</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => patch({ date: e.target.value })}
                aria-label="Datum"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  patch({
                    status: e.target.value as StatusChoice,
                    parentId: e.target.value === "DEPOSIT" ? form.parentId : "",
                  })
                }
                aria-label="Status"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              >
                {STATUS_CHOICES.filter((c) => !c.forType || c.forType === form.type).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value === "SENT" && form.type === "EXPENSE" ? "Offen" : c.label}
                  </option>
                ))}
              </select>
            </label>

            {form.type === "INCOME" && form.status === "DEPOSIT" && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-text-secondary">Anzahlung auf</span>
                <select
                  value={form.parentId}
                  onChange={(e) => patch({ parentId: e.target.value })}
                  aria-label="Anzahlung auf"
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
                >
                  <option value="">— eigenständig —</option>
                  {invoiceOptions.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.description} ({formatCurrency(inv.amount)})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {form.type === "EXPENSE" && (
              <label className="col-span-2 flex items-center gap-2 self-end pb-2.5 sm:col-span-1">
                <input
                  type="checkbox"
                  checked={form.vatDeductible}
                  onChange={(e) => patch({ vatDeductible: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-xs text-text-bright">Vorsteuer abziehbar</span>
              </label>
            )}
          </div>

          {editingHalf && (
            <div className="rounded-xl bg-accent/5 px-4 py-2.5 text-xs text-text-secondary">
              Teil einer geteilten Buchung
              {editingHalf.splitPartnerUsername ? ` mit ${editingHalf.splitPartnerUsername}` : ""}.
              Änderungen hier betreffen nur diese Hälfte — beim Löschen verschwinden beide.
            </div>
          )}

          {form.type === "INCOME" && partners.length > 0 && !editingHalf && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(form.sharedWithUserId)}
                  onChange={(e) =>
                    patch({ sharedWithUserId: e.target.checked ? partners[0].id : "" })
                  }
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-xs text-text-bright">
                  50/50 geteilt mit{" "}
                  {partners.length === 1 ? (
                    <strong>{partners[0].username}</strong>
                  ) : (
                    <select
                      value={form.sharedWithUserId || partners[0].id}
                      onChange={(e) => patch({ sharedWithUserId: e.target.value })}
                      aria-label="Geteilt mit"
                      className="glass-input ml-1 rounded-lg px-2 py-1 text-xs text-text-bright"
                    >
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>{p.username}</option>
                      ))}
                    </select>
                  )}
                </span>
              </label>

              {split && (
                <div
                  className="mt-2 rounded-xl bg-accent/5 px-4 py-2.5"
                  data-testid="split-preview"
                >
                  <p className="mb-1.5 text-[11px] font-medium text-text-bright">
                    Es entstehen drei Buchungen:
                  </p>
                  <ol className="space-y-1 text-[11px] text-text-secondary">
                    <li>
                      <span className="mr-1.5 font-mono text-text-bright">1.</span>
                      deine Kundenrechnung{" "}
                      <strong className="font-mono text-text-bright">
                        {formatCurrency(split.fullGross)}
                      </strong>
                      {split.fullVat > 0 && <> — {formatCurrency(split.fullVat)} USt schuldest du</>}
                    </li>
                    <li>
                      <span className="mr-1.5 font-mono text-text-bright">2.</span>
                      {split.partnerName} stellt dir{" "}
                      <strong className="font-mono text-accent">
                        {formatCurrency(split.shareGross)}
                      </strong>{" "}
                      in Rechnung
                      {split.shareVat > 0 && <> — {formatCurrency(split.shareVat)} USt schuldet er</>}
                    </li>
                    <li>
                      <span className="mr-1.5 font-mono text-text-bright">3.</span>
                      dieselbe Rechnung bei dir als Aufwand
                      {split.shareVat > 0 ? (
                        <>
                          {" "}— {formatCurrency(split.shareVat)} ziehst du als{" "}
                          <strong className="text-text-bright">Vorsteuer</strong> ab
                        </>
                      ) : (
                        <> — mindert deinen Gewinn</>
                      )}
                    </li>
                  </ol>
                  <p className="mt-2 border-t border-white/40 pt-1.5 text-[11px] text-text-secondary">
                    Gewinn: du{" "}
                    <strong className="font-mono text-text-bright">
                      {formatCurrency(split.myProfit)}
                    </strong>
                    {" · "}
                    {split.partnerName}{" "}
                    <strong className="font-mono text-text-bright">
                      {formatCurrency(split.partnerProfit)}
                    </strong>
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-shimmer w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] sm:w-auto"
          >
            {editingId ? "Speichern" : "Hinzufügen"}
          </button>
        </form>
      </div>

      <EntryList
        entries={visibleEntries}
        people={users}
        personFilter={personFilter}
        onPersonFilter={setPersonFilter}
        canEdit={canEdit}
        onEdit={startEdit}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
      />

      <StoragePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(file) => {
          patch({ attachmentPath: file.path, attachmentName: file.name });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/* ── Grenzwerte und Kennzahlen pro Person ──────────────────────── */

function PersonCard({ person }: { person: FinanceUserStats }) {
  return (
    <div className="glass mb-4 rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">{person.username}</h2>
        <p className="font-mono text-lg font-bold text-accent">
          {formatCurrency(person.profit)}
          <span className="ml-1.5 text-[11px] font-normal text-text-secondary">Gewinn</span>
        </p>
      </div>

      <div className="mb-4 space-y-3">
        <ThresholdBar
          label="SVS-Versicherungsgrenze"
          basis="Basis: Gewinn"
          progress={person.svs}
        />
        <ThresholdBar
          label="Kleinunternehmergrenze"
          basis="Basis: Umsatz brutto"
          progress={person.smallBusiness}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/40 pt-3 sm:grid-cols-5">
        <Figure label="Umsatz brutto" value={person.revenueGross} />
        <Figure label="Aufwand" value={person.expenseCost} />
        <Figure label="USt-Schuld" value={person.vatOwed} />
        <Figure label="Vorsteuer" value={person.inputVat} />
        <Figure label="Zahllast" value={person.vatBalance} />
      </div>
    </div>
  );
}

function ThresholdBar({
  label,
  basis,
  progress,
}: {
  label: string;
  basis: string;
  progress: ThresholdProgress;
}) {
  const percent = Math.max(0, Math.min(100, progress.percent));
  const barColor = progress.exceeded
    ? "bg-status-churned"
    : percent >= 80
      ? "bg-status-lead"
      : "bg-accent";

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-medium text-text-bright">
          {label}
          <span className="ml-1.5 text-[10px] font-normal text-text-secondary">{basis}</span>
        </span>
        <span className="font-mono text-[11px] text-text-secondary">
          {formatCurrency(progress.current)} / {formatCurrency(progress.threshold)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-white/60"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(progress.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-text-secondary">
        {progress.exceeded ? (
          <span className="font-medium text-status-churned">
            überschritten um {formatCurrency(Math.abs(progress.remaining))}
          </span>
        ) : (
          <>
            {progress.percent.toFixed(1)} % — noch {formatCurrency(progress.remaining)}
          </>
        )}
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] text-text-secondary">{label}</p>
      <p className="font-mono text-xs font-medium text-text-bright">{formatCurrency(value)}</p>
    </div>
  );
}

/* ── Offene Posten ─────────────────────────────────────────────── */

function OpenList({ stats }: { stats: FinanceStats }) {
  return (
    <div className="glass mb-6 rounded-2xl p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-text-bright">
        Offene Posten
        <span className="ml-2 font-mono text-xs font-normal text-status-lead">
          {formatCurrency(stats.totalOpen)}
        </span>
      </h2>
      <div className="space-y-2">
        {stats.openEntries.map((o) => (
          <div key={o.id} className="flex items-center gap-3 rounded-xl bg-white/40 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-bright">{o.description}</p>
              <p className="font-mono text-[11px] text-text-secondary">
                {new Date(o.date).toLocaleDateString("de-DE")}
                {o.username ? ` · ${o.username}` : ""}
                {o.paid > 0 ? ` · ${formatCurrency(o.paid)} angezahlt` : ""}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm font-semibold text-status-lead">
              {formatCurrency(o.open)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Einstellungen ─────────────────────────────────────────────── */

function SettingsPanel({
  stats,
  year,
  onSaved,
  onError,
  onClose,
}: {
  stats: FinanceStats;
  year: number;
  onSaved: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  const [svs, setSvs] = useState(String(stats.settings.svsThreshold));
  const [smallBusiness, setSmallBusiness] = useState(String(stats.settings.smallBusinessThreshold));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await financeApi.updateSettings(year, {
        svsThreshold: parseFloat(svs),
        smallBusinessThreshold: parseFloat(smallBusiness),
      });
      onSaved();
      onClose();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass mb-6 rounded-2xl p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold text-text-bright">Einstellungen {year}</h2>
      <p className="mb-4 text-[11px] text-text-secondary">
        Die Grenzbeträge ändern sich jährlich und gelten nur für dieses Jahr. Die Vorgaben
        sind Platzhalter — bitte mit den aktuellen Werten überschreiben.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-text-secondary">
            SVS-Versicherungsgrenze (gegen Gewinn)
          </span>
          <input
            type="number"
            step="0.01"
            value={svs}
            onChange={(e) => setSvs(e.target.value)}
            aria-label="SVS-Versicherungsgrenze"
            className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] text-text-secondary">
            Kleinunternehmergrenze (gegen Umsatz)
          </span>
          <input
            type="number"
            step="0.01"
            value={smallBusiness}
            onChange={(e) => setSmallBusiness(e.target.value)}
            aria-label="Kleinunternehmergrenze"
            className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
          />
        </label>

      </div>

      <p className="mt-3 text-[11px] text-text-secondary">
        Geteilte Einnahmen werden beim Anlegen in zwei Buchungen zerlegt — je eine
        pro Person, jede mit ihrer halben USt. Eine Einstellung braucht es dafür nicht.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="btn-shimmer rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Speichert..." : "Speichern"}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:text-text-bright"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}

/* ── Einträge ──────────────────────────────────────────────────── */

function EntryList({
  entries,
  people,
  personFilter,
  onPersonFilter,
  canEdit,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  entries: FinanceEntry[];
  people: User[];
  personFilter: string;
  onPersonFilter: (userId: string) => void;
  canEdit: (e: FinanceEntry) => boolean;
  onEdit: (e: FinanceEntry) => void;
  onDelete: (id: string) => void;
  onStatusChange: (entry: FinanceEntry, choice: StatusChoice) => void;
}) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Einträge</h2>

        {/* Personenfilter — die beiden Bücher sollen sich nicht vermischen */}
        {people.length > 1 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Nach Person filtern">
            {[{ id: "", username: "Alle" }, ...people].map((p) => (
              <button
                key={p.id || "all"}
                onClick={() => onPersonFilter(p.id)}
                aria-pressed={personFilter === p.id}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  personFilter === p.id
                    ? "bg-accent text-white shadow-sm"
                    : "bg-white/50 text-text-secondary hover:text-text-bright"
                }`}
              >
                {p.username}
              </button>
            ))}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-text-secondary">Keine Einträge vorhanden.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-white/40 sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/40 text-xs uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3 font-medium">Beschreibung</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 text-right font-medium">Netto</th>
                  <th className="px-4 py-3 text-right font-medium">USt</th>
                  <th className="px-4 py-3 text-right font-medium">Brutto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/30 transition-colors last:border-0 hover:bg-white/40">
                    <td className="px-4 py-3.5 font-mono text-xs text-text-secondary">
                      {new Date(entry.date).toLocaleDateString("de-DE")}
                    </td>
                    <td className="px-4 py-3.5 text-text-bright">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{entry.description}</span>
                        <EntryBadges entry={entry} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge entry={entry} editable={canEdit(entry)} onChange={onStatusChange} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary">
                      {entry.createdByUsername ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-text-secondary">
                      {formatCurrency(entry.netAmount)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-text-secondary">
                      {entry.vatRate > 0 ? `${formatCurrency(entry.vatAmount)} (${entry.vatRate}%)` : "—"}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right font-mono font-medium ${
                        entry.type === "INCOME" ? "text-status-customer" : "text-status-churned"
                      }`}
                    >
                      {entry.type === "EXPENSE" ? "−" : "+"}
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {canEdit(entry) && <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 sm:hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl bg-white/40 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge entry={entry} editable={canEdit(entry)} onChange={onStatusChange} />
                      <EntryBadges entry={entry} />
                      <span className="font-mono text-[11px] text-text-secondary">
                        {new Date(entry.date).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                    <p className="truncate text-sm text-text-bright">{entry.description}</p>
                    <p className="font-mono text-[11px] text-text-secondary">
                      netto {formatCurrency(entry.netAmount)}
                      {entry.vatRate > 0 ? ` · USt ${formatCurrency(entry.vatAmount)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        entry.type === "INCOME" ? "text-status-customer" : "text-status-churned"
                      }`}
                    >
                      {entry.type === "EXPENSE" ? "−" : "+"}
                      {formatCurrency(entry.amount)}
                    </p>
                  </div>
                  {canEdit(entry) && <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Beschriftet, welche Rolle eine Buchung in einer Aufteilung hat. */
function splitLabel(entry: FinanceEntry): string | null {
  const partner = entry.splitPartnerUsername ?? entry.sharedWithUsername;
  if (!partner) return null;

  switch (entry.splitRole) {
    case "SHARE_IN":
      return `Anteil von ${partner}`;
    case "SHARE_OUT":
      return `Anteil an ${partner}`;
    default:
      return `50/50 · ${partner}`;
  }
}

function EntryBadges({ entry }: { entry: FinanceEntry }) {
  const split = splitLabel(entry);
  return (
    <>
      {split && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
          {split}
        </span>
      )}
      {entry.customerId && entry.customerName && (
        <Link
          to={`/customers/${entry.customerId}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-status-prospect/15 px-2 py-0.5 text-[10px] font-medium text-status-prospect transition-colors hover:bg-status-prospect/25"
        >
          @{entry.customerName}
        </Link>
      )}
      {entry.attachmentPath && (
        <a
          href={storageApi.previewUrl(entry.attachmentPath)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={entry.attachmentName}
          className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary transition-colors hover:text-text-bright"
        >
          📄 Rechnung
        </a>
      )}
      {entry.type === "EXPENSE" && entry.vatDeductible === false && entry.vatRate > 0 && (
        <span className="rounded-full bg-status-lead/15 px-2 py-0.5 text-[10px] font-medium text-status-lead">
          keine Vorsteuer
        </span>
      )}
    </>
  );
}

function statusStyle(entry: FinanceEntry): string {
  if (entry.kind === "DEPOSIT") return "bg-status-prospect/15 text-status-prospect";
  if (entry.status === "PAID") return "bg-status-customer/15 text-status-customer";
  if (entry.status === "DRAFT") return "bg-text-secondary/15 text-text-secondary";
  return "bg-status-lead/15 text-status-lead";
}

/**
 * Anzahlung, bezahlt und offen sind ein einziger Zustand — deshalb ein einziges
 * Abzeichen, das man direkt anklicken und umstellen kann. Der Weg über das
 * Formular bleibt für alles andere, aber "ist bezahlt" ist ein Ein-Klick-Vorgang.
 */
function StatusBadge({
  entry,
  editable,
  onChange,
}: {
  entry: FinanceEntry;
  editable: boolean;
  onChange: (entry: FinanceEntry, choice: StatusChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = statusLabel(entry);
  const style = statusStyle(entry);

  if (!editable) {
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium ${style}`}>
        {label}
      </span>
    );
  }

  const current: StatusChoice =
    entry.kind === "DEPOSIT" ? "DEPOSIT" : entry.status === "PAID" ? "PAID" : "SENT";
  const choices = STATUS_CHOICES.filter((c) => !c.forType || c.forType === entry.type);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status von ${entry.description}: ${label} — ändern`}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all hover:brightness-95 ${style}`}
      >
        {label}
        <svg className="h-2.5 w-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Status wählen"
          className="glass-strong absolute left-0 top-full z-30 mt-1 min-w-[130px] rounded-xl p-1"
        >
          {choices.map((c) => (
            <li key={c.value}>
              <button
                type="button"
                role="option"
                aria-selected={c.value === current}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (c.value !== current) onChange(entry, c.value);
                }}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                  c.value === current
                    ? "bg-accent text-white"
                    : "text-text-bright hover:bg-white/60"
                }`}
              >
                {c.value === "SENT" && entry.type === "EXPENSE" ? "Offen" : c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowActions({
  entry,
  onEdit,
  onDelete,
}: {
  entry: FinanceEntry;
  onEdit: (e: FinanceEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <button
        onClick={() => onEdit(entry)}
        title="Bearbeiten"
        aria-label={`${entry.description} bearbeiten`}
        className="rounded-lg p-1.5 text-text-secondary transition-all hover:bg-accent/10 hover:text-accent"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      </button>
      <button
        onClick={() => onDelete(entry.id)}
        title="Löschen"
        aria-label={`${entry.description} löschen`}
        className="rounded-lg p-1.5 text-text-secondary transition-all hover:bg-status-churned/10 hover:text-status-churned"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-4">
      <p className="text-[10px] font-medium text-text-secondary sm:text-xs">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold sm:text-xl ${color}`}>{formatCurrency(value)}</p>
      {hint && <p className="mt-0.5 text-[10px] text-text-secondary">{hint}</p>}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value ?? 0);
}
