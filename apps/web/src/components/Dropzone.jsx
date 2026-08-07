import { useId, useRef, useState } from 'react';
import { formatBytes } from '../lib/files';
import { UploadIcon } from './Icons';

export default function Dropzone({ accept, file, onFileSelect, onClear, helpText, disabled = false }) {
  const inputRef = useRef(null);
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);

  function handleSelect(event) {
    const selected = event.target.files?.[0];
    if (selected) onFileSelect(selected);
    // Reset so re-picking the same file still fires onChange.
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsOver(false);
    if (disabled) return;

    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFileSelect(dropped);
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
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
        className={`dropzone focus-ring group px-5 py-7 text-center ${isOver ? 'is-over' : ''} ${
          disabled ? 'is-disabled' : 'cursor-pointer'
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

        <span
          className={`mx-auto grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[rgb(var(--surface)/0.7)] text-[var(--accent)] transition-transform duration-300 ${
            isOver ? 'scale-110' : 'group-hover:scale-105'
          }`}
        >
          <UploadIcon width={19} height={19} />
        </span>

        <p className="mt-3 text-sm font-semibold">
          {isOver ? (
            'Drop it here'
          ) : (
            <>
              Drop a file, or <span className="text-[var(--accent)] underline underline-offset-2">browse</span>
            </>
          )}
        </p>
        <p id={`${inputId}-help`} className="mt-1 text-xs leading-relaxed text-[var(--ink-faint)]">
          {helpText}
        </p>
      </div>

      {file && (
        <div className="animate-pop mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.7)] px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <UploadIcon width={15} height={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-[var(--ink-faint)]">{formatBytes(file.size)}</p>
            </div>
          </div>

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--ink-muted)] transition hover:bg-red-500/10 hover:text-red-500"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
