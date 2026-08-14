import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoragePage from "./StoragePage";
import { renderWithRouter } from "../test/helpers";
import type { StorageFile } from "../services/api";

/**
 * Die Seite rendert Desktop-Tabelle und Mobile-Karten gleichzeitig ins DOM,
 * getrennt nur per CSS — jeder Name kommt also doppelt vor. Abgefragt wird
 * deshalb innerhalb der Tabelle.
 */
function tabelle() {
  return within(screen.getByRole("table"));
}

function file(name: string, directory = false, size = 2048): StorageFile {
  return { name, directory, size, lastModified: 1_760_000_000_000 };
}

/** Der Storage antwortet je nach Pfad unterschiedlich. */
function mockStorage(byPath: Record<string, StorageFile[]>) {
  const original = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/storage/files")) {
      const path = decodeURIComponent(new URL(url, "http://x").searchParams.get("path") ?? "");
      const entries = byPath[path];
      if (!entries) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Pfad nicht erreichbar" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify(entries), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as unknown as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe("StoragePage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  // ── Anzeige ─────────────────────────────────────────────────────

  it("listet Ordner und Dateien", async () => {
    ({ restore } = mockStorage({ "": [file("Rechnungen", true), file("RE-004.pdf")] }));
    renderWithRouter(<StoragePage />);

    await screen.findByRole("table");
    expect(tabelle().getByText("Rechnungen")).toBeInTheDocument();
    expect(tabelle().getByText("RE-004.pdf")).toBeInTheDocument();
  });

  it("meldet einen leeren Ordner", async () => {
    ({ restore } = mockStorage({ "": [] }));
    renderWithRouter(<StoragePage />);

    await waitFor(() => expect(screen.queryByText(/lade/i)).not.toBeInTheDocument());
    expect(screen.getAllByText(/leer|keine/i).length).toBeGreaterThan(0);
  });

  // ── Navigation ──────────────────────────────────────────────────

  it("steigt in einen Ordner ab und lädt dessen Inhalt", async () => {
    ({ restore } = mockStorage({
      "": [file("Rechnungen", true)],
      Rechnungen: [file("RE-004.pdf")],
    }));
    renderWithRouter(<StoragePage />);

    await screen.findByRole("table");
    await userEvent.click(tabelle().getByText("Rechnungen"));

    await waitFor(() => expect(tabelle().getByText("RE-004.pdf")).toBeInTheDocument());
  });

  /** Ohne Brotkrumen kaeme man aus einem Unterordner nicht mehr heraus. */
  it("kommt über die Brotkrumen wieder zurück", async () => {
    const mock = mockStorage({
      "": [file("Rechnungen", true)],
      Rechnungen: [file("2026", true)],
      "Rechnungen/2026": [file("RE-004.pdf")],
    });
    restore = mock.restore;
    renderWithRouter(<StoragePage />);

    await screen.findByRole("table");
    await userEvent.click(tabelle().getByText("Rechnungen"));
    await waitFor(() => expect(tabelle().getByText("2026")).toBeInTheDocument());
    await userEvent.click(tabelle().getByText("2026"));
    await waitFor(() => expect(tabelle().getByText("RE-004.pdf")).toBeInTheDocument());

    // Über den Brotkrumen zurück auf die mittlere Ebene
    await userEvent.click(screen.getAllByText("Rechnungen")[0]);

    await waitFor(() =>
      expect(mock.calls.filter((c) => c.includes("path=Rechnungen")).length).toBeGreaterThan(1),
    );
  });

  // ── Fehler ──────────────────────────────────────────────────────

  /** Der Share haengt am Netz — faellt er aus, muss das dastehen. */
  it("zeigt die Meldung, wenn der Share nicht erreichbar ist", async () => {
    ({ restore } = mockStorage({}));
    renderWithRouter(<StoragePage />);

    expect(await screen.findByText("Pfad nicht erreichbar")).toBeInTheDocument();
  });

  // ── Ordner anlegen ──────────────────────────────────────────────

  it("legt einen Ordner an und lädt danach neu", async () => {
    const mock = mockStorage({ "": [] });
    restore = mock.restore;
    renderWithRouter(<StoragePage />);

    await waitFor(() => expect(screen.queryByText(/lade/i)).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /ordner/i }));
    // Auch das Eingabefeld gibt es zweimal (Desktop und Mobil)
    await userEvent.type(screen.getAllByPlaceholderText("Ordnername...")[0], "Belege");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(mock.calls.some((c) => c.includes("/storage/folder"))).toBe(true),
    );
  });
});
