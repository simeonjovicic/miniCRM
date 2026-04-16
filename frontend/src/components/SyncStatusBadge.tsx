import { useState, useEffect } from "react";
import { onConnectionChange, getOfflineQueueSize } from "../services/websocket";

export default function SyncStatusBadge() {
  const [connected, setConnected] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    const unsub = onConnectionChange((c) => {
      setConnected(c);
      setQueueSize(getOfflineQueueSize());
    });
    const interval = setInterval(() => {
      setQueueSize(getOfflineQueueSize());
    }, 1000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  if (connected && queueSize === 0) {
    return (
      <div className="flex items-center gap-1.5" title="Verbunden">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#30d158]" />
        </span>
        <span className="text-xs text-text-secondary">Sync</span>
      </div>
    );
  }

  if (connected && queueSize > 0) {
    return (
      <div className="flex items-center gap-1.5" title={`${queueSize} werden synchronisiert`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff9f0a] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff9f0a]" />
        </span>
        <span className="text-xs text-text-secondary">{queueSize}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" title={`Offline${queueSize > 0 ? ` — ${queueSize} in Warteschlange` : ""}`}>
      <span className="inline-flex h-2 w-2 rounded-full bg-[#ff453a]" />
      <span className="text-xs text-[#ff453a]">Offline{queueSize > 0 && ` (${queueSize})`}</span>
    </div>
  );
}
