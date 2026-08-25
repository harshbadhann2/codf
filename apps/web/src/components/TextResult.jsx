import { useState } from 'react';
import { downloadFile } from '../lib/files';
import { CheckIcon, DownloadIcon } from './Icons';

/**
 * Result view for text-shaped output — extracted text, and Markdown.
 *
 * Every other conversion produces a file, so its result is a download button.
 * These two usually end up pasted somewhere, so the text itself is the result
 * and copying it is the primary action; the file download is secondary.
 */

/** The counts worth showing, and the caveat that honestly belongs with them. */
function describe(result) {
  if (result.format !== 'markdown') {
    return {
      title: 'Text extracted',
      stats: `${result.words?.toLocaleString()} words · ${result.characters?.toLocaleString()} characters`,
      // Which route produced this matters: copied text is exact, recognised
      // text is a best guess. `ocrUsed` is the authority — an image is always
      // recognised, and reporting it as an exact copy would talk someone out
      // of proofreading it.
      note:
        result.ocrUsed && result.textPages > 0 && result.ocrPages > 0
          ? `${result.textPages} page${result.textPages === 1 ? '' : 's'} copied exactly, ${result.ocrPages} recognised from ${result.ocrPages === 1 ? 'an image' : 'images'} — worth checking those.`
          : result.ocrUsed
            ? 'Recognised from an image, so check it against the original before using it.'
            : 'Copied straight out of the document, so it matches exactly.',
      label: '.txt'
    };
  }

  const structure = [
    result.headings ? `${result.headings} heading${result.headings === 1 ? '' : 's'}` : '',
    result.listItems ? `${result.listItems} list item${result.listItems === 1 ? '' : 's'}` : '',
    result.tables ? `${result.tables} table${result.tables === 1 ? '' : 's'}` : '',
    result.codeBlocks ? `${result.codeBlocks} code block${result.codeBlocks === 1 ? '' : 's'}` : ''
  ].filter(Boolean);

  return {
    title: 'Markdown ready',
    stats: structure.length
      ? `${result.words?.toLocaleString()} words · ${structure.join(' · ')}`
      : `${result.words?.toLocaleString()} words · ${result.characters?.toLocaleString()} characters`,
    // Word states its own structure; a PDF has none to state, so everything
    // here was inferred from the layout. Saying which of the two happened is
    // the difference between a result you can trust and one you should skim.
    note: result.truncated
      ? 'The document was too long to convert in full — the end has been cut off.'
      : result.sourceFormat === 'docx'
        ? 'Word records its own headings and lists, so this came across almost exactly.'
        : 'A PDF stores no structure, so headings and lists were worked out from the layout — worth a read-through.',
    label: '.md'
  };
}

export default function TextResult({ result, onReset }) {
  const { title, stats, note, label } = describe(result);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
    } catch {
      // Clipboard access is refused on insecure origins and in some in-app
      // browsers. Selecting the text is a workable fallback, and far better
      // than a button that silently does nothing.
      const field = document.getElementById('extracted-text');
      field?.focus();
      field?.select();
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(result.downloadUrl, result.originalName);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="animate-pop space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <CheckIcon width={16} height={16} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-xs text-[var(--ink-muted)]">{stats}</p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">{note}</p>

      <textarea
        id="extracted-text"
        readOnly
        value={result.text}
        spellCheck={false}
        onFocus={(event) => event.target.select()}
        className="focus-ring h-52 w-full resize-y rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.75)] p-3 font-mono text-xs leading-relaxed text-[var(--ink)]"
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-primary focus-ring flex-1">
          {copied ? <CheckIcon width={16} height={16} /> : null}
          {copied ? 'Copied' : `Copy ${label === '.md' ? 'Markdown' : 'text'}`}
        </button>

        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="btn-ghost focus-ring"
          title={`Download as a ${label} file`}
        >
          {downloading ? <span className="spinner h-3.5 w-3.5" /> : <DownloadIcon width={15} height={15} />}
          {label}
        </button>

        <button type="button" onClick={onReset} className="btn-ghost focus-ring">
          Again
        </button>
      </div>
    </div>
  );
}
