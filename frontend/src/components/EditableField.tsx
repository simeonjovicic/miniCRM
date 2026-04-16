import { useState, useEffect, useRef } from "react";

interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

export default function EditableField({
  label,
  value,
  onChange,
  type = "text",
}: EditableFieldProps) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocal(value);
    }
  }, [value]);

  function handleChange(newValue: string) {
    setLocal(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => (isFocused.current = true)}
        onBlur={() => {
          isFocused.current = false;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          onChange(local);
        }}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-bright outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
      />
    </div>
  );
}
