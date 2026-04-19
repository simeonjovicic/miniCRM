export interface User {
  id: string;
  username: string;
  email: string;
  role: "ADMIN" | "SALES" | "SUPPORT";
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  address: string | null;
  status: "LEAD" | "PROSPECT" | "CUSTOMER" | "CHURNED";
  createdBy: string;
  createdAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  notes: string | null;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

export interface FinanceEntry {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  description: string;
  date: string;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  description: string | null;
  userId: string;
  username: string | null;
  startedAt: string;
  stoppedAt: string | null;
  durationSeconds: number | null;
  customerId: string | null;
  todoId: string | null;
}
