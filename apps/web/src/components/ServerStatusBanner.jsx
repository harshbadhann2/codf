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
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm dark:bg-slate-900/50">
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent dark:border-teal-300 dark:border-t-transparent"
          aria-hidden="true"
        />
        <span className="text-[var(--text-muted)]">Connecting to the conversion server…</span>
      </div>
    );
  }

  if (status === 'waking') {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
        <div className="flex items-center gap-3">
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent dark:border-amber-300 dark:border-t-transparent"
            aria-hidden="true"
          />
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Waking the server up… (attempt {attempt})
          </p>
        </div>
        <p className="mt-1.5 pl-6 text-xs text-amber-800 dark:text-amber-200/80">
          The free server sleeps when it is not in use. First load can take up to a minute — you can start filling in
          the form while you wait.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-500/40 dark:bg-red-950/30">
      <p className="font-semibold text-red-900 dark:text-red-100">Cannot reach the conversion server</p>
      <p className="mt-1 text-xs text-red-800 dark:text-red-200/80">{error || 'The server did not respond.'}</p>

      <p className="mt-2 break-all text-xs text-red-700/80 dark:text-red-200/60">
        API: <code className="font-mono">{API_BASE_URL}</code>
        {!IS_CROSS_ORIGIN && ' (same origin — is the local API running?)'}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="focus-ring mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
