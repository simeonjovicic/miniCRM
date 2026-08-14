import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { mockFetch } from "./test/helpers";
import { testUser } from "./test/fixtures";

vi.mock("./services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

/**
 * Der Einstieg: besteht eine Sitzung, geht es direkt in die Anwendung —
 * ohne dass etwas im localStorage liegt. Genau das lässt die Anmeldung ein
 * Neuladen überstehen.
 */
describe("App — Sitzung", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("stellt eine bestehende Sitzung wieder her", async () => {
    ({ restore } = mockFetch({
      "/auth/me": testUser,
      "/dashboard/stats": {
        year: 2026,
        openTodos: [],
        openTodoCount: 0,
        onlineUsers: [],
        openInvoices: [],
        openInvoiceCount: 0,
        openInvoiceTotal: 0,
        perUser: [],
      },
    }));

    render(<App />);

    // Landet direkt im Dashboard, nicht auf dem Anmeldebildschirm
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Wer bist du?")).not.toBeInTheDocument();
    expect(screen.getAllByText(testUser.username).length).toBeGreaterThan(0);
  });

  it("zeigt die Anmeldung, wenn keine Sitzung besteht", async () => {
    // /auth/me nicht gemockt -> 404 -> me() liefert null
    ({ restore } = mockFetch({ "/auth/users": [{ username: "admin", hasPassword: true }] }));

    render(<App />);

    expect(await screen.findByText("Wer bist du?")).toBeInTheDocument();
  });

  /** Sonst blitzt beim Neuladen kurz die Anmeldung auf, obwohl man angemeldet ist. */
  it("zeigt weder Anwendung noch Anmeldung, solange die Prüfung läuft", async () => {
    let resolveMe: (value: Response) => void = () => {};
    const original = globalThis.fetch;
    restore = () => {
      globalThis.fetch = original;
    };
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/auth/me")) {
        return new Promise<Response>((resolve) => {
          resolveMe = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as unknown as typeof fetch;

    render(<App />);

    expect(screen.getByText("Lade...")).toBeInTheDocument();
    expect(screen.queryByText("Wer bist du?")).not.toBeInTheDocument();

    resolveMe(new Response(null, { status: 401 }));
    await waitFor(() => expect(screen.queryByText("Lade...")).not.toBeInTheDocument());
  });

  it("meldet serverseitig ab", async () => {
    const base = mockFetch({
      "/auth/me": testUser,
      "/auth/users": [{ username: "admin", hasPassword: true }],
      "/dashboard/stats": {
        year: 2026,
        openTodos: [],
        openTodoCount: 0,
        onlineUsers: [],
        openInvoices: [],
        openInvoiceCount: 0,
        openInvoiceTotal: 0,
        perUser: [],
      },
    });
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const logouts: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).includes("/auth/logout")) {
        logouts.push(String(input));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));

    // Die Sitzung wird auf dem Server beendet, nicht nur im Browser vergessen
    await waitFor(() => expect(logouts).toHaveLength(1));
    expect(await screen.findByText("Wer bist du?")).toBeInTheDocument();
  });
});
