import { useEffect, useState, useRef, useCallback } from "react";
import { aiApi, customersApi } from "../services/api";
import { subscribe } from "../services/websocket";
import type { Customer } from "../types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TONES = [
  { value: "freundlich", label: "Freundlich" },
  { value: "formal", label: "Formal" },
  { value: "locker", label: "Locker" },
  { value: "kurz", label: "Kurz & knapp" },
];

const TEMPLATES = [
  {
    id: "1",
    name: "Erstgespräch",
    subject: "Schön, Sie kennenzulernen!",
    body: `Hallo {name},

vielen Dank für das nette Gespräch heute. Wie besprochen sende ich Ihnen hier eine kurze Zusammenfassung unserer Leistungen.

Gerne können wir in der kommenden Woche einen Folgetermin vereinbaren.

Mit freundlichen Grüßen`,
    category: "Akquise",
  },
  {
    id: "2",
    name: "Angebot nachfassen",
    subject: "Unser Angebot — noch Fragen?",
    body: `Hallo {name},

ich wollte kurz nachfragen, ob Sie unser Angebot vom {datum} erhalten haben und ob es noch offene Fragen gibt.

Ich stehe Ihnen jederzeit gerne zur Verfügung.

Beste Grüße`,
    category: "Akquise",
  },
  {
    id: "3",
    name: "Willkommen als Kunde",
    subject: "Willkommen bei uns!",
    body: `Hallo {name},

herzlich willkommen! Wir freuen uns sehr, Sie als Kunden begrüßen zu dürfen.

Ihr persönlicher Ansprechpartner ist ab sofort für Sie da. Bei Fragen erreichen Sie uns jederzeit.

Mit freundlichen Grüßen`,
    category: "Onboarding",
  },
  {
    id: "4",
    name: "Feedback anfragen",
    subject: "Wie zufrieden sind Sie?",
    body: `Hallo {name},

Sie sind nun seit einiger Zeit unser Kunde und wir würden uns freuen, von Ihnen zu hören.

Wie zufrieden sind Sie mit unserer Zusammenarbeit? Gibt es Bereiche, in denen wir uns verbessern können?

Vielen Dank für Ihr Feedback!

Beste Grüße`,
    category: "Betreuung",
  },
  {
    id: "5",
    name: "Terminbestätigung",
    subject: "Terminbestätigung — {datum}",
    body: `Hallo {name},

hiermit bestätige ich unseren Termin am {datum} um {uhrzeit}.

Sollte sich etwas ändern, geben Sie mir bitte kurz Bescheid.

Bis dann!

Beste Grüße`,
    category: "Organisation",
  },
  {
    id: "6",
    name: "Rechnung überfällig",
    subject: "Zahlungserinnerung — Rechnung {nummer}",
    body: `Hallo {name},

leider konnten wir bis heute keinen Zahlungseingang für die Rechnung {nummer} vom {datum} feststellen.

Wir bitten Sie, den offenen Betrag in Höhe von {betrag} innerhalb der nächsten 7 Tage zu überweisen.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen`,
    category: "Buchhaltung",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Akquise: "bg-[#007aff]/10 text-[#007aff]",
  Onboarding: "bg-[#30d158]/10 text-[#1fa03f]",
  Betreuung: "bg-[#af52de]/10 text-[#af52de]",
  Organisation: "bg-[#ff9f0a]/10 text-[#c77d08]",
  Buchhaltung: "bg-[#ff453a]/10 text-[#cc372e]",
};

export default function VorlagenPage() {
  const [tab, setTab] = useState<"vorlagen" | "ai">("ai");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-bright">Mail-Vorlagen</h1>
        <div className="flex items-center gap-1 rounded-full bg-bg p-1">
          <button
            onClick={() => setTab("ai")}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              tab === "ai"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-bright"
            }`}
          >
            KI-Assistent
          </button>
          <button
            onClick={() => setTab("vorlagen")}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              tab === "vorlagen"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-bright"
            }`}
          >
            Vorlagen
          </button>
        </div>
      </div>

      {tab === "ai" ? <AiChat /> : <TemplateList />}
    </div>
  );
}

