import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  OpenReceivable,
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

/**
 * Dieselben Farbslots wie im Zeiterfassungs-Chart. Die Farbe gehört zur Person,
 * nicht zur Grenze — dieselbe Person ist in beiden Gruppen gleich eingefärbt.
 */
const PERSON_COLORS = ["#007AFF", "#30d158", "#ff9f0a", "#ff453a", "#bf5af2", "#64d2ff"];

/**
 * Farbe an einem Betrag markiert die RICHTUNG des Geldes — mehr nicht.
 *
 * Rein ist grün, raus ist rot. Kennzahlen ohne Richtung (USt-Zahllast, offene
 * Posten, Netto-Nebenwerte) bleiben Tinte. Dadurch heisst Farbe hier immer
 * dasselbe, statt fünf Kacheln fünf verschiedene Farben zu geben.
 */
const MONEY_TONE = {
  in: "text-status-customer",
  out: "text-status-churned",
  neutral: "text-text-bright",
} as const;

type MoneyTone = keyof typeof MONEY_TONE;

/** Vorzeichen entscheidet: positiv ist Zufluss, negativ Abfluss. */
function toneOf(value: number): MoneyTone {
  return value < 0 ? "out" : "in";
}

type ThresholdKind = {
  key: "svs" | "smallBusiness";
  /** Kurzform für die Achse — die Langform steht in den Zahlen darunter */
  axis: string;
  label: string;
  basis: string;
};

const THRESHOLD_KINDS: ThresholdKind[] = [
  { key: "svs", axis: "SVS", label: "SVS-Versicherungsgrenze", basis: "Basis: Gewinn" },
  {
    key: "smallBusiness",
    axis: "Kleinunternehmer",
    label: "Kleinunternehmergrenze",
    basis: "Basis: Umsatz brutto",
  },
];

const STATUS_CHOICES: { value: StatusChoice; label: string; forType?: FinanceType }[] = [
  { value: "SENT", label: "Offen" },
  { value: "PAID", label: "Bezahlt" },
  { value: "DEPOSIT", label: "Anzahlung", forType: "INCOME" },
];

