import { useState } from 'react';
import Dropzone from './Dropzone';
import { SelectField, SubmitButton, TextField } from './Field';
import { stripExtension } from '../lib/files';
import { CODE_EXTENSIONS, LANGUAGE_OPTIONS } from '../lib/constants';

export default function CodePanel({ onSubmit, isBusy, maxFileSizeMb }) {
  const [form, setForm] = useState({
    filename: 'assignment_solution',
    title: 'Assignment 1',
    section: '',
    language: '',
    code: '',
    file: null
  });

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  // A picked file always wins over pasted text, so the UI says which one runs.
  const usingFile = Boolean(form.file);
  const canSubmit = usingFile || form.code.trim().length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    onSubmit(form);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Output filename"
          value={form.filename}
          onChange={(filename) => update({ filename })}
          placeholder="assignment_solution"
          maxLength={60}
        />
        <SelectField
          label="Language"
          value={form.language}
          onChange={(language) => update({ language })}
          options={LANGUAGE_OPTIONS}
          hint="Auto detect works well for most files."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Title (optional)"
          value={form.title}
          onChange={(title) => update({ title })}
          placeholder="Assignment 1"
          maxLength={80}
        />
        <TextField
          label="Subtitle (optional)"
          value={form.section}
          onChange={(section) => update({ section })}
          placeholder="CS201 · Section B · Your Name"
          maxLength={90}
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="code-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Paste your code
          </label>
          {form.code.length > 0 && (
            <span className="text-xs text-[var(--ink-faint)]">{form.code.length.toLocaleString()} characters</span>
          )}
        </div>
        <textarea
          id="code-input"
          value={form.code}
          onChange={(event) => update({ code: event.target.value })}
          disabled={usingFile}
          spellCheck={false}
          className="focus-ring h-56 w-full resize-y rounded-[var(--radius-md)] border border-[var(--line)] bg-slate-950 p-4 font-mono text-xs leading-relaxed text-teal-100 shadow-inner transition placeholder:text-slate-600 focus:border-[var(--accent)] disabled:opacity-40 sm:h-64"
          placeholder={usingFile ? 'Using the uploaded file instead…' : '# paste your code here'}
        />
      </div>

      <div className="relative">
        <div className="mb-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--line)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">or upload</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        <Dropzone
          accept={CODE_EXTENSIONS.join(',')}
          file={form.file}
          onFileSelect={(file) =>
            update({ file, filename: stripExtension(file.name) || form.filename })
          }
          onClear={() => update({ file: null })}
          helpText={`Max ${maxFileSizeMb} MB. Source files and Jupyter notebooks (.ipynb) are supported.`}
        />
      </div>

      <SubmitButton disabled={!canSubmit || isBusy} busy={isBusy}>
        {isBusy ? 'Generating…' : 'Generate PDF'}
      </SubmitButton>
    </form>
  );
}
