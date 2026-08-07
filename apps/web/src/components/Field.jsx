import { useId } from 'react';

export function TextField({ label, hint, value, onChange, ...props }) {
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field focus-ring"
        {...props}
      />
      {hint && <p className="mt-1.5 text-xs text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}

export function NumberField({ label, hint, value, onChange, error, optional, ...props }) {
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal text-[var(--ink-faint)]">optional</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field focus-ring"
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, value, onChange, options, ...props }) {
  const id = useId();

  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field focus-ring"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value || 'auto'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children, disabled, busy }) {
  return (
    <button type="submit" disabled={disabled} className="btn-primary focus-ring w-full sm:w-auto">
      {busy && <span className="spinner h-3.5 w-3.5 border-white" />}
      {children}
    </button>
  );
}

/** Pill toggle used where two modes sit side by side. */
export function ModeToggle({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            disabled={option.disabled}
            title={option.title}
            className={`focus-ring rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              selected
                ? 'border-transparent bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow-[var(--shadow-glow)]'
                : 'border-[var(--line)] bg-[rgb(var(--surface)/0.5)] text-[var(--ink-muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
            } ${option.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
          >
            {option.label}
            {option.disabled && <span className="ml-1.5 text-xs font-normal">(unavailable)</span>}
          </button>
        );
      })}
    </div>
  );
}
