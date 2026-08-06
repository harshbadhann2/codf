export default function Spinner({ label = 'Working…' }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--text-main)]" role="status">
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-600 border-t-transparent dark:border-teal-300 dark:border-t-transparent"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
