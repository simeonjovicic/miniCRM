import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FinancePage from "./FinancePage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2, testCustomer } from "../test/fixtures";
import type { FinanceEntry, FinanceStats } from "../types";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

const YEAR = new Date().getFullYear();

const rechnung: FinanceEntry = {
  id: "f-1",
  amount: 1200,
  netAmount: 1000,
  vatAmount: 200,
  vatRate: 20,
  inputMode: "GROSS",
  type: "INCOME",
  kind: "INVOICE",
  status: "SENT",
  description: "Projekt Website",
  date: `${YEAR}-06-15`,
  createdBy: testUser.id,
  createdByUsername: testUser.username,
  createdAt: `${YEAR}-06-15T10:00:00Z`,
};

/** Eine Hälfte einer geteilten Buchung, wie sie der Server nach dem Aufteilen liefert. */
const haelfte: FinanceEntry = {
  ...rechnung,
  id: "f-9",
  amount: 600,
  netAmount: 500,
  vatAmount: 100,
  description: "Geteiltes Projekt",
  splitGroupId: "group-1",
  splitPartnerUsername: testUser2.username,
};

const stats: FinanceStats = {
  year: YEAR,
  settings: {
    year: YEAR,
    svsThreshold: 6613.2,
    smallBusinessThreshold: 55000,
    splitBasis: "GROSS",
  },
  totalRevenueGross: 1200,
  totalRevenueNet: 1000,
  totalExpenseCost: 0,
  totalVatOwed: 200,
  totalInputVat: 0,
  totalVatBalance: 200,
  totalProfit: 1000,
  totalOpen: 1200,
  perUser: [
    {
      userId: testUser.id,
      username: testUser.username,
      revenueGross: 600,
      revenueNet: 400,
      vatOwed: 200,
      expenseCost: 0,
      inputVat: 0,
      vatBalance: 200,
      profit: 400,
      openReceivables: 1200,
      svs: { current: 400, threshold: 6613.2, percent: 6.05, remaining: 6213.2, exceeded: false },
      smallBusiness: { current: 600, threshold: 55000, percent: 1.09, remaining: 54400, exceeded: false },
    },
  ],
  openEntries: [
    {
      id: "f-1",
      description: "Projekt Website",
      date: `${YEAR}-06-15`,
      username: testUser.username,
      gross: 1200,
      paid: 0,
      open: 1200,
    },
  ],
};

/** Reihenfolge zählt: mockFetch matcht per includes, /finance/stats muss vor /finance stehen. */
function mockFinance(overrides: Record<string, unknown> = {}) {
  return mockFetch({
    "/finance/stats": stats,
    "/finance/settings": stats.settings,
    "/finance": [rechnung],
    "/users": [testUser, testUser2],
    "/customers": [testCustomer],
    ...overrides,
  });
}

/** Das Formular, damit Vorschau-Werte nicht mit denen aus Liste und Kacheln kollidieren. */
function form() {
  return within(screen.getByRole("button", { name: "Hinzufügen" }).closest("form")!);
}

