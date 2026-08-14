import type {
  Appointment,
  User,
  Customer,
  TodoItem,
  TodoComment,
  ExternalRevenue,
  FinanceEntry,
  FinanceKind,
  FinanceSettings,
  FinanceStats,
  FinanceStatus,
  TimeEntry,
} from "../types";

/** Basis-URL für alle API-Aufrufe. In Produktion gleicher Origin, in Dev per Vite Proxy. */
const BASE = "/api";

/**
 * Wird ausgelöst, sobald das Backend eine Anfrage mit 401 ablehnt — die Sitzung
 * ist dann abgelaufen. App horcht darauf und schickt zurück zur Anmeldung.
 */
export const SESSION_EXPIRED = "minicrm:session-expired";

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
    // Eine abgelaufene Sitzung ist kein Seitenfehler — dann gehört man zurück
    // zur Anmeldung, statt auf jeder Seite "401 Unauthorized" zu lesen.
    // Die Auth-Endpunkte sind ausgenommen, die prüfen selbst auf 401.
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
    }

    // Fachliche Fehler kommen als {"error": "..."} und sollen dem User im
    // Klartext angezeigt werden statt als nackter Statuscode.
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.clone().json();
      if (body?.error) message = body.error;
    } catch {
      // Antwort war kein JSON — dann bleibt es beim Statuscode
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

// =====================================================
// Auth API — Anmeldung über eine Server-Session
// =====================================================

/** Was der Anmeldebildschirm über einen Benutzer wissen muss — mehr nicht. */
export interface LoginCandidate {
  username: string;
  hasPassword: boolean;
}

export const authApi = {
  /** Auswahl für den Anmeldebildschirm. Ohne Anmeldung erreichbar. */
  candidates: () => request<LoginCandidate[]>("/auth/users"),
  login: (username: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  /** Erstes Passwort festlegen — geht nur, solange keines gesetzt ist. */
  setPassword: (username: string, password: string) =>
    request<User>("/auth/set-password", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  /** Allerersten Benutzer anlegen — geht nur, solange es gar keinen gibt. */
  bootstrap: (username: string, email: string, password: string) =>
    request<User>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),
  /** Passwort ändern — braucht das aktuelle, die Sitzung bleibt bestehen. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<User>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  /**
   * Der angemeldete Benutzer, oder null wenn keine Sitzung besteht.
   * Damit stellt die Oberfläche beim Start eine bestehende Anmeldung wieder her.
   */
  me: async (): Promise<User | null> => {
    try {
      return await request<User>("/auth/me");
    } catch {
      return null;
    }
  },
};

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
export interface UserPresence {
  userId: string;
  username: string;
  online: boolean;
  lastSeenAt: string | null;
}

export interface DashboardTodo {
  id: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  customerId: string | null;
  customerName: string | null;
  createdByUsername: string | null;
}

export interface DashboardInvoice {
  id: string;
  description: string;
  date: string;
  username: string | null;
  customerName: string | null;
  gross: number;
  paid: number;
  open: number;
}

export interface DashboardUserProfit {
  userId: string;
  username: string;
  profit: number;
  revenueGross: number;
  openReceivables: number;
}

/**
 * Die vier Fragen der Startseite: was ist offen, wer ist da, welches Geld steht
 * aus, und was hat jeder verdient.
 */
export interface DashboardStats {
  year: number;
  /** Gekürzt auf die dringendsten — die Gesamtzahl steht in openTodoCount */
  openTodos: DashboardTodo[];
  openTodoCount: number;
  onlineUsers: UserPresence[];
  openInvoices: DashboardInvoice[];
  openInvoiceCount: number;
  openInvoiceTotal: number;
  perUser: DashboardUserProfit[];
}

export const dashboardApi = {
  stats: (year?: number) =>
    request<DashboardStats>(`/dashboard/stats${year ? `?year=${year}` : ""}`),
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
  /**
   * Ersetzt das Todo. Es muss das VOLLSTÄNDIGE Todo gesendet werden — der Server
   * übernimmt done, Fälligkeit, Notizen und Kundenverknüpfung immer, damit sie
   * sich entfernen lassen. Ein Teil-Objekt würde den Rest löschen.
   */
  update: (id: string, todo: TodoItem) =>
    request<TodoItem>(`/todos/${id}`, {
      method: "PUT",
      body: JSON.stringify(todo),
    }),
  delete: (id: string) =>
    request<void>(`/todos/${id}`, { method: "DELETE" }),

  comments: (todoId: string) =>
    request<TodoComment[]>(`/todos/${todoId}/comments`),
  addComment: (todoId: string, comment: Partial<TodoComment>) =>
    request<TodoComment>(`/todos/${todoId}/comments`, {
      method: "POST",
      body: JSON.stringify(comment),
    }),
  deleteComment: (todoId: string, commentId: string) =>
    request<void>(`/todos/${todoId}/comments/${commentId}`, { method: "DELETE" }),
};

// =====================================================
// Appointments API — Termine mit Erinnerung
// =====================================================
export const appointmentsApi = {
  list: () => request<Appointment[]>("/appointments"),
  create: (appointment: Partial<Appointment>) =>
    request<Appointment>("/appointments", {
      method: "POST",
      body: JSON.stringify(appointment),
    }),
  update: (id: string, appointment: Partial<Appointment>) =>
    request<Appointment>(`/appointments/${id}`, {
      method: "PUT",
      body: JSON.stringify(appointment),
    }),
  delete: (id: string) =>
    request<void>(`/appointments/${id}`, { method: "DELETE" }),
};

// =====================================================
// Time Entries API — Zeiterfassung
// =====================================================
export const timeEntriesApi = {
  list: () => request<TimeEntry[]>("/time-entries"),
  getActive: (userId: string) =>
    request<TimeEntry | null>(`/time-entries/active/${userId}`).catch(() => null),
  listActive: () => request<TimeEntry[]>("/time-entries/active"),
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
  update: (id: string, entry: Partial<FinanceEntry>) =>
    request<FinanceEntry>(`/finance/${id}`, {
      method: "PUT",
      body: JSON.stringify(entry),
    }),
  delete: (id: string) =>
    request<void>(`/finance/${id}`, { method: "DELETE" }),
  /**
   * Schaltet nur Status und Art um. Eigener Endpunkt, damit Kunde,
   * Rechnungsanhang und Anzahlungs-Verknüpfung dabei erhalten bleiben.
   */
  setStatus: (id: string, status: FinanceStatus, kind: FinanceKind) =>
    request<FinanceEntry>(`/finance/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, kind }),
    }),
  /** Jahresstatistik inkl. Grenzwert-Fortschritt pro Person */
  stats: (year: number) => request<FinanceStats>(`/finance/stats?year=${year}`),
  settings: (year: number) =>
    request<FinanceSettings>(`/finance/settings?year=${year}`),
  updateSettings: (year: number, settings: Partial<FinanceSettings>) =>
    request<FinanceSettings>(`/finance/settings?year=${year}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  /** Umsätze ausserhalb dieses CRM — zählen auf die Kleinunternehmergrenze */
  externalRevenue: (year: number) =>
    request<ExternalRevenue[]>(`/finance/external?year=${year}`),
  setExternalRevenue: (
    year: number,
    userId: string,
    body: { amount: number; note?: string; username?: string },
  ) =>
    request<ExternalRevenue | null>(`/finance/external/${userId}?year=${year}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
