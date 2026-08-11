export interface User {
  id: string;
  username: string;
  email: string;
  role: "ADMIN" | "SALES" | "SUPPORT";
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  address: string | null;
  status: "LEAD" | "PROSPECT" | "CUSTOMER" | "CHURNED";
  createdBy: string;
  createdAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  notes: string | null;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

/** Einnahme oder Ausgabe */
export type FinanceType = "INCOME" | "EXPENSE";

/** Normaler Eintrag oder Anzahlung auf eine Rechnung */
export type FinanceKind = "INVOICE" | "DEPOSIT";

/** Entwurf → gesendet (Zahlung offen) → bezahlt */
export type FinanceStatus = "DRAFT" | "SENT" | "PAID";

/** Ob der eingetippte Betrag brutto oder netto gemeint war */
export type VatInputMode = "GROSS" | "NET";

/** In Österreich gebräuchliche USt-Sätze. 0 = keine USt. */
export const VAT_RATES = [0, 10, 13, 20] as const;

/**
 * Ein Finanzeintrag.
 *
 * `amount` ist immer der BRUTTObetrag — `netAmount` und `vatAmount` werden vom
 * Backend daraus berechnet, damit netto + USt exakt brutto ergibt.
 *
 * Felder, die null wären, fehlen in der Antwort komplett: das Backend läuft mit
 * `default-property-inclusion: non_null`. Deshalb sind sie hier optional.
 */
export interface FinanceEntry {
  id: string;
  /** Bruttobetrag */
  amount: number;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  inputMode: VatInputMode;
  /** Nur bei Ausgaben: ob die USt als Vorsteuer abziehbar ist */
  vatDeductible?: boolean;
  type: FinanceType;
  kind: FinanceKind;
  status: FinanceStatus;
  /** Nur bei Anzahlungen: die Rechnung, auf die sie geht */
  parentId?: string;
  /**
   * Beim Anlegen die Anweisung "teile das mit dieser Person" — der Server macht
   * daraus zwei Buchungen und speichert das Feld selbst nie.
   * An gespeicherten Einträgen steht es nur noch bei Altbestand.
   */
  sharedWithUserId?: string;
  sharedWithUsername?: string;
  /** Klammer um die drei Buchungen einer geteilten Einnahme */
  splitGroupId?: string;
  /**
   * Rolle in der Aufteilung: ORIGIN ist die volle Kundenrechnung, SHARE_IN die
   * Anteilsrechnung des Partners, SHARE_OUT dieselbe Rechnung als Aufwand.
   */
  splitRole?: "ORIGIN" | "SHARE_IN" | "SHARE_OUT";
  /** Die jeweils andere Person einer geteilten Buchung */
  splitPartnerUsername?: string;
  /** Verknüpfter Kunde, gesetzt über die @-Erwähnung */
  customerId?: string;
  customerName?: string;
  /** Angehängte Rechnung im Samba-Share */
  attachmentPath?: string;
  attachmentName?: string;
  description: string;
  date: string;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

/** Fortschritt gegen eine Jahresgrenze (SVS bzw. Kleinunternehmer) */
export interface ThresholdProgress {
  current: number;
  threshold: number;
  percent: number;
  remaining: number;
  exceeded: boolean;
}

export interface FinanceUserStats {
  userId: string;
  username: string;
  /** Anteil am Umsatz inkl. USt */
  revenueGross: number;
  /** Umsatz nach Abzug der eigenen USt-Schuld */
  revenueNet: number;
  /** USt aus selbst gestellten Rechnungen — wird bei geteilten Einnahmen nicht aufgeteilt */
  vatOwed: number;
  expenseCost: number;
  inputVat: number;
  /** Zahllast ans Finanzamt: vatOwed − inputVat */
  vatBalance: number;
  profit: number;
  openReceivables: number;
  svs: ThresholdProgress;
  smallBusiness: ThresholdProgress;
}

export interface FinanceSettings {
  year: number;
  /** Wird gegen den Gewinn gerechnet */
  svsThreshold: number;
  /** Wird gegen den Umsatz gerechnet */
  smallBusinessThreshold: number;
  /** Basis für die 50/50-Aufteilung geteilter Einnahmen */
  splitBasis: "GROSS" | "NET";
}

export interface OpenReceivable {
  id: string;
  description: string;
  date: string;
  username: string | null;
  gross: number;
  paid: number;
  open: number;
}

export interface FinanceStats {
  year: number;
  settings: FinanceSettings;
  totalRevenueGross: number;
  totalRevenueNet: number;
  totalExpenseCost: number;
  totalVatOwed: number;
  totalInputVat: number;
  totalVatBalance: number;
  totalProfit: number;
  totalOpen: number;
  perUser: FinanceUserStats[];
  openEntries: OpenReceivable[];
}

export interface TimeEntry {
  id: string;
  description: string | null;
  userId: string;
  username: string | null;
  startedAt: string;
  stoppedAt: string | null;
  durationSeconds: number | null;
  customerId: string | null;
  todoId: string | null;
  sessionGroupId: string | null;
}

