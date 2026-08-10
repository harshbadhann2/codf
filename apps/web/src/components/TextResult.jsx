import { useState } from 'react';
import { downloadFile } from '../lib/files';
import { CheckIcon, DownloadIcon } from './Icons';

/**
 * Result view for extracted text.
 *
 * Every other conversion produces a file, so its result is a download button.
 * This one usually ends up pasted somewhere, so the text itself is the result
 * and copying it is the primary action — the .txt download is the secondary.
 */
export default function TextResult({ result, onReset }) {
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
          <p className="text-sm font-bold">Text extracted</p>
          <p className="text-xs text-[var(--ink-muted)]">
            {result.words?.toLocaleString()} words · {result.characters?.toLocaleString()} characters
          </p>
        </div>
      </div>

      {/* Which route produced this matters: copied text is exact, recognised
          text is a best guess. `ocrUsed` is the authority — an image is always
          recognised, and reporting it as an exact copy would talk someone out
          of proofreading it. */}
      <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">
        {result.ocrUsed && result.textPages > 0 && result.ocrPages > 0
          ? `${result.textPages} page${result.textPages === 1 ? '' : 's'} copied exactly, ${result.ocrPages} recognised from ${result.ocrPages === 1 ? 'an image' : 'images'} — worth checking those.`
          : result.ocrUsed
            ? 'Recognised from an image, so check it against the original before using it.'
            : 'Copied straight out of the document, so it matches exactly.'}
      </p>

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
          {copied ? 'Copied' : 'Copy text'}
        </button>

        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="btn-ghost focus-ring"
          title="Download as a .txt file"
        >
          {downloading ? <span className="spinner h-3.5 w-3.5" /> : <DownloadIcon width={15} height={15} />}
          .txt
        </button>

        <button type="button" onClick={onReset} className="btn-ghost focus-ring">
          Again
        </button>
      </div>
    </div>
  );
}