/** Beschriftung eines gespeicherten Eintrags. "Offen" gilt in beide Richtungen. */
function statusLabel(entry: Pick<FinanceEntry, "kind" | "status" | "type">): string {
  if (entry.kind === "DEPOSIT") return "Anzahlung";
  if (entry.status === "PAID") return "Bezahlt";
  if (entry.status === "DRAFT") return "Entwurf";
  return "Offen";
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
    /**
     * Zu zweit ist Teilen der Normalfall, deshalb standardmaessig an. Leeres
     * sharedWithUserId heisst "die erste Partnerperson" — beim Anlegen des
     * Formulars sind die Personen noch gar nicht geladen.
     */
    shareWithPartner: true,
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
  /** Wessen Kennzahlen-Karte offen ist. Leer = die eigene, siehe orderedPeople. */
  const [personTab, setPersonTab] = useState("");

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
    if (!form.shareWithPartner || partners.length === 0 || preview.gross <= 0) return null;

    const shareGross = toCents(preview.gross / 2);
    const share = splitVat(shareGross, "GROSS", form.vatRate);
    const partner = partners.find((p) => p.id === form.sharedWithUserId) ?? partners[0];

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
  }, [form.shareWithPartner, form.sharedWithUserId, form.vatRate, preview, partners]);

  const visibleEntries = useMemo(
    () => (personFilter ? entries.filter((e) => e.createdBy === personFilter) : entries),
    [entries, personFilter],
  );

  /**
   * Die eigene Person steht immer vorne — im Chart, in der Umschaltleiste und
   * damit auch bei der Farbvergabe. Jeder sieht sich selbst zuerst und blau.
   */
  const orderedPeople = useMemo(() => {
    const list = stats?.perUser ?? [];
    return [
      ...list.filter((p) => p.userId === user.id),
      ...list.filter((p) => p.userId !== user.id),
    ];
  }, [stats, user.id]);

  /**
   * Ohne Auswahl die erste Person = man selbst. Kein Effekt nötig, der die
   * Auswahl nachzieht. In einem Jahr ohne Einträge ist die Liste leer — daher
   * ausdrücklich nullable, sonst fällt das erst zur Laufzeit auf.
   */
  const activePerson: FinanceUserStats | null =
    orderedPeople.find((p) => p.userId === personTab) ?? orderedPeople[0] ?? null;

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current, current - 1, year]);
    entries.forEach((e) => years.add(new Date(e.date).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [entries, year]);

  function patch(changes: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...changes }));
  }

  /** Mit wem geteilt wird — ohne Haken mit niemandem, ohne Auswahl mit der ersten. */
  function selectedPartner(): User | undefined {
    if (!form.shareWithPartner) return undefined;
    return partners.find((p) => p.id === form.sharedWithUserId) ?? partners[0];
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
      sharedWithUserId: form.sharedWithUserId,
      parentId: type === "EXPENSE" ? "" : form.parentId,
    });
  }

  function buildPayload(): Partial<FinanceEntry> {
    const partner = selectedPartner();
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

    // Vorher brach das hier wortlos ab — der Knopf wirkte tot und man kam nicht
    // aus dem Bearbeiten-Modus heraus, ohne zu wissen warum.
    const parsed = parseFloat(form.amount);
    if (!parsed || parsed <= 0) {
      setError("Bitte einen Betrag größer als 0 eintragen.");
      return;
    }
    if (!form.description.trim()) {
      setError("Bitte eine Beschreibung eintragen.");
      return;
    }

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
      // Ein bestehender Eintrag darf sich beim Speichern nicht plötzlich teilen.
      shareWithPartner: Boolean(entry.sharedWithUserId),
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
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-status-churned/10 px-4 py-3 text-sm text-status-churned">
          {error}
        </div>
      )}

      {stats && (
        <>
          {/*
            Nur die drei Kacheln mit einer Geldrichtung tragen Farbe. Die
            USt-Zahllast ist eine Schuld und die offenen Posten sind noch nicht
            geflossen — beide bleiben Tinte, sonst leuchtet die ganze Reihe.
          */}
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-4">
            {/* Umsatz netto: die USt ist kein Ertrag, sondern durchlaufender Posten. */}
            <StatCard
              label="Umsatz netto"
              value={stats.totalRevenueNet}
              tone="in"
              hint={`${formatCurrency(stats.totalRevenueGross)} brutto`}
            />
            <StatCard label="Aufwand" value={stats.totalExpenseCost} tone="out" />
            <StatCard label="Gewinn" value={stats.totalProfit} tone={toneOf(stats.totalProfit)} />
            <StatCard
              label="USt-Zahllast"
              value={stats.totalVatBalance}
              hint={stats.totalVatBalance >= 0 ? "ans Finanzamt" : "Guthaben"}
            />
            {/* Nur Kundenforderungen — Internes waere kein Geld von aussen. */}
            <StatCard
              label="Offen"
              value={stats.totalOpen}
              hint="brutto · Kunden schulden uns"
            />
          </div>

          {activePerson && (
            <ThresholdPanel
              people={orderedPeople}
              activePerson={activePerson}
              onSelect={setPersonTab}
              settingsOpen={showSettings}
              onToggleSettings={() => setShowSettings((v) => !v)}
            />
          )}

          {/*
            Direkt unter den Grenzen, weil dort auch der Schalter sitzt: die
            Einstellungen setzen genau die Werte, gegen die hier gemessen wird.
          */}
          {showSettings && (
            <SettingsPanel
              stats={stats}
              year={year}
              onSaved={reload}
              onError={setError}
              onClose={() => setShowSettings(false)}
            />
          )}

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

          {partners.length > 0 && !editingHalf && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.shareWithPartner}
                  onChange={(e) => patch({ shareWithPartner: e.target.checked })}
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

              {split && form.type === "EXPENSE" && (
                <div
                  className="mt-2 rounded-xl bg-accent/5 px-4 py-2.5"
                  data-testid="split-preview"
                >
                  <p className="mb-1.5 text-[11px] font-medium text-text-bright">
                    Es entstehen zwei Buchungen:
                  </p>
                  <ol className="space-y-1 text-[11px] text-text-secondary">
                    <li>
                      <span className="mr-1.5 font-mono text-text-bright">1.</span>
                      deine Hälfte{" "}
                      <strong className="font-mono text-text-bright">
                        {formatCurrency(split.fullGross - split.shareGross)}
                      </strong>
                    </li>
                    <li>
                      <span className="mr-1.5 font-mono text-text-bright">2.</span>
                      {split.partnerName} bucht{" "}
                      <strong className="font-mono text-text-bright">
                        {formatCurrency(split.shareGross)}
                      </strong>
                    </li>
                  </ol>
                  <p className="mt-2 border-t border-white/40 pt-1.5 text-[11px] text-text-secondary">
                    Mindert den Gewinn bei euch beiden um je{" "}
                    <strong className="font-mono text-text-bright">
                      {formatCurrency(split.partnerProfit)}
                    </strong>
                    . Keine interne Rechnung, kein Effekt auf Umsatz oder offene Posten.
                  </p>
                </div>
              )}

              {split && form.type === "INCOME" && (
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
                      <strong className="font-mono text-text-bright">
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
        selfId={user.id}
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

/* ── Grenzwerte und Kennzahlen ─────────────────────────────────── */

/**
 * Grenzen und Kennzahlen in EINEM Element.
 *
 * Die Grenzen sind Meter, keine Säulen: die volle Spurbreite IST die Grenze,
 * der gefüllte Teil die Auslastung. Als Säulen gegen eine 100-%-Achse wären die
 * realen Werte (ein paar Prozent) unlesbare Striche — hier trägt die Spur den
 * Kontext, und der Prozentwert steht als Zahl daneben.
 *
 * Beide Personen stehen untereinander, damit man sie vergleichen kann. Der
 * Umschalter im Kopf steuert nur den Kennzahlen-Block darunter.
 */
function ThresholdPanel({
  people,
  activePerson,
  onSelect,
  settingsOpen,
  onToggleSettings,
}: {
  people: FinanceUserStats[];
  activePerson: FinanceUserStats;
  onSelect: (userId: string) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const colorOf = (index: number) => PERSON_COLORS[index % PERSON_COLORS.length];
  const activeIndex = people.findIndex((p) => p.userId === activePerson.userId);

  return (
    <div className="glass mb-4 rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Grenzwerte &amp; Kennzahlen</h2>

        <div className="flex flex-wrap items-center gap-3">
        {people.length > 1 && (
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Kennzahlen einer Person anzeigen"
          >
            {people.map((person, i) => {
              const active = person.userId === activePerson.userId;
              return (
                <button
                  key={person.userId ?? person.username}
                  onClick={() => onSelect(person.userId)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? "bg-accent text-white shadow-sm"
                      : "bg-white/50 text-text-secondary hover:text-text-bright"
                  }`}
                >
                  {/* Farbpunkt wie am Meter, damit Balken und Kennzahlen zusammenfinden */}
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colorOf(i) }}
                    aria-hidden="true"
                  />
                  {person.username}
                </button>
              );
            })}
          </div>
        )}

        {/*
          Die Einstellungen gehoeren hierher und nicht neben das Jahr: sie setzen
          genau die beiden Grenzen, die darunter gemessen werden.
        */}
        <button
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          className={`text-xs font-medium transition-colors ${
            settingsOpen ? "text-accent" : "text-text-secondary hover:text-text-bright"
          }`}
        >
          Einstellungen
        </button>
        </div>
      </div>

      <div className="space-y-4">
        {THRESHOLD_KINDS.map((kind) => (
          <div key={kind.key}>
            {/*
              Die Grenze gilt für beide gleich — einmal in der Überschrift statt
              in jeder Zeile hinter jedem Betrag. Das nimmt der Zeile die halbe
              Länge, ohne dass die Zahl verlorengeht.
            */}
            <p className="mb-2 text-xs font-medium text-text-bright">
              {kind.label}
              <span className="ml-1.5 text-[10px] font-normal text-text-secondary">
                {kind.basis} · Grenze {compactEuro(people[0]?.[kind.key].threshold ?? 0)}
              </span>
            </p>
            <div className="space-y-1.5">
              {people.map((person, i) => (
                <ThresholdMeter
                  key={person.userId ?? person.username}
                  kind={kind}
                  person={person}
                  color={colorOf(i)}
                  showName={people.length > 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-white/40 pt-3">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-text-bright">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colorOf(activeIndex < 0 ? 0 : activeIndex) }}
              aria-hidden="true"
            />
            {activePerson.username}
          </h3>
          <p className={`font-mono text-lg font-bold ${MONEY_TONE[toneOf(activePerson.profit)]}`}>
            {formatCurrency(activePerson.profit)}
            <span className="ml-1.5 text-[11px] font-normal text-text-secondary">Gewinn</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
          <Figure
            label="Umsatz netto"
            value={activePerson.revenueNet}
            hint={`${formatCurrency(activePerson.revenueGross)} brutto`}
          />
          <Figure label="Aufwand" value={activePerson.expenseCost} />
          <Figure label="USt-Schuld" value={activePerson.vatOwed} />
          <Figure label="Vorsteuer" value={activePerson.inputVat} />
          <Figure label="Zahllast" value={activePerson.vatBalance} />
        </div>
      </div>
    </div>
  );
}

/**
 * Ein Meter: Spur = Grenze, Füllung = Auslastung.
 *
 * Die Spur ist die eingefärbte Personenfarbe mit wenig Deckkraft, damit die
 * Zuordnung über die ganze Breite lesbar bleibt. Überschritten färbt die Füllung
 * rot — Farbe allein signalisiert das aber nicht, daneben steht es als Text.
 */
function ThresholdMeter({
  kind,
  person,
  color,
  showName,
}: {
  kind: ThresholdKind;
  person: FinanceUserStats;
  color: string;
  showName: boolean;
}) {
  const progress: ThresholdProgress = person[kind.key];
  const filled = Math.max(0, Math.min(100, progress.percent));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {showName && (
        <span className="w-20 shrink-0 truncate text-[11px] text-text-secondary sm:w-28">
          {person.username}
        </span>
      )}

      <div
        className="h-2.5 min-w-[5rem] flex-1 overflow-hidden rounded-full"
        style={{ background: `${color}26` }}
        role="progressbar"
        aria-label={`${kind.label} — ${person.username}`}
        aria-valuenow={Math.round(progress.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${filled}%`,
            background: progress.exceeded ? "#ff453a" : color,
          }}
        />
      </div>

      <span className="w-11 shrink-0 text-right font-mono text-[11px] font-medium text-text-bright">
        {Math.round(progress.percent)}%
      </span>

      {/*
        Kurz halten: die Grenze steht in der Überschrift, Cent sind bei
        fünfstelligen Grenzen Rauschen. Übrig bleibt, was man wirklich abliest —
        wo man steht und wie weit es noch ist.
      */}
      <span className="w-full text-right font-mono text-[10px] text-text-secondary sm:w-auto">
        {compactEuro(progress.current)}
        {/* Sonst wäre unerklärlich, warum die Grenze mehr sieht als der Umsatz */}
        {kind.key === "smallBusiness" && person.externalRevenue > 0 && (
          <span className="ml-1.5 font-sans">
            +{compactEuro(person.externalRevenue)} außerhalb
          </span>
        )}
        {progress.exceeded ? (
          <span className="ml-1.5 font-sans font-medium text-status-churned">
            über {compactEuro(Math.abs(progress.remaining))}
          </span>
        ) : (
          <span className="ml-1.5 font-sans">noch {compactEuro(progress.remaining)}</span>
        )}
      </span>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] text-text-secondary">{label}</p>
      <p className="font-mono text-xs font-medium text-text-bright">{formatCurrency(value)}</p>
      {hint && <p className="font-mono text-[10px] text-text-secondary">{hint}</p>}
    </div>
  );
}

/* ── Offene Posten ─────────────────────────────────────────────── */

function OpenList({ stats }: { stats: FinanceStats }) {
  /**
   * Zwei Gruppen statt einer Liste: eine Kundenforderung ist Geld, das von aussen
   * hereinkommt, eine interne Anteilsrechnung nur eine Umbuchung zwischen den
   * beiden. Zusammengezählt ergäbe das eine Zahl, die es so nicht gibt.
   */
  const groups = [
    { key: "customer", title: "Von Kunden", hint: "", rows: stats.openEntries.filter((o) => !o.internal) },
    {
      key: "internal",
      title: "Intern · Aufteilung",
      hint: "kein Außenstand",
      rows: stats.openEntries.filter((o) => o.internal),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="glass mb-6 rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-white/50 pb-2">
        <h2 className="text-sm font-semibold text-text-bright">Offene Posten</h2>
        {/* Die Einheit steht einmal als Spaltenkopf statt an jeder Zahl */}
        <div className="flex shrink-0 gap-4 text-[10px] font-medium uppercase tracking-wide text-text-secondary sm:gap-6">
          <span className="w-20 text-right sm:w-24">Netto</span>
          <span className="w-20 text-right sm:w-24">Brutto</span>
        </div>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                {group.title}
                {group.hint && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal">
                    · {group.hint}
                  </span>
                )}
              </p>
              {/*
                Summe je Gruppe, nie über beide: "Kunden schulden uns" und "wir
                schulden uns gegenseitig" sind zwei Zahlen, keine gemeinsame.
                Ab zwei Posten — bei einem stünde sie in der Zeile darunter nochmal.
              */}
              {group.rows.length > 1 && (
                <div className="flex shrink-0 gap-4 font-mono text-xs font-semibold text-text-bright sm:gap-6">
                  <span className="w-20 text-right sm:w-24">
                    {formatCurrency(sumBy(group.rows, (o) => o.openNet))}
                  </span>
                  <span className="w-20 text-right sm:w-24">
                    {formatCurrency(sumBy(group.rows, (o) => o.open))}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              {group.rows.map((o) => (
                <OpenRow key={o.id} row={o} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenRow({ row }: { row: OpenReceivable }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-xl bg-white/40 px-3.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-bright">{openLabel(row)}</p>
        <p className="truncate text-[11px] text-text-secondary">{openMeta(row)}</p>
      </div>
      {/* Beträge tragen Textfarbe — die Spaltenüberschrift sagt, was sie sind */}
      <div className="flex shrink-0 gap-4 font-mono text-sm sm:gap-6">
        <span className="w-20 text-right text-text-secondary sm:w-24">
          {formatCurrency(row.openNet)}
        </span>
        <span className="w-20 text-right font-semibold text-text-bright sm:w-24">
          {formatCurrency(row.open)}
        </span>
      </div>
    </div>
  );
}

function sumBy(rows: OpenReceivable[], pick: (row: OpenReceivable) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

/**
 * Der Server hängt an die interne Anteilsrechnung "— Anteil von X" an. Im
 * internen Block steht die Richtung ohnehin in der Zeile darunter, also bleibt
 * hier nur der Vorgang stehen. Findet sich das Muster nicht, bleibt alles.
 */
function openLabel(o: OpenReceivable): string {
  if (!o.internal) return o.description;
  const cut = o.description.lastIndexOf(" — Anteil ");
  return cut > 0 ? o.description.slice(0, cut) : o.description;
}

/** Eine Zeile Kontext, mit Mittelpunkt getrennt — bei internen zuerst die Richtung. */
function openMeta(o: OpenReceivable): string {
  const date = new Date(o.date).toLocaleDateString("de-DE");
  const parts = o.internal
    ? [o.partner && o.username ? `${o.partner} schuldet ${o.username}` : null, date]
    : [date, o.username, o.paid > 0 ? `${formatCurrency(o.paid)} angezahlt` : null];

  return parts.filter(Boolean).join(" · ");
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
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Nebenumsätze je Person. Startwert kommt aus der Statistik, die ihn ohnehin
   * schon mitliefert — spart einen zweiten Ladevorgang.
   */
  const [external, setExternal] = useState<Record<string, string>>(() =>
    Object.fromEntries(stats.perUser.map((u) => [u.userId, String(u.externalRevenue || "")])),
  );

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await financeApi.updateSettings(year, {
        svsThreshold: parseFloat(svs),
        smallBusinessThreshold: parseFloat(smallBusiness),
      });
      for (const person of stats.perUser) {
        const eingetippt = parseFloat(external[person.userId] ?? "") || 0;
        // Nur schreiben, was sich geändert hat.
        if (eingetippt !== person.externalRevenue) {
          await financeApi.setExternalRevenue(year, person.userId, {
            amount: eingetippt,
            username: person.username,
          });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setSaveError((err as Error).message);
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

      {/*
        Die Kleinunternehmergrenze gilt pro Person über ALLE ihre Umsätze. Was
        nicht in diesem CRM steht, muss deshalb hier eingetragen werden — sonst
        wirkt die Grenze weiter weg als sie ist.
      */}
      <div className="mt-4 border-t border-white/40 pt-3">
        <p className="mb-2 text-[11px] font-medium text-text-bright">
          Umsatz außerhalb dieses CRM
          <span className="ml-1.5 font-normal text-text-secondary">
            brutto · zählt auf die Kleinunternehmergrenze
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {stats.perUser.map((person) => (
            <label key={person.userId} className="block">
              <span className="mb-1 block text-[11px] text-text-secondary">{person.username}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={external[person.userId] ?? ""}
                onChange={(e) =>
                  setExternal((prev) => ({ ...prev, [person.userId]: e.target.value }))
                }
                aria-label={`Umsatz außerhalb — ${person.username}`}
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
            </label>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-text-secondary">
        Geteilte Einnahmen werden beim Anlegen in zwei Buchungen zerlegt — je eine
        pro Person, jede mit ihrer halben USt. Eine Einstellung braucht es dafür nicht.
      </p>

      {/*
        Scheitert das Speichern, muss es hier stehen und nicht im Banner ganz
        oben: wer unten auf Speichern drückt, sieht den Kopf der Seite nicht und
        haelt einen fehlgeschlagenen Aufruf für "es passiert nichts".
      */}
      {saveError && (
        <p role="alert" className="mt-3 rounded-xl bg-status-churned/10 px-3 py-2 text-xs text-status-churned">
          {saveError}
        </p>
      )}

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

/* ── Vorgänge ──────────────────────────────────────────────────── */

/**
 * Ein Vorgang ist das, was nach aussen passiert ist: eine gestellte Rechnung,
 * eine bezahlte Ausgabe. Die Buchungen darunter sind nur die Innenansicht
 * davon — der Anteil, den der Partner in Rechnung stellt, dieselbe Rechnung
 * als Aufwand, die schon geleistete Anzahlung, die zweite Hälfte einer
 * geteilten Ausgabe.
 *
 * Ohne diese Klammer stehen für zwei gestellte Rechnungen fünf Zeilen in der
 * Liste, und man muss jedes Mal neu nachrechnen, welche davon echtes Geld von
 * aussen sind. Gruppiert wird über die bereits gefilterte Liste: was der
 * Personenfilter ausblendet, kann auch keinen Kopf tragen — die verbliebene
 * Buchung steht dann für sich.
 */
type Vorgang = {
  head: FinanceEntry;
  children: FinanceEntry[];
};

/** Interne Verrechnung zwischen den beiden — kein Geld von aussen. */
function isInternalShare(entry: FinanceEntry): boolean {
  return entry.splitRole === "SHARE_IN" || entry.splitRole === "SHARE_OUT";
}

/** Anzahlung auf eine erfasste Schlussrechnung — zählt dort als Zahlung, nicht als Umsatz. */
function isLinkedDeposit(entry: FinanceEntry): boolean {
  return entry.kind === "DEPOSIT" && !!entry.parentId;
}

/**
 * Wer die Klammer trägt: bei geteilten Einnahmen die Kundenrechnung (ORIGIN),
 * bei geteilten Ausgaben die eigene Hälfte — die andere hängt darunter. Beide
 * Hälften sind gleichwertig, also entscheidet, wer draufschaut; ohne eigene
 * Hälfte die erste der Liste.
 */
function headByGroup(entries: FinanceEntry[], selfId: string): Map<string, FinanceEntry> {
  const heads = new Map<string, FinanceEntry>();

  for (const entry of entries) {
    if (!entry.splitGroupId) continue;
    const current = heads.get(entry.splitGroupId);

    if (!current || entry.splitRole === "ORIGIN") {
      heads.set(entry.splitGroupId, entry);
    } else if (current.splitRole !== "ORIGIN" && entry.createdBy === selfId && current.createdBy !== selfId) {
      heads.set(entry.splitGroupId, entry);
    }
  }

  return heads;
}

/**
 * Fasst die Buchungen zu Vorgängen zusammen. Die Reihenfolge der Köpfe bleibt
 * die der Liste — sortiert wird weiterhin serverseitig nach Datum.
 */
function groupEntries(entries: FinanceEntry[], selfId: string): Vorgang[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const heads = headByGroup(entries, selfId);

  /** Der Kopf, unter den diese Buchung gehört — oder null, wenn sie selbst einer ist. */
  function parentOf(entry: FinanceEntry): string | null {
    if (isLinkedDeposit(entry) && byId.has(entry.parentId!)) {
      // Die Schlussrechnung kann selbst Teil einer Aufteilung sein: dann geht
      // die Anzahlung an deren Kopf, sonst hinge sie unter einer Unterzeile.
      const invoice = byId.get(entry.parentId!)!;
      const head = invoice.splitGroupId ? heads.get(invoice.splitGroupId) : undefined;
      return (head ?? invoice).id;
    }
    if (entry.splitGroupId) {
      const head = heads.get(entry.splitGroupId);
      if (head && head.id !== entry.id) return head.id;
    }
    return null;
  }

  const groups = new Map<string, Vorgang>();
  const order: string[] = [];

  for (const entry of entries) {
    if (parentOf(entry) !== null) continue;
    groups.set(entry.id, { head: entry, children: [] });
    order.push(entry.id);
  }

  for (const entry of entries) {
    const parent = parentOf(entry);
    if (parent === null) continue;
    const group = groups.get(parent);
    // Fehlt der Kopf trotz allem, steht die Buchung lieber allein da als gar nicht.
    if (group) group.children.push(entry);
    else {
      groups.set(entry.id, { head: entry, children: [] });
      order.push(entry.id);
    }
  }

  // Anzahlungen zuerst — sie sind Teil der Zahlung, die Anteile nur Umbuchung.
  for (const group of groups.values()) {
    group.children.sort((a, b) => Number(isLinkedDeposit(b)) - Number(isLinkedDeposit(a)));
  }

  return order.map((id) => groups.get(id)!);
}

/**
 * Der Vorgang steht schon in der Kopfzeile — die Unterzeile muss ihn nicht
 * wiederholen. Derselbe Gedanke wie bei {@link openLabel} unter Offenen Posten,
 * nur dass hier der Kopf danebensteht und den Namen genau hergibt.
 */
function childLabel(entry: FinanceEntry, head: FinanceEntry): string {
  const prefix = `${head.description} — `;
  if (entry.description.startsWith(prefix)) {
    const rest = entry.description.slice(prefix.length).trim();
    if (rest) return rest;
  }
  return entry.description;
}

/**
 * Person, Nettobetrag und — nur wenn es abweicht — das Datum. Dreimal
 * dasselbe Datum untereinander ist Rauschen; eine Anzahlung von vor zwei Wochen
 * dagegen ist genau die Information, die man sucht.
 */
function childMeta(entry: FinanceEntry, head: FinanceEntry): string {
  const parts = [entry.createdByUsername, `netto ${formatCurrency(entry.netAmount)}`];
  if (entry.date !== head.date) parts.push(new Date(entry.date).toLocaleDateString("de-DE"));
  return parts.filter(Boolean).join(" · ");
}

/**
 * Was eingeklappt ist, muss die Zeile trotzdem verraten — sonst versteckt die
 * Gruppierung Buchungen, statt sie zu ordnen.
 */
function vorgangHint(group: Vorgang): string {
  const deposits = group.children.filter(isLinkedDeposit).length;
  const internal = group.children.filter(isInternalShare).length;
  const halves = group.children.length - deposits - internal;

  const parts: string[] = [];
  if (deposits) parts.push(deposits === 1 ? "1 Anzahlung" : `${deposits} Anzahlungen`);
  if (internal) parts.push(`${internal} intern`);
  if (halves) {
    // Bei geteilten Ausgaben ist die Kopfzeile nur die halbe Wahrheit: der Beleg
    // ist so gross wie beide Hälften zusammen. Diese Zahl steht sonst nirgends.
    const total = group.children.reduce(
      (sum, child) => sum + (isLinkedDeposit(child) || isInternalShare(child) ? 0 : child.amount),
      group.head.amount,
    );
    parts.push(`${halves === 1 ? "zweite Hälfte" : `${halves} weitere Hälften`} · Beleg gesamt ${formatCurrency(total)}`);
  }

  return parts.join(" · ");
}

/* ── Einträge ──────────────────────────────────────────────────── */

const SHOW_INTERNAL_KEY = "finance.showInternal";

function EntryList({
  entries,
  people,
  personFilter,
  onPersonFilter,
  selfId,
  canEdit,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  entries: FinanceEntry[];
  people: User[];
  personFilter: string;
  onPersonFilter: (userId: string) => void;
  selfId: string;
  canEdit: (e: FinanceEntry) => boolean;
  onEdit: (e: FinanceEntry) => void;
  onDelete: (id: string) => void;
  onStatusChange: (entry: FinanceEntry, choice: StatusChoice) => void;
}) {
  const sharePercent = useSharePercentByGroup(entries);

  /**
   * Der flache Blick bleibt eine Umschaltung statt eines zweiten Bildschirms —
   * für die Steuer will man irgendwann jede Buchung einzeln sehen. Die Wahl
   * überlebt den Seitenwechsel, sonst stellt man sie jedes Mal neu um.
   */
  const [showInternal, setShowInternal] = useState(
    () => localStorage.getItem(SHOW_INTERNAL_KEY) === "true",
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleInternal() {
    setShowInternal((prev) => {
      localStorage.setItem(SHOW_INTERNAL_KEY, String(!prev));
      return !prev;
    });
  }

  function toggleGroup(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const groups = useMemo(
    () => (showInternal ? entries.map((e) => ({ head: e, children: [] })) : groupEntries(entries, selfId)),
    [entries, selfId, showInternal],
  );

  const hasGrouped = groups.some((g) => g.children.length > 0);

  /**
   * Kopf plus die aufgeklappten Kinder — beide Ansichten rendern dieselbe Folge.
   * `last` markiert das Ende eines Vorgangs: nur dort wird noch getrennt, im
   * Inneren des Blocks nicht.
   */
  const rows = groups.flatMap((group) => {
    const open = expanded.has(group.head.id) ? group.children : [];
    return [
      { entry: group.head, group, child: false, last: open.length === 0 },
      ...open.map((entry, i) => ({ entry, group, child: true, last: i === open.length - 1 })),
    ];
  });

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-bright">Einträge</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Nur anbieten, wo es auch etwas zusammenzufassen gibt */}
          {(hasGrouped || showInternal) && (
            <button
              onClick={toggleInternal}
              aria-pressed={showInternal}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                showInternal
                  ? "bg-accent text-white shadow-sm"
                  : "bg-white/50 text-text-secondary hover:text-text-bright"
              }`}
            >
              Alle Buchungen
            </button>
          )}

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
                {rows.map(({ entry, group, child, last }, i) => {
                  const grouped = group.children.length > 0;
                  const inBlock = grouped && expanded.has(group.head.id);
                  return (
                  <Fragment key={entry.id}>
                  <tr
                    // Die ganze Zeile klappt auf, nicht nur der Hinweis darunter —
                    // auf einen 11px hohen Text zielen zu müssen ist niemandem zumutbar.
                    onClick={!child && grouped ? () => toggleGroup(group.head.id) : undefined}
                    className={`transition-colors ${
                      // Innerhalb eines offenen Vorgangs keine Trennlinie: der Block
                      // soll als ein Stück lesbar sein, nicht als drei Nachbarn.
                      // Offene Bloecke trennt stattdessen die Luecke darunter.
                      last && !inBlock ? "border-b border-white/30 last:border-0" : ""
                    } ${
                      // Der Kopf traegt den kraeftigeren Ton: so faengt jeder Block
                      // sichtbar an, auch wenn zwei offene aufeinander folgen.
                      inBlock ? (child ? "bg-accent/[0.05]" : "bg-accent/[0.11]") : "hover:bg-white/40"
                    } ${!child && grouped ? "cursor-pointer" : ""}`}
                  >
                    {child ? (
                      /* Unterzeile: fällt aus dem Spaltenraster heraus, damit sie
                         als Teil des Vorgangs lesbar ist und nicht als eigener. */
                      <td
                        colSpan={8}
                        className={`border-l-2 border-accent/40 py-2 pl-4 pr-4 ${
                          last ? "rounded-bl-xl rounded-br-xl pb-3" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
                          <span aria-hidden="true" className="font-mono text-xs text-text-secondary">
                            {last ? "└" : "├"}
                          </span>
                          <span className="text-[13px] text-text-secondary">
                            {childLabel(entry, group.head)}
                          </span>
                          <EntryBadges entry={entry} sharePercent={sharePercent(entry)} />
                          <StatusBadge entry={entry} editable={canEdit(entry)} onChange={onStatusChange} />
                          <span className="font-mono text-[11px] text-text-secondary">
                            {childMeta(entry, group.head)}
                          </span>
                          <span
                            className={`ml-auto font-mono text-[13px] font-medium ${
                              MONEY_TONE[entry.type === "EXPENSE" ? "out" : "in"]
                            }`}
                          >
                            {entry.type === "EXPENSE" ? "−" : "+"}
                            {formatCurrency(entry.amount)}
                          </span>
                          {canEdit(entry) && <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />}
                        </div>
                      </td>
                    ) : (
                      <>
                        <td
                          className={`py-3.5 pr-4 pl-4 font-mono text-xs text-text-secondary ${
                            inBlock ? "rounded-tl-xl border-l-2 border-accent/40" : ""
                          }`}
                        >
                          {new Date(entry.date).toLocaleDateString("de-DE")}
                        </td>
                        <td className="px-4 py-3.5 text-text-bright">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Der Kopf steht über seinen Unterzeilen, nicht daneben */}
                            <span className="font-medium">{entry.description}</span>
                            <EntryBadges entry={entry} sharePercent={sharePercent(entry)} />
                          </div>
                          {grouped && (
                            <ExpandToggle
                              open={inBlock}
                              hint={vorgangHint(group)}
                              description={group.head.description}
                              onToggle={() => toggleGroup(group.head.id)}
                            />
                          )}
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
                            MONEY_TONE[entry.type === "EXPENSE" ? "out" : "in"]
                          }`}
                        >
                          {entry.type === "EXPENSE" ? "−" : "+"}
                          {formatCurrency(entry.amount)}
                        </td>
                        <td className={`px-4 py-3.5 text-right ${inBlock ? "rounded-tr-xl" : ""}`}>
                          {canEdit(entry) && <RowActions entry={entry} onEdit={onEdit} onDelete={onDelete} />}
                        </td>
                      </>
                    )}
                  </tr>

                  {/*
                    Luft nach einem offenen Vorgang. Ohne sie laufen zwei
                    aufgeklappte Bloecke ineinander und die Uebersicht, die die
                    Gruppierung bringen soll, ist wieder dahin. Aus dem
                    Barrierebaum genommen, damit die Zeilenzahl stimmt.
                  */}
                  {last && inBlock && i < rows.length - 1 && (
                    <tr aria-hidden="true">
                      <td colSpan={8} className="h-3 p-0" />
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 sm:hidden">
            {rows.map(({ entry, group, child, last }) => (
              <div
                key={entry.id}
                onClick={
                  !child && group.children.length > 0
                    ? () => toggleGroup(group.head.id)
                    : undefined
                }
                // Die Unterzeile schliesst oben an ihren Kopf an, statt als eigene
                // Karte danebenzuliegen: dieselbe Leiste links, kein Abstand dazwischen.
                className={`px-4 ${
                  child
                    ? // -mt-2 hebt den Abstand der Liste auf: die Unterzeile schliesst
                      // direkt an ihren Kopf an. mb-3 setzt ihn nach dem letzten Kind
                      // wieder — sonst klebt der naechste Vorgang am Block.
                      `-mt-2 border-l-2 border-accent/40 bg-accent/[0.05] py-2 pl-5 ${
                        last ? "mb-3 rounded-b-xl pb-3" : ""
                      }`
                    : `rounded-t-xl bg-white/40 py-3 ${
                        group.children.length > 0 && expanded.has(group.head.id)
                          ? "border-l-2 border-accent/40 bg-accent/[0.11]"
                          : "rounded-b-xl"
                      } ${group.children.length > 0 ? "cursor-pointer" : ""}`
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge entry={entry} editable={canEdit(entry)} onChange={onStatusChange} />
                      <EntryBadges entry={entry} sharePercent={sharePercent(entry)} />
                      {/* Datum nur, wo es nicht ohnehin am Kopf steht */}
                      {(!child || entry.date !== group.head.date) && (
                        <span className="font-mono text-[11px] text-text-secondary">
                          {new Date(entry.date).toLocaleDateString("de-DE")}
                        </span>
                      )}
                    </div>
                    <p
                      className={`truncate ${
                        child ? "text-[13px] text-text-secondary" : "text-sm font-medium text-text-bright"
                      }`}
                    >
                      {child ? `${last ? "└" : "├"} ${childLabel(entry, group.head)}` : entry.description}
                    </p>
                    <p className="font-mono text-[11px] text-text-secondary">
                      {entry.vatRate > 0 ? `USt ${formatCurrency(entry.vatAmount)} · ` : ""}
                      {formatCurrency(entry.amount)} brutto
                    </p>
                    {!child && group.children.length > 0 && (
                      <ExpandToggle
                        open={expanded.has(group.head.id)}
                        hint={vorgangHint(group)}
                        description={group.head.description}
                        onToggle={() => toggleGroup(group.head.id)}
                      />
                    )}
                  </div>
                  {/* Hauptzahl netto wie in der Tabelle, Brutto steht als Nebenzeile links */}
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        MONEY_TONE[entry.type === "EXPENSE" ? "out" : "in"]
                      }`}
                    >
                      {entry.type === "EXPENSE" ? "−" : "+"}
                      {formatCurrency(entry.netAmount)}
                    </p>
                    <p className="font-mono text-[10px] font-normal text-text-secondary">netto</p>
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

/**
 * Der Aufklapper trägt gleichzeitig die Zusammenfassung dessen, was er verbirgt.
 * Ein blosses Dreieck würde die Zeilen zwar aufräumen, aber verschweigen, dass
 * darunter noch etwas liegt — und genau das war der Grund für die Gruppierung.
 */
function ExpandToggle({
  open,
  hint,
  description,
  onToggle,
}: {
  open: boolean;
  hint: string;
  description: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      // Die Zeile darüber klappt selbst schon auf — ohne das hier hebe sich der
      // Klick sofort wieder auf.
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      aria-label={`Buchungen zu ${description}`}
      className="mt-1 flex items-center gap-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-accent"
    >
      <svg
        className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      {hint}
    </button>
  );
}

/**
 * Wie viel Prozent der Kundenrechnung an den Partner gehen.
 *
 * Abgeleitet aus der Gegenbuchung derselben Aufteilung statt auf 50 % fest
 * verdrahtet — dann stimmt die Anmerkung auch, falls die Quote sich einmal
 * ändert. Die Gegenbuchung (SHARE_OUT) gehört demselben Ersteller wie die
 * Kundenrechnung, steht also auch bei gesetztem Personenfilter mit in der Liste.
 * Liefert undefined, wenn sie fehlt — dann bleibt es beim neutralen Hinweis.
 */
function useSharePercentByGroup(entries: FinanceEntry[]) {
  const byGroup = useMemo(() => {
    const full = new Map<string, number>();
    const share = new Map<string, number>();

    for (const entry of entries) {
      if (!entry.splitGroupId) continue;
      if (entry.splitRole === "ORIGIN") full.set(entry.splitGroupId, entry.amount);
      else if (entry.splitRole === "SHARE_OUT" || entry.splitRole === "SHARE_IN") {
        share.set(entry.splitGroupId, entry.amount);
      }
    }

    const percents = new Map<string, number>();
    for (const [group, amount] of full) {
      const part = share.get(group);
      if (part != null && amount > 0) percents.set(group, Math.round((part / amount) * 100));
    }
    return percents;
  }, [entries]);

  return (entry: FinanceEntry) =>
    entry.splitGroupId ? byGroup.get(entry.splitGroupId) : undefined;
}

/** Beschriftet, welche Rolle eine Buchung in einer Aufteilung hat. */
function splitLabel(entry: FinanceEntry, sharePercent?: number): string | null {
  const partner = entry.splitPartnerUsername ?? entry.sharedWithUsername;
  if (!partner) return null;

  switch (entry.splitRole) {
    // Beide Hälften einer geteilten Ausgabe sind gleichwertig — keine Richtung.
    case "HALF":
      return `50/50 · ${partner}`;
    // Die beiden Hälften sind selbst schon der Anteil — dort wäre "davon" falsch.
    case "SHARE_IN":
      return `Anteil von ${partner}`;
    case "SHARE_OUT":
      return `Anteil an ${partner}`;
    default:
      return sharePercent != null
        ? `davon ${sharePercent} % an ${partner}`
        : `50/50 · ${partner}`;
  }
}

function EntryBadges({ entry, sharePercent }: { entry: FinanceEntry; sharePercent?: number }) {
  const split = splitLabel(entry, sharePercent);
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
    // Bearbeiten und Löschen dürfen die Zeile nicht nebenbei auf- oder zuklappen
    <div className="flex shrink-0 items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: MoneyTone;
}) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-4">
      <p className="text-[10px] font-medium text-text-secondary sm:text-xs">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold sm:text-xl ${MONEY_TONE[tone]}`}>
        {formatCurrency(value)}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-text-secondary">{hint}</p>}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value ?? 0);
}

/**
 * Nur für die Grenzwert-Zeile: dort stehen vier Beträge nebeneinander, und auf
 * eine Grenze von 55.000 kommt es auf den Cent nicht an. Überall sonst bleibt
 * es bei {@link formatCurrency} — in der Buchhaltung wird nicht gerundet.
 */
function compactEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}
