import { useCallback, useRef, useState } from 'react';
import CodePanel from './components/CodePanel';
import MarkdownPanel from './components/MarkdownPanel';
import DocumentPanel from './components/DocumentPanel';
import ImagePanel from './components/ImagePanel';
import CompressPanel from './components/CompressPanel';
import ExtractPanel from './components/ExtractPanel';
import TextResult from './components/TextResult';
import ResultCard from './components/ResultCard';
import ServerStatusBanner from './components/ServerStatusBanner';
import Spinner from './components/Spinner';
import ProgressBar from './components/ProgressBar';
import TabBar from './components/TabBar';
import Hero, { TrustChips } from './components/Hero';
import Logo from './components/Logo';
import ContactCard from './components/ContactCard';
import {
  CodeIcon,
  DocIcon,
  ImageIcon,
  MarkdownIcon,
  MoonIcon,
  ResizeIcon,
  ShieldIcon,
  SunIcon,
  TextScanIcon
} from './components/Icons';
import { useServerStatus } from './hooks/useServerStatus';
import { useTheme } from './hooks/useTheme';
import { useReveal } from './hooks/useReveal';
import { validateFile } from './lib/files';
import { CODE_EXTENSIONS } from './lib/constants';
import {
  compressImage,
  convertCodeFileToPdf,
  convertCodeToPdf,
  convertMarkdownToPdf,
  convertMarkdownFileToPdf,
  convertDocxToPdf,
  convertImage,
  convertPdfToDocx,
  extractTextFromImage,
  extractTextFromPdf,
  convertToMarkdown
} from './api/conversions';

const TABS = [
  { id: 'code', label: 'Code → PDF', icon: CodeIcon },
  { id: 'markdown', label: 'Markdown ↔ PDF', icon: MarkdownIcon },
  { id: 'document', label: 'Word ↔ PDF', icon: DocIcon },
  { id: 'image', label: 'Image formats', icon: ImageIcon },
  { id: 'compress', label: 'Resize for forms', icon: ResizeIcon },
  { id: 'extract', label: 'Image → Text', icon: TextScanIcon }
];

