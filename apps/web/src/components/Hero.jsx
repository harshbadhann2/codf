import { ArrowIcon, ShieldIcon, SwapIcon } from './Icons';
import { usePointerTilt } from '../hooks/usePointerTilt';

/**
 * The active conversion, drawn.
 *
 * Every tab gets its own before/after pair. Showing the code→PDF illustration
 * while someone is on the image tab is worse than showing nothing: it says the
 * picture is decoration, not information. Cards are built from elements rather
 * than screenshots so they stay sharp, follow the theme, and download nothing.
 */

const CODE_LINES = [
  [{ w: 22, c: 'kw' }, { w: 30, c: 'fn' }, { w: 12, c: 'pl' }],
  [{ w: 14, c: 'pl' }, { w: 34, c: 'str' }],
  [{ w: 18, c: 'kw' }, { w: 24, c: 'pl' }, { w: 16, c: 'num' }],
  [{ w: 40, c: 'cm' }],
  [{ w: 20, c: 'kw' }, { w: 28, c: 'fn' }],
  [{ w: 16, c: 'pl' }, { w: 22, c: 'str' }, { w: 10, c: 'pl' }]
];

const TOKEN_COLOUR = {
  kw: 'bg-fuchsia-400/70',
  fn: 'bg-sky-400/70',
  str: 'bg-emerald-400/70',
  num: 'bg-amber-400/70',
  cm: 'bg-slate-400/40',
  pl: 'bg-slate-400/60'
};

const CARD = 'panel panel-lit relative z-10 w-[46%] max-w-[230px] overflow-hidden shadow-[var(--shadow-md)]';

function FormatChip({ label, tone }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}

