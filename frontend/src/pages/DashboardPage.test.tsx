import { screen, waitFor, within } from "@testing-library/react";
import DashboardPage from "./DashboardPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2 } from "../test/fixtures";
import type { DashboardStats } from "../services/api";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

const NOW = new Date("2026-08-12T11:00:00");

function isoDate(daysFromNow: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const stats: DashboardStats = {
  year: 2026,
  openTodos: [
    {
      id: "t-1",
      title: "Angebot rausschicken",
      priority: "HIGH",
      dueDate: isoDate(-2),
      customerId: "c-1",
      customerName: "Acme Corp",
      createdByUsername: testUser.username,
    },
    {
      id: "t-2",
      title: "Rückruf Meier",
      priority: "MEDIUM",
      dueDate: isoDate(1),
      customerId: null,
      customerName: null,
      createdByUsername: testUser2.username,
    },
  ],
  openTodoCount: 11,
  onlineUsers: [
    { userId: testUser.id, username: testUser.username, online: false, lastSeenAt: null },
    {
      userId: testUser2.id,
      username: testUser2.username,
      online: false,
      lastSeenAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    },
  ],
  openInvoices: [
    {
      id: "f-1",
      description: "Projekt Website",
      date: "2026-07-01",
      username: testUser.username,
      customerName: "Acme Corp",
      gross: 3000,
      paid: 1000,
      open: 2000,
    },
  ],
  openInvoiceCount: 1,
  openInvoiceTotal: 2000,
  perUser: [
    {
      userId: testUser.id,
      username: testUser.username,
      profit: 1500,
      revenueGross: 4000,
      openReceivables: 2000,
    },
    {
      userId: testUser2.id,
      username: testUser2.username,
      profit: -200,
      revenueGross: 0,
      openReceivables: 0,
    },
  ],
};

function mockDashboard(overrides: Partial<DashboardStats> = {}) {
  return mockFetch({ "/dashboard/stats": { ...stats, ...overrides } });
}

describe("DashboardPage", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    restore?.();
  });

  // ── Gewinn je Person ────────────────────────────────────────────

  it("zeigt den Gewinn jeder Person einzeln", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    await waitFor(() => expect(screen.getByText(/1\.500,00/)).toBeInTheDocument());
    expect(screen.getByText(/Gewinn im Jahr 2026/)).toBeInTheDocument();
    // Auch ein Minus wird gezeigt, nicht verschluckt
    expect(screen.getByText(/-200,00/)).toBeInTheDocument();
  });

  it("meldet fehlende Finanzdaten statt einer leeren Fläche", async () => {
    ({ restore } = mockDashboard({ perUser: [] }));
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText(/Noch keine Finanzeinträge in 2026/)).toBeInTheDocument();
  });

  // ── Offene Todos ────────────────────────────────────────────────

  it("listet die offenen Todos mit Kunde und Verfasser", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("Angebot rausschicken")).toBeInTheDocument();
    expect(screen.getByText("@Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("11 offen")).toBeInTheDocument();
  });

  it("hebt überfällige und morgige Fristen hervor", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("überfällig")).toBeInTheDocument();
    expect(screen.getByText("morgen")).toBeInTheDocument();
  });

  it("weist auf die nicht gezeigten Todos hin", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    // 11 offen, 2 gezeigt
    expect(await screen.findByText(/und 9 weitere/)).toBeInTheDocument();
  });

  it("meldet einen leeren Todo-Stand", async () => {
    ({ restore } = mockDashboard({ openTodos: [], openTodoCount: 0 }));
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText(/alles erledigt/)).toBeInTheDocument();
  });

  // ── Mitglieder ──────────────────────────────────────────────────

  /**
   * Nach einem Reload kann der REST-Stand vor der WebSocket-Verbindung da sein.
   * Sich selbst dann als offline zu zeigen, wäre offensichtlich falsch.
   */
  it("zeigt einen selbst immer als online", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    await screen.findByText(/Angebot rausschicken/);
    const mitglieder = screen.getByText("Mitglieder").closest("div")!.parentElement!;

    expect(within(mitglieder).getByText("(du)")).toBeInTheDocument();
    expect(within(mitglieder).getByText("1 online")).toBeInTheDocument();
  });

  it("zeigt bei Abwesenden, wann sie zuletzt da waren", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("vor 5 Min")).toBeInTheDocument();
  });

  it("kennzeichnet nie verbundene Mitglieder", async () => {
    ({ restore } = mockDashboard({
      onlineUsers: [
        { userId: "fremd", username: "carla", online: false, lastSeenAt: null },
      ],
    }));
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("noch nie online")).toBeInTheDocument();
  });

  // ── Unbezahlte Rechnungen ───────────────────────────────────────

  it("zeigt unbezahlte Rechnungen mit Restbetrag und Standzeit", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("Projekt Website")).toBeInTheDocument();
    // 3000 minus 1000 Anzahlung
    expect(screen.getAllByText(/2\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\.000,00 € angezahlt/)).toBeInTheDocument();
    expect(screen.getByText(/seit 42 Tagen/)).toBeInTheDocument();
  });

  it("meldet, wenn nichts offen ist", async () => {
    ({ restore } = mockDashboard({
      openInvoices: [],
      openInvoiceCount: 0,
      openInvoiceTotal: 0,
    }));
    renderWithRouter(<DashboardPage user={testUser} />);

    expect(await screen.findByText("Alles bezahlt.")).toBeInTheDocument();
  });

  it("verlinkt von den Rechnungen in die Finanzen", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    const link = await screen.findByRole("link", { name: /2\.000,00/ });
    expect(link).toHaveAttribute("href", "/finance");
  });

  it("macht die ganze Unbezahlt-Karte zum Link in die Finanzen", async () => {
    ({ restore } = mockDashboard());
    renderWithRouter(<DashboardPage user={testUser} />);

    const link = await screen.findByRole("link", { name: /Unbezahlt/ });
    expect(link).toHaveAttribute("href", "/finance");

    // Nicht nur die Überschrift: Betrag und Rechnungszeilen liegen mit im Link
    const card = within(link);
    expect(card.getByRole("heading", { name: "Unbezahlt" })).toBeInTheDocument();
    expect(card.getByText("Projekt Website")).toBeInTheDocument();
    expect(card.getByText(/seit 42 Tagen/)).toBeInTheDocument();

    // Verschachtelte Links wären ungültiges HTML — es darf genau dieser eine sein
    expect(link.querySelectorAll("a")).toHaveLength(0);
  });

  it("bleibt anklickbar, wenn nichts offen ist", async () => {
    ({ restore } = mockDashboard({
      openInvoices: [],
      openInvoiceCount: 0,
      openInvoiceTotal: 0,
    }));
    renderWithRouter(<DashboardPage user={testUser} />);

    const link = await screen.findByRole("link", { name: /Unbezahlt/ });
    expect(link).toHaveAttribute("href", "/finance");
  });
});
