import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoicesPage from "./InvoicesPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testCustomer } from "../test/fixtures";
import type { Customer } from "../types";

/** Der CRDT-Hook haengt am WebSocket — hier geht es um das Formular, nicht um Sync. */
vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

/** Die PDF-Erzeugung braucht pdfmake samt Schriften — im Test nicht Gegenstand. */
vi.mock("../utils/invoicePdf", () => ({
  generateInvoicePdf: vi.fn(),
}));

const LS_KEY = "minicrm:lastInvoiceNumber";

describe("InvoicesPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-14T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  // ── Rechnungsnummer ─────────────────────────────────────────────

  it("beginnt ohne Vorgeschichte bei 001 des laufenden Jahres", () => {
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  it("zählt von der zuletzt vergebenen Nummer hoch", () => {
    localStorage.setItem(LS_KEY, "2026-007");
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-008")).toBeInTheDocument();
  });

  it("füllt die laufende Nummer auf drei Stellen auf", () => {
    localStorage.setItem(LS_KEY, "2026-099");
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-100")).toBeInTheDocument();
  });

  /** Zum Jahreswechsel faengt die Nummerierung wieder bei eins an. */
  it("startet im neuen Jahr wieder bei 001", () => {
    localStorage.setItem(LS_KEY, "2025-042");
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  it("verträgt eine unbrauchbare gespeicherte Nummer", () => {
    localStorage.setItem(LS_KEY, "kaputt");
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  // ── Positionen ──────────────────────────────────────────────────

  it("startet mit genau einer Position", () => {
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByText("Position 1")).toBeInTheDocument();
    expect(screen.queryByText("Position 2")).not.toBeInTheDocument();
  });

  it("nimmt weitere Positionen auf", async () => {
    renderWithRouter(<InvoicesPage user={testUser} />);

    await userEvent.click(screen.getByRole("button", { name: "+ Position" }));

    await waitFor(() => expect(screen.getByText("Position 2")).toBeInTheDocument());
  });

  // ── Datum ───────────────────────────────────────────────────────

  it("belegt das Rechnungsdatum mit heute vor", () => {
    renderWithRouter(<InvoicesPage user={testUser} />);

    expect(screen.getByDisplayValue("2026-08-14")).toBeInTheDocument();
  });

  // ── Empfänger aus den Kundendaten ───────────────────────────────

  /** Ein Kunde, wie er nach dem Pflegen der Rechnungsanschrift aussieht. */
  const gepflegt: Customer = {
    ...testCustomer,
    company: "Acme",
    street: "Josefsplatz 6",
    zipCity: "1010 Wien",
    country: "Österreich",
    uid: "ATU12345678",
  };

  function mitKunden(customer: Customer = gepflegt) {
    return mockFetch({ "/customers": [customer] });
  }

  async function waehleKunden(name = "Acme") {
    const auswahl = await screen.findByLabelText("Kunde übernehmen");
    await userEvent.selectOptions(auswahl, screen.getByRole("option", { name }));
  }

  it("übernimmt Anschrift und UID des gewählten Kunden", async () => {
    const { restore } = mitKunden();
    renderWithRouter(<InvoicesPage user={testUser} />);

    await waehleKunden();

    // Genau die fünf Felder, die sonst jedes Mal abgetippt werden
    expect(screen.getByLabelText("Firma / Name")).toHaveValue("Acme");
    expect(screen.getByDisplayValue("Josefsplatz 6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1010 Wien")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Österreich")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ATU12345678")).toBeInTheDocument();

    restore();
  });

  it("nimmt die Firma als Empfänger, sonst den Namen", async () => {
    const ohneFirma = { ...gepflegt, company: null };
    const { restore } = mitKunden(ohneFirma);
    renderWithRouter(<InvoicesPage user={testUser} />);

    await waehleKunden(testCustomer.name);

    // Auf einer Rechnung steht die Firma — hat der Kunde keine, der Name
    expect(screen.getByLabelText("Firma / Name")).toHaveValue(testCustomer.name);

    restore();
  });

  it("setzt Österreich, wenn am Kunden kein Land steht", async () => {
    const { restore } = mitKunden({ ...gepflegt, country: null });
    renderWithRouter(<InvoicesPage user={testUser} />);

    await waehleKunden();

    expect(screen.getByDisplayValue("Österreich")).toBeInTheDocument();

    restore();
  });

  it("bietet die Übernahme erst an, wenn etwas abweicht", async () => {
    const { restore } = mitKunden();
    renderWithRouter(<InvoicesPage user={testUser} />);

    await waehleKunden();

    // Frisch übernommen stimmt alles überein — nichts zu übernehmen
    expect(screen.queryByRole("button", { name: /übernehmen/ })).not.toBeInTheDocument();

    const strasse = screen.getByDisplayValue("Josefsplatz 6");
    await userEvent.clear(strasse);
    await userEvent.type(strasse, "Josefsplatz 7");

    expect(
      await screen.findByRole("button", { name: /Abweichungen bei Acme übernehmen/ }),
    ).toBeInTheDocument();

    restore();
  });

  it("lässt das Getippte stehen, wenn die Auswahl gelöst wird", async () => {
    const { restore } = mitKunden();
    renderWithRouter(<InvoicesPage user={testUser} />);

    await waehleKunden();
    await userEvent.selectOptions(
      screen.getByLabelText("Kunde übernehmen"),
      screen.getByRole("option", { name: /ohne Kunden/ }),
    );

    // Die Auswahl zu lösen darf kein Formular leerräumen
    expect(screen.getByDisplayValue("Josefsplatz 6")).toBeInTheDocument();

    restore();
  });
});
