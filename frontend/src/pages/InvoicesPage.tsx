import { useMemo, useState } from "react";
import { generateInvoicePdf, type InvoicePosition } from "../utils/invoicePdf";

const LS_KEY_LAST_NUMBER = "minicrm:lastInvoiceNumber";

function suggestNextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const last = localStorage.getItem(LS_KEY_LAST_NUMBER);
  if (last) {
    const m = last.match(/^(\d{4})-(\d+)$/);
    if (m && m[1] === String(year)) {
      const next = String(parseInt(m[2], 10) + 1).padStart(3, "0");
      return `${year}-${next}`;
    }
  }
  return `${year}-001`;
}

function emptyPosition(): InvoicePosition {
  return { title: "", details: "", vatRate: 20, unitPrice: 0 };
}

export default function InvoicesPage() {
  const [receiverName, setReceiverName] = useState("");
  const [receiverStreet, setReceiverStreet] = useState("");
  const [receiverCityLine, setReceiverCityLine] = useState("");
  const [receiverCountry, setReceiverCountry] = useState("Österreich");
  const [receiverUid, setReceiverUid] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(suggestNextInvoiceNumber);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [positions, setPositions] = useState<InvoicePosition[]>([emptyPosition()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePosition(index: number, patch: Partial<InvoicePosition>) {
    setPositions((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPosition() {
    setPositions((prev) => [...prev, emptyPosition()]);
  }

  function removePosition(index: number) {
    setPositions((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const { netSum, vatSum, total } = useMemo(() => {
    let net = 0;
    let vat = 0;
    for (const p of positions) {
      net += p.unitPrice;
      vat += p.unitPrice * (p.vatRate / 100);
    }
    return { netSum: net, vatSum: vat, total: net + vat };
  }, [positions]);

  const canGenerate =
    receiverName.trim() !== "" &&
    receiverStreet.trim() !== "" &&
    receiverCityLine.trim() !== "" &&
    invoiceNumber.trim() !== "" &&
    positions.length > 0 &&
    positions.every((p) => p.title.trim() !== "" && p.unitPrice > 0);

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setError(null);
    setGenerating(true);
    try {
      const date = new Date(dateStr + "T00:00:00");
      await generateInvoicePdf({
        receiverName: receiverName.trim(),
        receiverStreet: receiverStreet.trim(),
        receiverCityLine: receiverCityLine.trim(),
        receiverCountry: receiverCountry.trim(),
        receiverUid: receiverUid.trim() || undefined,
        invoiceNumber: invoiceNumber.trim(),
        date,
        positions: positions.map((p) => ({
          ...p,
          title: p.title.trim(),
          details: p.details.trim(),
        })),
      });
      localStorage.setItem(LS_KEY_LAST_NUMBER, invoiceNumber.trim());
      setInvoiceNumber(suggestNextInvoiceNumber());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      setGenerating(false);
    }
  }

  function fmtMoney(n: number) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-bright">Rechnungen</h1>
        <p className="text-sm text-text-secondary mt-1">
          Felder ausfüllen, PDF erzeugen – Layout entspricht der HANGO-Vorlage.
        </p>
      </div>

      {/* Empfänger */}
      <section className="glass-strong rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide">Empfänger</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Firma / Name">
            <input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="DATRI PRIVAT GYM Sportverein"
              className={inputCls}
            />
          </Field>
          <Field label="Straße">
            <input
              value={receiverStreet}
              onChange={(e) => setReceiverStreet(e.target.value)}
              placeholder="Josefsplatz 6"
              className={inputCls}
            />
          </Field>
          <Field label="PLZ + Ort">
            <input
              value={receiverCityLine}
              onChange={(e) => setReceiverCityLine(e.target.value)}
              placeholder="1010 Wien"
              className={inputCls}
            />
          </Field>
          <Field label="Land">
            <input
              value={receiverCountry}
              onChange={(e) => setReceiverCountry(e.target.value)}
              placeholder="Österreich"
              className={inputCls}
            />
          </Field>
          <Field label="UID-Nr. (optional)">
            <input
              value={receiverUid}
              onChange={(e) => setReceiverUid(e.target.value)}
              placeholder="ATU12345678"
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Rechnungs-Meta */}
      <section className="glass-strong rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide">Rechnungsdaten</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Rechnungsnummer">
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="2026-005"
              className={inputCls}
            />
          </Field>
          <Field label="Datum">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <p className="text-xs text-text-secondary">
          Leistungszeitraum, Fälligkeit (+14 Tage) und Verwendungszweck werden automatisch berechnet.
        </p>
      </section>

      {/* Positionen */}
      <section className="glass-strong rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide">Positionen</h2>
          <button
            onClick={addPosition}
            type="button"
            className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-dim transition-all"
          >
            + Position
          </button>
        </div>

        <div className="space-y-4">
          {positions.map((p, i) => (
            <div key={i} className="rounded-xl border border-border-strong/40 bg-white/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-secondary">Position {i + 1}</span>
                {positions.length > 1 && (
                  <button
                    onClick={() => removePosition(i)}
                    type="button"
                    className="text-[12px] text-status-churned hover:underline"
                  >
                    Entfernen
                  </button>
                )}
              </div>

              <Field label="Bezeichnung">
                <input
                  value={p.title}
                  onChange={(e) => updatePosition(i, { title: e.target.value })}
                  placeholder="Anzahlung Meta Ads Paket – 1 Monat"
                  className={inputCls}
                />
              </Field>

              <Field label="Details (optional)">
                <textarea
                  value={p.details}
                  onChange={(e) => updatePosition(i, { details: e.target.value })}
                  rows={2}
                  placeholder="Kampagnenstrategie | Einrichtung & Konfiguration | …"
                  className={inputCls + " resize-none"}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Einzelpreis (€, netto)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.unitPrice === 0 ? "" : p.unitPrice}
                    onChange={(e) =>
                      updatePosition(i, { unitPrice: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="145.00"
                    className={inputCls}
                  />
                </Field>
                <Field label="USt. (%)">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={p.vatRate}
                    onChange={(e) =>
                      updatePosition(i, { vatRate: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Summen-Preview */}
      <section className="glass-strong rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-text-bright uppercase tracking-wide mb-3">Vorschau</h2>
        <div className="space-y-1.5 text-sm">
          <Row label="Netto" value={`${fmtMoney(netSum)} €`} />
          <Row label="USt." value={`${fmtMoney(vatSum)} €`} />
          <div className="border-t border-border-strong/40 pt-2 mt-2">
            <Row label="Gesamt" value={`${fmtMoney(total)} €`} bold />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-status-churned/10 border border-status-churned/30 px-4 py-3 text-sm text-status-churned">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm shadow-accent/30 hover:bg-accent-dim transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? "Erzeuge PDF…" : "PDF erzeugen & herunterladen"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-strong/50 bg-white/70 px-3 py-2 text-sm text-text-bright placeholder-text-secondary/60 outline-none focus:border-accent focus:bg-white transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-text-bright" : "text-text-secondary"}>{label}</span>
      <span className={`font-mono ${bold ? "font-semibold text-text-bright" : "text-text-bright"}`}>
        {value}
      </span>
    </div>
  );
}
