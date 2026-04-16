import type { User, Customer, TodoItem, FinanceEntry } from "../types";

/** Basis-URL für alle API-Aufrufe. In Produktion gleicher Origin, in Dev per Vite Proxy. */
const BASE = "/api";

/**
 * Generische HTTP-Request-Funktion.
 * Wirft einen Error bei nicht-OK Status Codes.
 * Bei 204 (No Content, z.B. nach DELETE) wird undefined zurückgegeben.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// =====================================================
// User API — Benutzerverwaltung
// =====================================================
export const usersApi = {
  list: () => request<User[]>("/users"),
  get: (id: string) => request<User>(`/users/${id}`),
  create: (user: Partial<User>) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify(user),
    }),
};

// =====================================================
// Dashboard API — Aggregierte Statistiken
// =====================================================
export interface DashboardStats {
  totalCustomers: number;
  leads: number;
  prospects: number;
  activeCustomers: number;
  churned: number;
  recentCustomers: { id: string; name: string; status: string; createdAt: string }[];
  onlineUsers: { userId: string; username: string }[];
}

export const dashboardApi = {
  stats: () => request<DashboardStats>("/dashboard/stats"),
};

// =====================================================
// Customers API — Kundenverwaltung
// =====================================================
export const customersApi = {
  list: () => request<Customer[]>("/customers"),
  get: (id: string) => request<Customer>(`/customers/${id}`),
  create: (customer: Partial<Customer>) =>
    request<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify(customer),
    }),
  update: (id: string, customer: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(customer),
    }),
  delete: (id: string) =>
    request<void>(`/customers/${id}`, { method: "DELETE" }),
  /** Lädt den vollständigen CRDT-State eines Kunden (für die Detailseite). */
  getCrdtState: (id: string) =>
    request<Record<string, unknown>>(`/customers/${id}/crdt`),
};

// =====================================================
// Todos API
// =====================================================
export const todosApi = {
  list: () => request<TodoItem[]>("/todos"),
  create: (todo: Partial<TodoItem>) =>
    request<TodoItem>("/todos", {
      method: "POST",
      body: JSON.stringify(todo),
    }),
  update: (id: string, todo: Partial<TodoItem>) =>
    request<TodoItem>(`/todos/${id}`, {
      method: "PUT",
      body: JSON.stringify(todo),
    }),
  delete: (id: string) =>
    request<void>(`/todos/${id}`, { method: "DELETE" }),
};

// =====================================================
// Finance API — Einnahmen und Ausgaben
// =====================================================
export interface FinanceStats {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  perUser: { username: string; income: number; expense: number; profit: number }[];
}

// =====================================================
// AI API — KI-E-Mail-Assistent (Groq / Llama 3.3 70B)
// =====================================================
export const aiApi = {
  /**
   * Generiert eine E-Mail mit KI.
   * Sendet die User-Nachricht, den gewünschten Ton und den bisherigen Chatverlauf.
   * Das Backend reichert den Prompt automatisch mit CRM-Kontext an
   * (erwähnte Kunden, Todos, Finanzeinträge).
   */
  generateEmail: (
    message: string,
    tone: string,
    history: { role: string; content: string }[],
  ) =>
    request<{ content: string }>("/ai/generate-email", {
      method: "POST",
      body: JSON.stringify({ message, tone, history }),
    }),
};

export const financeApi = {
  list: () => request<FinanceEntry[]>("/finance"),
  create: (entry: Partial<FinanceEntry>) =>
    request<FinanceEntry>("/finance", {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  delete: (id: string) =>
    request<void>(`/finance/${id}`, { method: "DELETE" }),
  stats: () => request<FinanceStats>("/finance/stats"),
};
