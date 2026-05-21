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
  sessionGroupId: string | null;
}

export interface LeadFinderTermExpansion {
  keyword: string;
  terms: string[];
  cached: boolean;
}

export type LeadFinderRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface LeadFinderRunSummary {
  id: string;
  keyword: string;
  city: string;
  scope: string;
  status: LeadFinderRunStatus;
  keptResults: number;
  completedSearches: number;
  totalSearches: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface LeadFinderResult {
  id: string;
  googlePlaceId: string;
  businessName: string;
  formattedAddress: string | null;
  phone: string | null;
  googleMapsUri: string | null;
  businessStatus: string | null;
  primaryType: string | null;
  types: string | null;
  matchedTerms: string | null;
  reviewCount: number;
  city: string;
  district: string;
  fetchedAt: string;
  snapshotExpiresAt: string | null;
}

export interface LeadFinderRun extends LeadFinderRunSummary {
  approvedTerms: string[];
  progressPercent: number;
  droppedClosed: number;
  droppedWithWebsite: number;
  duplicateResults: number;
  errorMessage: string | null;
  startedAt: string | null;
  results: LeadFinderResult[];
}
