import type { User, Customer, TodoItem, FinanceEntry, TimeEntry } from "../types";

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
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
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
  onlineUsers: { userId: string; username: string; online: boolean; lastSeenAt: string | null }[];
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

// =====================================================
// Time Entries API — Zeiterfassung
// =====================================================
export const timeEntriesApi = {
  list: () => request<TimeEntry[]>("/time-entries"),
  getActive: (userId: string) =>
    request<TimeEntry | null>(`/time-entries/active/${userId}`).catch(() => null),
  start: (userId: string, username: string, description: string) =>
    request<TimeEntry>("/time-entries/start", {
      method: "POST",
      body: JSON.stringify({ userId, username, description }),
    }),
  stop: (id: string, durationSeconds?: number) =>
    request<TimeEntry>(`/time-entries/${id}/stop`, {
      method: "PUT",
      body: JSON.stringify({ durationSeconds }),
    }),
  updateDescription: (id: string, description: string) =>
    request<TimeEntry>(`/time-entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ description }),
    }),
  delete: (id: string) =>
    request<void>(`/time-entries/${id}`, { method: "DELETE" }),
  startTogether: (participants: { userId: string; username: string }[], description = "") =>
    request<TimeEntry[]>("/time-entries/start-together", {
      method: "POST",
      body: JSON.stringify({ participants, description }),
    }),
  linkTogether: (id: string, targetId: string) =>
    request<TimeEntry[]>(`/time-entries/${id}/link-together`, {
      method: "POST",
      body: JSON.stringify({ targetId }),
    }),
};

// =====================================================
// Storage API — Samba File Browser
// =====================================================
export interface StorageFile {
  name: string;
  directory: boolean;
  size: number;
  lastModified: number;
}

export const storageApi = {
  list: (path = "") =>
    request<StorageFile[]>(`/storage/files?path=${encodeURIComponent(path)}`),
  downloadUrl: (path: string) =>
    `${BASE}/storage/download?path=${encodeURIComponent(path)}`,
  previewUrl: (path: string) =>
    `${BASE}/storage/preview?path=${encodeURIComponent(path)}`,
  search: (query: string) =>
    request<StorageFile[]>(`/storage/search?q=${encodeURIComponent(query)}`),
  createFolder: (path: string, name: string) =>
    request<void>("/storage/folder", {
      method: "POST",
      body: JSON.stringify({ path, name }),
    }),
  delete: (path: string, name: string) =>
    request<void>(
      `/storage/delete?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  rename: (path: string, oldName: string, newName: string) =>
    request<void>("/storage/rename", {
      method: "PUT",
      body: JSON.stringify({ path, oldName, newName }),
    }),
  upload: async (path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `${BASE}/storage/upload?path=${encodeURIComponent(path)}`,
      { method: "POST", body: form },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  },
  uploadBatch: (
    path: string,
    files: FileList,
    onProgress?: (percent: number) => void,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      for (let i = 0; i < files.length; i++) {
        form.append("files", files[i]);
      }
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${BASE}/storage/upload/batch?path=${encodeURIComponent(path)}`,
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`${xhr.status} ${xhr.statusText}`));
      };
      xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
      xhr.send(form);
    });
  },
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
