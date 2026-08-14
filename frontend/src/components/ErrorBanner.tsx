/**
 * Einheitlicher Hinweis, wenn etwas nicht geladen oder gespeichert werden
 * konnte.
 *
 * Gibt es, weil mehrere Seiten Ladefehler stillschweigend verschluckt haben:
 * war das Backend weg, blieb die Seite einfach leer stehen und man rätselte,
 * ob es wirklich nichts gibt oder etwas kaputt ist.
 */
export default function ErrorBanner({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-status-churned/10 px-4 py-3 text-sm text-status-churned"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-status-churned/15 px-3 py-1 text-xs font-semibold transition-colors hover:bg-status-churned/25"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
