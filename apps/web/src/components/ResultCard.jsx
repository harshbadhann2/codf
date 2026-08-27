import { useState } from 'react';
import { downloadFile, formatBytes, formatDuration } from '../lib/files';
import { CheckIcon, DownloadIcon } from './Icons';

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

  const showsPreview = result.kind === 'image' || result.kind === 'compress';
  const saved =
    result.originalBytes > result.bytes
      ? Math.round((1 - result.bytes / result.originalBytes) * 100)
      : 0;

  return (
    <div className="animate-pop space-y-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <CheckIcon width={16} height={16} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-bold">Ready to download</p>
          <p className="truncate text-sm text-[var(--ink-muted)]" title={result.originalName}>
            {result.originalName}
          </p>
        </div>
      </div>

      {/* Compression is the one result where the numbers are the point. */}
      {result.kind === 'compress' && result.originalBytes > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.6)] p-3">
          <div className="flex items-baseline gap-2 text-sm font-bold">
            <span className="text-[var(--ink-faint)] line-through decoration-1">
              {formatBytes(result.originalBytes)}
            </span>
            <span className="text-[var(--ink-faint)]">→</span>
            <span className="text-[var(--accent)]">{formatBytes(result.bytes)}</span>
            {saved > 0 && (
              <span className="ml-auto rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                {saved}% smaller
              </span>
            )}
          </div>

          {result.originalWidth > 0 && (
            <p className="mt-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
              {result.originalWidth}×{result.originalHeight} → {result.width}×{result.height} px
            </p>
          )}

          {result.padded && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              The picture encodes below your {Math.round(result.minBytes / 1024)} KB minimum at this size, so blank
              metadata was added to reach it. The image itself is unchanged.
            </p>
          )}

          {result.downscaled && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              Quality alone could not reach the target, so the image was scaled down. Set exact dimensions above if
              your form requires them.
            </p>
          )}
        </div>
      )}

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-muted)]">
        {result.detectedLanguage && (
          <div className="flex gap-1.5">
            <dt className="font-semibold">Language</dt>
            <dd className="font-mono">{result.detectedLanguage}</dd>
          </div>
        )}
        {result.lineCount > 0 && (
          <div className="flex gap-1.5">
            <dt className="font-semibold">Lines</dt>
            <dd className="font-mono">{result.lineCount.toLocaleString()}</dd>
          </div>
        )}
        {result.kind === 'image' && result.width > 0 && (
          <div className="flex gap-1.5">
            <dt className="font-semibold">Size</dt>
            <dd className="font-mono">
              {result.width}×{result.height}
            </dd>
          </div>
        )}
      </dl>

      {showsPreview && (
        <img
          src={`${result.downloadUrl}&inline=1`}
          alt={`Converted result: ${result.originalName}`}
          className="max-h-48 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-white object-contain p-1 dark:bg-[#101319]"
          loading="lazy"
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="btn-primary focus-ring flex-1"
        >
          {isDownloading ? (
            <span className="spinner h-3.5 w-3.5 border-white" />
          ) : (
            <DownloadIcon width={16} height={16} />
          )}
          {isDownloading ? 'Downloading…' : 'Download'}
        </button>

        <button type="button" onClick={onReset} className="btn-ghost focus-ring">
          Again
        </button>
      </div>

      <p className="text-[11px] text-[var(--ink-faint)]">
        {/* Files are deleted on a TTL, so a stale tab's link will stop working. */}
        Link expires in about {formatDuration(result.expiresInMs)}.
      </p>
    </div>
  );
}
