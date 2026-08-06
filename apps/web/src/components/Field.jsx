import { useId } from 'react';

const CONTROL_CLASS =
  'w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm text-[var(--text-main)] transition focus-ring disabled:opacity-50 dark:bg-slate-900/50';

export function TextField({ label, hint, value, onChange, ...props }) {
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, value, onChange, options, ...props }) {
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value || 'auto'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children, disabled, busy }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
