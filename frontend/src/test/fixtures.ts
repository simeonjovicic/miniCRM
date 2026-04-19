import type { User, Customer } from "../types";

export const testUser: User = {
  id: "u-1",
  username: "alice",
  email: "alice@example.com",
  role: "ADMIN",
  createdAt: "2025-01-01T00:00:00Z",
};

export const testUser2: User = {
  id: "u-2",
  username: "bob",
  email: "bob@example.com",
  role: "SALES",
  createdAt: "2025-01-02T00:00:00Z",
};

export const testCustomer: Customer = {
  id: "c-1",
  name: "Acme Corp",
  email: "info@acme.com",
  company: "Acme",
  phone: "+49 123 456",
  status: "LEAD",
  address: null,
  createdBy: "u-1",
  createdAt: "2025-03-01T00:00:00Z",
};

export const testCustomer2: Customer = {
  id: "c-2",
  name: "Globex Inc",
  email: "hello@globex.com",
  company: "Globex",
  phone: null,
  status: "CUSTOMER",
  address: null,
  createdBy: "u-1",
  createdAt: "2025-03-02T00:00:00Z",
};
