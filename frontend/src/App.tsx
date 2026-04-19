import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import type { User } from "./types";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CustomerListPage from "./pages/CustomerListPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import FinancePage from "./pages/FinancePage";
import TodosPage from "./pages/TodosPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import VorlagenPage from "./pages/VorlagenPage";
import TimerPage from "./pages/TimerPage";
import StoragePage from "./pages/StoragePage";
import SyncStatusBadge from "./components/SyncStatusBadge";
import TimerWidget from "./components/TimerWidget";
import { ToastProvider, useToast } from "./components/Toast";
import SearchModal from "./components/SearchModal";
import { connect, subscribe } from "./services/websocket";
import { TimerProvider } from "./context/TimerContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/customers", label: "Kunden" },
  { to: "/todos", label: "Todos" },
  {
    label: "Analyse",
    children: [
      { to: "/analytics", label: "Übersicht" },
      { to: "/finance", label: "Finanzen" },
      { to: "/timer", label: "Zeiten" },
    ],
  },
  { to: "/vorlagen", label: "Vorlagen" },
  { to: "/storage", label: "Storage" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
    isActive
      ? "bg-accent text-white shadow-sm"
      : "text-text-secondary hover:bg-border/50 hover:text-text-bright"
  }`;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  const connectedUserRef = useRef<string | null>(null);
  if (user && connectedUserRef.current !== user.id) {
    connect({ userId: user.id, username: user.username });
    connectedUserRef.current = user.id;
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage onLogin={setUser} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <TimerProvider user={user}>
          <AppShell user={user} onLogout={() => setUser(null)} />
        </TimerProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function AnalyseDropdown({
  item,
}: {
  item: { label: string; children: { to: string; label: string }[] };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isChildActive = item.children.some(
    (c) => location.pathname === c.to || location.pathname.startsWith(c.to + "/"),
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all flex items-center gap-1 ${
          isChildActive
            ? "bg-accent text-white shadow-sm"
            : "text-text-secondary hover:bg-border/50 hover:text-text-bright"
        }`}
      >
        {item.label}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 min-w-[140px] glass-strong rounded-xl p-1">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={close}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:bg-border/50 hover:text-text-bright"
                }`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function AppShell({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { show } = useToast();
  const location = useLocation();

  // Cmd+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // WebSocket toast subscriptions
  useEffect(() => {
    const unsubs = [
      subscribe("/topic/customers", (data: unknown) => {
        const msg = data as { type?: string; customerName?: string };
        if (msg.type === "CUSTOMER_CREATED") {
          show(
            msg.customerName
              ? `Neuer Kunde: ${msg.customerName}`
              : "Neuer Kunde erstellt",
          );
        } else if (msg.type === "CUSTOMER_DELETED") {
          show("Kunde wurde gelöscht", "warning");
        } else {
          show("Kundendaten aktualisiert");
        }
      }),
      subscribe("/topic/todos", () => {
        show("Todo aktualisiert");
      }),
      subscribe("/topic/finance", () => {
        show("Finanzdaten aktualisiert");
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [show]);

  return (
    <div className="min-h-svh">
      {/* Floating glass nav */}
      <div className="sticky top-0 z-50 px-4 pt-3 pb-1 pointer-events-none">
        <nav className="glass-nav pointer-events-auto mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-2.5">
          {/* Logo + Tabs */}
          <div className="flex items-center gap-5">
            <NavLink
              to="/"
              className="text-[15px] font-bold tracking-tight text-text-bright"
            >
              MiniCRM
            </NavLink>
            <div className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) =>
                "children" in item && item.children ? (
                  <AnalyseDropdown key={item.label} item={item as { label: string; children: { to: string; label: string }[] }} />
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navClass}
                  >
                    {item.label}
                  </NavLink>
                ),
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 glass-chip rounded-full px-3 py-1.5 text-[13px] text-text-secondary transition-all hover:text-text-bright"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </button>

            <SyncStatusBadge />

            <div className="flex items-center gap-2 glass-chip rounded-full px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow-sm shadow-accent/30">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-[13px] font-medium text-text-bright">{user.username}</span>
            </div>

            <button
              onClick={onLogout}
              className="rounded-full px-3 py-1.5 text-[13px] text-text-secondary hover:text-text-bright transition-all"
            >
              Logout
            </button>
          </div>
        </nav>
      </div>

      <TimerWidget />

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div key={location.pathname} className="page-enter">
          <Routes>
            <Route path="/" element={<DashboardPage user={user} />} />
            <Route
              path="/customers"
              element={<CustomerListPage user={user} />}
            />
            <Route
              path="/customers/:id"
              element={<CustomerDetailPage userId={user.id} />}
            />
            <Route path="/todos" element={<TodosPage user={user} />} />
            <Route path="/finance" element={<FinancePage user={user} />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/vorlagen" element={<VorlagenPage />} />
            <Route path="/timer" element={<TimerPage user={user} />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
