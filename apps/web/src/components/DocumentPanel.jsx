import { useState } from 'react';
import Dropzone from './Dropzone';
import { SubmitButton } from './Field';

const MODES = [
  { id: 'docx-to-pdf', label: 'Word → PDF', accept: '.docx', capability: 'docxToPdf', extensions: ['.docx'] },
  { id: 'pdf-to-docx', label: 'PDF → Word', accept: '.pdf', capability: 'pdfToDocx', extensions: ['.pdf'] }
];

export default function DocumentPanel({ onSubmit, isBusy, maxFileSizeMb, can, reasonFor, maxPdfPages }) {
  const [mode, setMode] = useState('docx-to-pdf');
  const [file, setFile] = useState(null);

  const active = MODES.find((entry) => entry.id === mode);
  const isAvailable = can(active.capability);
  const unavailableReason = reasonFor(active.capability);

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || isBusy || !isAvailable) return;
    onSubmit({ mode, file, extensions: active.extensions });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div role="group" aria-label="Conversion direction" className="flex flex-wrap gap-2">
        {MODES.map((entry) => {
          const enabled = can(entry.capability);
          const isActive = entry.id === mode;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setMode(entry.id);
                setFile(null);
              }}
              aria-pressed={isActive}
              title={enabled ? undefined : reasonFor(entry.capability)}
              className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-900'
                  : 'border border-[var(--line)] bg-white/70 hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-800'
              } ${enabled ? '' : 'opacity-50'}`}
            >
              {entry.label}
              {!enabled && <span className="ml-1.5 text-xs">(unavailable)</span>}
            </button>
          );
        })}
      </div>

      {!isAvailable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-100">This conversion is not available right now</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200/80">{unavailableReason}</p>
        </div>
      )}

      <Dropzone
        accept={active.accept}
        file={file}
        onFileSelect={setFile}
        onClear={() => setFile(null)}
        disabled={!isAvailable}
        helpText={
          mode === 'docx-to-pdf'
            ? `Max ${maxFileSizeMb} MB. Only .docx files (not the older .doc format).`
            : `Max ${maxFileSizeMb} MB, up to ${maxPdfPages} pages. Text-based PDFs only — scans will not convert.`
        }
      />

      <SubmitButton disabled={!file || isBusy || !isAvailable} busy={isBusy}>
        {isBusy ? 'Converting…' : `Convert to ${mode === 'docx-to-pdf' ? 'PDF' : 'Word'}`}
      </SubmitButton>

      {mode === 'pdf-to-docx' && isAvailable && (
        <p className="text-xs text-[var(--text-muted)]">
          Layout fidelity depends on how the PDF was made. Complex multi-column pages may need cleanup afterwards.
        </p>
      )}
    </form>
  );
}
