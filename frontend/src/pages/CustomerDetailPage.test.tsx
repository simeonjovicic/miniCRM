import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerDetailPage from "./CustomerDetailPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testCustomer } from "../test/fixtures";
import type { UseCrdtResult } from "../hooks/useCrdt";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "c-1" }),
  };
});

const mockCrdt: UseCrdtResult = {
  getField: vi.fn(() => ""),
  setField: vi.fn(),
  todos: new Map(),
  addTodo: vi.fn(),
  removeTodo: vi.fn(),
  getCounter: vi.fn(() => 0),
  incrementCounter: vi.fn(),
  decrementCounter: vi.fn(),
  revision: 0,
};

vi.mock("../hooks/useCrdt", () => ({
  useCrdt: () => mockCrdt,
}));

vi.mock("../services/websocket", () => ({
  subscribe: () => () => {},
  sendPresence: () => {},
  sendOperation: () => {},
  onConnectionChange: () => () => {},
  isConnected: () => true,
  getOfflineQueueSize: () => 0,
  connect: () => {},
}));

describe("CustomerDetailPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  beforeEach(() => {
    vi.mocked(mockCrdt.getField).mockReturnValue("");
    vi.mocked(mockCrdt.getCounter).mockReturnValue(0);
    mockCrdt.todos = new Map();
  });

  it("loads and displays customer details", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });
    const badges = screen.getAllByText("LEAD");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows not-found when customer doesn't exist", async () => {
    ({ restore } = mockFetch({}));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() => {
      expect(screen.getByText(/nicht gefunden/i)).toBeInTheDocument();
    });
  });

  it("renders editable fields from customer data", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("info@acme.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("+49 123 456")).toBeInTheDocument();
  });

  it("has a back-to-list button", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByText(/zurück zur liste/i)).toBeInTheDocument(),
    );
  });

  it("has a delete button", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByText(/löschen/i)).toBeInTheDocument(),
    );
  });

  it("renders the todo section", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByText("Todos")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("Neues Todo...")).toBeInTheDocument();
  });

  it("renders the contact counter section", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByText("Kontaktaufnahmen")).toBeInTheDocument(),
    );
  });

  it("calls setField when editing a field", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument(),
    );

    const nameInput = screen.getByDisplayValue("Acme Corp");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");

    // EditableField debounces 300ms then calls onChange → crdt.setField
    await waitFor(() =>
      expect(mockCrdt.setField).toHaveBeenCalledWith("name", "New Name"),
    );
  });

  it("calls incrementCounter when + button is clicked", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    renderWithRouter(<CustomerDetailPage userId="u-1" />);

    await waitFor(() =>
      expect(screen.getByText("Kontaktaufnahmen")).toBeInTheDocument(),
    );

    // The counter has - then + buttons; find the one next to the counter display
    const counterSection = screen.getByText("Kontaktaufnahmen").closest("div")!;
    const incrementBtn = counterSection.querySelector("button:last-of-type")!;
    await userEvent.click(incrementBtn);

    expect(mockCrdt.incrementCounter).toHaveBeenCalledWith("contactCount");
  });
});
