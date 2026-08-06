import { useId, useRef, useState } from 'react';
import { formatBytes } from '../lib/files';

export default function Dropzone({ accept, file, onFileSelect, onClear, helpText, disabled = false }) {
  const inputRef = useRef(null);
  const inputId = useId();
  const [isDragOver, setIsDragOver] = useState(false);

  function handleSelect(event) {
    const selected = event.target.files?.[0];
    if (selected) onFileSelect(selected);
    // Reset so re-picking the same file still fires onChange.
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFileSelect(dropped);
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  const borderStyle = isDragOver
    ? 'border-teal-500 bg-teal-50/70 dark:border-teal-400 dark:bg-teal-950/30'
    : 'border-[var(--line)] bg-white/60 hover:border-teal-400 dark:bg-slate-900/40';

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${inputId}-help`}
        className={`focus-ring rounded-2xl border-2 border-dashed p-6 text-center transition ${borderStyle} ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          onChange={handleSelect}
          disabled={disabled}
        />

        <svg
          className="mx-auto h-8 w-8 text-teal-600 dark:text-teal-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>

        <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">
          Drop a file here, or <span className="text-teal-700 underline dark:text-teal-300">browse</span>
        </p>
        <p id={`${inputId}-help`} className="mt-1 text-xs text-[var(--text-muted)]">
          {helpText}
        </p>
      </div>

      {file && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 dark:bg-slate-900/50">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-teal-800 dark:text-teal-300" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{formatBytes(file.size)}</p>
          </div>

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
