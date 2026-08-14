import { screen, waitFor, within } from "@testing-library/react";
import AnalyticsPage from "./AnalyticsPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser } from "../test/fixtures";
import type { Customer } from "../types";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

const NOW = new Date("2026-08-14T12:00:00");

function customer(status: Customer["status"], createdAt = NOW.toISOString()): Customer {
  return {
    id: crypto.randomUUID(),
    name: "Kunde",
    email: null,
    company: null,
    phone: null,
    address: null,
    status,
    createdBy: testUser.id,
    createdAt,
  };
}

/** Findet den Wert einer KPI-Kachel über ihre Beschriftung. */
function kpi(label: string) {
  return within(screen.getByText(label).closest("div")!);
}

describe("AnalyticsPage", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    restore?.();
  });

  // ── Kennzahlen ──────────────────────────────────────────────────

  it("zählt die Kunden gesamt", async () => {
    ({ restore } = mockFetch({
      "/customers": [customer("LEAD"), customer("CUSTOMER"), customer("CHURNED")],
    }));
    renderWithRouter(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Gesamt")).toBeInTheDocument());
    expect(kpi("Gesamt").getByText("3")).toBeInTheDocument();
  });

  /** Conversion = wer es aus dem Lead-Stadium heraus geschafft hat, auch wenn er später ging. */
  it("rechnet die Conversion-Rate über Kunden und Abgesprungene", async () => {
    ({ restore } = mockFetch({
      "/customers": [
        customer("LEAD"),
        customer("LEAD"),
        customer("CUSTOMER"),
        customer("CHURNED"),
      ],
    }));
    renderWithRouter(<AnalyticsPage />);

    // 2 von 4 sind über das Lead-Stadium hinaus
    await waitFor(() => expect(kpi("Conversion-Rate").getByText("50.0%")).toBeInTheDocument());
  });

  /** Churn misst nur unter denen, die je Kunde waren — nicht unter allen Leads. */
  it("rechnet die Churn-Rate nur unter gewonnenen Kunden", async () => {
    ({ restore } = mockFetch({
      "/customers": [
        customer("LEAD"),
        customer("LEAD"),
        customer("LEAD"),
        customer("CUSTOMER"),
        customer("CHURNED"),
      ],
    }));
    renderWithRouter(<AnalyticsPage />);

    // 1 von 2 ehemaligen Kunden ist abgesprungen — die drei Leads zählen nicht mit
    await waitFor(() => expect(kpi("Churn-Rate").getByText("50.0%")).toBeInTheDocument());
    expect(kpi("Retention").getByText("50.0%")).toBeInTheDocument();
  });

  it("kommt ohne Kunden ohne Division durch null aus", async () => {
    ({ restore } = mockFetch({ "/customers": [] }));
    renderWithRouter(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Gesamt")).toBeInTheDocument());
    expect(kpi("Gesamt").getByText("0")).toBeInTheDocument();
    expect(kpi("Conversion-Rate").getByText("0%")).toBeInTheDocument();
    expect(kpi("Churn-Rate").getByText("0%")).toBeInTheDocument();
  });

  /** Ohne je gewonnenen Kunden ist die Churn-Rate 0, nicht NaN. */
  it("meldet keine Churn-Rate, solange es nur Leads gibt", async () => {
    ({ restore } = mockFetch({ "/customers": [customer("LEAD"), customer("PROSPECT")] }));
    renderWithRouter(<AnalyticsPage />);

    await waitFor(() => expect(kpi("Churn-Rate").getByText("0%")).toBeInTheDocument());
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  // ── Verlauf ─────────────────────────────────────────────────────

  it("zeigt die letzten sechs Monate", async () => {
    ({ restore } = mockFetch({ "/customers": [customer("CUSTOMER")] }));
    renderWithRouter(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Gesamt")).toBeInTheDocument());

    // März bis August 2026
    // "März" wird ohne Punkt abgekuerzt, "Aug." mit
    for (const monat of ["März 26", "Aug. 26"]) {
      expect(screen.getByText(monat)).toBeInTheDocument();
    }
  });

  it("ordnet Kunden dem Monat ihrer Anlage zu", async () => {
    ({ restore } = mockFetch({
      "/customers": [
        customer("CUSTOMER", "2026-08-01T10:00:00Z"),
        customer("CUSTOMER", "2026-08-20T10:00:00Z"),
        customer("LEAD", "2026-06-05T10:00:00Z"),
      ],
    }));
    renderWithRouter(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Gesamt")).toBeInTheDocument());

    const august = screen.getByText("Aug. 26").closest("div")!;
    expect(within(august.parentElement!).getByText("2")).toBeInTheDocument();
  });

  // ── Fehler ──────────────────────────────────────────────────────

  it("meldet einen Ladefehler statt leer dazustehen", async () => {
    ({ restore } = mockFetch({}));
    renderWithRouter(<AnalyticsPage />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