const TAB_BLURB = {
  code: 'Paste or upload source code and get a syntax-highlighted PDF, ready to submit.',
  markdown: 'Typeset Markdown into a PDF, or pull clean Markdown back out of a PDF or Word file.',
  document: 'Convert Word to PDF, or turn a PDF back into an editable Word document.',
  image: 'Switch between JPG, PNG and WebP without losing quality.',
  compress: 'Hit the exact size an exam or admission form demands.',
  extract: 'Pull the words out of a screenshot, photo or scan so you can copy and paste them.'
};

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
  const revealRef = useReveal([activeTab]);

  const maxFileSizeMb = health?.limits?.maxFileSizeMb ?? FALLBACK_MAX_FILE_SIZE_MB;
  const maxPdfPages = health?.limits?.pdfToDocxMaxPages ?? 60;

  const resetFeedback = useCallback(() => {
    setError('');
    setResult(null);
    setProgress(0);
  }, []);

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
          { filename: form.filename, title: form.title, section: form.section, language: form.language },
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

  function handleMarkdownSubmit(form) {
    // The reverse direction produces text rather than a file, so it lands in
    // the same result view the extraction tab uses.
    if (form.direction === 'from-doc') {
      if (!guardFile(form.file, form.extensions)) return;
      run('text', () => convertToMarkdown(form.file, { onProgress: setProgress }));
      return;
    }

    const fields = {
      filename: form.filename,
      title: form.title,
      subtitle: form.subtitle,
      theme: form.theme,
      pageSize: form.pageSize
    };

    if (form.file) {
      if (!guardFile(form.file, form.extensions)) return;
      run('document', () => convertMarkdownFileToPdf(form.file, fields, { onProgress: setProgress }));
      return;
    }

    run('document', () => convertMarkdownToPdf({ ...fields, markdown: form.markdown }));
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

  function handleExtractSubmit({ source, file, extensions, fields }) {
    if (!guardFile(file, extensions)) return;

    const call = source === 'pdf' ? extractTextFromPdf : extractTextFromImage;
    run('text', () => call(file, fields, { onProgress: setProgress }));
  }

  return (
    <div ref={revealRef} className="relative min-h-full">
      <div className="ambient" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        {/* ── Top bar ───────────────────────────────────────────
            The eyebrow and the theme toggle share one full-width row of
            their own. Sitting the toggle inside the preview column had it
            overlapping the card's corner at every breakpoint. */}
        <div className="mb-7 flex items-center justify-between gap-4 sm:mb-9">
          <p className="eyebrow">Student utility platform</p>

          <button
            type="button"
            onClick={(event) => toggleTheme(event)}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[rgb(var(--surface)/0.6)] text-[var(--ink-muted)] backdrop-blur transition hover:scale-105 hover:text-[var(--ink)] active:scale-95"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {/* ── Masthead + product preview, side by side on desktop ── */}
        <header className="grid items-center gap-7 sm:gap-8 lg:grid-cols-[1fr_minmax(0,0.95fr)] lg:gap-10">
          <div className="stagger">
            <Logo />

            <p className="mt-5 max-w-lg text-[0.95rem] leading-relaxed text-[var(--ink-muted)] sm:text-base">
              Turn your code into a clean, submission-ready PDF — plus Word ↔ PDF and the image resizing every
              application form insists on. No account, nothing kept.
            </p>

            <div className="mt-5">
              <TrustChips />
            </div>
          </div>

          {/* The preview follows the active tab, so it always illustrates the
              conversion in front of you rather than a fixed example. */}
          <section className="reveal glass panel-lit rounded-[var(--radius-lg)] p-3 sm:p-4">
            <Hero variant={activeTab} />
          </section>
        </header>

        <div className="mt-6">
          <ServerStatusBanner status={status} attempt={attempt} error={serverError} onRetry={retry} />
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div className="reveal mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
          <TabBar
            tabs={TABS}
            active={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              resetFeedback();
            }}
          />
          <p className="hidden max-w-xs text-right text-xs leading-relaxed text-[var(--ink-faint)] lg:block">
            {TAB_BLURB[activeTab]}
          </p>
        </div>

        <p className="mt-3 text-sm text-[var(--ink-muted)] lg:hidden">{TAB_BLURB[activeTab]}</p>

        {/* ── Work area ────────────────────────────────────────── */}
        <main className="mt-5 grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
          <section
            key={activeTab}
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="panel panel-lit animate-fade p-4 shadow-[var(--shadow-md)] sm:p-6"
          >
            {activeTab === 'code' && (
              <CodePanel onSubmit={handleCodeSubmit} isBusy={isBusy} maxFileSizeMb={maxFileSizeMb} />
            )}

            {activeTab === 'markdown' && (
              <MarkdownPanel
                onSubmit={handleMarkdownSubmit}
                isBusy={isBusy}
                maxFileSizeMb={maxFileSizeMb}
                maxPdfPages={maxPdfPages}
                can={can}
                reasonFor={reasonFor}
              />
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

            {activeTab === 'extract' && (
              <ExtractPanel
                onSubmit={handleExtractSubmit}
                isBusy={isBusy}
                maxFileSizeMb={maxFileSizeMb}
                can={can}
                reasonFor={reasonFor}
              />
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="panel panel-lit p-4 shadow-[var(--shadow-md)] sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isBusy ? 'animate-pulse bg-[var(--accent-2)]' : 'bg-[var(--accent)]'
                  }`}
                />
                Status
              </h2>

              <div className="mt-3">
                {isBusy && (
                  <div className="animate-fade space-y-3">
                    <Spinner label="Converting…" />
                    {progress > 0 && <ProgressBar value={progress} />}
                    <button
                      type="button"
                      onClick={cancel}
                      className="focus-ring text-xs font-semibold text-[var(--accent-2)] underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {error && !isBusy && (
                  <div
                    role="alert"
                    className="animate-pop rounded-[var(--radius-md)] border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200"
                  >
                    {error}
                  </div>
                )}

                {result && !isBusy && result.kind === 'text' && (
                  <TextResult result={result} onReset={resetFeedback} />
                )}

                {result && !isBusy && result.kind !== 'text' && (
                  <ResultCard result={result} onReset={resetFeedback} />
                )}

                {!isBusy && !error && !result && (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-[var(--line-strong)] text-[var(--ink-faint)]">
                      <ShieldIcon width={19} height={19} />
                    </span>
                    <p className="text-sm text-[var(--ink-muted)]">
                      Your download will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="panel panel-lit p-4 sm:p-5">
              <p className="text-sm font-bold">How your files are handled</p>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                {[
                  'Checked by content, not just the file extension.',
                  'Deleted automatically — nothing is kept after you leave.',
                  'No account, no tracking, no third-party upload.'
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </main>

        <ContactCard />

        <footer className="reveal mt-12 border-t border-[var(--line)] pt-6 text-center">
          <p className="text-xs text-[var(--ink-faint)]">
            Built by Harsh Badhan ·{' '}
            <a
              href="mailto:badhann.work@gmail.com"
              className="focus-ring underline decoration-[var(--line-strong)] underline-offset-2 transition hover:text-[var(--accent)]"
            >
              badhann.work@gmail.com
            </a>
          </p>
          {health?.version && (
            /* Version stays for support, but as a tooltip rather than a build
               string sitting in the interface for every visitor to puzzle at. */
            <p
              className="mt-1 text-[10px] text-[var(--ink-faint)] opacity-50"
              title={`API v${health.version}${health.commit ? ` · ${health.commit}` : ''}`}
            >
              v{health.version}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
