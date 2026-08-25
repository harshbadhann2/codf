import { useState } from 'react';
import Dropzone from './Dropzone';
import { SubmitButton } from './Field';
import { DOCUMENT_EXTENSIONS } from '../lib/constants';
import { extensionOf } from '../lib/files';

/**
 * PDF / Word → Markdown.
 *
 * Deliberately has no options. The other converters ask questions because the
 * answers change the output — a page size, a quality target, a colour theme.
 * Here there is exactly one sensible result, and the work is all inference the
 * user cannot usefully steer. So the panel is a dropzone and a button.
 */
export default function ToMarkdownPanel({ onSubmit, isBusy, maxFileSizeMb, maxPdfPages, can, reasonFor }) {
  const [file, setFile] = useState(null);

  const isAvailable = can('toMarkdown');
  const kind = file ? extensionOf(file.name) : '';

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || isBusy || !isAvailable) return;

    onSubmit({ file, extensions: DOCUMENT_EXTENSIONS });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {!isAvailable && (
        <div className="animate-pop rounded-[var(--radius-md)] border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-200">Not available right now</p>
          <p className="mt-1 leading-relaxed text-amber-800/80 dark:text-amber-200/70">{reasonFor('toMarkdown')}</p>
        </div>
      )}

      <Dropzone
        accept={DOCUMENT_EXTENSIONS.join(',')}
        file={file}
        onFileSelect={setFile}
        onClear={() => setFile(null)}
        disabled={!isAvailable}
        helpText={`Max ${maxFileSizeMb} MB · PDF or Word (.docx) · up to ${maxPdfPages} pages`}
      />

      {/* What actually survives the conversion, said plainly before the click
          rather than discovered afterwards. */}
      <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.5)] p-3">
        <p className="text-xs font-semibold">What comes across</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
          {['Headings, lists and tables', 'Bold, italic and links', 'Code blocks kept as code'].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          {kind === '.docx'
            ? 'Word records its own structure, so a .docx converts almost exactly.'
            : 'A PDF stores no structure, so headings and lists are worked out from the layout — worth a read-through afterwards.'}
        </p>
      </div>

      <SubmitButton disabled={!file || isBusy || !isAvailable} busy={isBusy}>
        {isBusy ? 'Converting…' : 'Convert to Markdown'}
      </SubmitButton>

      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
        Scanned PDFs have no text to read — use Image → Text for those.
      </p>
    </form>
  );
}
