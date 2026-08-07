import { useState } from 'react';
import Dropzone from './Dropzone';
import { ModeToggle, SelectField, SubmitButton } from './Field';

const MODES = [
  { id: 'docx-to-pdf', label: 'Word → PDF', accept: '.docx', capability: 'docxToPdf', extensions: ['.docx'] },
  { id: 'pdf-to-docx', label: 'PDF → Word', accept: '.pdf', capability: 'pdfToDocx', extensions: ['.pdf'] }
];

const PDF_ENGINES = [
  { value: 'text', label: 'Editable document — recommended' },
  { value: 'layout', label: 'Match the original layout' }
];

export default function DocumentPanel({ onSubmit, isBusy, maxFileSizeMb, can, reasonFor, maxPdfPages }) {
  const [mode, setMode] = useState('docx-to-pdf');
  const [engine, setEngine] = useState('text');
  const [file, setFile] = useState(null);

  const active = MODES.find((entry) => entry.id === mode);
  const isAvailable = can(active.capability);
  const unavailableReason = reasonFor(active.capability);

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || isBusy || !isAvailable) return;
    onSubmit({ mode, file, extensions: active.extensions, engine });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <ModeToggle
        label="Conversion direction"
        value={mode}
        onChange={(id) => {
          setMode(id);
          setFile(null);
        }}
        options={MODES.map((entry) => ({
          value: entry.id,
          label: entry.label,
          disabled: !can(entry.capability),
          title: can(entry.capability) ? undefined : reasonFor(entry.capability)
        }))}
      />

      {!isAvailable && (
        <div className="animate-pop rounded-[var(--radius-md)] border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-200">This conversion is not available right now</p>
          <p className="mt-1 leading-relaxed text-amber-800/80 dark:text-amber-200/70">{unavailableReason}</p>
        </div>
      )}

      {mode === 'pdf-to-docx' && isAvailable && (
        <SelectField
          label="How should it convert?"
          value={engine}
          onChange={setEngine}
          options={PDF_ENGINES}
          hint={
            engine === 'text'
              ? 'Rebuilds real headings, paragraphs and bullet lists, so the result is easy to edit. Best for resumes, reports and essays.'
              : 'Keeps text where it sits on the page using text boxes and tables. Better for forms and dense tables, harder to edit afterwards.'
          }
        />
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
        <p className="text-xs text-[var(--ink-muted)]">
          Layout fidelity depends on how the PDF was made. Complex multi-column pages may need cleanup afterwards.
        </p>
      )}
    </form>
  );
}
