export default function ProgressBar({ value = 0, label = 'Uploading' }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const isComplete = clamped >= 100;

  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-teal-600 transition-[width] duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>

      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        {/* Once the bytes are up, the wait is server-side work, not upload. */}
        {isComplete ? 'Uploaded — converting on the server…' : `${label}: ${clamped}%`}
      </p>
    </div>
  );
}
