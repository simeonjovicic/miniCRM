import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser } from "../test/fixtures";

/** Reihenfolge zählt: mockFetch matcht per includes. */
function mockAuth(candidates: { username: string; hasPassword: boolean }[]) {
  return mockFetch({ "/auth/users": candidates });
}

/** Fängt POSTs ab und liefert eine Antwort, ohne die GETs zu stören. */
function interceptPost(
  base: { restore: () => void },
  handler: (url: string, body: Record<string, string>) => Response,
) {
  const passthrough = globalThis.fetch;
  const calls: { url: string; body: Record<string, string> }[] = [];

  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const url = String(input);
      calls.push({ url, body });
      return Promise.resolve(handler(url, body));
    }
    return passthrough(input, init);
  }) as unknown as typeof fetch;

  return { calls, restore: base.restore };
}

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LoginPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  // ── Anmelden ────────────────────────────────────────────────────

  it("zeigt die Benutzer zur Auswahl", async () => {
    ({ restore } = mockAuth([
      { username: "admin", hasPassword: true },
      { username: "bob", hasPassword: true },
    ]));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    expect(await screen.findByText("admin")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("fragt nach dem Passwort und meldet an", async () => {
    const onLogin = vi.fn();
    const intercepted = interceptPost(mockAuth([{ username: "admin", hasPassword: true }]), () =>
      ok(testUser),
    );
    restore = intercepted.restore;

    renderWithRouter(<LoginPage onLogin={onLogin} />);
    await userEvent.click(await screen.findByText("admin"));
    await userEvent.type(screen.getByLabelText("Passwort"), "geheim-genug");
    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(testUser));
    expect(intercepted.calls[0].url).toContain("/auth/login");
    expect(intercepted.calls[0].body).toEqual({
      username: "admin",
      password: "geheim-genug",
    });
  });

  it("zeigt die Meldung des Servers bei falschem Passwort", async () => {
    const intercepted = interceptPost(mockAuth([{ username: "admin", hasPassword: true }]), () =>
      ok({ error: "Benutzername oder Passwort stimmt nicht." }, 401),
    );
    restore = intercepted.restore;

    renderWithRouter(<LoginPage onLogin={vi.fn()} />);
    await userEvent.click(await screen.findByText("admin"));
    await userEvent.type(screen.getByLabelText("Passwort"), "daneben");
    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText("Benutzername oder Passwort stimmt nicht.")).toBeInTheDocument();
  });

  // ── Erstes Passwort ─────────────────────────────────────────────

  it("kennzeichnet Benutzer ohne Passwort", async () => {
    ({ restore } = mockAuth([
      { username: "admin", hasPassword: true },
      { username: "bob", hasPassword: false },
    ]));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    expect(await screen.findByText("Passwort fehlt")).toBeInTheDocument();
  });

  it("lässt beim ersten Mal ein Passwort festlegen", async () => {
    const onLogin = vi.fn();
    const intercepted = interceptPost(mockAuth([{ username: "bob", hasPassword: false }]), () =>
      ok(testUser),
    );
    restore = intercepted.restore;

    renderWithRouter(<LoginPage onLogin={onLogin} />);
    await userEvent.click(await screen.findByText("bob"));

    expect(screen.getByText(/noch kein Passwort gesetzt/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Neues Passwort"), "geheim-genug");
    await userEvent.type(screen.getByLabelText("Noch einmal"), "geheim-genug");
    await userEvent.click(screen.getByRole("button", { name: "Festlegen und anmelden" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(intercepted.calls[0].url).toContain("/auth/set-password");
  });

  it("merkt, wenn die beiden Passwörter nicht übereinstimmen", async () => {
    const intercepted = interceptPost(mockAuth([{ username: "bob", hasPassword: false }]), () =>
      ok(testUser),
    );
    restore = intercepted.restore;

    renderWithRouter(<LoginPage onLogin={vi.fn()} />);
    await userEvent.click(await screen.findByText("bob"));
    await userEvent.type(screen.getByLabelText("Neues Passwort"), "geheim-genug");
    await userEvent.type(screen.getByLabelText("Noch einmal"), "was-anderes");
    await userEvent.click(screen.getByRole("button", { name: "Festlegen und anmelden" }));

    expect(await screen.findByText(/stimmen nicht überein/)).toBeInTheDocument();
    expect(intercepted.calls).toHaveLength(0);
  });

  // ── Frische Installation ────────────────────────────────────────

  /** Ohne diesen Weg waere eine frische Installation nicht benutzbar. */
  it("legt den allerersten Benutzer an, wenn es keinen gibt", async () => {
    const onLogin = vi.fn();
    const intercepted = interceptPost(mockAuth([]), () => ok(testUser));
    restore = intercepted.restore;

    renderWithRouter(<LoginPage onLogin={onLogin} />);

    expect(await screen.findByText(/Noch kein Benutzer vorhanden/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Benutzername"), "simeon");
    await userEvent.type(screen.getByLabelText("E-Mail"), "simeon@example.com");
    await userEvent.type(screen.getByLabelText("Passwort"), "geheim-genug");
    await userEvent.type(screen.getByLabelText("Passwort wiederholen"), "geheim-genug");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen und anmelden" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(intercepted.calls[0].url).toContain("/auth/bootstrap");
    expect(intercepted.calls[0].body).toMatchObject({ username: "simeon" });
  });

  /** Vorher konnte sich hier jeder selbst einen Zugang anlegen. */
  it("bietet kein Anlegen an, solange es Benutzer gibt", async () => {
    ({ restore } = mockAuth([{ username: "admin", hasPassword: true }]));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    await screen.findByText("admin");
    expect(screen.queryByText(/Anlegen und anmelden/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("E-Mail")).not.toBeInTheDocument();
  });

  it("meldet ein nicht erreichbares Backend", async () => {
    ({ restore } = mockFetch({}));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    expect(await screen.findByText("Backend nicht erreichbar")).toBeInTheDocument();
  });
});
