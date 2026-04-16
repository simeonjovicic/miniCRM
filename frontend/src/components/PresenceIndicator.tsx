import { useEffect, useState } from "react";
import { subscribe, sendPresence } from "../services/websocket";

interface PresenceUser {
  userId: string;
  username: string;
}

const COLORS = [
  "bg-[#007aff]",
  "bg-[#af52de]",
  "bg-[#ff9f0a]",
  "bg-[#ff453a]",
  "bg-[#30d158]",
  "bg-[#5ac8fa]",
  "bg-[#ff2d55]",
  "bg-[#5856d6]",
];

function getColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(username: string) {
  return username
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PresenceIndicator({
  customerId,
  currentUserId,
}: {
  customerId: string;
  currentUserId: string;
}) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    sendPresence("viewing", customerId);

    const unsub = subscribe(
      `/topic/presence/customers/${customerId}`,
      (data) => setViewers(data as PresenceUser[]),
    );

    return () => {
      sendPresence("leaving", customerId);
      unsub();
    };
  }, [customerId]);

  const others = viewers.filter((v) => v.userId !== currentUserId);

  if (others.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-xs text-text-secondary">Auch hier:</span>
      {others.map((v) => (
        <div
          key={v.userId}
          title={v.username}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${getColor(v.userId)}`}
        >
          {initials(v.username)}
        </div>
      ))}
    </div>
  );
}
