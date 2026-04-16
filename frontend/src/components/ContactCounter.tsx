interface ContactCounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export default function ContactCounter({
  label,
  value,
  onIncrement,
  onDecrement,
}: ContactCounterProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-3">
        <button
          onClick={onDecrement}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-medium text-text hover:bg-bg active:scale-95 transition-all"
        >
          -
        </button>
        <span className="min-w-[3ch] text-center font-mono text-xl font-semibold text-text-bright">
          {value}
        </span>
        <button
          onClick={onIncrement}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-medium text-text hover:bg-bg active:scale-95 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}
