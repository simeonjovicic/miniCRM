import { useEffect, useState, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { timeEntriesApi } from "../services/api";
import { subscribe } from "../services/websocket";
import type { TimeEntry, User } from "../types";

type Period = "week" | "month" | "all";

const USER_COLORS = [
  "#007AFF",
  "#30d158",
  "#ff9f0a",
  "#ff453a",
  "#bf5af2",
  "#64d2ff",
];

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function TimerPage({ user }: { user: User }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");
  const [filterUser, setFilterUser] = useState<string>("ALL");

  const reload = useCallback(() => {
    timeEntriesApi.list().then(setEntries);
  }, []);

  useEffect(() => {
    timeEntriesApi.list().then((e) => {
      setEntries(e);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const unsub = subscribe("/topic/time-entries", () => reload());
    return unsub;
  }, [reload]);

  // Only completed entries for history
  const completed = entries.filter((e) => e.stoppedAt !== null);

  // All unique users
  const allUsers = Array.from(
    new Map(completed.map((e) => [e.userId, e.username ?? e.userId])),
  );

  // Assign a stable color per user
  const userColor = (userId: string) => {
    const idx = allUsers.findIndex(([id]) => id === userId);
    return USER_COLORS[idx % USER_COLORS.length];
  };

  // Filter by selected user
  const filtered =
    filterUser === "ALL" ? completed : completed.filter((e) => e.userId === filterUser);

  // ── Summary stats ──────────────────────────────────────────
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = startOfDay(new Date(now.getTime() - 6 * 86400000)).getTime();
  const monthStart = startOfDay(
    new Date(now.getFullYear(), now.getMonth(), 1),
  ).getTime();

  function totalSeconds(entries: TimeEntry[], since: number): number {
    return entries
      .filter((e) => new Date(e.startedAt).getTime() >= since)
      .reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
  }

  const todaySecs = totalSeconds(filtered, todayStart);
  const weekSecs = totalSeconds(filtered, weekStart);
  const monthSecs = totalSeconds(filtered, monthStart);

  // ── Chart data ─────────────────────────────────────────────
  function buildChartData() {
    if (period === "week") {
      // Last 7 days, one bar per day, stacked by user
      const days: { date: string; label: string }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        days.push({ date: isoDate(d), label: d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric" }) });
      }
      return days.map(({ date, label }) => {
        const row: Record<string, string | number> = { date: label };
        allUsers.forEach(([uid, uname]) => {
          row[uname as string] = (filtered
            .filter((e) => isoDate(new Date(e.startedAt)) === date && e.userId === uid)
            .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)) / 3600;
        });
        return row;
      });
    }

    if (period === "month") {
      // Last 4 weeks, one bar per week
      const weeks: { label: string; start: number; end: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const end = new Date(now.getTime() - i * 7 * 86400000);
        const start = new Date(end.getTime() - 7 * 86400000);
        weeks.push({
          label: `KW ${getWeekNumber(end)}`,
          start: start.getTime(),
          end: end.getTime(),
        });
      }
      return weeks.map(({ label, start, end }) => {
        const row: Record<string, string | number> = { date: label };
        allUsers.forEach(([uid, uname]) => {
          row[uname as string] = (filtered
            .filter((e) => {
              const t = new Date(e.startedAt).getTime();
              return t >= start && t < end && e.userId === uid;
            })
            .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)) / 3600;
        });
        return row;
      });
    }

    // "all" — group by month
    const monthMap = new Map<string, Record<string, string | number>>();
    filtered.forEach((e) => {
      const d = new Date(e.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
      if (!monthMap.has(key)) {
        const row: Record<string, string | number> = { date: label };
        allUsers.forEach(([, uname]) => (row[uname as string] = 0));
        monthMap.set(key, row);
      }
      const row = monthMap.get(key)!;
      const uname = e.username ?? e.userId;
      row[uname] = ((row[uname] as number) ?? 0) + (e.durationSeconds ?? 0) / 3600;
    });
    return Array.from(monthMap.values()).sort((a, b) =>
      String(a.date) < String(b.date) ? -1 : 1,
    );
  }

  const chartData = buildChartData();

  // ── Group entries by day ───────────────────────────────────
  const periodFiltered = (() => {
    if (period === "week")
      return filtered.filter((e) => new Date(e.startedAt).getTime() >= weekStart);
    if (period === "month")
      return filtered.filter((e) => new Date(e.startedAt).getTime() >= monthStart);
    return filtered;
  })();

  const groupedByDay = periodFiltered.reduce<Map<string, TimeEntry[]>>(
    (map, entry) => {
      const key = isoDate(new Date(entry.startedAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
      return map;
    },
    new Map(),
  );
  const sortedDays = Array.from(groupedByDay.keys()).sort((a, b) =>
    a < b ? 1 : -1,
  );

  async function handleDelete(id: string) {
    await timeEntriesApi.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleUpdateDescription(id: string, description: string) {
    await timeEntriesApi.updateDescription(id, description);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, description } : e)),
    );
  }

  async function handleLinkTogether(id: string, targetId: string) {
    const updated = await timeEntriesApi.linkTogether(id, targetId);
    setEntries((prev) =>
      prev.map((e) => {
        const u = updated.find((u) => u.id === e.id);
        return u ? { ...e, sessionGroupId: u.sessionGroupId } : e;
      }),
    );
  }

  if (loading) return <p className="text-sm text-text-secondary">Lade Zeiten...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-bright">Zeiterfassung</h1>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Heute" value={formatDuration(todaySecs)} />
        <StatCard label="Diese Woche" value={formatDuration(weekSecs)} />
        <StatCard label="Dieser Monat" value={formatDuration(monthSecs)} />
      </div>

      {/* Period + user filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 glass-chip rounded-full p-1">
          {(["week", "month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                period === p
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-bright"
              }`}
            >
              {p === "week" ? "Woche" : p === "month" ? "Monat" : "Alles"}
            </button>
          ))}
        </div>

        {allUsers.length > 1 && (
          <>
            <span className="text-border">|</span>
            <button
              onClick={() => setFilterUser("ALL")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filterUser === "ALL"
                  ? "bg-accent text-white"
                  : "glass-chip text-text-secondary hover:text-text-bright"
              }`}
            >
              Alle
            </button>
            {allUsers.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setFilterUser(id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  filterUser === id
                    ? "bg-accent text-white"
                    : "glass-chip text-text-secondary hover:text-text-bright"
                }`}
              >
                {name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="mb-6 glass rounded-xl p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Stunden
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={allUsers.length > 1 ? 14 : 20}>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-text-secondary, #8e8e93)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-text-secondary, #8e8e93)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}h`}
                width={36}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${Number(value).toFixed(2)}h`,
                  String(name),
                ]}
                contentStyle={{
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  borderRadius: 10,
                  fontSize: 12,
                  backdropFilter: "blur(20px)",
                }}
                labelStyle={{ color: "var(--color-text-bright, #1a1a2e)" }}
              />
              {allUsers.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {allUsers.map(([uid, uname], i) => (
                <Bar
                  key={uid}
                  dataKey={uname as string}
                  stackId="a"
                  fill={USER_COLORS[i % USER_COLORS.length]}
                  radius={i === allUsers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entry history grouped by day */}
      {sortedDays.length === 0 ? (
        <p className="text-sm text-text-secondary">Keine Einträge im gewählten Zeitraum.</p>
      ) : (
        <div className="space-y-6">
          {sortedDays.map((day) => {
            const dayEntries = groupedByDay.get(day)!;
            const dayTotal = dayEntries.reduce(
              (s, e) => s + (e.durationSeconds ?? 0),
              0,
            );
            return (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-bright">
                    {formatDateLabel(day)}
                  </span>
                  <span className="text-xs font-medium text-text-secondary">
                    {formatDuration(dayTotal)} gesamt
                  </span>
                </div>
                <ul className="space-y-1">
                  {dayEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      color={userColor(entry.userId)}
                      showUser={allUsers.length > 1}
                      isOwner={entry.userId === user.id}
                      siblingEntries={dayEntries.filter((e) => e.id !== entry.id && e.userId !== entry.userId)}
                      onDelete={() => handleDelete(entry.id)}
                      onUpdateDescription={(d) =>
                        handleUpdateDescription(entry.id, d)
                      }
                      onLinkTogether={(targetId) => handleLinkTogether(entry.id, targetId)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-3 sm:p-4">
      <p className="mb-1 text-[10px] text-text-secondary sm:text-xs">{label}</p>
      <p className="text-lg font-bold tabular-nums text-text-bright sm:text-2xl">{value}</p>
    </div>
  );
}

function EntryRow({
  entry,
  color,
  showUser,
  isOwner,
  siblingEntries,
  onDelete,
  onUpdateDescription,
  onLinkTogether,
}: {
  entry: TimeEntry;
  color: string;
  showUser: boolean;
  isOwner: boolean;
  siblingEntries: TimeEntry[];
  onDelete: () => void;
  onUpdateDescription: (desc: string) => void;
  onLinkTogether: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description ?? "");
  const [linkOpen, setLinkOpen] = useState(false);
  const linkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkOpen) return;
    function handleClick(e: MouseEvent) {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) {
        setLinkOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [linkOpen]);

  function handleBlur() {
    setEditing(false);
    onUpdateDescription(desc);
  }

  const isGrouped = !!entry.sessionGroupId;
  const linkableEntries = siblingEntries.filter(
    (e) => !e.sessionGroupId || e.sessionGroupId !== entry.sessionGroupId,
  );

  return (
    <li className="group relative flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/40 transition-colors sm:gap-3 sm:px-4">
      {/* User color bar + together indicator */}
      <div className="relative shrink-0">
        <span className="block h-8 w-1 rounded-full" style={{ background: color }} />
        {isGrouped && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-accent">
            <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </span>
        )}
      </div>

      {/* Mobile: stacked time+duration, Desktop: side by side */}
      <div className="shrink-0 sm:flex sm:items-center sm:gap-3">
        <span className="block font-mono text-[11px] text-text-secondary sm:w-28">
          {formatTime(entry.startedAt)}
          {entry.stoppedAt && ` – ${formatTime(entry.stoppedAt)}`}
        </span>
        <span className="block text-xs font-semibold text-text-bright tabular-nums sm:w-14">
          {entry.durationSeconds ? formatDuration(entry.durationSeconds) : "—"}
        </span>
      </div>

      {/* Description (editable) */}
      <div className="min-w-0 flex-1">
        {editing && isOwner ? (
          <input
            autoFocus
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === "Enter" && handleBlur()}
            className="glass-input w-full rounded-md px-2 py-1 text-sm text-text-bright outline-none"
          />
        ) : (
          <button
            onClick={() => isOwner && setEditing(true)}
            className={`text-left text-sm truncate max-w-full ${
              desc ? "text-text-bright" : "text-text-secondary italic"
            } ${isOwner ? "hover:text-accent" : ""}`}
          >
            {desc || "Keine Beschreibung"}
          </button>
        )}
      </div>

      {/* User badge (multi-user mode) */}
      {showUser && (
        <span
          className="hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white sm:inline"
          style={{ background: color }}
        >
          {entry.username ?? "?"}
        </span>
      )}

      {/* Link together button */}
      {isOwner && linkableEntries.length > 0 && (
        <div ref={linkRef} className="relative shrink-0">
          <button
            onClick={() => setLinkOpen((v) => !v)}
            title="Mit Eintrag verknüpfen"
            className={`opacity-0 group-hover:opacity-100 transition-all flex h-7 w-7 items-center justify-center rounded-full ${
              isGrouped
                ? "text-accent hover:bg-accent/10"
                : "text-text-secondary hover:text-accent hover:bg-accent/10"
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="3" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
            </svg>
          </button>

          {linkOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 glass-strong rounded-xl p-2 shadow-xl min-w-45 z-10">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Verknüpfen mit
              </p>
              {linkableEntries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    onLinkTogether(e.id);
                    setLinkOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/50 transition-colors"
                >
                  <span className="text-xs font-medium text-text-bright">{e.username ?? "?"}</span>
                  <span className="text-[11px] text-text-secondary font-mono">
                    {formatDuration(e.durationSeconds ?? 0)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      {isOwner && (
        <button
          onClick={onDelete}
          className="shrink-0 text-text-secondary opacity-100 sm:opacity-0 transition-all group-hover:opacity-100 hover:text-[#ff453a]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </li>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
