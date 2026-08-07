export default function ProgressBar({ value = 0, label = 'Uploading' }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const isComplete = clamped >= 100;

  return (
    <div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line-strong)]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-[var(--ink-faint)]">
        {/* Once the bytes are up, the wait is server-side work, not upload. */}
        {isComplete ? 'Uploaded — converting on the server…' : `${label} · ${clamped}%`}
      </p>
    </div>
  );
}
