export default function Spinner({ label = 'Working…' }) {
  return (
    <div className="flex items-center gap-3 text-sm" role="status">
      <span className="spinner h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-[var(--ink)]">{label}</span>
    </div>
  );
}
