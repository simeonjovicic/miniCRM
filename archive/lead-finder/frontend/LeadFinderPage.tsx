import { useEffect, useMemo, useState } from "react";
import { leadFinderApi } from "../services/api";
import type { LeadFinderResult, LeadFinderRun, LeadFinderRunSummary } from "../types";

type TermItem = {
  value: string;
  enabled: boolean;
};

const ACTIVE_STATUSES = new Set(["PENDING", "RUNNING"]);

export default function LeadFinderPage() {
  const [keyword, setKeyword] = useState("spa");
  const [city, setCity] = useState("Wien");
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [termInput, setTermInput] = useState("");
  const [termSource, setTermSource] = useState<"cache" | "ai" | null>(null);
  const [recentRuns, setRecentRuns] = useState<LeadFinderRunSummary[]>([]);
  const [currentRun, setCurrentRun] = useState<LeadFinderRun | null>(null);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leadFinderApi.recentRuns().then(setRecentRuns).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!currentRun || !ACTIVE_STATUSES.has(currentRun.status)) return;
    const interval = window.setInterval(() => {
      leadFinderApi.getRun(currentRun.id)
        .then(setCurrentRun)
        .catch((err) => setError(err.message));
    }, 2000);
    return () => window.clearInterval(interval);
  }, [currentRun?.id, currentRun?.status]);

  const approvedTerms = terms.filter((term) => term.enabled).map((term) => term.value);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, LeadFinderResult[]>();
    for (const result of currentRun?.results ?? []) {
      const list = groups.get(result.district) ?? [];
      list.push(result);
      groups.set(result.district, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => districtRank(a) - districtRank(b))
      .map(([district, results]) => [
        district,
        results.sort((a, b) => b.reviewCount - a.reviewCount),
      ] as const);
  }, [currentRun?.results]);

  async function handleExpandTerms(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoadingTerms(true);
    try {
      const response = await leadFinderApi.expandTerms(keyword);
      setTerms(response.terms.map((value) => ({ value, enabled: true })));
      setTermSource(response.cached ? "cache" : "ai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Begriffe konnten nicht geladen werden.");
    } finally {
      setLoadingTerms(false);
    }
  }

  async function handleStartRun() {
    if (approvedTerms.length === 0) {
      setError("Mindestens ein Suchbegriff muss aktiv sein.");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const run = await leadFinderApi.startRun(keyword, city, approvedTerms);
      setCurrentRun(run);
      leadFinderApi.recentRuns().then(setRecentRuns).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suche konnte nicht gestartet werden.");
    } finally {
      setStarting(false);
    }
  }

  async function openRun(id: string) {
    setLoadingRunId(id);
    setError(null);
    try {
      setCurrentRun(await leadFinderApi.getRun(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run konnte nicht geladen werden.");
    } finally {
      setLoadingRunId(null);
    }
  }

  function toggleTerm(value: string) {
    setTerms((prev) =>
      prev.map((term) =>
        term.value === value ? { ...term, enabled: !term.enabled } : term,
      ),
    );
  }

  function addTerm() {
    const value = termInput.trim();
    if (!value) return;
    setTerms((prev) =>
      prev.some((term) => term.value.toLowerCase() === value.toLowerCase())
        ? prev
        : [...prev, { value, enabled: true }],
    );
    setTermInput("");
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-bright">Lead Finder</h1>
          <p className="mt-1 text-sm text-text-secondary">Google Maps</p>
        </div>
        {currentRun && (
          <div className="glass-chip rounded-full px-3 py-1.5 text-[13px] font-medium text-text-secondary">
            {statusLabel(currentRun.status)}
          </div>
        )}
      </div>

      {error && (
        <div className="glass mb-4 rounded-2xl border-status-churned/30! bg-status-churned/10! px-4 py-3 text-sm text-[#c7352d]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <form onSubmit={handleExpandTerms} className="glass rounded-2xl p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto]">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Keyword"
                className="glass-input rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Stadt"
                className="glass-input rounded-xl px-3 py-2.5 text-sm text-text-bright"
              />
              <button
                type="submit"
                disabled={loadingTerms}
                className="btn-shimmer rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {loadingTerms ? "Lade..." : "Begriffe"}
              </button>
            </div>
          </form>

          {terms.length > 0 && (
            <section className="glass rounded-2xl p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-bright">Suchbegriffe</h2>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {termSource === "cache" ? "Cache" : "Groq"} · {approvedTerms.length}/{terms.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTerms((prev) => prev.map((term) => ({ ...term, enabled: true })))}
                    className="glass-chip rounded-full px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:text-text-bright"
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerms((prev) => prev.map((term) => ({ ...term, enabled: false })))}
                    className="glass-chip rounded-full px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:text-text-bright"
                  >
                    Keine
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {terms.map((term) => (
                  <button
                    key={term.value}
                    type="button"
                    onClick={() => toggleTerm(term.value)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${
                      term.enabled
                        ? "bg-accent text-white shadow-sm"
                        : "glass-chip text-text-secondary hover:text-text-bright"
                    }`}
                  >
                    {term.value}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTerm();
                    }
                  }}
                  placeholder="Suchbegriff"
                  className="glass-input rounded-xl px-3 py-2.5 text-sm text-text-bright"
                />
                <button
                  type="button"
                  onClick={addTerm}
                  className="glass-chip rounded-xl px-3 py-2 text-sm font-semibold text-text-bright transition-all hover:bg-white/60"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartRun}
                disabled={starting || approvedTerms.length === 0}
                className="btn-shimmer mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60 sm:w-auto"
              >
                {starting ? "Starte..." : "Suche starten"}
              </button>
            </section>
          )}

          {currentRun && (
            <section className="glass rounded-2xl p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-bright">
                    {currentRun.keyword} · {currentRun.city}
                  </h2>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {currentRun.completedSearches}/{currentRun.totalSearches} Suchen · {currentRun.keptResults} Leads
                  </p>
                </div>
                <span className="glass-chip rounded-full px-3 py-1.5 text-[13px] font-medium text-text-secondary">
                  {currentRun.progressPercent}%
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/45">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${currentRun.progressPercent}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Ohne Website" value={currentRun.keptResults} />
                <Metric label="Mit Website" value={currentRun.droppedWithWebsite} />
                <Metric label="Geschlossen" value={currentRun.droppedClosed} />
                <Metric label="Duplikate" value={currentRun.duplicateResults} />
              </div>

              {currentRun.errorMessage && (
                <p className="mt-4 text-sm text-[#c7352d]">{currentRun.errorMessage}</p>
              )}
            </section>
          )}

          {currentRun && (
            <section className="glass overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-white/40 px-5 py-3">
                <h2 className="text-base font-semibold text-text-bright">Ergebnisse</h2>
                <span className="text-xs text-text-secondary" translate="no">Google Maps</span>
              </div>

              {groupedResults.length === 0 ? (
                <p className="px-5 py-6 text-sm text-text-secondary">
                  {ACTIVE_STATUSES.has(currentRun.status) ? "Suche läuft..." : "Keine passenden Leads gefunden."}
                </p>
              ) : (
                <div className="divide-y divide-white/35">
                  {groupedResults.map(([district, results]) => (
                    <div key={district}>
                      <div className="bg-white/25 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        {district} · {results.length}
                      </div>
                      <div className="hidden sm:block">
                        <table className="w-full text-left text-sm">
                          <tbody>
                            {results.map((result) => (
                              <tr key={result.id} className="border-b border-white/25 last:border-0">
                                <td className="px-5 py-3.5">
                                  <p className="font-semibold text-text-bright">{result.businessName}</p>
                                  <p className="mt-0.5 text-xs text-text-secondary">{result.formattedAddress ?? "—"}</p>
                                </td>
                                <td className="px-5 py-3.5 text-xs text-text-secondary">
                                  {result.primaryType ?? "—"}
                                  <span className="block font-mono">{result.matchedTerms ?? "—"}</span>
                                </td>
                                <td className="px-5 py-3.5 text-right text-sm font-semibold text-text-bright">
                                  {result.reviewCount}
                                  <span className="block text-xs font-normal text-text-secondary">Reviews</span>
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  {result.googleMapsUri ? (
                                    <a
                                      href={result.googleMapsUri}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="glass-chip rounded-full px-3 py-1.5 text-xs font-medium text-accent"
                                    >
                                      Maps
                                    </a>
                                  ) : (
                                    <span className="text-xs text-text-secondary">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2 p-3 sm:hidden">
                        {results.map((result) => (
                          <div key={result.id} className="glass-chip rounded-xl px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-text-bright">{result.businessName}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                                  {result.formattedAddress ?? "—"}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold text-text-bright">{result.reviewCount}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-[11px] text-text-secondary">
                                {result.matchedTerms ?? "—"}
                              </span>
                              {result.googleMapsUri && (
                                <a
                                  href={result.googleMapsUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium text-accent"
                                >
                                  Maps
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="glass h-fit rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-bright">Runs</h2>
            <button
              type="button"
              onClick={() => leadFinderApi.recentRuns().then(setRecentRuns)}
              className="text-xs font-medium text-accent"
            >
              Neu laden
            </button>
          </div>

          {recentRuns.length === 0 ? (
            <p className="text-sm text-text-secondary">Noch keine Runs.</p>
          ) : (
            <div className="space-y-1">
              {recentRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => openRun(run.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                    currentRun?.id === run.id
                      ? "bg-accent/10 text-accent"
                      : "hover:bg-white/35"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-text-bright">{run.keyword}</span>
                    <span className="shrink-0 text-[11px] text-text-secondary">
                      {loadingRunId === run.id ? "..." : run.keptResults}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {run.city} · {statusLabel(run.status)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-chip rounded-xl px-3 py-2.5">
      <p className="text-lg font-bold text-text-bright">{value}</p>
      <p className="text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "PENDING":
      return "Wartet";
    case "RUNNING":
      return "Läuft";
    case "COMPLETED":
      return "Fertig";
    case "FAILED":
      return "Fehler";
    default:
      return status;
  }
}

function districtRank(district: string) {
  const match = district.match(/^(\d+)/);
  return match ? Number(match[1]) : 999;
}