/* ── Source code ─────────────────────────────────────────────── */
function CodeCard({ delay = 0.35 }) {
  return (
    <div className={`${CARD} p-3`}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className="ml-1 font-mono text-[9px] text-[var(--ink-faint)]">main.py</span>
      </div>

      <div className="space-y-[7px]">
        {CODE_LINES.map((line, row) => (
          <div
            key={row}
            className="flex items-center gap-1.5"
            style={{ animation: 'rise .5s var(--ease-out) both', animationDelay: `${delay + row * 0.06}s` }}
          >
            <span className="w-2 shrink-0 text-right font-mono text-[8px] leading-none text-[var(--ink-faint)]">
              {row + 1}
            </span>
            {line.map((token, index) => (
              <span
                key={index}
                className={`h-[5px] rounded-full ${TOKEN_COLOUR[token.c]}`}
                style={{ width: `${token.w}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── A rendered page: PDF or Word ─────────────────────────────── */
function PageCard({ format = 'PDF', delay = 0.7, gutter = true }) {
  const isPdf = format === 'PDF';

  return (
    <div
      className={`${CARD} bg-white/90 p-3 dark:bg-slate-100/95`}
      style={{ animation: 'pop .6s var(--ease-spring) both', animationDelay: `${delay}s` }}
    >
      <div className="sheen" />

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="h-[7px] w-[70%] rounded-full bg-slate-800/80" />
          <div className="h-[4px] w-[45%] rounded-full bg-slate-400/70" />
        </div>
        <FormatChip label={format} tone={isPdf ? 'bg-red-500/15 text-red-600' : 'bg-blue-500/15 text-blue-600'} />
      </div>

      {gutter ? (
        <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-900/10">
          <div className="pulse-lit space-y-[6px]">
            {CODE_LINES.map((line, row) => (
              <div key={row} className="flex items-center gap-1.5">
                <span className="w-2 shrink-0 text-right font-mono text-[7px] leading-none text-slate-400">
                  {row + 1}
                </span>
                {line.map((token, index) => (
                  <span
                    key={index}
                    className={`h-[4px] rounded-full ${TOKEN_COLOUR[token.c]}`}
                    style={{
                      width: `${token.w}%`,
                      animation: 'fade .4s ease-out both',
                      animationDelay: `${delay + 0.2 + row * 0.05}s`
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Prose rather than code: what a converted document actually is. */
        <div className="pulse-lit space-y-[6px] py-0.5">
          {[92, 86, 94, 62, 0, 90, 78].map((width, row) =>
            width === 0 ? (
              <div key={row} className="h-[3px]" />
            ) : (
              <div
                key={row}
                className="h-[4px] rounded-full bg-slate-300"
                style={{
                  width: `${width}%`,
                  animation: 'fade .4s ease-out both',
                  animationDelay: `${delay + 0.2 + row * 0.04}s`
                }}
              />
            )
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="h-[3px] w-[26%] rounded-full bg-slate-300" />
        <div className="h-[3px] w-[14%] rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

/* ── Markdown source ─────────────────────────────────────────── */
function MarkdownCard({ delay = 0.35, filename = 'README.md' }) {
  const lines = [
    { w: 46, hash: true },
    { w: 0 },
    { w: 92 },
    { w: 74 },
    { w: 0 },
    { w: 58, bullet: true },
    { w: 64, bullet: true }
  ];

  return (
    <div className={`${CARD} p-3`}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className="ml-1 font-mono text-[9px] text-[var(--ink-faint)]">{filename}</span>
      </div>

      <div className="space-y-[7px]">
        {lines.map((line, row) =>
          line.w === 0 ? (
            <div key={row} className="h-[5px]" />
          ) : (
            <div
              key={row}
              className="flex items-center gap-1.5"
              style={{ animation: 'rise .5s var(--ease-out) both', animationDelay: `${delay + row * 0.06}s` }}
            >
              {line.hash && <span className="font-mono text-[8px] leading-none text-fuchsia-400/80">#</span>}
              {line.bullet && <span className="font-mono text-[8px] leading-none text-sky-400/80">-</span>}
              <span
                className={`h-[5px] rounded-full ${line.hash ? 'bg-slate-300/80' : 'bg-slate-400/55'}`}
                style={{ width: `${line.w}%` }}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ── A photo ──────────────────────────────────────────────────── */
function PhotoCard({ format, weight, delay = 0.35, shrunk = false, animateIn = 'rise' }) {
  return (
    <div
      className={`${CARD} p-2.5`}
      style={{ animation: `${animateIn} .55s var(--ease-spring) both`, animationDelay: `${delay}s` }}
    >
      <div
        className={`relative overflow-hidden rounded-lg ring-1 ring-black/5 transition-all ${
          shrunk ? 'mx-auto w-[68%]' : 'w-full'
        }`}
      >
        {/* A simple scene reads as "photo" far faster than a grey rectangle. */}
        <svg viewBox="0 0 120 84" className="block w-full" role="img" aria-label="Example photograph">
          <defs>
            <linearGradient id={`sky-${format}-${shrunk}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#e0f2fe" />
            </linearGradient>
          </defs>
          <rect width="120" height="84" fill={`url(#sky-${format}-${shrunk})`} />
          <circle cx="92" cy="22" r="9" fill="#fbbf24" />
          <path d="M0 84 L34 40 L60 84 Z" fill="#0f766e" opacity="0.85" />
          <path d="M42 84 L74 46 L106 84 Z" fill="#115e59" opacity="0.9" />
          <rect y="76" width="120" height="8" fill="#064e3b" opacity="0.5" />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <FormatChip label={format} tone="bg-[var(--accent-soft)] text-[var(--accent)]" />
        <span className="font-mono text-[9px] font-semibold text-[var(--ink-faint)]">{weight}</span>
      </div>
    </div>
  );
}

/* ── Typeset page ─────────────────────────────────────────────── */
function TypesetCard({ delay = 0.65 }) {
  return (
    <div
      className={`${CARD} bg-white/90 p-3 dark:bg-slate-100/95`}
      style={{ animation: 'pop .6s var(--ease-spring) both', animationDelay: `${delay}s` }}
    >
      <div className="sheen" />

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="h-[7px] w-[64%] rounded-full bg-slate-800/85" />
          <div className="h-[1px] w-full bg-slate-300" />
        </div>
        <FormatChip label="PDF" tone="bg-red-500/15 text-red-600" />
      </div>

      <div className="pulse-lit space-y-[6px]">
        {[94, 88, 70].map((width, row) => (
          <div
            key={row}
            className="h-[4px] rounded-full bg-slate-300"
            style={{ width: `${width}%`, animation: 'fade .4s ease-out both', animationDelay: `${delay + 0.2 + row * 0.05}s` }}
          />
        ))}
      </div>

      {/* The code panel is the point: whole, never sliced by a page break. */}
      <div className="mt-2 rounded-md bg-slate-50 p-1.5 ring-1 ring-slate-900/10">
        <div className="space-y-[5px]">
          {[[22, 34], [16, 28], [30, 18]].map((pair, row) => (
            <div key={row} className="flex items-center gap-1">
              <span className="h-[3px] rounded-full bg-fuchsia-400/70" style={{ width: `${pair[0]}%` }} />
              <span className="h-[3px] rounded-full bg-sky-400/70" style={{ width: `${pair[1]}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Selectable text ──────────────────────────────────────────── */
function TextSheetCard({ delay = 0.65 }) {
  return (
    <div
      className={`${CARD} p-3`}
      style={{ animation: 'pop .6s var(--ease-spring) both', animationDelay: `${delay}s` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] text-[var(--ink-faint)]">extracted.txt</span>
        <FormatChip label="TXT" tone="bg-[var(--accent-soft)] text-[var(--accent)]" />
      </div>

      {/* Selection highlight behind the lines: the whole point is that these
          words can now be picked up and pasted. */}
      <div className="pulse-lit space-y-[6px]">
        {[90, 96, 72, 84, 58].map((width, row) => (
          <div
            key={row}
            className="h-[5px] rounded-[2px] bg-[var(--accent)]/35"
            style={{
              width: `${width}%`,
              animation: 'fade .4s ease-out both',
              animationDelay: `${delay + 0.15 + row * 0.06}s`
            }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        <span className="rounded bg-[var(--accent)] px-1.5 py-[3px] text-[7px] font-bold uppercase tracking-wider text-white">
          Copy
        </span>
        <span className="h-[3px] w-8 rounded-full bg-[var(--line-strong)]" />
      </div>
    </div>
  );
}

/* ── Variants ─────────────────────────────────────────────────── */
const VARIANTS = {
  code: {
    left: <CodeCard />,
    right: <PageCard format="PDF" />,
    from: 'Your code',
    to: 'Submission-ready PDF',
    toShort: 'Ready to submit'
  },
  markdown: {
    left: <MarkdownCard />,
    right: <TypesetCard />,
    from: 'Your Markdown',
    to: 'Typeset PDF, light or dark',
    toShort: 'Typeset PDF'
  },
  document: {
    left: <PageCard format="DOCX" delay={0.35} gutter={false} />,
    right: <PageCard format="PDF" delay={0.6} gutter={false} />,
    from: 'Word document',
    to: 'PDF — and back again',
    toShort: 'PDF, and back',
    twoWay: true
  },
  image: {
    left: <PhotoCard format="JPG" weight="1.8 MB" />,
    right: <PhotoCard format="PNG" weight="lossless" delay={0.6} animateIn="pop" />,
    from: 'Any image',
    to: 'JPG · PNG · WebP',
    toShort: 'Any format'
  },
  extract: {
    left: <PhotoCard format="JPG" weight="a photo" />,
    right: <TextSheetCard />,
    from: 'Picture of text',
    to: 'Text you can copy',
    toShort: 'Copyable text'
  },
  tomarkdown: {
    left: <PageCard format="PDF" delay={0.35} gutter={false} />,
    right: <MarkdownCard delay={0.65} filename="notes.md" />,
    from: 'PDF or Word',
    to: 'Clean, editable Markdown',
    toShort: 'Markdown'
  },
  compress: {
    left: <PhotoCard format="JPG" weight="2.4 MB" />,
    right: <PhotoCard format="JPG" weight="48 KB" delay={0.6} shrunk animateIn="pop" />,
    from: 'Your photo',
    to: 'Exactly the size required',
    toShort: 'Form-ready size'
  }
};

export default function Hero({ variant = 'code' }) {
  const spec = VARIANTS[variant] || VARIANTS.code;

  const tiltRef = usePointerTilt({ max: 4 });

  return (
    // Keyed on the variant so switching tabs replays the entrance rather than
    // silently swapping the artwork.
    <div key={variant} className="animate-fade">
      <div ref={tiltRef} className="tilt relative flex items-center justify-center gap-3 sm:gap-4">
        {/* The pulse crosses behind the cards, so it reads as one continuous
            path from source to result rather than a dot in a gap. */}
        <div className="pulse-track" aria-hidden="true">
          <span className="pulse-dot" />
        </div>

        {spec.left}

        <div
          className="relative z-10 flex shrink-0 flex-col items-center"
          style={{ animation: 'pop .5s var(--ease-spring) both', animationDelay: '0.5s' }}
        >
          <span className="pulse-node grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            {spec.twoWay ? <SwapIcon width={16} height={16} /> : <ArrowIcon width={16} height={16} />}
          </span>
        </div>

        {spec.right}
      </div>

      {/* Naming the two ends turns a decoration into an explanation. The long
          form wraps on a phone, so it shortens there. */}
      {/* items-start, not center: when the right-hand label wraps to two lines
          the two captions must still share a baseline. */}
      <div className="mt-2.5 flex items-start justify-center gap-3 text-[10px] font-semibold uppercase leading-snug tracking-[0.14em] text-[var(--ink-faint)] sm:gap-4">
        <span className="w-[46%] max-w-[230px] text-center">{spec.from}</span>
        <span className="w-9" />
        <span className="w-[46%] max-w-[230px] text-center text-[var(--accent)]">
          <span className="sm:hidden">{spec.toShort}</span>
          <span className="hidden sm:inline">{spec.to}</span>
        </span>
      </div>
    </div>
  );
}

export function TrustChips() {
  const items = ['No sign-up', 'Auto-deleted', 'Free forever'];

  return (
    <div className="flex flex-wrap gap-2">
      <span className="chip">
        <ShieldIcon width={13} height={13} className="text-[var(--accent)]" />
        Private by default
      </span>
      {items.map((item) => (
        <span key={item} className="chip">
          {item}
        </span>
      ))}
    </div>
  );
}
