import { screen, waitFor, within } from "@testing-library/react";
import TimerPage from "./TimerPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2 } from "../test/fixtures";
import type { TimeEntry } from "../types";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

/** Der Timer-Kontext haengt an einem eigenen Provider — hier nicht Gegenstand. */
vi.mock("../context/TimerContext", () => ({
  useTimer: () => ({
    running: null,
    elapsed: 0,
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
  }),
  TimerProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const NOW = new Date("2026-08-14T18:00:00");

function stunden(n: number) {
  return n * 3600;
}

/** Eintrag, der vor `vorTagen` Tagen um 09:00 begonnen hat. */
function entry(
  vorTagen: number,
  dauerSekunden: number,
  who = testUser,
  description = "Arbeit",
): TimeEntry {
  const start = new Date(NOW);
  start.setDate(start.getDate() - vorTagen);
  start.setHours(9, 0, 0, 0);
  return {
    id: crypto.randomUUID(),
    description,
    userId: who.id,
    username: who.username,
    startedAt: start.toISOString(),
    stoppedAt: new Date(start.getTime() + dauerSekunden * 1000).toISOString(),
    durationSeconds: dauerSekunden,
    customerId: null,
    todoId: null,
    sessionGroupId: null,
  };
}

function mockEntries(entries: TimeEntry[]) {
  return mockFetch({ "/time-entries": entries, "/customers": [], "/todos": [] });
}

/** Wert einer Kennzahl-Kachel über ihre Beschriftung. */
function kachel(label: string) {
  return within(screen.getByText(label).closest("div")!);
}

describe("TimerPage", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    restore?.();
  });

  // ── Summen ──────────────────────────────────────────────────────

  it("summiert nur den heutigen Tag in die Tageskachel", async () => {
    ({ restore } = mockEntries([
      entry(0, stunden(2)),
      entry(0, stunden(1)),
      entry(3, stunden(5)),
    ]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Heute")).toBeInTheDocument());
    expect(kachel("Heute").getByText("3h")).toBeInTheDocument();
  });

  it("zählt in die Woche auch die letzten sieben Tage", async () => {
    ({ restore } = mockEntries([entry(0, stunden(2)), entry(3, stunden(5))]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Diese Woche")).toBeInTheDocument());
    expect(kachel("Diese Woche").getByText("7h")).toBeInTheDocument();
  });

  /** Ein Eintrag von vor zwei Wochen darf die Wochensumme nicht mehr beruehren. */
  it("lässt ältere Einträge aus der Wochensumme heraus", async () => {
    ({ restore } = mockEntries([entry(0, stunden(2)), entry(14, stunden(40))]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Diese Woche")).toBeInTheDocument());
    expect(kachel("Diese Woche").getByText("2h")).toBeInTheDocument();
  });

  it("kommt ohne Einträge mit Nullen zurecht", async () => {
    ({ restore } = mockEntries([]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Heute")).toBeInTheDocument());
    expect(kachel("Heute").getByText("0s")).toBeInTheDocument();
  });

  // ── Darstellung der Dauer ───────────────────────────────────────

  it("schreibt Stunden und Minuten zusammen aus", async () => {
    ({ restore } = mockEntries([entry(0, stunden(2) + 30 * 60)]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Heute")).toBeInTheDocument());
    expect(kachel("Heute").getByText("2h 30m")).toBeInTheDocument();
  });

  it("lässt die Stunde weg, solange es nur Minuten sind", async () => {
    ({ restore } = mockEntries([entry(0, 45 * 60)]));
    renderWithRouter(<TimerPage user={testUser} />);

    await waitFor(() => expect(screen.getByText("Heute")).toBeInTheDocument());
    expect(kachel("Heute").getByText("45m")).toBeInTheDocument();
  });

  // ── Einträge ────────────────────────────────────────────────────

  it("listet die erfassten Zeiten mit Beschreibung", async () => {
    ({ restore } = mockEntries([entry(0, stunden(1), testUser, "Angebot geschrieben")]));
    renderWithRouter(<TimerPage user={testUser} />);

    expect(await screen.findByText("Angebot geschrieben")).toBeInTheDocument();
  });

  it("zeigt auch die Zeiten der anderen Person", async () => {
    ({ restore } = mockEntries([
      entry(0, stunden(1), testUser, "Meine Arbeit"),
      entry(0, stunden(2), testUser2, "Bobs Arbeit"),
    ]));
    renderWithRouter(<TimerPage user={testUser} />);

    expect(await screen.findByText("Bobs Arbeit")).toBeInTheDocument();
    expect(screen.getByText("Meine Arbeit")).toBeInTheDocument();
  });

  // ── Fehler ──────────────────────────────────────────────────────

  it("meldet einen Ladefehler statt leer dazustehen", async () => {
    ({ restore } = mockFetch({}));
    renderWithRouter(<TimerPage user={testUser} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