describe("FinancePage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("zeigt die Kennzahlen des Jahres", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByText("USt-Zahllast")).toBeInTheDocument());

    expect(screen.getByText("ans Finanzamt")).toBeInTheDocument();
    expect(screen.getByText("verschickt, unbezahlt")).toBeInTheDocument();

    // Einmal als Gesamtkachel, einmal in der Zeile der Person
    expect(screen.getAllByText("Umsatz brutto")).toHaveLength(2);
  });

  it("zeigt beide Grenzwert-Balken mit ihrer Bemessungsgrundlage", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    const svs = await screen.findByRole("progressbar", { name: "SVS-Versicherungsgrenze" });
    const kleinunternehmer = screen.getByRole("progressbar", { name: "Kleinunternehmergrenze" });

    expect(svs).toHaveAttribute("aria-valuenow", "6");
    expect(kleinunternehmer).toHaveAttribute("aria-valuenow", "1");

    expect(screen.getByText("Basis: Gewinn")).toBeInTheDocument();
    expect(screen.getByText("Basis: Umsatz brutto")).toBeInTheDocument();
  });

  it("markiert eine überschrittene Grenze", async () => {
    ({ restore } = mockFinance({
      "/finance/stats": {
        ...stats,
        perUser: [
          {
            ...stats.perUser[0],
            svs: {
              current: 7000,
              threshold: 6613.2,
              percent: 105.85,
              remaining: -386.8,
              exceeded: true,
            },
          },
        ],
      },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    expect(await screen.findByText(/überschritten um/)).toBeInTheDocument();
  });

  // ── Brutto/Netto-Umschalter ─────────────────────────────────────

  it("rechnet Brutto standardmäßig in Netto und USt auf", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "120");

    // 120 brutto bei 20 % → 100 netto + 20 USt
    expect(form().getByText(/^100,00/)).toBeInTheDocument();
    expect(form().getByText(/^20,00/)).toBeInTheDocument();
  });

  it("schlägt nach dem Umschalten auf Netto die USt auf", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Netto" }));

    // 100 netto bei 20 % → 120 brutto
    expect(form().getByText(/^120,00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Netto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("blendet die USt bei 'keine USt' aus der Vorschau aus", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "250");
    await userEvent.selectOptions(screen.getByLabelText("USt-Satz"), "0");

    expect(form().getByText(/^0,00/)).toBeInTheDocument();
    expect(form().getAllByText(/^250,00/)).toHaveLength(2); // netto und brutto
  });

  // ── Felder je nach Art ──────────────────────────────────────────

  it("führt Rechnung, Anzahlung und Zahlungsstand in einem Statusfeld", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());

    const options = within(screen.getByLabelText("Status")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Gesendet", "Bezahlt", "Anzahlung"]);
  });

  it("bietet bei Ausgaben keine Anzahlung und nennt offen auch so", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Art")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");

    const options = within(screen.getByLabelText("Status")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Offen", "Bezahlt"]);
  });

  it("bietet Aufteilung nur bei Einnahmen", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Art")).toBeInTheDocument());
    expect(screen.getByText(/50\/50 geteilt mit/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");

    expect(screen.queryByText(/50\/50 geteilt mit/)).not.toBeInTheDocument();
    expect(screen.getByText("Vorsteuer abziehbar")).toBeInTheDocument();
  });

  it("setzt den Status beim Wechsel auf Ausgabe auf bezahlt", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());
    expect(screen.getByLabelText("Status")).toHaveValue("SENT");

    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");

    expect(screen.getByLabelText("Status")).toHaveValue("PAID");
  });

  it("zeigt das Verknüpfungsfeld erst beim Status Anzahlung", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());
    expect(screen.queryByLabelText("Anzahlung auf")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "DEPOSIT");

    expect(screen.getByLabelText("Anzahlung auf")).toBeInTheDocument();
  });

  // ── Aufteilungs-Vorschau ────────────────────────────────────────

  /** Kundenrechnung voll, Anteilsrechnung des Partners, Gegenbuchung mit Vorsteuer. */
  it("kündigt die drei Buchungen samt Vorsteuer-Gegenbuchung an", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "1200");
    await userEvent.click(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ }));

    const split = within(screen.getByTestId("split-preview"));

    expect(split.getByText(/drei Buchungen/)).toBeInTheDocument();
    // 1.200 Kundenrechnung mit 200 USt
    expect(split.getByText(/1\.200,00/)).toBeInTheDocument();
    expect(split.getByText(/200,00 € USt schuldest du/)).toBeInTheDocument();
    // 600 Anteilsrechnung, deren USt als Vorsteuer zurückkommt
    expect(split.getByText(/600,00/)).toBeInTheDocument();
    expect(split.getByText(/100,00 € USt schuldet er/)).toBeInTheDocument();
    // "Vorsteuer" steht als eigenes Element im Satz
    expect(split.getByText("Vorsteuer")).toBeInTheDocument();
  });

  it("zeigt den Gewinn beider Seiten", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "1200");
    await userEvent.click(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ }));

    const split = within(screen.getByTestId("split-preview"));

    // 1.000 netto minus 500 Anteil = 500 für jeden
    expect(split.getAllByText(/500,00/)).toHaveLength(2);
  });

  it("nennt ohne USt weder USt-Schuld noch Vorsteuer", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "1000");
    await userEvent.selectOptions(screen.getByLabelText("USt-Satz"), "0");
    await userEvent.click(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ }));

    const split = within(screen.getByTestId("split-preview"));

    expect(split.queryByText(/USt/)).not.toBeInTheDocument();
    expect(split.queryByText(/Vorsteuer/)).not.toBeInTheDocument();
    expect(split.getByText(/mindert deinen Gewinn/)).toBeInTheDocument();
  });

  // ── Status direkt in der Liste umschalten ───────────────────────

  it("schaltet den Status per Klick auf das Abzeichen um", async () => {
    const base = mockFinance();
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        calls.push({ url: String(input), body: JSON.parse(String(init.body)) });
        return Promise.resolve(
          new Response(JSON.stringify({ ...rechnung, status: "PAID" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Status von Projekt Website/ }));
    await userEvent.click(within(screen.getByRole("listbox", { name: "Status wählen" })).getByText("Bezahlt"));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/finance/${rechnung.id}/status`);
    expect(calls[0].body).toEqual({ status: "PAID", kind: "INVOICE" });
  });

  it("bietet im Statusmenü dieselben Optionen wie das Formular", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Status von Projekt Website/ }));

    const menu = within(screen.getByRole("listbox", { name: "Status wählen" }));
    expect(menu.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Gesendet",
      "Bezahlt",
      "Anzahlung",
    ]);
  });

  it("markiert den aktuellen Status im Menü", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Status von Projekt Website/ }));

    const menu = within(screen.getByRole("listbox", { name: "Status wählen" }));
    expect(menu.getByRole("option", { name: "Gesendet" })).toHaveAttribute("aria-selected", "true");
    expect(menu.getByRole("option", { name: "Bezahlt" })).toHaveAttribute("aria-selected", "false");
  });

  it("zeigt bei Ausgaben kein Anzahlung im Statusmenü", async () => {
    ({ restore } = mockFinance({
      "/finance": [{ ...rechnung, type: "EXPENSE", status: "PAID", vatDeductible: true }],
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Status von Projekt Website/ }));

    const menu = within(screen.getByRole("listbox", { name: "Status wählen" }));
    expect(menu.getAllByRole("option").map((o) => o.textContent)).toEqual(["Offen", "Bezahlt"]);
  });

  // ── Personenfilter ──────────────────────────────────────────────

  it("filtert die Liste nach Person, damit sich die Bücher nicht vermischen", async () => {
    const bobsAnteil: FinanceEntry = {
      ...rechnung,
      id: "f-3",
      amount: 600,
      netAmount: 500,
      vatAmount: 100,
      description: "Projekt Website — Anteil von admin",
      splitGroupId: "group-2",
      splitRole: "SHARE_IN",
      splitPartnerUsername: testUser.username,
      createdBy: testUser2.id,
      createdByUsername: testUser2.username,
    };
    ({ restore } = mockFinance({ "/finance": [rechnung, bobsAnteil] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByRole("group", { name: "Nach Person filtern" })).toBeInTheDocument());

    const filter = within(screen.getByRole("group", { name: "Nach Person filtern" }));
    const table = () => within(screen.getByRole("table"));

    // Ungefiltert stehen beide Buchungen da
    expect(table().getAllByRole("row")).toHaveLength(3); // Kopfzeile + 2

    await userEvent.click(filter.getByRole("button", { name: testUser2.username }));

    expect(table().getAllByRole("row")).toHaveLength(2); // Kopfzeile + bobs Anteil
    expect(table().getByText(/Anteil von admin/)).toBeInTheDocument();
    expect(filter.getByRole("button", { name: testUser2.username })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(filter.getByRole("button", { name: "Alle" }));
    expect(table().getAllByRole("row")).toHaveLength(3);
  });

  it("beschriftet die Anteilsbuchungen nach ihrer Rolle", async () => {
    const gegenbuchung: FinanceEntry = {
      ...rechnung,
      id: "f-4",
      type: "EXPENSE",
      amount: 600,
      netAmount: 500,
      vatAmount: 100,
      vatDeductible: true,
      description: "Projekt Website — Anteil an bob",
      splitGroupId: "group-2",
      splitRole: "SHARE_OUT",
      splitPartnerUsername: testUser2.username,
    };
    ({ restore } = mockFinance({ "/finance": [gegenbuchung] }));
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText(`Anteil an ${testUser2.username}`)).toBeInTheDocument();
  });

  it("blendet die Aufteilungs-Vorschau ohne Betrag aus", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ }));

    expect(screen.queryByTestId("split-preview")).not.toBeInTheDocument();
  });

  // ── Bearbeiten ──────────────────────────────────────────────────

  it("übernimmt den Eintrag ins Formular und setzt den Cursor hinein", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Projekt Website").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Projekt Website bearbeiten/ }));

    expect(screen.getByText("Eintrag bearbeiten")).toBeInTheDocument();
    expect(screen.getByLabelText("Betrag")).toHaveValue(1200);
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Projekt Website");
    expect(screen.getByLabelText("Status")).toHaveValue("SENT");

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toHaveFocus());
  });

  it("lädt eine Anzahlung als Status Anzahlung ins Formular", async () => {
    const anzahlung = {
      ...rechnung,
      id: "f-2",
      kind: "DEPOSIT" as const,
      status: "PAID" as const,
      parentId: "f-1",
      description: "Anzahlung Website",
      sharedWithUserId: undefined,
      sharedWithUsername: undefined,
    };
    ({ restore } = mockFinance({ "/finance": [rechnung, anzahlung] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Anzahlung Website").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Anzahlung Website bearbeiten/ }));

    expect(screen.getByLabelText("Status")).toHaveValue("DEPOSIT");
    expect(screen.getByLabelText("Anzahlung auf")).toHaveValue("f-1");
  });

  // ── Liste ───────────────────────────────────────────────────────

  it("zeigt die USt-Aufschlüsselung je Eintrag", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Projekt Website").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Gesendet")).toBeInTheDocument();
    expect(table.getByText(/200,00.*\(20%\)/)).toBeInTheDocument();
  });

  it("kennzeichnet eine Hälfte einer geteilten Buchung mit dem Partner", async () => {
    ({ restore } = mockFinance({ "/finance": [haelfte] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Geteiltes Projekt").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    expect(table.getByText(`50/50 · ${testUser2.username}`)).toBeInTheDocument();
  });

  it("blendet beim Bearbeiten einer Hälfte den Teilen-Haken aus", async () => {
    ({ restore } = mockFinance({ "/finance": [haelfte] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Geteiltes Projekt").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Geteiltes Projekt bearbeiten/ }));

    expect(screen.getByText(/Teil einer geteilten Buchung/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /50\/50 geteilt mit/ })).not.toBeInTheDocument();
  });

  // ── Kundenverknüpfung ───────────────────────────────────────────

  it("schlägt nach @ passende Kunden vor und verknüpft den ausgewählten", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Beschreibung")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Beschreibung"), "Rechnung für @Acme");

    const option = await screen.findByRole("option", { name: /Acme Corp/ });
    await userEvent.click(option);

    // Der Name landet im Text, die Verknüpfung wird separat angezeigt
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Rechnung für Acme Corp");
    expect(screen.getByText(`@${testCustomer.name}`)).toBeInTheDocument();
  });

  it("lässt die Kundenverknüpfung wieder lösen", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Beschreibung")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Beschreibung"), "@Acme");
    await userEvent.click(await screen.findByRole("option", { name: /Acme Corp/ }));
    await userEvent.click(screen.getByText("Verknüpfung lösen"));

    expect(screen.queryByText(`@${testCustomer.name}`)).not.toBeInTheDocument();
    // Der getippte Text bleibt stehen, nur die Zuordnung fällt weg
    expect(screen.getByLabelText("Beschreibung")).toHaveValue("Acme Corp");
  });

  it("verlinkt den Kunden am gespeicherten Eintrag", async () => {
    ({ restore } = mockFinance({
      "/finance": [{ ...rechnung, customerId: testCustomer.id, customerName: testCustomer.name }],
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    const link = table.getByRole("link", { name: `@${testCustomer.name}` });

    expect(link).toHaveAttribute("href", `/customers/${testCustomer.id}`);
  });

  // ── Rechnungsanhang ─────────────────────────────────────────────

  it("verlinkt die angehängte Rechnung in die Vorschau", async () => {
    ({ restore } = mockFinance({
      "/finance": [
        { ...rechnung, attachmentPath: "Rechnungen/RE-004.pdf", attachmentName: "RE-004.pdf" },
      ],
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    const table = within(await screen.findByRole("table"));
    const link = table.getByRole("link", { name: /Rechnung/ });

    expect(link).toHaveAttribute(
      "href",
      `/api/storage/preview?path=${encodeURIComponent("Rechnungen/RE-004.pdf")}`,
    );
  });

  it("öffnet den Auswahldialog für den Share", async () => {
    ({ restore } = mockFinance({ "/storage/files": [{ name: "RE-004.pdf", directory: false, size: 1024, lastModified: 0 }] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Rechnung wählen" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Rechnung wählen" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Rechnung auswählen" }));
    await userEvent.click(await dialog.findByText("RE-004.pdf"));

    // Nach der Auswahl hängt die Datei am Formular
    expect(screen.getByRole("button", { name: "Rechnung ändern" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RE-004.pdf/ })).toBeInTheDocument();
  });

  it("listet offene Posten mit ihrem Restbetrag", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Offene Posten")).toBeInTheDocument());
  });

  // ── Fehler ──────────────────────────────────────────────────────

  it("zeigt die Fehlermeldung des Backends im Klartext statt eines Statuscodes", async () => {
    const base = mockFinance();
    const passthrough = globalThis.fetch;
    restore = base.restore;

    // Lesen läuft über den normalen Mock, nur das Anlegen wird abgelehnt —
    // so wie es das Backend bei einem unzulässigen USt-Satz tut.
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Unzulässiger USt-Satz: 19" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Betrag"), "120");
    await userEvent.type(screen.getByLabelText("Beschreibung"), "Test");
    await userEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(await screen.findByText("Unzulässiger USt-Satz: 19")).toBeInTheDocument();
  });
});
