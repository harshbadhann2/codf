import { useState } from 'react';
import Dropzone from './Dropzone';
import ToMarkdownPanel from './ToMarkdownPanel';
import { ModeToggle, SelectField, SubmitButton, TextField } from './Field';
import { MARKDOWN_EXTENSIONS, MARKDOWN_OUTPUTS, PDF_PAGE_SIZES, PDF_THEMES } from '../lib/constants';
import { stripExtension } from '../lib/files';

/**
 * Markdown ↔ PDF.
 *
 * The two directions share a tab because they are the same job read backwards,
 * the way Word ↔ PDF already works here. Split across two tabs they competed
 * for the same place in the strip and read as unrelated features.
 */
const DIRECTIONS = [
  { id: 'to-pdf', label: 'Markdown → PDF/Word' },
  { id: 'from-doc', label: 'PDF/Word → Markdown', capability: 'toMarkdown' }
];

const SAMPLE = `# Project Report

A short paragraph with **bold**, *italic* and \`inline code\`.

## Findings

- First point
- Second point

\`\`\`python
def total(values):
    return sum(values)
\`\`\`

> Code blocks are never split across pages.
`;

export default function MarkdownPanel({ onSubmit, isBusy, maxFileSizeMb, maxPdfPages, can, reasonFor }) {
  const [direction, setDirection] = useState('to-pdf');
  const [form, setForm] = useState({
    filename: 'document',
    title: '',
    subtitle: '',
    output: 'pdf',
    theme: 'light',
    pageSize: 'a4',
    markdown: '',
    file: null
  });

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const wantsWord = form.output === 'docx';
  const usingFile = Boolean(form.file);
  const canSubmit = (usingFile || form.markdown.trim().length > 0) && !isBusy;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ ...form, extensions: MARKDOWN_EXTENSIONS, direction: 'to-pdf' });
  }

  const toggle = (
    <ModeToggle
      label="Conversion direction"
      value={direction}
      onChange={setDirection}
      options={DIRECTIONS.map((entry) => ({
        value: entry.id,
        label: entry.label,
        disabled: entry.capability ? !can(entry.capability) : false,
        title: entry.capability && !can(entry.capability) ? reasonFor(entry.capability) : undefined
      }))}
    />
  );

  if (direction === 'from-doc') {
    return (
      <div className="space-y-4">
        {toggle}
        <ToMarkdownPanel
          onSubmit={(payload) => onSubmit({ ...payload, direction: 'from-doc' })}
          isBusy={isBusy}
          maxFileSizeMb={maxFileSizeMb}
          maxPdfPages={maxPdfPages}
          can={can}
          reasonFor={reasonFor}
        />
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {toggle}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Output filename"
          value={form.filename}
          onChange={(filename) => update({ filename })}
          placeholder="document"
          maxLength={60}
        />
        <SelectField
          label="Convert to"
          value={form.output}
          onChange={(output) => update({ output })}
          options={MARKDOWN_OUTPUTS}
          hint={
            wantsWord
              ? 'A real Word document — headings, lists and tables use Word’s own styles, so you can keep editing it.'
              : 'A typeset PDF with syntax-highlighted code that never splits across a page break.'
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Document title (optional)"
          value={form.title}
          onChange={(title) => update({ title })}
          placeholder="Project Report"
          maxLength={90}
        />
        <SelectField
          label="Page size"
          value={form.pageSize}
          onChange={(pageSize) => update({ pageSize })}
          options={PDF_PAGE_SIZES}
        />
      </div>

      {/* Theme is a property of a printed page. A Word document has no page
          colour of its own, so offering the choice there would be a control
          that quietly does nothing. */}
      {!wantsWord && (
        <SelectField
          label="PDF theme"
          value={form.theme}
          onChange={(theme) => update({ theme })}
          options={PDF_THEMES}
          hint={
            form.theme === 'dark'
              ? 'Dark page with syntax colours tuned for it — good on screen, heavy on a printer.'
              : 'Standard white page. Best for printing and for handing in.'
          }
        />
      )}

      <TextField
        label="Subtitle (optional)"
        value={form.subtitle}
        onChange={(subtitle) => update({ subtitle })}
        placeholder="Your name · Course · Date"
        maxLength={110}
      />

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor="markdown-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Paste your Markdown
          </label>
          <div className="flex items-center gap-3">
            {form.markdown.length > 0 && (
              <span className="text-xs text-[var(--ink-faint)]">
                {form.markdown.length.toLocaleString()} characters
              </span>
            )}
            {!usingFile && !form.markdown && (
              <button
                type="button"
                onClick={() => update({ markdown: SAMPLE })}
                className="focus-ring text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
              >
                Insert example
              </button>
            )}
          </div>
        </div>

        <textarea
          id="markdown-input"
          value={form.markdown}
          onChange={(event) => update({ markdown: event.target.value })}
          disabled={usingFile}
          spellCheck={false}
          className="code-well focus-ring h-56 sm:h-64"
          placeholder={usingFile ? 'Using the uploaded file instead…' : '# Heading\n\nYour Markdown here.'}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--line)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-faint)]">or upload</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        <Dropzone
          accept={MARKDOWN_EXTENSIONS.join(',')}
          file={form.file}
          onFileSelect={(file) => update({ file, filename: stripExtension(file.name) || form.filename })}
          onClear={() => update({ file: null })}
          helpText={`Max ${maxFileSizeMb} MB. .md, .markdown or .txt.`}
        />
      </div>

      <SubmitButton disabled={!canSubmit} busy={isBusy}>
        {isBusy ? (wantsWord ? 'Building Word file…' : 'Building PDF…') : wantsWord ? 'Convert to Word' : 'Convert to PDF'}
      </SubmitButton>

      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
        {wantsWord
          ? 'Headings, lists, tables, quotes and links become real Word content, so the file opens ready to edit. Arrows, symbols and emoji survive here that a PDF cannot show.'
          : 'Headings, lists, tables, blockquotes and task lists are all rendered. Code blocks keep their syntax colours and are never cut in half by a page break — if one will not fit, the whole block moves to the next page with its heading.'}
      </p>
    </form>
  );
}
