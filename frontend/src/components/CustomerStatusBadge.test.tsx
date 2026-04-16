import { render, screen } from "@testing-library/react";
import CustomerStatusBadge from "./CustomerStatusBadge";

describe("CustomerStatusBadge", () => {
  it("renders the status text", () => {
    render(<CustomerStatusBadge status="LEAD" />);
    expect(screen.getByText("LEAD")).toBeInTheDocument();
  });

  it.each([
    ["LEAD", "#c77d08"],
    ["PROSPECT", "#1a8fc4"],
    ["CUSTOMER", "#1fa03f"],
    ["CHURNED", "#cc372e"],
  ] as const)("applies correct color class for %s status", (status, color) => {
    render(<CustomerStatusBadge status={status} />);
    const badge = screen.getByText(status);
    expect(badge.className).toContain(color);
  });
});
