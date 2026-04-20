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

/* ── Mobile bottom tab bar items (max 5 for iOS feel) ── */
const MOBILE_TABS = [
  {
    to: "/",
    label: "Home",
    end: true,
    icon: (
      <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: "/customers",
    label: "Kunden",
    icon: (
      <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    to: "/todos",
    label: "Todos",
    icon: (
      <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: "/analytics",
    label: "Analyse",
    match: ["/analytics", "/finance", "/timer"],
    icon: (
      <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    to: "/more",
    label: "Mehr",
    match: ["/vorlagen", "/storage"],
    icon: (
      <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
  },
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

/* ── Mobile "Mehr" bottom sheet ── */
function MobileMoreSheet({
  open,
  onClose,
  user,
  onLogout,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
  onSearch: () => void;
}) {
  const location = useLocation();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // Close on route change
  useEffect(() => { onClose(); }, [location.pathname]);

  if (!open) return null;

  const MORE_LINKS = [
    { to: "/analytics", label: "Übersicht", icon: "📊" },
    { to: "/finance", label: "Finanzen", icon: "💰" },
    { to: "/timer", label: "Zeiten", icon: "⏱" },
    { to: "/vorlagen", label: "Vorlagen", icon: "✉️" },
    { to: "/storage", label: "Storage", icon: "📁" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[91] glass-strong rounded-t-3xl pb-safe"
        style={{ animation: "slide-up 0.3s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-text-secondary/30" />
        </div>

        {/* User header */}
        <div className="flex items-center justify-between px-6 pb-4 border-b border-white/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-bright">{user.username}</p>
              <SyncStatusBadge />
            </div>
          </div>
          <button
            onClick={() => { onClose(); onLogout(); }}
            className="rounded-xl px-3 py-1.5 text-[13px] text-text-secondary hover:text-text-bright transition-all"
          >
            Logout
          </button>
        </div>

        {/* Search shortcut */}
        <button
          onClick={() => { onClose(); onSearch(); }}
          className="flex w-full items-center gap-3 px-6 py-3.5 text-left border-b border-white/30"
        >
          <svg className="h-5 w-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-sm text-text-bright">Suchen...</span>
        </button>

        {/* Navigation links */}
        <div className="px-4 py-3 space-y-0.5">
          {MORE_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-bright active:bg-white/40"
                }`
              }
            >
              <span className="text-lg">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="h-2" />
      </div>
    </>
  );
}

/* ── Mobile bottom tab bar ── */
function MobileTabBar({ onMoreTap }: { onMoreTap: () => void }) {
  const location = useLocation();

  return (
    <nav className="mobile-tab-bar fixed bottom-0 left-0 right-0 z-50 glass-nav border-t border-white/30 pb-safe md:hidden">
      <div className="flex items-stretch justify-around">
        {MOBILE_TABS.map((tab) => {
          if (tab.to === "/more") {
            const isActive = tab.match?.some(
              (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
            );
            return (
              <button
                key="more"
                onClick={onMoreTap}
                className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 transition-colors ${
                  isActive ? "text-accent" : "text-text-secondary"
                }`}
              >
                {tab.icon}
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          }

          const isActive = tab.match
            ? tab.match.some(
                (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
              )
            : tab.end
              ? location.pathname === tab.to
              : location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 transition-colors ${
                isActive ? "text-accent" : "text-text-secondary"
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
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
  const [moreOpen, setMoreOpen] = useState(false);
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
    <div className="min-h-svh pb-16 md:pb-0">
      {/* Floating glass nav — desktop only */}
      <div className="sticky top-0 z-50 px-4 pt-3 pb-1 pointer-events-none hidden md:block">
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

      {/* Mobile top bar — minimal, just logo + search */}
      <div className="sticky top-0 z-50 px-4 pt-2 pb-1 md:hidden">
        <div className="glass-nav flex items-center justify-between rounded-2xl px-4 py-2">
          <NavLink to="/" className="text-[15px] font-bold tracking-tight text-text-bright">
            MiniCRM
          </NavLink>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full glass-chip text-text-secondary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>

      <TimerWidget />

      <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">
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

      {/* Mobile bottom tab bar */}
      <MobileTabBar onMoreTap={() => setMoreOpen(true)} />

      {/* Mobile "Mehr" sheet */}
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        user={user}
        onLogout={onLogout}
        onSearch={() => setSearchOpen(true)}
      />

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
