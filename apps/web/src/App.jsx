import { useCallback, useRef, useState } from 'react';
import CodePanel from './components/CodePanel';
import DocumentPanel from './components/DocumentPanel';
import ImagePanel from './components/ImagePanel';
import CompressPanel from './components/CompressPanel';
import ResultCard from './components/ResultCard';
import ServerStatusBanner from './components/ServerStatusBanner';
import Spinner from './components/Spinner';
import ProgressBar from './components/ProgressBar';
import { useServerStatus } from './hooks/useServerStatus';
import { useTheme } from './hooks/useTheme';
import { validateFile } from './lib/files';
import { CODE_EXTENSIONS } from './lib/constants';
import {
  convertCodeFileToPdf,
  convertCodeToPdf,
  convertDocxToPdf,
  convertImage,
  convertPdfToDocx,
  compressImage
} from './api/conversions';

const TABS = [
  { id: 'code', label: 'Code → PDF' },
  { id: 'document', label: 'Word ↔ PDF' },
  { id: 'image', label: 'Image formats' },
  { id: 'compress', label: 'Resize for forms' }
];

const FALLBACK_MAX_FILE_SIZE_MB = Number(import.meta.env.VITE_MAX_FILE_SIZE_MB || 10);

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { status, health, error: serverError, attempt, retry, can, reasonFor } = useServerStatus();

  const [activeTab, setActiveTab] = useState('code');
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const pendingRef = useRef(null);

  // Limits come from the server so the UI can never disagree with it.
  const maxFileSizeMb = health?.limits?.maxFileSizeMb ?? FALLBACK_MAX_FILE_SIZE_MB;
  const maxPdfPages = health?.limits?.pdfToDocxMaxPages ?? 60;

  const resetFeedback = useCallback(() => {
    setError('');
    setResult(null);
    setProgress(0);
  }, []);

  /** Single funnel for every conversion: consistent errors, progress and cleanup. */
  const run = useCallback(
    async (kind, task) => {
      resetFeedback();
      setIsBusy(true);

      try {
        const request = task();
        pendingRef.current = request;
        const data = await request;
        setResult({ ...data, kind });
      } catch (caught) {
        // A cancel is a user action, not something to report as a failure.
        if (caught.code !== 'aborted') setError(caught.message || 'The conversion failed.');
      } finally {
        pendingRef.current = null;
        setIsBusy(false);
        setProgress(0);
      }
    },
    [resetFeedback]
  );

  function cancel() {
    pendingRef.current?.abort?.();
  }

  function guardFile(file, extensions) {
    const message = validateFile(file, extensions, maxFileSizeMb);
    if (message) setError(message);
    return !message;
  }

  function handleCodeSubmit(form) {
    if (form.file) {
      if (!guardFile(form.file, CODE_EXTENSIONS)) return;

      run('document', () =>
        convertCodeFileToPdf(
          form.file,
          {
            filename: form.filename,
            title: form.title,
            section: form.section,
            language: form.language
          },
          { onProgress: setProgress }
        )
      );
      return;
    }

    run('document', () =>
      convertCodeToPdf({
        filename: form.filename,
        title: form.title,
        section: form.section,
        language: form.language || undefined,
        code: form.code
      })
    );
  }

  function handleDocumentSubmit({ mode, file, extensions, engine }) {
    if (!guardFile(file, extensions)) return;

    if (mode === 'docx-to-pdf') {
      run('document', () => convertDocxToPdf(file, { onProgress: setProgress }));
      return;
    }

    run('document', () => convertPdfToDocx(file, { mode: engine }, { onProgress: setProgress }));
  }

  function handleImageSubmit({ file, targetFormat, extensions }) {
    if (!guardFile(file, extensions)) return;
    run('image', () => convertImage(file, { targetFormat }, { onProgress: setProgress }));
  }

  function handleCompressSubmit({ file, fields, extensions }) {
    if (!guardFile(file, extensions)) return;
    run('compress', () => compressImage(file, fields, { onProgress: setProgress }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="codf-shell animate-rise rounded-3xl border border-[var(--line)] p-5 shadow-panel backdrop-blur md:p-8">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
              Student utility platform
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              coDF <span className="ml-1 text-lg font-normal opacity-50 md:text-xl">by BADHAN</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)]">
              Turn source code into a clean, syntax-highlighted PDF — plus Word ↔ PDF and image format conversion.
              Files are processed on the fly and deleted automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="focus-ring inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:bg-white dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </header>

        <div className="mt-5">
          <ServerStatusBanner status={status} attempt={attempt} error={serverError} onRetry={retry} />
        </div>

        <div role="tablist" aria-label="Conversion type" className="mt-5 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                resetFeedback();
              }}
              className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-teal-700 text-white shadow-lift dark:bg-teal-500 dark:text-slate-900'
                  : 'border border-[var(--line)] bg-white/70 hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <main className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section
            role="tabpanel"
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 md:p-6"
          >
            {activeTab === 'code' && (
              <CodePanel onSubmit={handleCodeSubmit} isBusy={isBusy} maxFileSizeMb={maxFileSizeMb} />
            )}

            {activeTab === 'document' && (
              <DocumentPanel
                onSubmit={handleDocumentSubmit}
                isBusy={isBusy}
                maxFileSizeMb={maxFileSizeMb}
                maxPdfPages={maxPdfPages}
                can={can}
                reasonFor={reasonFor}
              />
            )}

            {activeTab === 'image' && (
              <ImagePanel onSubmit={handleImageSubmit} isBusy={isBusy} maxFileSizeMb={maxFileSizeMb} />
            )}

            {activeTab === 'compress' && (
              <CompressPanel onSubmit={handleCompressSubmit} isBusy={isBusy} maxFileSizeMb={maxFileSizeMb} />
            )}
          </section>

          <aside className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 md:p-6">
              <h2 className="text-lg font-bold">Status</h2>

              {isBusy && (
                <div className="space-y-3">
                  <Spinner label="Converting your file…" />
                  {progress > 0 && <ProgressBar value={progress} />}
                  <button
                    type="button"
                    onClick={cancel}
                    className="focus-ring text-xs font-semibold text-orange-700 underline dark:text-orange-300"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {error && !isBusy && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-100"
                >
                  {error}
                </div>
              )}

              {result && !isBusy && <ResultCard result={result} onReset={resetFeedback} />}

              {!isBusy && !error && !result && (
                <p className="text-sm text-[var(--text-muted)]">
                  Run a conversion and the download will appear here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-xs text-[var(--text-muted)] md:p-6">
              <p className="text-sm font-bold text-[var(--text-main)]">How your files are handled</p>
              <ul className="mt-2 space-y-1.5">
                <li>· Uploads are checked by content, not just file extension.</li>
                <li>· Nothing is stored permanently — converted files are deleted on a timer.</li>
                <li>· No account, no tracking, no third-party upload.</li>
              </ul>

              {health?.version && (
                <p className="mt-3 border-t border-[var(--line)] pt-2 font-mono text-[11px] opacity-70">
                  API v{health.version}
                  {health.commit ? ` · ${health.commit}` : ''}
                </p>
              )}
            </div>
          </aside>
        </main>
      </div>

      <footer className="mt-6 text-center text-xs text-[var(--text-muted)]">
        Built by Harsh Badhan · Frontend on Vercel, API on Render
      </footer>
    </div>
  );
}
