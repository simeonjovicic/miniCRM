import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodosPage from "./TodosPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2, testCustomer } from "../test/fixtures";
import type { TodoItem, TodoComment } from "../types";

/** Merkt sich die Handler, damit Tests eine Aenderung von aussen ausloesen koennen. */
const websocketHandlers: Record<string, Array<() => void>> = {};

vi.mock("../services/websocket", () => ({
  subscribe: (topic: string, fn: () => void) => {
    (websocketHandlers[topic] ??= []).push(fn);
    return () => {
      websocketHandlers[topic] = (websocketHandlers[topic] ?? []).filter((f) => f !== fn);
    };
  },
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
  dueDate: null,
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
    // Muss vor "/todos" stehen und braucht eine Antwort: schlaegt das
    // Umsortieren fehl, holt die Seite den Serverstand und die Liste springt
    // zurueck — der Test saehe dann aus, als haette das Umsortieren nicht gewirkt.
    "PUT /todos/order": { reordered: 0 },
    "/todos": [todo],
    "/customers": [testCustomer],
    "/users": [testUser, testUser2],
    ...overrides,
  });
}

describe("TodosPage", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
    // Die Vorgabe fuer die Zustaendigkeit ueberlebt absichtlich das Neuladen —
    // zwischen zwei Tests darf sie das aber nicht.
    localStorage.clear();
  });

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

  // ── Wartet auf Kunden ───────────────────────────────────────────

  /** Ein eigener Abschnitt, damit die obere Liste beantwortet, was dran ist. */
  it("setzt Wartendes in einen eigenen Abschnitt ab", async () => {
    ({ restore } = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Kann ich machen" },
        { ...todo, id: "t-2", title: "Wartet auf Acme", waiting: true },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Kann ich machen")).toBeInTheDocument());

    const offen = within(screen.getByRole("list", { name: "Offene Todos" }));
    const wartend = within(screen.getByRole("list", { name: "Wartet auf Kunden" }));

    expect(offen.getByText("Kann ich machen")).toBeInTheDocument();
    expect(offen.queryByText("Wartet auf Acme")).not.toBeInTheDocument();
    expect(wartend.getByText("Wartet auf Acme")).toBeInTheDocument();
  });

  it("nennt die Zahl der wartenden in der Überschrift", async () => {
    ({ restore } = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "A", waiting: true },
        { ...todo, id: "t-2", title: "B", waiting: true },
        { ...todo, id: "t-3", title: "C" },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    expect(await screen.findByText("Wartet auf Kunden (2)")).toBeInTheDocument();
  });

  it("zeigt den Abschnitt nicht, solange nichts wartet", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    expect(screen.queryByRole("list", { name: "Wartet auf Kunden" })).not.toBeInTheDocument();
  });

  /** Zurueckholen muss genauso einen Klick kosten wie das Parken. */
  it("holt Wartendes per Klick wieder zurück", async () => {
    const m = mockTodos({ "/todos": [{ ...todo, waiting: true }] });
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /wieder aufnehmen/ }));

    await waitFor(() => {
      const put = m.mock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(put![1]!.body as string)).toMatchObject({ waiting: false });
    });
  });

  /** Erledigtes wartet nicht — der Schalter waere dort sinnlos. */
  it("bietet den Warte-Schalter bei Erledigtem nicht an", async () => {
    ({ restore } = mockTodos({ "/todos": [{ ...todo, done: true }] }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Erledigt (1)")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /warten lassen/ })).not.toBeInTheDocument();
  });

  // ── Reihenfolge ─────────────────────────────────────────────────

  it("zeigt die Todos in der Reihenfolge, die der Server liefert", async () => {
    ({ restore } = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Zuerst" },
        { ...todo, id: "t-2", title: "Dann" },
        { ...todo, id: "t-3", title: "Zuletzt" },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Zuerst")).toBeInTheDocument());
    const zeilen = within(screen.getByRole("list", { name: "Offene Todos" })).getAllByRole("listitem");
    expect(zeilen.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Zuerst"),
      expect.stringContaining("Dann"),
      expect.stringContaining("Zuletzt"),
    ]);
  });

  /**
   * Ziehen geht per Maus, in jsdom aber nicht — die Pfeile sind ohnehin der Weg
   * per Tastatur und am Handy, und hier der pruefbare.
   */
  it("schickt die neue Reihenfolge, wenn man eine Zeile hochschiebt", async () => {
    const m = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Zuerst" },
        { ...todo, id: "t-2", title: "Dann" },
        { ...todo, id: "t-3", title: "Zuletzt" },
      ],
    });
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Zuletzt")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: '"Zuletzt" nach oben' }));

    await waitFor(() => {
      const call = m.mock.mock.calls.find(([url]) => String(url).includes("/todos/order"));
      expect(JSON.parse(call![1]!.body as string)).toEqual({ ids: ["t-1", "t-3", "t-2"] });
    });
  });

  it("schiebt eine Zeile auch wieder nach unten", async () => {
    const m = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Zuerst" },
        { ...todo, id: "t-2", title: "Dann" },
      ],
    });
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Zuerst")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: '"Zuerst" nach unten' }));

    await waitFor(() => {
      const call = m.mock.mock.calls.find(([url]) => String(url).includes("/todos/order"));
      expect(JSON.parse(call![1]!.body as string)).toEqual({ ids: ["t-2", "t-1"] });
    });
  });

  /** Die Liste soll sofort umspringen und nicht erst nach der Antwort. */
  it("ordnet die Liste sofort um, ohne auf den Server zu warten", async () => {
    ({ restore } = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Zuerst" },
        { ...todo, id: "t-2", title: "Dann" },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Zuerst")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: '"Dann" nach oben' }));

    await waitFor(() => {
      const zeilen = within(screen.getByRole("list", { name: "Offene Todos" })).getAllByRole("listitem");
      expect(zeilen[0]!.textContent).toContain("Dann");
    });
  });

  it("sperrt die Pfeile an den Enden der Liste", async () => {
    ({ restore } = mockTodos({
      "/todos": [
        { ...todo, id: "t-1", title: "Zuerst" },
        { ...todo, id: "t-2", title: "Zuletzt" },
      ],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Zuerst")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: '"Zuerst" nach oben' })).toBeDisabled();
    expect(screen.getByRole("button", { name: '"Zuletzt" nach unten' })).toBeDisabled();
  });

  /** Wartendes ist geparkt — dort zu sortieren waere ohne Aussage. */
  it("bietet im Warte-Abschnitt keine Sortierpfeile an", async () => {
    ({ restore } = mockTodos({
      "/todos": [{ ...todo, id: "t-1", title: "Wartet auf Acme", waiting: true }],
    }));
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Wartet auf Acme")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /nach oben/ })).not.toBeInTheDocument();
  });

  // ── Fehlgeschlagene Änderungen ──────────────────────────────────

  /**
   * Vorher lief ein fehlgeschlagener Aufruf als unbehandelte Rejection ins
   * Leere: in der Oberfläche passierte nichts, und man hielt das Todo für
   * gespeichert. Jetzt wird der Serverstand nachgeladen, damit die Liste nicht
   * etwas zeigt, das nirgends steht.
   */
  it("holt den Serverstand, wenn eine Änderung nicht durchkommt", async () => {
    const base = mockTodos();
    const passthrough = globalThis.fetch;
    restore = base.restore;

    let gets = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT" && url.includes("/todos/t-1")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Serverfehler" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }));
      }
      if (!init?.method && url.includes("/todos") && !url.includes("comments")) gets++;
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<TodosPage user={testUser} />);
    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    const vorher = gets;

    await userEvent.click(screen.getByRole("button", { name: /warten lassen/ }));

    await waitFor(() => expect(gets).toBeGreaterThan(vorher));
  });

  /** Die Zeile darf nicht als "wartet" erscheinen, wenn das Speichern scheiterte. */
  it("stellt bei einem Fehlschlag nicht auf wartet um", async () => {
    const base = mockTodos();
    const passthrough = globalThis.fetch;
    restore = base.restore;

    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<TodosPage user={testUser} />);
    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /warten lassen/ }));

    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Wartet auf Kunden" })).not.toBeInTheDocument(),
    );
  });

  // ── Update-Semantik ─────────────────────────────────────────────

  /**
   * Der Server ersetzt das Todo vollständig. Wird beim Umstellen des Zustands
   * nur dieses Feld gesendet, verliert das Todo Fälligkeit, Notizen und Kunde.
   */
  it("schickt beim Umstellen auf 'wartet' das vollständige Todo", async () => {
    const vollstaendig: TodoItem = {
      ...todo,
      dueDate: "2026-08-20",
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
    await userEvent.click(screen.getByRole("button", { name: /auf den Kunden warten lassen/ }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      waiting: true,
      dueDate: "2026-08-20",
      customerId: testCustomer.id,
    });
  });

  // ── Notizen abgeloest, Kommentare live ──────────────────────────

  /** Kommentare leisten dasselbe, nur mit Verfasser und Zeitpunkt. */
  it("bietet kein Notizfeld mehr an", async () => {
    ({ restore } = mockTodos());
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    await screen.findByDisplayValue("Angebot rausschicken");
    expect(screen.queryByText("Notizen")).not.toBeInTheDocument();
  });

  /**
   * Vorher sah man die Antwort des anderen erst nach dem Zu- und
   * Wiederaufklappen — genau das Warten, das der Chat nicht hatte.
   */
  it("zieht Kommentare nach, wenn der andere schreibt", async () => {
    const m = mockTodos({ "/todos/t-1/comments": [comment] });
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Angebot rausschicken")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Angebot rausschicken"));

    await screen.findByText("hab die Zahlen geschickt");
    const vorher = m.mock.mock.calls.filter(([u]) => String(u).includes("/comments")).length;

    // So meldet der Server eine Aenderung von aussen
    websocketHandlers["/topic/todos"]?.forEach((fn) => fn());

    await waitFor(() => {
      const nachher = m.mock.mock.calls.filter(([u]) => String(u).includes("/comments")).length;
      expect(nachher).toBeGreaterThan(vorher);
    });
  });

  // ── Vorgabe fuer Zustaendigkeit ─────────────────────────────────

  it("weist neue Todos der eingestellten Person zu", async () => {
    const m = mockTodos();
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Neues Todo")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Neue Todos zuweisen an"), testUser2.id);
    await userEvent.type(screen.getByLabelText("Neues Todo"), "Frisch aufgeschrieben{Enter}");

    await waitFor(() => {
      const post = m.mock.mock.calls.find(([, init]) => init?.method === "POST");
      const body = JSON.parse(post![1]!.body as string);
      expect(body.assigneeId).toBe(testUser2.id);
    });
  });

  it("laesst ohne Vorgabe unzugewiesen", async () => {
    const m = mockTodos();
    restore = m.restore;
    renderWithRouter(<TodosPage user={testUser} />);

    await waitFor(() => expect(screen.getByLabelText("Neues Todo")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Neues Todo"), "Ohne Vorgabe{Enter}");

    await waitFor(() => {
      const post = m.mock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(post![1]!.body as string).assigneeId).toBeUndefined();
    });
  });
});
