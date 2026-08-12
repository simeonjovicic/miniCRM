import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppointmentsPanel from "./AppointmentsPanel";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testCustomer } from "../test/fixtures";
import type { Appointment } from "../types";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

/** Fester Zeitpunkt, damit "morgen" und "vergangen" berechenbar bleiben. */
const NOW = new Date("2026-08-12T11:00:00");

function iso(daysFromNow: number, time = "14:00") {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  return `${d.toISOString().slice(0, 10)}T${time}:00`;
}

const termin: Appointment = {
  id: "a-1",
  title: "Besprechung",
  startsAt: iso(2),
  location: "Büro Wien",
  createdBy: testUser.id,
  createdByUsername: testUser.username,
  createdAt: NOW.toISOString(),
};

function mockAppointments(list: Appointment[] = [termin]) {
  return mockFetch({ "/appointments": list });
}

describe("AppointmentsPanel", () => {
  let restore: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    restore?.();
  });

  it("listet anstehende Termine mit Ort und Verfasser", async () => {
    ({ restore } = mockAppointments());
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    expect(await screen.findByText("Besprechung")).toBeInTheDocument();
    expect(screen.getByText(/Büro Wien/)).toBeInTheDocument();
  });

  it("zeigt an, wie nah ein Termin ist", async () => {
    ({ restore } = mockAppointments([
      { ...termin, id: "a-1", startsAt: iso(1) },
      { ...termin, id: "a-2", title: "Jour Fixe", startsAt: iso(3) },
    ]));
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    expect(await screen.findByText("morgen")).toBeInTheDocument();
    expect(screen.getByText("in 3 Tagen")).toBeInTheDocument();
  });

  it("trennt vergangene Termine ab und klappt sie erst auf Klick auf", async () => {
    ({ restore } = mockAppointments([
      termin,
      { ...termin, id: "a-9", title: "Alter Termin", startsAt: iso(-5) },
    ]));
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    await screen.findByText("Besprechung");
    expect(screen.queryByText("Alter Termin")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(/Vergangen \(1\)/));

    expect(screen.getByText("Alter Termin")).toBeInTheDocument();
  });

  it("weist auf die Erinnerung hin", async () => {
    ({ restore } = mockAppointments());
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    expect(
      await screen.findByText(/Erinnerung kommt 2 Tage und 1 Tag vorher/),
    ).toBeInTheDocument();
  });

  it("legt einen Termin mit Datum und Uhrzeit an", async () => {
    const base = mockAppointments([]);
    const passthrough = globalThis.fetch;
    restore = base.restore;

    const posts: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Promise.resolve(
          new Response(JSON.stringify({ ...termin, ...body, id: "a-neu" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return passthrough(input, init);
    }) as unknown as typeof fetch;

    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    await waitFor(() => expect(screen.getByLabelText("Titel")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Titel"), "Kickoff");
    await userEvent.clear(screen.getByLabelText("Uhrzeit"));
    await userEvent.type(screen.getByLabelText("Uhrzeit"), "15:30");
    await userEvent.click(screen.getByRole("button", { name: "Termin anlegen" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ title: "Kickoff", createdBy: testUser.id });
    // Lokale Zeit ohne Zeitzone — sonst verschiebt sich der Termin beim Speichern
    expect(String(posts[0].startsAt)).toMatch(/T15:30:00$/);
  });

  it("verknüpft einen Kunden per @", async () => {
    ({ restore } = mockAppointments([]));
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    await waitFor(() => expect(screen.getByLabelText("Titel")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText("Titel"), "Termin mit @");
    await userEvent.click(await screen.findByRole("option", { name: /Acme Corp/ }));

    expect(screen.getByLabelText("Titel")).toHaveValue("Termin mit Acme Corp");
    expect(screen.getByText(`@${testCustomer.name}`)).toBeInTheDocument();
  });

  it("verlinkt den Kunden am gespeicherten Termin", async () => {
    ({ restore } = mockAppointments([
      { ...termin, customerId: testCustomer.id, customerName: testCustomer.name },
    ]));
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    const link = await screen.findByRole("link", { name: `@${testCustomer.name}` });

    expect(link).toHaveAttribute("href", `/customers/${testCustomer.id}`);
  });

  it("übernimmt einen Termin zum Bearbeiten ins Formular", async () => {
    ({ restore } = mockAppointments());
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    await screen.findByText("Besprechung");
    await userEvent.click(screen.getByRole("button", { name: /Besprechung bearbeiten/ }));

    expect(screen.getByText("Termin bearbeiten")).toBeInTheDocument();
    expect(screen.getByLabelText("Titel")).toHaveValue("Besprechung");
    expect(screen.getByLabelText("Uhrzeit")).toHaveValue("14:00");
    expect(screen.getByLabelText("Ort")).toHaveValue("Büro Wien");
  });

  it("zeigt fremde Termine ohne Bearbeiten-Knöpfe", async () => {
    ({ restore } = mockAppointments([
      { ...termin, createdBy: "jemand-anderes", createdByUsername: "bob" },
    ]));
    renderWithRouter(
      <AppointmentsPanel user={{ ...testUser, role: "SALES" }} customers={[testCustomer]} />,
    );

    await screen.findByText("Besprechung");
    expect(screen.queryByRole("button", { name: /bearbeiten/ })).not.toBeInTheDocument();
  });

  it("meldet einen leeren Terminplan statt einer leeren Seite", async () => {
    ({ restore } = mockAppointments([]));
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    expect(await screen.findByText("Keine anstehenden Termine.")).toBeInTheDocument();
  });

  it("zeigt Datum und Uhrzeit als Kalenderblock", async () => {
    ({ restore } = mockAppointments());
    renderWithRouter(<AppointmentsPanel user={testUser} customers={[testCustomer]} />);

    const eintrag = (await screen.findByText("Besprechung")).closest("li")!;

    // 14.08.2026 um 14:00
    expect(within(eintrag).getByText("14")).toBeInTheDocument();
    expect(within(eintrag).getByText("14:00")).toBeInTheDocument();
  });
});
