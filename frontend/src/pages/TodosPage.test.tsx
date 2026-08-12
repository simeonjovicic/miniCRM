import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodosPage from "./TodosPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2, testCustomer } from "../test/fixtures";
import type { TodoItem, TodoComment } from "../types";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

const todo: TodoItem = {
  id: "t-1",
  title: "Angebot rausschicken",
  done: false,
  priority: "MEDIUM",
  dueDate: null,
  notes: null,
  commentCount: 0,
  createdBy: testUser.id,
  createdByUsername: testUser.username,
  createdAt: "2026-08-12T09:00:00Z",
};

const comment: TodoComment = {
  id: "c-1",
  todoId: "t-1",
  text: "hab die Zahlen geschickt",
  createdBy: testUser2.id,
  createdByUsername: testUser2.username,
  createdAt: "2026-08-12T10:20:00Z",
};

/** Reihenfolge zählt: mockFetch matcht per includes, Kommentare vor /todos. */
function mockTodos(overrides: Record<string, unknown> = {}) {
  return mockFetch({
    "/todos/t-1/comments": [],
    "/todos": [todo],
    "/customers": [testCustomer],
    ...overrides,
  });
}

describe("TodosPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  // ── Kundenverknüpfung per @ ─────────────────────────────────────

  it("zeigt die Kundenliste schon beim blossen @", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Neues Todo")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Neues Todo"), "@");

    // Frueher brauchte es mindestens einen Buchstaben nach dem @
    expect(await screen.findByRole("option", { name: /Acme Corp/ })).toBeInTheDocument();
  });

  it("setzt den Kundennamen ein und merkt sich die Verknüpfung", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Neues Todo")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Neues Todo"), "Angebot für @Acme");
    await userEvent.click(await screen.findByRole("option", { name: /Acme Corp/ }));

    expect(screen.getByLabelText("Neues Todo")).toHaveValue("Angebot für Acme Corp");
    expect(screen.getByText(`@${testCustomer.name}`)).toBeInTheDocument();
  });

  it("verlinkt den Kunden am gespeicherten Todo", async () => {
    ({ restore } = mockTodos({
      "/todos": [{ ...todo, customerId: testCustomer.id, customerName: testCustomer.name }],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    const link = await screen.findByRole("link", { name: `@${testCustomer.name}` });

    expect(link).toHaveAttribute("href", `/customers/${testCustomer.id}`);
  });

  // ── Kommentare ──────────────────────────────────────────────────

  it("zeigt den Kommentarzähler am Todo", async () => {
    ({ restore } = mockTodos({ "/todos": [{ ...todo, commentCount: 2 }] }));
    renderWithRouter(<TodosPage user={testUser} />);

    expect(await screen.findByRole("button", { name: "2 Kommentare" })).toBeInTheDocument();
  });

  it("blendet den Zähler ohne Kommentare aus", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Kommentare/ })).not.toBeInTheDocument();
  });

  it("lädt den Verlauf erst beim Aufklappen", async () => {
    const { mock, restore: r } = mockTodos({ "/todos/t-1/comments": [comment] });
    restore = r;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    const commentCalls = () =>
      mock.mock.calls.filter((c) => String(c[0]).includes("/comments")).length;
    expect(commentCalls()).toBe(0);

    await userEvent.click(screen.getByText("Angebot rausschicken"));

    expect(await screen.findByText("hab die Zahlen geschickt")).toBeInTheDocument();
    expect(screen.getByText(testUser2.username)).toBeInTheDocument();
    expect(commentCalls()).toBe(1);
  });

  it("schickt einen neuen Kommentar mit Verfasser", async () => {
    const base = mockTodos();
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const posts: unknown[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).includes("/comments")) {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Promise.resolve(
          new Response(JSON.stringify({ ...comment, ...body, id: "c-2" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    await userEvent.type(await screen.findByLabelText("Kommentar schreiben"), "geht heute raus");
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      text: "geht heute raus",
      createdBy: testUser.id,
      createdByUsername: testUser.username,
    });
    expect(await screen.findByText("geht heute raus")).toBeInTheDocument();
  });

  it("sendet keinen leeren Kommentar", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    expect(await screen.findByRole("button", { name: "Senden" })).toBeDisabled();
  });

  it("bietet das Löschen nur bei eigenen Kommentaren an", async () => {
    ({ restore } = mockTodos({
      "/todos/t-1/comments": [
        comment,
        { ...comment, id: "c-3", text: "passt", createdBy: testUser.id, createdByUsername: testUser.username },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    await screen.findByText("passt");
    // Nur der eigene Kommentar hat einen Löschen-Knopf
    expect(screen.getAllByRole("button", { name: "Kommentar löschen" })).toHaveLength(1);
  });

  // ── Update-Semantik ─────────────────────────────────────────────

  /**
   * Der Server ersetzt das Todo vollständig. Wird beim Ändern der Priorität nur
   * dieses Feld gesendet, verliert das Todo Fälligkeit, Notizen und Kunde.
   */
  it("schickt beim Ändern der Priorität das vollständige Todo", async () => {
    const vollstaendig: TodoItem = {
      ...todo,
      dueDate: "2026-08-20",
      notes: "Zahlen abwarten",
      customerId: testCustomer.id,
      customerName: testCustomer.name,
    };
    const base = mockTodos({ "/todos": [vollstaendig] });
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const puts: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        puts.push(body);
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    const detail = await screen.findByDisplayValue("Angebot rausschicken");
    await userEvent.selectOptions(
      within(detail.closest("div")!.parentElement!).getByRole("combobox"),
      "HIGH",
    );

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      priority: "HIGH",
      dueDate: "2026-08-20",
      notes: "Zahlen abwarten",
      customerId: testCustomer.id,
    });
  });
});
