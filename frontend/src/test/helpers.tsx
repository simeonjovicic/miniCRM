import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

export function renderWithRouter(ui: ReactElement) {
  return render(ui, { wrapper: BrowserRouter });
}

export function mockFetch(responses: Record<string, unknown>) {
  const original = globalThis.fetch;
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    for (const [pattern, body] of Object.entries(responses)) {
      const [m, p] = pattern.includes(" ") ? pattern.split(" ", 2) : ["GET", pattern];
      if (method === m && url.includes(p!)) {
        return Promise.resolve(
          new Response(
            body === undefined ? null : JSON.stringify(body),
            {
              status: body === undefined ? 204 : 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });

  globalThis.fetch = mock as unknown as typeof fetch;
  return {
    mock,
    restore: () => { globalThis.fetch = original; },
  };
}
