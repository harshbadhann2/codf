import { API_BASE_URL, IS_CROSS_ORIGIN } from '../api/client';

/**
 * Explains what the server is doing before the user hits a wall.
 *
 * The free Render instance sleeps, so a first-load delay is normal rather than
 * broken — saying so is the difference between "waiting" and "this is dead".
 */
export default function ServerStatusBanner({ status, attempt, error, onRetry }) {
  if (status === 'online') return null;

  if (status === 'checking') {
    return (
      <div className="animate-fade flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.6)] px-4 py-2.5 text-sm backdrop-blur">
        <span className="spinner h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[var(--ink-muted)]">Connecting to the conversion server…</span>
      </div>
    );
  }

  if (status === 'waking') {
    return (
      <div className="animate-pop rounded-[var(--radius-md)] border border-amber-500/35 bg-amber-500/10 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span
            className="spinner h-3.5 w-3.5 border-amber-500"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Waking the server up… (attempt {attempt})
          </p>
        </div>
        <p className="mt-1.5 pl-6 text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/70">
          The free server sleeps when idle. First load can take up to a minute — you can start filling in the form
          while you wait.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-pop rounded-[var(--radius-md)] border border-red-500/35 bg-red-500/10 px-4 py-3 backdrop-blur">
      <p className="text-sm font-semibold text-red-700 dark:text-red-200">Cannot reach the conversion server</p>
      <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/70">{error || 'The server did not respond.'}</p>

      <p className="mt-2 break-all font-mono text-[11px] text-red-700/60 dark:text-red-200/50">
        {API_BASE_URL}
        {!IS_CROSS_ORIGIN && ' (same origin — is the local API running?)'}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="focus-ring mt-3 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}
