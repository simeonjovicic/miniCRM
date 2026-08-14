import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoicesPage from "./InvoicesPage";
import { renderWithRouter } from "../test/helpers";

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
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  it("zählt von der zuletzt vergebenen Nummer hoch", () => {
    localStorage.setItem(LS_KEY, "2026-007");
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-008")).toBeInTheDocument();
  });

  it("füllt die laufende Nummer auf drei Stellen auf", () => {
    localStorage.setItem(LS_KEY, "2026-099");
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-100")).toBeInTheDocument();
  });

  /** Zum Jahreswechsel faengt die Nummerierung wieder bei eins an. */
  it("startet im neuen Jahr wieder bei 001", () => {
    localStorage.setItem(LS_KEY, "2025-042");
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  it("verträgt eine unbrauchbare gespeicherte Nummer", () => {
    localStorage.setItem(LS_KEY, "kaputt");
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-001")).toBeInTheDocument();
  });

  // ── Positionen ──────────────────────────────────────────────────

  it("startet mit genau einer Position", () => {
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByText("Position 1")).toBeInTheDocument();
    expect(screen.queryByText("Position 2")).not.toBeInTheDocument();
  });

  it("nimmt weitere Positionen auf", async () => {
    renderWithRouter(<InvoicesPage />);

    await userEvent.click(screen.getByRole("button", { name: "+ Position" }));

    await waitFor(() => expect(screen.getByText("Position 2")).toBeInTheDocument());
  });

  // ── Datum ───────────────────────────────────────────────────────

  it("belegt das Rechnungsdatum mit heute vor", () => {
    renderWithRouter(<InvoicesPage />);

    expect(screen.getByDisplayValue("2026-08-14")).toBeInTheDocument();
  });
});
