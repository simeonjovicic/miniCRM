import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "success" | "warning";
  exiting?: boolean;
}

interface ToastContextValue {
  show: (message: string, type?: ToastItem["type"]) => void;
  /** Set true to suppress toasts briefly (e.g. after own action) */
  mute: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
  mute: () => {},
});

export const useToast = () => useContext(ToastContext);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const mutedUntil = useRef(0);

  const show = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      if (Date.now() < mutedUntil.current) return;
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      // Start exit animation after 3s
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
        );
      }, 3000);
      // Remove after animation
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3300);
    },
    [],
  );

  const mute = useCallback(() => {
    mutedUntil.current = Date.now() + 2000;
  }, []);

  return (
    <ToastContext.Provider value={{ show, mute }}>
      {children}
      <div className="fixed right-5 top-16 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass-strong flex items-center gap-2.5 rounded-xl px-4 py-2.5 transition-all duration-300 ${
              t.exiting
                ? "translate-x-[120%] opacity-0"
                : "translate-x-0 opacity-100"
            } ${
              t.type === "success"
                ? "border-status-customer/30! bg-status-customer/12! text-[#1a8f3e]"
                : t.type === "warning"
                  ? "border-status-lead/30! bg-status-lead/12! text-[#c77d08]"
                  : "text-text-bright"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                t.type === "success"
                  ? "bg-[#30d158]"
                  : t.type === "warning"
                    ? "bg-[#ff9f0a]"
                    : "bg-accent"
              }`}
            />
            <span className="text-[13px] font-medium">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook that subscribes to WebSocket topics and shows toasts for changes.
 * Call mute() before performing own actions to suppress own-change toasts.
 */
export function useWebSocketToasts() {
  const { show, mute } = useToast();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return { show, mute };
}
