import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FinancePage from "./FinancePage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2, testCustomer } from "../test/fixtures";
import type { FinanceEntry, FinanceStats, OpenReceivable } from "../types";

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
  totalOpenInternal: 0,
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
      externalRevenue: 0,
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
      openNet: 1000,
      internal: false,
      partner: null,
    },
  ],
};

/** Die interne Anteilsrechnung aus einer Aufteilung — kein Kundenaussenstand. */
const internerPosten: OpenReceivable = {
  id: "f-30",
  description: "Mr Sham Doggo — Anteil von alice",
  date: `${YEAR}-06-15`,
  username: testUser2.username,
  gross: 420,
  paid: 0,
  open: 420,
  openNet: 350,
  internal: true,
  partner: testUser.username,
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

/**
 * Teilen ist standardmässig an. Für Tests, die nur die USt-Vorschau prüfen,
 * stört die Aufteilungs-Vorschau mit ihren eigenen Beträgen — hier abschalten.
 */
async function ohneAufteilung() {
  await userEvent.click(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ }));
}

describe("FinancePage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("zeigt die Kennzahlen des Jahres", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByText("USt-Zahllast")).toBeInTheDocument());

    expect(screen.getByText("ans Finanzamt")).toBeInTheDocument();
    expect(screen.getByText("brutto · Kunden schulden uns")).toBeInTheDocument();

    // Einmal als Gesamtkachel, einmal in der Zeile der Person
    expect(screen.getAllByText("Umsatz netto")).toHaveLength(2);
  });

  it("trennt offene Kundenforderungen von der internen Aufteilung", async () => {
    ({ restore } = mockFinance({
      "/finance/stats": {
        ...stats,
        openEntries: [...stats.openEntries, internerPosten],
      },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    expect(await screen.findByText("Von Kunden")).toBeInTheDocument();
    expect(screen.getByText(/Intern · Aufteilung/)).toBeInTheDocument();

    // Die Richtung ist beim internen Posten die eigentliche Information
    expect(
      screen.getByText(new RegExp(`${testUser.username} schuldet ${testUser2.username}`)),
    ).toBeInTheDocument();

    // Der maschinelle Zusatz "— Anteil von X" ist raus, er stünde doppelt
    expect(screen.getByText("Mr Sham Doggo")).toBeInTheDocument();

    // Genau einmal: die Zahl steht in ihrer Zeile und nirgends sonst.
    // Gruppensummen gibt es nicht mehr, sie waren bei einem Posten identisch.
    expect(screen.getAllByText("420,00 €")).toHaveLength(1);
  });

  it("zeigt netto und brutto als Spalten statt an jeder Zahl", async () => {
    ({ restore } = mockFinance({
      "/finance/stats": {
        ...stats,
        openEntries: [...stats.openEntries, internerPosten],
      },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    // Die Einheit steht einmal als Spaltenkopf, nicht an jedem Betrag
    const card = within((await screen.findByText("Offene Posten")).closest("div")!.parentElement!);
    expect(card.getByText("Netto")).toBeInTheDocument();
    expect(card.getByText("Brutto")).toBeInTheDocument();

    // Beide Werte je Zeile, jeder genau einmal
    for (const value of ["1.000,00 €", "1.200,00 €", "350,00 €", "420,00 €"]) {
      expect(card.getAllByText(value)).toHaveLength(1);
    }

    // Keine gemeinsame Summe: "Kunden schulden uns" und "wir uns gegenseitig"
    // sind zwei Zahlen. 1.620 waere genau die Vermischung, die es nicht gibt.
    expect(card.queryByText("1.620,00 €")).not.toBeInTheDocument();
  });

  it("summiert je Gruppe, sobald sie mehr als einen Posten hat", async () => {
    const zweiterKunde: OpenReceivable = {
      ...stats.openEntries[0],
      id: "f-40",
      description: "Zweiter Auftrag",
      gross: 600,
      open: 600,
      openNet: 500,
    };
    ({ restore } = mockFinance({
      "/finance/stats": {
        ...stats,
        openEntries: [...stats.openEntries, zweiterKunde, internerPosten],
      },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    // Kunden: 1.200 + 600 = 1.800 brutto, 1.000 + 500 = 1.500 netto
    await screen.findByText("Von Kunden");
    expect(screen.getByText("1.800,00 €")).toBeInTheDocument();
    expect(screen.getByText("1.500,00 €")).toBeInTheDocument();

    // Der interne Block hat nur einen Posten und bekommt daher keine Summe
    expect(screen.getAllByText("420,00 €")).toHaveLength(1);
  });

  it("lässt die Summenzeile bei einem einzigen Posten weg", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await screen.findByText("Offene Posten");
    // Sie wäre wörtlich die Zeile darüber noch einmal
    expect(screen.queryByText("Summe")).not.toBeInTheDocument();
  });

  it("lässt den internen Block weg, wenn es keine Aufteilung gibt", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    expect(await screen.findByText("Von Kunden")).toBeInTheDocument();
    expect(screen.queryByText(/Intern · Aufteilung/)).not.toBeInTheDocument();
  });

  it("führt den Umsatz netto und nennt brutto nur als Nebenwert", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    // 1.200 brutto bei 200 USt → 1.000 netto ist die Hauptzahl
    await waitFor(() => expect(screen.getAllByText("1.000,00 €").length).toBeGreaterThan(0));
    expect(screen.getAllByText("1.200,00 € brutto").length).toBeGreaterThan(0);
  });

  it("nimmt Umsatz außerhalb des CRM in die Kleinunternehmergrenze auf", async () => {
    ({ restore } = mockFinance({
      "/finance/stats": {
        ...stats,
        perUser: [{ ...stats.perUser[0], externalRevenue: 5000 }],
      },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    // Am Meter muss stehen, woher der höhere Stand kommt
    expect(await screen.findByText(/inkl\. 5\.000,00 € außerhalb/)).toBeInTheDocument();
  });

  it("bietet je Person ein Feld für Umsatz außerhalb", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Betrag")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Einstellungen/ }));

    expect(
      screen.getByLabelText(`Umsatz außerhalb — ${testUser.username}`),
    ).toBeInTheDocument();
  });

  it("zeigt beide Grenzwert-Balken mit ihrer Bemessungsgrundlage", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    // Der Name der Person steht im Label, damit die Grenzen bei mehreren
    // Personen unterscheidbar bleiben — im Chart trennt sie die Farbe.
    const svs = await screen.findByRole("progressbar", {
      name: `SVS-Versicherungsgrenze — ${testUser.username}`,
    });
    const kleinunternehmer = screen.getByRole("progressbar", {
      name: `Kleinunternehmergrenze — ${testUser.username}`,
    });

    expect(svs).toHaveAttribute("aria-valuenow", "6");
    expect(kleinunternehmer).toHaveAttribute("aria-valuenow", "1");

    expect(screen.getByText("Basis: Gewinn")).toBeInTheDocument();
    expect(screen.getByText("Basis: Umsatz brutto")).toBeInTheDocument();
  });

  /**
   * Zwei Personen, die eingeloggte bewusst an zweiter Stelle der Serverantwort
   * und mit einem unverwechselbaren Gewinn, damit der Umschalter prüfbar ist.
   */
  function mockTwoPeople() {
    return mockFinance({
      "/finance/stats": {
        ...stats,
        perUser: [
          {
            ...stats.perUser[0],
            userId: testUser2.id,
            username: testUser2.username,
            profit: 12345.67,
          },
          stats.perUser[0],
        ],
      },
    });
  }

  it("fasst Grenzen und Kennzahlen beider Personen in einem Element zusammen", async () => {
    ({ restore } = mockTwoPeople());
    renderWithRouter(<FinancePage user={testUser} />);

    // Eine Überschrift, egal wie viele Personen — nicht eine Karte pro Person
    expect(await screen.findAllByText("Grenzwerte & Kennzahlen")).toHaveLength(1);

    // Zum Vergleichen stehen beide Meter nebeneinander, unabhängig vom Umschalter
    for (const name of [testUser.username, testUser2.username]) {
      expect(
        screen.getByRole("progressbar", { name: `SVS-Versicherungsgrenze — ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("übersteht ein Jahr ohne Einträge", async () => {
    ({ restore } = mockFinance({
      "/finance/stats": { ...stats, perUser: [], openEntries: [] },
    }));
    renderWithRouter(<FinancePage user={testUser} />);

    // Ohne Person gibt es nichts anzuzeigen — aber die Seite muss stehen
    await waitFor(() => expect(screen.getByText("USt-Zahllast")).toBeInTheDocument());
    expect(screen.queryByText("Grenzwerte & Kennzahlen")).not.toBeInTheDocument();
  });

  it("stellt die eingeloggte Person an die erste Stelle", async () => {
    ({ restore } = mockTwoPeople());
    renderWithRouter(<FinancePage user={testUser} />);

    const toggle = within(
      await screen.findByRole("group", { name: "Kennzahlen einer Person anzeigen" }),
    );
    const buttons = toggle.getAllByRole("button");

    expect(buttons[0]).toHaveTextContent(testUser.username);
    expect(buttons[1]).toHaveTextContent(testUser2.username);
    // und ist ohne Zutun ausgewählt
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("schaltet den Kennzahlen-Block auf die gewählte Person um", async () => {
    ({ restore } = mockTwoPeople());
    renderWithRouter(<FinancePage user={testUser} />);

    // Gezielt der Umschalter — den Namen trägt auch der Filter der Einträge-Liste
    const toggle = within(
      await screen.findByRole("group", { name: "Kennzahlen einer Person anzeigen" }),
    );

    // Startzustand: der eigene Gewinn, nicht der der anderen Person
    expect(screen.queryByText("12.345,67 €")).not.toBeInTheDocument();

    await userEvent.click(toggle.getByRole("button", { name: testUser2.username }));

    expect(screen.getByText("12.345,67 €")).toBeInTheDocument();
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
    await ohneAufteilung();
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
    await ohneAufteilung();
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
    expect(options.map((o) => o.textContent)).toEqual(["Offen", "Bezahlt", "Anzahlung"]);
  });

  it("bietet bei Ausgaben keine Anzahlung und nennt offen auch so", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Art")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");

    const options = within(screen.getByLabelText("Status")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Offen", "Bezahlt"]);
  });

  it("hat den 50/50-Haken von vornherein gesetzt", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    // Zu zweit ist Teilen der Normalfall
    const haken = await screen.findByRole("checkbox", { name: /50\/50 geteilt mit/ });
    expect(haken).toBeChecked();
  });

  it("teilt einen bestehenden Eintrag beim Speichern nicht nachträglich", async () => {
    const mocked = mockFinance({ "PUT /finance": rechnung });
    restore = mocked.restore;
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Projekt Website").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Projekt Website bearbeiten/ }));

    // Beim Bearbeiten ist der Haken aus, sonst wuerde blosses Speichern halbieren
    expect(screen.getByRole("checkbox", { name: /50\/50 geteilt mit/ })).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    const put = mocked.mock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "PUT",
    );
    expect(put).toBeDefined();
    const body = JSON.parse(String((put![1] as RequestInit).body));
    expect(body.sharedWithUserId).toBeUndefined();
  });

  it("bietet Aufteilung für Einnahmen wie für Ausgaben", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Art")).toBeInTheDocument());
    expect(screen.getByText(/50\/50 geteilt mit/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");

    // Auch Kosten sollen beide zur Hälfte tragen
    expect(screen.getByText(/50\/50 geteilt mit/)).toBeInTheDocument();
    expect(screen.getByText("Vorsteuer abziehbar")).toBeInTheDocument();
  });

  it("kündigt bei geteilten Ausgaben zwei Buchungen statt drei an", async () => {
    ({ restore } = mockFinance());
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Art")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Art"), "EXPENSE");
    await userEvent.type(screen.getByLabelText("Betrag"), "600");

    const preview = within(screen.getByTestId("split-preview"));
    expect(preview.getByText(/Es entstehen zwei Buchungen/)).toBeInTheDocument();
    // 600 brutto bei 20 % → je 300 brutto, Gewinn je −250
    expect(preview.getAllByText("300,00 €")).toHaveLength(2);
    expect(preview.getByText("250,00 €")).toBeInTheDocument();
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
      "Offen",
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
    expect(menu.getByRole("option", { name: "Offen" })).toHaveAttribute("aria-selected", "true");
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

  it("kehrt nach dem Speichern in den Hinzufügen-Modus zurück", async () => {
    ({ restore } = mockFinance({ "PUT /finance": rechnung }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Projekt Website").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    await userEvent.click(table.getByRole("button", { name: /Projekt Website bearbeiten/ }));
    expect(screen.getByText("Eintrag bearbeiten")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    // Danach muss man sofort wieder etwas Neues anlegen können
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hinzufügen" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Eintrag bearbeiten")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Betrag")).toHaveValue(null);
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
    expect(table.getByText("Offen")).toBeInTheDocument();
    expect(table.getByText(/200,00.*\(20%\)/)).toBeInTheDocument();
  });

  it("kennzeichnet eine Hälfte einer geteilten Buchung mit dem Partner", async () => {
    ({ restore } = mockFinance({ "/finance": [haelfte] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Geteiltes Projekt").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    expect(table.getByText(`50/50 · ${testUser2.username}`)).toBeInTheDocument();
  });

  it("merkt an der Kundenrechnung an, welcher Anteil an den Partner geht", async () => {
    // Vollständige Aufteilung: die volle Rechnung plus die Gegenbuchung daneben
    const kundenrechnung: FinanceEntry = {
      ...rechnung,
      id: "f-20",
      amount: 1200,
      description: "Geteiltes Projekt",
      splitGroupId: "group-2",
      splitRole: "ORIGIN",
      splitPartnerUsername: testUser2.username,
    };
    const gegenbuchung: FinanceEntry = {
      ...rechnung,
      id: "f-21",
      amount: 600,
      netAmount: 500,
      vatAmount: 100,
      type: "EXPENSE",
      // Bewusst nicht "Anteil an bob" wie beim Server, sonst träfe die
      // Assertion unten die Beschreibung statt das Badge.
      description: "Interne Anteilsrechnung",
      splitGroupId: "group-2",
      splitRole: "SHARE_OUT",
      splitPartnerUsername: testUser2.username,
    };

    ({ restore } = mockFinance({ "/finance": [kundenrechnung, gegenbuchung] }));
    renderWithRouter(<FinancePage user={testUser} />);

    await waitFor(() => expect(screen.getAllByText("Geteiltes Projekt").length).toBeGreaterThan(0));

    const table = within(screen.getByRole("table"));
    // 600 von 1.200 — der Prozentsatz kommt aus den Beträgen, nicht aus einer Konstante
    expect(table.getByText(`davon 50 % an ${testUser2.username}`)).toBeInTheDocument();
    // Die Gegenbuchung ist selbst der Anteil und behält ihre eigene Beschriftung
    expect(table.getByText(`Anteil an ${testUser2.username}`)).toBeInTheDocument();
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
