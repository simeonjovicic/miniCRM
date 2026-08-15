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
  /** ALTBESTAND: Adresse als ein Freitextfeld, abgelöst durch die vier Zeilen darunter */
  address: string | null;
  /** Rechnungsanschrift, zeilenweise getrennt — so steht sie im Rechnungs-PDF */
  street: string | null;
  /** PLZ und Ort in einer Zeile: "1010 Wien" */
  zipCity: string | null;
  country: string | null;
  /** Umsatzsteuer-Identifikationsnummer, z. B. ATU12345678 */
  uid: string | null;
  status: "LEAD" | "PROSPECT" | "CUSTOMER" | "CHURNED";
  createdBy: string;
  createdAt: string;
}

export type TodoRecurrence =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

export const RECURRENCE_LABELS: Record<TodoRecurrence, string> = {
  NONE: "einmalig",
  DAILY: "täglich",
  WEEKLY: "wöchentlich",
  MONTHLY: "monatlich",
  QUARTERLY: "vierteljährlich",
  YEARLY: "jährlich",
};

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  /**
   * Liegt beim Kunden und nicht bei uns — ein eigener Zustand neben offen und
   * erledigt. "Seit zwei Wochen keine Antwort" und "noch nicht angefangen"
   * sähen sonst gleich aus, obwohl man beim einen nichts tun kann.
   */
  waiting?: boolean;
  /**
   * Platz in der von Hand gelegten Reihenfolge, kleiner heisst weiter oben.
   * Ersetzt die früheren Prioritätsstufen. Nicht gesetzt heisst "noch nie
   * einsortiert" und sinkt hinter alles Sortierte.
   */
  position?: number | null;
  dueDate: string | null;
  notes: string | null;
  /** Verknüpfter Kunde, gesetzt über die @-Erwähnung im Titel */
  customerId?: string;
  customerName?: string;
  /**
   * Wiederholung. Braucht ein Fälligkeitsdatum — daraus wird der nächste
   * Termin berechnet. Der Nachfolger entsteht beim Abhaken oder, wenn das
   * Todo liegen bleibt, nach Ablauf der Frist.
   */
  recurrence?: TodoRecurrence;
  /**
   * Wer es machen soll — im Unterschied zu createdBy, wer es aufgeschrieben hat.
   * Nicht gesetzt heisst: noch niemandem zugewiesen.
   */
  assigneeId?: string;
  assigneeUsername?: string;
  /** Anzahl der Kommentare — kommt aus der Liste, wird nicht gespeichert */
  commentCount: number;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

/**
 * Ein Termin. Anders als ein Todo hat er eine Uhrzeit und wird nicht abgehakt.
 * Der Pi schickt vorher Erinnerungen aufs Handy.
 */
export interface Appointment {
  id: string;
  title: string;
  description?: string;
  /** Lokale Zeit ohne Zeitzone, z.B. "2026-08-14T14:00:00" */
  startsAt: string;
  location?: string;
  customerId?: string;
  customerName?: string;
  /** Bereits verschickte Erinnerungen als "2,1" — nur zur Anzeige */
  remindersSentDays?: string;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

/** Eine Wortmeldung an einem Todo */
export interface TodoComment {
  id: string;
  todoId: string;
  text: string;
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
   * Rolle in der Aufteilung.
   *
   * Bei geteilten EINNAHMEN: ORIGIN ist die volle Kundenrechnung, SHARE_IN die
   * Anteilsrechnung des Partners, SHARE_OUT dieselbe Rechnung als Aufwand.
   *
   * Bei geteilten AUSGABEN gibt es nur HALF — zwei gleichwertige Hälften ohne
   * interne Verrechnung, beide zählen als echter Aufwand.
   */
  splitRole?: "ORIGIN" | "SHARE_IN" | "SHARE_OUT" | "HALF";
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
  /** Umsatz ausserhalb dieses CRM, zaehlt auf die Kleinunternehmergrenze */
  externalRevenue: number;
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
  /** Wem das Geld zusteht */
  username: string | null;
  gross: number;
  paid: number;
  /** Offener Restbetrag brutto — das, was noch überwiesen wird */
  open: number;
  /** Derselbe Restbetrag ohne USt */
  openNet: number;
  /**
   * Interne Anteilsrechnung aus einer Aufteilung statt einer Kundenforderung —
   * hier schuldet der Partner, nicht der Kunde.
   */
  internal: boolean;
  /** Bei internen Posten: wer schuldet */
  partner: string | null;
}

/** Umsatz einer Person, der nicht in diesem CRM erfasst ist */
export interface ExternalRevenue {
  id: string;
  year: number;
  userId: string;
  username: string | null;
  amount: number;
  note: string | null;
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
  /** Was Kunden uns noch schulden — ohne die interne Verrechnung */
  totalOpen: number;
  /** Was einer von beiden dem anderen aus einer Aufteilung schuldet */
  totalOpenInternal: number;
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

