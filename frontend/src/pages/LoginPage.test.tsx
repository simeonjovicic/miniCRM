import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage";
import { renderWithRouter, mockFetch } from "../test/helpers";
import { testUser, testUser2 } from "../test/fixtures";

describe("LoginPage", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("shows existing users to select from", async () => {
    ({ restore } = mockFetch({ "/users": [testUser, testUser2] }));
    const onLogin = vi.fn();
    renderWithRouter(<LoginPage onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
  });

  it("calls onLogin when a user is selected", async () => {
    ({ restore } = mockFetch({ "/users": [testUser] }));
    const onLogin = vi.fn();
    renderWithRouter(<LoginPage onLogin={onLogin} />);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    await userEvent.click(screen.getByText("alice"));
    expect(onLogin).toHaveBeenCalledWith(testUser);
  });

  it("shows message when no users exist", async () => {
    ({ restore } = mockFetch({ "/users": [] }));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/noch keine user/i)).toBeInTheDocument();
    });
  });

  it("switches to create mode and creates a user", async () => {
    const created = { ...testUser, username: "charlie" };
    ({ restore } = mockFetch({
      "/users": [],
      "POST /users": created,
    }));
    const onLogin = vi.fn();
    renderWithRouter(<LoginPage onLogin={onLogin} />);

    await waitFor(() =>
      expect(screen.getByText(/neuen user erstellen/i)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText(/neuen user erstellen/i));

    await userEvent.type(screen.getByLabelText(/username/i), "charlie");
    await userEvent.type(screen.getByLabelText(/email/i), "c@example.com");
    await userEvent.click(screen.getByText(/erstellen & login/i));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(created));
  });

  it("shows error when backend is unreachable", async () => {
    ({ restore } = mockFetch({}));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/backend nicht erreichbar/i)).toBeInTheDocument();
    });
  });

  it("can go back from create mode", async () => {
    ({ restore } = mockFetch({ "/users": [] }));
    renderWithRouter(<LoginPage onLogin={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/neuen user erstellen/i)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText(/neuen user erstellen/i));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/zurück/i));
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });
});