function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [tone, setTone] = useState("freundlich");
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customersApi.list().then(setCustomers);
  }, []);

  useEffect(() => {
    const unsub = subscribe("/topic/customers", () => {
      customersApi.list().then(setCustomers);
    });
    return unsub;
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);

      const cursor = e.target.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");

      if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " " || val[atIdx - 1] === "\n")) {
        const query = before.slice(atIdx + 1).toLowerCase();
        const matches = customers.filter((c) =>
          c.name.toLowerCase().includes(query),
        );
        if (matches.length > 0 && query.length > 0) {
          setSuggestions(matches.slice(0, 5));
          setSelectedIdx(0);
          setMentionStart(atIdx);
          return;
        }
      }

      setSuggestions([]);
      setMentionStart(null);
    },
    [customers],
  );

  function insertMention(customer: Customer) {
    if (mentionStart === null) return;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionStart);
    const after = input.slice(cursor);
    setInput(`${before}${customer.name} ${after}`);
    setSuggestions([]);
    setMentionStart(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[selectedIdx]);
        return;
      } else if (e.key === "Enter" && suggestions.length > 0) {
        e.preventDefault();
        insertMention(suggestions[selectedIdx]);
        return;
      } else if (e.key === "Escape") {
        setSuggestions([]);
        setMentionStart(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSuggestions([]);
    setMentionStart(null);
    setLoading(true);

    try {
      const history = newMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await aiApi.generateEmail(userMsg.content, tone, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.content },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Fehler bei der Verbindung zur KI. Bitte versuche es erneut.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function useTemplate(template: typeof TEMPLATES[number]) {
    setInput(
      `Schreibe eine "${template.name}"-Mail. Betreff: "${template.subject}". Orientiere dich an dieser Vorlage:\n\n${template.body}`,
    );
    inputRef.current?.focus();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Sidebar — Quick templates + tone */}
      <div className="space-y-4 lg:col-span-1">
        {/* Tone selector */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Ton
          </h3>
          <div className="space-y-1">
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-all ${
                  tone === t.value
                    ? "bg-accent text-white font-medium"
                    : "text-text-bright hover:bg-bg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick templates */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Schnellvorlagen
          </h3>
          <div className="space-y-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => useTemplate(t)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-text-bright transition-all hover:bg-bg"
              >
                <span>{t.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    CATEGORY_COLORS[t.category] ?? "bg-bg text-text-secondary"
                  }`}
                >
                  {t.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col lg:col-span-3">
        <div className="flex min-h-[500px] flex-col rounded-2xl border border-border bg-card shadow-sm">
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
                  <svg
                    className="h-6 w-6 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-bright">
                  KI Mail-Assistent
                </p>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  Schreibe z.B. "Followup-Mail für Jenny Cai" — der Assistent
                  kennt deine Kunden, Todos und Vorlagen. Nutze @ für
                  Kundenerwähnungen.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-accent text-white"
                          : "border border-border bg-bg text-text-bright"
                      }`}
                    >
                      <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                        {msg.content}
                      </pre>
                      {msg.role === "assistant" && (
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(msg.content)
                          }
                          className="mt-2 text-[11px] text-text-secondary hover:text-accent transition-colors"
                        >
                          Kopieren
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-border bg-bg px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="relative border-t border-border p-4">
            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {suggestions.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => insertMention(c)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      i === selectedIdx
                        ? "bg-accent/10 text-accent"
                        : "text-text-bright hover:bg-bg"
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                      {c.name[0].toUpperCase()}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    {c.company && (
                      <span className="text-xs text-text-secondary">
                        {c.company}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2 rounded-full bg-bg px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    tone === "formal"
                      ? "bg-[#5856d6]"
                      : tone === "freundlich"
                        ? "bg-[#30d158]"
                        : tone === "locker"
                          ? "bg-[#ff9f0a]"
                          : "bg-[#ff453a]"
                  }`}
                />
                {TONES.find((t) => t.value === tone)?.label}
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Schreibe Followup für @Kundenname..."
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text-bright outline-none placeholder:text-text-secondary focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-all hover:bg-accent-dim active:scale-[0.95] disabled:opacity-40"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateList() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {TEMPLATES.map((t) => (
        <div
          key={t.id}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
        >
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-bright">
                {t.name}
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Betreff: {t.subject}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                CATEGORY_COLORS[t.category] ?? "bg-bg text-text-secondary"
              }`}
            >
              {t.category}
            </span>
          </div>

          <pre className="whitespace-pre-wrap rounded-xl bg-bg p-4 font-sans text-xs leading-relaxed text-text-secondary">
            {t.body}
          </pre>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(t.body.match(/\{(\w+)\}/g) ?? [])
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((placeholder) => (
                <span
                  key={placeholder}
                  className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-medium text-accent"
                >
                  {placeholder}
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
