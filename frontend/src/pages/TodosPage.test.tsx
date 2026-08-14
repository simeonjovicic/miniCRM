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
    "/users": [testUser, testUser2],
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

    const wortmeldung = (await screen.findByText("hab die Zahlen geschickt")).closest("li")!;
    // Auf den Kommentar eingegrenzt — "bob" steht jetzt auch als Filter-Chip da
    expect(within(wortmeldung).getByText(testUser2.username)).toBeInTheDocument();
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

  // ── Zuständigkeit ───────────────────────────────────────────────

  it("zeigt am Todo, wer zuständig ist", async () => {
    ({ restore } = mockTodos({
      "/todos": [{ ...todo, assigneeId: testUser2.id, assigneeUsername: testUser2.username }],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    expect(await screen.findByText(`→ ${testUser2.username}`)).toBeInTheDocument();
  });

  it("zeigt kein Abzeichen ohne Zuständigen", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await screen.findByText("Angebot rausschicken");
    expect(screen.queryByText(/^→/)).not.toBeInTheDocument();
  });

  it("filtert nach Zuständigkeit statt nach Ersteller", async () => {
    const meins: TodoItem = {
      ...todo,
      id: "t-mein",
      title: "Mein Ball",
      assigneeId: testUser.id,
      assigneeUsername: testUser.username,
    };
    const seins: TodoItem = {
      ...todo,
      id: "t-sein",
      title: "Bobs Ball",
      assigneeId: testUser2.id,
      assigneeUsername: testUser2.username,
    };
    const offen: TodoItem = { ...todo, id: "t-offen", title: "Niemandem zugewiesen" };

    ({ restore } = mockTodos({ "/todos": [meins, seins, offen] }));
    renderWithRouter(<TodosPage user={testUser} />);

    const filter = within(await screen.findByRole("group", { name: "Nach Zuständigkeit filtern" }));

    await userEvent.click(filter.getByRole("button", { name: "Meine" }));
    expect(screen.getByText("Mein Ball")).toBeInTheDocument();
    expect(screen.queryByText("Bobs Ball")).not.toBeInTheDocument();

    await userEvent.click(filter.getByRole("button", { name: testUser2.username }));
    expect(screen.getByText("Bobs Ball")).toBeInTheDocument();
    expect(screen.queryByText("Mein Ball")).not.toBeInTheDocument();

    // "Offen" sind die, ueber die noch niemand entschieden hat
    await userEvent.click(filter.getByRole("button", { name: "Offen" }));
    expect(screen.getByText("Niemandem zugewiesen")).toBeInTheDocument();
    expect(screen.queryByText("Bobs Ball")).not.toBeInTheDocument();

    await userEvent.click(filter.getByRole("button", { name: "Alle" }));
    expect(screen.getByText("Mein Ball")).toBeInTheDocument();
    expect(screen.getByText("Bobs Ball")).toBeInTheDocument();
    expect(screen.getByText("Niemandem zugewiesen")).toBeInTheDocument();
  });

  it("lässt die Zuständigkeit im Detail setzen", async () => {
    const base = mockTodos();
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
    await userEvent.selectOptions(await screen.findByLabelText("Zuständig"), testUser2.id);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      assigneeId: testUser2.id,
      assigneeUsername: testUser2.username,
    });
  });

  it("lässt die Zuständigkeit wieder entfernen", async () => {
    const base = mockTodos({
      "/todos": [{ ...todo, assigneeId: testUser2.id, assigneeUsername: testUser2.username }],
    });
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const puts: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          new Response(String(init.body), {
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
    await userEvent.selectOptions(await screen.findByLabelText("Zuständig"), "");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].assigneeId).toBeUndefined();
  });

  // ── Wiederkehrende Todos ────────────────────────────────────────

  it("kennzeichnet wiederkehrende Todos in der Liste", async () => {
    ({ restore } = mockTodos({
      "/todos": [{ ...todo, recurrence: "MONTHLY" as const, dueDate: "2026-08-15" }],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    expect(await screen.findByText("↻ monatlich")).toBeInTheDocument();
  });

  it("zeigt kein Abzeichen bei einmaligen Todos", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await screen.findByText("Angebot rausschicken");
    expect(screen.queryByText(/↻/)).not.toBeInTheDocument();
  });

  it("lässt die Wiederholung im Detail einstellen", async () => {
    const base = mockTodos({ "/todos": [{ ...todo, dueDate: "2026-08-15" }] });
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
    await userEvent.selectOptions(await screen.findByLabelText("Wiederholung"), "MONTHLY");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ recurrence: "MONTHLY", dueDate: "2026-08-15" });
  });

  /** Ohne Frist gibt es keinen naechsten Termin — das muss dranstehen. */
  it("weist darauf hin, dass eine Wiederholung ein Datum braucht", async () => {
    ({ restore } = mockTodos({ "/todos": [{ ...todo, dueDate: null }] }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));
    await userEvent.selectOptions(await screen.findByLabelText("Wiederholung"), "MONTHLY");

    expect(await screen.findByText(/Braucht ein Fälligkeitsdatum/)).toBeInTheDocument();
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

    await screen.findByDisplayValue("Angebot rausschicken");
    await userEvent.selectOptions(screen.getByLabelText("Priorität"), "HIGH");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      priority: "HIGH",
      dueDate: "2026-08-20",
      notes: "Zahlen abwarten",
      customerId: testCustomer.id,
    });
  });
});
