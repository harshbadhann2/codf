import { useState } from 'react';
import { downloadFile, formatDuration } from '../lib/files';

export default function ResultCard({ result, onReset }) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      await downloadFile(result.downloadUrl, result.originalName);
    } finally {
      setIsDownloading(false);
    }
  }

  const isImage = result.kind === 'image';

  return (
    <div className="animate-rise space-y-3 rounded-2xl border border-teal-300 bg-teal-50/60 p-4 dark:border-teal-500/40 dark:bg-teal-950/25">
      <div className="flex items-start gap-2">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-main)]">Ready to download</p>
          <p className="truncate text-sm text-[var(--text-muted)]" title={result.originalName}>
            {result.originalName}
          </p>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        {result.detectedLanguage && (
          <div className="flex gap-1">
            <dt className="font-semibold">Language:</dt>
            <dd>{result.detectedLanguage}</dd>
          </div>
        )}
        {result.lineCount > 0 && (
          <div className="flex gap-1">
            <dt className="font-semibold">Lines:</dt>
            <dd>{result.lineCount.toLocaleString()}</dd>
          </div>
        )}
        {result.width > 0 && (
          <div className="flex gap-1">
            <dt className="font-semibold">Size:</dt>
            <dd>
              {result.width} × {result.height}
            </dd>
          </div>
        )}
      </dl>

      {isImage && (
        <img
          src={`${result.downloadUrl}&inline=1`}
          alt={`Converted result: ${result.originalName}`}
          className="max-h-56 w-full rounded-xl border border-[var(--line)] bg-white object-contain dark:bg-slate-900"
          loading="lazy"
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-500 dark:text-slate-900 dark:hover:bg-teal-400"
        >
          {isDownloading ? 'Downloading…' : 'Download'}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="focus-ring rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:bg-white dark:hover:bg-slate-800"
        >
          Convert another
        </button>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {/* Files are deleted on a TTL, so a stale tab's link will stop working. */}
        This link expires in about {formatDuration(result.expiresInMs)}.
      </p>
    </div>
  );
}
