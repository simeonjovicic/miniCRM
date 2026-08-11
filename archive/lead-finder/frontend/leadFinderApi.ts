/**
 * Herausgelöst aus frontend/src/services/api.ts und frontend/src/types/index.ts.
 * Zum Reaktivieren: Typen zurück nach types/index.ts, leadFinderApi zurück nach services/api.ts.
 *
 * Hinweis: request() ist in api.ts modul-lokal (nicht exportiert) — beim
 * Reaktivieren den Code einfach direkt in api.ts einfügen statt zu importieren.
 */
import type { request } from "../../../frontend/src/services/api";

// ── Typen (ehemals frontend/src/types/index.ts) ──────────────────

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

// ── API-Client (ehemals frontend/src/services/api.ts) ────────────

/** Lead Finder API — eigene Tabellen, getrennt vom CRM */
export const leadFinderApi = {
  expandTerms: (keyword: string) =>
    request<LeadFinderTermExpansion>("/lead-finder/terms", {
      method: "POST",
      body: JSON.stringify({ keyword }),
    }),
  startRun: (keyword: string, city: string, terms: string[]) =>
    request<LeadFinderRun>("/lead-finder/runs", {
      method: "POST",
      body: JSON.stringify({ keyword, city, terms }),
    }),
  recentRuns: () => request<LeadFinderRunSummary[]>("/lead-finder/runs"),
  getRun: (id: string) => request<LeadFinderRun>(`/lead-finder/runs/${id}`),
};
