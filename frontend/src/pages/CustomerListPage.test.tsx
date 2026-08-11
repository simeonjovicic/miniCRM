import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerListPage from "./CustomerListPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testCustomer, testCustomer2 } from "../test/fixtures";

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendOperation: () => {},
  connect: () => {},
  isConnected: () => true,
  onConnectionChange: () => () => {},
  getOfflineQueueSize: () => 0,
}));

/**
 * Die Seite rendert beide Layouts gleichzeitig ins DOM: die Desktop-Tabelle
 * (`hidden sm:block`) und die Mobile-Kartenliste (`sm:hidden`). Getrennt werden
 * sie nur per CSS — und jsdom wendet kein Tailwind an. Deshalb kommt jeder
 * Kundenname zweimal vor und Queries müssen auf ein Layout eingegrenzt werden:
 *   Desktop → innerhalb der <table>
 *   Mobile  → die Karte ist ein <button> mit dem Namen als Accessible Name
 */
const desktopRows = () => within(screen.getByRole("table"));
const mobileCard = (name: string | RegExp) =>
  screen.getByRole("button", { name });

describe("CustomerListPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("loads and displays customers", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer, testCustomer2] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() => {
      expect(desktopRows().getByText("Acme Corp")).toBeInTheDocument();
      expect(desktopRows().getByText("Globex Inc")).toBeInTheDocument();
    });
  });

  it("renders each customer in both the desktop table and the mobile list", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() =>
      expect(desktopRows().getByText("Acme Corp")).toBeInTheDocument(),
    );
    expect(mobileCard(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getAllByText("Acme Corp")).toHaveLength(2);
  });

  it("shows empty state when no customers", async () => {
    ({ restore } = mockFetch({ "/customers": [] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() => {
      expect(screen.getByText(/keine kunden gefunden/i)).toBeInTheDocument();
    });
  });

  it("filters customers by search", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer, testCustomer2] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() =>
      expect(desktopRows().getByText("Acme Corp")).toBeInTheDocument(),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/suche/i),
      "Globex",
    );

    // Aus beiden Layouts verschwunden
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
    expect(desktopRows().getByText("Globex Inc")).toBeInTheDocument();
  });

  it("shows status badges with correct text", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer, testCustomer2] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() => {
      expect(desktopRows().getByText("LEAD")).toBeInTheDocument();
      expect(desktopRows().getByText("CUSTOMER")).toBeInTheDocument();
    });
  });

  it("toggles create form", async () => {
    ({ restore } = mockFetch({ "/customers": [] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() =>
      expect(screen.getByText(/\+ neuer kunde/i)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText(/\+ neuer kunde/i));
    expect(screen.getByPlaceholderText("Name *")).toBeInTheDocument();

    await userEvent.click(screen.getByText(/abbrechen/i));
    expect(screen.queryByPlaceholderText("Name *")).not.toBeInTheDocument();
  });

  it("creates a new customer", async () => {
    const newCustomer = { ...testCustomer, id: "c-3", name: "NewCo" };
    ({ restore } = mockFetch({
      "/customers": [],
      "POST /customers": newCustomer,
    }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() =>
      expect(screen.getByText(/\+ neuer kunde/i)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText(/\+ neuer kunde/i));
    await userEvent.type(screen.getByPlaceholderText("Name *"), "NewCo");
    await userEvent.click(screen.getByText(/^erstellen$/i));

    await waitFor(() => {
      expect(desktopRows().getByText("NewCo")).toBeInTheDocument();
    });
  });
});
