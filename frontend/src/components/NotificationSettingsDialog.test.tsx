import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationSettingsDialog from "./NotificationSettingsDialog";
import { mockFetch } from "../test/helpers";

const THEMA = "simeon-privat-4711";

/** Antworten für /auth/ntfy-topic in beiden Richtungen. */
function mockTopic(topic: string) {
  return mockFetch({
    "/auth/ntfy-topic": { topic, configured: topic !== "" },
    "PUT /auth/ntfy-topic": { topic, configured: topic !== "" },
    "POST /auth/ntfy-test": { sent: true },
  });
}

function feld() {
  return screen.getByLabelText("Mein ntfy-Thema") as HTMLInputElement;
}

describe("NotificationSettingsDialog", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  // ── Anzeige ─────────────────────────────────────────────────────

  it("zeigt nichts, solange er zu ist", () => {
    ({ restore } = mockTopic(""));
    render(<NotificationSettingsDialog open={false} onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lädt das hinterlegte Thema und zeigt es im Klartext", async () => {
    ({ restore } = mockTopic(THEMA));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    // Im Klartext, damit man es mit der ntfy-App vergleichen kann
    await waitFor(() => expect(feld()).toHaveValue(THEMA));
  });

  it("steht ohne hinterlegtes Thema leer da", async () => {
    ({ restore } = mockTopic(""));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    await waitFor(() => expect(feld()).toHaveValue(""));
  });

  // ── Speichern ───────────────────────────────────────────────────

  it("schickt das Thema an den Server", async () => {
    const m = mockTopic("");
    restore = m.restore;
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toBeInTheDocument());

    await userEvent.type(feld(), THEMA);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      const put = m.mock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put).toBeDefined();
      expect(JSON.parse(put![1]!.body as string)).toEqual({ topic: THEMA });
    });
  });

  /** Ohne Änderung gäbe es nichts zu speichern — der Knopf bleibt aus. */
  it("lässt sich ohne Änderung nicht speichern", async () => {
    ({ restore } = mockTopic(THEMA));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    await waitFor(() => expect(feld()).toHaveValue(THEMA));
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });

  // ── Prüfungen vor dem Absenden ──────────────────────────────────

  /** Zu kurz heisst durchprobierbar — das soll man sehen, bevor es rausgeht. */
  it("lehnt ein zu kurzes Thema ab, ohne den Server zu fragen", async () => {
    const m = mockTopic("");
    restore = m.restore;
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toBeInTheDocument());

    await userEvent.type(feld(), "kurz");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/mindestens 8/i);
    expect(m.mock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("lehnt unzulässige Zeichen ab", async () => {
    const m = mockTopic("");
    restore = m.restore;
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toBeInTheDocument());

    await userEvent.type(feld(), "mein thema mit leerzeichen");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Buchstaben, Ziffern/i);
    expect(m.mock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  // ── Probenachricht ──────────────────────────────────────────────

  /** Ein vertipptes Thema faellt sonst nie auf — ntfy nimmt jeden Namen an. */
  it("verschickt eine Probenachricht an das gespeicherte Thema", async () => {
    const m = mockTopic(THEMA);
    restore = m.restore;
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toHaveValue(THEMA));

    await userEvent.click(screen.getByRole("button", { name: "Probe senden" }));

    await waitFor(() =>
      expect(m.mock.mock.calls.some(([url]) => String(url).includes("/auth/ntfy-test"))).toBe(true),
    );
    expect(await screen.findByText(/Probenachricht verschickt/i)).toBeInTheDocument();
  });

  it("bietet die Probe ohne hinterlegtes Thema nicht an", async () => {
    ({ restore } = mockTopic(""));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    await waitFor(() => expect(feld()).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Probe senden" })).toBeDisabled();
  });

  /**
   * Sonst prueft die Probe ein Thema, das so noch gar nicht hinterlegt ist —
   * sie kaeme an und man glaubte, das Getippte sei gespeichert.
   */
  it("sperrt die Probe, solange etwas Ungespeichertes im Feld steht", async () => {
    ({ restore } = mockTopic(THEMA));
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toHaveValue(THEMA));

    await userEvent.type(feld(), "-geaendert");

    expect(screen.getByRole("button", { name: "Probe senden" })).toBeDisabled();
  });

  // ── Abbestellen ─────────────────────────────────────────────────

  /** Kein Fehlerfall, sondern der regulaere Weg die Uebersicht abzuschalten. */
  it("bestellt mit einem leeren Wert wieder ab", async () => {
    const m = mockFetch({
      "/auth/ntfy-topic": { topic: THEMA, configured: true },
      "PUT /auth/ntfy-topic": { topic: "", configured: false },
    });
    restore = m.restore;
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toHaveValue(THEMA));

    await userEvent.click(screen.getByRole("button", { name: "Abbestellen" }));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      const put = m.mock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(put![1]!.body as string)).toEqual({ topic: "" });
    });
    expect(await screen.findByText(/abbestellt/i)).toBeInTheDocument();
  });

  it("bietet das Abbestellen nicht an, wenn gar keines hinterlegt ist", async () => {
    ({ restore } = mockTopic(""));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    await waitFor(() => expect(feld()).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Abbestellen" })).not.toBeInTheDocument();
  });

  // ── Vorschlag ───────────────────────────────────────────────────

  /** Von Hand ausgedachte Themen sind zu kurz und zu ratbar. */
  it("schlägt ein langes zufälliges Thema vor", async () => {
    ({ restore } = mockTopic(""));
    render(<NotificationSettingsDialog open onClose={() => {}} />);
    await waitFor(() => expect(feld()).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Zufälliges vorschlagen/i }));

    const vorschlag = feld().value;
    expect(vorschlag.length).toBeGreaterThanOrEqual(8);
    expect(vorschlag).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // ── Fehler ──────────────────────────────────────────────────────

  it("meldet einen Ladefehler statt leer dazustehen", async () => {
    ({ restore } = mockFetch({}));
    render(<NotificationSettingsDialog open onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
