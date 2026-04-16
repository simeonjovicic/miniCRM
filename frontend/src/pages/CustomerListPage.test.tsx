import { screen, waitFor } from "@testing-library/react";
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

describe("CustomerListPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("loads and displays customers", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer, testCustomer2] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Globex Inc")).toBeInTheDocument();
    });
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

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());

    await userEvent.type(
      screen.getByPlaceholderText(/suche/i),
      "Globex",
    );

    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
    expect(screen.getByText("Globex Inc")).toBeInTheDocument();
  });

  it("shows status badges with correct text", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer, testCustomer2] }));
    renderWithRouter(<CustomerListPage user={testUser} />);

    await waitFor(() => {
      expect(screen.getByText("LEAD")).toBeInTheDocument();
      expect(screen.getByText("CUSTOMER")).toBeInTheDocument();
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
      expect(screen.getByText("NewCo")).toBeInTheDocument();
    });
  });
});
