/**
 * Herausgelöst aus frontend/src/services/api.ts.
 * Zum Reaktivieren: aiApi zurück nach services/api.ts kopieren.
 *
 * Hinweis: request() ist in api.ts modul-lokal (nicht exportiert) — beim
 * Reaktivieren den Code einfach direkt in api.ts einfügen statt zu importieren.
 */
import type { request } from "../../../frontend/src/services/api";

/** AI API — KI-E-Mail-Assistent (Groq / Llama 3.3 70B) */
export const aiApi = {
  /**
   * Generiert eine E-Mail mit KI.
   * Sendet die User-Nachricht, den gewünschten Ton und den bisherigen Chatverlauf.
   * Das Backend reichert den Prompt automatisch mit CRM-Kontext an
   * (erwähnte Kunden, Todos, Finanzeinträge).
   */
  generateEmail: (
    message: string,
    tone: string,
    history: { role: string; content: string }[],
  ) =>
    request<{ content: string }>("/ai/generate-email", {
      method: "POST",
      body: JSON.stringify({ message, tone, history }),
    }),
};
